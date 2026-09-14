import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/database';
import type { CategoriaExperto } from '../../models/Experto';
import { logger } from '../../utils/logger';
import { filasSql } from '../../utils/filasSql';

/**
 * Impulsos: el experto paga por días de visibilidad, al estilo de una campaña de
 * Meta, pero con precio cerrado.
 *
 *  - **Alcance**: `ciudad` (sale arriba cuando alguien busca en su ciudad) o
 *    `nacional` (sale arriba en cualquier búsqueda de su categoría).
 *  - **Precio**: tarifa por día × días, calculado aquí y nunca leído del cliente.
 *  - **Cupo**: como mucho `CUPO` impulsos vigentes por categoría y lugar. Sin
 *    cupo, diez impulsados rotando en tres huecos no le dan a nadie lo que pagó.
 *  - **Métricas**: apariciones, visitas y clics de contacto durante la campaña,
 *    para que el experto vea si le rinde.
 *
 * Se cobra por día y no por clic a propósito: un cobro por clic exige detectar
 * clics falsos antes de facturarlos, y sin tráfico real no hay con qué calibrar
 * eso. Las métricas se guardan desde el primer día, así que pasar a clic es
 * posible más adelante sin cambiar las tablas.
 */

export type Alcance = 'ciudad' | 'nacional';
export type EstadoImpulso = 'pendiente_pago' | 'activo' | 'terminado' | 'cancelado' | 'expirado';

const numeroEnv = (clave: string, defecto: number) => {
  const v = Number(process.env[clave]);
  return Number.isFinite(v) && v > 0 ? v : defecto;
};

/** Pesos por día, IVA incluido. */
export const TARIFA_DIA_MXN: Record<Alcance, number> = {
  ciudad: numeroEnv('IMPULSO_TARIFA_CIUDAD_MXN', 39),
  nacional: numeroEnv('IMPULSO_TARIFA_NACIONAL_MXN', 99),
};

export const DIAS_MIN = 3;
export const DIAS_MAX = 30;
/** Impulsos vigentes a la vez por categoría + lugar. */
export const CUPO = numeroEnv('IMPULSO_CUPO', 5);
/** Huecos de «Promocionado» que se muestran por búsqueda. */
export const HUECOS_PROMOCIONADOS = 3;
/** Lo que vive una sesión de Checkout: mientras tanto, el cupo queda reservado. */
const MINUTOS_RESERVA = 35;

export function cotizar(alcance: Alcance, dias: number): number {
  return TARIFA_DIA_MXN[alcance] * dias;
}

/** Condición SQL de «vigente» sobre la tabla con alias `i`. */
export const IMPULSO_VIGENTE = `i.estado = 'activo' AND i.fecha_inicio <= now() AND i.fecha_fin > now()`;

function lugar(alcance: Alcance, ciudad: string | null) {
  return alcance === 'nacional' ? 'nacional' : `ciudad:${(ciudad ?? '').trim().toLowerCase()}`;
}

/** Impulsos que ocupan cupo: vigentes, más los pagos en curso. */
async function ocupados(
  manager: EntityManager,
  categoria: CategoriaExperto,
  alcance: Alcance,
  ciudad: string | null
): Promise<{ total: number; libera_el: Date | null }> {
  const [fila]: [{ total: number; libera_el: Date | null }] = await manager.query(
    `SELECT count(*)::int AS total,
            min(i.fecha_fin) FILTER (WHERE i.estado = 'activo') AS libera_el
       FROM impulsos_experto i
      WHERE i.categoria = $1
        AND i.alcance = $2
        AND ($2 = 'nacional' OR lower(i.ciudad) = lower($3))
        AND (
          (${IMPULSO_VIGENTE})
          OR (i.estado = 'pendiente_pago' AND i.fecha_creacion > now() - interval '${MINUTOS_RESERVA} minutes')
        )`,
    [categoria, alcance, ciudad ?? '']
  );
  return fila;
}

export async function disponibilidad(categoria: CategoriaExperto, alcance: Alcance, ciudad: string | null) {
  const { total, libera_el } = await ocupados(AppDataSource.manager, categoria, alcance, ciudad);
  return { cupo: CUPO, ocupados: total, disponible: total < CUPO, libera_el: total < CUPO ? null : libera_el };
}

