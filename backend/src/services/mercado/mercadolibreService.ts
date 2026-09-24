/**
 * mercadolibreService.ts
 * Busca competidores reales en MercadoLibre, en el sitio correspondiente al
 * país del análisis (MLM, MLA, MLB, MLC, MCO, MPE, MEC, MLU…).
 * API 100% pública, sin API key, gratuita.
 * Solo aplica para PRODUCTOS — los servicios NO tienen presencia en ML.
 *
 * Los países donde ML no opera marketplace (solo clasificados) no están
 * mapeados a propósito: se lanza error y el orquestador cae al siguiente
 * proveedor en vez de devolver datos de otro país.
 */

import { CompetenciaResult, Competidor } from './types';
import { competenciaNoDisponible } from './fuentesCompetencia';
import { getPaisInfo } from '../../utils/latam';

// ─── País ISO → site_id de MercadoLibre (solo marketplaces activos) ──────────

const ML_SITE_POR_PAIS: Record<string, string> = {
  MX: 'MLM',
  AR: 'MLA',
  BR: 'MLB',
  CL: 'MLC',
  CO: 'MCO',
  PE: 'MPE',
  EC: 'MEC',
  UY: 'MLU',
};

function getMlSiteId(pais?: string | null): string | undefined {
  const code = (pais ?? 'MX').trim().toUpperCase();
  return ML_SITE_POR_PAIS[code];
}

// ─── Mapa de estado → ID de estado de MercadoLibre MX ────────────────────────
// Fuente: https://api.mercadolibre.com/classified_locations/states?country_id=MLM

const ESTADO_A_ML_ID: Record<string, string> = {
  'aguascalientes':       'TUxNQ0FHVTc4MTc',
  'baja california':      'TUxNQ0JBQTY4NTU',
  'baja california sur':  'TUxNQ0JBUzc4MTg',
  'campeche':             'TUxNQ0NBUDE3Nzg',
  'chiapas':              'TUxNQ0NIQTg1NjA',
  'chihuahua':            'TUxNQ0NISzg1NjE',
  'ciudad de mexico':     'TUxNQ0NBUF84NDcz',
  'cdmx':                 'TUxNQ0NBUF84NDcz',
  'coahuila':             'TUxNQ0NPQTg1NjI',
  'colima':               'TUxNQ0NPTDU0MTk',
  'durango':              'TUxNQ0RVUjc4MjE',
  'estado de mexico':     'TUxNQ01FWDQ2OTQ',
  'guanajuato':           'TUxNQ0dVQTc4MjI',
  'guerrero':             'TUxNQ0dVRTc4MjM',
  'hidalgo':              'TUxNQ0hJRDc4MjQ',
  'jalisco':              'TUxNQ0pBTDg1NjM',
  'michoacan':            'TUxNQ01JQzc4MjU',
  'morelos':              'TUxNQ01PUjc4MjY',
  'nayarit':              'TUxNQ05BWTc4Mjc',
  'nuevo leon':           'TUxNQ05MRTg1NjQ',
  'oaxaca':               'TUxNQ09BWDc4Mjg',
  'puebla':               'TUxNQ1BVQjg1NjU',
  'queretaro':            'TUxNQ1FVRTc4MzA',
  'quintana roo':         'TUxNQ1FST183ODMx',
  'san luis potosi':      'TUxNQ1NMUDc4MzI',
  'sinaloa':              'TUxNQ1NJTjg1NjY',
  'sonora':               'TUxNQ1NPTjg1Njc',
  'tabasco':              'TUxNQ1RBQjc4MzM',
  'tamaulipas':           'TUxNQ1RBTTY4Nzg',
  'tlaxcala':             'TUxNQ1RMQTc4MzQ',
  'veracruz':             'TUxNQ1ZFUjg1Njg',
  'yucatan':              'TUxNQ1lVQzc4MzU',
  'zacatecas':            'TUxNQ1pBQzc4MzY',
};

// ─── Tipos de respuesta de ML API ─────────────────────────────────────────────

interface MLItem {
  id: string;
  title: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  sold_quantity: number;
  permalink: string;
  seller: { id: number; nickname: string };
  shipping: { free_shipping: boolean };
  address?: { city_name?: string; state_name?: string };
  attributes?: { id: string; value_name: string }[];
}

