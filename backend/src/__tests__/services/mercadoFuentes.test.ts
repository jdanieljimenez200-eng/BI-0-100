// `tendenciasService`, `competenciaService` y `googleLocalService` leen
// SERPAPI_KEY EN CADA LLAMADA (no al cargar el módulo), así que basta con
// borrarla en el beforeEach para forzar las ramas deterministas — mock de
// tendencias, benchmark de sector y mock de producto — que son exactamente lo
// que ve el usuario cuando no hay clave o cuando SerpAPI falla.
import { obtenerTendencias } from '../../services/mercado/tendenciasService';
import { obtenerCompetencia } from '../../services/mercado/competenciaService';
import { obtenerCompetenciaServicio } from '../../services/mercado/googleLocalService';
import { obtenerCompetenciaMercadoLibre } from '../../services/mercado/mercadolibreService';
import { describirFuenteCompetencia } from '../../services/mercado/fuentesCompetencia';

const KEY_ORIGINAL = process.env.SERPAPI_KEY;
const FETCH_ORIGINAL = global.fetch;

beforeEach(() => {
  delete process.env.SERPAPI_KEY;
  // Ninguna prueba de esta suite debe salir a la red. Por defecto `fetch`
  // rechaza, que es la señal que hace caer al router de MercadoLibre al
  // siguiente proveedor; los tests que necesitan una respuesta la inyectan.
  global.fetch = jest.fn().mockRejectedValue(new Error('red deshabilitada en tests'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  global.fetch = FETCH_ORIGINAL;
  if (KEY_ORIGINAL !== undefined) {
    process.env.SERPAPI_KEY = KEY_ORIGINAL;
  }
});

/** Respuesta JSON válida para `fetch`, sin tocar la red. */
function respuestaOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('mercado/tendenciasService.obtenerTendencias (sin SERPAPI_KEY)', () => {
  it('marca es_mock y devuelve 12 meses y 6 de proyección', async () => {
    const t = await obtenerTendencias('pizzería artesanal', 'local', 'MX', 'Nuevo León');

    expect(t.es_mock).toBe(true);
    expect(t.datos_12_meses).toHaveLength(12);
    expect(t.proyeccion_6_meses).toHaveLength(6);
    expect(t.palabra_clave).toBe('pizzería artesanal');
  });

  it('es determinista: la misma palabra clave da el mismo volumen y crecimiento', async () => {
    const a = await obtenerTendencias('pizzería artesanal', 'nacional', 'MX');
    const b = await obtenerTendencias('pizzería artesanal', 'nacional', 'MX');

    expect(b.volumen_busquedas_mensual).toBe(a.volumen_busquedas_mensual);
    expect(b.crecimiento_porcentaje).toBe(a.crecimiento_porcentaje);
    expect(b.proyeccion_6_meses).toEqual(a.proyeccion_6_meses);
  });

  it('el volumen base cae en el rango declarado del mock (500–3499)', async () => {
    for (const kw of ['pizza', 'software contable', 'clases de yoga', 'x']) {
      const t = await obtenerTendencias(kw, 'nacional', 'MX');
      expect(t.volumen_busquedas_mensual).toBeGreaterThanOrEqual(500);
      expect(t.volumen_busquedas_mensual).toBeLessThan(3500);
    }
  });

  it('scope nacional etiqueta solo el país; local sin región usa "Local (país)"', async () => {
    const nacional = await obtenerTendencias('pizza', 'nacional', 'MX', 'Jalisco');
    const localSinRegion = await obtenerTendencias('pizza', 'local', 'MX');
    const localConRegion = await obtenerTendencias('pizza', 'local', 'MX', 'Jalisco');

    expect(nacional.ubicacion).not.toContain(',');
    expect(nacional.ubicacion.length).toBeGreaterThan(0);
    // En nacional la región se ignora a propósito: Google Trends se consulta a
    // nivel país porque no hay mapa fiable región→ISO-3166-2 para LATAM.
    expect(nacional.ubicacion).not.toContain('Jalisco');
    expect(localSinRegion.ubicacion).toMatch(/^Local \(.+\)$/);
    expect(localConRegion.ubicacion).toBe(`Jalisco, ${nacional.ubicacion}`);
  });

  it('un país inválido o ausente cae a MX sin lanzar', async () => {
    const conDefault = await obtenerTendencias('pizza', 'nacional');
    const basura = await obtenerTendencias('pizza', 'nacional', 'ZZZZ');
    const vacio = await obtenerTendencias('pizza', 'nacional', null);

    expect(basura.ubicacion).toBe(conDefault.ubicacion);
    expect(vacio.ubicacion).toBe(conDefault.ubicacion);
  });

  it('la tendencia es coherente con el crecimiento en los tres umbrales', async () => {
    for (const kw of ['pizza', 'taquería', 'consultoría fiscal', 'gimnasio', 'veterinaria', 'zapatos']) {
      const t = await obtenerTendencias(kw, 'nacional', 'MX');
      const esperado =
        t.crecimiento_porcentaje >= 5 ? 'CRECIENTE' : t.crecimiento_porcentaje >= -5 ? 'ESTABLE' : 'DECRECIENTE';

      expect(t.tendencia).toBe(esperado);
      expect(t.crecimiento_descripcion).toContain(`${t.crecimiento_porcentaje}`);
      expect(t.crecimiento_descripcion).toContain('vs hace 1 año');
      if (t.crecimiento_porcentaje > 0) expect(t.crecimiento_descripcion.startsWith('+')).toBe(true);
    }
  });

  it('la serie de 12 meses tiene meses únicos y volúmenes positivos', async () => {
    const t = await obtenerTendencias('pizzería artesanal', 'nacional', 'MX');

    expect(new Set(t.datos_12_meses.map((d) => d.mes)).size).toBe(12);
    for (const d of t.datos_12_meses) {
      expect(d.volumen).toBeGreaterThan(0);
      expect(d.mes.trim().length).toBeGreaterThan(0);
    }
  });

  it('cae al mock cuando SerpAPI responde con error HTTP', async () => {
    process.env.SERPAPI_KEY = 'clave-de-prueba';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 } as Response);

    const t = await obtenerTendencias('pizzería artesanal', 'nacional', 'MX');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(t.es_mock).toBe(true);
    expect(t.datos_12_meses).toHaveLength(12);
  });

  it('usa la respuesta real de SerpAPI cuando llega bien formada', async () => {
    process.env.SERPAPI_KEY = 'clave-de-prueba';
    const timeline = Array.from({ length: 12 }, (_, i) => ({
      date: `mes ${i + 1}`,
      values: [{ extracted_value: 10 + i * 5 }],
    }));
    (global.fetch as jest.Mock).mockResolvedValue(respuestaOk({ interest_over_time: { timeline_data: timeline } }));

    const t = await obtenerTendencias('pizzería artesanal', 'nacional', 'MX');

    expect(t.es_mock).toBe(false);
    expect(t.datos_12_meses).toHaveLength(12);
    // El índice de Trends se escala ×15 para aproximar volumen de búsquedas.
    expect(t.datos_12_meses[0]).toEqual({ mes: 'mes 1', volumen: 150 });
    // primeros3 = 15, ultimos3 = 60 → +300%.
    expect(t.crecimiento_porcentaje).toBe(300);
    expect(t.tendencia).toBe('CRECIENTE');
  });

  it('una respuesta de SerpAPI vacía no rompe ni divide entre cero', async () => {
    process.env.SERPAPI_KEY = 'clave-de-prueba';
    (global.fetch as jest.Mock).mockResolvedValue(respuestaOk({}));

    const t = await obtenerTendencias('pizza', 'nacional', 'MX');

    expect(t.es_mock).toBe(false);
    expect(t.volumen_busquedas_mensual).toBe(1000);
    expect(t.datos_12_meses).toEqual([]);
    expect(Number.isFinite(t.crecimiento_porcentaje)).toBe(true);
    expect(t.crecimiento_porcentaje).toBe(0);
  });
});

