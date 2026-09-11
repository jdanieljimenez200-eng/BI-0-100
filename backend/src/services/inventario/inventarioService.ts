// Servicio puro de Inventario — sin DB ni HTTP.
// Lógica de Costo Promedio Ponderado (CPP) y aplicación de movimientos al stock.

export type TipoMovInventario = 'entrada' | 'salida' | 'ajuste' | 'merma';

export interface AplicarMovInput {
  tipo: TipoMovInventario;
  stockActual: number;
  costoPromedioActual: number;
  cantidad: number;           // siempre positiva
  costoUnitarioMov?: number;  // requerido para 'entrada'; ignorado en otros tipos
  stockObjetivo?: number;     // solo para 'ajuste'
}

export interface AplicarMovResult {
  stockNuevo: number;
  costoPromedioNuevo: number;
  costoTotalMov: number;       // = cantidad × costo_unitario_efectivo
  cantidadEfectiva: number;    // positiva siempre
  costoUnitarioEfectivo: number;
}

/**
 * Aplica un movimiento de inventario al stock y recalcula el Costo Promedio Ponderado.
 *
 * Reglas:
 * - ENTRADA: stock += cantidad. CPP = (stock_actual × CPP_actual + cantidad × costo_mov) / (stock_actual + cantidad)
 * - SALIDA / MERMA: stock -= cantidad. CPP NO cambia (no entran unidades nuevas). Costo de la salida = cantidad × CPP_actual.
 * - AJUSTE: stock = stockObjetivo (puede aumentar o disminuir). CPP NO cambia. Cantidad efectiva = |stock_objetivo - stock_actual|.
 *
 * Lanza Error si el movimiento causaría stock negativo (salida/merma de más de lo que hay).
 */
export function aplicarMovimiento(input: AplicarMovInput): AplicarMovResult {
  const { tipo, stockActual, costoPromedioActual } = input;
  const cantidad = Math.max(0, Number(input.cantidad) || 0);
  const costoMov = Math.max(0, Number(input.costoUnitarioMov ?? 0));

  if (cantidad <= 0 && tipo !== 'ajuste') {
    throw new Error('La cantidad debe ser mayor a 0');
  }

  if (tipo === 'entrada') {
    const stockNuevo = round3(stockActual + cantidad);
    const valorTotalNuevo = stockActual * costoPromedioActual + cantidad * costoMov;
    const costoPromedioNuevo = stockNuevo > 0 ? round4(valorTotalNuevo / stockNuevo) : 0;
    return {
      stockNuevo,
      costoPromedioNuevo,
      costoTotalMov: round2(cantidad * costoMov),
      cantidadEfectiva: cantidad,
      costoUnitarioEfectivo: costoMov,
    };
  }

  if (tipo === 'salida' || tipo === 'merma') {
    if (cantidad > stockActual + 1e-6) {
      throw new Error(`No hay stock suficiente. Disponible: ${stockActual}, intentas sacar: ${cantidad}.`);
    }
    const stockNuevo = round3(stockActual - cantidad);
    return {
      stockNuevo,
      costoPromedioNuevo: stockNuevo > 0 ? costoPromedioActual : 0,
      costoTotalMov: round2(cantidad * costoPromedioActual),
      cantidadEfectiva: cantidad,
      costoUnitarioEfectivo: costoPromedioActual,
    };
  }

  // ajuste — fijar stock al objetivo absoluto
  if (input.stockObjetivo === undefined || isNaN(Number(input.stockObjetivo))) {
    throw new Error('Para un ajuste, debes indicar el stock_objetivo');
  }
  const stockObjetivo = Math.max(0, Number(input.stockObjetivo));
  const diferencia = stockObjetivo - stockActual;
  return {
    stockNuevo: round3(stockObjetivo),
    costoPromedioNuevo: stockObjetivo > 0 ? costoPromedioActual : 0,
    costoTotalMov: round2(Math.abs(diferencia) * costoPromedioActual),
    cantidadEfectiva: round3(Math.abs(diferencia)),
    costoUnitarioEfectivo: costoPromedioActual,
  };
}

/**
 * Estado agregado del inventario para una lista de insumos.
 */
export interface ResumenInventario {
  total_insumos: number;
  insumos_bajo_minimo: number;
  insumos_agotados: number;
  valor_total_inventario: number;
}

export function calcularResumenInventario(
  insumos: Array<{ stock_actual: number | string; stock_minimo: number | string; costo_promedio: number | string }>
): ResumenInventario {
  let valor = 0;
  let bajoMinimo = 0;
  let agotados = 0;

  for (const i of insumos) {
    const stock = Number(i.stock_actual);
    const minimo = Number(i.stock_minimo);
    const cpp = Number(i.costo_promedio);
    valor += stock * cpp;
    if (stock <= 0) agotados++;
    else if (minimo > 0 && stock < minimo) bajoMinimo++;
  }

  return {
    total_insumos: insumos.length,
    insumos_bajo_minimo: bajoMinimo,
    insumos_agotados: agotados,
    valor_total_inventario: round2(valor),
  };
}

// ─── Helpers internos ────────────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
