import { TendenciasResult, DatoMensual } from './types';
import { getPaisInfo } from '../../utils/latam';

// ─── Utilidad: hash determinista ─────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

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

// ─── Mock determinista por palabra clave ─────────────────────────────────────

function mockTendencias(
  palabraClave: string,
  scope: string,
  pais?: string | null,
  region?: string | null
): TendenciasResult {
  const seed = hashStr(palabraClave);
  const base = 500 + (seed % 3000);
  const crecimiento = -5 + (seed % 40); // -5% a +35%
  const ubicacion = etiquetaUbicacion(scope, pais, region);
  const locale = localeMeses(pais);

  const ahora = new Date();
  const datos12: DatoMensual[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const nombre = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const variacion = 1 + (((seed + i * 7) % 30) - 15) / 100;
    datos12.push({ mes: nombre, volumen: Math.round(base * variacion) });
  }

  const proyeccion6 = Array.from({ length: 6 }, (_, i) =>
    Math.round(base * (1 + (crecimiento / 100) * ((i + 1) / 6)))
  );

  const picos: Record<string, string> = {};
  if ((seed % 3) === 0) picos['Diciembre'] = '+35%';
  if ((seed % 5) === 0) picos['Enero'] = '-20%';

  return {
    palabra_clave: palabraClave,
    ubicacion,
    volumen_busquedas_mensual: base,
    datos_12_meses: datos12,
    proyeccion_6_meses: proyeccion6,
    crecimiento_porcentaje: crecimiento,
    crecimiento_descripcion: `${crecimiento > 0 ? '+' : ''}${crecimiento}% vs hace 1 año`,
    picos_estacionales: picos,
    tendencia: crecimiento >= 5 ? 'CRECIENTE' : crecimiento >= -5 ? 'ESTABLE' : 'DECRECIENTE',
    es_mock: true,
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
    return mockTendencias(palabraClave, scope, pais, region);
  }
  try {
    return await serpApiTendencias(palabraClave, scope, pais, region);
  } catch (err) {
    console.warn('SerpAPI trends falló, usando mock:', err);
    return mockTendencias(palabraClave, scope, pais, region);
  }
}