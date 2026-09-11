import { FinanzasInput, ProyeccionAnual, BreakevenData, ResumenFinanzas } from './types';

export function generarResumen(
  input: FinanzasInput,
  proyeccion: ProyeccionAnual,
  breakeven: BreakevenData,
): ResumenFinanzas {
  const { costos_fijos_mensuales, unidades_mes_inicial } = input;
  const { totales } = proyeccion;

  // ROI anual: (utilidad_neta_total / costos_fijos_total) * 100
  const inversion_total = costos_fijos_mensuales * 12;
  const roi_anual =
    inversion_total > 0
      ? Math.round((totales.utilidad_neta_total / inversion_total) * 100)
      : 0;

  const ingreso_promedio_mensual = Math.round(totales.ingresos_totales / 12);
  const utilidad_promedio_mensual = Math.round(totales.utilidad_neta_total / 12);

  // Viabilidad
  let viabilidad: ResumenFinanzas['viabilidad'];
  let color_viabilidad: string;
  let mensaje_viabilidad: string;

  if (!breakeven.punto_equilibrio_alcanzado || totales.utilidad_neta_total < 0) {
    viabilidad = 'baja';
    color_viabilidad = 'red';
    mensaje_viabilidad =
      `El negocio no cubre sus costos fijos con las unidades proyectadas. La utilidad neta anual es negativa ($${Math.abs(Math.round(totales.utilidad_neta_total)).toLocaleString()} de pérdida). Prioridad: reducir costos fijos en ≥30% o incrementar precio de venta antes de lanzar.`;
  } else if (roi_anual < 20 || (breakeven.mes_equilibrio ?? 12) > 6) {
    viabilidad = 'media';
    color_viabilidad = 'yellow';
    mensaje_viabilidad =
      `El negocio es viable pero el retorno es moderado (ROI ${roi_anual}% anual, equilibrio en mes ${breakeven.mes_equilibrio ?? '>6'}). Optimizar estructura de costos o incrementar precio entre un 10-15% podría mejorar el ROI por encima del 30% sin perder mercado.`;
  } else {
    viabilidad = 'alta';
    color_viabilidad = 'green';
    mensaje_viabilidad =
      `Sólido: ROI anual proyectado del ${roi_anual}% con punto de equilibrio en mes ${breakeven.mes_equilibrio ?? 1}. La estructura financiera permite bootstrapping sin financiamiento externo y con margen para reinvertir en crecimiento.`;
  }

  // Recomendaciones y alertas
  const recomendaciones: string[] = [];
  const alertas: string[] = [];

  const margen_unitario = input.precio_venta - input.costo_variable_unitario;
  const porcentaje_margen = (margen_unitario / input.precio_venta) * 100;

  if (porcentaje_margen < 30) {
    alertas.push(`Margen de contribución crítico: ${Math.round(porcentaje_margen)}% (umbral mínimo recomendado: 30%). Con este margen, necesitarás ${Math.ceil(costos_fijos_mensuales / (margen_unitario || 1))} unidades/mes solo para cubrir costos fijos. Acciones: reduce costo variable o sube precio.`);
  }
  if (costos_fijos_mensuales > ingreso_promedio_mensual * 0.5) {
    alertas.push(`Los costos fijos (${Math.round((costos_fijos_mensuales / ingreso_promedio_mensual) * 100)}% de ingresos) son demasiado altos para el volumen proyectado. Revisa qué costos fijos pueden convertirse en variables hasta alcanzar el punto de equilibrio.`);
  }
  if (unidades_mes_inicial < breakeven.unidades_breakeven_mes) {
    alertas.push(
      `Arrancar con ${unidades_mes_inicial} uds/mes cuando necesitas ${breakeven.unidades_breakeven_mes} para cubrir costos representa un déficit inicial del ${Math.round(((breakeven.unidades_breakeven_mes - unidades_mes_inicial) / breakeven.unidades_breakeven_mes) * 100)}%. Define cómo cerrar esta brecha en los primeros 90 días.`,
    );
  }

  if (roi_anual > 50) {
    recomendaciones.push(`ROI proyectado del ${roi_anual}% anual: alto rendimiento. Modelo apto para reinvertir utilidades y acelerar crecimiento. Considera destinar el 20-30% de utilidades mensuales a adquisición de clientes.`);
  }
  if (breakeven.mes_equilibrio && breakeven.mes_equilibrio <= 3) {
    recomendaciones.push(`Punto de equilibrio en mes ${breakeven.mes_equilibrio}: excelente para bootstrapping. Tendrás flujo positivo antes de que agotes la reserva inicial, lo que reduce el riesgo de descapitalización.`);
  }
  if (totales.margen_neto_promedio > 20) {
    recomendaciones.push(
      `Margen neto promedio del ${Math.round(totales.margen_neto_promedio)}%: por encima del benchmark de la mayoría de categorías B2C en México (10-15%). Hay espacio para invertir en marketing sin sacrificar viabilidad.`,
    );
  }
  recomendaciones.push('Compara tus números reales contra esta proyección mensualmente. Una desviación de ±15% en ingresos o costos requiere ajuste inmediato del modelo.');

  return {
    viabilidad,
    color_viabilidad,
    mensaje_viabilidad,
    roi_anual,
    payback_meses: breakeven.meses_para_recuperar_inversion,
    ingreso_promedio_mensual,
    utilidad_promedio_mensual,
    recomendaciones,
    alertas,
  };
}