export type ResultadoReserva =
  | { ok: true; impulsoId: string; monto: number }
  | { ok: false; motivo: 'sin_cupo'; libera_el: Date | null }
  | { ok: false; motivo: 'ya_tiene' };

/**
 * Reserva el cupo y crea el impulso en `pendiente_pago`.
 *
 * El candado por categoría + lugar evita que dos pagos simultáneos se lleven el
 * último hueco. El impulso solo se activa cuando Stripe confirma el pago.
 */
export async function reservar(datos: {
  expertoId: string;
  categoria: CategoriaExperto;
  alcance: Alcance;
  ciudad: string | null;
  dias: number;
}): Promise<ResultadoReserva> {
  const ciudad = datos.alcance === 'nacional' ? null : datos.ciudad?.trim() || null;
  return AppDataSource.transaction(async (manager) => {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `impulso:${datos.categoria}:${lugar(datos.alcance, ciudad)}`,
    ]);

    // Una campaña vigente o en pago por ficha y lugar: dos del mismo experto
    // en el mismo sitio solo se pisarían entre ellas.
    const [{ existe }]: [{ existe: boolean }] = await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM impulsos_experto i
          WHERE i.experto_id = $1 AND i.alcance = $2
            AND ($2 = 'nacional' OR lower(i.ciudad) = lower($3))
            AND ((${IMPULSO_VIGENTE})
                 OR (i.estado = 'pendiente_pago' AND i.fecha_creacion > now() - interval '${MINUTOS_RESERVA} minutes'))
       ) AS existe`,
      [datos.expertoId, datos.alcance, ciudad ?? '']
    );
    if (existe) return { ok: false, motivo: 'ya_tiene' };

    const { total, libera_el } = await ocupados(manager, datos.categoria, datos.alcance, ciudad);
    if (total >= CUPO) return { ok: false, motivo: 'sin_cupo', libera_el };

    const monto = cotizar(datos.alcance, datos.dias);
    const [{ id }]: [{ id: string }] = await manager.query(
      `INSERT INTO impulsos_experto (experto_id, categoria, alcance, ciudad, dias, monto_mxn)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [datos.expertoId, datos.categoria, datos.alcance, ciudad, datos.dias, monto]
    );
    return { ok: true, impulsoId: id, monto };
  });
}

export async function guardarSesion(impulsoId: string, sessionId: string): Promise<void> {
  await AppDataSource.query(`UPDATE impulsos_experto SET stripe_session_id = $2 WHERE id = $1`, [
    impulsoId,
    sessionId,
  ]);
}

/** Si Stripe no llega a crear la sesión, se libera el cupo al momento. */
export async function descartarReserva(impulsoId: string): Promise<void> {
  await AppDataSource.query(
    `UPDATE impulsos_experto SET estado = 'expirado' WHERE id = $1 AND estado = 'pendiente_pago'`,
    [impulsoId]
  );
}

/**
 * Activa el impulso pagado. Idempotente: el webhook puede repetir el evento y
 * la campaña no debe reiniciar su reloj ni duplicarse.
 *
 * Una reserva que expiró mientras el pago tardaba se activa igual: el dinero ya
 * entró, y quedarse un impulso por encima del cupo es mejor que cobrar sin dar.
 */
export async function activarPagado(
  manager: EntityManager,
  datos: { impulsoId: string; sessionId: string | null; paymentIntent: string | null }
): Promise<boolean> {
  const filas = filasSql<{ id: string }>(await manager.query(
    `UPDATE impulsos_experto
        SET estado = 'activo',
            fecha_inicio = now(),
            fecha_fin = now() + make_interval(days => dias),
            stripe_session_id = COALESCE(stripe_session_id, $2),
            stripe_payment_intent = COALESCE($3, stripe_payment_intent)
      WHERE id = $1 AND estado IN ('pendiente_pago', 'expirado')
      RETURNING id`,
    [datos.impulsoId, datos.sessionId, datos.paymentIntent]
  ));
  if (filas.length === 0) {
    logger.info(`[network] impulso ${datos.impulsoId}: ya estaba activo o no existe`);
    return false;
  }
  logger.info(`[network] impulso ${datos.impulsoId} activado`);
  return true;
}

