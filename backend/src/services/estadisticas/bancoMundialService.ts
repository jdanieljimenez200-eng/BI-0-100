// ─── Banco Mundial ────────────────────────────────────────────────────────────
// Nivel 1 universal: es la única fuente oficial con API abierta, SIN clave y
// con la misma firma para los 18 países de PAIS_LATAM. Sirve de suelo
// cuantitativo cuando el país no tiene directorio de establecimientos.
//
// `mrnev=1` (most recent non-empty value) evita el caso clásico de pedir el
// último año y recibir `null` porque el dato aún no se publicó.

import type { IndicadorMacro, MacroOficialResult } from './types';
import { fetchJsonConTimeout } from './http';

const BM_BASE = 'https://api.worldbank.org/v2/country';

/** Indicadores que alimentan TAM, poder de compra y contexto de precios. */
export const INDICADORES_BM: Record<string, string> = {
  'SP.POP.TOTL':        'Población total',
  'NY.GDP.PCAP.CD':     'PIB per cápita (US$ corrientes)',
  'FP.CPI.TOTL.ZG':     'Inflación anual, precios al consumidor (%)',
  'SP.URB.TOTL.IN.ZS':  'Población urbana (% del total)',
  'NE.CON.PRVT.PC.KD':  'Consumo de los hogares per cápita (US$ 2015)',
};

/** Puro y exportado: los unit tests validan el parseo sin tocar la red. */
export function parseIndicadorBancoMundial(
  codigo: string,
  nombreFallback: string,
  payload: unknown,
): IndicadorMacro | null {
  if (!Array.isArray(payload) || payload.length < 2) return null;
  const filas = payload[1];
  if (!Array.isArray(filas) || filas.length === 0) return null;

  const fila = filas[0] as {
    value?: number | null;
    date?: string | number;
    unit?: string;
    indicator?: { value?: string };
  } | null;

  if (fila == null) return null;
  const valor = typeof fila.value === 'number' ? fila.value : NaN;
  if (!Number.isFinite(valor)) return null;

  const unidad = typeof fila.unit === 'string' && fila.unit.trim().length > 0 ? fila.unit.trim() : null;

  return {
    codigo,
    nombre: fila.indicator?.value?.trim() || nombreFallback,
    valor,
    anio: String(fila.date ?? '').trim(),
    unidad,
  };
}

/** Nunca lanza: un indicador que falla simplemente no aparece en el resultado. */
export async function obtenerMacroOficial(pais?: string | null): Promise<MacroOficialResult> {
  const codigo = (pais ?? 'MX').trim().toUpperCase();
  const iso = /^[A-Z]{2,3}$/.test(codigo) ? codigo : 'MX';
  const consultadoEn = new Date().toISOString();

  const entradas = Object.entries(INDICADORES_BM);
  const resultados = await Promise.all(
    entradas.map(async ([cod, nombre]) => {
      try {
        const payload = await fetchJsonConTimeout<unknown>(
          `${BM_BASE}/${iso}/indicator/${cod}?format=json&mrnev=1`,
        );
        return parseIndicadorBancoMundial(cod, nombre, payload);
      } catch (err) {
        console.warn(`Banco Mundial ${iso}/${cod} falló:`, err);
        return null;
      }
    }),
  );

  const indicadores = resultados.reduce<Record<string, IndicadorMacro>>((acc, ind) => {
    if (ind) acc[ind.codigo] = ind;
    return acc;
  }, {});

  const total = Object.keys(indicadores).length;
  if (total === 0) {
    return {
      disponible: false,
      fuente: 'sin_fuente',
      pais: iso,
      indicadores: {},
      nota: 'Banco Mundial no devolvió ningún indicador para este país en esta consulta.',
      consultado_en: consultadoEn,
    };
  }

  return {
    disponible: true,
    fuente: 'banco_mundial',
    pais: iso,
    indicadores,
    nota:
      `Indicadores oficiales del Banco Mundial (${total}/${entradas.length} disponibles), ` +
      'valor más reciente no vacío por indicador. Cada uno lleva su año: cítalo, no lo presentes como dato de hoy.',
    consultado_en: consultadoEn,
  };
}