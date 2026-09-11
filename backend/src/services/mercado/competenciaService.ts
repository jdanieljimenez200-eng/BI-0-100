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
import { getPaisInfo } from '../../utils/latam';
import { obtenerCompetenciaMercadoLibre } from './mercadolibreService';
import { obtenerCompetenciaServicio } from './googleLocalService';

// ─── Hash determinista (fallback mock genérico) ───────────────────────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Mock genérico de producto (último fallback) ──────────────────────────────

const NOMBRES_MOCK_PRODUCTO = [
  'TiendaOnline', 'VentaDirecta', 'ImportadoraPlus', 'DistribuidoraPlus',
  'ComercioExpress', 'ProveeMás', 'FábricaNacional', 'MercaMax',
];

function mockProducto(
  palabraClave: string,
  scope: string,
  precio: number,
  pais?: string | null
): CompetenciaResult {
  const seed = hashStr(palabraClave);
  const n = 2 + (seed % 6); // 2-7 competidores
  // Sin datos reales no inventamos ciudades: usamos el país del análisis.
  const nombrePais = getPaisInfo(pais).nombre;

  const competidores: Competidor[] = Array.from({ length: n }, (_, i) => {
    const nameSeed = hashStr(palabraClave + i);
    const precioComp = precio > 0
      ? Math.round(precio * (0.7 + (nameSeed % 60) / 100))
      : 50 + (nameSeed % 200);

    return {
      ranking:         i + 1,
      nombre:          NOMBRES_MOCK_PRODUCTO[nameSeed % NOMBRES_MOCK_PRODUCTO.length] + (i + 1),
      url:             '',
      ubicacion:       scope === 'local' ? 'Local' : nombrePais,
      distancia_km:    scope === 'local' ? 1 + (nameSeed % 30) : null,
      precio_minimo:   Math.round(precioComp * 0.9),
      precio_maximo:   Math.round(precioComp * 1.1),
      precio_promedio: precioComp,
      rating:          parseFloat((3.5 + (nameSeed % 15) / 10).toFixed(1)),
      numero_resenas:  10 + (nameSeed % 500),
      fortalezas:      ['Marca conocida', 'Envíos rápidos', 'Amplio catálogo'].slice(0, 1 + (nameSeed % 2)),
      debilidades:     ['Precio alto', 'Sin atención personalizada'].slice(0, 1 + (nameSeed % 2)),
      tiempo_en_mercado: `${1 + (nameSeed % 8)} años`,
      fuente:          'mock',
    };
  });

  const preciosMercado = competidores.map(c => c.precio_promedio);
  const precioPromedio = Math.round(preciosMercado.reduce((a, b) => a + b, 0) / preciosMercado.length);

  const tieneGap = (seed % 3) === 0;
  const gaps = [
    'Nadie ofrece opción sostenible + precio accesible',
    'Sin presencia en ventas online en la región',
    'Competidores no tienen personalización del producto',
  ];

  return {
    total_competidores: n,
    competidores,
    gap_detectado: tieneGap ? gaps[seed % gaps.length] : null,
    precio_mercado_promedio: precioPromedio,
    es_mock: true,
  };
}

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

  // ── PRODUCTO: MercadoLibre → SerpAPI Shopping → Mock ───────────────────────

  // 1. MercadoLibre (gratis, sin API key)
  try {
    const ml = await obtenerCompetenciaMercadoLibre(palabraClave, scope, estado, precio, pais);
    // ML devuelve datos buscamos que tenga al menos 1 resultado real
    if (ml.competidores.length > 0) {
      console.log(`✅ Competencia ML: ${ml.total_competidores} vendedores encontrados`);
      return ml;
    }
  } catch (err) {
    console.warn('MercadoLibre falló, intentando SerpAPI Shopping:', err);
  }

  // 2. SerpAPI Google Shopping (si hay API key)
  if (process.env.SERPAPI_KEY) {
    try {
      const serp = await serpApiGoogleShopping(palabraClave, scope, precio, pais);
      if (serp.competidores.length > 0) {
        console.log(`✅ Competencia SerpAPI: ${serp.total_competidores} resultados`);
        return serp;
      }
    } catch (err) {
      console.warn('SerpAPI Shopping falló, usando mock producto:', err);
    }
  }

  // 3. Mock determinista (último fallback)
  console.log('⚠️ Usando mock de competencia para producto');
  return mockProducto(palabraClave, scope, precio, pais);
}
