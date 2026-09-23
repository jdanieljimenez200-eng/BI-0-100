import { Plan } from '../../models/Usuario';
import { PermisosTrabajador } from '../../models/AsignacionTrabajador';

export interface PlanLimites {
  max_productos: number;           // -1 = ilimitado
  max_analisis_por_modulo: number; // -1 = ilimitado
  max_analisis_brief: number;      // -1 = ilimitado (brief tiene su propio límite)
  max_trabajadores: number;        // -1 = ilimitado, 0 = sin equipo
  // Cuántas herramientas puede ACTIVAR el usuario a elección (planes con selección).
  // -1 = todas incluidas (freemium prueba todo, business/enterprise sin límite);
  // pro = 1, pro_plus = 4. Ver herramientas_seleccionadas.
  max_herramientas: number;
  // Límite duro de movimientos POR herramienta (ventas, insumos, citas, etc.).
  // -1 = ilimitado; freemium = 2 para que el usuario pruebe todo antes de pagar.
  max_movimientos_herramienta: number;
  ai_copy: boolean;
  csv_import: boolean;             // importación masiva CSV en contabilidad (Pro+)
  centro_mando: boolean;           // edición de parámetros/overrides del Centro de Mando (Pro+)
  legal_analisis: boolean;         // módulo de análisis legal-fiscal (Pro+)
  ventas_analisis: boolean;        // módulo de análisis de ventas (desde Freemium)
  white_label: boolean;            // logo/color/dominio propios en POS, tickets y cotizaciones
  alertas_automaticas: boolean;    // alertas WhatsApp/email: stock bajo, metas, caída de ingresos
  comision_pct: number;            // % de application_fee en cobros del POS (Stripe Connect)
  /**
   * Créditos de IA que renuevan cada mes natural. Cada acción cuesta créditos
   * según COSTO_CREDITOS (services/billing/creditosIA.ts). En freemium los
   * análisis no gastan créditos (tienen su límite de 1 por módulo); los créditos
   * solo cubren acciones bajo demanda.
   */
  creditos_ia_mes: number;
  nombre: string;
  // Precio de cobro en México, IVA incluido (Stripe en MXN). El anual es el total del año.
  precio_mxn: number;              // 0 = gratis
  precio_mxn_anual: number;        // 0 = sin ciclo anual
  // Equivalente para otros países (Stripe en USD).
  precio_usd_mensual: number;
  precio_usd_anual: number;
  descripcion: string;
}

export const PLAN_LIMITES: Record<Plan, PlanLimites> = {
  freemium: {
    nombre: 'Gratis',
    precio_mxn: 0,
    precio_mxn_anual: 0,
    precio_usd_mensual: 0,
    precio_usd_anual: 0,
    descripcion: 'Prueba TODO el sistema — 1 producto, 2 movimientos por herramienta',
    creditos_ia_mes: 5,
    max_productos: 1,
    max_analisis_por_modulo: 1,
    max_analisis_brief: 1,
    max_trabajadores: 0,
    max_herramientas: -1,             // todas visibles, limitadas por movimientos
    max_movimientos_herramienta: 2,
    ai_copy: false,
    csv_import: false,
    centro_mando: false,
    legal_analisis: false,
    ventas_analisis: true,
    white_label: false,
    alertas_automaticas: false,
    comision_pct: 0,
  },
  pro: {
    // Plan de entrada a propósito cerca del Negocio (75 % del precio) con bastante
    // menos (1 herramienta de 4, 1/3 de los créditos, sin Legal ni evaluadores):
    // su papel es que el Negocio se lea como la compra obvia.
    nombre: 'Emprendedor',
    precio_mxn: 449,
    precio_mxn_anual: 4490,
    precio_usd_mensual: 25,
    precio_usd_anual: 250,
    descripcion: 'Elige 1 herramienta — hasta 3 productos y 20 créditos de IA al mes',
    creditos_ia_mes: 20,
    max_productos: 3,
    max_analisis_por_modulo: -1,
    max_analisis_brief: 5,
    max_trabajadores: 1,
    max_herramientas: 1,
    max_movimientos_herramienta: -1,
    ai_copy: true,
    csv_import: true,
    centro_mando: true,
    legal_analisis: false,
    ventas_analisis: true,
    white_label: false,
    alertas_automaticas: false,
    comision_pct: 1.5,
  },
  pro_plus: {
    nombre: 'Negocio',
    precio_mxn: 599,
    precio_mxn_anual: 5990,
    precio_usd_mensual: 33,
    precio_usd_anual: 330,
    descripcion: 'Elige 4 herramientas — hasta 10 productos, Legal y 60 créditos de IA al mes',
    creditos_ia_mes: 60,
    max_productos: 10,
    max_analisis_por_modulo: -1,
    max_analisis_brief: 10,
    max_trabajadores: 5,
    max_herramientas: 4,
    max_movimientos_herramienta: -1,
    ai_copy: true,
    csv_import: true,
    centro_mando: true,
    legal_analisis: true,
    ventas_analisis: true,
    white_label: false,
    alertas_automaticas: true,
    comision_pct: 1.2,
  },
  business: {
    nombre: 'Empresa',
    precio_mxn: 1199,
    precio_mxn_anual: 11990,
    precio_usd_mensual: 65,
    precio_usd_anual: 650,
    descripcion: 'Todas las herramientas, productos ilimitados y 120 créditos de IA al mes',
    creditos_ia_mes: 120,
    max_productos: -1,
    max_analisis_por_modulo: -1,
    max_analisis_brief: -1,
    max_trabajadores: 10,
    max_herramientas: -1,
    max_movimientos_herramienta: -1,
    ai_copy: true,
    csv_import: true,
    centro_mando: true,
    legal_analisis: true,
    ventas_analisis: true,
    white_label: true,
    alertas_automaticas: true,
    comision_pct: 0.9,
  },
  enterprise: {
    nombre: 'Enterprise',
    precio_mxn: 4999,
    precio_mxn_anual: 49990,
    precio_usd_mensual: 279,
    precio_usd_anual: 2790,
    descripcion: 'Para franquicias y grupos — 600 créditos de IA al mes, ampliables',
    creditos_ia_mes: 600,
    max_productos: -1,
    max_analisis_por_modulo: -1,
    max_analisis_brief: -1,
    max_trabajadores: -1,
    max_herramientas: -1,
    max_movimientos_herramienta: -1,
    ai_copy: true,
    csv_import: true,
    centro_mando: true,
    legal_analisis: true,
    ventas_analisis: true,
    white_label: true,
    alertas_automaticas: true,
    comision_pct: 0.9,
  },
};

