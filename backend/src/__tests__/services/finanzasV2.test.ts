import { crearMensaje, hayClaveAnthropic } from '../../config/anthropic';
import { AppDataSource } from '../../config/database';
import { conSeguimientoIA } from '../../utils/seguimientoIA';
import { desplazarPorDias, economiaUnitaria } from '../../services/finanzas/economiaUnitaria';
import { generarProyeccion } from '../../services/finanzas/proyeccionService';
import { calcularBreakeven } from '../../services/finanzas/breakevenService';
import { generarResumen } from '../../services/finanzas/resumenService';
import { calcularSensibilidad } from '../../services/finanzas/sensibilidadService';
import {
  construirPromptRiesgos,
  generarRiesgosMock,
  generarRiesgosNegocio,
  type RiesgosContexto,
} from '../../services/finanzas/riesgosService';
import {
  CONTRATO_FINANZAS,
  construirMetaIaFinanzas,
  transparenciaBaseFinanzas,
  type DatosTransparenciaFinanzas,
} from '../../services/finanzas/transparenciaFinanzas';
import { inputConPais } from '../../services/finanzas/finanzasOrchestrator';
import { probarCasoFinanzas } from '../../services/finanzas/pruebaFinanzas';
import { CASOS_FINANZAS } from '../../services/ia/casosPruebaFinanzas';
import { _reiniciarCachePrompts } from '../../services/ia/registroPrompts';
import { PRECEDENCIA } from '../../services/ia/componerSistema';
import { FINANZAS_MODO } from '../../services/ia/prompts/finanzas.modo';
import { clavesDeModulo } from '../../services/ia/prompts';
import { seccionesOcultables } from '../../services/ia/seccionesCatalogo';
import type { FinanzasInput } from '../../services/finanzas/types';

jest.mock('../../config/anthropic', () => {
  const actual = jest.requireActual('../../config/anthropic');
  return { ...actual, crearMensaje: jest.fn(), hayClaveAnthropic: jest.fn(() => false) };
});

// Sin base: el registro sirve el texto del repositorio salvo que el test
// devuelva una versión anclada.
jest.mock('../../config/database', () => {
  const repo = { findOne: jest.fn(), findOneBy: jest.fn() };
  return { AppDataSource: { isInitialized: true, getRepository: () => repo, __repo: repo } };
});

const repo = (AppDataSource as unknown as { __repo: { findOne: jest.Mock; findOneBy: jest.Mock } }).__repo;
const mockCrear = crearMensaje as jest.Mock;
const mockClave = hayClaveAnthropic as jest.Mock;

beforeEach(() => {
  _reiniciarCachePrompts();
  mockCrear.mockReset();
  mockClave.mockReturnValue(false);
  repo.findOne.mockReset().mockResolvedValue(null);
  repo.findOneBy.mockReset().mockResolvedValue(null);
});

const base: FinanzasInput = {
  productoId: 'p',
  usuarioId: 'u',
  precio_venta: 116,
  costo_variable_unitario: 40,
  costos_fijos_mensuales: 5000,
  unidades_mes_inicial: 150,
  tasa_crecimiento_mensual: 5,
  inversion_inicial: 60000,
};

const conTodo = (over: Partial<FinanzasInput> = {}): FinanzasInput =>
  inputConPais(
    {
      ...base,
      precio_incluye_impuesto: true,
      comision_venta_pct: 10,
      dias_cobro: 0,
      dias_pago: 0,
      sueldo_dueno_mensual: 3000,
      pago_deuda_mensual: 0,
      ...over,
    },
    'MX'
  );

// ─── Economía por venta ─────────────────────────────────────────────────────

describe('economiaUnitaria', () => {
  it('quita el impuesto incluido, cobra la comisión sobre lo que paga el cliente y suma el sueldo a los fijos', () => {
    const e = economiaUnitaria(conTodo());
    expect(e.precio_neto).toBe(100);
    expect(e.impuesto_unitario).toBe(16);
    expect(e.comision_unitaria).toBe(11.6);
    expect(e.costo_variable_efectivo).toBe(51.6);
    expect(e.margen_unitario).toBe(48.4);
    expect(e.costos_fijos_efectivos).toBe(8000);
  });

  it('sin datos nuevos deja los números declarados tal cual', () => {
    const e = economiaUnitaria(base);
    expect(e).toMatchObject({ precio_neto: 116, impuesto_unitario: 0, comision_unitaria: 0, margen_unitario: 76, costos_fijos_efectivos: 5000 });
  });

  it('la tasa del impuesto la pone el país, no el usuario', () => {
    expect(inputConPais(base, 'CO').tasa_impuesto_consumo).toBe(0.19);
    expect(inputConPais(base, 'pe').pais).toBe('PE');
  });

  it('desplaza cobros por días, repartiendo entre meses si no es exacto', () => {
    expect(desplazarPorDias([100, 200, 300], 0)).toEqual([100, 200, 300]);
    expect(desplazarPorDias([100, 200, 300], 30)).toEqual([0, 100, 200]);
    expect(desplazarPorDias([100, 200, 300], 45)).toEqual([0, 50, 150]);
  });
});

