import type { TipoLocal } from '../zona/types';
import type { CensoOficialResult } from '../estadisticas/types';

// ─── Inputs ────────────────────────────────────────────────────────────────

export interface MercadoAnalisisInput {
  productoId: string;
  usuarioId: string;
  trabajadorId?: string; // id del trabajador que disparó el análisis (si aplica)
  pais?: string;       // ISO code: 'MX', 'CO', 'AR', etc. Default: 'MX'
  scope: 'local' | 'nacional';
  ciudad?: string;
  estado?: string;     // estado / departamento / provincia / región
  latitud?: number;
  longitud?: number;
  radioKm?: number;

  // Campos que SOLO se piden en este formulario (no redundantes)
  forma_cobro?: string;
  recurrencia_meses?: number;
  nse_target?: string;

  // Tracción (solo si "Negocio en Marcha" — leído desde Producto.estatus_proyecto)
  clientes_mes?: number;
  tasa_repeticion?: number;
  canal_adquisicion?: string;

  // Competidores que el usuario ya conoce (mejora el análisis DAFO)
  competidores_conocidos?: string;

  // Zona / local — derivan la renta mensual (m² × precio por m²).
  // Sin `tipo_local` no se calcula renta: ausente ≠ 0.
  tipo_local?: TipoLocal;
  m2_declarados?: number;
  precio_m2_mes_declarado?: number;
  personal?: number;
  zona?: string;
  renta_declarada?: number;
  /** Precio de VENTA por m² declarado (tasación o anuncio). Alimenta el
   *  estudio del área: sin él no hay comparación rentar vs comprar. */
  precio_venta_m2_declarado?: number;
}

// Datos del Producto que el orquestador inyecta automáticamente al prompt de IA
// (NO se piden de nuevo en el formulario de Mercado)
export interface ProductoContextoMercado {
  estatus_proyecto: string;
  tipo_actividad: string;
  puv: string;
  inversion_inicial: number;
  costos_fijos: number;
  precio_venta: number;
}

// ─── Tendencias ─────────────────────────────────────────────────────────────

export interface DatoMensual {
  mes: string;
  volumen: number;
}

export interface TendenciasResult {
  palabra_clave: string;
  ubicacion: string;
  volumen_busquedas_mensual: number;
  datos_12_meses: DatoMensual[];
  proyeccion_6_meses: number[];
  crecimiento_porcentaje: number;
  crecimiento_descripcion: string;
  picos_estacionales: Record<string, string>;
  tendencia: 'CRECIENTE' | 'ESTABLE' | 'DECRECIENTE';
  es_mock: boolean;
  /**
   * false = no hubo fuente de tendencias (sin SERPAPI_KEY o falló). Los campos
   * numéricos van en cero y NO deben puntuar: antes se inventaba un volumen de
   * búsquedas y el score lo tomaba por real.
   */
  fuente_disponible: boolean;
  motivo_sin_fuente?: MotivoSinFuente;
}

/** Por qué no hay datos externos. Se muestra tal cual al usuario. */
export type MotivoSinFuente = 'sin_configurar' | 'fuente_fallo' | 'sin_resultados';

// ─── Competencia ─────────────────────────────────────────────────────────────

export interface Competidor {
  ranking: number;
  nombre: string;
  url: string;
  ubicacion: string;
  distancia_km: number | null;
  precio_minimo: number;
  precio_maximo: number;
  precio_promedio: number;
  rating: number;
  numero_resenas: number;
  fortalezas: string[];
  debilidades: string[];
  tiempo_en_mercado: string;
  fuente: string;
}

export interface CompetenciaResult {
  total_competidores: number;
  competidores: Competidor[];
  gap_detectado: string | null;
  precio_mercado_promedio: number;
  es_mock: boolean;
  /** Censo del instituto de estadística del país (INEGI/DENUE en MX). Cuando
   *  está disponible, `total_competidores` viene de aquí y NO de la muestra web.
   *  Presente incluso cuando `disponible: false`: la ausencia de fuente oficial
   *  es un dato declarado, no un hueco. */
  censo_oficial?: CensoOficialResult;
  /** Conteo que devolvieron las fuentes web, preservado para trazabilidad
   *  cuando el censo oficial lo desplaza. */
  total_competidores_web?: number;
  /** Se emite cuando la muestra web es muy inferior al censo oficial: evita
   *  leer "pocos resultados en Google" como "mercado sin competencia". */
  advertencia_muestra?: string;
  /**
   * false = ninguna fuente devolvió competencia (sin clave, la fuente falló o
   * no hubo resultados). `competidores` va vacío y los factores que dependen de
   * ella no puntúan: cero competidores encontrados NO es cero competidores.
   */
  fuente_disponible: boolean;
  motivo_sin_fuente?: MotivoSinFuente;
}

// ─── Viabilidad ──────────────────────────────────────────────────────────────

