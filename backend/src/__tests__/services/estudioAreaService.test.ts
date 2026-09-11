import { calcularEstudioArea } from '../../services/zona/estudioAreaService';
import { resetCachePrecioM2 } from '../../services/zona/precioM2Service';
import { resetCachePrecioVenta } from '../../services/zona/precioViviendaService';

const ENV_KEYS = [
  'ZONA_PRECIOS_M2_JSON',
  'ZONA_PRECIOS_API_URL',
  'ZONA_PRECIOS_API_KEY',
  'ZONA_VENTA_M2_JSON',
  'ZONA_VENTA_API_URL',
  'ZONA_VENTA_API_KEY',
] as const;

describe('estudioAreaService.calcularEstudioArea', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
    resetCachePrecioM2();
    resetCachePrecioVenta();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    resetCachePrecioM2();
    resetCachePrecioVenta();
  });

  it('cruza renta y compra con datos declarados y concluye comprar si el yield es alto', async () => {
    const r = await calcularEstudioArea({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      precio_venta_m2_declarado: 30_000,
      moneda: 'MXN',
    });

    expect(r.m2_totales).toBe(50);
    expect(r.fuente_superficie).toBe('declarada');
    expect(r.renta_mensual).toBe(25_000);
    expect(r.renta_anual).toBe(300_000);
    expect(r.precio_venta_m2).toBe(30_000);
    expect(r.valor_compra_estimado).toBe(1_500_000);
    expect(r.yield_bruto_anual_pct).toBe(20);
    expect(r.meses_renta_equivalentes).toBe(60);
    expect(r.multiplo_precio_renta_anual).toBe(5);
    expect(r.moneda).toBe('MXN');
    expect(r.veredicto).toBe('comprar');
    expect(r.nivel_confianza).toBe('alta');
    expect(r.nota).toContain('60 meses');
    // Único aviso esperado: que la comparación es bruta.
    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0]).toContain('aritmética');
  });

  it('concluye rentar cuando el precio de compra es caro frente a la renta', async () => {
    const r = await calcularEstudioArea({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      precio_venta_m2_declarado: 150_000,
    });

    expect(r.valor_compra_estimado).toBe(7_500_000);
    expect(r.yield_bruto_anual_pct).toBe(4);
    expect(r.meses_renta_equivalentes).toBe(300);
    expect(r.multiplo_precio_renta_anual).toBe(25);
    expect(r.veredicto).toBe('rentar');
  });

  it('la banda intermedia del yield no decide: equilibrado', async () => {
    const r = await calcularEstudioArea({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      precio_venta_m2_declarado: 100_000,
    });

    expect(r.yield_bruto_anual_pct).toBe(6);
    expect(r.veredicto).toBe('equilibrado');
  });

  it('sin precio de venta no hay valor de compra ni veredicto, y se dice qué falta', async () => {
    const r = await calcularEstudioArea({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      pais: 'MX',
      estado: 'Jalisco',
      zona: 'Providencia',
    });

    expect(r.renta_mensual).toBe(25_000);
    expect(r.precio_venta_m2).toBeNull();
    expect(r.valor_compra_estimado).toBeNull();
    expect(r.yield_bruto_anual_pct).toBeNull();
    expect(r.meses_renta_equivalentes).toBeNull();
    expect(r.multiplo_precio_renta_anual).toBeNull();
    expect(r.veredicto).toBe('sin_conclusion');
    expect(r.nota).toContain('falta el precio de venta por m²');
    expect(r.advertencias.join(' ')).toContain('Providencia');
  });

  it('sin renta pero con precio de venta valora la compra y avisa de lo que falta', async () => {
    const r = await calcularEstudioArea({
      tipo_local: 'retail',
      m2_declarados: 40,
      precio_venta_m2_declarado: 30_000,
      pais: 'MX',
      estado: 'Jalisco',
    });

    expect(r.renta_mensual).toBeNull();
    expect(r.renta_anual).toBeNull();
    expect(r.valor_compra_estimado).toBe(1_200_000);
    expect(r.yield_bruto_anual_pct).toBeNull();
    expect(r.veredicto).toBe('sin_conclusion');
    expect(r.nota).toContain('falta la renta mensual');
  });

  it('sin datos de ninguno de los dos lados no hay estudio que sostener', async () => {
    const r = await calcularEstudioArea({ tipo_local: 'retail', m2_declarados: 40 });

    expect(r.renta_mensual).toBeNull();
    expect(r.valor_compra_estimado).toBeNull();
    expect(r.veredicto).toBe('sin_conclusion');
    expect(r.nota).toContain('todavía no hay estudio del área');
  });

  it('sin local físico no hay área que valorar', async () => {
    const r = await calcularEstudioArea({ tipo_local: 'sin_local', unidades_mes: 3000 });

    expect(r.m2_totales).toBeNull();
    expect(r.fuente_superficie).toBe('no_aplica');
    expect(r.renta_mensual).toBe(0);
    expect(r.renta_anual).toBe(0);
    expect(r.precio_venta_m2).toBeNull();
    expect(r.valor_compra_estimado).toBeNull();
    expect(r.veredicto).toBe('sin_conclusion');
    expect(r.nivel_confianza).toBe('alta');
    expect(r.supuestos).toEqual([]);
    expect(r.nota).toContain('sin local físico');
  });

  it('con superficie estimada la confianza baja a media pero el veredicto se mantiene', async () => {
    const r = await calcularEstudioArea({
      tipo_local: 'produccion_alimentos',
      personal: 3,
      unidades_mes: 2000,
      precio_m2_mes_declarado: 300,
      precio_venta_m2_declarado: 20_000,
    });

    // 42 m² estimados por el modelo operativo.
    expect(r.m2_totales).toBe(42);
    expect(r.fuente_superficie).toBe('modelo_operativo');
    expect(r.renta_mensual).toBe(12_600);
    expect(r.valor_compra_estimado).toBe(840_000);
    expect(r.yield_bruto_anual_pct).toBe(18);
    expect(r.nivel_confianza).toBe('media');
    expect(r.veredicto).toBe('comprar');
    expect(r.supuestos.length).toBeGreaterThan(0);
    expect(r.advertencias.some((a) => a.includes('estimación'))).toBe(true);
  });

  it('usa las tablas del operador y marca que son referencias de zona', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({ 'MX|Jalisco': 400 });
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({ 'MX|Jalisco': 25_000 });
    resetCachePrecioM2();
    resetCachePrecioVenta();

    const r = await calcularEstudioArea({
      tipo_local: 'retail',
      m2_declarados: 30,
      pais: 'MX',
      estado: 'Jalisco',
    });

    expect(r.renta_mensual).toBe(12_000);
    expect(r.valor_compra_estimado).toBe(750_000);
    expect(r.yield_bruto_anual_pct).toBe(19.2);
    expect(r.nivel_confianza).toBe('media');
    expect(r.veredicto).toBe('comprar');
    expect(r.advertencias.some((a) => a.includes('referencia'))).toBe(true);
    expect(r.advertencias.some((a) => a.includes('tasación'))).toBe(true);
  });

  it('avisa cuando renta y venta vienen en monedas distintas', async () => {
    process.env.ZONA_PRECIOS_M2_JSON = JSON.stringify({
      'MX|Jalisco': { precio_m2_mes: 400, moneda: 'MXN' },
    });
    process.env.ZONA_VENTA_M2_JSON = JSON.stringify({
      'MX|Jalisco': { precio_venta_m2: 2_000, moneda: 'USD' },
    });
    resetCachePrecioM2();
    resetCachePrecioVenta();

    const r = await calcularEstudioArea({
      tipo_local: 'retail',
      m2_declarados: 30,
      pais: 'MX',
      estado: 'Jalisco',
    });

    expect(r.advertencias.some((a) => a.includes('no es directa'))).toBe(true);
  });

  it('conserva el bloque de renta completo para no recalcularlo aguas abajo', async () => {
    const r = await calcularEstudioArea({
      tipo_local: 'retail',
      m2_declarados: 50,
      precio_m2_mes_declarado: 500,
      renta_declarada: 27_000,
      precio_venta_m2_declarado: 30_000,
    });

    expect(r.renta.origen).toBe('declarada');
    expect(r.renta.renta_estimada_m2).toBe(25_000);
    expect(r.renta_mensual).toBe(27_000);
    expect(r.renta_anual).toBe(324_000);
    // El veredicto usa la renta declarada, no la del modelo.
    expect(r.yield_bruto_anual_pct).toBe(21.6);
  });
});