import { AppDataSource } from '../../config/database';
import { timezoneSegura } from '../../utils/timezones';

/**
 * Motor de agregación del área de Reportes.
 *
 * Reglas que se aplican en TODAS las consultas de este archivo:
 *
 * 1. **Todo se agrega en SQL.** Nunca se traen filas a Node para sumarlas: con
 *    dos años de tickets eso agota la memoria del contenedor.
 *
 * 2. **Las ventas canceladas se excluyen siempre** (`estado <> 'cancelada'`).
 *    Colarlas en un solo endpoint basta para que las cifras dejen de cuadrar
 *    entre pestañas.
 *
 * 3. **Cada consulta tiene UNA fuente.** Una venta del POS genera además un
 *    `MovimientoContable` de ingreso: sumar ventas + ingresos contables
 *    duplicaría la facturación. Lo que sale de `ventas` no se mezcla con lo que
 *    sale de `movimientos_contables`; el front etiqueta cuál está mirando.
 *
 * 4. **Las series usan `ventas.fecha`**, que es un `date` sin hora y por tanto
 *    inmune al desfase de zona horaria. El único sitio donde la hora importa es
 *    el heatmap, y ahí se convierte explícitamente con `AT TIME ZONE`.
 */

export interface FiltrosReporte {
  usuarioId: string;
  /** `null` = todos los productos de la cuenta (modo consolidado). */
  productoId?: string | null;
  negocioId?: string | null;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  /** Zona IANA, solo para los reportes que dependen de la hora. */
  tz?: string;
}

export type Granularidad = 'dia' | 'semana' | 'mes' | 'anio';

/** Whitelist: estos valores se interpolan en SQL, así que no pueden ser libres. */
const UNIDAD_SQL: Record<Granularidad, string> = {
  dia: 'day',
  semana: 'week',
  mes: 'month',
  anio: 'year',
};

const INTERVALO_SQL: Record<Granularidad, string> = {
  dia: '1 day',
  semana: '1 week',
  mes: '1 month',
  anio: '1 year',
};

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Construye el filtro común de ventas.
 *
 * Devuelve el fragmento SQL y los parámetros, numerados a partir de `desde`
 * para poder concatenarlos con el resto de la consulta sin desalinearlos.
 */
function filtroVentas(f: FiltrosReporte, primerIndice: number) {
  const params: unknown[] = [f.usuarioId, f.desde, f.hasta];
  let sql = `v.usuario_id = $${primerIndice}
             AND v.fecha BETWEEN $${primerIndice + 1} AND $${primerIndice + 2}
             AND v.estado <> 'cancelada'`;
  let i = primerIndice + 3;
  if (f.productoId) {
    sql += ` AND v.producto_id = $${i}`;
    params.push(f.productoId);
    i++;
  }
  if (f.negocioId) {
    sql += ` AND v.negocio_id = $${i}`;
    params.push(f.negocioId);
    i++;
  }
  return { sql, params, siguienteIndice: i };
}

/**
 * Filtro de ÁMBITO de ventas (cuenta, producto, negocio) sin rango de fechas.
 *
 * Lo usan las consultas que necesitan mirar todo el histórico —como saber
 * cuándo compró por primera vez un cliente— manteniendo el mismo recorte de
 * producto/negocio que el resto del reporte.
 */
function filtroAmbito(f: FiltrosReporte, primerIndice: number) {
  const params: unknown[] = [f.usuarioId];
  let sql = `v.usuario_id = $${primerIndice} AND v.estado <> 'cancelada'`;
  let i = primerIndice + 1;
  if (f.productoId) {
    sql += ` AND v.producto_id = $${i}`;
    params.push(f.productoId);
    i++;
  }
  if (f.negocioId) {
    sql += ` AND v.negocio_id = $${i}`;
    params.push(f.negocioId);
    i++;
  }
  return { sql, params, siguienteIndice: i };
}

/** Periodo inmediatamente anterior, del mismo número de días, para el Δ%. */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const d = new Date(`${desde}T00:00:00Z`);
  const h = new Date(`${hasta}T00:00:00Z`);
  const dias = Math.max(1, Math.round((h.getTime() - d.getTime()) / 86400000) + 1);
  const finPrevio = new Date(d.getTime() - 86400000);
  const iniPrevio = new Date(finPrevio.getTime() - (dias - 1) * 86400000);
  return {
    desde: iniPrevio.toISOString().slice(0, 10),
    hasta: finPrevio.toISOString().slice(0, 10),
  };
}

