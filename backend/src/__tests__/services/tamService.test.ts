import { calcularFrecuenciaCompraAnual, calcularTam, TamInput } from '../../services/mercado/tamService';

// Poblaciones ancladas en utils/latam.ts. Si alguien cambia la fuente de datos
// demográficos, estos tests deben fallar de forma explícita.
const POBLACION_MX = 130_000_000;
const POBLACION_CO = 52_000_000;
const POBLACION_BZ = 441_000;
const POBLACION_JALISCO = 8_348_151;

const inputBase: TamInput = {
  pais: 'MX',
  region: null,
  scope: 'nacional',
  nseTarget: null,
  precioUnitario: 100,
  categoria: 'Otro',
  margenPct: 30,
  frecuenciaCompraAnual: 1,
};

function unidadesMesEsperadas(poblacion: number, penetracionPct: number, frecuencia = 1): number {
  const clientes = Math.round(poblacion * (penetracionPct / 100));
  return Math.round((clientes * frecuencia) / 12);
}

describe('tamService.calcularFrecuenciaCompraAnual', () => {
  it('sin forma de cobro asume 1 compra al año (caso conservador)', () => {
    expect(calcularFrecuenciaCompraAnual()).toBe(1);
    expect(calcularFrecuenciaCompraAnual(null, null)).toBe(1);
    expect(calcularFrecuenciaCompraAnual('', 6)).toBe(1);
  });

  it('Pago Único es 1 compra al año aunque venga recurrencia', () => {
    expect(calcularFrecuenciaCompraAnual('Pago Único', 6)).toBe(1);
  });

  it('Suscripción sin recurrencia declarada asume los 12 meses', () => {
    expect(calcularFrecuenciaCompraAnual('Suscripción')).toBe(12);
    expect(calcularFrecuenciaCompraAnual('Suscripción', null)).toBe(12);
  });

  it('Suscripción usa los meses de permanencia declarados', () => {
    expect(calcularFrecuenciaCompraAnual('Suscripción', 6)).toBe(6);
    expect(calcularFrecuenciaCompraAnual('suscripcion mensual', 3)).toBe(3);
  });

  it('acota la recurrencia a 12 porque el TAM se proyecta a un año', () => {
    expect(calcularFrecuenciaCompraAnual('Suscripción', 24)).toBe(12);
    expect(calcularFrecuenciaCompraAnual('Suscripción', 12)).toBe(12);
  });

  it('recurrencia inválida o fuera de rango cae en 12', () => {
    expect(calcularFrecuenciaCompraAnual('Suscripción', 0)).toBe(12);
    expect(calcularFrecuenciaCompraAnual('Suscripción', -5)).toBe(12);
    expect(calcularFrecuenciaCompraAnual('Suscripción', Number.NaN)).toBe(12);
  });

  it('trunca meses fraccionarios hacia abajo', () => {
    expect(calcularFrecuenciaCompraAnual('Suscripción', 3.9)).toBe(3);
    expect(calcularFrecuenciaCompraAnual('Suscripción', 1.2)).toBe(1);
  });
});