// Características booleanas por plan (no son límites numéricos).
export type PlanFeature =
  | 'ai_copy'
  | 'csv_import'
  | 'centro_mando'
  | 'legal_analisis'
  | 'ventas_analisis'
  | 'white_label'
  | 'alertas_automaticas';

export function planHasFeature(plan: Plan, feature: PlanFeature): boolean {
  return getLimites(plan)[feature] === true;
}

export function getLimites(plan: Plan): PlanLimites {
  return PLAN_LIMITES[plan] ?? PLAN_LIMITES.freemium;
}

export function canAddProducto(plan: Plan, productosActivos: number): boolean {
  const l = getLimites(plan);
  return l.max_productos === -1 || productosActivos < l.max_productos;
}

export function canRunAnalisis(plan: Plan, analisisExistentes: number): boolean {
  const l = getLimites(plan);
  return l.max_analisis_por_modulo === -1 || analisisExistentes < l.max_analisis_por_modulo;
}

export function canRunBriefAnalisis(plan: Plan, analisisExistentes: number): boolean {
  const l = getLimites(plan);
  return l.max_analisis_brief === -1 || analisisExistentes < l.max_analisis_brief;
}

export function canAddTrabajador(plan: Plan, trabajadoresActivos: number): boolean {
  const l = getLimites(plan);
  return l.max_trabajadores === -1 || trabajadoresActivos < l.max_trabajadores;
}

/** % de comisión de plataforma (application_fee) del plan para cobros del POS. */
export function getComisionPct(plan: Plan): number {
  return getLimites(plan).comision_pct;
}

/**
 * Calcula el application_fee_amount para Stripe Connect, en la MISMA unidad que
 * recibe (si pasas centavos, devuelve centavos). Redondea al entero más cercano
 * porque Stripe exige montos enteros en la unidad mínima de la moneda.
 *
 * @param totalMonto total de la venta (en centavos para Stripe)
 * @param plan plan del dueño de la cuenta
 */
export function calcularComisionPlataforma(totalMonto: number, plan: Plan): number {
  if (!isFinite(totalMonto) || totalMonto <= 0) return 0;
  const pct = getComisionPct(plan);
  if (pct <= 0) return 0;
  return Math.round(totalMonto * (pct / 100));
}

// --- Catálogo de capacidades ---
// Una "capacidad" = una clave de PermisosTrabajador que da acceso a un módulo o
// herramienta. Las acciones sensibles (cancelar_ventas, precio_libre) viven en
// el mismo objeto de permisos pero NO son capacidades: no abren nada, afinan lo
// que se puede hacer dentro de una herramienta que ya se tiene, así que se
// excluyen aquí (si no, aparecerían como herramientas en el menú y en el plan).
// El tipo se deriva de PermisosTrabajador: si se añade o quita un permiso en el
// modelo y no se actualiza este catálogo, el compilador falla (ver
// _exhaustividad abajo).
export type CapabilityKey = Exclude<keyof PermisosTrabajador, AccionSensibleKey>;

