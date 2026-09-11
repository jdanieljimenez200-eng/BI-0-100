import { generarResumen } from '../../services/finanzas/resumenService';
import { generarProyeccion } from '../../services/finanzas/proyeccionService';
import { calcularBreakeven } from '../../services/finanzas/breakevenService';
import { FinanzasInput } from '../../services/finanzas/types';

function runFull(input: FinanzasInput) {
  const proy = generarProyeccion(input);
  const be = calcularBreakeven(input, proy.meses);
  const res = generarResumen(input, proy, be);
  return { proy, be, res };
}

const inputViable: FinanzasInput = {
  productoId: 'test-id',
  usuarioId: 'user-id',
  precio_venta: 299,
  costo_variable_unitario: 120,
  costos_fijos_mensuales: 5000,
  unidades_mes_inicial: 30,
  tasa_crecimiento_mensual: 10,
};

const inputNoViable: FinanzasInput = {
  productoId: 'test-id',
  usuarioId: 'user-id',
  precio_venta: 100,
  costo_variable_unitario: 80,
  costos_fijos_mensuales: 100000,
  unidades_mes_inicial: 5,
  tasa_crecimiento_mensual: 0,
};

describe('resumenService.generarResumen', () => {
  it('clasifica como alta cuando el negocio es claramente rentable', () => {
    const { res } = runFull(inputViable);
    expect(res.viabilidad).toBe('alta');
  });

  it('clasifica como baja cuando el negocio no cubre costos', () => {
    const { res } = runFull(inputNoViable);
    expect(res.viabilidad).toBe('baja');
  });

  it('roi_anual es positivo para negocio viable', () => {
    const { res } = runFull(inputViable);
    expect(res.roi_anual).toBeGreaterThan(0);
  });

  it('siempre tiene al menos una recomendación', () => {
    const { res } = runFull(inputViable);
    expect(res.recomendaciones.length).toBeGreaterThan(0);
  });

  it('ingreso_promedio_mensual = total_ingresos / 12', () => {
    const { proy, res } = runFull(inputViable);
    const esperado = Math.round(proy.totales.ingresos_totales / 12);
    expect(res.ingreso_promedio_mensual).toBe(esperado);
  });

  it('alerta cuando margen de contribución es bajo', () => {
    const inputBajoMargen: FinanzasInput = {
      ...inputViable,
      costo_variable_unitario: 270, // margen ~10%
    };
    const { res } = runFull(inputBajoMargen);
    const tieneAlertaMargen = res.alertas.some((a) =>
      a.toLowerCase().includes('margen'),
    );
    expect(tieneAlertaMargen).toBe(true);
  });

  it('alerta cuando arranca por debajo del punto de equilibrio', () => {
    const inputBajoInicial: FinanzasInput = {
      ...inputViable,
      unidades_mes_inicial: 1,
    };
    const { res } = runFull(inputBajoInicial);
    const tieneAlerta = res.alertas.some((a) => a.includes('1 uds/mes'));
    expect(tieneAlerta).toBe(true);
  });

  it('color_viabilidad está definido', () => {
    const { res } = runFull(inputViable);
    expect(res.color_viabilidad).toBeTruthy();
  });

  it('mensaje_viabilidad está definido y no está vacío', () => {
    const { res: resAlta } = runFull(inputViable);
    const { res: resBaja } = runFull(inputNoViable);
    expect(resAlta.mensaje_viabilidad.length).toBeGreaterThan(10);
    expect(resBaja.mensaje_viabilidad.length).toBeGreaterThan(10);
  });
});
