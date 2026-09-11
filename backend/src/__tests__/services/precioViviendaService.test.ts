import {
  obtenerPrecioVentaM2,
  resetCachePrecioVenta,
} from '../../services/zona/precioViviendaService';

const ENV_KEYS = ['ZONA_VENTA_M2_JSON', 'ZONA_VENTA_API_URL', 'ZONA_VENTA_API_KEY'] as const;

type FetchFn = typeof globalThis.fetch;

/** Respuesta mínima que consume el servicio (ok + json), sin traer undici. */
function respuestaFalsa(body: unknown, ok = true): FetchFn {
  return jest.fn(async () => ({ ok, json: async () => body })) as unknown as FetchFn;
}

describe('precioViviendaService.obtenerPrecioVentaM2', () => {
  const original: Record<string, string | undefined> = {};
  const fetchOriginal: FetchFn = globalThis.fetch;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
    resetCachePrecioVenta();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    globalThis.fetch = fetchOriginal;
    resetCachePrecioVenta();
  });

  it('el precio declarado por el usuario gana a la tabla del operador', async () => {
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({ 'MX|Jalisco': 25_000 });
    resetCachePrecioVenta();

    const r = await obtenerPrecioVentaM2({
      precio_venta_m2_declarado: 31_500,
      pais: 'MX',
      estado: 'Jalisco',
      moneda: 'MXN',
    });

    expect(r.precio_venta_m2).toBe(31_500);
    expect(r.fuente).toBe('declarado');
    expect(r.es_mock).toBe(false);
    expect(r.nivel_confianza).toBe('alta');
    expect(r.moneda).toBe('MXN');
  });

  it('sin ninguna fuente devuelve null en vez de inventar un precio de venta', async () => {
    const r = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Jalisco', zona: 'Providencia' });

    expect(r.precio_venta_m2).toBeNull();
    expect(r.fuente).toBe('sin_fuente');
    expect(r.es_mock).toBe(true);
    expect(r.nivel_confianza).toBe('baja');
    expect(r.nota).toContain('Providencia');
  });

  it('lee la tabla del operador con precio plano y con objeto', async () => {
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({
      'MX|CDMX|Polanco': 95_000,
      'MX|Jalisco': { precio_venta_m2: 25_000, moneda: 'MXN' },
    });
    resetCachePrecioVenta();

    const polanco = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'CDMX', zona: 'Polanco' });
    expect(polanco.precio_venta_m2).toBe(95_000);
    expect(polanco.fuente).toBe('tabla_operador');
    // Referencia curada de zona, no la tasación de un inmueble: nunca 'alta'.
    expect(polanco.nivel_confianza).toBe('media');
    expect(polanco.es_mock).toBe(false);

    const jalisco = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Jalisco' });
    expect(jalisco.precio_venta_m2).toBe(25_000);
    expect(jalisco.moneda).toBe('MXN');
  });

  it('la búsqueda ignora acentos, mayúsculas y espacios', async () => {
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({ 'MX|Nuevo León': 40_000 });
    resetCachePrecioVenta();

    const r = await obtenerPrecioVentaM2({ pais: 'mx', estado: '  NUEVO LEON  ' });
    expect(r.precio_venta_m2).toBe(40_000);
  });

  it('cae del nivel zona al nivel estado cuando la zona no está en la tabla', async () => {
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({ 'MX|Jalisco': 25_000 });
    resetCachePrecioVenta();

    const r = await obtenerPrecioVentaM2({
      pais: 'MX',
      estado: 'Jalisco',
      zona: 'Colonia Inexistente',
    });
    expect(r.precio_venta_m2).toBe(25_000);
    expect(r.nota).toContain('estado');
  });

  it('un estado sin coincidencia no hereda el precio de otro', async () => {
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({ 'MX|CDMX|Polanco': 95_000 });
    resetCachePrecioVenta();

    const r = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Yucatán' });
    expect(r.precio_venta_m2).toBeNull();
    expect(r.fuente).toBe('sin_fuente');
  });

  it('ignora entradas inválidas de la tabla y precios declarados absurdos', async () => {
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({
      'MX|Jalisco': -50,
      'MX|CDMX': 'carísimo',
      'MX|Puebla': { precio_venta_m2: 0 },
      'MX|Sonora': 18_000,
    });
    resetCachePrecioVenta();

    expect((await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Jalisco' })).precio_venta_m2).toBeNull();
    expect((await obtenerPrecioVentaM2({ pais: 'MX', estado: 'CDMX' })).precio_venta_m2).toBeNull();
    expect((await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Puebla' })).precio_venta_m2).toBeNull();
    expect((await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Sonora' })).precio_venta_m2).toBe(18_000);

    const negativo = await obtenerPrecioVentaM2({
      precio_venta_m2_declarado: -1_000,
      pais: 'MX',
      estado: 'Yucatán',
    });
    expect(negativo.precio_venta_m2).toBeNull();
    expect(negativo.fuente).toBe('sin_fuente');
  });

  it('un JSON corrupto en la env no rompe la consulta', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.ZONA_VENTA_M2_JSON = '{ esto no es json';
    resetCachePrecioVenta();

    const r = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Jalisco' });
    expect(r.precio_venta_m2).toBeNull();
    expect(r.fuente).toBe('sin_fuente');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('usa el servicio externo cuando está configurado, con confianza por muestras', async () => {
    process.env.ZONA_VENTA_API_URL = 'https://zona.example.test/venta';
    globalThis.fetch = respuestaFalsa({
      precio_venta_m2: 35_123.456,
      moneda: 'MXN',
      n_muestras: 12,
    });

    const r = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Jalisco', zona: 'Providencia' });

    expect(r.precio_venta_m2).toBe(35_123.46);
    expect(r.fuente).toBe('api_externa');
    expect(r.nivel_confianza).toBe('alta');
    expect(r.es_mock).toBe(false);
    expect(r.nota).toContain('12 muestras');
  });

  it('pocas muestras del servicio externo bajan la confianza a media', async () => {
    process.env.ZONA_VENTA_API_URL = 'https://zona.example.test/venta';
    globalThis.fetch = respuestaFalsa({ precio_venta_m2: 28_000, n_muestras: 2 });

    const r = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Jalisco' });
    expect(r.nivel_confianza).toBe('media');
    expect(r.fuente).toBe('api_externa');
  });

  it('si el servicio externo falla cae a la tabla del operador', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.ZONA_VENTA_API_URL = 'https://zona.example.test/venta';
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({ 'MX|Jalisco': 25_000 });
    resetCachePrecioVenta();
    globalThis.fetch = jest.fn(async () => {
      throw new Error('red caída');
    }) as unknown as FetchFn;

    const r = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Jalisco' });

    expect(r.precio_venta_m2).toBe(25_000);
    expect(r.fuente).toBe('tabla_operador');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('una respuesta externa sin precio utilizable no se propaga como dato', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.ZONA_VENTA_API_URL = 'https://zona.example.test/venta';
    globalThis.fetch = respuestaFalsa({ precio_venta_m2: 'no sé' });

    const r = await obtenerPrecioVentaM2({ pais: 'MX', estado: 'Jalisco' });
    expect(r.precio_venta_m2).toBeNull();
    expect(r.fuente).toBe('sin_fuente');
    expect(r.es_mock).toBe(true);
    warn.mockRestore();
  });
});