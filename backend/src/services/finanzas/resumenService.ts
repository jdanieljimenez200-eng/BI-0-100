import { FinanzasInput, ProyeccionAnual, BreakevenData, ResumenFinanzas } from './types';
import { getTaxConfig } from '../../utils/taxConfig';
import { formatoDinero } from './economiaUnitaria';

export function generarResumen(
  input: FinanzasInput,
  proyeccion: ProyeccionAnual,
  breakeven: BreakevenData,
): ResumenFinanzas {
  const { unidades_mes_inicial } = input;
  const { totales } = proyeccion;
  const eco = proyeccion.economia_unitaria;
  const costos_fijos_mensuales = eco.costos_fijos_efectivos;
  const dinero = (n: number) => formatoDinero(n, input.pais);
  const impuesto = getTaxConfig(input.pais).consumo.nombre;

  // ROI anual. Con inversión declarada es el retorno de verdad (utilidad del
  // año sobre lo que costó arrancar). Sin ella se cae al costo fijo anual, que
  // NO es una inversión: se marca la base para que la pantalla no lo llame ROI
  // a secas.
  const inversion_inicial = Math.max(0, Number(input.inversion_inicial) || 0);
  const base_roi: 'inversion_inicial' | 'costos_fijos_anuales' =
    inversion_inicial > 0 ? 'inversion_inicial' : 'costos_fijos_anuales';
  const base_monto = inversion_inicial > 0 ? inversion_inicial : costos_fijos_mensuales * 12;
  const roi_anual =
    base_monto > 0 ? Math.round((totales.utilidad_neta_total / base_monto) * 100) : 0;

  // Un «ROI» que en realidad mide utilidad contra costos fijos no se llama ROI.
  const etiquetaRoi = base_roi === 'inversion_inicial' ? 'ROI' : 'retorno sobre costos fijos';

  const ingreso_promedio_mensual = Math.round(totales.ingresos_totales / 12);
  const utilidad_promedio_mensual = Math.round(totales.utilidad_neta_total / 12);
  const cobertura = proyeccion.cobertura_deuda;

  // Viabilidad
  let viabilidad: ResumenFinanzas['viabilidad'];
  let color_viabilidad: string;
  let mensaje_viabilidad: string;

  if (eco.margen_unitario <= 0) {
    viabilidad = 'baja';
    color_viabilidad = 'red';
    mensaje_viabilidad =
      `Cada venta pierde dinero: de ${dinero(input.precio_venta)} de precio quedan ${dinero(eco.precio_neto)} sin ${impuesto}` +
      `${eco.comision_unitaria > 0 ? ` y ${dinero(eco.comision_unitaria)} se van en comisiones` : ''}, menos que el costo de producirla. ` +
      'Revisa el precio o el canal antes de vender más: vender más solo agranda la pérdida.';
  } else if (!breakeven.punto_equilibrio_alcanzado || totales.utilidad_neta_total < 0) {
    viabilidad = 'baja';
    color_viabilidad = 'red';
    mensaje_viabilidad =
      `El negocio no cubre sus costos fijos con las unidades proyectadas. La utilidad neta anual es negativa (${dinero(Math.abs(totales.utilidad_neta_total))} de pérdida). Prioridad: reducir costos fijos en ≥30% o incrementar precio de venta antes de lanzar.`;
  } else if (cobertura !== null && cobertura < 1) {
    viabilidad = 'baja';
    color_viabilidad = 'red';
    mensaje_viabilidad =
      `El negocio deja utilidad, pero no alcanza para la deuda: genera ${dinero(utilidad_promedio_mensual)} al mes y la cuota es de ${dinero(Number(input.pago_deuda_mensual) || 0)}. Renegociar el plazo de la deuda va antes que crecer.`;
  } else if (roi_anual < 20 || (breakeven.mes_equilibrio ?? 12) > 6 || (cobertura !== null && cobertura < 1.25)) {
    viabilidad = 'media';
    color_viabilidad = 'yellow';
    mensaje_viabilidad =
      `El negocio es viable pero el retorno es moderado (${etiquetaRoi} ${roi_anual}% anual, equilibrio en mes ${breakeven.mes_equilibrio ?? '>6'}). Optimizar estructura de costos o incrementar precio entre un 10-15% podría mejorar el ROI por encima del 30% sin perder mercado.`;
  } else {
    viabilidad = 'alta';
    color_viabilidad = 'green';
    mensaje_viabilidad =
      `Sólido: ${etiquetaRoi} anual proyectado del ${roi_anual}% con punto de equilibrio en mes ${breakeven.mes_equilibrio ?? 1}. La estructura financiera permite bootstrapping sin financiamiento externo y con margen para reinvertir en crecimiento.`;
  }

  // Recomendaciones y alertas
  const recomendaciones: string[] = [];
  const alertas: string[] = [];

  const margen_unitario = eco.margen_unitario;
  const porcentaje_margen = eco.precio_neto > 0 ? (margen_unitario / eco.precio_neto) * 100 : 0;

  if (porcentaje_margen < 30) {
    alertas.push(`Margen de contribución crítico: ${Math.round(porcentaje_margen)}% (umbral mínimo recomendado: 30%). Con este margen, necesitarás ${margen_unitario > 0 ? Math.ceil(costos_fijos_mensuales / margen_unitario) : '—'} unidades/mes solo para cubrir costos fijos. Acciones: reduce costo variable o sube precio.`);
  }
  if (eco.comision_unitaria > 0 && margen_unitario > 0 && eco.comision_unitaria >= margen_unitario * 0.5) {
    alertas.push(
      `Las comisiones (${dinero(eco.comision_unitaria)} por venta) se llevan al menos la mitad de lo que te queda de cada venta (${dinero(margen_unitario)}). Mueve a tus clientes frecuentes a un canal propio.`,
    );
  }
  if (input.precio_incluye_impuesto && eco.impuesto_unitario > 0) {
    alertas.push(
      `Tu precio incluye ${impuesto}: de cada venta de ${dinero(input.precio_venta)}, ${dinero(eco.impuesto_unitario)} no son tuyos. El modelo ya calcula con ${dinero(eco.precio_neto)}.`,
    );
  }
  if (costos_fijos_mensuales > ingreso_promedio_mensual * 0.5) {
    alertas.push(`Los costos fijos (${ingreso_promedio_mensual > 0 ? Math.round((costos_fijos_mensuales / ingreso_promedio_mensual) * 100) : 100}% de ingresos) son demasiado altos para el volumen proyectado. Revisa qué costos fijos pueden convertirse en variables hasta alcanzar el punto de equilibrio.`);
  }
  if (unidades_mes_inicial < breakeven.unidades_breakeven_mes) {
    alertas.push(
      `Arrancar con ${unidades_mes_inicial} uds/mes cuando necesitas ${breakeven.unidades_breakeven_mes} para cubrir costos representa un déficit inicial del ${Math.round(((breakeven.unidades_breakeven_mes - unidades_mes_inicial) / breakeven.unidades_breakeven_mes) * 100)}%. Define cómo cerrar esta brecha en los primeros 90 días.`,
    );
  }
  if (proyeccion.capital_de_trabajo > 0) {
    alertas.push(
      `Cobrar a ${Number(input.dias_cobro) || 0} días y pagar a ${Number(input.dias_pago) || 0} días inmoviliza ${dinero(proyeccion.capital_de_trabajo)} de caja: es dinero que necesitas aunque el negocio sea rentable.`,
    );
  }
  if (cobertura !== null && cobertura < 1.25) {
    alertas.push(
      `La utilidad mensual cubre ${cobertura} veces la cuota de tu deuda (lo sano es 1,25 o más). ${breakeven.unidades_equilibrio_con_deuda ? `Para pagarla con holgura necesitas vender ${breakeven.unidades_equilibrio_con_deuda} unidades al mes.` : ''}`.trim(),
    );
  }

  if (roi_anual > 50) {
    recomendaciones.push(`${etiquetaRoi === 'ROI' ? 'ROI' : 'Retorno sobre costos fijos'} proyectado del ${roi_anual}% anual: alto rendimiento. Modelo apto para reinvertir utilidades y acelerar crecimiento. Considera destinar el 20-30% de utilidades mensuales a adquisición de clientes.`);
  }
  if (breakeven.mes_equilibrio && breakeven.mes_equilibrio <= 3) {
    recomendaciones.push(`Punto de equilibrio en mes ${breakeven.mes_equilibrio}: excelente para bootstrapping. Tendrás flujo positivo antes de que agotes la reserva inicial, lo que reduce el riesgo de descapitalización.`);
  }
  if (totales.margen_neto_promedio > 20) {
    recomendaciones.push(
      `Margen neto promedio del ${Math.round(totales.margen_neto_promedio)}%: por encima de lo habitual en la mayoría de negocios de consumo (10-15%). Hay espacio para invertir en marketing sin sacrificar viabilidad.`,
    );
  }
  recomendaciones.push('Compara tus números reales contra esta proyección mensualmente. Una desviación de ±15% en ingresos o costos requiere ajuste inmediato del modelo.');

  return {
    viabilidad,
    color_viabilidad,
    mensaje_viabilidad,
    roi_anual,
    base_roi,
    payback_meses: breakeven.meses_para_recuperar_inversion,
    payback_no_disponible: breakeven.payback_no_disponible,
    ingreso_promedio_mensual,
    utilidad_promedio_mensual,
    recomendaciones,
    alertas,
  };
}