// ─── Proyección y flujo de caja ─────────────────────────────────────────────

describe('generarProyeccion — flujo de caja', () => {
  it('sin plazos ni deuda, la caja es la utilidad y la caja necesaria la de siempre', () => {
    const p = generarProyeccion(base);
    for (const m of p.meses) expect(m.flujo_caja).toBeCloseTo(m.utilidad_neta, 2);
    const valle = Math.min(-60000, ...p.meses.map((m) => m.acumulado_neto - 60000));
    expect(p.caja_necesaria).toBeCloseTo(Math.max(0, -valle), 2);
    expect(p.capital_de_trabajo).toBe(0);
    expect(p.cobertura_deuda).toBeNull();
  });

  it('el impuesto incluido baja los ingresos y la comisión sube el costo', () => {
    const sin = generarProyeccion(base);
    const con = generarProyeccion(conTodo());
    expect(con.meses[0].ingresos).toBe(150 * 100);
    expect(con.meses[0].costo_variable_total).toBe(150 * 51.6);
    expect(con.meses[0].costos_fijos).toBe(8000);
    expect(con.totales.utilidad_neta_total).toBeLessThan(sin.totales.utilidad_neta_total);
  });

  it('cobrar a 60 días inmoviliza caja aunque la utilidad no cambie', () => {
    const contado = generarProyeccion(conTodo());
    const credito = generarProyeccion(conTodo({ dias_cobro: 60 }));
    expect(credito.totales.utilidad_neta_total).toBe(contado.totales.utilidad_neta_total);
    expect(credito.meses[0].flujo_caja).toBeLessThan(0);
    expect(credito.caja_necesaria).toBeGreaterThan(contado.caja_necesaria);
    expect(credito.capital_de_trabajo).toBeCloseTo(credito.caja_necesaria - contado.caja_necesaria, 2);
  });

  it('pagar a proveedores a 30 días libera caja', () => {
    const contado = generarProyeccion(conTodo({ dias_cobro: 30 }));
    const conPlazo = generarProyeccion(conTodo({ dias_cobro: 30, dias_pago: 30 }));
    expect(conPlazo.caja_necesaria).toBeLessThan(contado.caja_necesaria);
  });

  it('la cuota de deuda sale de la caja y se mide su cobertura', () => {
    const p = generarProyeccion(conTodo({ pago_deuda_mensual: 1000 }));
    const sinDeuda = generarProyeccion(conTodo());
    expect(p.totales.utilidad_neta_total).toBe(sinDeuda.totales.utilidad_neta_total);
    expect(p.meses[0].flujo_caja).toBeCloseTo(sinDeuda.meses[0].flujo_caja - 1000, 2);
    expect(p.cobertura_deuda).toBeCloseTo(p.totales.utilidad_neta_total / 12 / 1000, 2);
  });
});

// ─── Punto de equilibrio ────────────────────────────────────────────────────

describe('calcularBreakeven con el margen real', () => {
  it('usa el margen después de impuesto y comisiones y los fijos con sueldo', () => {
    const input = conTodo({ pago_deuda_mensual: 2000 });
    const b = calcularBreakeven(input, generarProyeccion(input).meses);
    expect(b.margen_contribucion_unitario).toBe(48.4);
    expect(b.unidades_breakeven_mes).toBe(Math.ceil(8000 / 48.4));
    expect(b.unidades_equilibrio_con_deuda).toBe(Math.ceil(10000 / 48.4));
    expect(b.escenarios[0].descripcion).not.toContain('$');
  });

  it('sin deuda no hay equilibrio con deuda', () => {
    const b = calcularBreakeven(base, generarProyeccion(base).meses);
    expect(b.unidades_equilibrio_con_deuda).toBeNull();
  });
});

// ─── Resumen ────────────────────────────────────────────────────────────────

