/**
 * precioM2Service.ts
 * Precio de renta mensual por m². NO existe tabla hardcodeada de precios de
 * mercado: inventar cifras de renta sería el mismo error que el `|| 100` que ya
 * eliminamos. Las únicas fuentes admitidas son, en orden de prioridad:
 *
 *   1. `precio_m2_mes_declarado` — el usuario cotizó o firmó (confianza alta).
 *   2. `ZONA_PRECIOS_API_URL` — servicio externo consultable (misma degradación
 *      elegante que SerpAPI en googleLocalService: si falla, se cae al paso 3).
 *   3. `ZONA_PRECIOS_M2_JSON` — tabla que el operador de la plataforma carga con
 *      SUS propias cifras, versionada por env, no por código.
 *
 * Si no hay ninguna, devuelve `precio_m2_mes: null` con `es_mock: true`. Aguas
 * abajo eso significa "no hay renta derivable", nunca un número inventado.
 */

import { PrecioM2Consulta, PrecioM2Result } from './types';
import { NivelConfianza } from '../../utils/confianza';
import { redondearA } from '../../utils/curvas';

const TIMEOUT_MS = 8000;
const PRECIO_M2_MAXIMO = 1_000_000;

interface TablaEntrada {
  precio_m2_mes: number;
  moneda?: string;
}

let cacheRaw: string | null = null;
let cacheTabla: Record<string, TablaEntrada> = {};

