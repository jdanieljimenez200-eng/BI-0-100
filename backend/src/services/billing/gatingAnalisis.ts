import { Plan } from '../../models/Usuario';

/**
 * Qué partes de cada análisis NO se generan en el plan gratuito.
 *
 * Este módulo es la ÚNICA fuente de verdad del recorte, y existe por una razón
 * económica: antes el orquestador generaba todo y la ruta lo enmascaraba al
 * responder, así que el coste de IA se pagaba igual para contenido que el
 * usuario nunca veía. Los orquestadores consultan `getPlanGate()` ANTES de
 * llamar a los servicios de generación y omiten las secciones bloqueadas.
 *
 * La regla es INVERSA a la original: en plan gratuito se bloquea el módulo
 * entero salvo una sección "gancho" por módulo (ver comentarios de
 * BLOQUEADAS_FREEMIUM). Las claves antiguas de grano fino se conservan porque
 * los orquestadores y rutas ya las consultan; quitarlas rompería `permite()`.
 *
 * Consecuencia aceptada: un análisis ejecutado en plan gratuito queda
 * incompleto de forma permanente. Al pasar a un plan de pago hay que
 * re-ejecutarlo, lo cual no cuesta cuota porque en esos planes
 * max_analisis_por_modulo es -1 (ver planService.PLAN_LIMITES).
 *
 * Función pura, sin DB ni HTTP → cubierta por los tests unitarios igual que el
 * resto de servicios puros.
 */

// Planes que reciben el análisis COMPLETO. Se declara explícito en vez de
// derivarlo de una feature booleana de PLAN_LIMITES para que ampliar el gate no
// dependa de que 'ai_copy' siga significando "plan de pago".
const PLANES_ANALISIS_COMPLETO: readonly Plan[] = ['pro', 'pro_plus', 'business', 'enterprise'];

/**
 * Claves de sección bloqueable. El frontend recibe estas mismas cadenas en
 * `secciones_bloqueadas` y decide qué envolver en <LockedSection>, así que
 * cualquier cambio aquí obliga a actualizar el componente que las consume.
 */
export type SeccionBloqueable =
  // ── mercado ── visible en gratuito: SOLO el estudio de viabilidad
  // (viabilidad_score / viabilidad_estado / viabilidad_factores).
  | 'mercado.resumen_ejecutivo'
  | 'mercado.tendencias'
  | 'mercado.competencia'
  | 'mercado.comparativa_competidores'
  | 'mercado.dafo'
  | 'mercado.tam_sam_som'
  | 'mercado.estacionalidad'
  | 'mercado.reporte_bi'
  // ── marketing ── visible: 1 de las 3 estrategias (la recomendada).
  | 'marketing.estrategias_secundarias'
  | 'marketing.copies'
  | 'marketing.tendencias'
  | 'marketing.reporte_ads'
  | 'marketing.calendario'
  | 'marketing.calendario_semana_2'
  | 'marketing.video_script'
  | 'marketing.prompt_visual'
  // ── finanzas ── visible: SOLO el punto de equilibrio (tab 'breakeven').
  | 'finanzas.resumen'
  | 'finanzas.proyeccion_12m'
  | 'finanzas.centro_mando'
  | 'finanzas.escenarios_avanzados'
  // ── legal ──
  | 'legal.completo'
  // ── brief ── visible en gratuito: SOLO el veredicto (score_marca y
  // resumen_tweet). Se tapa todo el desarrollo de la identidad.
  | 'brief.identidad'
  | 'brief.identidad_visual'
  | 'brief.diagnostico_estrategico'
  | 'brief.instrucciones_disenador'
  // ── ventas ── visible en gratuito: tips + historia diaria (gancho).
  | 'ventas.porque_fallan'
  | 'ventas.perfil_cliente'       // ICP: disponible desde pro
  | 'ventas.script_scorer'        // Evaluador de guiones: pro+
  | 'ventas.competitor_intel';    // Inteligencia competitiva: pro+

/**
 * Módulos con recorte por plan. 'brief' está incluido aunque su LÍMITE sea
 * global por cuenta (contarAnalisisBrief en routes/brief.ts, que ignora el
 * productoId) en vez de por producto: el límite y el gate de contenido son
 * ejes independientes.
 */
export type ModuloAnalisis =
  | 'mercado'
  | 'marketing'
  | 'finanzas'
  | 'legal'
  | 'brief'
  | 'ventas';

