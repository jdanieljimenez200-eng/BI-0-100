import { descontarInventarioPorVenta, devolverInventarioPorCancelacion } from '../../services/pos/inventarioVenta';
import { ItemPOSInsumo } from '../../models/ItemPOSInsumo';
import { InsumoInventario } from '../../models/InsumoInventario';
import { MovimientoInventario } from '../../models/MovimientoInventario';

/**
 * EntityManager falso, suficiente para el servicio: `find` devuelve lo que se
 * le cargue por entidad, `create` es identidad y `save`/`remove` solo registran.
 */
function crearManager(datos: { recetas?: unknown[]; insumos?: unknown[]; movimientos?: unknown[] }) {
  const llamadasFind: { entidad: unknown; opciones: Record<string, unknown> }[] = [];
  const guardados: { entidad: unknown; filas: unknown }[] = [];
  const eliminados: unknown[] = [];

  const manager = {
    find: jest.fn(async (entidad: unknown, opciones: Record<string, unknown>) => {
      llamadasFind.push({ entidad, opciones });
      if (entidad === ItemPOSInsumo) return datos.recetas ?? [];
      if (entidad === InsumoInventario) return datos.insumos ?? [];
      if (entidad === MovimientoInventario) return datos.movimientos ?? [];
      return [];
    }),
    create: jest.fn((_entidad: unknown, obj: unknown) => obj),
    save: jest.fn(async (entidad: unknown, filas: unknown) => {
      guardados.push({ entidad, filas });
      return filas;
    }),
    remove: jest.fn(async (_entidad: unknown, filas: unknown) => {
      eliminados.push(filas);
      return filas;
    }),
  };

  return { manager, llamadasFind, guardados, eliminados };
}

const args = (lineas: { item_pos_id?: string | null; nombre: string; cantidad: number }[]) => ({
  usuarioId: 'u1',
  trabajadorId: null,
  ventaId: 'venta-1',
  productoId: 'prod-1',
  numeroTicket: 'POS-000042',
  fecha: '2026-04-10',
  lineas,
});

const movimientosGuardados = (guardados: { entidad: unknown; filas: unknown }[]) =>
  (guardados.find((g) => g.entidad === MovimientoInventario)?.filas ?? []) as Record<string, number | string>[];

