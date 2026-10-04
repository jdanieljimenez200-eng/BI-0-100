import { FinanzasInput, ProyeccionAnual, BreakevenData, ResumenFinanzas } from './types';
import { getTaxConfig } from '../../utils/taxConfig';
import { formatoDinero } from './economiaUnitaria';

/**
 * Resumen en palabras del cálculo. Cada cifra que aparece aquí sale de lo que
 * dijo el usuario o de la proyección: nada de «lo habitual en el sector» ni de
 * porcentajes de manual. Y como las ventas casi siempre son una suposición
 * (sobre todo en una idea), el mensaje se condiciona a ellas y pone en primer
 * plano el punto de equilibrio, que es lo que de verdad hay que comprobar.
 */
export function generarResumen(
  input: FinanzasInput,
  proyeccion: ProyeccionAnual,
  breakeven: BreakevenData,
  contexto: {
    /** Las ventas salen de la contabilidad real del negocio, no de lo que escribió el usuario. */
    volumenComprobado?: boolean;
  } = {},
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

  const equilibrio = breakeven.unidades_breakeven_mes;
  const ventas = Math.round(unidades_mes_inicial);
  const conVentas = contexto.volumenComprobado
    ? `Con tus ventas reales (${ventas} al mes)`
    : `Con las ventas que declaraste (${ventas} al mes)`;
  const fmtUnidades = (n: number) => Math.round(n).toLocaleString('es-MX');
  const recuperacion = (() => {
    const meses = breakeven.meses_para_recuperar_inversion;
    if (breakeven.payback_no_disponible || meses === null || meses === undefined || inversion_inicial <= 0) return '';
    return meses <= 1 ? ' y recupera lo invertido en menos de un mes' : ` y recupera lo invertido en ${meses} meses`;
  })();
  // Qué pasaría con el equilibrio si el precio sube 10 % y se venden las mismas
  // unidades (supuesto explícito). Sale del cálculo, no de una regla de manual.
  const equilibrioConPrecio10 = (() => {
    const comision = Math.max(0, Number(input.comision_venta_pct) || 0) / 100;
    const margenNuevo = eco.margen_unitario + eco.precio_neto * 0.1 * (1 - comision);
    return margenNuevo > 0 ? Math.ceil(costos_fijos_mensuales / margenNuevo) : null;
  })();

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
    // Lo que haría falta, calculado: vender más o bajar los fijos hasta lo que cubre el margen.
    const fijosQueCubre = Math.max(0, eco.margen_unitario * ventas);
    mensaje_viabilidad =
      `${conVentas} el negocio no cubre sus costos fijos: el año cerraría con ${dinero(Math.abs(totales.utilidad_neta_total))} de pérdida. ` +
      `Para no perder necesitas vender ${fmtUnidades(equilibrio)} al mes, o bajar los costos fijos de ${dinero(costos_fijos_mensuales)} a ${dinero(fijosQueCubre)}.`;
  } else if (cobertura !== null && cobertura < 1) {
    viabilidad = 'baja';
    color_viabilidad = 'red';
    mensaje_viabilidad =
      `El negocio deja utilidad, pero no alcanza para la deuda: genera ${dinero(utilidad_promedio_mensual)} al mes y la cuota es de ${dinero(Number(input.pago_deuda_mensual) || 0)}. Renegociar el plazo de la deuda va antes que crecer.`;
  } else if (roi_anual < 20 || (breakeven.mes_equilibrio ?? 12) > 6 || (cobertura !== null && cobertura < 1.25)) {
    viabilidad = 'media';
    color_viabilidad = 'yellow';
    mensaje_viabilidad =
      `${conVentas} el negocio cubre sus costos, pero con poco margen de error (${etiquetaRoi} ${roi_anual}% anual, equilibrio en el mes ${breakeven.mes_equilibrio ?? 'más allá del 6'}). ` +
      `Necesitas ${fmtUnidades(equilibrio)} ventas al mes para no perder.` +
      (equilibrioConPrecio10 !== null
        ? ` Si subieras el precio 10 % y vendieras lo mismo, bastarían ${fmtUnidades(equilibrioConPrecio10)}.`
        : '');
  } else {
    viabilidad = 'alta';
    color_viabilidad = 'green';
    mensaje_viabilidad =
      `${conVentas} el negocio deja unos ${dinero(utilidad_promedio_mensual)} al mes antes de impuestos${recuperacion}. ` +
      `La cifra que lo sostiene todo es el punto de equilibrio: ${fmtUnidades(equilibrio)} ventas al mes; por debajo, pierdes.`;
  }

  // Recomendaciones y alertas
  const recomendaciones: string[] = [];
  const alertas: string[] = [];

  const margen_unitario = eco.margen_unitario;
  const porcentaje_margen = eco.precio_neto > 0 ? (margen_unitario / eco.precio_neto) * 100 : 0;

  if (porcentaje_margen < 30) {
    alertas.push(`Margen de contribución bajo: de cada venta te queda el ${Math.round(porcentaje_margen)}%. Necesitarás ${margen_unitario > 0 ? fmtUnidades(Math.ceil(costos_fijos_mensuales / margen_unitario)) : '—'} unidades al mes solo para cubrir costos fijos, y cualquier alza de insumos se come la ganancia. Acciones: reduce costo variable o sube precio.`);
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

  if (!contexto.volumenComprobado && totales.utilidad_neta_total > 0) {
    recomendaciones.push(
      `Antes de invertir más, comprueba durante unas semanas que de verdad llegas a ${fmtUnidades(equilibrio)} ventas al mes: todo este resultado depende de las ventas que declaraste.`,
    );
  }
  if (breakeven.mes_equilibrio && breakeven.mes_equilibrio <= 3) {
    recomendaciones.push(
      `Si las ventas se cumplen, llegas al punto de equilibrio en el mes ${breakeven.mes_equilibrio}` +
        (proyeccion.caja_necesaria > 0 ? ` y el arranque no pide más caja que ${dinero(proyeccion.caja_necesaria)}.` : '.'),
    );
  }
  if (totales.margen_neto_promedio > 20) {
    recomendaciones.push(
      `Margen neto promedio del ${Math.round(totales.margen_neto_promedio)}%: deja espacio para invertir en promoción sin bajar del punto de equilibrio, siempre que las ventas se cumplan.`,
    );
  }
  recomendaciones.push(
    `Compara cada mes tus ventas reales con esta proyección: si quedan por debajo de ${fmtUnidades(equilibrio)} al mes, el negocio pierde dinero y hay que ajustar precio, costos o volumen.`,
  );

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