describe('tamService.calcularTam — escenarios', () => {
  it('expone las penetraciones 0.1 / 0.25 / 0.5 por escenario', () => {
    const { tam_escenarios } = calcularTam(inputBase);
    expect(tam_escenarios.pesimista.penetracion).toBe(0.1);
    expect(tam_escenarios.realista.penetracion).toBe(0.25);
    expect(tam_escenarios.optimista.penetracion).toBe(0.5);
  });

  it('tam_minimo / tam_promedio / tam_maximo mapean a pesimista / realista / optimista', () => {
    const r = calcularTam(inputBase);
    expect(r.tam_minimo).toBe(r.tam_escenarios.pesimista.mercado_anual);
    expect(r.tam_promedio).toBe(r.tam_escenarios.realista.mercado_anual);
    expect(r.tam_maximo).toBe(r.tam_escenarios.optimista.mercado_anual);
  });

  it('los escenarios son estrictamente crecientes', () => {
    const { tam_escenarios } = calcularTam(inputBase);
    expect(tam_escenarios.pesimista.mercado_anual).toBeLessThan(tam_escenarios.realista.mercado_anual);
    expect(tam_escenarios.realista.mercado_anual).toBeLessThan(tam_escenarios.optimista.mercado_anual);
  });

  it('mercado_anual = mercado_mensual × 12 en los tres escenarios', () => {
    const { tam_escenarios } = calcularTam(inputBase);
    for (const esc of [tam_escenarios.pesimista, tam_escenarios.realista, tam_escenarios.optimista]) {
      expect(esc.mercado_anual).toBe(esc.mercado_mensual * 12);
    }
  });

  it('mercado_mensual = unidades_mes × precio unitario', () => {
    const r = calcularTam({ ...inputBase, precioUnitario: 250 });
    for (const esc of Object.values(r.tam_escenarios)) {
      expect(esc.mercado_mensual).toBe(esc.unidades_mes * 250);
    }
  });

  it('ganancia_mes = mercado_mensual × margen', () => {
    const r = calcularTam({ ...inputBase, margenPct: 40 });
    for (const esc of Object.values(r.tam_escenarios)) {
      expect(esc.ganancia_mes).toBe(Math.round(esc.mercado_mensual * 0.4));
    }
  });

  it('margen 0 deja ganancia en 0 sin producir NaN', () => {
    const r = calcularTam({ ...inputBase, margenPct: 0 });
    for (const esc of Object.values(r.tam_escenarios)) {
      expect(esc.ganancia_mes).toBe(0);
      expect(Number.isNaN(esc.ganancia_mes)).toBe(false);
    }
  });

  it('precio 0 deja el mercado en 0 pero conserva las unidades potenciales', () => {
    const r = calcularTam({ ...inputBase, precioUnitario: 0 });
    expect(r.tam_promedio).toBe(0);
    expect(r.tam_escenarios.realista.mercado_mensual).toBe(0);
    expect(r.tam_escenarios.realista.ganancia_mes).toBe(0);
    expect(r.tam_escenarios.realista.unidades_mes).toBeGreaterThan(0);
  });

  it('la frecuencia de compra multiplica las unidades mensuales', () => {
    const anual = calcularTam({ ...inputBase, frecuenciaCompraAnual: 1 });
    const mensual = calcularTam({ ...inputBase, frecuenciaCompraAnual: 12 });

    // Con frecuencia 12, las unidades del mes igualan a los clientes potenciales.
    expect(mensual.tam_escenarios.realista.unidades_mes).toBe(
      Math.round(POBLACION_MX * 0.0025),
    );
    expect(mensual.tam_escenarios.realista.unidades_mes).toBeGreaterThan(
      anual.tam_escenarios.realista.unidades_mes,
    );
  });

  it('sin frecuencia explícita asume 1 compra al año', () => {
    const { frecuenciaCompraAnual: _omitida, ...sinFrecuencia } = inputBase;
    const r = calcularTam(sinFrecuencia as TamInput);
    expect(r.tam_escenarios.realista.unidades_mes).toBe(
      unidadesMesEsperadas(POBLACION_MX, 0.25, 1),
    );
  });
});

describe('tamService.calcularTam — geografía y moneda', () => {
  it('scope nacional usa la población y la moneda del país', () => {
    const r = calcularTam(inputBase);
    expect(r.ubicacion).toBe('México');
    expect(r.moneda).toBe('MXN');
    expect(r.tam_escenarios.realista.unidades_mes).toBe(
      unidadesMesEsperadas(POBLACION_MX, 0.25),
    );
  });

  it('otro país usa su propia población y divisa', () => {
    const r = calcularTam({ ...inputBase, pais: 'CO' });
    expect(r.ubicacion).toBe('Colombia');
    expect(r.moneda).toBe('COP');
    expect(r.tam_escenarios.realista.unidades_mes).toBe(
      unidadesMesEsperadas(POBLACION_CO, 0.25),
    );
  });

  it('país minúsculo se normaliza', () => {
    const r = calcularTam({ ...inputBase, pais: 'co' });
    expect(r.moneda).toBe('COP');
  });

  it('país desconocido cae a México pero conserva el código recibido', () => {
    const r = calcularTam({ ...inputBase, pais: 'ZZ' });
    expect(r.pais).toBe('ZZ');
    expect(r.moneda).toBe('MXN');
    expect(r.ubicacion).toBe('México');
  });

  it('scope local con región conocida usa la población regional', () => {
    const r = calcularTam({ ...inputBase, scope: 'local', region: 'Jalisco' });
    expect(r.ubicacion).toBe('Jalisco, México');
    expect(r.tam_escenarios.realista.unidades_mes).toBe(
      unidadesMesEsperadas(POBLACION_JALISCO, 0.25),
    );
  });

  it('scope local normaliza acentos y espacios de la región', () => {
    const conAcento = calcularTam({ ...inputBase, scope: 'local', region: 'Ciudad de México' });
    expect(conAcento.tam_escenarios.realista.unidades_mes).toBe(
      unidadesMesEsperadas(9_209_944, 0.25),
    );
  });

  it('scope local sin región cae al 15% de la población nacional', () => {
    const r = calcularTam({ ...inputBase, scope: 'local', region: null });
    expect(r.ubicacion).toBe('México');
    expect(r.tam_escenarios.realista.unidades_mes).toBe(
      unidadesMesEsperadas(Math.round(POBLACION_MX * 0.15), 0.25),
    );
  });

  it('región desconocida también cae al 15% nacional, no a cero', () => {
    const r = calcularTam({ ...inputBase, scope: 'local', region: 'Region Inexistente' });
    expect(r.tam_promedio).toBeGreaterThan(0);
    expect(r.tam_escenarios.realista.unidades_mes).toBe(
      unidadesMesEsperadas(Math.round(POBLACION_MX * 0.15), 0.25),
    );
  });

  it('scope regional se comporta como local', () => {
    const regional = calcularTam({ ...inputBase, scope: 'regional', region: 'Jalisco' });
    const local = calcularTam({ ...inputBase, scope: 'local', region: 'Jalisco' });
    expect(regional.tam_promedio).toBe(local.tam_promedio);
    expect(regional.scope).toBe('regional');
  });

  it('países pequeños no colapsan a 0 unidades en el escenario pesimista', () => {
    const r = calcularTam({ ...inputBase, pais: 'BZ' });
    expect(r.tam_escenarios.pesimista.unidades_mes).toBe(
      unidadesMesEsperadas(POBLACION_BZ, 0.1),
    );
    expect(r.tam_escenarios.pesimista.unidades_mes).toBeGreaterThan(0);
  });
});

