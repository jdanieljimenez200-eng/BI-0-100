import { createHash } from 'crypto';
import { AppDataSource } from '../../config/database';
import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';

/**
 * Métricas del perfil: apariciones en búsquedas, visitas y clics de contacto.
 *
 * Nunca frenan ni rompen la petición que las origina: se registran después de
 * responder y cualquier fallo se queda en el log. Una métrica perdida es mejor
 * que un directorio que no carga.
 *
 * Las visitas y los clics se cuentan una vez por visitante y día (huella de IP +
 * navegador en Redis, sin guardar la IP). Sin eso, recargar la página inflaría
 * justo el número con el que el experto decide si su impulso le rinde.
 */

export type CanalContacto = 'whatsapp' | 'telefono' | 'email' | 'web';
const COLUMNA_CANAL: Record<CanalContacto, string> = {
  whatsapp: 'clics_whatsapp',
  telefono: 'clics_telefono',
  email: 'clics_email',
  web: 'clics_web',
};

export function huellaVisitante(ip: string | undefined, userAgent: string | undefined): string {
  return createHash('sha256')
    .update(`${ip ?? ''}|${userAgent ?? ''}|${process.env.JWT_SECRET ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

/** true si es la primera vez hoy. Sin Redis, cuenta siempre. */
async function primeraVezHoy(clave: string): Promise<boolean> {
  try {
    if (!redisClient?.isOpen) return true;
    const r = await redisClient.set(`red:metrica:${clave}`, '1', { NX: true, EX: 60 * 60 * 24 });
    return r === 'OK';
  } catch {
    return true;
  }
}

export function registrarImpresiones(ids: string[], impulsados: string[]): void {
  if (ids.length === 0) return;
  AppDataSource.query(
    `INSERT INTO experto_metricas_dia (experto_id, fecha, impresiones, impresiones_impulsadas)
     SELECT x.id, current_date, 1, CASE WHEN x.id = ANY($2::uuid[]) THEN 1 ELSE 0 END
       FROM unnest($1::uuid[]) AS x(id)
     ON CONFLICT (experto_id, fecha) DO UPDATE
       SET impresiones = experto_metricas_dia.impresiones + 1,
           impresiones_impulsadas = experto_metricas_dia.impresiones_impulsadas + EXCLUDED.impresiones_impulsadas`,
    [[...new Set(ids)], impulsados]
  ).catch((err) => logger.warn('[network] no se registraron impresiones:', err));
}

export function registrarVista(expertoId: string, huella: string): void {
  void (async () => {
    if (!(await primeraVezHoy(`vista:${expertoId}:${huella}`))) return;
    await AppDataSource.query(
      `INSERT INTO experto_metricas_dia (experto_id, fecha, vistas) VALUES ($1, current_date, 1)
       ON CONFLICT (experto_id, fecha) DO UPDATE SET vistas = experto_metricas_dia.vistas + 1`,
      [expertoId]
    );
  })().catch((err) => logger.warn('[network] no se registró la visita:', err));
}

export async function registrarClic(expertoId: string, canal: CanalContacto, huella: string): Promise<void> {
  if (!(await primeraVezHoy(`clic:${canal}:${expertoId}:${huella}`))) return;
  const col = COLUMNA_CANAL[canal];
  await AppDataSource.query(
    `INSERT INTO experto_metricas_dia (experto_id, fecha, ${col}) VALUES ($1, current_date, 1)
     ON CONFLICT (experto_id, fecha) DO UPDATE SET ${col} = experto_metricas_dia.${col} + 1`,
    [expertoId]
  );
}

/** Totales y serie diaria de los últimos `dias` para el panel del experto. */
export async function resumen(expertoId: string, dias = 30) {
  const serie = await AppDataSource.query(
    `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, impresiones, impresiones_impulsadas, vistas,
            clics_whatsapp, clics_telefono, clics_email, clics_web
       FROM experto_metricas_dia
      WHERE experto_id = $1 AND fecha > current_date - $2::int
      ORDER BY fecha`,
    [expertoId, dias]
  );
  const totales = serie.reduce(
    (t: Record<string, number>, d: Record<string, number>) => {
      for (const k of Object.keys(t)) t[k] += Number(d[k] ?? 0);
      return t;
    },
    { impresiones: 0, impresiones_impulsadas: 0, vistas: 0, clics_whatsapp: 0, clics_telefono: 0, clics_email: 0, clics_web: 0 }
  );
  return { dias, totales, serie };
}