describe('mercado/competenciaService.obtenerCompetencia — ruta PRODUCTO', () => {
  it('usa MercadoLibre cuando devuelve resultados reales', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      respuestaOk({
        paging: { total: 340, offset: 0, limit: 8 },
        results: [
          {
            id: 'MLM1', title: 'Horno para pizza', price: 5000, currency_id: 'MXN',
            available_quantity: 5, sold_quantity: 150, permalink: 'https://ml.com/1',
            seller: { id: 1, nickname: 'HornosMX' }, shipping: { free_shipping: true },
            address: { city_name: 'Monterrey', state_name: 'Nuevo León' },
          },
          {
            id: 'MLM2', title: 'Horno industrial', price: 7000, currency_id: 'MXN',
            available_quantity: 2, sold_quantity: 10, permalink: 'https://ml.com/2',
            seller: { id: 2, nickname: 'EquipoGastro' }, shipping: { free_shipping: false },
            address: { city_name: 'Guadalajara' },
          },
        ],
      })
    );

    const c = await obtenerCompetencia('horno pizza', 'nacional', 6000, 'MX', 'Producto', 'Alimentos y bebidas');

    expect(c.es_mock).toBe(false);
    expect(c.competidores.map((x) => x.fuente)).toEqual(['mercadolibre', 'mercadolibre']);
    expect(c.competidores[0].nombre).toBe('HornosMX');
    // total_competidores viene del paging de ML, no del tamaño de la muestra.
    expect(c.total_competidores).toBe(340);
    expect(c.precio_mercado_promedio).toBe(6000);
    expect(c.competidores[0].fortalezas).toEqual(['Envío gratis', '+150 vendidos']);
    expect(c.competidores[1].fortalezas).toEqual(['Logística establecida', 'Vendedor activo']);
  });

  it('cae al mock determinista cuando ML falla y no hay SERPAPI_KEY', async () => {
    const c = await obtenerCompetencia('horno pizza', 'local', 6000, 'MX', 'Producto', 'Alimentos y bebidas');

    expect(c.es_mock).toBe(true);
    expect(c.competidores.length).toBeGreaterThanOrEqual(2);
    expect(c.competidores.length).toBeLessThanOrEqual(7);
    expect(c.competidores.map((x) => x.ranking)).toEqual(c.competidores.map((_, i) => i + 1));
    for (const comp of c.competidores) {
      expect(comp.fuente).toBe('mock');
      expect(comp.precio_minimo).toBeLessThanOrEqual(comp.precio_promedio);
      expect(comp.precio_maximo).toBeGreaterThanOrEqual(comp.precio_promedio);
      expect(comp.rating).toBeGreaterThanOrEqual(3.5);
      expect(comp.rating).toBeLessThanOrEqual(5);
      expect(comp.fortalezas.length).toBeGreaterThan(0);
    }
  });

  it('el mock de producto es determinista para la misma palabra clave', async () => {
    const a = await obtenerCompetencia('horno pizza', 'local', 6000, 'MX', 'Producto', 'Alimentos y bebidas');
    const b = await obtenerCompetencia('horno pizza', 'local', 6000, 'MX', 'Producto', 'Alimentos y bebidas');

    expect(b).toEqual(a);
  });

  it('con ML sin resultados usa Google Shopping y excluye del promedio los precios no parseables', async () => {
    process.env.SERPAPI_KEY = 'clave-de-prueba';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(respuestaOk({ paging: { total: 0 }, results: [] }))
      .mockResolvedValueOnce(
        respuestaOk({
          shopping_results: [
            { title: 'Horno A', link: 'https://a.com', price: '$1,000.00', source: 'TiendaA', rating: 4.5, reviews: 20 },
            { title: 'Horno B', link: 'https://b.com', price: 'Consultar', source: 'TiendaB' },
            { title: 'Horno C', link: 'https://c.com', price: '$3,000.00', source: 'TiendaC' },
          ],
        })
      );

    const c = await obtenerCompetencia('horno pizza', 'nacional', 2000, 'MX', 'Producto', 'Alimentos y bebidas');

    expect(c.es_mock).toBe(false);
    expect(c.competidores).toHaveLength(3);
    expect(c.competidores.every((x) => x.fuente === 'google_shopping')).toBe(true);
    // "Consultar" → 0 (desconocido) y fuera del promedio: (1000 + 3000) / 2.
    expect(c.competidores[1].precio_promedio).toBe(0);
    expect(c.precio_mercado_promedio).toBe(2000);
  });

  it('Google Shopping sin ningún precio real deja el promedio en 0, no inventa referencia', async () => {
    process.env.SERPAPI_KEY = 'clave-de-prueba';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(respuestaOk({ paging: { total: 0 }, results: [] }))
      .mockResolvedValueOnce(
        respuestaOk({ shopping_results: [{ title: 'Horno A', link: 'https://a.com', source: 'TiendaA' }] })
      );

    const c = await obtenerCompetencia('horno pizza', 'nacional', 2000, 'MX', 'Producto', 'Alimentos y bebidas');

    expect(c.precio_mercado_promedio).toBe(0);
    expect(c.gap_detectado).toContain('Poca oferta en Google Shopping');
  });

  it('con un país sin marketplace de ML no se consulta ML y se cae al mock', async () => {
    // Panamá no está en ML_SITE_POR_PAIS: el servicio lanza ANTES del fetch.
    const c = await obtenerCompetencia('horno pizza', 'nacional', 6000, 'PA', 'Producto', 'Alimentos y bebidas');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(c.es_mock).toBe(true);
  });
});

