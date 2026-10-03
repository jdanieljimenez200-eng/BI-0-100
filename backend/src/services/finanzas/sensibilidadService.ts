import { FinanzasInput, EscenarioSensibilidad, SensibilidadAnalisis } from './types';
import { generarProyeccion } from './proyeccionService';
import { calcularBreakeven } from './breakevenService';
import { economiaUnitaria } from './economiaUnitaria';

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
  // Misma base que el ROI del resumen: la inversión si se declaró; si no, los
  // costos fijos del año. Antes aquí siempre eran los fijos y los escenarios no
  // cuadraban con el ROI de la pantalla principal.
  const inversion = Math.max(0, Number(input.inversion_inicial) || 0);
  const base_roi = inversion > 0 ? inversion : proyeccion.economia_unitaria.costos_fijos_efectivos * 12;
  const roi_anual = base_roi > 0
    ? Math.round((totales.utilidad_neta_total / base_roi) * 100)
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

  // Margen real: sin el impuesto incluido y con las comisiones.
  const eco = economiaUnitaria(input);
  const pregunta_clave = eco.precio_neto <= 0 || eco.margen_unitario / eco.precio_neto < 0.35
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
