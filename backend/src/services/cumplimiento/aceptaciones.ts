import type { Request } from 'express';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { DOCUMENTOS_LEGALES, DocumentoAceptable } from '../../config/documentosLegales';

/**
 * Evidencia de consentimiento (tabla `aceptaciones_legales`).
 *
 * Un «al registrarte aceptas…» sin registro no prueba nada: hay que poder decir
 * qué versión aceptó cada cuenta, cuándo, por qué vía y desde dónde. Se escribe
 * con el `manager` de la transacción que crea la cuenta, para que no exista una
 * cuenta sin su aceptación ni una aceptación sin cuenta.
 */

export type MetodoAceptacion = 'registro' | 'google' | 'sesion' | 'checkout';

export interface OrigenPeticion {
  ip: string | null;
  userAgent: string | null;
}

/** IP y navegador de la petición, recortados al tamaño de sus columnas. */
export function origenDePeticion(req: Request): OrigenPeticion {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ? req.ip.slice(0, 45) : null,
    userAgent: typeof ua === 'string' && ua ? ua.slice(0, 300) : null,
  };
}

/**
 * ¿Aceptó de verdad? Solo `true` (o `'true'` de un formulario) cuenta: un campo
 * ausente, vacío o `'false'` no es consentimiento.
 */
export function aceptoExpresamente(valor: unknown): boolean {
  return valor === true || valor === 'true';
}

/**
 * Versiones que mostró el cliente y no coinciden con las vigentes. Si el cliente
 * no manda versión (integraciones, scripts) no se compara: se registra la vigente.
 */
export function versionesDesfasadas(body: Record<string, unknown> | undefined): DocumentoAceptable[] {
  const desfasadas: DocumentoAceptable[] = [];
  for (const doc of Object.keys(DOCUMENTOS_LEGALES) as DocumentoAceptable[]) {
    const enviada = body?.[`version_${doc}`];
    if (enviada !== undefined && enviada !== DOCUMENTOS_LEGALES[doc].version) desfasadas.push(doc);
  }
  return desfasadas;
}

/**
 * Registra la aceptación de las versiones vigentes de Términos y Aviso de
 * Privacidad: al crear la cuenta (`registro`/`google`) o después, desde la app
 * (`sesion`), para los documentos que tenga pendientes.
 */
export async function registrarAceptacion(
  manager: EntityManager,
  usuarioId: string,
  metodo: 'registro' | 'google' | 'sesion',
  origen: OrigenPeticion,
  documentos: readonly DocumentoAceptable[] = Object.keys(DOCUMENTOS_LEGALES) as DocumentoAceptable[],
): Promise<void> {
  const detalle = JSON.stringify({ mayor_de_edad: true });
  for (const doc of documentos) {
    await manager.query(
      `INSERT INTO aceptaciones_legales (usuario_id, documento, version, metodo, ip, user_agent, detalle)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [usuarioId, doc, DOCUMENTOS_LEGALES[doc].version, metodo, origen.ip, origen.userAgent, detalle],
    );
  }
}

/**
 * Documentos cuya versión vigente esta cuenta no ha aceptado: las cuentas
 * creadas antes de este registro, los colaboradores que dio de alta el dueño
 * (`POST /api/equipo/trabajadores`) y todas cuando se publica una versión nueva.
 */
export async function documentosPendientes(
  usuarioId: string,
  manager: EntityManager = AppDataSource.manager,
): Promise<DocumentoAceptable[]> {
  const docs = Object.keys(DOCUMENTOS_LEGALES) as DocumentoAceptable[];
  const filas: { documento: DocumentoAceptable }[] = await manager.query(
    `SELECT DISTINCT documento FROM aceptaciones_legales
      WHERE usuario_id = $1 AND (documento, version) IN (SELECT * FROM unnest($2::text[], $3::text[]))`,
    [usuarioId, docs, docs.map((d) => DOCUMENTOS_LEGALES[d].version)],
  );
  const aceptados = new Set(filas.map((f) => f.documento));
  return docs.filter((d) => !aceptados.has(d));
}

export interface CargoRecurrente {
  /** Qué se contrata: un plan del SaaS o un patrocinio de Net0. */
  concepto: string;
  priceId: string;
  /** Importe por periodo en la unidad mínima de la moneda (centavos). */
  montoMinimo: number | null;
  moneda: string;
  intervalo: string | null;
  intervaloCantidad: number | null;
}

/**
 * Autorización expresa de un cargo recurrente (LFPC art. 76 Bis fr. VIII): se
 * guarda lo que se le mostró a la persona —importe, moneda y periodicidad tal
 * como los tiene Stripe— antes de mandarla a pagar.
 */
export async function registrarAutorizacionCargo(
  manager: EntityManager,
  usuarioId: string,
  cargo: CargoRecurrente,
  origen: OrigenPeticion,
): Promise<void> {
  await manager.query(
    `INSERT INTO aceptaciones_legales (usuario_id, documento, version, metodo, ip, user_agent, detalle)
     VALUES ($1, 'cargo_recurrente', $2, 'checkout', $3, $4, $5::jsonb)`,
    [
      usuarioId,
      DOCUMENTOS_LEGALES.terminos.version,
      origen.ip,
      origen.userAgent,
      JSON.stringify({
        concepto: cargo.concepto,
        price_id: cargo.priceId,
        monto: cargo.montoMinimo,
        moneda: cargo.moneda,
        intervalo: cargo.intervalo,
        intervalo_cantidad: cargo.intervaloCantidad,
      }),
    ],
  );
}