describe('descontarInventarioPorVenta', () => {
  it('no toca almacén si ninguna línea viene del catálogo', async () => {
    const { manager, guardados } = crearManager({});
    const r = await descontarInventarioPorVenta(
      manager as never,
      args([{ item_pos_id: null, nombre: 'Item libre', cantidad: 2 }]),
    );
    expect(r.costoUnitarioPorLinea).toEqual([null]);
    expect(r.advertencias).toEqual([]);
    expect(guardados).toHaveLength(0);
  });

  it('un item sin receta no descuenta y su costo queda en null, no en 0', async () => {
    // El 0 se leería como margen del 100%. `null` significa "no se sabe".
    const { manager, guardados } = crearManager({ recetas: [] });
    const r = await descontarInventarioPorVenta(
      manager as never,
      args([{ item_pos_id: 'item-1', nombre: 'Café', cantidad: 1 }]),
    );
    expect(r.costoUnitarioPorLinea).toEqual([null]);
    expect(guardados).toHaveLength(0);
  });

  it('descuenta los insumos de la receta y calcula el costo de la línea', async () => {
    const { manager, guardados } = crearManager({
      recetas: [
        { item_pos_id: 'item-1', insumo_id: 'ins-a', cantidad: 0.02 }, // 20 g de café
        { item_pos_id: 'item-1', insumo_id: 'ins-b', cantidad: 0.15 }, // 150 ml de leche
      ],
      insumos: [
        { id: 'ins-a', nombre: 'Café', unidad: 'kg', stock_actual: 5, costo_promedio: 300 },
        { id: 'ins-b', nombre: 'Leche', unidad: 'l', stock_actual: 20, costo_promedio: 25 },
      ],
    });

    const r = await descontarInventarioPorVenta(
      manager as never,
      args([{ item_pos_id: 'item-1', nombre: 'Latte', cantidad: 3 }]),
    );

    // 0.02 × 300 + 0.15 × 25 = 6 + 3.75
    expect(r.costoUnitarioPorLinea).toEqual([9.75]);
    expect(r.advertencias).toEqual([]);

    const movs = movimientosGuardados(guardados);
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.tipo === 'salida')).toBe(true);
    expect(movs.every((m) => m.venta_id === 'venta-1')).toBe(true);
    expect(movs.every((m) => m.motivo === 'Venta POS-000042')).toBe(true);

    const cafe = movs.find((m) => m.insumo_id === 'ins-a')!;
    expect(cafe.cantidad).toBe(0.06); // 0.02 × 3
    expect(cafe.stock_resultante).toBe(4.94);
    expect(cafe.costo_total).toBe(18); // 0.06 × 300
  });

  it('consolida en un solo movimiento el insumo que llega desde varias líneas', async () => {
    // Sin consolidar saldrían dos movimientos con `stock_resultante` calculado
    // sobre el mismo stock previo, y el segundo pisaría al primero.
    const { manager, guardados } = crearManager({
      recetas: [
        { item_pos_id: 'item-1', insumo_id: 'ins-a', cantidad: 1 },
        { item_pos_id: 'item-2', insumo_id: 'ins-a', cantidad: 2 },
      ],
      insumos: [{ id: 'ins-a', nombre: 'Vaso', unidad: 'pieza', stock_actual: 100, costo_promedio: 1.5 }],
    });

    await descontarInventarioPorVenta(
      manager as never,
      args([
        { item_pos_id: 'item-1', nombre: 'Chico', cantidad: 3 },  // 3
        { item_pos_id: 'item-2', nombre: 'Grande', cantidad: 4 }, // 8
      ]),
    );

    const movs = movimientosGuardados(guardados);
    expect(movs).toHaveLength(1);
    expect(movs[0].cantidad).toBe(11);
    expect(movs[0].stock_resultante).toBe(89);
  });

  it('con stock insuficiente advierte pero NO aborta la venta', async () => {
    // El cobro es real aunque el inventario esté mal capturado: parar el
    // mostrador por un dato equivocado cuesta la venta de verdad.
    const { manager, guardados } = crearManager({
      recetas: [{ item_pos_id: 'item-1', insumo_id: 'ins-a', cantidad: 1 }],
      insumos: [{ id: 'ins-a', nombre: 'Pan', unidad: 'pieza', stock_actual: 2, costo_promedio: 10 }],
    });

    const r = await descontarInventarioPorVenta(
      manager as never,
      args([{ item_pos_id: 'item-1', nombre: 'Torta', cantidad: 5 }]),
    );

    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0]).toContain('Pan');
    const movs = movimientosGuardados(guardados);
    expect(movs).toHaveLength(1);
    expect(movs[0].stock_resultante).toBe(-3); // negativo permitido a propósito
  });

  it('bloquea los insumos con pessimistic_write y ORDENADOS POR id', async () => {
    // El orden determinista es lo que impide el deadlock cuando dos ventas
    // comparten insumos. Si esta aserción falla, el bug solo aparecerá en
    // producción y bajo carga.
    const { manager, llamadasFind } = crearManager({
      recetas: [
        { item_pos_id: 'item-1', insumo_id: 'ins-z', cantidad: 1 },
        { item_pos_id: 'item-1', insumo_id: 'ins-a', cantidad: 1 },
      ],
      insumos: [
        { id: 'ins-a', nombre: 'A', unidad: 'pieza', stock_actual: 10, costo_promedio: 1 },
        { id: 'ins-z', nombre: 'Z', unidad: 'pieza', stock_actual: 10, costo_promedio: 1 },
      ],
    });

    await descontarInventarioPorVenta(
      manager as never,
      args([{ item_pos_id: 'item-1', nombre: 'Combo', cantidad: 1 }]),
    );

    const findInsumos = llamadasFind.find((l) => l.entidad === InsumoInventario)!;
    expect(findInsumos.opciones.lock).toEqual({ mode: 'pessimistic_write' });
    expect(findInsumos.opciones.order).toEqual({ id: 'ASC' });
    // Y los ids se piden ya ordenados, no en el orden en que aparecen.
    const where = findInsumos.opciones.where as { id: { _value: string[] } };
    expect(where.id._value).toEqual(['ins-a', 'ins-z']);
  });

  it('un insumo que no se resuelve deja el costo en null, nunca en 0', async () => {
    // Un 0 aquí se leería como margen del 100%. Si algún ingrediente no se
    // puede valorar, el costo de la línea completa es desconocido.
    const { manager, guardados } = crearManager({
      recetas: [{ item_pos_id: 'item-1', insumo_id: 'ins-ajeno', cantidad: 1 }],
      insumos: [], // el find con usuario_id no lo devuelve
    });

    const r = await descontarInventarioPorVenta(
      manager as never,
      args([{ item_pos_id: 'item-1', nombre: 'X', cantidad: 1 }]),
    );

    expect(guardados).toHaveLength(0);
    expect(r.costoUnitarioPorLinea).toEqual([null]);
  });

  it('una receta resuelta a medias tampoco produce un costo parcial', async () => {
    const { manager } = crearManager({
      recetas: [
        { item_pos_id: 'item-1', insumo_id: 'ins-a', cantidad: 1 },
        { item_pos_id: 'item-1', insumo_id: 'ins-fantasma', cantidad: 2 },
      ],
      insumos: [{ id: 'ins-a', nombre: 'A', unidad: 'pieza', stock_actual: 10, costo_promedio: 7 }],
    });

    const r = await descontarInventarioPorVenta(
      manager as never,
      args([{ item_pos_id: 'item-1', nombre: 'Combo', cantidad: 1 }]),
    );

    // 7 sería un costo real pero INCOMPLETO, y el margen saldría inflado.
    expect(r.costoUnitarioPorLinea).toEqual([null]);
  });
});

