import { NivelConfianza } from '../../utils/confianza';

// ─── Tipo de local ───────────────────────────────────────────────────────────
// Tupla `as const` para derivar el tipo TS y el z.enum del schema de la MISMA
// fuente, y que no puedan desincronizarse.

export const TIPOS_LOCAL = [
  'produccion_alimentos',
  'retail',
  'servicio_atencion',
  'oficina',
  'taller',
  'almacen',
  'ecommerce_bodega',
  'otro',
  'sin_local',
] as const;

export type TipoLocal = (typeof TIPOS_LOCAL)[number];

// ─── Superficie ──────────────────────────────────────────────────────────────

/**
 * Parámetros del modelo de espacio por tipo de operación.
 *
 * IMPORTANTE: son SUPUESTOS OPERATIVOS declarados (cuánto espacio ocupa una
 * persona trabajando, o el stock de N unidades), NO datos de mercado. El
 * resultado siempre viaja con su `nivel_confianza` y sus `supuestos`. Si el
 * usuario declara sus m² reales, estos coeficientes no se usan.
 */
export interface ModeloEspacio {
  etiqueta: string;
  /** Superficie mínima de la función productiva, sin personal ni volumen. */
  m2_base: number;
  /** m² adicionales por cada persona trabajando en el local. */
  m2_por_persona: number;
  /** m² adicionales por cada 1.000 unidades/mes (producción + stock en piso). */
  m2_por_1000_unidades_mes: number;
  /** Proporción extra para pasillos, accesos y sanitarios. 0.30 = +30%. */
  factor_circulacion: number;
  /** Suelo práctico: por debajo de esto el local no es operable. */
  m2_minimo: number;
}

export interface SuperficieInput {
  tipo_local: TipoLocal;
  /** Unidades vendidas/producidas al mes (viene del análisis de Finanzas). */
  unidades_mes?: number;
  /** Personas trabajando simultáneamente en el local. */
  personal?: number;
  /** m² reales si el usuario ya tiene o cotizó el local. Tiene prioridad. */
  m2_declarados?: number;
}

export type FuenteSuperficie = 'declarada' | 'modelo_operativo' | 'no_aplica';

export interface SuperficieResult {
  /** m² de trabajo efectivo. `null` si la operación no requiere local. */
  m2_operativos: number | null;
  /** m² de pasillos/accesos incluidos en el total. */
  m2_circulacion: number | null;
  /** m² a rentar. Es el que multiplica al precio por m². */
  m2_totales: number | null;
  fuente: FuenteSuperficie;
  nivel_confianza: NivelConfianza;
  supuestos: string[];
  nota: string;
}

// ─── Precio por m² ───────────────────────────────────────────────────────────

/** Ubicación mínima para consultar cualquier referencia de precio de zona. */
export interface UbicacionConsulta {
  pais?: string;
  estado?: string;
  zona?: string;
}

export interface PrecioM2Consulta extends UbicacionConsulta {
  /** Precio declarado por el usuario (cotización o contrato). Máxima prioridad. */
  precio_m2_mes_declarado?: number;
  /** Moneda a reportar cuando el precio viene declarado. */
  moneda?: string;
}

export type FuentePrecioM2 = 'declarado' | 'tabla_operador' | 'api_externa' | 'sin_fuente';

export interface PrecioM2Result {
  /** Renta mensual por m². `null` = no hay fuente; NUNCA se inventa una cifra. */
  precio_m2_mes: number | null;
  moneda: string | null;
  zona_consultada: string;
  fuente: FuentePrecioM2;
  /** `true` cuando no hubo fuente real y por tanto no hay precio. */
  es_mock: boolean;
  nivel_confianza: NivelConfianza;
  nota: string;
}

// ─── Renta derivada ──────────────────────────────────────────────────────────

export type OrigenRenta = 'declarada' | 'derivada_m2' | 'sin_local' | 'no_disponible';

export interface RentaZonaResult {
  /** Renta mensual para costos fijos. `null` = sin dato utilizable. */
  renta_mensual: number | null;
  origen: OrigenRenta;
  m2_totales: number | null;
  precio_m2_mes: number | null;
  moneda: string | null;
  /** Renta que implica el modelo por m², aunque gane la declarada. */
  renta_estimada_m2: number | null;
  nivel_confianza: NivelConfianza;
  advertencias: string[];
  nota: string;
}

// ─── Inputs a nivel de request ───────────────────────────────────────────────

export interface ZonaLocalInput {
  tipo_local: TipoLocal;
  m2_declarados?: number;
  precio_m2_mes_declarado?: number;
  personal?: number;
  pais?: string;
  estado?: string;
  zona?: string;
}

export interface RentaZonaInput extends ZonaLocalInput {
  unidades_mes?: number;
  /** Renta mensual ya declarada por el usuario (desglose de costos fijos). */
  renta_declarada?: number;
  moneda?: string;
}

// ─── Precio de VENTA por m² (vivienda / local) ────────────────────────────────

export interface PrecioVentaM2Consulta extends UbicacionConsulta {
  /** Precio de venta por m² declarado por el usuario (tasación o anuncio). */
  precio_venta_m2_declarado?: number;
  moneda?: string;
}

export type FuentePrecioVentaM2 = 'declarado' | 'tabla_operador' | 'api_externa' | 'sin_fuente';

export interface PrecioVentaM2Result {
  /** Precio de venta por m². `null` = no hay fuente; NUNCA se inventa una cifra. */
  precio_venta_m2: number | null;
  moneda: string | null;
  zona_consultada: string;
  fuente: FuentePrecioVentaM2;
  /** `true` cuando no hubo fuente real y por tanto no hay precio. */
  es_mock: boolean;
  nivel_confianza: NivelConfianza;
  nota: string;
}

// ─── Estudio del área (renta vs compra) ──────────────────────────────────────

/**
 * Conclusión aritmética de la comparación, NO una recomendación de inversión:
 * - `comprar`    el yield bruto es alto → rentar sale caro frente al precio.
 * - `rentar`     el yield bruto es bajo → comprar sale caro frente a la renta.
 * - `equilibrado` el yield cae en la banda intermedia: no decide por sí solo.
 * - `sin_conclusion` faltan datos o su confianza es demasiado baja.
 */
export type VeredictoArea = 'rentar' | 'comprar' | 'equilibrado' | 'sin_conclusion';

export interface EstudioAreaInput extends RentaZonaInput {
  precio_venta_m2_declarado?: number;
}

export interface EstudioAreaResult {
  m2_totales: number | null;
  fuente_superficie: FuenteSuperficie;
  /** Bloque de renta completo, para no recalcularlo ni perder sus avisos. */
  renta: RentaZonaResult;
  renta_mensual: number | null;
  renta_anual: number | null;
  precio_venta_m2: number | null;
  /** m² × precio de venta por m². `null` si falta cualquiera de los dos. */
  valor_compra_estimado: number | null;
  /** Renta anual / valor de compra × 100. */
  yield_bruto_anual_pct: number | null;
  /** Meses de renta que cuesta el mismo espacio comprado. */
  meses_renta_equivalentes: number | null;
  /** Valor de compra / renta anual (PER inmobiliario). */
  multiplo_precio_renta_anual: number | null;
  moneda: string | null;
  veredicto: VeredictoArea;
  nivel_confianza: NivelConfianza;
  advertencias: string[];
  supuestos: string[];
  nota: string;
}