export interface ViabilidadFactores {
  tendencia: number;
  competencia: number;
  margen: number;
  demanda: number;
  oportunidad: number;
  precio_relativo: number; // NUEVO: tu precio vs mercado
  // Solo presente si la densidad es evaluable (hay área o radio de la zona).
  // Ausente ≠ 0: significa "no medido", y entonces no entra en el score.
  densidad?: number;
}

export type ViabilidadEstado =
  | 'MUY_VIABLE'
  | 'VIABLE'
  | 'MODERADO'
  | 'POCO_VIABLE'
  | 'NO_RECOMENDADO';

export interface ViabilidadResult {
  score: number;
  estado: ViabilidadEstado;
  factores: ViabilidadFactores;
  factores_positivos: string[];
  factores_negativos: string[];
  confianza: 'alta' | 'media' | 'baja'; // NUEVO: indica si los datos son reales o estimados
  /**
   * Proporción del peso del modelo que sí se pudo evaluar (0-1). Con 0.35, el
   * score salió de un tercio de las señales y la pantalla debe decirlo en vez
   * de presentar un número redondo como si fuera un diagnóstico completo.
   */
  cobertura_datos: number;
}

// ─── Densidad de competencia por km² ────────────────────────────────────────

export interface DensidadZonaResult {
  /** `false` cuando no hay área conocida: el factor no entra en el score. */
  es_evaluable: boolean;
  score: number | null;
  competidores_km2: number | null;
  area_km2: number | null;
  origen_area: 'area_declarada' | 'radio' | null;
  distancia_media_km: number | null;
  interpretacion: 'virgen' | 'holgada' | 'normal' | 'disputada' | 'saturada' | 'no_evaluable';
  mensaje: string;
  confianza: 'alta' | 'media' | 'baja';
}

// ─── DAFO ────────────────────────────────────────────────────────────────────

export interface DafoItem {
  titulo: string;
  descripcion: string;
  impacto?: string;
  probabilidad?: string;
  potencial?: string;
  mitigacion?: string;
  apalancamiento?: string;
  accion?: string;
}

export interface DafoResult {
  debilidades: DafoItem[];
  amenazas: DafoItem[];
  fortalezas: DafoItem[];
  oportunidades: DafoItem[];
  es_mock: boolean;
}

// ─── TAM ─────────────────────────────────────────────────────────────────────

export interface TamEscenario {
  penetracion: number;
  mercado_anual: number;
  mercado_mensual: number;
  unidades_mes: number;
  ganancia_mes: number;
}

export interface MesEstacional {
  mes: string;
  factor: number; // 1.0 = normal, 1.5 = +50%, 0.7 = -30%
  razon: string;
}

export interface TamResult {
  scope: string;
  pais: string;       // ISO code, e.g. 'MX', 'CO'
  moneda: string;     // e.g. 'MXN', 'COP', 'ARS'
  ubicacion: string;
  tam_minimo: number;
  tam_maximo: number;
  tam_promedio: number;
  tam_escenarios: {
    pesimista: TamEscenario;
    realista: TamEscenario;
    optimista: TamEscenario;
  };
  nse_aplicado?: string;
  pct_mercado_nse?: number;
  estacionalidad?: MesEstacional[];
  /**
   * De qué está hecho el número. Los tres escenarios son penetraciones
   * SUPUESTAS sobre población (0,1 / 0,25 / 0,5 %), no una medición de mercado:
   * la pantalla tiene que poder decirlo, y las advertencias explican qué no se
   * pudo aplicar en este país (NSE, estacionalidad) o a esta escala.
   */
  supuestos: {
    penetracion_pct: { pesimista: number; realista: number; optimista: number };
    poblacion_base: number;
    advertencias: string[];
  };
}

// ─── Alertas ─────────────────────────────────────────────────────────────────

export interface Alerta {
  nivel: 'verde' | 'amarillo' | 'rojo';
  tipo: string;
  mensaje: string;
}

// ─── ROI / Payback ───────────────────────────────────────────────────────────

export interface PaybackResult {
  // Escenario basado en TAM realista
  meses_payback_realista: number | null;   // null = no aplica (sin inversión o negativo)
  meses_payback_optimista: number | null;
  // Ganancia = mercado del escenario × margen (el margen YA está aplicado).
  // No es facturación: no multiplicar de nuevo por el margen al consumirla.
  ganancia_mensual_realista: number;
  ganancia_mensual_optimista: number;
  ganancia_mensual_real?: number;          // Solo si Negocio en Marcha
  meses_payback_real?: number | null;      // Solo si Negocio en Marcha
  utilidad_neta_mensual_realista: number;  // Ganancia menos costos fijos
  ltv_estimado?: number;                   // Solo si hay tasa de repetición
  nota: string;                            // Contexto narrativo del cálculo
}