describe('tamService.calcularTam — filtro NSE', () => {
  it('acepta "A/B" y lo resuelve a la clave ab (7% de la población)', () => {
    const r = calcularTam({ ...inputBase, nseTarget: 'A/B' });
    expect(r.nse_aplicado).toBe('AB');
    expect(r.pct_mercado_nse).toBe(7);
    expect(r.tam_escenarios.realista.unidades_mes).toBe(
      unidadesMesEsperadas(Math.round(POBLACION_MX * 0.07), 0.25),
    );
  });

  it('ignora el prefijo "nse" del texto libre', () => {
    const r = calcularTam({ ...inputBase, nseTarget: 'nse c+' });
    expect(r.nse_aplicado).toBe('C+');
    expect(r.pct_mercado_nse).toBe(14);
  });

  it('suma los porcentajes de varios segmentos separados por coma', () => {
    const r = calcularTam({ ...inputBase, nseTarget: 'C+, C' });
    expect(r.nse_aplicado).toBe('C+, C');
    expect(r.pct_mercado_nse).toBe(34);
  });

  it('acepta segmentos unidos con " y "', () => {
    const r = calcularTam({ ...inputBase, nseTarget: 'D+ y D' });
    expect(r.nse_aplicado).toBe('D+, D');
    expect(r.pct_mercado_nse).toBe(37);
  });

  it('deduplica segmentos repetidos', () => {
    const r = calcularTam({ ...inputBase, nseTarget: 'C+, c+, C+' });
    expect(r.nse_aplicado).toBe('C+');
    expect(r.pct_mercado_nse).toBe(14);
  });

  it('un NSE no reconocido no filtra la población ni ensucia el resultado', () => {
    const sinNse = calcularTam(inputBase);
    const nseBasura = calcularTam({ ...inputBase, nseTarget: 'segmento premium XYZ' });

    expect(nseBasura.nse_aplicado).toBeUndefined();
    expect(nseBasura.pct_mercado_nse).toBeUndefined();
    expect(nseBasura.tam_promedio).toBe(sinNse.tam_promedio);
  });

  it('nseTarget vacío se ignora', () => {
    const r = calcularTam({ ...inputBase, nseTarget: '   ' });
    expect(r.nse_aplicado).toBeUndefined();
    expect(r.tam_promedio).toBe(calcularTam(inputBase).tam_promedio);
  });

  it('el filtro NSE siempre reduce el TAM frente a la población total', () => {
    const sinNse = calcularTam(inputBase);
    const conNse = calcularTam({ ...inputBase, nseTarget: 'AB' });
    expect(conNse.tam_promedio).toBeLessThan(sinNse.tam_promedio);
  });
});

