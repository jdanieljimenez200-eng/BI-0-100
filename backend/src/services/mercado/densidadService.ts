/**
 * densidadService.ts
 * Lectura 3 de las tres: densidad de competencia por km² de la zona. Responde a
 * algo que `total_competidores` por sí solo no puede: 8 competidores en 2 km² es
 * una zona saturada; los mismos 8 en 300 km² es un mercado despoblado.
 *
 * Solo es evaluable si el área es conocida (radio declarado por el usuario en el
 * formulario de Mercado, o área explícita). Sin área NO se asume ninguna: se
 * devuelve `es_evaluable: false` y el factor no entra en el score de viabilidad.
 */

import { CompetenciaResult, DensidadZonaResult } from './types';
import { clamp, interpolarCurva, redondearA } from '../../utils/curvas';
import { combinarConfianza, NivelConfianza } from '../../utils/confianza';

export interface DensidadZonaOpciones {
  /** Radio de búsqueda en km (MercadoAnalisisInput.radioKm). */
  radio_km?: number;
  /** Área exacta de la zona en km², si se conoce. Tiene prioridad sobre el radio. */
  area_km2?: number;
  scope?: 'local' | 'nacional';
}

/**
 * Competidores por km² → puntos. Anclas y su criterio de negocio:
 *  · ≤0.05 → zona prácticamente virgen para esta categoría.
 *  ·  0.5  → hay competencia pero queda hueco geográfico claro.
 *  ·  1.0  → un competidor por km²: presión normal de barrio.
 *  ·  2–4  → zona comercial disputada; el coste de captar cliente sube.
 *  ·  ≥8   → saturación: la diferenciación deja de ser opcional.
 * Se aplana en los extremos para que un radio diminuto no produzca scores absurdos.
 */
const CURVA_DENSIDAD: ReadonlyArray<readonly [number, number]> = [
  [0.05, 96],
  [0.20, 90],
  [0.50, 84],
  [1.00, 75],
  [2.00, 62],
  [4.00, 46],
  [8.00, 28],
  [15.00, 12],
  [30.00, 6],
];

/** Ajuste por cercanía: la misma densidad pesa más si los tienes encima. */
const DISTANCIA_LEJOS_KM = 5;
const DISTANCIA_CERCA_KM = 1;
const AJUSTE_DISTANCIA = 5;

/** Umbrales de lectura cualitativa, en competidores/km². */
const UMBRAL_VIRGEN = 0.2;
const UMBRAL_HOLGADA = 0.8;
const UMBRAL_NORMAL = 2;
const UMBRAL_DISPUTADA = 5;

const AREA_MAXIMA_KM2 = 25_000_000;

type OrigenArea = 'area_declarada' | 'radio';

function resolverArea(
  opciones: DensidadZonaOpciones,
): { area: number; origen: OrigenArea } | null {
  const { area_km2, radio_km } = opciones;

  if (typeof area_km2 === 'number' && Number.isFinite(area_km2) && area_km2 > 0) {
    return { area: redondearA(Math.min(area_km2, AREA_MAXIMA_KM2), 2), origen: 'area_declarada' };
  }

  // A escala nacional un radio no describe el área real del mercado; exigimos
  // área explícita en vez de inventar la superficie del país.
  if (opciones.scope === 'nacional') return null;

  if (typeof radio_km === 'number' && Number.isFinite(radio_km) && radio_km > 0) {
    const area = Math.PI * radio_km * radio_km;
    return { area: redondearA(Math.min(area, AREA_MAXIMA_KM2), 2), origen: 'radio' };
  }
  return null;
}

function distanciaMedia(competencia: CompetenciaResult): number | null {
  const distancias = (competencia.competidores ?? [])
    .map((c) => c.distancia_km)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d >= 0);

  if (distancias.length === 0) return null;
  return redondearA(distancias.reduce((a, b) => a + b, 0) / distancias.length, 2);
}

function interpretar(densidad: number): Exclude<DensidadZonaResult['interpretacion'], 'no_evaluable'> {
  if (densidad <= UMBRAL_VIRGEN) return 'virgen';
  if (densidad <= UMBRAL_HOLGADA) return 'holgada';
  if (densidad <= UMBRAL_NORMAL) return 'normal';
  if (densidad <= UMBRAL_DISPUTADA) return 'disputada';
  return 'saturada';
}

function mensajeDe(
  interpretacion: Exclude<DensidadZonaResult['interpretacion'], 'no_evaluable'>,
  densidad: number,
  area: number,
  total: number,
): string {
  const cifra = `${total} ${total === 1 ? 'competidor' : 'competidores'} en ${area} km² (${densidad} por km²)`;
  switch (interpretacion) {
    case 'virgen':
      return `${cifra}: zona sin ocupar para esta categoría. La pregunta deja de ser la competencia y pasa a ser si hay demanda suficiente en el área.`;
    case 'holgada':
      return `${cifra}: hay competencia pero queda hueco geográfico; una buena ubicación todavía captura zona propia.`;
    case 'normal':
      return `${cifra}: presión de competencia normal para una zona comercial de barrio.`;
    case 'disputada':
      return `${cifra}: zona disputada. Captar cliente cuesta más y el precio se compara al lado.`;
    case 'saturada':
      return `${cifra}: zona saturada. Sin una diferenciación clara, entrar aquí es competir por precio.`;
  }
}

const NO_EVALUABLE_NACIONAL =
  'A escala nacional el radio de búsqueda no describe el área del mercado. Declara el área en km² para medir densidad.';
const NO_EVALUABLE_SIN_AREA =
  'No se declaró radio ni área de la zona, así que no se puede calcular densidad por km² (no se asume un área por defecto).';

export function calcularDensidadZona(
  competencia: CompetenciaResult,
  opciones: DensidadZonaOpciones = {},
): DensidadZonaResult {
  const resuelta = resolverArea(opciones);

  if (resuelta === null) {
    return {
      es_evaluable: false,
      score: null,
      competidores_km2: null,
      area_km2: null,
      origen_area: null,
      distancia_media_km: distanciaMedia(competencia),
      interpretacion: 'no_evaluable',
      mensaje: opciones.scope === 'nacional' ? NO_EVALUABLE_NACIONAL : NO_EVALUABLE_SIN_AREA,
      confianza: 'baja',
    };
  }

  const { area, origen } = resuelta;
  const total = Number.isFinite(competencia.total_competidores)
    ? Math.max(competencia.total_competidores, 0)
    : 0;

  const densidad = redondearA(total / area, 3);
  const distancia = distanciaMedia(competencia);

  let score = interpolarCurva(densidad, CURVA_DENSIDAD);
  if (distancia !== null) {
    if (distancia >= DISTANCIA_LEJOS_KM) score += AJUSTE_DISTANCIA;
    else if (distancia <= DISTANCIA_CERCA_KM) score -= AJUSTE_DISTANCIA;
  }
  score = Math.round(clamp(score, 0, 100));

  const interpretacion = interpretar(densidad);

  // El conteo de competidores manda en la fiabilidad: si viene de un mock, la
  // densidad es aritmética sobre un dato estimado, no una medición.
  const confianzaConteo: NivelConfianza = competencia.es_mock ? 'baja' : 'alta';
  const confianzaArea: NivelConfianza = origen === 'area_declarada' ? 'alta' : 'media';

  return {
    es_evaluable: true,
    score,
    competidores_km2: densidad,
    area_km2: area,
    origen_area: origen,
    distancia_media_km: distancia,
    interpretacion,
    mensaje: mensajeDe(interpretacion, densidad, area, total),
    confianza: combinarConfianza(confianzaConteo, confianzaArea),
  };
}