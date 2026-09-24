import { TendenciasResult, DatoMensual, MotivoSinFuente } from './types';
import { getPaisInfo } from '../../utils/latam';
import { logger } from '../../utils/logger';

// ─── Helpers de localización ─────────────────────────────────────────────────

/** Normaliza a código ISO-3166 alpha-2 en mayúsculas; default 'MX'. */
function codigoPais(pais?: string | null): string {
  const code = (pais ?? 'MX').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : 'MX';
}

function etiquetaUbicacion(
  scope: string,
  pais?: string | null,
  region?: string | null
): string {
  const nombrePais = getPaisInfo(pais).nombre;
  if (scope === 'nacional') return nombrePais;
  return region ? `${region}, ${nombrePais}` : `Local (${nombrePais})`;
}

/** Locale solo para nombres de mes en la serie de 12 meses. */
function localeMeses(pais?: string | null): string {
  return codigoPais(pais) === 'BR' ? 'pt-BR' : 'es-MX';
}

// ─── Sin fuente de tendencias ────────────────────────────────────────────────

/**
 * Hueco declarado, no relleno.
 *
 * Antes esta función devolvía una serie de 12 meses, una proyección a 6, un
 * crecimiento y un volumen de búsquedas («1 847 búsquedas/mes») derivados de un
 * hash del nombre del producto. La pantalla lo pintaba como una gráfica de
 * demanda real y el score de viabilidad lo puntuaba.
 */
function tendenciasNoDisponibles(
  palabraClave: string,
  scope: string,
  pais?: string | null,
  region?: string | null,
  motivo: MotivoSinFuente = 'sin_configurar'
): TendenciasResult {
  return {
    palabra_clave: palabraClave,
    ubicacion: etiquetaUbicacion(scope, pais, region),
    volumen_busquedas_mensual: 0,
    datos_12_meses: [],
    proyeccion_6_meses: [],
    crecimiento_porcentaje: 0,
    crecimiento_descripcion: 'Sin datos de búsquedas para este mercado',
    picos_estacionales: {},
    tendencia: 'ESTABLE',
    es_mock: true,
    fuente_disponible: false,
    motivo_sin_fuente: motivo,
  };
}

// ─── SerpAPI real ─────────────────────────────────────────────────────────────

async function serpApiTendencias(
  palabraClave: string,
  scope: string,
  pais?: string | null,
  region?: string | null
): Promise<TendenciasResult> {
  // Google Trends acepta subregiones (p. ej. 'MX-OAX'), pero no existe un mapa
  // fiable región→ISO-3166-2 para toda LATAM en este proyecto. Consultamos a
  // nivel país y reflejamos la región solo en la etiqueta de ubicación, en vez
  // de asumir un estado fijo.
  const geo = codigoPais(pais);
  const url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(palabraClave)}&geo=${geo}&date=today+12-m&data_type=TIMESERIES&api_key=${process.env.SERPAPI_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI error: ${res.status}`);
  const data = await res.json() as {
    interest_over_time?: { timeline_data?: { date: string; values: { extracted_value: number }[] }[] };
  };

  const timeline = data.interest_over_time?.timeline_data ?? [];
  const valores = timeline.map(t => t.values[0]?.extracted_value ?? 0);
  const promedio = valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length * 15) : 1000;

  const datos12: DatoMensual[] = timeline.slice(-12).map(t => ({
    mes: t.date,
    volumen: Math.round((t.values[0]?.extracted_value ?? 0) * 15),
  }));

  const primeros3 = valores.slice(0, 3).reduce((a, b) => a + b, 0) / 3 || 1;
  const ultimos3  = valores.slice(-3).reduce((a, b) => a + b, 0) / 3 || 1;
  const crecimiento = Math.round(((ultimos3 - primeros3) / primeros3) * 100);

  const proyeccion6 = Array.from({ length: 6 }, (_, i) =>
    Math.round(promedio * (1 + (crecimiento / 100) * ((i + 1) / 6)))
  );

  return {
    palabra_clave: palabraClave,
    ubicacion: etiquetaUbicacion(scope, pais, region),
    volumen_busquedas_mensual: promedio,
    datos_12_meses: datos12,
    proyeccion_6_meses: proyeccion6,
    crecimiento_porcentaje: crecimiento,
    crecimiento_descripcion: `${crecimiento > 0 ? '+' : ''}${crecimiento}% vs hace 1 año`,
    picos_estacionales: {},
    tendencia: crecimiento >= 5 ? 'CRECIENTE' : crecimiento >= -5 ? 'ESTABLE' : 'DECRECIENTE',
    es_mock: false,
    fuente_disponible: true,
  };
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function obtenerTendencias(
  palabraClave: string,
  scope: 'local' | 'nacional',
  pais?: string | null,
  region?: string | null
): Promise<TendenciasResult> {
  if (!process.env.SERPAPI_KEY) {
    return tendenciasNoDisponibles(palabraClave, scope, pais, region, 'sin_configurar');
  }
  try {
    return await serpApiTendencias(palabraClave, scope, pais, region);
  } catch (err) {
    logger.warn('[mercado] SerpAPI trends falló:', err);
    return tendenciasNoDisponibles(palabraClave, scope, pais, region, 'fuente_fallo');
  }
}