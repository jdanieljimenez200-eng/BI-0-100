// ─── Router de la cascada de procedencia ──────────────────────────────────────
// Orden real, y por qué NO es "oficial reemplaza a Google":
//
//   1. Instituto nacional (censo de establecimientos)  → CONTEO y TAMAÑO
//   2. Banco Mundial (macro, sin clave, 18 países)     → POBLACIÓN y PODER DE COMPRA
//   3. Google / MercadoLibre (web)                     → PRECIOS, RATING, RESEÑAS
//   4. Benchmark de sector / mock determinista         → último recurso
//
// Los niveles 1 y 2 no pueden sustituir al 3 porque ningún instituto publica
// precios ni reseñas. La cascada es POR CAMPO, no por competidor.
//
// Esta función NUNCA lanza: si la fuente oficial falla, devuelve un censo
// declarado como no disponible y el análisis de Mercado continúa igual.

import type { DatosOficialesResult, CensoOficialResult } from './types';
import { getInstituto } from './institutos';
import { buscarDenuePorEntidad, buscarDenuePorRadio, isDenueAvailable } from './denueService';
import { obtenerMacroOficial } from './bancoMundialService';

export interface ConsultaOficialInput {
  pais: string;
  scope: 'local' | 'nacional';
  /** Término de búsqueda (nombre + categoría del producto). */
  actividad: string;
  estado?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  radioKm?: number | null;
}

function sinCensoOficial(pais: string, motivo: string): CensoOficialResult {
  return {
    disponible: false,
    fuente: 'sin_fuente_oficial',
    instituto: getInstituto(pais).siglas,
    pais,
    cobertura: null,
    total_establecimientos: null,
    radio_m: null,
    establecimientos: [],
    distribucion_estrato: {},
    nota: motivo,
    consultado_en: new Date().toISOString(),
  };
}

async function obtenerCenso(input: ConsultaOficialInput): Promise<CensoOficialResult> {
  const instituto = getInstituto(input.pais);

  if (instituto.capacidad !== 'directorio') {
    return sinCensoOficial(
      input.pais,
      `${instituto.siglas} (${instituto.nombre}) es la autoridad estadística de este país, pero no expone ` +
      `un directorio de establecimientos consultable por API. ${instituto.nota} ` +
      'El conteo de competidores proviene de fuentes web y debe presentarse como muestra, no como censo.',
    );
  }

  if (!isDenueAvailable()) {
    return sinCensoOficial(
      input.pais,
      `${instituto.siglas} tiene censo consultable (DENUE) pero falta el token de acceso: fuente desactivada.`,
    );
  }

  const lat = Number(input.latitud);
  const lon = Number(input.longitud);
  const radioKm = Number(input.radioKm);
  const puedeRadio =
    input.scope === 'local' &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    Number.isFinite(radioKm) && radioKm > 0;

  try {
    if (puedeRadio) {
      return await buscarDenuePorRadio(input.actividad, lat, lon, radioKm * 1000);
    }
    return await buscarDenuePorEntidad(input.actividad, input.estado ?? null);
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.warn('DENUE falló, el análisis continúa sin censo oficial:', detalle);
    return sinCensoOficial(input.pais, `Consulta al DENUE fallida (${detalle}).`);
  }
}

/** Censo + macro en paralelo. Devuelve siempre un objeto completo. */
export async function obtenerDatosOficiales(
  input: ConsultaOficialInput,
): Promise<DatosOficialesResult> {
  const instituto = getInstituto(input.pais);
  const [censo, macro] = await Promise.all([
    obtenerCenso(input),
    obtenerMacroOficial(input.pais).catch(() => ({
      disponible: false as const,
      fuente: 'sin_fuente' as const,
      pais: input.pais,
      indicadores: {},
      nota: 'Banco Mundial no respondió en esta consulta.',
      consultado_en: new Date().toISOString(),
    })),
  ]);

  const procedencia: string[] = [];
  if (censo.disponible) procedencia.push(`${censo.instituto}_censo_oficial`);
  if (macro.disponible) procedencia.push('banco_mundial_oficial');
  procedencia.push('web_google_marketplaces');

  return { pais: input.pais, instituto, censo, macro, procedencia };
}