import { FinanzasInput, EscenarioSensibilidad, SensibilidadAnalisis } from './types';
import { generarProyeccion } from './proyeccionService';
import { calcularBreakeven } from './breakevenService';

function calcularEscenario(
  input: FinanzasInput,
  factorUnidades: number,
  factorPrecio: number,
  nombre: EscenarioSensibilidad['nombre'],
  descripcion: string,
): EscenarioSensibilidad {
  const inputMod: FinanzasInput = {
    ...input,
    precio_venta: Math.round(input.precio_venta * factorPrecio),
    unidades_mes_inicial: Math.max(1, Math.round(input.unidades_mes_inicial * factorUnidades)),
  };

  const proyeccion = generarProyeccion(inputMod);
  const breakeven = calcularBreakeven(inputMod, proyeccion.meses);

  const { totales } = proyeccion;
  const inversion_total = input.costos_fijos_mensuales * 12;
  const roi_anual = inversion_total > 0
    ? Math.round((totales.utilidad_neta_total / inversion_total) * 100)
    : 0;

  let viabilidad: 'alta' | 'media' | 'baja';
  let color: string;
  if (!breakeven.punto_equilibrio_alcanzado || totales.utilidad_neta_total < 0) {
    viabilidad = 'baja'; color = 'red';
  } else if (roi_anual < 20 || (breakeven.mes_equilibrio ?? 12) > 6) {
    viabilidad = 'media'; color = 'yellow';
  } else {
    viabilidad = 'alta'; color = 'green';
  }

  return {
    nombre,
    descripcion,
    factor_unidades: factorUnidades,
    factor_precio: factorPrecio,
    unidades_mes1: inputMod.unidades_mes_inicial,
    ingresos_anuales: Math.round(totales.ingresos_totales),
    utilidad_neta_anual: Math.round(totales.utilidad_neta_total),
    roi_anual,
    mes_breakeven: breakeven.mes_equilibrio,
    viabilidad,
    color,
  };
}

export function calcularSensibilidad(input: FinanzasInput): SensibilidadAnalisis {
  const pesimista = calcularEscenario(
    input, 0.7, 0.9, 'Pesimista',
    'Vendes 30% menos de lo planeado y reduces precio 10% para competir'
  );
  const base = calcularEscenario(
    input, 1.0, 1.0, 'Base',
    'Alcanzas exactamente tu meta de ventas con el precio definido'
  );
  const optimista = calcularEscenario(
    input, 1.3, 1.1, 'Optimista',
    'Superas la meta 30% y puedes sostener un precio 10% más alto'
  );

  // Determinar palanca principal comparando impacto de precio vs volumen
  const impactoPrecio = calcularEscenario(input, 1.0, 1.1, 'Optimista', '').utilidad_neta_anual - base.utilidad_neta_anual;
  const impactoVolumen = calcularEscenario(input, 1.1, 1.0, 'Optimista', '').utilidad_neta_anual - base.utilidad_neta_anual;
  const palanca_principal = impactoPrecio >= impactoVolumen
    ? 'Precio — subir tu precio un 10% tiene más impacto que vender 10% más unidades'
    : 'Volumen — vender más unidades es tu palanca de crecimiento más potente';

  const margen_contrib = input.precio_venta - input.costo_variable_unitario;
  const pregunta_clave = margen_contrib / input.precio_venta < 0.35
    ? '¿Puedes reducir tu costo variable? Tu margen de contribución es bajo y limita la rentabilidad.'
    : pesimista.viabilidad === 'baja'
      ? '¿Cuántos meses de runway tienes si las ventas arrancan lentas? El escenario pesimista entra en pérdida.'
      : '¿Cuál es tu plan si vendes 30% más de lo esperado? Asegura capacidad de producción y entrega.';

  return {
    escenarios: [pesimista, base, optimista],
    pregunta_clave,
    palanca_principal,
    rango_ingresos: {
      min: pesimista.ingresos_anuales,
      max: optimista.ingresos_anuales,
    },
    rango_roi: {
      min: pesimista.roi_anual,
      max: optimista.roi_anual,
    },
  };
}