describe('tamService.calcularTam — estacionalidad', () => {
  it('alimentos: 12 meses con pico navideño', () => {
    const r = calcularTam({ ...inputBase, categoria: 'Alimentos y bebidas' });
    expect(r.estacionalidad).toHaveLength(12);
    expect(r.estacionalidad?.find((m) => m.mes === 'Diciembre')?.factor).toBe(1.4);
  });

  it('tecnología: detecta la categoría por "electr" y marca el pico de noviembre', () => {
    const r = calcularTam({ ...inputBase, categoria: 'Electrónicos' });
    expect(r.estacionalidad?.find((m) => m.mes === 'Noviembre')?.factor).toBe(1.5);
  });

  it('moda: detecta la categoría por "ropa"', () => {
    const r = calcularTam({ ...inputBase, categoria: 'Ropa y accesorios' });
    expect(r.estacionalidad?.find((m) => m.mes === 'Enero')?.factor).toBe(1.1);
  });

  it('servicios: detecta la cuesta de enero', () => {
    const r = calcularTam({ ...inputBase, categoria: 'Servicios profesionales' });
    expect(r.estacionalidad?.find((m) => m.mes === 'Enero')?.factor).toBe(0.8);
  });

  it('categoría sin curva conocida omite el campo estacionalidad', () => {
    const r = calcularTam({ ...inputBase, categoria: 'Mascotas' });
    expect(r.estacionalidad).toBeUndefined();
  });

  it('todos los factores estacionales son positivos y traen razón', () => {
    const r = calcularTam({ ...inputBase, categoria: 'Alimentos y bebidas' });
    for (const mes of r.estacionalidad ?? []) {
      expect(mes.factor).toBeGreaterThan(0);
      expect(mes.razon.length).toBeGreaterThan(0);
    }
  });
});

describe('calcularTam — hasta dónde llegan nuestras tablas', () => {
  it('fuera de México no se aplica el NSE de AMAI', () => {
    const co = calcularTam({ ...inputBase, pais: 'CO', nseTarget: 'C+' });

    // La población NO se recorta y se explica por qué.
    expect(co.nse_aplicado).toBeUndefined();
    expect(co.supuestos.poblacion_base).toBe(POBLACION_CO);
    expect(co.supuestos.advertencias.join(' ')).toMatch(/AMAI/);
  });

  it('en México el NSE sí recorta la población', () => {
    const mx = calcularTam({ ...inputBase, nseTarget: 'C+' });

    expect(mx.nse_aplicado).toBe('C+');
    expect(mx.supuestos.poblacion_base).toBeLessThan(POBLACION_MX);
  });

  it('el calendario comercial mexicano no se exporta a otros países', () => {
    const mx = calcularTam({ ...inputBase, categoria: 'Alimentos y bebidas' });
    const br = calcularTam({ ...inputBase, pais: 'BR', categoria: 'Alimentos y bebidas' });

    expect(mx.estacionalidad).toBeDefined();
    expect(br.estacionalidad).toBeUndefined();
    expect(br.supuestos.advertencias.join(' ')).toMatch(/calendario comercial/i);
  });

  it('un negocio local avisa de que la base es toda la región', () => {
    const local = calcularTam({ ...inputBase, scope: 'local', region: 'Jalisco' });

    expect(local.supuestos.poblacion_base).toBe(POBLACION_JALISCO);
    expect(local.supuestos.advertencias.join(' ')).toMatch(/tu zona inmediata/);
  });

  it('las penetraciones usadas se declaran junto al resultado', () => {
    const r = calcularTam(inputBase);
    expect(r.supuestos.penetracion_pct).toEqual({ pesimista: 0.1, realista: 0.25, optimista: 0.5 });
  });
});
describe('tamService.calcularTam — el aviso y la base no se contradicen', () => {
  it('con filtro NSE el aviso declara la población del estado y la ya recortada', () => {
    const local = calcularTam({
      ...inputBase, scope: 'local', region: 'Jalisco', nseTarget: 'C+',
    });
    const aviso = local.supuestos.advertencias.join(' ');

    // El recorte por NSE sí se aplica: la base guardada no es la del estado…
    expect(local.supuestos.poblacion_base).toBeLessThan(POBLACION_JALISCO);
    // …y el aviso nombra los dos números. Antes solo decía el de antes del
    // recorte, así que la misma pantalla enseñaba 8 348 151 en el texto y
    // 1 168 741 en `poblacion_base`.
    expect(aviso).toContain(POBLACION_JALISCO.toLocaleString('es-MX'));
    expect(aviso).toContain(local.supuestos.poblacion_base.toLocaleString('es-MX'));
  });
});
