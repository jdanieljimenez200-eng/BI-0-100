import { r2 } from '../../utils/dinero';
import { FinanzasInput, MesProyeccion, ProyeccionAnual } from './types';
import { desplazarPorDias, economiaUnitaria } from './economiaUnitaria';

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function generarProyeccion(input: FinanzasInput): ProyeccionAnual {
  const { unidades_mes_inicial, tasa_crecimiento_mensual } = input;
  // Precio sin el impuesto incluido, comisiones dentro del costo variable y el
  // sueldo del dueño dentro de los fijos (ver economiaUnitaria.ts). Sin esos
  // datos, son los números declarados tal cual.
  const eco = economiaUnitaria(input);
  const costoInsumo = Math.max(0, Number(input.costo_variable_unitario) || 0);
  const costosFijos = eco.costos_fijos_efectivos;

  const meses: MesProyeccion[] = [];
  let acumulado_neto = 0;
  const inicio = Number.isInteger(input.mes_inicio) && input.mes_inicio! >= 1 && input.mes_inicio! <= 12 ? input.mes_inicio! : 1;

  const unidadesPorMes: number[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const factor = Math.pow(1 + tasa_crecimiento_mensual / 100, mes - 1);
    const unidades = Math.round(unidades_mes_inicial * factor);
    unidadesPorMes.push(unidades);
    const ingresos = unidades * eco.precio_neto;
    const costo_variable_total = unidades * eco.costo_variable_efectivo;
    const utilidad_bruta = ingresos - costo_variable_total;
    const utilidad_neta = utilidad_bruta - costosFijos;
    const margen_neto = ingresos > 0 ? (utilidad_neta / ingresos) * 100 : 0;
    acumulado_neto += utilidad_neta;

    meses.push({
      mes,
      nombre_mes: NOMBRES_MESES[(inicio - 1 + mes - 1) % 12],
      unidades,
      ingresos: round2(ingresos),
      costo_variable_total: round2(costo_variable_total),
      costos_fijos: round2(costosFijos),
      utilidad_bruta: round2(utilidad_bruta),
      utilidad_neta: round2(utilidad_neta),
      margen_neto: round2(margen_neto),
      acumulado_neto: round2(acumulado_neto),
      flujo_caja: 0,
      saldo_caja: 0,
    });
  }

  // ── Flujo de caja ──────────────────────────────────────────────────────────
  // La utilidad no es dinero en el banco: lo vendido a crédito se cobra días
  // después, los insumos se pagan cuando el proveedor lo pide y la cuota de la
  // deuda sale cada mes aunque no sea gasto. Sin plazos ni deuda, el flujo es
  // la utilidad neta y la caja necesaria es la de siempre.
  const inversion = Math.max(0, Number(input.inversion_inicial) || 0);
  const deuda = Math.max(0, Number(input.pago_deuda_mensual) || 0);
  const flujoCon = (diasCobro: number | null | undefined, diasPago: number | null | undefined) => {
    const ventas = unidadesPorMes.map((u) => u * eco.precio_neto);
    const comisiones = unidadesPorMes.map((u) => u * eco.comision_unitaria);
    const insumos = unidadesPorMes.map((u) => u * costoInsumo);
    const cobros = desplazarPorDias(ventas, diasCobro);
    // La plataforma retiene su comisión cuando cobra.
    const retenciones = desplazarPorDias(comisiones, diasCobro);
    const pagos = desplazarPorDias(insumos, diasPago);
    return cobros.map((c, i) => c - retenciones[i] - pagos[i] - costosFijos - deuda);
  };
  const valleDe = (flujos: number[]) => {
    let saldo = -inversion;
    let valle = { monto: -inversion, mes: 0 };
    const saldos = flujos.map((f, i) => {
      saldo += f;
      if (saldo < valle.monto) valle = { monto: saldo, mes: i + 1 };
      return saldo;
    });
    return { saldos, valle };
  };

  const flujos = flujoCon(input.dias_cobro, input.dias_pago);
  const { saldos, valle } = valleDe(flujos);
  meses.forEach((m, i) => {
    m.flujo_caja = round2(flujos[i]);
    m.saldo_caja = round2(saldos[i]);
  });
  // Cuánta caja hay que aguantar antes de que el negocio se pague solo: el
  // punto más bajo del saldo contando la inversión inicial. Sin esto, un
  // negocio «rentable» en el papel podía quedarse sin dinero en el mes 3 y la
  // proyección no lo mencionaba.
  const caja_necesaria = valle.monto < 0 ? r2(Math.abs(valle.monto)) : 0;
  const sinPlazos = valleDe(flujoCon(0, 0)).valle;
  const cajaSinPlazos = sinPlazos.monto < 0 ? Math.abs(sinPlazos.monto) : 0;
  const capital_de_trabajo = r2(Math.max(0, caja_necesaria - cajaSinPlazos));

  const totales = {
    unidades_totales: meses.reduce((s, m) => s + m.unidades, 0),
    ingresos_totales: round2(meses.reduce((s, m) => s + m.ingresos, 0)),
    costo_variable_total: round2(meses.reduce((s, m) => s + m.costo_variable_total, 0)),
    costos_fijos_total: round2(costosFijos * 12),
    utilidad_bruta_total: round2(meses.reduce((s, m) => s + m.utilidad_bruta, 0)),
    utilidad_neta_total: round2(meses.reduce((s, m) => s + m.utilidad_neta, 0)),
    margen_neto_promedio: round2(meses.reduce((s, m) => s + m.margen_neto, 0) / 12),
  };

  const mejor_mes = meses.reduce((best, m) => m.utilidad_neta > meses[best - 1].utilidad_neta ? m.mes : best, 1);
  const peor_mes = meses.reduce((worst, m) => m.utilidad_neta < meses[worst - 1].utilidad_neta ? m.mes : worst, 1);

  // Cobertura: cuántas veces la utilidad mensual promedio paga la cuota. Con
  // pérdida es 0 (no la cubre), no un número negativo que nadie sabe leer.
  const cobertura_deuda = deuda > 0 ? round2(Math.max(0, totales.utilidad_neta_total / 12 / deuda)) : null;

  return {
    meses,
    totales,
    mejor_mes,
    peor_mes,
    caja_necesaria,
    mes_valle: valle.mes,
    capital_de_trabajo,
    cobertura_deuda,
    economia_unitaria: eco,
    // La utilidad de esta proyección es ANTES de impuestos: no se descuentan
    // ISR ni cuotas patronales (el impuesto al consumo incluido en el precio sí
    // se quita: no es ingreso). El estimador fiscal real vive en la pestaña de
    // movimientos, que trabaja sobre lo que de verdad se facturó.
    utilidad_antes_de_impuestos: true,
  };
}

function round2(n: number): number {
  return r2(n);
}