const BLOQUEADAS_FREEMIUM: Record<ModuloAnalisis, readonly SeccionBloqueable[]> = {
  // Gancho visible: estudio de viabilidad.
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
  // Gancho visible: la estrategia recomendada. El calendario completo, los
  // copies y las tendencias quedan fuera; las tres claves de grano fino se
  // mantienen para que el gate siga funcionando si algún día se genera el
  // calendario en gratuito.
  marketing: [
    'marketing.estrategias_secundarias',
    'marketing.copies',
    'marketing.tendencias',
    'marketing.reporte_ads',
    'marketing.calendario',
    'marketing.calendario_semana_2',
    'marketing.video_script',
    'marketing.prompt_visual',
  ],
  // Gancho visible: punto de equilibrio.
  finanzas: [
    'finanzas.resumen',
    'finanzas.proyeccion_12m',
    'finanzas.centro_mando',
    'finanzas.escenarios_avanzados',
  ],
  // El módulo legal entero ya requiere plan de pago (legal_analisis en
  // PLAN_LIMITES); la clave existe para que la UI pueda tapar la vista previa.
  legal: ['legal.completo'],
  // Gancho visible: score_marca + resumen_tweet. Se tapa el desarrollo:
  // ADN/slogans/voz, paleta y tipografías, diagnóstico e instrucciones.
  brief: [
    'brief.identidad',
    'brief.identidad_visual',
    'brief.diagnostico_estrategico',
    'brief.instrucciones_disenador',
  ],
  // Gancho visible: tips de negociación + historia diaria del emprendedor.
  // "Por qué los emprendimientos fallan" (personalizado) requiere plan pago.
  // ICP requiere pro; Script Scorer y Competitor Intel requieren pro+.
  ventas: ['ventas.porque_fallan', 'ventas.perfil_cliente', 'ventas.script_scorer', 'ventas.competitor_intel'],
};

/** Nº de semanas de calendario que se generan en el plan gratuito. */
export const FREEMIUM_SEMANAS_CALENDARIO = 1;

/** Nº de estrategias de marketing con datos reales en el plan gratuito. */
export const FREEMIUM_ESTRATEGIAS_VISIBLES = 1;

export interface PlanGate {
  /** true si el plan recibe el análisis completo (no hay recorte). */
  completo: boolean;
  /** Secciones que NO se generan, para inyectar en la respuesta de la ruta. */
  bloqueadas: readonly SeccionBloqueable[];
  /** Helper para los orquestadores: ¿genero esta sección? */
  permite: (seccion: SeccionBloqueable) => boolean;
}

export function getPlanGate(
  plan: Plan | string | null | undefined,
  modulo: ModuloAnalisis,
): PlanGate {
  const completo = PLANES_ANALISIS_COMPLETO.includes(plan as Plan);
  const bloqueadas = completo ? [] : BLOQUEADAS_FREEMIUM[modulo] ?? [];
  const set = new Set<string>(bloqueadas);

  return {
    completo,
    bloqueadas,
    permite: (seccion: SeccionBloqueable) => !set.has(seccion),
  };
}

/** Secciones bloqueables declaradas para un módulo, sin depender del plan. */
export function seccionesBloqueablesDe(modulo: ModuloAnalisis): readonly SeccionBloqueable[] {
  return BLOQUEADAS_FREEMIUM[modulo] ?? [];
}

/** ¿Este plan recibe el análisis completo? (sin atarlo a un módulo concreto). */
export function planRecibeAnalisisCompleto(plan: Plan | string | null | undefined): boolean {
  return PLANES_ANALISIS_COMPLETO.includes(plan as Plan);
}

/**
 * Gate granular para el módulo de Ventas V2.
 * Las nuevas secciones tienen distinto nivel de acceso:
 *   - ICP Tracker           → pro, pro_plus, business, enterprise
 *   - Script Scorer         → pro_plus, business, enterprise
 *   - Competitor Intel      → pro_plus, business, enterprise
 */
const PLANES_PRO_PLUS_Y_SUPERIOR: readonly Plan[] = ['pro_plus', 'business', 'enterprise'];
const PLANES_PRO_Y_SUPERIOR: readonly Plan[] = ['pro', 'pro_plus', 'business', 'enterprise'];

export interface VentasGate extends PlanGate {
  tiene_icp: boolean;
  tiene_script_scorer: boolean;
  tiene_competitor_intel: boolean;
}

export function getVentasGate(plan: Plan | string | null | undefined): VentasGate {
  const base = getPlanGate(plan, 'ventas');
  const tiene_icp = PLANES_PRO_Y_SUPERIOR.includes(plan as Plan);
  const tiene_script_scorer = PLANES_PRO_PLUS_Y_SUPERIOR.includes(plan as Plan);
  const tiene_competitor_intel = PLANES_PRO_PLUS_Y_SUPERIOR.includes(plan as Plan);

  // Recalcula las bloqueadas con la granularidad correcta
  const bloqueadas: SeccionBloqueable[] = [];
  if (!base.permite('ventas.porque_fallan')) bloqueadas.push('ventas.porque_fallan');
  if (!tiene_icp) bloqueadas.push('ventas.perfil_cliente');
  if (!tiene_script_scorer) bloqueadas.push('ventas.script_scorer');
  if (!tiene_competitor_intel) bloqueadas.push('ventas.competitor_intel');

  const set = new Set<string>(bloqueadas);
  return {
    completo: tiene_competitor_intel,
    bloqueadas,
    permite: (seccion: SeccionBloqueable) => !set.has(seccion),
    tiene_icp,
    tiene_script_scorer,
    tiene_competitor_intel,
  };
}