function resumenDe(input: FinanzasInput) {
  const p = generarProyeccion(input);
  const b = calcularBreakeven(input, p.meses);
  return generarResumen(input, p, b);
}

describe('generarResumen', () => {
  it('si las comisiones se comen el margen, cada venta pierde dinero y lo dice en la moneda del país', () => {
    const r = resumenDe(inputConPais({ ...base, precio_venta: 50000, costo_variable_unitario: 45000, costos_fijos_mensuales: 1000000, comision_venta_pct: 15 }, 'CO'));
    expect(r.viabilidad).toBe('baja');
    expect(r.mensaje_viabilidad).toMatch(/Cada venta pierde dinero/);
    expect(r.mensaje_viabilidad).toContain('COP');
    expect(JSON.stringify(r)).not.toContain('$');
    expect(JSON.stringify(r)).not.toContain('México');
  });

  it('un negocio rentable que no puede pagar su deuda no es viable', () => {
    const r = resumenDe(conTodo({ pago_deuda_mensual: 500000 }));
    expect(r.viabilidad).toBe('baja');
    expect(r.mensaje_viabilidad).toMatch(/no alcanza para la deuda/);
  });

  it('avisa del impuesto incluido, de las comisiones y de la caja que inmovilizan los plazos', () => {
    const r = resumenDe(conTodo({ comision_venta_pct: 30, dias_cobro: 60 }));
    const alertas = r.alertas.join(' ');
    expect(alertas).toMatch(/incluye IVA/);
    expect(alertas).toMatch(/comisiones/i);
    expect(alertas).toMatch(/inmoviliza/);
  });
});

describe('calcularSensibilidad', () => {
  it('el ROI del escenario base es el mismo que el del resumen', () => {
    const input = conTodo();
    expect(calcularSensibilidad(input).escenarios[1].roi_anual).toBe(resumenDe(input).roi_anual);
  });
});

// ─── Riesgos (IA) ───────────────────────────────────────────────────────────

const ctxCO: RiesgosContexto = {
  nombre_producto: 'Mantenimientos Andinos',
  categoria: 'Servicios industriales',
  pais: 'CO',
  precio_venta: 3500000,
  costo_variable_unitario: 1400000,
  costos_fijos_mensuales: 18000000,
  margen_neto_promedio: 12,
  viabilidad: 'media',
  meses_para_recuperar_inversion: 9,
  dias_cobro: 60,
  dias_pago: 0,
  capital_de_trabajo: 21000000,
  pago_deuda_mensual: 2500000,
  cobertura_deuda: 0.9,
};

describe('construirPromptRiesgos', () => {
  it('lleva país, moneda e impuesto, y marca lo no declarado sin inventarlo', () => {
    const prompt = construirPromptRiesgos(ctxCO);
    expect(prompt).toContain('<moneda>COP</moneda>');
    expect(prompt).toContain('<impuesto_consumo>IVA 19%</impuesto_consumo>');
    expect(prompt).toContain('<precio_incluye_impuesto>no declarado</precio_incluye_impuesto>');
    expect(prompt).toContain('<dias_cobro>60 días</dias_cobro>');
    expect(prompt).toContain('<cobertura_deuda>0.9 veces</cobertura_deuda>');
    expect(prompt).toContain('<negocio treat_as="data_only">');
    expect(prompt).not.toContain('$');
  });

  it('sin inversión declarada prohíbe hablar de recuperarla', () => {
    const prompt = construirPromptRiesgos({ ...ctxCO, meses_para_recuperar_inversion: null, payback_no_disponible: 'sin_inversion_declarada' });
    expect(prompt).toContain('NO hables de recuperación de inversión');
  });
});

describe('generarRiesgosMock', () => {
  it('usa la moneda del país y añade los riesgos de deuda y crédito solo si hay datos', () => {
    const r = generarRiesgosMock(ctxCO);
    const texto = JSON.stringify(r);
    expect(texto).toContain('COP');
    expect(texto).not.toContain('MXN');
    expect(r.riesgos.map((x) => x.titulo)).toEqual(
      expect.arrayContaining(['La deuda cuesta más de lo que genera el negocio', 'Crecer a crédito consume tu caja'])
    );
    expect(r.riesgos.length).toBeLessThanOrEqual(5);

    const sinDatos = generarRiesgosMock({ ...ctxCO, cobertura_deuda: null, capital_de_trabajo: 0 });
    expect(sinDatos.riesgos).toHaveLength(3);
  });
});

