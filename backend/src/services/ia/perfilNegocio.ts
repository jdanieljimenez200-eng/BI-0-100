import { z } from 'zod';
import { dinero } from '../../utils/limitesNumericos';
import { sanitizeForLLM } from '../../utils/sanitizeForLLM';

/**
 * Perfil ampliado del negocio: el «Afina tu análisis».
 *
 * Son datos del NEGOCIO, no de un análisis: se guardan en
 * `productos.perfil_negocio`, se responden una vez y los reutiliza cualquier
 * módulo. Todo es opcional: el formulario corto sigue bastando, y lo que falte
 * lo declara la IA como supuesto y como «información faltante».
 */

export const SECTORES_REGULADOS = [
  'alimentos_bebidas',
  'bebidas_alcoholicas',
  'salud',
  'farmacia_cosmeticos',
  'educacion',
  'transporte',
  'construccion',
  'financiero',
  'turismo_hospedaje',
  'armas_seguridad',
  'ninguno',
] as const;

// Todo admite `null`: es como el formulario dice «el usuario quitó su respuesta».
export const PerfilNegocioSchema = z
  .object({
    /** ¿Ya está dado de alta ante la autoridad fiscal? */
    situacion_fiscal: z.enum(['registrado', 'no_registrado', 'no_se']).nullable().optional(),
    /** Régimen en el que tributa hoy, en sus palabras. */
    regimen_actual: z.string().trim().max(120).nullable().optional(),
    /** Ingresos anuales estimados, en la moneda de la cuenta. */
    ingresos_anuales: dinero('ingresos_anuales').nullable().optional(),
    local_fisico: z.enum(['no', 'en_casa', 'local_rentado', 'local_propio', 'via_publica']).nullable().optional(),
    sectores_regulados: z.array(z.enum(SECTORES_REGULADOS)).max(SECTORES_REGULADOS.length).nullable().optional(),
    datos_sensibles: z.boolean().nullable().optional(),
    tipo_clientes: z.enum(['consumidor_final', 'empresas', 'gobierno', 'mixto']).nullable().optional(),
    marca: z.enum(['registrada', 'en_tramite', 'no', 'no_se']).nullable().optional(),

    // ── Cómo cobra y paga el negocio: cambian el cálculo de Finanzas ─────────
    // Llegan a la IA como datos de Finanzas (no por `textoPerfil`, que es el
    // perfil general) y Marketing o Ventas los pueden reutilizar.
    /** ¿El precio de venta ya incluye el impuesto al consumo del país (IVA, IGV…)? */
    precio_incluye_impuesto: z.boolean().nullable().optional(),
    /** % de cada venta que se quedan pasarelas, marketplaces o apps de reparto. */
    comision_venta_pct: z.number().finite().min(0).max(90).nullable().optional(),
    /** Días que tarda en cobrar una venta (0 = de contado). */
    dias_cobro: z.number().int().min(0).max(365).nullable().optional(),
    /** Días que dan los proveedores para pagar (0 = de contado). */
    dias_pago: z.number().int().min(0).max(365).nullable().optional(),
    /** Cuota mensual de las deudas del negocio (capital más intereses). */
    pago_deuda_mensual: dinero('pago_deuda_mensual').nullable().optional(),
  })
  .strict();

/** Campos de cobro y pago del perfil, en el orden en que los pregunta Finanzas. */
export const CAMPOS_FINANCIEROS = [
  'precio_incluye_impuesto',
  'comision_venta_pct',
  'dias_cobro',
  'dias_pago',
  'pago_deuda_mensual',
] as const;

export type PerfilNegocio = z.infer<typeof PerfilNegocioSchema>;

/**
 * Fusiona lo nuevo sobre lo guardado. Solo pisa lo que llega definido: un
 * formulario que no muestra un campo no debe borrar lo que el usuario contestó
 * en otro módulo. `null` sí borra (el usuario vació el campo).
 */
