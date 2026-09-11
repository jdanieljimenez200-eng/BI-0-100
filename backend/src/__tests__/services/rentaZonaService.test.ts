import { calcularRentaZona } from '../../services/zona/rentaZonaService';
import { resetCachePrecioM2 } from '../../services/zona/precioM2Service';

const ENV_KEYS = ['ZONA_PRECIOS_M2_JSON', 'ZONA_PRECIOS_API_URL', 'ZONA_PRECIOS_API_KEY'] as const;

describe('rentaZonaService.calcularRentaZona', () => {
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

  it('deriva la renta como m² × precio por m²', async () => {
    const r = await calcularRentaZona({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      moneda: 'MXN',
    });

    expect(r.renta_mensual).toBe(25_000);
    expect(r.origen).toBe('derivada_m2');
    expect(r.m2_totales).toBe(50);
    expect(r.precio_m2_mes).toBe(500);
    expect(r.nivel_confianza).toBe('alta');
    expect(r.advertencias).toEqual([]);
  });

  it('la confianza baja a media cuando los m² son estimados', async () => {
    const r = await calcularRentaZona({
      tipo_local: 'produccion_alimentos',
      personal: 3,
      unidades_mes: 2000,
      precio_m2_mes_declarado: 300,
    });

    // 42 m² estimados × 300 = 12.600
    expect(r.m2_totales).toBe(42);
    expect(r.renta_mensual).toBe(12_600);
    expect(r.nivel_confianza).toBe('media');
    expect(r.advertencias.some((a) => a.includes('estimación'))).toBe(true);
  });

  it('sin precio por m² no hay renta: null y qué falta', async () => {
    const r = await calcularRentaZona({
      tipo_local: 'retail',
      m2_declarados: 50,
      pais: 'MX',
      estado: 'Jalisco',
      zona: 'Providencia',
    });

    expect(r.renta_mensual).toBeNull();
    expect(r.origen).toBe('no_disponible');
    expect(r.m2_totales).toBe(50);
    expect(r.renta_estimada_m2).toBeNull();
    expect(r.nivel_confianza).toBe('baja');
    expect(r.advertencias.join(' ')).toContain('precio por m²');
  });

  it('la renta declarada por el usuario manda sobre la derivada', async () => {
    const r = await calcularRentaZona({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      renta_declarada: 27_000,
    });

    expect(r.renta_mensual).toBe(27_000);
    expect(r.origen).toBe('declarada');
    expect(r.renta_estimada_m2).toBe(25_000);
    expect(r.nivel_confianza).toBe('alta');
    // 8% de desvío: dentro de lo normal, sin advertencia.
    expect(r.advertencias).toEqual([]);
  });

  it('avisa cuando la renta declarada se desvía mucho de la zona', async () => {
    const alta = await calcularRentaZona({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      renta_declarada: 40_000,
    });
    expect(alta.advertencias.some((a) => a.includes('60% por encima'))).toBe(true);

    const baja = await calcularRentaZona({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      renta_declarada: 10_000,
    });
    expect(baja.advertencias.some((a) => a.includes('60% por debajo'))).toBe(true);
  });

  it('sin local físico la renta es 0, no null', async () => {
    const r = await calcularRentaZona({ tipo_local: 'sin_local', unidades_mes: 3000 });
    expect(r.renta_mensual).toBe(0);
    expect(r.origen).toBe('sin_local');
    expect(r.nivel_confianza).toBe('alta');
  });

  it('sin local pero con renta declarada la respeta y lo señala', async () => {
    const r = await calcularRentaZona({ tipo_local: 'sin_local', renta_declarada: 4500 });
    expect(r.renta_mensual).toBe(4500);
    expect(r.origen).toBe('declarada');
    expect(r.advertencias.length).toBe(1);
  });

  it('usa la tabla del operador cuando el usuario no declara precio', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({ 'MX|Jalisco': 400 });
    resetCachePrecioM2();

    const r = await calcularRentaZona({
      tipo_local: 'retail',
      m2_declarados: 30,
      pais: 'MX',
      estado: 'Jalisco',
    });

    expect(r.renta_mensual).toBe(12_000);
    expect(r.origen).toBe('derivada_m2');
    // Superficie declarada (alta) + referencia de zona (media) → media.
    expect(r.nivel_confianza).toBe('media');
    expect(r.advertencias.some((a) => a.includes('referencia'))).toBe(true);
  });
});