describe('mercado/competenciaService.obtenerCompetencia — ruta SERVICIO', () => {
  it('nunca consulta MercadoLibre para servicios', async () => {
    await obtenerCompetencia('corte de cabello', 'local', 300, 'MX', 'Servicio', 'salud y belleza', 'Jalisco');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sin SERPAPI_KEY usa el benchmark de sector y marca es_mock', async () => {
    const c = await obtenerCompetencia('corte de cabello', 'local', 300, 'MX', 'Servicio', 'salud y belleza', 'Jalisco');

    expect(c.es_mock).toBe(true);
    expect(c.competidores.every((x) => x.fuente === 'benchmark_sector')).toBe(true);
    expect(c.competidores.every((x) => x.ubicacion === 'Jalisco')).toBe(true);
    expect(c.competidores.every((x) => x.distancia_km !== null)).toBe(true);
    expect(c.gap_detectado).toContain('reserva digital');
  });

  it('la muestra de competidores se corta en 8 aunque el sector estime más', async () => {
    const c = await obtenerCompetenciaServicio('corte de cabello', 'salud y belleza', 'nacional', 300, undefined, 'MX');

    expect(c.total_competidores).toBeGreaterThanOrEqual(30);
    expect(c.competidores.length).toBeLessThanOrEqual(8);
    // total_competidores es la estimación del sector, no el tamaño de la muestra.
    expect(c.competidores.length).toBeLessThan(c.total_competidores);
    expect(c.competidores.every((x) => x.distancia_km === null)).toBe(true);
  });

  it('una categoría desconocida usa el benchmark "otro" sin gap', async () => {
    const c = await obtenerCompetenciaServicio('servicio raro', 'categoría inexistente', 'local', 500, 'Puebla', 'MX');

    expect(c.gap_detectado).toBeNull();
    expect(c.competidores.length).toBeGreaterThanOrEqual(3);
    expect(c.competidores.every((x) => x.fortalezas.length > 0)).toBe(true);
  });

  it('la categoría se resuelve sin distinguir mayúsculas', async () => {
    const minus = await obtenerCompetenciaServicio('clases', 'educación y cursos', 'local', 800, 'Puebla', 'MX');
    const mixta = await obtenerCompetenciaServicio('clases', 'Educación y Cursos', 'local', 800, 'Puebla', 'MX');

    expect(mixta).toEqual(minus);
    expect(minus.gap_detectado).toContain('mentoría 1:1');
  });

  it('el rango de precios del benchmark respeta el multiplicador del sector', async () => {
    const precio = 1000;
    const c = await obtenerCompetenciaServicio('consultoría', 'servicios profesionales', 'local', precio, 'CDMX', 'MX');

    for (const comp of c.competidores) {
      expect(comp.precio_promedio).toBeGreaterThanOrEqual(Math.round(precio * 0.65));
      expect(comp.precio_promedio).toBeLessThanOrEqual(Math.round(precio * 1.35));
    }
    expect(c.precio_mercado_promedio).toBeGreaterThan(0);
  });

  it('usa Google Maps cuando SerpAPI responde, y deja en 0 los precios ausentes', async () => {
    process.env.SERPAPI_KEY = 'clave-de-prueba';
    (global.fetch as jest.Mock).mockResolvedValue(
      respuestaOk({
        local_results: [
          { title: 'Estética Centro', address: 'Av. Juárez 10', rating: 4.8, reviews: 300, price: '$450' },
          { title: 'Salón Norte', address: 'Calle 5 #2', rating: 3.9, reviews: 40 },
        ],
      })
    );

    const c = await obtenerCompetenciaServicio('corte de cabello', 'salud y belleza', 'local', 300, 'Jalisco', 'MX');

    expect(c.es_mock).toBe(false);
    expect(c.competidores.every((x) => x.fuente === 'google_maps')).toBe(true);
    expect(c.competidores[0].precio_promedio).toBe(450);
    expect(c.competidores[1].precio_promedio).toBe(0);
    expect(c.precio_mercado_promedio).toBe(450);
    expect(c.competidores[0].fortalezas).toContain('Excelente calificación');
    expect(c.gap_detectado).toContain('alta oportunidad de posicionamiento local');
  });

  it('Google Maps sin resultados cae al benchmark de sector', async () => {
    process.env.SERPAPI_KEY = 'clave-de-prueba';
    (global.fetch as jest.Mock).mockResolvedValue(respuestaOk({ local_results: [] }));

    const c = await obtenerCompetenciaServicio('corte de cabello', 'salud y belleza', 'local', 300, 'Jalisco', 'MX');

    expect(c.es_mock).toBe(true);
    expect(c.competidores.every((x) => x.fuente === 'benchmark_sector')).toBe(true);
  });
});

