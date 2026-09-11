// ─── DENUE (INEGI) — directorio oficial de establecimientos (México) ─────────
// Nivel 1 de la cascada: CONTEO y TAMAÑO de competidores.
// NO provee precios, ratings ni reseñas (eso es nivel 3: Google/Marketplaces).
import { fetchJsonConTimeout, sanitizarSegmentoRuta } from './http';
import type { CensoOficialResult, EstablecimientoOficial } from './types';

const DENUE_BASE = 'https://www.inegi.org.mx/app/api/denue/v1/consulta';

export function isDenueAvailable(): boolean {
  return Boolean(process.env.DENUE_TOKEN || process.env.INEGI_TOKEN);
}

function getToken(): string {
  return process.env.DENUE_TOKEN || process.env.INEGI_TOKEN || '';
}

interface DenueItem {
  Nombre_de_la_unidad_económica?: string;
  Razón_social?: string;
  Clase_actividad?: string;
  Descripción_estrato?: string;
  Estrato?: string;
  Ubicacion?: string;
  Telefono?: string;
  Sitio_web?: string;
  'C.P.'?: string;
  Latitud?: string | number;
  Longitud?: string | number;
  Fecha_de_incorporacion_DENUE?: string;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function mapearEstablecimiento(item: DenueItem): EstablecimientoOficial {
  const lat = item.Latitud != null ? Number(item.Latitud) : NaN;
  const lon = item.Longitud != null ? Number(item.Longitud) : NaN;
  return {
    nombre: item.Nombre_de_la_unidad_económica ?? 'Sin nombre',
    razon_social: item.Razón_social ?? null,
    clase_actividad: item.Clase_actividad ?? '',
    estrato_personal:
      item.Descripción_estrato ?? item.Estrato ?? null,
    cp: item['C.P.'] ?? null,
    ubicacion: item.Ubicacion ?? null,
    telefono: item.Telefono ?? null,
    sitio_web: item.Sitio_web ?? null,
    latitud: Number.isFinite(lat) ? lat : null,
    longitud: Number.isFinite(lon) ? lon : null,
    distancia_km: null,
    antiguedad: item.Fecha_de_incorporacion_DENUE ?? null,
  };
}

function construirCenso(
  establecimientos: EstablecimientoOficial[],
  cobertura: 'radio' | 'entidad',
  radioM: number | null,
  nota: string
): CensoOficialResult {
  const distribucion_estrato: Record<string, number> = {};
  for (const e of establecimientos) {
    if (e.estrato_personal) {
      distribucion_estrato[e.estrato_personal] =
        (distribucion_estrato[e.estrato_personal] ?? 0) + 1;
    }
  }
  return {
    disponible: true,
    fuente: 'denue_inegi',
    instituto: 'INEGI',
    pais: 'MX',
    cobertura,
    total_establecimientos: establecimientos.length,
    radio_m: radioM,
    establecimientos,
    distribucion_estrato,
    nota,
    consultado_en: new Date().toISOString(),
  };
}

/** Búsqueda por radio (metros). Endpoint documentado: consulta/Buscar */
export async function buscarDenuePorRadio(
  actividad: string,
  latitud: number,
  longitud: number,
  radioMetros: number
): Promise<CensoOficialResult> {
  const condicion = encodeURIComponent(sanitizarSegmentoRuta(actividad));
  const url = `${DENUE_BASE}/Buscar/${condicion}/${latitud},${longitud}/${Math.round(radioMetros)}/${getToken()}`;

  const raw = await fetchJsonConTimeout<DenueItem[]>(url);
  const items = Array.isArray(raw) ? raw : [];

  const establecimientos = items.map(mapearEstablecimiento);
  for (const e of establecimientos) {
    if (e.latitud != null && e.longitud != null) {
      e.distancia_km =
        Math.round(
          haversineKm(latitud, longitud, e.latitud, e.longitud) * 100
        ) / 100;
    }
  }

  return construirCenso(
    establecimientos,
    'radio',
    Math.round(radioMetros),
    'Censo oficial DENUE (INEGI). No incluye precios, ratings ni reseñas.'
  );
}

/**
 * Búsqueda por entidad federativa. El API pública v1 de DENUE expone
 * búsqueda geolocalizada; la búsqueda textual por entidad no está disponible
 * con el esquema actual, por lo que se reporta como censo no disponible
 * en lugar de inventar un endpoint.
 */
export async function buscarDenuePorEntidad(
  _actividad: string,
  _estado: string | null
): Promise<CensoOficialResult> {
  void _actividad;
  void _estado;
  return {
    disponible: false,
    fuente: 'denue_inegi',
    instituto: 'INEGI',
    pais: 'MX',
    cobertura: null,
    total_establecimientos: null,
    radio_m: null,
    establecimientos: [],
    distribucion_estrato: {},
    nota:
      'DENUE disponible solo para búsqueda por radio con coordenadas; ' +
      'proporciona ubicación del negocio para habilitar el censo oficial.',
    consultado_en: new Date().toISOString(),
  };
}

// Utilidad previa conservada para compatibilidad
export function calcularEstadisticas(datos: number[]): {
  total: number;
  promedio: number;
} {
  return {
    total: datos.length,
    promedio: datos.reduce((a, b) => a + b, 0) / (datos.length || 1),
  };
}
