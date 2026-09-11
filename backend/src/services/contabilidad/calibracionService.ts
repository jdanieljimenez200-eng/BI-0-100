import { MovimientoContable } from '../../models/MovimientoContable';

export interface CalibrationResult {
  ingreso_promedio_mensual: number;
  egreso_promedio_mensual: number;
  costos_fijos_sugeridos: number;
  tasa_crecimiento_mensual: number | null;
  meses_analizados: number;
  rango_fechas: { desde: string; hasta: string };
  confianza: 'alta' | 'media' | 'baja';
  advertencias: string[];
}

export function calcularCalibracion(movimientos: MovimientoContable[]): CalibrationResult {
  const advertencias: string[] = [];

  // Agrupar por mes YYYY-MM (excluir auto-generados como IVA/ISR calculados)
  const byMonth: Record<string, { ingresos: number; egresos: number }> = {};

  for (const m of movimientos) {
    if (m.es_auto_generado) continue;
    const month = String(m.fecha).substring(0, 7);
    if (!byMonth[month]) byMonth[month] = { ingresos: 0, egresos: 0 };
    const monto = Number(m.monto);
    if (m.tipo === 'ingreso') byMonth[month].ingresos += monto;
    else byMonth[month].egresos += monto;
  }

  const months = Object.keys(byMonth).sort();
  const n = months.length;

  if (n === 0) {
    return {
      ingreso_promedio_mensual: 0,
      egreso_promedio_mensual: 0,
      costos_fijos_sugeridos: 0,
      tasa_crecimiento_mensual: null,
      meses_analizados: 0,
      rango_fechas: { desde: '', hasta: '' },
      confianza: 'baja',
      advertencias: ['No hay movimientos suficientes para calibrar.'],
    };
  }

  const ingresosArr = months.map((m) => byMonth[m].ingresos);
  const egresosArr  = months.map((m) => byMonth[m].egresos);

  const ingresoPromedio = ingresosArr.reduce((a, b) => a + b, 0) / n;
  const egresoPromedio  = egresosArr.reduce((a, b) => a + b, 0) / n;

  // Tasa de crecimiento mensual compuesta (CAGR) desde primer al último mes
  let tasaCrecimiento: number | null = null;
  if (n >= 3 && ingresosArr[0] > 0 && ingresosArr[n - 1] > 0) {
    const raw = Math.pow(ingresosArr[n - 1] / ingresosArr[0], 1 / (n - 1)) - 1;
    tasaCrecimiento = Math.round(Math.max(-0.5, Math.min(1.0, raw)) * 10000) / 10000;
  } else if (n < 3) {
    advertencias.push('Con menos de 3 meses de datos la tasa de crecimiento no es calculable — se usará la del análisis original.');
  }

  if (n < 6) {
    advertencias.push(`Tienes ${n} mese${n === 1 ? '' : 's'} de datos. Con 6 o más la calibración es más precisa.`);
  }

  return {
    ingreso_promedio_mensual: Math.round(ingresoPromedio),
    egreso_promedio_mensual:  Math.round(egresoPromedio),
    costos_fijos_sugeridos:   Math.round(egresoPromedio),
    tasa_crecimiento_mensual: tasaCrecimiento,
    meses_analizados: n,
    rango_fechas: {
      desde: months[0] + '-01',
      hasta: months[n - 1] + '-01',
    },
    confianza: n >= 6 ? 'alta' : n >= 3 ? 'media' : 'baja',
    advertencias,
  };
}