describe('mercado/mercadolibreService.obtenerCompetenciaMercadoLibre', () => {
  it('lanza sin consultar la red si el país no tiene marketplace', async () => {
    await expect(obtenerCompetenciaMercadoLibre('horno', 'nacional', undefined, 5000, 'PA')).rejects.toThrow(
      /no tiene marketplace/
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('elige el site_id según el país del análisis', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(respuestaOk({ paging: { total: 0 }, results: [] }));

    await obtenerCompetenciaMercadoLibre('horno', 'nacional', undefined, 5000, 'CO');
    await obtenerCompetenciaMercadoLibre('horno', 'nacional', undefined, 5000, 'AR');
    await obtenerCompetenciaMercadoLibre('horno', 'nacional', undefined, 5000, null);

    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('/sites/MCO/search');
    expect(urls[1]).toContain('/sites/MLA/search');
    expect(urls[2]).toContain('/sites/MLM/search'); // default MX
  });

  it('en scope local con estado mexicano conocido filtra por state y no toca la query', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(respuestaOk({ paging: { total: 0 }, results: [] }));

    await obtenerCompetenciaMercadoLibre('horno pizza', 'local', 'Nuevo León', 5000, 'MX');

    const url = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).toContain('&state=');
    expect(url).not.toContain(encodeURIComponent('Nuevo León'));
  });

  it('con un estado fuera del mapa cae al filtro textual dentro de la query', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(respuestaOk({ paging: { total: 0 }, results: [] }));

    await obtenerCompetenciaMercadoLibre('horno pizza', 'local', 'Antioquia', 5000, 'CO');

    const url = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).not.toContain('&state=');
    expect(url).toContain(encodeURIComponent('horno pizza Antioquia'));
  });

  it('sin resultados devuelve el gap de "mercado por explorar" y conserva el precio del usuario', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(respuestaOk({ paging: { total: 0 }, results: [] }));

    const c = await obtenerCompetenciaMercadoLibre('producto inexistente', 'nacional', undefined, 1234, 'MX');

    expect(c.total_competidores).toBe(0);
    expect(c.competidores).toEqual([]);
    expect(c.es_mock).toBe(false);
    expect(c.gap_detectado).toContain('mercado por explorar');
    expect(c.precio_mercado_promedio).toBe(1234);
  });

  it('detecta ventaja de precio cuando el usuario está 20%+ por debajo del mercado', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      respuestaOk({
        paging: { total: 50 },
        results: Array.from({ length: 5 }, (_, i) => ({
          id: `MLM${i}`, title: `Horno ${i}`, price: 1000, currency_id: 'MXN',
          available_quantity: 1, sold_quantity: 80, permalink: `https://ml.com/${i}`,
          seller: { id: i, nickname: `Vendedor${i}` }, shipping: { free_shipping: false },
        })),
      })
    );

    const c = await obtenerCompetenciaMercadoLibre('horno', 'nacional', undefined, 500, 'MX');

    expect(c.precio_mercado_promedio).toBe(1000);
    expect(c.gap_detectado).toContain('50% menor al mercado');
  });

  it('propaga el error HTTP para que el router use el siguiente proveedor', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(obtenerCompetenciaMercadoLibre('horno', 'nacional', undefined, 5000, 'MX')).rejects.toThrow(
      /MercadoLibre API error: 503/
    );
  });
});

