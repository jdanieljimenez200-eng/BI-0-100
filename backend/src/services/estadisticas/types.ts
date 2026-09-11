// ─── Fuentes estadísticas oficiales ──────────────────────────────────────────
// Capa de datos verificables que alimenta al módulo de Mercado. La regla que
// gobierna todo este directorio: cada cifra viaja con su procedencia pegada.
// Un dato de censo oficial y una estimación del LLM NUNCA comparten campo.

/** Qué se puede consultar por API en el instituto de cada país.
 *  - `directorio`  → hay API de establecimientos consultable (censo de negocios).
 *  - `solo_macro`  → hay API abierta, pero de series estadísticas, no de negocios.
 *  - `sin_api`     → el instituto publica datos, pero sin API REST pública.
 *  La ausencia de fuente es un dato DECLARADO, no un hueco silencioso. */
export type CapacidadInstituto = 'directorio' | 'solo_macro' | 'sin_api';

export interface InstitutoEstadistico {
  pais: string;              // ISO-2, mismas claves que PAIS_LATAM en utils/latam
  siglas: string;            // 'INEGI', 'DANE', 'IBGE', ...
  nombre: string;
  url: string;
  capacidad: CapacidadInstituto;
  /** Raíz de la API cuando existe. `null` si el instituto no expone API REST. */
  api_url: string | null;
  requiere_token: boolean;
  /** Qué se puede y qué NO se puede pedir a esta fuente. Se inyecta al prompt. */
  nota: string;
}

// ─── Censo de establecimientos (nivel 1 de la cascada) ───────────────────────

export interface EstablecimientoOficial {
  nombre: string;
  razon_social: string | null;
  clase_actividad: string;
  /** Personal ocupado en rangos, tal como lo publica la fuente
   *  (p. ej. "0 a 5 personas"). Único dato duro de TAMAÑO del competidor. */
  estrato_personal: string | null;
  cp: string | null;
  ubicacion: string | null;
  telefono: string | null;
  sitio_web: string | null;
  latitud: number | null;
  longitud: number | null;
  /** Calculada por haversine solo si hay origen y coordenadas del registro. */
  distancia_km: number | null;
  /** Fecha de alta en el registro oficial. Proxy de antigüedad real. */
  antiguedad: string | null;
}

export type CoberturaCenso = 'radio' | 'entidad' | 'nacional';

export interface CensoOficialResult {
  /** `false` = no hubo fuente oficial consultable. El análisis sigue igual. */
  disponible: boolean;
  /** Identificador de procedencia, p. ej. 'denue_inegi'. */
  fuente: string;
  instituto: string;
  pais: string;
  cobertura: CoberturaCenso | null;
  /** Conteo real de establecimientos. `null` cuando no hay fuente. */
  total_establecimientos: number | null;
  radio_m: number | null;
  establecimientos: EstablecimientoOficial[];
  /** Reparto por estrato de personal ocupado: { "0 a 5 personas": 12, ... } */
  distribucion_estrato: Record<string, number>;
  /** Explica qué mide este censo y qué NO trae (precios, ratings, reseñas). */
  nota: string;
  consultado_en: string;   // ISO 8601
}

// ─── Indicadores macro (suelo universal para los 18 países) ──────────────────

export interface IndicadorMacro {
  codigo: string;
  nombre: string;
  valor: number;
  anio: string;
  unidad: string | null;
}

export interface MacroOficialResult {
  disponible: boolean;
  fuente: 'banco_mundial' | 'sin_fuente';
  pais: string;
  /** Indexado por código de indicador. Solo entran valores numéricos reales. */
  indicadores: Record<string, IndicadorMacro>;
  nota: string;
  consultado_en: string;
}

// ─── Resultado combinado que consume el módulo de Mercado ────────────────────

export interface DatosOficialesResult {
  pais: string;
  instituto: InstitutoEstadistico;
  censo: CensoOficialResult;
  macro: MacroOficialResult;
  /** Cascada efectivamente aplicada, en orden de prioridad real. */
  procedencia: string[];
}