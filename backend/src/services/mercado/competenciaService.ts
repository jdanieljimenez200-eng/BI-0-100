/**
 * competenciaService.ts
 * Router de análisis de competencia que bifurca según el tipo de negocio:
 *
 *  PRODUCTO → MercadoLibre API (gratis) → SerpAPI Google Shopping → Mock
 *  SERVICIO → SerpAPI Google Maps        → Benchmark de sector
 *
 * De esta forma, los servicios nunca buscan en MercadoLibre
 * y los productos nunca buscan en Google Maps local.
 */

import { CompetenciaResult, Competidor } from './types';
import { competenciaNoDisponible } from './fuentesCompetencia';
import { getPaisInfo } from '../../utils/latam';
import { obtenerCompetenciaMercadoLibre } from './mercadolibreService';
import { obtenerCompetenciaServicio } from './googleLocalService';
import { logger } from '../../utils/logger';


// ─── SerpAPI Google Shopping (para productos, si está disponible) ─────────────

async function serpApiGoogleShopping(
  palabraClave: string,
  scope: string,
  precio: number,
  pais?: string | null
): Promise<CompetenciaResult> {
  const codigo = (pais ?? 'MX').trim().toUpperCase();
  const gl = /^[A-Z]{2}$/.test(codigo) ? codigo.toLowerCase() : 'mx';
  const hl = gl === 'br' ? 'pt' : 'es';
  const nombrePais = getPaisInfo(pais).nombre;
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(palabraClave)}&gl=${gl}&hl=${hl}&api_key=${process.env.SERPAPI_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI Shopping error: ${res.status}`);

  const data = await res.json() as {
    shopping_results?: {
      title: string; link: string; price?: string;
      rating?: number; reviews?: number; source?: string;
    }[];
  };

  const results = (data.shopping_results ?? []).slice(0, 8);

  const competidores: Competidor[] = results.map((r, i) => {
    // Solo usamos el precio si Google Shopping lo expone de forma parseable.
    // Si no viene, se marca como desconocido (0) y se EXCLUYE del promedio —
    // nunca se inventa, para no contaminar precio_mercado_promedio ni el score.
    const parsed = r.price ? parseFloat(r.price.replace(/[^0-9.]/g, '')) : NaN;
    const tienePrecioReal = Number.isFinite(parsed) && parsed > 0;
    const rawPrice = tienePrecioReal ? parsed : 0;

    return {
      ranking:         i + 1,
      nombre:          r.source ?? r.title.split(' ').slice(0, 3).join(' '),
      url:             r.link ?? '',
      ubicacion:       scope === 'local' ? 'Local' : nombrePais,
      distancia_km:    null,
      precio_minimo:   tienePrecioReal ? Math.round(rawPrice * 0.95) : 0,
      precio_maximo:   tienePrecioReal ? Math.round(rawPrice * 1.05) : 0,
      precio_promedio: tienePrecioReal ? Math.round(rawPrice) : 0,
      rating:          r.rating ?? 4.0,
      numero_resenas:  r.reviews ?? 0,
      fortalezas:      ['Presencia en Google Shopping'],
      debilidades:     [],
      tiempo_en_mercado: 'Desconocido',
      fuente:          'google_shopping',
    };
  });

  const precios = competidores.map(c => c.precio_promedio).filter(p => p > 0);
  // Sin precios reales → 0: scorePrecioRelativo lo trata como neutro en vez de
  // partir de un precio fabricado.
  const precioPromedio = precios.length
    ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length)
    : 0;

  return {
    total_competidores: competidores.length,
    competidores,
    gap_detectado: competidores.length <= 3
      ? 'Poca oferta en Google Shopping — oportunidad de posicionamiento' : null,
    precio_mercado_promedio: precioPromedio,
    es_mock: false,
    fuente_disponible: true,
  };
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function obtenerCompetencia(
  palabraClave: string,
  scope: 'local' | 'nacional',
  precio: number,
  pais: string | null | undefined,            // ← país ISO del análisis
  tipoActividad: 'Producto' | 'Servicio',   // ← NUEVO: bifurca la estrategia
  categoria: string,                          // ← NUEVO: para benchmarks de servicio
  estado?: string                             // ← NUEVO: para filtro local de ML
): Promise<CompetenciaResult> {

  // ── SERVICIO: Google Maps local → Benchmark de sector ──────────────────────
  if (tipoActividad === 'Servicio') {
    return obtenerCompetenciaServicio(palabraClave, categoria, scope, precio, estado, pais);
  }

  // ── PRODUCTO: MercadoLibre → SerpAPI Shopping → sin fuente ─────────────────

  let fallo = false;

  // 1. MercadoLibre (gratis, sin API key)
  try {
    const ml = await obtenerCompetenciaMercadoLibre(palabraClave, scope, estado, precio, pais);
    // ML devuelve datos buscamos que tenga al menos 1 resultado real
    if (ml.competidores.length > 0) {
      logger.info(`[mercado] Competencia ML: ${ml.total_competidores} vendedores encontrados`);
      return ml;
    }
  } catch (err) {
    fallo = true;
    logger.warn('[mercado] MercadoLibre falló, intentando SerpAPI Shopping:', err);
  }

  // 2. SerpAPI Google Shopping (si hay API key)
  if (process.env.SERPAPI_KEY) {
    try {
      const serp = await serpApiGoogleShopping(palabraClave, scope, precio, pais);
      if (serp.competidores.length > 0) {
        logger.info(`[mercado] Competencia SerpAPI: ${serp.total_competidores} resultados`);
        return serp;
      }
    } catch (err) {
      fallo = true;
      logger.warn('[mercado] SerpAPI Shopping falló:', err);
    }
  }

  // 3. Sin fuente: se declara el hueco, no se rellena.
  logger.info('[mercado] Sin competencia de producto: ninguna fuente devolvió resultados');
  return competenciaNoDisponible(
    fallo ? 'fuente_fallo' : process.env.SERPAPI_KEY ? 'sin_resultados' : 'sin_configurar'
  );
}