describe('devolverInventarioPorCancelacion', () => {
  const datos = (ventaId: string) => ({
    usuarioId: 'u1',
    trabajadorId: null,
    ventaId,
    numeroTicket: 'POS-1',
    fecha: '2026-09-22',
  });

  it('devuelve el stock con una ENTRADA y conserva la salida original', async () => {
    const insumo = { id: 'ins-a', nombre: 'Pan', unidad: 'pieza', stock_actual: 4, costo_promedio: 10 };
    const { manager, guardados, eliminados } = crearManager({
      movimientos: [{ id: 'm1', insumo_id: 'ins-a', tipo: 'salida', cantidad: 6, costo_unitario: 9 }],
      insumos: [insumo],
    });

    await devolverInventarioPorCancelacion(manager as never, datos('venta-1'));

    // Se suma lo devuelto al stock ACTUAL, no se restaura `stock_resultante`:
    // entre la venta y su cancelación pudo haber otros movimientos.
    expect(insumo.stock_actual).toBe(10);
    // El consumo original sigue ahí: el almacén tiene que poder explicarse.
    expect(eliminados).toHaveLength(0);
    const entradas = movimientosGuardados(guardados);
    expect(entradas).toHaveLength(1);
    const mov = entradas[0] as unknown as Record<string, unknown>;
    expect(mov.tipo).toBe('entrada');
    expect(mov.cantidad).toBe(6);
    expect(mov.motivo).toBe('Cancelación de venta POS-1');
    // Vuelve al costo al que salió, no al costo promedio de hoy.
    expect(mov.costo_unitario).toBe(9);
  });

  it('no hace nada si la venta no generó movimientos', async () => {
    const { manager, guardados, eliminados } = crearManager({ movimientos: [] });
    await devolverInventarioPorCancelacion(manager as never, datos('venta-sin-receta'));
    expect(guardados).toHaveLength(0);
    expect(eliminados).toHaveLength(0);
  });

  it('solo devuelve las salidas, nunca entradas o ajustes', async () => {
    const insumo = { id: 'ins-a', nombre: 'Pan', unidad: 'pieza', stock_actual: 5, costo_promedio: 10 };
    const { manager } = crearManager({
      movimientos: [
        { id: 'm1', insumo_id: 'ins-a', tipo: 'salida', cantidad: 3 },
        { id: 'm2', insumo_id: 'ins-a', tipo: 'entrada', cantidad: 50 },
      ],
      insumos: [insumo],
    });

    await devolverInventarioPorCancelacion(manager as never, datos('venta-1'));
    expect(insumo.stock_actual).toBe(8); // 5 + 3, la entrada no se revierte
  });

  it('cancelar dos veces no duplica el stock', async () => {
    const insumo = { id: 'ins-a', nombre: 'Pan', unidad: 'pieza', stock_actual: 4, costo_promedio: 10 };
    const { manager } = crearManager({
      movimientos: [
        { id: 'm1', insumo_id: 'ins-a', tipo: 'salida', cantidad: 6 },
        // La devolución ya está registrada (reintento o doble clic).
        { id: 'm2', insumo_id: 'ins-a', tipo: 'entrada', cantidad: 6, motivo: 'Cancelación de venta POS-1' },
      ],
      insumos: [insumo],
    });

    await devolverInventarioPorCancelacion(manager as never, datos('venta-1'));
    expect(insumo.stock_actual).toBe(4);
  });
});