export async function expirarSesion(manager: EntityManager, impulsoId: string): Promise<void> {
  await manager.query(
    `UPDATE impulsos_experto SET estado = 'expirado' WHERE id = $1 AND estado = 'pendiente_pago'`,
    [impulsoId]
  );
}

/** Cancelación de moderación (ficha suspendida, contenido engañoso…). */
export async function cancelar(manager: EntityManager, impulsoId: string, motivo: string) {
  const filas = filasSql<{ id: string; experto_id: string; stripe_payment_intent: string | null; monto_mxn: string }>(await manager.query(
    `UPDATE impulsos_experto SET estado = 'cancelado', motivo_cancelacion = $2
      WHERE id = $1 AND estado IN ('activo', 'pendiente_pago')
      RETURNING id, experto_id, stripe_payment_intent, monto_mxn`,
    [impulsoId, motivo]
  ));
  return filas[0] ?? null;
}

export interface ImpulsoConMetricas {
  id: string;
  experto_id: string;
  nombre_comercial: string;
  categoria: CategoriaExperto;
  alcance: Alcance;
  ciudad: string | null;
  dias: number;
  monto_mxn: number;
  estado: EstadoImpulso;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  fecha_creacion: Date;
  motivo_cancelacion: string | null;
  metricas: { impresiones: number; vistas: number; clics: number };
}

/**
 * Campañas de las fichas de un usuario (o de todas, para admin), con lo que
 * rindió cada una. `terminado` se deriva de la fecha: no hace falta un proceso
 * que las cierre.
 */
export async function listar(filtro: { usuarioId?: string; limite?: number }): Promise<ImpulsoConMetricas[]> {
  const params: unknown[] = [];
  let where = `i.estado <> 'expirado'`;
  if (filtro.usuarioId) {
    params.push(filtro.usuarioId);
    where += ` AND e.usuario_id = $${params.length}`;
  }
  params.push(filtro.limite ?? 100);

  const filas = await AppDataSource.query(
    `SELECT i.id, i.experto_id, e.nombre_comercial, i.categoria, i.alcance, i.ciudad, i.dias,
            i.monto_mxn, i.fecha_inicio, i.fecha_fin, i.fecha_creacion, i.motivo_cancelacion,
            CASE WHEN i.estado = 'activo' AND i.fecha_fin <= now() THEN 'terminado' ELSE i.estado END AS estado,
            COALESCE(m.impresiones, 0)::int AS impresiones,
            COALESCE(m.vistas, 0)::int AS vistas,
            COALESCE(m.clics, 0)::int AS clics
       FROM impulsos_experto i
       JOIN expertos e ON e.id = i.experto_id
       LEFT JOIN LATERAL (
         SELECT sum(d.impresiones_impulsadas) AS impresiones,
                sum(d.vistas) AS vistas,
                sum(d.clics_whatsapp + d.clics_telefono + d.clics_email + d.clics_web) AS clics
           FROM experto_metricas_dia d
          WHERE d.experto_id = i.experto_id
            AND i.fecha_inicio IS NOT NULL
            AND d.fecha BETWEEN i.fecha_inicio::date AND LEAST(i.fecha_fin, now())::date
       ) m ON true
      WHERE ${where}
      ORDER BY i.fecha_creacion DESC
      LIMIT $${params.length}`,
    params
  );

  return filas.map((f: Record<string, unknown>) => ({
    id: f.id,
    experto_id: f.experto_id,
    nombre_comercial: f.nombre_comercial,
    categoria: f.categoria,
    alcance: f.alcance,
    ciudad: f.ciudad,
    dias: f.dias,
    monto_mxn: Number(f.monto_mxn),
    estado: f.estado,
    fecha_inicio: f.fecha_inicio,
    fecha_fin: f.fecha_fin,
    fecha_creacion: f.fecha_creacion,
    motivo_cancelacion: f.motivo_cancelacion,
    metricas: { impresiones: f.impresiones, vistas: f.vistas, clics: f.clics },
  })) as ImpulsoConMetricas[];
}
