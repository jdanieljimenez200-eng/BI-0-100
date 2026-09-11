// Espejo (frontend) de backend/src/services/billing/planService.ts.
// Mantener SINCRONIZADO con PLAN_LIMITES: mismos planes, mismas features.
// Fuente de verdad: el backend. Si cambian los planes allí, actualizar aquí.

export type Plan = 'freemium' | 'pro' | 'pro_plus' | 'business' | 'enterprise';

export type PlanFeature =
  | 'ai_copy'
  | 'csv_import'
  | 'centro_mando'
  | 'legal_analisis'
  | 'white_label'
  | 'alertas_automaticas';

// Qué planes desbloquean cada feature booleana (copiado de PLAN_LIMITES).
const FEATURE_PLANS: Record<PlanFeature, readonly Plan[]> = {
  ai_copy: ['pro', 'pro_plus', 'business', 'enterprise'],
  csv_import: ['pro', 'pro_plus', 'business', 'enterprise'],
  centro_mando: ['pro', 'pro_plus', 'business', 'enterprise'],
  legal_analisis: ['pro', 'pro_plus', 'business', 'enterprise'],
  white_label: ['business', 'enterprise'],
  alertas_automaticas: ['pro_plus', 'business', 'enterprise'],
};

/** Todos los planes que NO son el gratuito. */
export const PLANES_DE_PAGO: readonly Plan[] = ['pro', 'pro_plus', 'business', 'enterprise'];

/**
 * Planes de nivel Pro+ o superior. Coherente con `alertas_automaticas` en
 * FEATURE_PLANS y con gatingAnalisis.ts del backend.
 */
export const PLANES_PRO_PLUS: readonly Plan[] = ['pro_plus', 'business', 'enterprise'];

/**
 * Normaliza un valor desconocido (localStorage, API) a un Plan válido.
 * `enums/index.ts` declara el alias 'pro+' mientras models/Usuario.ts persiste
 * 'pro_plus'; se acepta el alias para que un usuario Pro+ no caiga a freemium.
 */
export function normalizarPlan(plan: string | null | undefined): Plan {
  const planes: Plan[] = ['freemium', 'pro', 'pro_plus', 'business', 'enterprise'];
  const normalizado = typeof plan === 'string' ? plan.trim().toLowerCase() : '';

  if (normalizado === 'pro+' || normalizado === 'pro-plus' || normalizado === 'proplus') {
    return 'pro_plus';
  }

  return planes.includes(normalizado as Plan) ? (normalizado as Plan) : 'freemium';
}

/** ¿Es un plan de pago? (equivalente correcto del viejo `isPro`). */
export function esPlanDePago(plan: string | null | undefined): boolean {
  return PLANES_DE_PAGO.includes(normalizarPlan(plan));
}

/** ¿Es Pro+ o superior? Para features exclusivas (script_scorer, competitor_intel). */
export function esPlanProPlus(plan: string | null | undefined): boolean {
  return PLANES_PRO_PLUS.includes(normalizarPlan(plan));
}

/** ¿Este plan desbloquea esta feature concreta? Úsalo en vez de `isPro`. */
export function planTieneFeature(plan: string | null | undefined, feature: PlanFeature): boolean {
  return FEATURE_PLANS[feature].includes(normalizarPlan(plan));
}