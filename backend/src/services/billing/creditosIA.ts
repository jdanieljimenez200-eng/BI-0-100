import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { AppDataSource } from '../../config/database';
import type { Plan } from '../../models/Usuario';
import { getLimites } from './planService';
import { logger } from '../../utils/logger';
import { conSeguimientoIA, huboFallbackIA } from '../../utils/seguimientoIA';

/**
 * Créditos mensuales de IA.
 *
 * Sustituyen a los análisis "ilimitados": cada acción que llama a la IA cuesta
 * créditos en proporción a su costo real (docs/pricing/PROPUESTA_PLANES_2026-09.md,
 * 1 crédito ≈ $0.06 USD en el peor caso). Así una cuenta intensiva, o robada, no
 * puede comerse el margen del plan.
 *
 * Se cobra ANTES de ejecutar (con candado por usuario, para que dos peticiones a
 * la vez no gasten el mismo crédito) y se reembolsa si la acción falla o la IA
 * cae a plantilla: el cliente solo paga lo que recibió.
 */

export const COSTO_CREDITOS = {
  mercado: 1,
  finanzas: 1,
  brief: 1,
  marketing: 2,
  ventas: 2,
  legal: 4,
  ventas_guion: 1,
  ventas_competidor: 1,
  ventas_objeciones: 1,
  marketing_reporte_ads: 1,
  marca_logo: 1,
  resumen_completo: 1,
  mantenimiento_sugerencia: 1,
} as const;

export type AccionIA = keyof typeof COSTO_CREDITOS;

/** Módulos de análisis: en freemium no gastan créditos (tienen 1 uso por módulo). */
const ANALISIS: ReadonlySet<AccionIA> = new Set(['mercado', 'finanzas', 'brief', 'marketing', 'ventas', 'legal']);

export class CreditosInsuficientesError extends Error {
  constructor(
    readonly disponibles: number,
    readonly necesarios: number,
    readonly plan: Plan | string
  ) {
    super('Créditos de IA insuficientes');
  }
}

/** Primer día del mes natural en curso: los créditos renuevan ahí. */
function inicioDeMes(ahora = new Date()): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
}

function inicioDelSiguienteMes(ahora = new Date()): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1));
}

export function costoDe(accion: AccionIA, plan: Plan | string): number {
  if (plan === 'freemium' && ANALISIS.has(accion)) return 0;
  return COSTO_CREDITOS[accion];
}

export interface EstadoCreditos {
  mes: number;
  usados: number;
  disponibles: number;
  renuevan_el: string;
}

type Consultor = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

async function usadosEsteMes(q: Consultor, usuarioId: string): Promise<number> {
  const filas = (await q.query(
    `SELECT COALESCE(SUM(creditos), 0)::int AS usados
       FROM creditos_consumo
      WHERE usuario_id = $1 AND NOT reembolsado AND fecha >= $2`,
    [usuarioId, inicioDeMes()]
  )) as { usados: number }[];
  return Number(filas[0]?.usados ?? 0);
}

export async function estadoCreditos(usuarioId: string, plan: Plan | string): Promise<EstadoCreditos> {
  const mes = getLimites(plan as Plan).creditos_ia_mes;
  const usados = await usadosEsteMes(AppDataSource, usuarioId);
  return { mes, usados, disponibles: Math.max(0, mes - usados), renuevan_el: inicioDelSiguienteMes().toISOString() };
}

/**
 * Cobra los créditos de una acción. Devuelve el id del cobro (para reembolsarlo)
 * o null si la acción no cuesta nada en este plan.
 *
 * @throws CreditosInsuficientesError si no alcanzan.
 */
export async function cobrarCreditos(
  usuarioId: string,
  plan: Plan | string,
  accion: AccionIA,
  referenciaId?: string
): Promise<string | null> {
  const costo = costoDe(accion, plan);
  if (costo === 0) return null;
  const mes = getLimites(plan as Plan).creditos_ia_mes;

  return AppDataSource.transaction(async (m) => {
    // Serializa los cobros de un mismo usuario dentro de la transacción.
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`creditos:${usuarioId}`]);
    const disponibles = mes - (await usadosEsteMes(m, usuarioId));
    if (disponibles < costo) throw new CreditosInsuficientesError(Math.max(0, disponibles), costo, plan);

    const id = randomUUID();
    await m.query(
      `INSERT INTO creditos_consumo (id, usuario_id, accion, creditos, referencia_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, usuarioId, accion, costo, referenciaId ?? null]
    );
    return id;
  });
}

/** Devuelve los créditos de un cobro (por su id o por la referencia, p. ej. el análisis). */
export async function reembolsarCreditos(filtro: { cobroId?: string | null; referenciaId?: string | null }): Promise<void> {
  if (!filtro.cobroId && !filtro.referenciaId) return;
  try {
    if (filtro.cobroId) {
      await AppDataSource.query(`UPDATE creditos_consumo SET reembolsado = true WHERE id = $1`, [filtro.cobroId]);
    } else {
      await AppDataSource.query(`UPDATE creditos_consumo SET reembolsado = true WHERE referencia_id = $1`, [filtro.referenciaId]);
    }
  } catch (err) {
    // Un reembolso fallido no puede tumbar la respuesta: queda en logs para corregirlo.
    logger.error('[creditos] No se pudo reembolsar:', { ...filtro, err });
  }
}

/** Respuesta estándar al quedarse sin créditos. El frontend la trata como upgrade (upgrade_required). */
export function responderSinCreditos(res: Response, err: CreditosInsuficientesError): Response {
  const mensaje =
    err.disponibles > 0
      ? `Esta acción necesita ${err.necesarios} créditos de IA y te quedan ${err.disponibles} este mes. Sube de plan para seguir o espera a que se renueven.`
      : 'Usaste todos tus créditos de IA de este mes. Sube de plan para seguir o espera a que se renueven el día 1.';
  return res.status(402).json({
    error: mensaje,
    mensaje,
    codigo: 'creditos_agotados',
    upgrade_required: true,
    plan_actual: err.plan,
    disponibles: err.disponibles,
    necesarios: err.necesarios,
  });
}

/**
 * Ejecuta una acción de IA bajo demanda cobrando créditos: cobra antes, ejecuta
 * con el contexto de uso (para `uso_ia`) y reembolsa si falla o cae a plantilla.
 *
 * @throws CreditosInsuficientesError antes de ejecutar nada si no alcanzan.
 */
export async function conCreditos<T>(
  usuarioId: string,
  plan: Plan | string,
  accion: AccionIA,
  fn: () => Promise<T>
): Promise<T> {
  const cobroId = await cobrarCreditos(usuarioId, plan, accion);
  try {
    const { resultado, estimado } = await conSeguimientoIA(
      async () => {
        const r = await fn();
        return { resultado: r, estimado: huboFallbackIA() };
      },
      { usuarioId, modulo: accion }
    );
    if (estimado) await reembolsarCreditos({ cobroId });
    return resultado;
  } catch (err) {
    await reembolsarCreditos({ cobroId });
    throw err;
  }
}