interface MLSearchResponse {
  results: MLItem[];
  paging: { total: number; offset: number; limit: number };
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function obtenerCompetenciaMercadoLibre(
  palabraClave: string,
  scope: 'local' | 'nacional',
  estadoNombre: string | undefined,
  precio: number,
  pais?: string | null
): Promise<CompetenciaResult> {
  const site = getMlSiteId(pais);
  if (!site) {
    // Sin marketplace de ML en ese país: mejor fallar y que el orquestador use
    // otra fuente que devolver vendedores mexicanos como "competencia local".
    throw new Error(`MercadoLibre no tiene marketplace para el país ${pais ?? 'desconocido'}`);
  }
  const nombrePais = getPaisInfo(pais).nombre;

  try {
    // Construir URL base
    const q = encodeURIComponent(palabraClave);
    let url = `https://api.mercadolibre.com/sites/${site}/search?q=${q}&limit=8&sort=relevance`;

    // Filtrar por estado si es local
    if (scope === 'local' && estadoNombre) {
      const estadoKey = estadoNombre.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar acentos
      // El mapa de IDs de estado solo cubre México; en el resto de países se usa
      // el filtro textual, que ML resuelve razonablemente bien.
      const mlStateId = site === 'MLM' ? ESTADO_A_ML_ID[estadoKey] : undefined;
      if (mlStateId) {
        url += `&state=${mlStateId}`;
      } else {
        // Fallback: agregar nombre del estado a la búsqueda
        url = `https://api.mercadolibre.com/sites/${site}/search?q=${encodeURIComponent(palabraClave + ' ' + estadoNombre)}&limit=8&sort=relevance`;
      }
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Bi0a100-MarketAnalysis/1.0' },
      signal: AbortSignal.timeout(8000), // timeout 8s
    });

    if (!res.ok) throw new Error(`MercadoLibre API error: ${res.status}`);
    const data = await res.json() as MLSearchResponse;
    const items = data.results ?? [];

    if (items.length === 0) {
      // Cero resultados no es «mercado por explorar»: es que esta fuente no
      // encontró nada. Además se devolvía el precio del propio usuario como
      // «precio de mercado», con lo que su precio siempre parecía el correcto.
      return competenciaNoDisponible('sin_resultados');
    }

    // Construir competidores
    const competidores: Competidor[] = items.map((item, i) => ({
      ranking:         i + 1,
      nombre:          item.seller?.nickname ?? item.title.split(' ').slice(0, 3).join(' '),
      url:             item.permalink,
      ubicacion:       item.address?.city_name ?? item.address?.state_name ?? (scope === 'local' ? estadoNombre ?? 'Local' : nombrePais),
      distancia_km:    null,
      precio_minimo:   Math.round(item.price * 0.95),
      precio_maximo:   Math.round(item.price * 1.05),
      precio_promedio: Math.round(item.price),
      rating:          4.0, // ML no expone rating en search endpoint sin auth
      numero_resenas:  item.sold_quantity ?? 0,
      fortalezas:      [
        item.shipping?.free_shipping ? 'Envío gratis' : 'Logística establecida',
        item.sold_quantity > 100 ? `+${item.sold_quantity} vendidos` : 'Vendedor activo',
      ].filter(Boolean),
      debilidades:     [],
      tiempo_en_mercado: 'Desconocido',
      fuente:          'mercadolibre',
    }));

    // Precio promedio del mercado
    const precios = competidores.map(c => c.precio_promedio).filter(p => p > 0);
    const precioPromedio = precios.length
      ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length)
      : precio;

    // Gap detection
    let gap: string | null = null;
    if (competidores.length <= 2) {
      gap = `Poca oferta en MercadoLibre (solo ${competidores.length} vendedores) — oportunidad de posicionamiento digital`;
    } else if (precio < precioPromedio * 0.8) {
      gap = `Tu precio es ${Math.round(((precioPromedio - precio) / precioPromedio) * 100)}% menor al mercado — ventaja competitiva en precio`;
    } else if (competidores.every(c => c.numero_resenas < 50)) {
      gap = 'Competidores con pocas ventas en ML — mercado con baja tracción digital, primero mover es ventaja';
    }

    return {
      total_competidores: data.paging?.total ?? competidores.length,
      competidores,
      gap_detectado: gap,
      precio_mercado_promedio: precioPromedio,
      es_mock: false,
      fuente_disponible: true,
    };
  } catch (err) {
    console.warn('MercadoLibre API falló:', (err as Error).message);
    throw err; // Propagar para que el orquestador maneje el fallback
  }
}