/** Claves de ACCIONES_SENSIBLES (declarado abajo; aquí solo el tipo). */
type AccionSensibleKey = 'cancelar_ventas' | 'precio_libre';

export type CapabilityGrupo = 'analisis' | 'herramientas';

export interface CapabilityMeta {
  key: CapabilityKey;
  grupo: CapabilityGrupo;
  label: string;
  // sensible = arranca apagada y, en la UI, debe pedir confirmación explícita
  // del dueño antes de activarse (finanzas, nómina, contabilidad).
  sensible: boolean;
}

export const CAPABILITIES = [
  // Análisis
  { key: 'mercado', grupo: 'analisis' as const, label: 'Análisis de Mercado', sensible: false },
  { key: 'marketing', grupo: 'analisis' as const, label: 'Análisis de Marketing', sensible: false },
  { key: 'ventas', grupo: 'analisis' as const, label: 'Estrategia de Ventas', sensible: false },
  { key: 'brief', grupo: 'analisis' as const, label: 'Brief', sensible: false },
  { key: 'finanzas', grupo: 'analisis' as const, label: 'Análisis de Finanzas', sensible: true },
  { key: 'legal', grupo: 'analisis' as const, label: 'Análisis Legal', sensible: false },
  // Herramientas
  { key: 'pos', grupo: 'herramientas' as const, label: 'Punto de Venta', sensible: false },
  { key: 'inventario', grupo: 'herramientas' as const, label: 'Inventario', sensible: false },
  { key: 'citas', grupo: 'herramientas' as const, label: 'Citas', sensible: false },
  { key: 'clientes', grupo: 'herramientas' as const, label: 'Clientes', sensible: false },
  { key: 'cotizaciones', grupo: 'herramientas' as const, label: 'Cotizaciones', sensible: false },
  { key: 'nomina', grupo: 'herramientas' as const, label: 'Nómina', sensible: true },
  { key: 'contabilidad', grupo: 'herramientas' as const, label: 'Reportes', sensible: true },
  { key: 'mantenimientos', grupo: 'herramientas' as const, label: 'Mantenimientos', sensible: false },
] as const;

// Verificación de exhaustividad en tiempo de compilación: si PermisosTrabajador
// gana o pierde una clave y CAPABILITIES no se actualiza, esto deja de compilar.
type _CatalogoCompleto =
  Exclude<CapabilityKey, (typeof CAPABILITIES)[number]['key']> extends never ? true : never;
const _exhaustividad: _CatalogoCompleto = true;
void _exhaustividad;

// Subconjunto de capacidades que son "herramientas" del sistema computacional.
export type HerramientaCapabilityKey = Extract<
  (typeof CAPABILITIES)[number],
  { grupo: 'herramientas' }
>['key'];

// Lista de todas las herramientas del sistema (las 7 keys de grupo 'herramientas').
export const TODAS_LAS_HERRAMIENTAS: readonly HerramientaCapabilityKey[] = CAPABILITIES
  .filter((c) => c.grupo === 'herramientas')
  .map((c) => c.key as HerramientaCapabilityKey);

/**
 * Modelo A — monetización por PLAN: qué herramientas desbloquea cada tier "de fábrica".
 *  - freemium: TODAS visibles (para probar), pero limitadas a 2 movimientos c/u.
 *  - pro / pro_plus: NINGUNA fija — el usuario ELIGE (ver herramientas_seleccionadas)
 *    hasta max_herramientas. La disponibilidad efectiva se calcula combinando este
 *    array con las herramientas seleccionadas.
 *  - business / enterprise: TODAS incluidas sin selección.
 */
export const HERRAMIENTAS_POR_PLAN: Record<Plan, readonly HerramientaCapabilityKey[]> = {
  freemium: TODAS_LAS_HERRAMIENTAS,
  pro: [],
  pro_plus: [],
  business: ['pos', 'inventario', 'clientes', 'citas', 'cotizaciones', 'nomina', 'contabilidad', 'mantenimientos'],
  enterprise: ['pos', 'inventario', 'clientes', 'citas', 'cotizaciones', 'nomina', 'contabilidad', 'mantenimientos'],
};

/** Herramientas incluidas en el plan (para derivar disponibilidad de la cuenta). */
export function getHerramientasIncluidas(plan: Plan): readonly HerramientaCapabilityKey[] {
  return HERRAMIENTAS_POR_PLAN[plan] ?? HERRAMIENTAS_POR_PLAN.freemium;
}

