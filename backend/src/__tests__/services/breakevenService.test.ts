import { calcularBreakeven } from '../../services/finanzas/breakevenService';
import { generarProyeccion } from '../../services/finanzas/proyeccionService';
import { FinanzasInput } from '../../services/finanzas/types';

const inputBase: FinanzasInput = {
  productoId: 'test-id',
  usuarioId: 'user-id',
  precio_venta: 299,
  costo_variable_unitario: 120,
  costos_fijos_mensuales: 5000,
  unidades_mes_inicial: 30,
  tasa_crecimiento_mensual: 10,
};

describe('breakevenService.calcularBreakeven', () => {
  it('margen de contribución = precio - costo_variable', () => {
    const proy = generarProyeccion(inputBase);
    const be = calcularBreakeven(inputBase, proy.meses);
    expect(be.margen_contribucion_unitario).toBeCloseTo(
      inputBase.precio_venta - inputBase.costo_variable_unitario,
      2,
    );
  });

  it('punto de equilibrio = costos_fijos / margen_contribucion', () => {
    const proy = generarProyeccion(inputBase);
    const be = calcularBreakeven(inputBase, proy.meses);
    const esperado = Math.ceil(
      inputBase.costos_fijos_mensuales / (inputBase.precio_venta - inputBase.costo_variable_unitario),
    );
    expect(be.unidades_breakeven_mes).toBe(esperado);
  });

  it('ingresos_breakeven = unidades_breakeven × precio', () => {
    const proy = generarProyeccion(inputBase);
    const be = calcularBreakeven(inputBase, proy.meses);
    expect(be.ingresos_breakeven_mes).toBeCloseTo(
      be.unidades_breakeven_mes * inputBase.precio_venta,
      1,
    );
  });

  it('detecta correctamente cuando se alcanza el equilibrio', () => {
    // Con 30 uds iniciales y punto de equilibrio en ~28, debería alcanzarse desde mes 1
    const proy = generarProyeccion(inputBase);
    const be = calcularBreakeven(inputBase, proy.meses);
    expect(be.punto_equilibrio_alcanzado).toBe(true);
    expect(be.mes_equilibrio).toBe(1);
  });

  it('detecta cuando NO se alcanza el equilibrio en 12 meses', () => {
    const input: FinanzasInput = {
      ...inputBase,
      unidades_mes_inicial: 5,
      tasa_crecimiento_mensual: 0,
      costos_fijos_mensuales: 50000,
    };
    const proy = generarProyeccion(input);
    const be = calcularBreakeven(input, proy.meses);
    expect(be.punto_equilibrio_alcanzado).toBe(false);
    expect(be.mes_equilibrio).toBeNull();
  });

  it('genera exactamente 3 escenarios', () => {
    const proy = generarProyeccion(inputBase);
    const be = calcularBreakeven(inputBase, proy.meses);
    expect(be.escenarios).toHaveLength(3);
  });

  it('el primer escenario (punto equilibrio) coincide con unidades_breakeven_mes', () => {
    const proy = generarProyeccion(inputBase);
    const be = calcularBreakeven(inputBase, proy.meses);
    expect(be.escenarios[0].unidades_necesarias).toBe(be.unidades_breakeven_mes);
  });

  it('escenarios están ordenados de menor a mayor exigencia', () => {
    const proy = generarProyeccion(inputBase);
    const be = calcularBreakeven(inputBase, proy.meses);
    const [s0, s1, s2] = be.escenarios.map((e) => e.unidades_necesarias);
    expect(s1).toBeGreaterThanOrEqual(s0);
    expect(s2).toBeGreaterThanOrEqual(s1);
  });
});
