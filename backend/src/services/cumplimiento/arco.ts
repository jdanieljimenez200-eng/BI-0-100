import { z } from 'zod';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/database';

/**
 * Solicitudes de derechos ARCO (acceso, rectificación, cancelación, oposición),
 * revocación del consentimiento y limitación del uso (LFPDPPP, arts. 22 a 31).
 *
 * El formulario público solo registra la solicitud y da un folio: la identidad se
 * verifica después por correo (docs/legal/09_PROCEDIMIENTO_ARCO.md), para no
 * recibir copias de identificaciones en un formulario abierto.
 *
 * Plazos: 20 días para responder desde que se recibe y 15 para ejecutar desde la
 * respuesta (art. 31). Se cuentan en días naturales: si la ley los fija en
 * hábiles, este cálculo queda del lado seguro (vence antes).
 */

export const TIPOS_ARCO = ['acceso', 'rectificacion', 'cancelacion', 'oposicion', 'revocacion', 'limitacion'] as const;
export type TipoArco = (typeof TIPOS_ARCO)[number];

export const ESTADOS_ARCO = [
  'recibida',
  'requiere_info',
  'en_revision',
  'respondida',
  'ejecutada',
  'improcedente',
  'remitida',
] as const;
export type EstadoArco = (typeof ESTADOS_ARCO)[number];

export const DIAS_RESPUESTA = 20;
export const DIAS_EJECUCION = 15;

const DIA_MS = 24 * 60 * 60 * 1000;
export const sumarDias = (desde: Date, dias: number): Date => new Date(desde.getTime() + dias * DIA_MS);

export const SolicitudArcoSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre completo').max(150),
  email: z.string().trim().toLowerCase().email('Escribe un correo válido').max(254),
  tipo: z.enum(TIPOS_ARCO, { errorMap: () => ({ message: 'Elige qué derecho quieres ejercer' }) }),
  relacion: z.enum(['titular', 'representante']).default('titular'),
  descripcion: z
    .string()
    .trim()
    .min(10, 'Describe tu solicitud: qué datos y qué quieres que hagamos con ellos')
    .max(4000),
});
export type SolicitudArcoEntrada = z.infer<typeof SolicitudArcoSchema>;

export const ActualizacionArcoSchema = z.object({
  estado: z.enum(ESTADOS_ARCO).optional(),
  respuesta: z.string().trim().max(8000).nullable().optional(),
  notas_internas: z.string().trim().max(8000).nullable().optional(),
  /** Manda `respuesta` por correo al titular al guardar. */
  enviar_respuesta: z.boolean().optional(),
});
export type ActualizacionArco = z.infer<typeof ActualizacionArcoSchema>;

export interface SolicitudArco {
  id: string;
  folio: string;
  usuario_id: string | null;
  nombre: string;
  email: string;
  tipo: TipoArco;
  relacion: 'titular' | 'representante';
  descripcion: string;
  estado: EstadoArco;
  respuesta: string | null;
  notas_internas: string | null;
  fecha_recepcion: Date;
  fecha_limite_respuesta: Date;
  fecha_respuesta: Date | null;
  fecha_limite_ejecucion: Date | null;
  fecha_ejecucion: Date | null;
  fecha_actualizacion: Date;
}

/** Folio legible: ARCO-2026-0007. El número sale de una secuencia (sin choques). */
export function formatoFolio(anio: number, numero: number): string {
  return `ARCO-${anio}-${String(numero).padStart(4, '0')}`;
}

/**
 * Registra una solicitud. Si el correo es el de una cuenta, la liga a ella (solo
 * como referencia: la identidad se confirma igual por correo).
 */
