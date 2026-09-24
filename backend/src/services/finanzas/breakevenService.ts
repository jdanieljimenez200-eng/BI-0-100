import { r2 } from '../../utils/dinero';
import { FinanzasInput, BreakevenData, EscenarioBreakeven, MesProyeccion } from './types';

export function calcularBreakeven(
  input: FinanzasInput,
  meses: MesProyeccion[],
): BreakevenData {
  const {
    precio_venta,
    costo_variable_unitario,
    costos_fijos_mensuales,
    unidades_mes_inicial,
  } = input;

  const margen_contribucion_unitario = precio_venta - costo_variable_unitario;
  const margen_contribucion_porcentaje =
    precio_venta > 0 ? (margen_contribucion_unitario / precio_venta) * 100 : 0;

  // Unidades mínimas para cubrir costos fijos
  const unidades_breakeven_mes =
    margen_contribucion_unitario > 0
      ? Math.ceil(costos_fijos_mensuales / margen_contribucion_unitario)
      : Infinity;
  const ingresos_breakeven_mes = round2(unidades_breakeven_mes * precio_venta);

  // ¿En qué mes se alcanza el punto de equilibrio con crecimiento?
  let mes_equilibrio: number | null = null;
  for (const m of meses) {
    if (m.unidades >= unidades_breakeven_mes) {
      mes_equilibrio = m.mes;
      break;
    }
  }
  const punto_equilibrio_alcanzado = mes_equilibrio !== null;

  // Payback real: mes en que la utilidad acumulada alcanza la inversión inicial.
  //
  // Antes esto buscaba el primer mes con acumulado >= 0 y sin ningún dato de
  // inversión: para cualquier negocio rentable daba el mes 1, y la pantalla lo
  // presentaba como «recuperas tu inversión en 1 mes». Sin inversión declarada
  // no hay payback que calcular, y se dice por qué.
  const inversion_inicial = Math.max(0, Number(input.inversion_inicial) || 0);
  let meses_para_recuperar_inversion: number | null = null;
  let payback_no_disponible: BreakevenData['payback_no_disponible'] = null;

  if (inversion_inicial <= 0) {
    payback_no_disponible = 'sin_inversion_declarada';
  } else {
    for (const m of meses) {
      if (m.acumulado_neto >= inversion_inicial) {
        meses_para_recuperar_inversion = m.mes;
        break;
      }
    }
    if (meses_para_recuperar_inversion === null) {
      payback_no_disponible = 'no_se_recupera_en_12_meses';
    }
  }

  const viable = margen_contribucion_unitario > 0;

  function escenario(nombre: string, descripcion: string, factor: number): EscenarioBreakeven {
    if (!viable) {
      return { nombre, descripcion, unidades_necesarias: Infinity, ingresos_necesarios: Infinity, diferencia_vs_inicial: Infinity };
    }
    const u = Math.ceil((costos_fijos_mensuales * factor) / margen_contribucion_unitario);
    return {
      nombre,
      descripcion,
      unidades_necesarias: u,
      ingresos_necesarios: round2(u * precio_venta),
      diferencia_vs_inicial: unidades_mes_inicial > 0
        ? round2(((u - unidades_mes_inicial) / unidades_mes_inicial) * 100)
        : Infinity,
    };
  }

  const escenarios: EscenarioBreakeven[] = [
    {
      nombre: 'Punto de equilibrio',
      descripcion: 'Cubres todos los costos, ganancia = $0',
      unidades_necesarias: unidades_breakeven_mes,
      ingresos_necesarios: ingresos_breakeven_mes,
      diferencia_vs_inicial: viable && unidades_mes_inicial > 0
        ? round2(((unidades_breakeven_mes - unidades_mes_inicial) / unidades_mes_inicial) * 100)
        : Infinity,
    },
    escenario('Meta conservadora', 'Ganancia mensual del 15% sobre costos fijos', 1.15),
    escenario('Meta agresiva',     'Ganancia mensual del 50% sobre costos fijos', 1.5),
  ];

  return {
    unidades_breakeven_mes,
    ingresos_breakeven_mes,
    margen_contribucion_unitario: round2(margen_contribucion_unitario),
    margen_contribucion_porcentaje: round2(margen_contribucion_porcentaje),
    punto_equilibrio_alcanzado,
    mes_equilibrio,
    meses_para_recuperar_inversion,
    payback_no_disponible,
    inversion_inicial,
    escenarios,
  };
}

function round2(n: number): number {
  return r2(n);
}
