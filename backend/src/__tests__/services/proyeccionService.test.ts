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

describe('proyeccionService.generarProyeccion', () => {
  it('genera exactamente 12 meses', () => {
    const result = generarProyeccion(inputBase);
    expect(result.meses).toHaveLength(12);
  });

  it('mes 1 tiene las unidades iniciales', () => {
    const result = generarProyeccion(inputBase);
    expect(result.meses[0].unidades).toBe(30);
  });

  it('las unidades crecen con la tasa mensual', () => {
    const result = generarProyeccion(inputBase);
    // Mes 2 debe tener más unidades que mes 1
    expect(result.meses[1].unidades).toBeGreaterThan(result.meses[0].unidades);
    // Mes 12 debe tener más que mes 1
    expect(result.meses[11].unidades).toBeGreaterThan(result.meses[0].unidades);
  });

  it('ingresos = unidades × precio_venta', () => {
    const result = generarProyeccion(inputBase);
    const mes1 = result.meses[0];
    expect(mes1.ingresos).toBeCloseTo(mes1.unidades * inputBase.precio_venta, 1);
  });

  it('utilidad_neta = utilidad_bruta - costos_fijos', () => {
    const result = generarProyeccion(inputBase);
    const mes1 = result.meses[0];
    expect(mes1.utilidad_neta).toBeCloseTo(mes1.utilidad_bruta - inputBase.costos_fijos_mensuales, 1);
  });

  it('acumulado_neto del mes 12 es la suma de todas las utilidades netas', () => {
    const result = generarProyeccion(inputBase);
    const sumaManual = result.meses.reduce((s, m) => s + m.utilidad_neta, 0);
    expect(result.meses[11].acumulado_neto).toBeCloseTo(sumaManual, 0);
  });

  it('totales.ingresos_totales coincide con la suma mensual', () => {
    const result = generarProyeccion(inputBase);
    const sumaIngresos = result.meses.reduce((s, m) => s + m.ingresos, 0);
    expect(result.totales.ingresos_totales).toBeCloseTo(sumaIngresos, 0);
  });

  it('con crecimiento 0 todas las unidades son iguales', () => {
    const input = { ...inputBase, tasa_crecimiento_mensual: 0 };
    const result = generarProyeccion(input);
    const todasIguales = result.meses.every((m) => m.unidades === input.unidades_mes_inicial);
    expect(todasIguales).toBe(true);
  });

  it('mejor_mes tiene la mayor utilidad neta', () => {
    const result = generarProyeccion(inputBase);
    const maxUtil = Math.max(...result.meses.map((m) => m.utilidad_neta));
    expect(result.meses[result.mejor_mes - 1].utilidad_neta).toBe(maxUtil);
  });

  it('peor_mes tiene la menor utilidad neta', () => {
    const result = generarProyeccion(inputBase);
    const minUtil = Math.min(...result.meses.map((m) => m.utilidad_neta));
    expect(result.meses[result.peor_mes - 1].utilidad_neta).toBe(minUtil);
  });

  it('margen_neto es 0 cuando ingresos son 0', () => {
    const input = { ...inputBase, precio_venta: 0, unidades_mes_inicial: 0 };
    const result = generarProyeccion(input);
    expect(result.meses[0].margen_neto).toBe(0);
  });
});
