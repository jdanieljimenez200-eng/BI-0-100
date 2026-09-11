import { EntityManager, In } from 'typeorm';
import { ItemPOSInsumo } from '../../models/ItemPOSInsumo';
import { InsumoInventario } from '../../models/InsumoInventario';
import { MovimientoInventario } from '../../models/MovimientoInventario';

export interface LineaParaInventario {
  item_pos_id?: string | null;
  nombre: string;
  cantidad: number;
}

export interface ResultadoDescuento {
  /** Costo unitario por índice de línea. `null` = el item no tiene receta. */
  costoUnitarioPorLinea: (number | null)[];
  /** Mensajes legibles para el ticket cuando el stock no alcanzaba. */
  advertencias: string[];
}

interface ArgsDescuento {
  usuarioId: string;
  trabajadorId: string | null;
  ventaId: string;
  productoId: string;
  numeroTicket: string;
  fecha: string;
  lineas: LineaParaInventario[];
}

const n = (v: unknown) => Number(v ?? 0);
/** Redondeo a 3 decimales — la escala de `cantidad` en inventario. */
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Redondeo a 4 decimales — la escala de los costos unitarios. */
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Descuenta de almacén los insumos que consume una venta y calcula el costo de
 * cada línea.
 *
 * Se llama DENTRO de la transacción de la venta, nunca fuera: si el descuento
 * falla, la venta no debe existir.
 *
 * Decisiones que importan:
 *
 * 1. Los insumos se bloquean con `pessimistic_write` ORDENADOS POR `id`. El
 *    lock lo exige la guía del proyecto; el orden determinista lo añade este
 *    servicio. Sin él, dos ventas que comparten insumos en distinto orden se
 *    bloquean mutuamente y producen un deadlock intermitente que solo aparece
 *    bajo carga real.
 *
 * 2. Stock insuficiente NO aborta la venta. Un mostrador no puede detenerse
 *    porque el inventario esté mal capturado: el cobro es real y el dato de
 *    stock puede no serlo. Se permite el negativo, se registra el movimiento y
 *    se devuelve una advertencia para pintarla en el ticket.
 *
 * 3. Un item sin receta no descuenta nada y su costo queda en `null`, que se
 *    distingue de 0 a propósito: un 0 se leería como margen del 100%.
 */