/** ¿El plan desbloquea esta herramienta de fábrica? (acepta string arbitrario). */
export function planIncluyeHerramienta(plan: Plan, key: string): boolean {
  return (getHerramientasIncluidas(plan) as readonly string[]).includes(key);
}

/** Nº de herramientas que el plan permite ELEGIR. -1 = todas incluidas. */
export function getMaxHerramientas(plan: Plan): number {
  return getLimites(plan).max_herramientas;
}

/**
 * ¿El plan funciona por SELECCIÓN de herramientas? (pro, pro_plus).
 * Freemium (-1) y Business/Enterprise (-1) traen las herramientas de fábrica.
 */
export function planPermiteSeleccion(plan: Plan): boolean {
  const m = getMaxHerramientas(plan);
  return m > 0;
}

/** ¿Puede activar otra herramienta a elección sin pasar su límite? */
export function canSelectHerramienta(plan: Plan, seleccionadasActivas: number): boolean {
  const m = getMaxHerramientas(plan);
  return m === -1 || seleccionadasActivas < m;
}

/** Límite duro de movimientos por herramienta (-1 = ilimitado). */
export function getMaxMovimientosHerramienta(plan: Plan): number {
  return getLimites(plan).max_movimientos_herramienta;
}

/**
 * ¿Puede registrar un movimiento más en una herramienta?
 * Freemium tope 2; el resto ilimitado.
 */
export function canAddMovimiento(plan: Plan, movimientosActuales: number): boolean {
  const max = getMaxMovimientosHerramienta(plan);
  return max === -1 || movimientosActuales < max;
}

const CAPABILITY_KEYS = new Set<string>(CAPABILITIES.map((c) => c.key));

export function isCapabilityKey(value: string): value is CapabilityKey {
  return CAPABILITY_KEYS.has(value);
}

/**
 * Acciones sensibles DENTRO de una herramienta: tener la herramienta no basta.
 *
 * Con permisos solo por herramienta, cualquier cajero podía cancelar una venta
 * o cobrar un precio distinto al del catálogo, que es el fraude clásico de caja
 * (cobrar, cancelar y quedarse el efectivo). Son permisos aparte, apagados por
 * defecto, que el dueño concede uno a uno; el dueño siempre las tiene.
 */
export const ACCIONES_SENSIBLES = [
  { key: 'cancelar_ventas', label: 'Cancelar ventas del POS', requiere: 'pos' },
  { key: 'precio_libre', label: 'Cobrar un precio distinto al del catálogo', requiere: 'pos' },
] as const;

export type AccionSensible = (typeof ACCIONES_SENSIBLES)[number]['key'];

const ACCION_KEYS = new Set<string>(ACCIONES_SENSIBLES.map((a) => a.key));

export function isAccionSensible(value: string): value is AccionSensible {
  return ACCION_KEYS.has(value);
}

/**
 * Normaliza un objeto de permisos arbitrario (p. ej. del body de una request):
 * descarta claves desconocidas y fuerza valores booleanos. Solo conserva las
 * capacidades que estén explícitamente en true.
 */
export function sanitizePermisos(input: unknown): PermisosTrabajador {
  const out: PermisosTrabajador = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if ((isCapabilityKey(k) || isAccionSensible(k)) && v === true) {
      out[k] = true;
    }
  }
  return out;
}

/**
 * Calcula las capacidades EFECTIVAS de un usuario para que el frontend filtre el
 * menú y las herramientas. Función pura (testeable, sin DB):
 *  - Siempre devuelve TODAS las claves de CAPABILITIES (las no concedidas en false).
 *  - Owner → todas en true.
 *  - Trabajador → una capacidad es true si CUALQUIERA de sus asignaciones la
 *    concede (true) en al menos un producto (unión sobre todas las asignaciones).
 *
 * @param accountRole 'owner' | 'trabajador'
 * @param asignaciones permisos de cada asignación ACTIVA del trabajador
 *   (el llamador ya filtra por activo: true). Ignorado para owner.
 */
export function computePermisosEfectivos(
  accountRole: string,
  asignaciones: ReadonlyArray<PermisosTrabajador | null | undefined> = [],
): Record<CapabilityKey, boolean> {
  const permisos = {} as Record<CapabilityKey, boolean>;
  for (const cap of CAPABILITIES) permisos[cap.key] = false;

  if (accountRole === 'owner') {
    for (const cap of CAPABILITIES) permisos[cap.key] = true;
    return permisos;
  }

  for (const asig of asignaciones) {
    const p = asig ?? {};
    for (const cap of CAPABILITIES) {
      if (p[cap.key] === true) permisos[cap.key] = true;
    }
  }
  return permisos;
}