function normalizarParte(valor?: string): string {
  return (valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function esPrecioUtil(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 && valor <= PRECIO_M2_MAXIMO;
}

/** Etiqueta legible de la zona consultada, sin inventar ubicaciones. */
export function etiquetaZona(consulta: PrecioM2Consulta): string {
  const partes = [consulta.zona, consulta.estado, consulta.pais].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  return partes.length > 0 ? partes.map((p) => p.trim()).join(', ') : 'sin ubicación declarada';
}

/**
 * Tabla del operador. Formato admitido en ZONA_PRECIOS_M2_JSON:
 *   { "MX|CDMX|Polanco": 1450, "MX|Jalisco": { "precio_m2_mes": 620, "moneda": "MXN" } }
 * Se relee cuando cambia el valor de la variable (los tests la modifican).
 */
function cargarTabla(): Record<string, TablaEntrada> {
  const raw = process.env.ZONA_PRECIOS_M2_JSON ?? '';
  if (raw === cacheRaw) return cacheTabla;

  cacheRaw = raw;
  cacheTabla = {};
  if (!raw.trim()) return cacheTabla;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    for (const [clave, valor] of Object.entries(parsed ?? {})) {
      const partes = clave.split('|').map(normalizarParte).filter((p) => p.length > 0);
      if (partes.length === 0) continue;

      if (esPrecioUtil(valor)) {
        cacheTabla[partes.join('|')] = { precio_m2_mes: valor };
        continue;
      }
      if (valor && typeof valor === 'object') {
        const entrada = valor as { precio_m2_mes?: unknown; moneda?: unknown };
        if (esPrecioUtil(entrada.precio_m2_mes)) {
          cacheTabla[partes.join('|')] = {
            precio_m2_mes: entrada.precio_m2_mes,
            moneda: typeof entrada.moneda === 'string' ? entrada.moneda : undefined,
          };
        }
      }
    }
  } catch (err) {
    console.warn('ZONA_PRECIOS_M2_JSON no es JSON válido; se ignora la tabla de precios por m²:', err);
    cacheTabla = {};
  }
  return cacheTabla;
}

function buscarEnTabla(
  consulta: PrecioM2Consulta,
): { entrada: TablaEntrada; especificidad: string } | null {
  const tabla = cargarTabla();
  if (Object.keys(tabla).length === 0) return null;

  const pais = normalizarParte(consulta.pais);
  const estado = normalizarParte(consulta.estado);
  const zona = normalizarParte(consulta.zona);

  const candidatos: { clave: string[]; especificidad: string }[] = [
    { clave: [pais, estado, zona], especificidad: 'zona' },
    { clave: [pais, estado], especificidad: 'estado' },
    { clave: [pais], especificidad: 'país' },
  ];

  for (const { clave, especificidad } of candidatos) {
    const partes = clave.filter((p) => p.length > 0);
    if (partes.length !== clave.length) continue;
    const entrada = tabla[partes.join('|')];
    if (entrada) return { entrada, especificidad };
  }
  return null;
}

async function consultarApiExterna(consulta: PrecioM2Consulta): Promise<PrecioM2Result | null> {
  const base = process.env.ZONA_PRECIOS_API_URL;
  if (!base) return null;

  const url = new URL(base);
  if (consulta.pais)   url.searchParams.set('pais', consulta.pais);
  if (consulta.estado) url.searchParams.set('estado', consulta.estado);
  if (consulta.zona)   url.searchParams.set('zona', consulta.zona);

  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = process.env.ZONA_PRECIOS_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`ZONA_PRECIOS_API error: ${res.status}`);

    const data = (await res.json()) as { precio_m2_mes?: unknown; moneda?: unknown; n_muestras?: unknown };
    if (!esPrecioUtil(data?.precio_m2_mes)) throw new Error('respuesta sin precio_m2_mes utilizable');

    const muestras =
      typeof data.n_muestras === 'number' && Number.isFinite(data.n_muestras) ? data.n_muestras : 0;
    // Con pocas muestras el dato es real pero frágil: se reporta como media.
    const nivel_confianza: NivelConfianza = muestras >= 5 ? 'alta' : 'media';
    const zona_consultada = etiquetaZona(consulta);

    return {
      precio_m2_mes: redondearA(data.precio_m2_mes, 2),
      moneda: typeof data.moneda === 'string' ? data.moneda : (consulta.moneda ?? null),
      zona_consultada,
      fuente: 'api_externa',
      es_mock: false,
      nivel_confianza,
      nota: muestras > 0
        ? `Precio por m² de ${zona_consultada} según el servicio externo (${muestras} muestras).`
        : `Precio por m² de ${zona_consultada} según el servicio externo.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function obtenerPrecioM2(consulta: PrecioM2Consulta): Promise<PrecioM2Result> {
  const zona_consultada = etiquetaZona(consulta);

  // 1. Declarado por el usuario: nada le gana en fiabilidad.
  if (esPrecioUtil(consulta.precio_m2_mes_declarado)) {
    return {
      precio_m2_mes: redondearA(consulta.precio_m2_mes_declarado, 2),
      moneda: consulta.moneda ?? null,
      zona_consultada,
      fuente: 'declarado',
      es_mock: false,
      nivel_confianza: 'alta',
      nota: 'Precio por m² declarado por ti (cotización o contrato).',
    };
  }

  // 2. Servicio externo, si está configurado.
  try {
    const externo = await consultarApiExterna(consulta);
    if (externo) return externo;
  } catch (err) {
    console.warn('Consulta de precio por m² al servicio externo falló, se intenta la tabla del operador:', err);
  }

  // 3. Tabla cargada por el operador vía env.
  const enTabla = buscarEnTabla(consulta);
  if (enTabla) {
    return {
      precio_m2_mes: redondearA(enTabla.entrada.precio_m2_mes, 2),
      moneda: enTabla.entrada.moneda ?? consulta.moneda ?? null,
      zona_consultada,
      fuente: 'tabla_operador',
      es_mock: false,
      // Referencia curada a nivel de país/estado/zona, no una cotización real
      // de tu local: media, nunca alta.
      nivel_confianza: 'media',
      nota: `Referencia de renta por m² a nivel de ${enTabla.especificidad} (tabla de la plataforma).`,
    };
  }

  // 4. Sin fuente: no se inventa un precio.
  return {
    precio_m2_mes: null,
    moneda: consulta.moneda ?? null,
    zona_consultada,
    fuente: 'sin_fuente',
    es_mock: true,
    nivel_confianza: 'baja',
    nota: `No hay fuente de precio por m² para ${zona_consultada}. Declara el precio que te cotizaron para poder derivar la renta.`,
  };
}

/** Para tests: limpia la caché de la tabla del operador. */
export function resetCachePrecioM2(): void {
  cacheRaw = null;
  cacheTabla = {};
}