export async function descontarInventarioPorVenta(
  manager: EntityManager,
  args: ArgsDescuento,
): Promise<ResultadoDescuento> {
  const { usuarioId, trabajadorId, ventaId, productoId, numeroTicket, fecha, lineas } = args;

  const vacio: ResultadoDescuento = {
    costoUnitarioPorLinea: lineas.map(() => null),
    advertencias: [],
  };

  const itemIds = [...new Set(lineas.map((l) => l.item_pos_id).filter((id): id is string => !!id))];
  if (itemIds.length === 0) return vacio;

  // 1. Recetas de todos los items del carrito, en una sola query.
  const recetas = await manager.find(ItemPOSInsumo, {
    where: { usuario_id: usuarioId, item_pos_id: In(itemIds) },
  });
  if (recetas.length === 0) return vacio;

  const recetaPorItem = new Map<string, ItemPOSInsumo[]>();
  for (const r of recetas) {
    const lista = recetaPorItem.get(r.item_pos_id) ?? [];
    lista.push(r);
    recetaPorItem.set(r.item_pos_id, lista);
  }

  // 2. Consumo total por insumo. Se consolida porque un mismo insumo puede
  //    llegar desde varias líneas distintas del carrito.
  const consumoPorInsumo = new Map<string, number>();
  for (const linea of lineas) {
    if (!linea.item_pos_id) continue;
    for (const ing of recetaPorItem.get(linea.item_pos_id) ?? []) {
      const usado = n(ing.cantidad) * n(linea.cantidad);
      consumoPorInsumo.set(ing.insumo_id, (consumoPorInsumo.get(ing.insumo_id) ?? 0) + usado);
    }
  }
  if (consumoPorInsumo.size === 0) return vacio;

  // 3. Bloqueo pesimista ORDENADO POR id — ver nota 1 del bloque de arriba.
  const insumoIds = [...consumoPorInsumo.keys()].sort();
  const insumos = await manager.find(InsumoInventario, {
    where: { id: In(insumoIds), usuario_id: usuarioId },
    order: { id: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  });
  const insumoPorId = new Map(insumos.map((i) => [i.id, i]));

  // 4. Costo unitario por línea, con el costo promedio ya bloqueado.
  const costoUnitarioPorLinea = lineas.map((linea) => {
    if (!linea.item_pos_id) return null;
    const receta = recetaPorItem.get(linea.item_pos_id);
    if (!receta || receta.length === 0) return null;
    let costo = 0;
    for (const ing of receta) {
      const insumo = insumoPorId.get(ing.insumo_id);
      // Si un ingrediente no se resuelve, el costo saldría INCOMPLETO y por
      // tanto el margen inflado. Vale más decir "no se sabe" que dar un número
      // que parece bueno: se descarta la línea entera.
      if (!insumo) return null;
      costo += n(ing.cantidad) * n(insumo.costo_promedio);
    }
    return r4(costo);
  });

  // 5. Aplicar el descuento y registrar el movimiento de almacén.
  const advertencias: string[] = [];
  const movimientos: MovimientoInventario[] = [];

  for (const insumoId of insumoIds) {
    const insumo = insumoPorId.get(insumoId);
    if (!insumo) continue; // insumo de otra cuenta o borrado: se ignora en silencio

    const cantidad = r3(consumoPorInsumo.get(insumoId) ?? 0);
    if (cantidad <= 0) continue;

    const stockPrevio = n(insumo.stock_actual);
    if (stockPrevio < cantidad) {
      advertencias.push(
        `Stock insuficiente de "${insumo.nombre}": había ${stockPrevio} ${insumo.unidad} y la venta consume ${cantidad}.`,
      );
    }

    const stockResultante = r3(stockPrevio - cantidad);
    const costoUnitario = n(insumo.costo_promedio);

    movimientos.push(
      manager.create(MovimientoInventario, {
        usuario_id:       usuarioId,
        creado_por_id:    trabajadorId,
        insumo_id:        insumoId,
        producto_id:      productoId,
        tipo:             'salida',
        cantidad,
        costo_unitario:   costoUnitario,
        costo_total:      Math.round(cantidad * costoUnitario * 100) / 100,
        stock_resultante: stockResultante,
        fecha,
        motivo:           `Venta ${numeroTicket}`,
        proveedor:        null,
        venta_id:         ventaId,
      }),
    );

    insumo.stock_actual = stockResultante;
  }

  if (movimientos.length > 0) {
    await manager.save(InsumoInventario, insumos);
    await manager.save(MovimientoInventario, movimientos);
  }

  return { costoUnitarioPorLinea, advertencias };
}

/**
 * Devuelve al almacén lo que consumió una venta y borra sus movimientos.
 *
 * Se llama al eliminar la venta. Sin esto, cada cancelación deja el stock
 * descontado para siempre y el movimiento huérfano (la FK es ON DELETE SET
 * NULL, así que sobreviviría sin referencia a nada).
 *
 * Se recalcula el stock sumando la cantidad devuelta en vez de restaurar
 * `stock_resultante`: entre la venta y su cancelación puede haber habido otros
 * movimientos, y restaurar el valor histórico los borraría.
 */
export async function revertirInventarioPorVenta(
  manager: EntityManager,
  usuarioId: string,
  ventaId: string,
): Promise<void> {
  const movimientos = await manager.find(MovimientoInventario, {
    where: { usuario_id: usuarioId, venta_id: ventaId },
  });
  if (movimientos.length === 0) return;

  const devolucionPorInsumo = new Map<string, number>();
  for (const mov of movimientos) {
    // Solo se devuelven las salidas que generó la venta.
    if (mov.tipo !== 'salida') continue;
    devolucionPorInsumo.set(mov.insumo_id, (devolucionPorInsumo.get(mov.insumo_id) ?? 0) + n(mov.cantidad));
  }

  if (devolucionPorInsumo.size > 0) {
    const insumoIds = [...devolucionPorInsumo.keys()].sort();
    const insumos = await manager.find(InsumoInventario, {
      where: { id: In(insumoIds), usuario_id: usuarioId },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const insumo of insumos) {
      insumo.stock_actual = r3(n(insumo.stock_actual) + (devolucionPorInsumo.get(insumo.id) ?? 0));
    }
    if (insumos.length > 0) await manager.save(InsumoInventario, insumos);
  }

  await manager.remove(MovimientoInventario, movimientos);
}