export async function crearSolicitudArco(
  datos: SolicitudArcoEntrada,
  ip: string | null,
  ahora = new Date(),
): Promise<SolicitudArco> {
  return AppDataSource.transaction(async (manager) => {
    const [{ n }] = await manager.query(`SELECT nextval('solicitudes_arco_folio_seq')::int AS n`);
    const [cuenta] = await manager.query(`SELECT id FROM usuarios WHERE email = $1 LIMIT 1`, [datos.email]);
    const [fila] = await manager.query(
      `INSERT INTO solicitudes_arco
         (folio, usuario_id, nombre, email, tipo, relacion, descripcion, ip, fecha_recepcion, fecha_limite_respuesta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        formatoFolio(ahora.getFullYear(), n),
        cuenta?.id ?? null,
        datos.nombre,
        datos.email,
        datos.tipo,
        datos.relacion,
        datos.descripcion,
        ip ? ip.slice(0, 45) : null,
        ahora,
        sumarDias(ahora, DIAS_RESPUESTA),
      ],
    );
    return fila as SolicitudArco;
  });
}

/** Listado para el panel: primero las abiertas que vencen antes. */
export async function listarSolicitudesArco(filtro: { estado?: EstadoArco; limite?: number } = {}): Promise<SolicitudArco[]> {
  const limite = Math.min(Math.max(filtro.limite ?? 200, 1), 500);
  return AppDataSource.query(
    `SELECT id, folio, usuario_id, nombre, email, tipo, relacion, descripcion, estado, respuesta, notas_internas,
            fecha_recepcion, fecha_limite_respuesta, fecha_respuesta, fecha_limite_ejecucion, fecha_ejecucion,
            fecha_actualizacion
       FROM solicitudes_arco
      WHERE ($1::text IS NULL OR estado = $1)
      ORDER BY (estado IN ('recibida', 'requiere_info', 'en_revision')) DESC, fecha_limite_respuesta ASC
      LIMIT $2`,
    [filtro.estado ?? null, limite],
  );
}

/**
 * Cambios que implica pasar a un estado: al responder corre el plazo de
 * ejecución; al ejecutar o cerrar, se anota la fecha. No pisa fechas ya puestas.
 */
export function fechasPorEstado(
  actual: Pick<SolicitudArco, 'fecha_respuesta' | 'fecha_limite_ejecucion' | 'fecha_ejecucion'>,
  estado: EstadoArco | undefined,
  ahora = new Date(),
): Partial<Pick<SolicitudArco, 'fecha_respuesta' | 'fecha_limite_ejecucion' | 'fecha_ejecucion'>> {
  const cambios: Partial<Pick<SolicitudArco, 'fecha_respuesta' | 'fecha_limite_ejecucion' | 'fecha_ejecucion'>> = {};
  if (!estado) return cambios;
  const responde = estado === 'respondida' || estado === 'improcedente' || estado === 'remitida' || estado === 'ejecutada';
  if (responde && !actual.fecha_respuesta) cambios.fecha_respuesta = ahora;
  if (estado === 'respondida' && !actual.fecha_limite_ejecucion) {
    cambios.fecha_limite_ejecucion = sumarDias(actual.fecha_respuesta ?? ahora, DIAS_EJECUCION);
  }
  if (estado === 'ejecutada' && !actual.fecha_ejecucion) cambios.fecha_ejecucion = ahora;
  return cambios;
}

/** Aplica un cambio dentro de la transacción del llamador. Devuelve antes y después. */
export async function actualizarSolicitudArco(
  manager: EntityManager,
  id: string,
  cambio: ActualizacionArco,
  ahora = new Date(),
): Promise<{ antes: SolicitudArco; despues: SolicitudArco } | null> {
  const [antes] = (await manager.query(`SELECT * FROM solicitudes_arco WHERE id = $1 FOR UPDATE`, [id])) as SolicitudArco[];
  if (!antes) return null;
  const fechas = fechasPorEstado(antes, cambio.estado, ahora);
  // En Postgres, `UPDATE … RETURNING` por `manager.query` devuelve [filas, n].
  const resultado = await manager.query(
    `UPDATE solicitudes_arco SET
        estado = COALESCE($2, estado),
        respuesta = CASE WHEN $3::boolean THEN $4 ELSE respuesta END,
        notas_internas = CASE WHEN $5::boolean THEN $6 ELSE notas_internas END,
        fecha_respuesta = COALESCE($7, fecha_respuesta),
        fecha_limite_ejecucion = COALESCE($8, fecha_limite_ejecucion),
        fecha_ejecucion = COALESCE($9, fecha_ejecucion),
        fecha_actualizacion = now()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      cambio.estado ?? null,
      cambio.respuesta !== undefined,
      cambio.respuesta ?? null,
      cambio.notas_internas !== undefined,
      cambio.notas_internas ?? null,
      fechas.fecha_respuesta ?? null,
      fechas.fecha_limite_ejecucion ?? null,
      fechas.fecha_ejecucion ?? null,
    ],
  );
  const filas = (Array.isArray(resultado[0]) ? resultado[0] : resultado) as SolicitudArco[];
  return { antes, despues: filas[0] };
}

export const NOMBRE_TIPO_ARCO: Record<TipoArco, string> = {
  acceso: 'Acceso a tus datos',
  rectificacion: 'Rectificación de tus datos',
  cancelacion: 'Cancelación de tus datos',
  oposicion: 'Oposición al tratamiento',
  revocacion: 'Revocación del consentimiento',
  limitacion: 'Limitación del uso o divulgación',
};