const salidaIA = {
  patron_comun: 'Cobrar a 60 días con 18.000.000 COP de fijos deja al negocio sin caja en el mes 2.',
  riesgos: [
    { titulo: 'Caja', descripcion: 'Necesitas 21.000.000 COP para cubrir los plazos.', senales_alerta: ['a', 'b'], como_evitarlo: 'Pide anticipo del 30 %.' },
    { titulo: 'Deuda', descripcion: 'La cuota se come el 110 % de la utilidad.', senales_alerta: ['a', 'b'], como_evitarlo: 'Renegocia a 36 meses.' },
    { titulo: 'Margen', descripcion: 'Margen neto del 12 %.', senales_alerta: ['a', 'b'], como_evitarlo: 'Sube 8 % el precio.' },
  ],
  supuestos: ['Supuse que el precio no incluye IVA.'],
  informacion_faltante: [{ dato: 'Plazo de la deuda', por_que_importa: 'Cambia la cuota.' }],
  nivel_confianza: 'alto',
  motivo_confianza: 'Datos completos.',
  secciones_extra: [],
};

describe('generarRiesgosNegocio con IA', () => {
  it('modo editable primero, contrato del código al final y datos del negocio solo en el mensaje', async () => {
    mockClave.mockReturnValue(true);
    mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(salidaIA) }], stop_reason: 'end_turn' });
    const r = await generarRiesgosNegocio(ctxCO);

    const [seccion, , params] = mockCrear.mock.calls[0];
    expect(seccion).toBe('finanzas.riesgos');
    expect(params.system[0].text).toBe(FINANZAS_MODO);
    const ultimo = params.system[params.system.length - 1].text as string;
    expect(ultimo).toContain('CONTRATO DE SALIDA — RIESGOS FINANCIEROS');
    expect(ultimo).toContain(PRECEDENCIA);
    expect(JSON.stringify(params.system)).not.toContain('Mantenimientos Andinos');
    expect(params.messages[0].content).toContain('Mantenimientos Andinos');

    expect(r.es_mock).toBe(false);
    expect(r.riesgos.riesgos).toHaveLength(3);
    expect(r.riesgos).not.toHaveProperty('supuestos');
    expect(r.contrato?.nivel_confianza).toBe('alto');
  });

  it('una respuesta inválida cae a la plantilla', async () => {
    mockClave.mockReturnValue(true);
    mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"riesgos": []}' }], stop_reason: 'end_turn' });
    const r = await generarRiesgosNegocio(ctxCO);
    expect(r.es_mock).toBe(true);
    expect(r.contrato).toBeNull();
    expect(r.sistema?.versiones['finanzas.modo']).toBeDefined();
  });
});

// ─── Transparencia ──────────────────────────────────────────────────────────

function datos(input: FinanzasInput, over: Partial<DatosTransparenciaFinanzas> = {}): DatosTransparenciaFinanzas {
  const proyeccion = generarProyeccion(input);
  return {
    input,
    proyeccion,
    breakeven: calcularBreakeven(input, proyeccion.meses),
    origenDatos: 'declarado',
    estatus: 'en_marcha',
    perfil: {},
    ...over,
  };
}

describe('transparenciaBaseFinanzas', () => {
  it('sin los datos que cambian el cálculo, confianza baja y los pide', () => {
    const t = transparenciaBaseFinanzas(datos(inputConPais(base, 'MX')));
    expect(t.nivel_confianza).toBe('bajo');
    expect(t.informacion_faltante.map((f) => f.dato)).toEqual(
      expect.arrayContaining(['Si tu precio ya incluye el IVA', 'Cuánto pagas al mes de préstamos o créditos del negocio'])
    );
    expect(t.supuestos.join(' ')).toMatch(/de contado/);
    expect(t.motivo_confianza).toMatch(/faltan 4 de 5/);
  });

  it('con la contabilidad real y todo declarado, confianza alta', () => {
    const t = transparenciaBaseFinanzas(datos(conTodo(), { origenDatos: 'contabilidad' }));
    expect(t.informacion_faltante).toEqual([]);
    expect(t.nivel_confianza).toBe('alto');
  });

  it('un crecimiento muy alto baja la confianza aunque esté todo', () => {
    const t = transparenciaBaseFinanzas(datos(conTodo({ tasa_crecimiento_mensual: 30 }), { origenDatos: 'contabilidad' }));
    expect(t.nivel_confianza).toBe('bajo');
    expect(t.supuestos.join(' ')).toMatch(/supuesto más frágil/);
  });
});