export function fusionarPerfil(actual: unknown, nuevo: PerfilNegocio): PerfilNegocio {
  const base = PerfilNegocioSchema.safeParse(actual ?? {});
  const resultado: Record<string, unknown> = { ...(base.success ? base.data : {}) };
  for (const [clave, valor] of Object.entries(nuevo)) {
    if (valor !== undefined) resultado[clave] = valor;
  }
  return resultado as PerfilNegocio;
}

/** Lee el perfil guardado sin fiarse de lo que haya en la columna. */
export function leerPerfil(valor: unknown): PerfilNegocio {
  const r = PerfilNegocioSchema.safeParse(valor ?? {});
  return r.success ? r.data : {};
}

const ETIQUETAS: Record<string, Record<string, string>> = {
  situacion_fiscal: {
    registrado: 'ya dado de alta ante la autoridad fiscal',
    no_registrado: 'todavía NO está dado de alta ante la autoridad fiscal',
    no_se: 'el dueño no sabe si está dado de alta',
  },
  local_fisico: {
    no: 'sin local (en línea o a domicilio del cliente)',
    en_casa: 'opera desde su casa',
    local_rentado: 'local rentado',
    local_propio: 'local propio',
    via_publica: 'puesto en vía pública (fijo, semifijo o ambulante)',
  },
  tipo_clientes: {
    consumidor_final: 'consumidor final',
    empresas: 'empresas',
    gobierno: 'gobierno',
    mixto: 'mixto (consumidor, empresas y/o gobierno)',
  },
  marca: {
    registrada: 'marca registrada',
    en_tramite: 'registro de marca en trámite',
    no: 'marca sin registrar',
    no_se: 'no sabe si la marca está registrada',
  },
};

const NO_DECLARADO = 'no declarado';

/**
 * El perfil como texto para el prompt, siempre con todas las líneas: un dato
 * ausente se dice «no declarado» para que la IA lo trate como supuesto y no
 * como un «no».
 */
export function textoPerfil(perfil: PerfilNegocio, moneda: string): string {
  const etiqueta = (campo: string, valor?: string | null) => (valor ? ETIQUETAS[campo]?.[valor] ?? valor : NO_DECLARADO);
  const sectores = perfil.sectores_regulados?.length
    ? perfil.sectores_regulados.map((s) => s.replace(/_/g, ' ')).join(', ')
    : NO_DECLARADO;
  const ingresos =
    typeof perfil.ingresos_anuales === 'number'
      ? `${perfil.ingresos_anuales.toLocaleString('es-MX')} ${moneda} al año (estimado del dueño)`
      : NO_DECLARADO;
  const booleano = (v?: boolean | null) => (v === undefined || v === null ? NO_DECLARADO : v ? 'sí' : 'no');

  return [
    `situacion_fiscal: ${etiqueta('situacion_fiscal', perfil.situacion_fiscal)}`,
    `regimen_actual: ${perfil.regimen_actual ? sanitizeForLLM(perfil.regimen_actual, { maxLen: 120 }) : NO_DECLARADO}`,
    `ingresos_anuales: ${ingresos}`,
    `local_fisico: ${etiqueta('local_fisico', perfil.local_fisico)}`,
    `sectores_regulados: ${sectores}`,
    `maneja_datos_sensibles (salud, biométricos, financieros): ${booleano(perfil.datos_sensibles)}`,
    `tipo_de_clientes: ${etiqueta('tipo_clientes', perfil.tipo_clientes)}`,
    `marca: ${etiqueta('marca', perfil.marca)}`,
  ].join('\n');
}

/** Campos del perfil que no se contestaron: alimenta «qué dato mejoraría el análisis». */
export function camposSinResponder(perfil: PerfilNegocio): string[] {
  const campos: (keyof PerfilNegocio)[] = [
    'situacion_fiscal',
    'regimen_actual',
    'ingresos_anuales',
    'local_fisico',
    'sectores_regulados',
    'datos_sensibles',
    'tipo_clientes',
    'marca',
  ];
  return campos.filter((c) => {
    const v = perfil[c];
    return v === undefined || v === null || (Array.isArray(v) && v.length === 0);
  });
}
