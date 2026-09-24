import { r2 } from '../../utils/dinero';
import { FinanzasInput, MesProyeccion, ProyeccionAnual } from './types';

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function generarProyeccion(input: FinanzasInput): ProyeccionAnual {
  const {
    precio_venta,
    costo_variable_unitario,
    costos_fijos_mensuales,
    unidades_mes_inicial,
    tasa_crecimiento_mensual,
  } = input;

  const meses: MesProyeccion[] = [];
  let acumulado_neto = 0;

  for (let mes = 1; mes <= 12; mes++) {
    const factor = Math.pow(1 + tasa_crecimiento_mensual / 100, mes - 1);
    const unidades = Math.round(unidades_mes_inicial * factor);
    const ingresos = unidades * precio_venta;
    const costo_variable_total = unidades * costo_variable_unitario;
    const utilidad_bruta = ingresos - costo_variable_total;
    const utilidad_neta = utilidad_bruta - costos_fijos_mensuales;
    const margen_neto = ingresos > 0 ? (utilidad_neta / ingresos) * 100 : 0;
    acumulado_neto += utilidad_neta;

    meses.push({
      mes,
      nombre_mes: NOMBRES_MESES[mes - 1],
      unidades,
      ingresos: round2(ingresos),
      costo_variable_total: round2(costo_variable_total),
      costos_fijos: round2(costos_fijos_mensuales),
      utilidad_bruta: round2(utilidad_bruta),
      utilidad_neta: round2(utilidad_neta),
      margen_neto: round2(margen_neto),
      acumulado_neto: round2(acumulado_neto),
    });
  }

  // Cuánta caja hay que aguantar antes de que el negocio se pague solo: el
  // punto más bajo del acumulado contando la inversión inicial. Sin esto, un
  // negocio «rentable» en el papel podía quedarse sin dinero en el mes 3 y la
  // proyección no lo mencionaba.
  const inversion = Math.max(0, Number(input.inversion_inicial) || 0);
  let valle = { monto: -inversion, mes: 0 };
  for (const m of meses) {
    const saldo = m.acumulado_neto - inversion;
    if (saldo < valle.monto) valle = { monto: saldo, mes: m.mes };
  }
  const caja_necesaria = valle.monto < 0 ? r2(Math.abs(valle.monto)) : 0;

  const totales = {
    unidades_totales: meses.reduce((s, m) => s + m.unidades, 0),
    ingresos_totales: round2(meses.reduce((s, m) => s + m.ingresos, 0)),
    costo_variable_total: round2(meses.reduce((s, m) => s + m.costo_variable_total, 0)),
    costos_fijos_total: round2(costos_fijos_mensuales * 12),
    utilidad_bruta_total: round2(meses.reduce((s, m) => s + m.utilidad_bruta, 0)),
    utilidad_neta_total: round2(meses.reduce((s, m) => s + m.utilidad_neta, 0)),
    margen_neto_promedio: round2(meses.reduce((s, m) => s + m.margen_neto, 0) / 12),
  };

  const mejor_mes = meses.reduce((best, m) => m.utilidad_neta > meses[best - 1].utilidad_neta ? m.mes : best, 1);
  const peor_mes = meses.reduce((worst, m) => m.utilidad_neta < meses[worst - 1].utilidad_neta ? m.mes : worst, 1);

  return {
    meses,
    totales,
    mejor_mes,
    peor_mes,
    caja_necesaria,
    mes_valle: valle.mes,
    // La utilidad de esta proyección es ANTES de impuestos: no se descuentan
    // IVA, ISR ni cuotas patronales. El estimador fiscal real vive en la
    // pestaña de movimientos, que trabaja sobre lo que de verdad se facturó.
    utilidad_antes_de_impuestos: true,
  };
}

function round2(n: number): number {
  return r2(n);
}