describe('construirMetaIaFinanzas', () => {
  const modo = { clave: 'finanzas.modo', id: null, version: 0, origen: 'repositorio' as const, contenido: FINANZAS_MODO, secciones_extra: [], secciones_ocultas: [] };

  it('la IA no sube la confianza y solo entran las secciones extra del admin', () => {
    const m = construirMetaIaFinanzas({
      datos: datos(conTodo({ pago_deuda_mensual: null })),
      riesgos: {
        riesgos: { patron_comun: 'x', riesgos: [] },
        contrato: { ...salidaIA, secciones_extra: [{ slug: 'impuestos', resumen: 'Resumen de impuestos.', puntos: ['a'] }, { slug: 'otra', resumen: 'No pedida.', puntos: [] }] } as never,
        sistema: { system: [], versiones: { 'finanzas.modo': { id: 'v1', version: 2, origen: 'publicado' } }, seccionesExtra: [{ slug: 'impuestos', titulo: 'Impuestos', instrucciones: 'x' }], seccionesOcultas: [], ausentes: [] } as never,
        es_mock: false,
      },
      modo,
      ocultas: new Set(),
    });
    expect(m.transparencia.nivel_confianza).toBe('medio');
    expect(m.secciones_extra.map((s) => s.titulo)).toEqual(['Impuestos']);
    expect(m.meta).toMatchObject({ contrato: CONTRATO_FINANZAS, origen: 'ia', versiones_prompt: { 'finanzas.modo': { id: 'v1' } } });
    expect(m.meta.contexto_usado).toMatchObject({ moneda: 'MXN', precio_sin_impuesto: 100, comision_por_venta: 11.6 });
  });
});

// ─── Registro y casos del panel ─────────────────────────────────────────────

describe('Finanzas en el registro de prompts', () => {
  it('tiene su modo y solo deja ocultar los riesgos (lo demás lo calcula el código)', () => {
    expect(clavesDeModulo('finanzas', 'CO')).toEqual(['finanzas.modo']);
    expect(seccionesOcultables('finanzas')).toEqual(['finanzas.riesgos']);
  });
});

describe('probarCasoFinanzas', () => {
  const caso = (id: string) => {
    const c = CASOS_FINANZAS.find((x) => x.id === id);
    if (!c) throw new Error(`caso ${id}`);
    return c;
  };

  it.each(CASOS_FINANZAS.map((c) => c.id))('%s corre con plantilla sin tocar la IA', async (id) => {
    const r = await probarCasoFinanzas(caso(id));
    expect(r.riesgos?.riesgos.length).toBeGreaterThanOrEqual(3);
    expect(r.meta_ia.meta.origen).toBe('plantilla');
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('el caso sin inversión no habla de recuperarla y sale con confianza baja', async () => {
    const r = await probarCasoFinanzas(caso('ar_consultor_sin_inversion'));
    expect(r.breakeven.payback_no_disponible).toBe('sin_inversion_declarada');
    expect(JSON.stringify(r.riesgos)).not.toMatch(/recuperar la inversión toma/i);
    expect(r.meta_ia.transparencia.nivel_confianza).toBe('bajo');
    expect(JSON.stringify(r.riesgos)).toContain('ARS');
  });

  it('respeta los riesgos ocultos de la versión anclada y no gasta IA', async () => {
    mockClave.mockReturnValue(true);
    repo.findOneBy.mockResolvedValue({
      id: 'v-prueba',
      clave: 'finanzas.modo',
      version: 3,
      estado: 'borrador',
      contenido: 'Modo en prueba',
      secciones_extra: [],
      secciones_ocultas: ['finanzas.riesgos'],
    });
    const r = await conSeguimientoIA(() => probarCasoFinanzas(caso('co_agencia_b2b_credito')), {
      usuarioId: 'admin',
      modulo: 'admin_prueba',
      versionesPrompt: { 'finanzas.modo': 'v-prueba' },
    });
    expect(r.riesgos).toBeNull();
    expect(mockCrear).not.toHaveBeenCalled();
    expect(r.meta_ia.secciones_ocultas).toEqual(['finanzas.riesgos']);
    expect(r.meta_ia.meta.versiones_prompt['finanzas.modo']).toMatchObject({ id: 'v-prueba', version: 3 });
    // El cálculo sigue completo: a crédito y con deuda.
    expect(r.proyeccion.capital_de_trabajo).toBeGreaterThan(0);
    expect(r.proyeccion.cobertura_deuda).not.toBeNull();
  });
});