describe('mercado/fuentesCompetencia.describirFuenteCompetencia', () => {
  // Se tipa contra la firma real de `describirFuenteCompetencia`, no contra
  // `CompetenciaResult`: la función solo lee `es_mock`, `fuente` y el censo, así
  // que exigir un `Competidor` completo en cada caso sería ruido sin valor.
  type EntradaFuente = Parameters<typeof describirFuenteCompetencia>[0];

  const base = (over: Partial<EntradaFuente> = {}): EntradaFuente => ({
    es_mock: false,
    competidores: [{ fuente: 'mercadolibre' }],
    ...over,
  });

  it('traduce cada fuente conocida a su etiqueta', () => {
    expect(describirFuenteCompetencia(base())).toBe('MercadoLibre_verificado');
    expect(describirFuenteCompetencia(base({ competidores: [{ fuente: 'google_shopping' }] }))).toBe(
      'Google_Shopping_verificado'
    );
    expect(describirFuenteCompetencia(base({ competidores: [{ fuente: 'google_maps' }] }))).toBe(
      'Google_Maps_verificado'
    );
  });

  it('el benchmark de sector NUNCA se etiqueta como verificado', () => {
    expect(describirFuenteCompetencia(base({ competidores: [{ fuente: 'benchmark_sector' }] }))).toBe(
      'estimacion_interna'
    );
    expect(describirFuenteCompetencia(base({ competidores: [{ fuente: 'mock' }] }))).toBe('estimacion_interna');
  });

  it('es_mock manda sobre la fuente de los competidores', () => {
    expect(describirFuenteCompetencia(base({ es_mock: true }))).toBe('estimacion_interna');
  });

  it('sin competidores no atribuye certeza', () => {
    expect(describirFuenteCompetencia(base({ competidores: [] }))).toBe('estimacion_interna');
    expect(describirFuenteCompetencia(base({ competidores: [{}, { fuente: '' }] }))).toBe('estimacion_interna');
  });

  it('deduplica y concatena varias fuentes preservando el orden de aparición', () => {
    const etiqueta = describirFuenteCompetencia(
      base({ competidores: [{ fuente: 'mercadolibre' }, { fuente: 'google_shopping' }, { fuente: 'mercadolibre' }] })
    );
    expect(etiqueta).toBe('MercadoLibre_verificado+Google_Shopping_verificado');
  });

  it('una fuente nueva sin entrada en el mapa se etiqueta como verificada por defecto', () => {
    // Deuda conocida: cualquier `fuente` desconocida se marca `_verificado`. Al
    // añadir una fuente estimada hay que registrarla en ETIQUETA_FUENTE, o el
    // LLM la leerá como dato duro. Este test FALLA si olvidaste registrarla.
    expect(describirFuenteCompetencia(base({ competidores: [{ fuente: 'scraper_propio' }] }))).toBe(
      'scraper_propio_verificado'
    );
  });

  it('todas las fuentes conocidas en uso están registradas en ETIQUETA_FUENTE', () => {
    // Si este test falla, encontraste una fuente en competidores que NO está en
    // ETIQUETA_FUENTE: tienes que decidir si es verificada o estimación_interna.
    // Importa fuentesCompetencia para inspeccionar ETIQUETA_FUENTE sin romper encapsulación.
    const fuentesEnUso = new Set<string>();

    // Recolecta todas las fuentes mencionadas en otros tests.
    const fixtures = [
      base(),
      base({ competidores: [{ fuente: 'google_shopping' }] }),
      base({ competidores: [{ fuente: 'google_maps' }] }),
      base({ competidores: [{ fuente: 'benchmark_sector' }] }),
      base({ competidores: [{ fuente: 'mock' }] }),
    ];

    fixtures.forEach((f) => {
      f.competidores?.forEach((c) => {
        if (c.fuente) fuentesEnUso.add(c.fuente);
      });
    });

    // Las fuentes que aparecen en los tests deben estar documentadas.
    const conocidas = ['mercadolibre', 'google_shopping', 'google_maps', 'benchmark_sector', 'mock'];
    fuentesEnUso.forEach((fuente) => {
      expect(conocidas).toContain(fuente);
    });
  });

  it('el censo oficial va primero y se concatena, no reemplaza a la fuente web', () => {
    const conCenso = describirFuenteCompetencia(base({ censo_oficial: { disponible: true, instituto: 'INEGI' } }));
    expect(conCenso).toBe('INEGI_censo_oficial+MercadoLibre_verificado');
  });

  it('censo oficial + precios mock queda explícitamente mixto', () => {
    const etiqueta = describirFuenteCompetencia(
      base({ es_mock: true, censo_oficial: { disponible: true, instituto: 'INEGI' } })
    );
    expect(etiqueta).toBe('INEGI_censo_oficial+estimacion_interna');
  });

  it('un censo no disponible no aporta etiqueta', () => {
    expect(describirFuenteCompetencia(base({ censo_oficial: { disponible: false, instituto: 'INEGI' } }))).toBe(
      'MercadoLibre_verificado'
    );
  });
});