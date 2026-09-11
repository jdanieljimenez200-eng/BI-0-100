import { obtenerPrecioM2, resetCachePrecioM2, etiquetaZona } from '../../services/zona/precioM2Service';

const ENV_KEYS = ['ZONA_PRECIOS_M2_JSON', 'ZONA_PRECIOS_API_URL', 'ZONA_PRECIOS_API_KEY'] as const;

describe('precioM2Service.obtenerPrecioM2', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
    resetCachePrecioM2();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    resetCachePrecioM2();
  });

  it('el precio declarado por el usuario gana a cualquier otra fuente', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({ 'MX|Jalisco': 620 });
    resetCachePrecioM2();

    const r = await obtenerPrecioM2({
      precio_m2_mes_declarado: 480,
      pais: 'MX',
      estado: 'Jalisco',
      moneda: 'MXN',
    });

    expect(r.precio_m2_mes).toBe(480);
    expect(r.fuente).toBe('declarado');
    expect(r.es_mock).toBe(false);
    expect(r.nivel_confianza).toBe('alta');
    expect(r.moneda).toBe('MXN');
  });

  it('sin ninguna fuente devuelve null en vez de inventar un precio de mercado', async () => {
    const r = await obtenerPrecioM2({ pais: 'MX', estado: 'Jalisco', zona: 'Providencia' });

    expect(r.precio_m2_mes).toBeNull();
    expect(r.fuente).toBe('sin_fuente');
    expect(r.es_mock).toBe(true);
    expect(r.nivel_confianza).toBe('baja');
    expect(r.nota).toContain('Providencia');
  });

  it('lee la tabla del operador con precio plano y con objeto', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({
      'MX|CDMX|Polanco': 1450,
      'MX|Jalisco': { precio_m2_mes: 620, moneda: 'MXN' },
    });
    resetCachePrecioM2();

    const polanco = await obtenerPrecioM2({ pais: 'MX', estado: 'CDMX', zona: 'Polanco' });
    expect(polanco.precio_m2_mes).toBe(1450);
    expect(polanco.fuente).toBe('tabla_operador');
    // Referencia curada de zona, no una cotización real: nunca 'alta'.
    expect(polanco.nivel_confianza).toBe('media');
    expect(polanco.es_mock).toBe(false);

    const jalisco = await obtenerPrecioM2({ pais: 'MX', estado: 'Jalisco' });
    expect(jalisco.precio_m2_mes).toBe(620);
    expect(jalisco.moneda).toBe('MXN');
  });

  it('la búsqueda en la tabla ignora acentos, mayúsculas y espacios', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({ 'MX|Nuevo León': 700 });
    resetCachePrecioM2();

    const r = await obtenerPrecioM2({ pais: 'mx', estado: '  NUEVO LEON  ' });
    expect(r.precio_m2_mes).toBe(700);
  });

  it('cae del nivel zona al nivel estado cuando la zona no está en la tabla', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({ 'MX|Jalisco': 620 });
    resetCachePrecioM2();

    const r = await obtenerPrecioM2({ pais: 'MX', estado: 'Jalisco', zona: 'Colonia Inexistente' });
    expect(r.precio_m2_mes).toBe(620);
    expect(r.nota).toContain('estado');
  });

  it('una zona sin ninguna coincidencia no hereda el precio de otra', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({ 'MX|CDMX|Polanco': 1450 });
    resetCachePrecioM2();

    const r = await obtenerPrecioM2({ pais: 'MX', estado: 'Yucatán' });
    expect(r.precio_m2_mes).toBeNull();
    expect(r.fuente).toBe('sin_fuente');
  });

  it('ignora entradas inválidas de la tabla en vez de propagar basura', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({
      'MX|Jalisco': -50,
      'MX|CDMX': 'carísimo',
      'MX|Puebla': { precio_m2_mes: 0 },
      'MX|Sonora': 300,
    });
    resetCachePrecioM2();

    expect((await obtenerPrecioM2({ pais: 'MX', estado: 'Jalisco' })).precio_m2_mes).toBeNull();
    expect((await obtenerPrecioM2({ pais: 'MX', estado: 'CDMX' })).precio_m2_mes).toBeNull();
    expect((await obtenerPrecioM2({ pais: 'MX', estado: 'Puebla' })).precio_m2_mes).toBeNull();
    expect((await obtenerPrecioM2({ pais: 'MX', estado: 'Sonora' })).precio_m2_mes).toBe(300);
  });

  it('un JSON corrupto en la env no rompe la consulta', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.ZONA_PRECIOS_M2_JSON = '{ esto no es json';
    resetCachePrecioM2();

    const r = await obtenerPrecioM2({ pais: 'MX', estado: 'Jalisco' });
    expect(r.precio_m2_mes).toBeNull();
    expect(r.fuente).toBe('sin_fuente');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('etiquetaZona no inventa ubicaciones cuando no hay datos', () => {
    expect(etiquetaZona({})).toBe('sin ubicación declarada');
    expect(etiquetaZona({ pais: 'MX', estado: 'Jalisco', zona: 'Providencia' })).toBe('Providencia, Jalisco, MX');
  });
});