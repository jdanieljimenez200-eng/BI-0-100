/**
 * googleLocalService.ts
 * Busca competidores locales de SERVICIOS en Google Maps (SerpAPI).
 *
 * Sin SerpAPI no hay competencia que mostrar. Antes aquí había una tabla de
 * benchmarks por sector que fabricaba nombres («ConsultoraMX», «ProServicios»),
 * precios, ratings, reseñas y años en el mercado: se veía como un estudio de
 * competencia real y no lo era.
 */

import { CompetenciaResult, Competidor } from './types';
import { competenciaNoDisponible } from './fuentesCompetencia';
import { getPaisInfo } from '../../utils/latam';
import { logger } from '../../utils/logger';


// ─── SerpAPI Google Maps (para servicios locales con API key) ─────────────────

async function serpApiGoogleMaps(
  palabraClave: string,
  scope: 'local' | 'nacional',
  precio: number,
  estado?: string,
  pais?: string | null
): Promise<CompetenciaResult> {
  const codigo = (pais ?? 'MX').trim().toUpperCase();
  const gl = /^[A-Z]{2}$/.test(codigo) ? codigo.toLowerCase() : 'mx';
  const hl = gl === 'br' ? 'pt' : 'es';
  const nombrePais = getPaisInfo(pais).nombre;
  const ubicacion = scope === 'local' && estado ? `${estado}, ${nombrePais}` : nombrePais;
  const url = [
    `https://serpapi.com/search.json`,
    `?engine=google_maps`,
    `&q=${encodeURIComponent(palabraClave)}`,
    `&location=${encodeURIComponent(ubicacion)}`,
    `&hl=${hl}`,
    `&gl=${gl}`,
    `&type=search`,
    `&api_key=${process.env.SERPAPI_KEY}`,
  ].join('');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI Maps error: ${res.status}`);

  const data = await res.json() as {
    local_results?: {
      title: string;
      address?: string;
      rating?: number;
      reviews?: number;
      price?: string;
      website?: string;
      phone?: string;
    }[];
  };

  // Cero resultados no es un fallo de la fuente: la fuente contestó y no había
  // nada. El motivo que ve el usuario es distinto en cada caso.
  const results = (data.local_results ?? []).slice(0, 8);
  if (results.length === 0) return competenciaNoDisponible('sin_resultados');

  const competidores: Competidor[] = results.map((r, i) => {
    // Google Maps rara vez expone precio. Lo derivamos SOLO si viene en la
    // respuesta (símbolos "$" o número explícito); si no, queda en 0 (desconocido)
    // y se excluye del promedio. Nunca se inventa con azar.
    let precioEst = 0;
    if (r.price) {
      const dollarSigns = (r.price.match(/\$/g) ?? []).length;
      if (dollarSigns === 1) precioEst = precio * 0.7;
      else if (dollarSigns === 2) precioEst = precio * 1.0;
      else if (dollarSigns >= 3) precioEst = precio * 1.5;
      const numMatch = r.price.match(/[\d,.]+/);
      if (numMatch) precioEst = parseFloat(numMatch[0].replace(',', ''));
    }
    const tienePrecioReal = Number.isFinite(precioEst) && precioEst > 0;

    return {
      ranking:         i + 1,
      nombre:          r.title,
      url:             r.website ?? '',
      ubicacion:       r.address ?? (scope === 'local' ? estado ?? 'Local' : nombrePais),
      distancia_km:    null,
      precio_minimo:   tienePrecioReal ? Math.round(precioEst * 0.85) : 0,
      precio_maximo:   tienePrecioReal ? Math.round(precioEst * 1.15) : 0,
      precio_promedio: tienePrecioReal ? Math.round(precioEst) : 0,
      rating:          r.rating ?? 4.0,
      numero_resenas:  r.reviews ?? 0,
      fortalezas:      ['Presencia en Google Maps', r.rating && r.rating >= 4.5 ? 'Excelente calificación' : 'Calificación positiva'].filter(Boolean) as string[],
      debilidades:     [],
      tiempo_en_mercado: 'Desconocido',
      fuente:          'google_maps',
    };
  });

  const precios = competidores.map(c => c.precio_promedio).filter(p => p > 0);
  // Sin precios reales → 0 (neutro en scorePrecioRelativo) en vez de asumir el
  // precio del propio usuario como referencia de mercado.
  const precioPromedio = precios.length
    ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length)
    : 0;

  const avgRating = results.reduce((s, r) => s + (r.rating ?? 4), 0) / results.length;

  return {
    total_competidores: competidores.length,
    competidores,
    gap_detectado: competidores.length <= 3
      ? `Solo ${competidores.length} competidores en Google Maps — alta oportunidad de posicionamiento local`
      : avgRating < 4.0
        ? 'Calificación promedio de competidores baja (< 4⭐) — oportunidad de diferenciación por calidad de servicio'
        : null,
    precio_mercado_promedio: precioPromedio,
    es_mock: false,
    fuente_disponible: true,
  };
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function obtenerCompetenciaServicio(
  palabraClave: string,
  categoria: string,
  scope: 'local' | 'nacional',
  precio: number,
  estado?: string,
  pais?: string | null
): Promise<CompetenciaResult> {
  // Si hay SerpAPI, usar Google Maps (datos reales de negocios locales)
  if (process.env.SERPAPI_KEY) {
    try {
      const real = await serpApiGoogleMaps(palabraClave, scope, precio, estado, pais);
      if (real.competidores.length > 0) return real;
      return competenciaNoDisponible('sin_resultados');
    } catch (err) {
      logger.warn('[mercado] SerpAPI Google Maps falló:', err);
      return competenciaNoDisponible('fuente_fallo');
    }
  }
  return competenciaNoDisponible('sin_configurar');
}