export function variacion(actual: number, previo: number): number | null {
  if (previo === 0) return null; // "sin base de comparación" ≠ "0% de cambio"
  return r2(((actual - previo) / previo) * 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════

async function totalesVentas(f: FiltrosReporte) {
  const { sql, params } = filtroVentas(f, 1);
  const [row] = await AppDataSource.query(
    `SELECT
       COUNT(*)::int                       AS num_ventas,
       COALESCE(SUM(v.total), 0)           AS importe,
       COALESCE(SUM(v.subtotal), 0)        AS subtotal,
       COALESCE(SUM(v.impuesto_monto), 0)  AS impuestos,
       COALESCE(AVG(v.total), 0)           AS ticket_promedio
     FROM ventas v
     WHERE ${sql}`,
    params,
  );
  return {
    num_ventas: n(row?.num_ventas),
    importe: r2(n(row?.importe)),
    subtotal: r2(n(row?.subtotal)),
    impuestos: r2(n(row?.impuestos)),
    ticket_promedio: r2(n(row?.ticket_promedio)),
  };
}

/**
 * Costo de lo vendido, desde el snapshot congelado en cada línea.
 *
 * `cobertura_pct` dice qué porcentaje del importe vendido tiene costo conocido.
 * Es tan importante como el margen: sin él, un catálogo a medio configurar
 * produce un margen del 90% que parece real y no lo es.
 */
async function costoYMargen(f: FiltrosReporte) {
  const { sql, params } = filtroVentas(f, 1);
  const [row] = await AppDataSource.query(
    `SELECT
       COALESCE(SUM(vi.costo_unitario_snapshot * vi.cantidad), 0) AS costo,
       COALESCE(SUM(vi.subtotal_linea) FILTER (WHERE vi.costo_unitario_snapshot IS NOT NULL), 0) AS venta_con_costo,
       COALESCE(SUM(vi.subtotal_linea), 0) AS venta_total
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     WHERE ${sql}`,
    params,
  );
  const costo = r2(n(row?.costo));
  const ventaConCosto = r2(n(row?.venta_con_costo));
  const ventaTotal = r2(n(row?.venta_total));
  const utilidadBruta = r2(ventaConCosto - costo);
  return {
    costo_ventas: costo,
    utilidad_bruta: utilidadBruta,
    margen_pct: ventaConCosto > 0 ? r2((utilidadBruta / ventaConCosto) * 100) : null,
    cobertura_pct: ventaTotal > 0 ? r2((ventaConCosto / ventaTotal) * 100) : 0,
  };
}

/**
 * Flujo del libro contable. Fuente independiente de `ventas` — ver regla 3.
 *
 * Al acotar por producto se incluyen también los movimientos SIN producto
 * (la nómina, por ejemplo, guarda `producto_id: null`), exactamente el mismo
 * criterio que usa la pestaña Movimientos (`routes/contabilidad.ts:70`). Con un
 * `=` estricto, el balance de Reportes y el de Movimientos no cuadrarían entre
 * sí dentro de la misma página.
 */
async function flujoContable(f: FiltrosReporte) {
  const params: unknown[] = [f.usuarioId, f.desde, f.hasta];
  let sql = `m.usuario_id = $1 AND m.fecha BETWEEN $2 AND $3`;
  if (f.productoId) {
    sql += ` AND (m.producto_id = $4 OR m.producto_id IS NULL)`;
    params.push(f.productoId);
  }
  const [row] = await AppDataSource.query(
    `SELECT
       COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'egreso'), 0)  AS egresos
     FROM movimientos_contables m
     WHERE ${sql}`,
    params,
  );
  const ingresos = r2(n(row?.ingresos));
  const egresos = r2(n(row?.egresos));
  return { ingresos, egresos, utilidad_neta: r2(ingresos - egresos) };
}

export async function resumen(f: FiltrosReporte) {
  const previo = periodoAnterior(f.desde, f.hasta);
  const [ventas, margen, flujo, ventasPrevias] = await Promise.all([
    totalesVentas(f),
    costoYMargen(f),
    flujoContable(f),
    totalesVentas({ ...f, ...previo }),
  ]);

  return {
    periodo: { desde: f.desde, hasta: f.hasta },
    periodo_anterior: previo,
    ventas,
    margen,
    flujo,
    comparativa: {
      importe_pct: variacion(ventas.importe, ventasPrevias.importe),
      num_ventas_pct: variacion(ventas.num_ventas, ventasPrevias.num_ventas),
      ticket_promedio_pct: variacion(ventas.ticket_promedio, ventasPrevias.ticket_promedio),
      importe_anterior: ventasPrevias.importe,
      num_ventas_anterior: ventasPrevias.num_ventas,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERIE TEMPORAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serie de ventas por día / semana / mes / año.
 *
 * Los periodos SIN ventas salen con 0, no se omiten: un `GROUP BY` a secas
 * produce una gráfica que salta del día 3 al día 7 y eso miente visualmente.
 * De ahí el `generate_series` + `LEFT JOIN`.
 */
export async function serie(f: FiltrosReporte, granularidad: Granularidad) {
  const unidad = UNIDAD_SQL[granularidad];
  const intervalo = INTERVALO_SQL[granularidad];
  const { sql, params } = filtroVentas(f, 3); // $1 y $2 los usa generate_series

  const filas = await AppDataSource.query(
    `WITH periodos AS (
       SELECT generate_series(
         date_trunc('${unidad}', $1::date),
         date_trunc('${unidad}', $2::date),
         '${intervalo}'::interval
       )::date AS periodo
     ),
     datos AS (
       SELECT date_trunc('${unidad}', v.fecha)::date AS periodo,
              COUNT(*)::int             AS num_ventas,
              COALESCE(SUM(v.total), 0) AS importe
       FROM ventas v
       WHERE ${sql}
       GROUP BY 1
     )
     SELECT to_char(p.periodo, 'YYYY-MM-DD') AS periodo,
            COALESCE(d.num_ventas, 0) AS num_ventas,
            COALESCE(d.importe, 0)    AS importe
     FROM periodos p
     LEFT JOIN datos d ON d.periodo = p.periodo
     ORDER BY p.periodo`,
    [f.desde, f.hasta, ...params],
  );

  return filas.map((r: Record<string, unknown>) => ({
    periodo: String(r.periodo),
    num_ventas: n(r.num_ventas),
    importe: r2(n(r.importe)),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTOS MÁS VENDIDOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ranking de lo más vendido, por unidades y por importe.
 *
 * Se agrupa por `nombre_snapshot` y no por `item_pos_id` a propósito: los items
 * borrados del catálogo dejan `item_pos_id` en NULL, y agrupar por él mandaría
 * todo el histórico de items eliminados a un único cajón "sin nombre".
 */
export async function topProductos(f: FiltrosReporte, limite = 20) {
  const { sql, params, siguienteIndice } = filtroVentas(f, 1);

  const filas = await AppDataSource.query(
    `SELECT
       vi.nombre_snapshot                    AS nombre,
       MAX(vi.item_pos_id::text)             AS item_pos_id,
       SUM(vi.cantidad)                      AS unidades,
       SUM(vi.subtotal_linea)                AS importe,
       SUM(vi.costo_unitario_snapshot * vi.cantidad) AS costo,
       -- Importe SOLO de las unidades con costo conocido: el margen tiene que
       -- calcularse contra esto, no contra el importe total.
       SUM(vi.subtotal_linea) FILTER (WHERE vi.costo_unitario_snapshot IS NOT NULL) AS importe_con_costo,
       COUNT(DISTINCT v.id)::int             AS tickets,
       bool_or(vi.costo_unitario_snapshot IS NULL) AS sin_costo
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     WHERE ${sql}
     GROUP BY vi.nombre_snapshot
     ORDER BY importe DESC
     LIMIT $${siguienteIndice}`,
    [...params, limite],
  );

  return filas.map((r: Record<string, unknown>) => {
    const importe = r2(n(r.importe));
    // `costo` en NULL = ninguna unidad vendida tenía receta. No es 0: un 0 se
    // leería como margen del 100%.
    const costo = r.costo === null ? null : r2(n(r.costo));
    // El margen se mide contra el importe de las unidades que SÍ tienen costo.
    // Usar el importe total inflaría el margen en cuanto una parte del volumen
    // se vendiera sin receta definida, y contradiría al KPI de arriba, que ya
    // compara sólo la porción con costo conocido.
    const importeConCosto = r.importe_con_costo === null ? 0 : r2(n(r.importe_con_costo));
    const utilidad = costo === null ? null : r2(importeConCosto - costo);
    return {
      nombre: r.nombre,
      item_pos_id: r.item_pos_id ?? null,
      unidades: r2(n(r.unidades)),
      importe,
      tickets: n(r.tickets),
      costo,
      utilidad,
      margen_pct:
        utilidad === null || importeConCosto === 0
          ? null
          : r2((utilidad / importeConCosto) * 100),
      // true si ALGUNA unidad no tenía costo: el margen mostrado es parcial.
      costo_parcial: Boolean(r.sin_costo),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ALMACÉN
// ═══════════════════════════════════════════════════════════════════════════

export async function almacen(f: FiltrosReporte) {
  const params: unknown[] = [f.usuarioId, f.desde, f.hasta];
  let filtro = `mi.usuario_id = $1 AND mi.fecha BETWEEN $2 AND $3`;
  if (f.productoId) {
    // El almacén es de la cuenta, no del producto: `insumos_inventario` ni
    // siquiera tiene `producto_id`. Un movimiento manual sin producto asignado
    // alimenta igualmente a este producto, así que se incluye.
    filtro += ` AND (mi.producto_id = $4 OR mi.producto_id IS NULL)`;
    params.push(f.productoId);
  }

  const [totales] = await AppDataSource.query(
    `SELECT
       COALESCE(SUM(mi.cantidad)    FILTER (WHERE mi.tipo = 'entrada'), 0) AS entradas_unidades,
       COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'entrada'), 0) AS entradas_valor,
       COALESCE(SUM(mi.cantidad)    FILTER (WHERE mi.tipo = 'salida'),  0) AS salidas_unidades,
       COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'salida'),  0) AS salidas_valor,
       COALESCE(SUM(mi.cantidad)    FILTER (WHERE mi.tipo = 'merma'),   0) AS mermas_unidades,
       COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'merma'),   0) AS mermas_valor,
       COALESCE(SUM(mi.cantidad)    FILTER (WHERE mi.tipo = 'ajuste'),  0) AS ajustes_unidades,
       COUNT(*) FILTER (WHERE mi.venta_id IS NOT NULL)::int AS salidas_por_venta
     FROM movimientos_inventario mi
     WHERE ${filtro}`,
    params,
  );

  const porInsumo = await AppDataSource.query(
    `SELECT
       i.id, i.nombre, i.unidad,
       COALESCE(SUM(mi.cantidad)    FILTER (WHERE mi.tipo = 'entrada'), 0) AS entradas,
       COALESCE(SUM(mi.cantidad)    FILTER (WHERE mi.tipo = 'salida'),  0) AS salidas,
       COALESCE(SUM(mi.cantidad)    FILTER (WHERE mi.tipo = 'merma'),   0) AS mermas,
       COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'salida'),  0) AS valor_salidas
     FROM movimientos_inventario mi
     JOIN insumos_inventario i ON i.id = mi.insumo_id
     WHERE ${filtro}
     GROUP BY i.id, i.nombre, i.unidad
     ORDER BY salidas DESC
     LIMIT 50`,
    params,
  );

  // El stock bajo mínimo se mira SIEMPRE en el presente, no dentro del rango:
  // es una alerta operativa de hoy, no un dato histórico.
  const bajoMinimo = await AppDataSource.query(
    `SELECT id, nombre, unidad, stock_actual, stock_minimo, costo_promedio
     FROM insumos_inventario
     WHERE usuario_id = $1 AND activo = true
       AND stock_minimo > 0 AND stock_actual <= stock_minimo
     ORDER BY (stock_actual - stock_minimo) ASC
     LIMIT 50`,
    [f.usuarioId],
  );

  return {
    totales: {
      entradas_unidades: r2(n(totales?.entradas_unidades)),
      entradas_valor: r2(n(totales?.entradas_valor)),
      salidas_unidades: r2(n(totales?.salidas_unidades)),
      salidas_valor: r2(n(totales?.salidas_valor)),
      mermas_unidades: r2(n(totales?.mermas_unidades)),
      mermas_valor: r2(n(totales?.mermas_valor)),
      ajustes_unidades: r2(n(totales?.ajustes_unidades)),
      salidas_por_venta: n(totales?.salidas_por_venta),
    },
    por_insumo: porInsumo.map((r: Record<string, unknown>) => ({
      id: r.id,
      nombre: r.nombre,
      unidad: r.unidad,
      entradas: r2(n(r.entradas)),
      salidas: r2(n(r.salidas)),
      mermas: r2(n(r.mermas)),
      valor_salidas: r2(n(r.valor_salidas)),
    })),
    bajo_minimo: bajoMinimo.map((r: Record<string, unknown>) => ({
      id: r.id,
      nombre: r.nombre,
      unidad: r.unidad,
      stock_actual: r2(n(r.stock_actual)),
      stock_minimo: r2(n(r.stock_minimo)),
      costo_promedio: r2(n(r.costo_promedio)),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Comportamiento de clientes.
 *
 * "Nuevo" = su primera compra cayó dentro del periodo; "recurrente" = ya había
 * comprado antes. Se calcula con la primera venta histórica del cliente, no con
 * la fecha de alta en el CRM: alguien registrado hace un año que compra hoy por
 * primera vez es un cliente nuevo en términos de negocio.
 *
 * Solo cuenta lo que tiene `cliente_id`. Las ventas a público general se
 * reportan aparte para que el usuario vea cuánta información está perdiendo.
 */
export async function clientes(f: FiltrosReporte) {
  const { sql, params } = filtroVentas(f, 1);

  const [cobertura] = await AppDataSource.query(
    `SELECT
       COUNT(*) FILTER (WHERE v.cliente_id IS NOT NULL)::int AS con_cliente,
       COUNT(*) FILTER (WHERE v.cliente_id IS NULL)::int     AS sin_cliente,
       COALESCE(SUM(v.total) FILTER (WHERE v.cliente_id IS NULL), 0) AS importe_sin_cliente
     FROM ventas v
     WHERE ${sql}`,
    params,
  );

  const top = await AppDataSource.query(
    `SELECT c.id, c.nombre, c.telefono, c.categoria,
            COUNT(*)::int             AS compras,
            COALESCE(SUM(v.total), 0) AS importe,
            COALESCE(AVG(v.total), 0) AS ticket_promedio,
            to_char(MAX(v.fecha), 'YYYY-MM-DD') AS ultima_compra
     FROM ventas v
     JOIN clientes c ON c.id = v.cliente_id
     WHERE ${sql}
     GROUP BY c.id, c.nombre, c.telefono, c.categoria
     ORDER BY importe DESC
     LIMIT 20`,
    params,
  );

  // `primera_compra` usa el MISMO ámbito que el resto del reporte, no el
  // histórico global: mirando un solo producto, "nuevo" tiene que significar
  // nuevo en ese producto. Mezclar los dos criterios haría que un cliente
  // saliera como recurrente por haber comprado algo distinto hace un año.
  const amb = filtroAmbito(f, 1);
  const [segmentos] = await AppDataSource.query(
    `WITH primera_compra AS (
       SELECT v.cliente_id, MIN(v.fecha) AS primera
       FROM ventas v
       WHERE ${amb.sql} AND v.cliente_id IS NOT NULL
       GROUP BY v.cliente_id
     ),
     en_periodo AS (
       SELECT DISTINCT v.cliente_id
       FROM ventas v
       WHERE ${amb.sql}
         AND v.fecha BETWEEN $${amb.siguienteIndice} AND $${amb.siguienteIndice + 1}
         AND v.cliente_id IS NOT NULL
     )
     SELECT
       COUNT(*) FILTER (WHERE p.primera >= $${amb.siguienteIndice})::int AS nuevos,
       COUNT(*) FILTER (WHERE p.primera <  $${amb.siguienteIndice})::int AS recurrentes
     FROM en_periodo e
     JOIN primera_compra p ON p.cliente_id = e.cliente_id`,
    [...amb.params, f.desde, f.hasta],
  );

  return {
    cobertura: {
      ventas_con_cliente: n(cobertura?.con_cliente),
      ventas_sin_cliente: n(cobertura?.sin_cliente),
      importe_sin_cliente: r2(n(cobertura?.importe_sin_cliente)),
    },
    segmentos: {
      nuevos: n(segmentos?.nuevos),
      recurrentes: n(segmentos?.recurrentes),
    },
    top: top.map((r: Record<string, unknown>) => ({
      id: r.id,
      nombre: r.nombre,
      telefono: r.telefono,
      categoria: r.categoria,
      compras: n(r.compras),
      importe: r2(n(r.importe)),
      ticket_promedio: r2(n(r.ticket_promedio)),
      ultima_compra: r.ultima_compra ? String(r.ultima_compra) : null,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HORARIOS Y MÉTODOS DE PAGO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Heatmap día de la semana × hora.
 *
 * Único reporte que depende de la hora, y por tanto el único que necesita
 * `AT TIME ZONE`. Sin la conversión, las ventas de la noche se contarían en el
 * día siguiente y el mapa saldría mal sin dar ningún error.
 *
 * Usa `fecha_creacion` (timestamp real del cobro), no `fecha`, que es un `date`
 * y además puede haberse capturado con retraso.
 */
export async function horarios(f: FiltrosReporte) {
  const tz = timezoneSegura(f.tz ?? '');
  const { sql, params } = filtroVentas(f, 1);

  // `fecha_creacion` es `timestamp without time zone` y guarda UTC (el `now()`
  // del contenedor). Hacen falta DOS conversiones: la primera lo marca como UTC
  // y la segunda lo lleva a la zona local. Con una sola, Postgres INTERPRETA el
  // valor como si ya fuera hora local y desplaza el resultado al revés.
  const localSql = `((v.fecha_creacion AT TIME ZONE 'UTC') AT TIME ZONE '${tz}')`;

  const filas = await AppDataSource.query(
    `SELECT
       EXTRACT(DOW  FROM ${localSql})::int AS dia_semana,
       EXTRACT(HOUR FROM ${localSql})::int AS hora,
       COUNT(*)::int             AS num_ventas,
       COALESCE(SUM(v.total), 0) AS importe
     FROM ventas v
     WHERE ${sql}
     GROUP BY 1, 2
     ORDER BY 1, 2`,
    params,
  );

  return {
    timezone: tz,
    celdas: filas.map((r: Record<string, unknown>) => ({
      dia_semana: n(r.dia_semana), // 0 = domingo, según EXTRACT(DOW)
      hora: n(r.hora),
      num_ventas: n(r.num_ventas),
      importe: r2(n(r.importe)),
    })),
  };
}

export async function metodosPago(f: FiltrosReporte) {
  const { sql, params } = filtroVentas(f, 1);
  const filas = await AppDataSource.query(
    `SELECT v.metodo_pago,
            COUNT(*)::int             AS num_ventas,
            COALESCE(SUM(v.total), 0) AS importe
     FROM ventas v
     WHERE ${sql}
     GROUP BY v.metodo_pago
     ORDER BY importe DESC`,
    params,
  );
  return filas.map((r: Record<string, unknown>) => ({
    metodo_pago: r.metodo_pago,
    num_ventas: n(r.num_ventas),
    importe: r2(n(r.importe)),
  }));
}

/** Conversión de cotizaciones. Solo tiene sentido desde que existe el vínculo. */
export async function cotizaciones(f: FiltrosReporte) {
  const params: unknown[] = [f.usuarioId, f.desde, f.hasta];
  const [row] = await AppDataSource.query(
    `SELECT
       COUNT(*)::int                                        AS emitidas,
       COUNT(*) FILTER (WHERE estado = 'aceptada')::int      AS aceptadas,
       COUNT(*) FILTER (WHERE estado = 'rechazada')::int     AS rechazadas,
       COUNT(*) FILTER (WHERE estado IN ('borrador','enviada'))::int AS abiertas,
       COALESCE(SUM(total), 0)                              AS importe_emitido,
       COALESCE(SUM(total) FILTER (WHERE estado = 'aceptada'), 0) AS importe_aceptado
     FROM cotizaciones
     WHERE usuario_id = $1
       AND ((fecha_creacion AT TIME ZONE 'UTC') AT TIME ZONE '${timezoneSegura(f.tz ?? '')}')::date
           BETWEEN $2 AND $3`,
    params,
  );
  const emitidas = n(row?.emitidas);
  const aceptadas = n(row?.aceptadas);
  return {
    emitidas,
    aceptadas,
    rechazadas: n(row?.rechazadas),
    abiertas: n(row?.abiertas),
    importe_emitido: r2(n(row?.importe_emitido)),
    importe_aceptado: r2(n(row?.importe_aceptado)),
    tasa_conversion_pct: emitidas > 0 ? r2((aceptadas / emitidas) * 100) : null,
  };
}
