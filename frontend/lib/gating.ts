// Espejo (frontend) de backend/src/services/billing/gatingAnalisis.ts.
// Mantener SINCRONIZADO: mismas claves, mismas listas por módulo.
// Fuente de verdad: el backend. Si cambian las secciones allí, actualizar aquí.
//
// ¿Por qué un espejo estático y no confiar solo en `secciones_bloqueadas` de la
// respuesta? Porque ese campo se persiste al ejecutar el análisis: los análisis
// freemium creados ANTES de este gate no lo traen, y un análisis lanzado en
// gratuito que luego se consulta con plan de pago lo traería relleno aunque el
// usuario ya tenga derecho a verlo. La decisión de tapar depende del plan ACTUAL
// (esPlanDePago) y de la lista estática; el campo del servidor solo se suma como
// unión para secciones que el backend recorte y aquí aún no estén declaradas.

import { esPlanDePago, esPlanProPlus } from './plans';


export type ModuloAnalisis =
  | 'mercado'
  | 'marketing'
  | 'ventas'
  | 'finanzas'
  | 'legal'
  | 'brief';

export type SeccionBloqueable =
  // ── mercado ── visible en gratuito: SOLO el estudio de viabilidad.
  | 'mercado.resumen_ejecutivo'
  | 'mercado.tendencias'
  | 'mercado.competencia'
  | 'mercado.comparativa_competidores'
  | 'mercado.dafo'
  | 'mercado.tam_sam_som'
  | 'mercado.estacionalidad'
  | 'mercado.reporte_bi'
  // ── marketing ── visible: la estrategia recomendada.
  | 'marketing.estrategias_secundarias'
  | 'marketing.copies'
  | 'marketing.tendencias'
  | 'marketing.metricas_clave'
  | 'marketing.calendario'
  | 'marketing.calendario_semana_2'
  | 'marketing.video_script'
  | 'marketing.prompt_visual'
  // ── ventas ── visible en freemium: tips + historia del día (gancho).
  | 'ventas.porque_fallan'
  | 'ventas.perfil_cliente'       // ICP: pro y superior
  | 'ventas.script_scorer'        // Evaluador de guiones: pro+
  | 'ventas.competitor_intel'     // Competitor Intel: pro+
  // ── finanzas ── visible: SOLO el punto de equilibrio.
  | 'finanzas.resumen'
  | 'finanzas.proyeccion_12m'
  | 'finanzas.centro_mando'
  | 'finanzas.escenarios_avanzados'
  // ── legal ──
  | 'legal.completo'
  // ── brief ── visible: score_marca + resumen_tweet.
  | 'brief.identidad'
  | 'brief.identidad_visual'
  | 'brief.diagnostico_estrategico'
  | 'brief.instrucciones_disenador';

const BLOQUEADAS_FREEMIUM: Record<ModuloAnalisis, readonly SeccionBloqueable[]> = {
  mercado: [
    'mercado.resumen_ejecutivo',
    'mercado.tendencias',
    'mercado.competencia',
    'mercado.comparativa_competidores',
    'mercado.dafo',
    'mercado.tam_sam_som',
    'mercado.estacionalidad',
    'mercado.reporte_bi',
  ],
  marketing: [
    'marketing.estrategias_secundarias',
    'marketing.copies',
    'marketing.tendencias',
    'marketing.metricas_clave',
    'marketing.calendario',
    'marketing.calendario_semana_2',
    'marketing.video_script',
    'marketing.prompt_visual',
  ],
  ventas: ['ventas.porque_fallan', 'ventas.perfil_cliente', 'ventas.script_scorer', 'ventas.competitor_intel'],
  finanzas: [
    'finanzas.resumen',
    'finanzas.proyeccion_12m',
    'finanzas.centro_mando',
    'finanzas.escenarios_avanzados',
  ],
  legal: ['legal.completo'],
  brief: [
    'brief.identidad',
    'brief.identidad_visual',
    'brief.diagnostico_estrategico',
    'brief.instrucciones_disenador',
  ],
};

/** Nº de estrategias de marketing con datos reales en el plan gratuito. */
export const FREEMIUM_ESTRATEGIAS_VISIBLES = 1;
/** Nº de semanas de calendario generadas en el plan gratuito. */
export const FREEMIUM_SEMANAS_CALENDARIO = 1;

/**
 * Conjunto de secciones tapadas para este plan y módulo.
 *
 * @param plan       plan de la cuenta (tal cual llega de /auth/me o localStorage)
 * @param modulo     módulo de la página de resultado
 * @param delServidor `secciones_bloqueadas` de la respuesta, si viene. Puede ser
 *                    undefined, null, o traer claves que aquí no existan todavía.
 */
export function seccionesBloqueadasDe(
  plan: string | null | undefined,
  modulo: ModuloAnalisis,
  delServidor?: readonly string[] | null,
): ReadonlySet<string> {
  if (esPlanDePago(plan)) return new Set<string>();

  const claves = new Set<string>(BLOQUEADAS_FREEMIUM[modulo] ?? []);
  if (Array.isArray(delServidor)) {
    for (const clave of delServidor) {
      if (typeof clave === 'string' && clave.length > 0) claves.add(clave);
    }
  }
  return claves;
}

/**
 * Helper directo para JSX: `if (estaBloqueada(plan, 'mercado.dafo'))`.
 * Deriva el módulo del prefijo de la clave, así no hay que pasarlo dos veces.
 *
 * Para las nuevas secciones de Ventas V2, usa la lógica granular:
 *   - perfil_cliente ( ICP )   → pro, pro_plus, business, enterprise
 *   - script_scorer            → pro_plus, business, enterprise
 *   - competitor_intel         → pro_plus, business, enterprise
 */
export function estaBloqueada(
  plan: string | null | undefined,
  seccion: SeccionBloqueable,
  delServidor?: readonly string[] | null,
): boolean {
  // Gating granular para Ventas V2
  if (seccion === 'ventas.perfil_cliente') {
    return !esPlanDePago(plan); // pro y superior
  }
  if (seccion === 'ventas.script_scorer' || seccion === 'ventas.competitor_intel') {
    return !esPlanProPlus(plan); // pro+ y superior
  }

  if (esPlanDePago(plan)) return false;

  const modulo = seccion.split('.')[0] as ModuloAnalisis;
  return seccionesBloqueadasDe(plan, modulo, delServidor).has(seccion);
}

/** ¿Este módulo queda tapado por completo en el plan actual? */
export function moduloCompletoBloqueado(
  plan: string | null | undefined,
  modulo: ModuloAnalisis,
): boolean {
  if (esPlanDePago(plan)) return false;
  return (BLOQUEADAS_FREEMIUM[modulo] ?? []).includes(`${modulo}.completo` as SeccionBloqueable);
}