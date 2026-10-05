import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';
import { AsignacionTrabajador } from '../../models/AsignacionTrabajador';
import { usuarioTieneHerramienta } from '../../middleware/requirePlan';
import { computePermisosEfectivos, type CapabilityKey } from '../billing/planService';
import { timezoneSegura } from '../../utils/timezones';
import { JOIN_ORIGINAL, LATERAL_CLASE, sumaNeta } from '../contabilidad/reversos';
import {
  n,
  r2,
  filtroVentas,
  totalesVentas,
  costoYMargen,
  flujoContable,
  periodoAnterior,
  variacion,
  serie as serieVentas,
  topProductos,
  almacen,
  clientes as clientesBase,
  horarios,
  metodosPago,
  cotizaciones as cotizacionesBase,
  type FiltrosReporte,
} from './reportesService';

/**
 * Reportes por área: una sección detallada por cada herramienta.
 *
 * Complementa a `reportesService.ts` (ventas, almacén, clientes y cotizaciones
 * básicos) con todo lo que pasa en el resto de herramientas —citas, personal,
 * contabilidad— y con el detalle que a esos cuatro les faltaba.
 *
 * Dos reglas:
 *
 *  1. **Solo se reporta lo contratado.** Cada área corresponde a una herramienta;
 *     si la cuenta no la tiene, el área no se calcula. Y a un trabajador solo se
 *     le muestran las áreas de las herramientas para las que tiene permiso: tener
 *     acceso a Reportes no puede ser una puerta trasera a los sueldos de Nómina.
 *
 *  2. **Lo operativo se mira hoy, lo histórico en el rango.** El stock bajo
 *     mínimo, las cotizaciones vencidas o las próximas citas son alertas del
 *     presente y no dependen del periodo elegido; las ventas, los pagos o los
 *     movimientos sí.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Áreas y acceso
// ═══════════════════════════════════════════════════════════════════════════

export const AREAS = ['ventas', 'inventario', 'cotizaciones', 'clientes', 'citas', 'personal', 'contabilidad'] as const;
export type Area = (typeof AREAS)[number];

/** Herramienta (capability) de la que sale cada área. */
export const HERRAMIENTA_DE_AREA: Record<Area, CapabilityKey> = {
  ventas: 'pos',
  inventario: 'inventario',
  cotizaciones: 'cotizaciones',
  clientes: 'clientes',
  citas: 'citas',
  personal: 'nomina',
  contabilidad: 'contabilidad',
};

export function esArea(v: unknown): v is Area {
  return typeof v === 'string' && (AREAS as readonly string[]).includes(v);
}

/**
 * Qué áreas puede ver quien pide el reporte.
 *
 * `cuentaId` es la cuenta dueña de los datos. `trabajadorId`, si lo hay, es la
 * persona real: sus permisos recortan lo que la cuenta tiene contratado.
 */
export async function areasDisponibles(cuentaId: string, trabajadorId?: string): Promise<Record<Area, boolean>> {
  const cuenta = await AppDataSource.getRepository(Usuario).findOne({ where: { id: cuentaId } });
  const resultado = Object.fromEntries(AREAS.map((a) => [a, false])) as Record<Area, boolean>;
  if (!cuenta) return resultado;

  let permisos: Record<CapabilityKey, boolean> | null = null;
  if (trabajadorId) {
    const asignaciones = await AppDataSource.getRepository(AsignacionTrabajador).find({
      select: ['permisos'],
      where: { trabajador_id: trabajadorId, cuenta_id: cuentaId, activo: true },
    });
    permisos = computePermisosEfectivos('trabajador', asignaciones.map((a) => a.permisos));
  }

  for (const area of AREAS) {
    const herramienta = HERRAMIENTA_DE_AREA[area];
    const contratada = await usuarioTieneHerramienta(cuenta, herramienta);
    resultado[area] = contratada && (permisos === null || permisos[herramienta] === true);
  }
  return resultado;
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilidades
// ═══════════════════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>;

/** Forma de cada fila de `topProductos` (la consulta cruda devuelve `any`). */
interface ProductoVendido {
  nombre: string;
  item_pos_id: string | null;
  unidades: number;
  importe: number;
  tickets: number;
  costo: number | null;
  utilidad: number | null;
  margen_pct: number | null;
  costo_parcial: boolean;
}

function dias(f: FiltrosReporte) {
  const d = new Date(`${f.desde}T00:00:00Z`).getTime();
  const h = new Date(`${f.hasta}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((h - d) / 86400000) + 1);
}

/**
 * Granularidad automática para las series: por día hasta mes y medio, por
 * semana hasta medio año y por mes a partir de ahí. Una serie diaria de un año
 * son 365 barras que no se leen.
 */
function granularidadAuto(f: FiltrosReporte): { unidad: 'day' | 'week' | 'month'; intervalo: string } {
  const d = dias(f);
  if (d <= 45) return { unidad: 'day', intervalo: '1 day' };
  if (d <= 180) return { unidad: 'week', intervalo: '1 week' };
  return { unidad: 'month', intervalo: '1 month' };
}

/**
 * Filtro de ámbito para tablas con `producto_id` opcional: al acotar por
 * producto se incluyen también los registros sin producto, el mismo criterio que
 * ya usan el libro contable y el almacén.
 */
function filtroCuenta(alias: string, f: FiltrosReporte, params: unknown[]): string {
  params.push(f.usuarioId);
  let sql = `${alias}.usuario_id = $${params.length}`;
  if (f.productoId) {
    params.push(f.productoId);
    sql += ` AND (${alias}.producto_id = $${params.length} OR ${alias}.producto_id IS NULL)`;
  }
  return sql;
}

function rango(col: string, f: FiltrosReporte, params: unknown[]): string {
  params.push(f.desde, f.hasta);
  return `${col} BETWEEN $${params.length - 1} AND $${params.length}`;
}

/** Fecha local de un `timestamp without time zone` guardado en UTC. */
function fechaLocal(col: string, f: FiltrosReporte): string {
  return `((${col} AT TIME ZONE 'UTC') AT TIME ZONE '${timezoneSegura(f.tz ?? '')}')::date`;
}

const pct = (parte: number, total: number) => (total > 0 ? r2((parte / total) * 100) : null);

// ═══════════════════════════════════════════════════════════════════════════
// VENTAS (Punto de venta)
// ═══════════════════════════════════════════════════════════════════════════

export async function ventas(f: FiltrosReporte) {
  const previo = periodoAnterior(f.desde, f.hasta);
  const g = dias(f) <= 45 ? 'dia' : dias(f) <= 180 ? 'semana' : 'mes';
  const base = filtroVentas(f, 1);

  const [totales, margen, previas, puntos, productos, hor, metodos, extra, porCategoria, porVendedor, rangos] =
    await Promise.all([
      totalesVentas(f),
      costoYMargen(f),
      totalesVentas({ ...f, ...previo }),
      serieVentas(f, g),
      topProductos(f, 100) as Promise<ProductoVendido[]>,
      horarios(f),
      metodosPago(f),
      (async () => {
        // Canceladas: fuera del filtro base, que las excluye.
        const p: unknown[] = [];
        const cuenta = filtroCuenta('v', f, p);
        const r = rango('v.fecha', f, p);
        const [fila] = await AppDataSource.query(
          `SELECT
             COUNT(*) FILTER (WHERE v.estado = 'cancelada')::int AS canceladas,
             COALESCE(SUM(v.total) FILTER (WHERE v.estado = 'cancelada'), 0) AS importe_cancelado,
             COUNT(*) FILTER (WHERE v.estado <> 'cancelada' AND v.cotizacion_id IS NOT NULL)::int AS desde_cotizacion,
             COALESCE(SUM(v.total) FILTER (WHERE v.estado <> 'cancelada' AND v.cotizacion_id IS NOT NULL), 0) AS importe_desde_cotizacion,
             COUNT(DISTINCT v.fecha) FILTER (WHERE v.estado <> 'cancelada')::int AS dias_con_venta
           FROM ventas v WHERE ${cuenta} AND ${r}`,
          p
        );
        return fila as Fila;
      })(),
      AppDataSource.query(
        `SELECT COALESCE(NULLIF(ip.categoria, ''), 'Sin categoría') AS categoria,
                SUM(vi.cantidad) AS unidades, SUM(vi.subtotal_linea) AS importe,
                COUNT(DISTINCT v.id)::int AS tickets
           FROM venta_items vi
           JOIN ventas v ON v.id = vi.venta_id
           LEFT JOIN items_pos ip ON ip.id = vi.item_pos_id
          WHERE ${base.sql}
          GROUP BY 1 ORDER BY importe DESC`,
        base.params
      ),
      AppDataSource.query(
        `SELECT COALESCE(u.nombre, 'Sin registrar') AS vendedor,
                COUNT(*)::int AS num_ventas, COALESCE(SUM(v.total), 0) AS importe,
                COALESCE(AVG(v.total), 0) AS ticket_promedio
           FROM ventas v LEFT JOIN usuarios u ON u.id = v.creado_por_id
          WHERE ${base.sql}
          GROUP BY 1 ORDER BY importe DESC`,
        base.params
      ),
      AppDataSource.query(
        `SELECT CASE
                  WHEN v.total < 100 THEN '0-99'
                  WHEN v.total < 500 THEN '100-499'
                  WHEN v.total < 1000 THEN '500-999'
                  WHEN v.total < 5000 THEN '1,000-4,999'
                  ELSE '5,000+' END AS rango,
                MIN(v.total) AS orden, COUNT(*)::int AS num_ventas, COALESCE(SUM(v.total), 0) AS importe
           FROM ventas v WHERE ${base.sql}
          GROUP BY 1 ORDER BY orden`,
        base.params
      ),
    ]);

  const conMargen = productos.filter((p) => p.margen_pct !== null);
  const importeTotal = totales.importe;

  return {
    totales: {
      ...totales,
      ...margen,
      canceladas: n(extra.canceladas),
      importe_cancelado: r2(n(extra.importe_cancelado)),
      desde_cotizacion: n(extra.desde_cotizacion),
      importe_desde_cotizacion: r2(n(extra.importe_desde_cotizacion)),
      dias_con_venta: n(extra.dias_con_venta),
      promedio_diario: r2(importeTotal / dias(f)),
    },
    comparativa: {
      periodo_anterior: previo,
      importe_anterior: previas.importe,
      importe_pct: variacion(totales.importe, previas.importe),
      num_ventas_pct: variacion(totales.num_ventas, previas.num_ventas),
      ticket_promedio_pct: variacion(totales.ticket_promedio, previas.ticket_promedio),
    },
    serie: { granularidad: g, puntos },
    productos: productos.slice(0, 20),
    mejores_margenes: [...conMargen].sort((a, b) => (b.margen_pct ?? 0) - (a.margen_pct ?? 0)).slice(0, 5),
    peores_margenes: [...conMargen].sort((a, b) => (a.margen_pct ?? 0) - (b.margen_pct ?? 0)).slice(0, 5),
    productos_sin_costo: productos.filter((p) => p.costo === null).map((p) => p.nombre),
    por_categoria: (porCategoria as Fila[]).map((r) => ({
      categoria: String(r.categoria),
      unidades: r2(n(r.unidades)),
      importe: r2(n(r.importe)),
      tickets: n(r.tickets),
      participacion_pct: pct(n(r.importe), importeTotal),
    })),
    por_vendedor: (porVendedor as Fila[]).map((r) => ({
      vendedor: String(r.vendedor),
      num_ventas: n(r.num_ventas),
      importe: r2(n(r.importe)),
      ticket_promedio: r2(n(r.ticket_promedio)),
      participacion_pct: pct(n(r.importe), importeTotal),
    })),
    rangos_ticket: (rangos as Fila[]).map((r) => ({
      rango: String(r.rango),
      num_ventas: n(r.num_ventas),
      importe: r2(n(r.importe)),
    })),
    metodos_pago: metodos,
    horarios: hor,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════════════════════════════════════════

export async function inventario(f: FiltrosReporte) {
  const d = dias(f);

  const pMov: unknown[] = [];
  const movCuenta = filtroCuenta('mi', f, pMov);
  const movRango = rango('mi.fecha', f, pMov);
  const filtroMov = `${movCuenta} AND ${movRango}`;

  const [base, valuacion, porCategoria, sinMovimiento, porProveedor, consumo, mermas, rotacion] = await Promise.all([
    almacen(f),
    AppDataSource.query(
      `SELECT COUNT(*)::int AS insumos,
              COUNT(*) FILTER (WHERE stock_actual <= 0)::int AS sin_stock,
              COUNT(*) FILTER (WHERE stock_minimo > 0 AND stock_actual <= stock_minimo)::int AS bajo_minimo,
              COALESCE(SUM(GREATEST(stock_actual, 0) * costo_promedio), 0) AS valor
         FROM insumos_inventario WHERE usuario_id = $1 AND activo = true`,
      [f.usuarioId]
    ),
    AppDataSource.query(
      `SELECT COALESCE(NULLIF(categoria, ''), 'Sin categoría') AS categoria,
              COUNT(*)::int AS insumos,
              COALESCE(SUM(GREATEST(stock_actual, 0) * costo_promedio), 0) AS valor
         FROM insumos_inventario WHERE usuario_id = $1 AND activo = true
        GROUP BY 1 ORDER BY valor DESC`,
      [f.usuarioId]
    ),
    // Capital parado: insumos con existencias que no se movieron en el periodo.
    AppDataSource.query(
      `SELECT i.id, i.nombre, i.unidad, i.stock_actual, i.costo_promedio,
              GREATEST(i.stock_actual, 0) * i.costo_promedio AS valor,
              (SELECT to_char(MAX(m.fecha), 'YYYY-MM-DD') FROM movimientos_inventario m WHERE m.insumo_id = i.id) AS ultimo_movimiento
         FROM insumos_inventario i
        WHERE i.usuario_id = $1 AND i.activo = true AND i.stock_actual > 0
          AND NOT EXISTS (
            SELECT 1 FROM movimientos_inventario m
             WHERE m.insumo_id = i.id AND m.fecha BETWEEN $2 AND $3)
        ORDER BY valor DESC LIMIT 20`,
      [f.usuarioId, f.desde, f.hasta]
    ),
    // Una entrada con `venta_id` es la devolución de una venta cancelada, no una
    // compra: no va a compras ni a proveedores y resta del consumo por ventas
    // (antes cancelar una venta mostraba «Compras $1»).
    AppDataSource.query(
      `SELECT COALESCE(NULLIF(mi.proveedor, ''), 'Sin proveedor') AS proveedor,
              COUNT(*)::int AS compras, COALESCE(SUM(mi.costo_total), 0) AS valor,
              COUNT(DISTINCT mi.insumo_id)::int AS insumos
         FROM movimientos_inventario mi
        WHERE ${filtroMov} AND mi.tipo = 'entrada' AND mi.venta_id IS NULL
        GROUP BY 1 ORDER BY valor DESC LIMIT 20`,
      pMov
    ),
    AppDataSource.query(
      `SELECT
         COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'salida' AND mi.venta_id IS NOT NULL), 0)
           - COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'entrada' AND mi.venta_id IS NOT NULL), 0) AS por_ventas,
         COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'salida' AND mi.venta_id IS NULL), 0) AS manuales,
         COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'merma'), 0) AS mermas,
         COALESCE(SUM(mi.costo_total) FILTER (WHERE mi.tipo = 'entrada' AND mi.venta_id IS NULL), 0) AS compras
       FROM movimientos_inventario mi WHERE ${filtroMov}`,
      pMov
    ),
    AppDataSource.query(
      `SELECT COALESCE(NULLIF(mi.motivo, ''), 'Sin motivo') AS motivo,
              COUNT(*)::int AS veces, COALESCE(SUM(mi.costo_total), 0) AS valor
         FROM movimientos_inventario mi
        WHERE ${filtroMov} AND mi.tipo = 'merma'
        GROUP BY 1 ORDER BY valor DESC`,
      pMov
    ),
    // Días de cobertura: con el consumo medio del periodo, cuánto dura el stock.
    AppDataSource.query(
      `SELECT i.id, i.nombre, i.unidad, i.stock_actual,
              COALESCE(SUM(mi.cantidad) FILTER (WHERE mi.tipo IN ('salida', 'merma')), 0)
                - COALESCE(SUM(mi.cantidad) FILTER (WHERE mi.tipo = 'entrada' AND mi.venta_id IS NOT NULL), 0) AS consumo
         FROM insumos_inventario i
         LEFT JOIN movimientos_inventario mi ON mi.insumo_id = i.id AND mi.fecha BETWEEN $2 AND $3
        WHERE i.usuario_id = $1 AND i.activo = true
        GROUP BY i.id, i.nombre, i.unidad, i.stock_actual
       HAVING COALESCE(SUM(mi.cantidad) FILTER (WHERE mi.tipo IN ('salida', 'merma')), 0)
                - COALESCE(SUM(mi.cantidad) FILTER (WHERE mi.tipo = 'entrada' AND mi.venta_id IS NOT NULL), 0) > 0
        ORDER BY consumo DESC LIMIT 30`,
      [f.usuarioId, f.desde, f.hasta]
    ),
  ]);

  const v = (valuacion as Fila[])[0] ?? {};
  const c = (consumo as Fila[])[0] ?? {};
  const valorTotal = r2(n(v.valor));

  return {
    ...base,
    valuacion: {
      insumos_activos: n(v.insumos),
      sin_stock: n(v.sin_stock),
      bajo_minimo: n(v.bajo_minimo),
      valor_total: valorTotal,
      por_categoria: (porCategoria as Fila[]).map((r) => ({
        categoria: String(r.categoria),
        insumos: n(r.insumos),
        valor: r2(n(r.valor)),
        participacion_pct: pct(n(r.valor), valorTotal),
      })),
    },
    consumo: {
      por_ventas: r2(n(c.por_ventas)),
      salidas_manuales: r2(n(c.manuales)),
      mermas: r2(n(c.mermas)),
      compras: r2(n(c.compras)),
      mermas_sobre_consumo_pct: pct(n(c.mermas), n(c.por_ventas) + n(c.manuales) + n(c.mermas)),
    },
    mermas_por_motivo: (mermas as Fila[]).map((r) => ({
      motivo: String(r.motivo),
      veces: n(r.veces),
      valor: r2(n(r.valor)),
    })),
    por_proveedor: (porProveedor as Fila[]).map((r) => ({
      proveedor: String(r.proveedor),
      compras: n(r.compras),
      insumos: n(r.insumos),
      valor: r2(n(r.valor)),
    })),
    sin_movimiento: (sinMovimiento as Fila[]).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      unidad: r.unidad,
      stock_actual: r2(n(r.stock_actual)),
      valor: r2(n(r.valor)),
      ultimo_movimiento: r.ultimo_movimiento ?? null,
    })),
    cobertura: (rotacion as Fila[]).map((r) => {
      const consumoDiario = n(r.consumo) / d;
      const stock = n(r.stock_actual);
      return {
        id: r.id,
        nombre: r.nombre,
        unidad: r.unidad,
        stock_actual: r2(stock),
        consumo_periodo: r2(n(r.consumo)),
        consumo_diario: r2(consumoDiario),
        // Sin stock ya no hay días que contar; con consumo 0 no se calcula.
        dias_cobertura: stock <= 0 ? 0 : consumoDiario > 0 ? Math.floor(stock / consumoDiario) : null,
      };
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COTIZACIONES
// ═══════════════════════════════════════════════════════════════════════════

export async function cotizacionesArea(f: FiltrosReporte) {
  const creada = fechaLocal('c.fecha_creacion', f);
  const params = [f.usuarioId, f.desde, f.hasta];
  const filtro = `c.usuario_id = $1 AND ${creada} BETWEEN $2 AND $3`;

  const [base, porEstado, resumen, vencidas, porCliente, aVenta, serie] = await Promise.all([
    cotizacionesBase(f),
    AppDataSource.query(
      `SELECT c.estado, COUNT(*)::int AS cantidad, COALESCE(SUM(c.total), 0) AS importe
         FROM cotizaciones c WHERE ${filtro} GROUP BY c.estado ORDER BY importe DESC`,
      params
    ),
    AppDataSource.query(
      `SELECT COALESCE(AVG(c.total), 0) AS ticket_promedio,
              COALESCE(SUM(c.descuento_monto), 0) AS descuentos,
              COALESCE(AVG(c.descuento_pct) FILTER (WHERE c.descuento_pct > 0), 0) AS descuento_medio_pct,
              COUNT(*) FILTER (WHERE c.descuento_pct > 0)::int AS con_descuento
         FROM cotizaciones c WHERE ${filtro}`,
      params
    ),
    // Vencidas hoy, sin importar el periodo: es lo que hay que perseguir ya.
    AppDataSource.query(
      `SELECT c.id, c.numero, c.cliente_nombre, c.total, c.estado,
              to_char(c.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
              (CURRENT_DATE - c.fecha_vencimiento)::int AS dias_vencida
         FROM cotizaciones c
        WHERE c.usuario_id = $1 AND c.estado IN ('borrador', 'enviada')
          AND c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < CURRENT_DATE
        ORDER BY c.total DESC LIMIT 20`,
      [f.usuarioId]
    ),
    AppDataSource.query(
      `SELECT COALESCE(NULLIF(c.cliente_nombre, ''), 'Sin nombre') AS cliente,
              COUNT(*)::int AS cotizaciones,
              COUNT(*) FILTER (WHERE c.estado = 'aceptada')::int AS aceptadas,
              COALESCE(SUM(c.total), 0) AS importe
         FROM cotizaciones c WHERE ${filtro}
        GROUP BY 1 ORDER BY importe DESC LIMIT 15`,
      params
    ),
    AppDataSource.query(
      `SELECT COUNT(DISTINCT v.cotizacion_id)::int AS convertidas,
              COALESCE(SUM(v.total), 0) AS importe_vendido,
              AVG(v.fecha - ${creada}) AS dias_promedio
         FROM ventas v JOIN cotizaciones c ON c.id = v.cotizacion_id
        WHERE ${filtro} AND v.estado <> 'cancelada'`,
      params
    ),
    AppDataSource.query(
      `SELECT to_char(date_trunc('month', ${creada}), 'YYYY-MM') AS mes,
              COUNT(*)::int AS emitidas,
              COUNT(*) FILTER (WHERE c.estado = 'aceptada')::int AS aceptadas,
              COALESCE(SUM(c.total), 0) AS importe
         FROM cotizaciones c WHERE ${filtro}
        GROUP BY 1 ORDER BY 1`,
      params
    ),
  ]);

  const r = (resumen as Fila[])[0] ?? {};
  const v = (aVenta as Fila[])[0] ?? {};
  const vencidasFilas = vencidas as Fila[];

  return {
    ...base,
    ticket_promedio: r2(n(r.ticket_promedio)),
    descuentos: {
      total: r2(n(r.descuentos)),
      cotizaciones_con_descuento: n(r.con_descuento),
      descuento_medio_pct: r2(n(r.descuento_medio_pct)),
    },
    por_estado: (porEstado as Fila[]).map((x) => ({
      estado: String(x.estado),
      cantidad: n(x.cantidad),
      importe: r2(n(x.importe)),
    })),
    conversion_a_venta: {
      convertidas: n(v.convertidas),
      importe_vendido: r2(n(v.importe_vendido)),
      dias_promedio: v.dias_promedio === null || v.dias_promedio === undefined ? null : r2(n(v.dias_promedio)),
    },
    vencidas: {
      cantidad: vencidasFilas.length,
      importe: r2(vencidasFilas.reduce((s, x) => s + n(x.total), 0)),
      lista: vencidasFilas.map((x) => ({
        id: x.id,
        numero: x.numero,
        cliente: x.cliente_nombre,
        total: r2(n(x.total)),
        estado: x.estado,
        fecha_vencimiento: x.fecha_vencimiento,
        dias_vencida: n(x.dias_vencida),
      })),
    },
    por_cliente: (porCliente as Fila[]).map((x) => ({
      cliente: String(x.cliente),
      cotizaciones: n(x.cotizaciones),
      aceptadas: n(x.aceptadas),
      importe: r2(n(x.importe)),
      conversion_pct: pct(n(x.aceptadas), n(x.cotizaciones)),
    })),
    por_mes: (serie as Fila[]).map((x) => ({
      mes: String(x.mes),
      emitidas: n(x.emitidas),
      aceptadas: n(x.aceptadas),
      importe: r2(n(x.importe)),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTES (CRM)
// ═══════════════════════════════════════════════════════════════════════════

export async function clientesArea(f: FiltrosReporte) {
  const alta = fechaLocal('c.fecha_creacion', f);

  const [base, embudo, porCategoria, contacto, dormidos, sinCompra] = await Promise.all([
    clientesBase(f),
    AppDataSource.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE c.estado = 'lead')::int AS leads,
         COUNT(*) FILTER (WHERE c.estado = 'cliente')::int AS clientes,
         COUNT(*) FILTER (WHERE c.tipo_contacto = 'proveedor')::int AS proveedores,
         COUNT(*) FILTER (WHERE c.tipo_contacto = 'ambos')::int AS ambos,
         COUNT(*) FILTER (WHERE ${alta} BETWEEN $2 AND $3)::int AS nuevos_periodo,
         COUNT(*) FILTER (WHERE ${alta} BETWEEN $2 AND $3 AND c.estado = 'lead')::int AS leads_nuevos
       FROM clientes c WHERE c.usuario_id = $1 AND c.activo = true`,
      [f.usuarioId, f.desde, f.hasta]
    ),
    AppDataSource.query(
      `SELECT COALESCE(NULLIF(c.categoria, ''), 'Sin categoría') AS categoria, COUNT(*)::int AS cantidad
         FROM clientes c WHERE c.usuario_id = $1 AND c.activo = true
        GROUP BY 1 ORDER BY cantidad DESC`,
      [f.usuarioId]
    ),
    // Seguimiento, hoy: cuánto hace del último contacto con cada cliente.
    AppDataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE c.fecha_ultimo_contacto >= CURRENT_DATE - 30)::int AS hasta_30,
         COUNT(*) FILTER (WHERE c.fecha_ultimo_contacto <  CURRENT_DATE - 30 AND c.fecha_ultimo_contacto >= CURRENT_DATE - 60)::int AS de_31_a_60,
         COUNT(*) FILTER (WHERE c.fecha_ultimo_contacto <  CURRENT_DATE - 60 AND c.fecha_ultimo_contacto >= CURRENT_DATE - 90)::int AS de_61_a_90,
         COUNT(*) FILTER (WHERE c.fecha_ultimo_contacto <  CURRENT_DATE - 90)::int AS mas_de_90,
         COUNT(*) FILTER (WHERE c.fecha_ultimo_contacto IS NULL)::int AS nunca
       FROM clientes c
      WHERE c.usuario_id = $1 AND c.activo = true AND c.tipo_contacto IN ('cliente', 'ambos')`,
      [f.usuarioId]
    ),
    // Dormidos: compraron alguna vez, pero no en los 60 días previos al final del periodo.
    AppDataSource.query(
      `SELECT c.id, c.nombre, c.telefono,
              COUNT(v.id)::int AS compras, COALESCE(SUM(v.total), 0) AS importe_historico,
              to_char(MAX(v.fecha), 'YYYY-MM-DD') AS ultima_compra,
              ($2::date - MAX(v.fecha))::int AS dias_sin_comprar
         FROM clientes c JOIN ventas v ON v.cliente_id = c.id AND v.estado <> 'cancelada'
        WHERE c.usuario_id = $1 AND c.activo = true AND v.fecha <= $2
        GROUP BY c.id, c.nombre, c.telefono
       HAVING MAX(v.fecha) < $2::date - 60
        ORDER BY importe_historico DESC LIMIT 15`,
      [f.usuarioId, f.hasta]
    ),
    // Oportunidades: les cotizaste en el periodo y todavía no han comprado.
    AppDataSource.query(
      `SELECT c.id, c.nombre, COUNT(q.id)::int AS cotizaciones, COALESCE(SUM(q.total), 0) AS importe_cotizado
         FROM clientes c JOIN cotizaciones q ON q.cliente_id = c.id
        WHERE c.usuario_id = $1 AND ${fechaLocal('q.fecha_creacion', f)} BETWEEN $2 AND $3
          AND q.estado IN ('borrador', 'enviada')
          AND NOT EXISTS (
            SELECT 1 FROM ventas v WHERE v.cliente_id = c.id AND v.estado <> 'cancelada' AND v.fecha >= $2)
        GROUP BY c.id, c.nombre ORDER BY importe_cotizado DESC LIMIT 15`,
      [f.usuarioId, f.desde, f.hasta]
    ),
  ]);

  const e = (embudo as Fila[])[0] ?? {};
  const k = (contacto as Fila[])[0] ?? {};
  const leads = n(e.leads);
  const clientesN = n(e.clientes);

  return {
    ...base,
    cartera: {
      total: n(e.total),
      leads,
      clientes: clientesN,
      proveedores: n(e.proveedores),
      ambos: n(e.ambos),
      nuevos_periodo: n(e.nuevos_periodo),
      leads_nuevos_periodo: n(e.leads_nuevos),
      // Proporción de la cartera comercial que ya compró.
      conversion_lead_cliente_pct: pct(clientesN, leads + clientesN),
    },
    por_categoria: (porCategoria as Fila[]).map((r) => ({ categoria: String(r.categoria), cantidad: n(r.cantidad) })),
    seguimiento: {
      hasta_30_dias: n(k.hasta_30),
      de_31_a_60_dias: n(k.de_31_a_60),
      de_61_a_90_dias: n(k.de_61_a_90),
      mas_de_90_dias: n(k.mas_de_90),
      sin_contacto_registrado: n(k.nunca),
    },
    dormidos: (dormidos as Fila[]).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      telefono: r.telefono,
      compras: n(r.compras),
      importe_historico: r2(n(r.importe_historico)),
      ultima_compra: r.ultima_compra,
      dias_sin_comprar: n(r.dias_sin_comprar),
    })),
    cotizados_sin_compra: (sinCompra as Fila[]).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      cotizaciones: n(r.cotizaciones),
      importe_cotizado: r2(n(r.importe_cotizado)),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CITAS
// ═══════════════════════════════════════════════════════════════════════════

export async function citas(f: FiltrosReporte) {
  const p: unknown[] = [];
  const cuenta = filtroCuenta('ct', f, p);
  const enRango = rango('ct.fecha', f, p);
  const filtro = `${cuenta} AND ${enRango}`;
  const g = granularidadAuto(f);

  const [totales, porDia, porHora, porCliente, proximas, serie, aVenta] = await Promise.all([
    AppDataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE ct.estado = 'pendiente')::int  AS pendientes,
              COUNT(*) FILTER (WHERE ct.estado = 'confirmada')::int AS confirmadas,
              COUNT(*) FILTER (WHERE ct.estado = 'completada')::int AS completadas,
              COUNT(*) FILTER (WHERE ct.estado = 'cancelada')::int  AS canceladas,
              COUNT(DISTINCT COALESCE(ct.cliente_id::text, NULLIF(ct.cliente_nombre, '')))::int AS clientes_distintos,
              AVG(EXTRACT(EPOCH FROM (ct.hora_fin - ct.hora_inicio)) / 60)
                FILTER (WHERE ct.hora_fin IS NOT NULL AND ct.hora_fin > ct.hora_inicio) AS duracion_min
         FROM citas ct WHERE ${filtro}`,
      p
    ),
    AppDataSource.query(
      `SELECT EXTRACT(DOW FROM ct.fecha)::int AS dia_semana, COUNT(*)::int AS citas,
              COUNT(*) FILTER (WHERE ct.estado = 'cancelada')::int AS canceladas
         FROM citas ct WHERE ${filtro} GROUP BY 1 ORDER BY 1`,
      p
    ),
    AppDataSource.query(
      `SELECT EXTRACT(HOUR FROM ct.hora_inicio)::int AS hora, COUNT(*)::int AS citas
         FROM citas ct WHERE ${filtro} AND ct.estado <> 'cancelada' GROUP BY 1 ORDER BY 1`,
      p
    ),
    AppDataSource.query(
      `SELECT COALESCE(c.nombre, NULLIF(ct.cliente_nombre, ''), 'Sin nombre') AS cliente,
              COUNT(*)::int AS citas,
              COUNT(*) FILTER (WHERE ct.estado = 'completada')::int AS completadas,
              COUNT(*) FILTER (WHERE ct.estado = 'cancelada')::int AS canceladas
         FROM citas ct LEFT JOIN clientes c ON c.id = ct.cliente_id
        WHERE ${filtro}
        GROUP BY 1 ORDER BY citas DESC LIMIT 15`,
      p
    ),
    // Agenda de hoy en adelante, sin importar el periodo elegido.
    AppDataSource.query(
      `SELECT ct.id, ct.titulo, to_char(ct.fecha, 'YYYY-MM-DD') AS fecha,
              to_char(ct.hora_inicio, 'HH24:MI') AS hora, ct.estado,
              COALESCE(c.nombre, ct.cliente_nombre) AS cliente
         FROM citas ct LEFT JOIN clientes c ON c.id = ct.cliente_id
        WHERE ct.usuario_id = $1 AND ct.fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
          AND ct.estado IN ('pendiente', 'confirmada')
        ORDER BY ct.fecha, ct.hora_inicio LIMIT 20`,
      [f.usuarioId]
    ),
    AppDataSource.query(
      `WITH periodos AS (
         SELECT generate_series(date_trunc('${g.unidad}', $${p.length + 1}::date),
                                date_trunc('${g.unidad}', $${p.length + 2}::date),
                                interval '${g.intervalo}')::date AS periodo)
       SELECT to_char(pe.periodo, 'YYYY-MM-DD') AS periodo,
              COUNT(ct.id)::int AS citas,
              COUNT(ct.id) FILTER (WHERE ct.estado = 'completada')::int AS completadas,
              COUNT(ct.id) FILTER (WHERE ct.estado = 'cancelada')::int AS canceladas
         FROM periodos pe
         LEFT JOIN citas ct ON date_trunc('${g.unidad}', ct.fecha)::date = pe.periodo AND ${filtro}
        GROUP BY pe.periodo ORDER BY pe.periodo`,
      [...p, f.desde, f.hasta]
    ),
    // Del calendario a la caja: citas completadas cuyo cliente compró ese mismo día.
    AppDataSource.query(
      `SELECT COUNT(DISTINCT ct.id)::int AS con_venta, COALESCE(SUM(v.total), 0) AS importe
         FROM citas ct
         JOIN ventas v ON v.cliente_id = ct.cliente_id AND v.fecha = ct.fecha AND v.estado <> 'cancelada'
        WHERE ${filtro} AND ct.estado = 'completada' AND ct.cliente_id IS NOT NULL`,
      p
    ),
  ]);

  const t = (totales as Fila[])[0] ?? {};
  const total = n(t.total);
  const completadas = n(t.completadas);
  const v = (aVenta as Fila[])[0] ?? {};

  return {
    totales: {
      total,
      pendientes: n(t.pendientes),
      confirmadas: n(t.confirmadas),
      completadas,
      canceladas: n(t.canceladas),
      tasa_cancelacion_pct: pct(n(t.canceladas), total),
      tasa_completadas_pct: pct(completadas, total),
      clientes_distintos: n(t.clientes_distintos),
      duracion_promedio_min: t.duracion_min === null || t.duracion_min === undefined ? null : Math.round(n(t.duracion_min)),
      promedio_diario: r2(total / dias(f)),
    },
    conversion_a_venta: {
      completadas_con_venta: n(v.con_venta),
      importe: r2(n(v.importe)),
      tasa_pct: pct(n(v.con_venta), completadas),
    },
    serie: {
      granularidad: g.unidad === 'day' ? 'dia' : g.unidad === 'week' ? 'semana' : 'mes',
      puntos: (serie as Fila[]).map((r) => ({
        periodo: String(r.periodo),
        citas: n(r.citas),
        completadas: n(r.completadas),
        canceladas: n(r.canceladas),
      })),
    },
    por_dia_semana: (porDia as Fila[]).map((r) => ({
      dia_semana: n(r.dia_semana),
      citas: n(r.citas),
      canceladas: n(r.canceladas),
    })),
    por_hora: (porHora as Fila[]).map((r) => ({ hora: n(r.hora), citas: n(r.citas) })),
    por_cliente: (porCliente as Fila[]).map((r) => ({
      cliente: String(r.cliente),
      citas: n(r.citas),
      completadas: n(r.completadas),
      canceladas: n(r.canceladas),
    })),
    proximas: proximas as Fila[],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSONAL Y NÓMINA
// ═══════════════════════════════════════════════════════════════════════════

/** Sueldo llevado a mes, para comparar semanal, quincenal y mensual en la misma cifra. */
const SUELDO_MENSUAL_SQL = `CASE e.tipo_pago
  WHEN 'semanal' THEN e.salario * 52 / 12
  WHEN 'quincenal' THEN e.salario * 2
  ELSE e.salario END`;

export async function personal(f: FiltrosReporte) {
  const pe: unknown[] = [];
  const cuentaEmp = filtroCuenta('e', f, pe);

  const pp: unknown[] = [f.usuarioId, f.desde, f.hasta];
  const filtroPagos = `pn.usuario_id = $1 AND pn.fecha_pago BETWEEN $2 AND $3`;

  const [plantilla, porCargo, pagos, porEmpleado, porMes, sinPago, ventasPeriodo] = await Promise.all([
    AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE e.activo)::int AS activos,
              COUNT(*) FILTER (WHERE NOT e.activo)::int AS inactivos,
              COUNT(*) FILTER (WHERE e.fecha_inicio BETWEEN $${pe.length + 1} AND $${pe.length + 2})::int AS altas_periodo,
              e.moneda,
              COALESCE(SUM(${SUELDO_MENSUAL_SQL}) FILTER (WHERE e.activo), 0) AS masa_mensual
         FROM empleados e WHERE ${cuentaEmp}
        GROUP BY e.moneda`,
      [...pe, f.desde, f.hasta]
    ),
    AppDataSource.query(
      `SELECT COALESCE(NULLIF(e.cargo, ''), 'Sin cargo') AS cargo, e.moneda,
              COUNT(*)::int AS personas, COALESCE(SUM(${SUELDO_MENSUAL_SQL}), 0) AS masa_mensual
         FROM empleados e WHERE ${cuentaEmp} AND e.activo
        GROUP BY 1, 2 ORDER BY masa_mensual DESC`,
      pe
    ),
    AppDataSource.query(
      `SELECT pn.moneda, COUNT(*)::int AS pagos, COALESCE(SUM(pn.monto), 0) AS total,
              COUNT(DISTINCT pn.empleado_id)::int AS empleados_pagados
         FROM pagos_nomina pn WHERE ${filtroPagos} GROUP BY pn.moneda`,
      pp
    ),
    AppDataSource.query(
      `SELECT COALESCE(e.nombre, pn.empleado_nombre) AS empleado, e.cargo, pn.moneda,
              COUNT(*)::int AS pagos, COALESCE(SUM(pn.monto), 0) AS total,
              to_char(MAX(pn.fecha_pago), 'YYYY-MM-DD') AS ultimo_pago
         FROM pagos_nomina pn LEFT JOIN empleados e ON e.id = pn.empleado_id
        WHERE ${filtroPagos}
        GROUP BY 1, 2, 3 ORDER BY total DESC`,
      pp
    ),
    AppDataSource.query(
      `SELECT to_char(date_trunc('month', pn.fecha_pago), 'YYYY-MM') AS mes, pn.moneda,
              COALESCE(SUM(pn.monto), 0) AS total, COUNT(*)::int AS pagos
         FROM pagos_nomina pn WHERE ${filtroPagos}
        GROUP BY 1, 2 ORDER BY 1`,
      pp
    ),
    // Activos sin ningún pago registrado en el periodo. Con un periodo más corto
    // que su ciclo de pago puede ser normal: la interfaz enseña el ciclo al lado.
    AppDataSource.query(
      `SELECT e.id, e.nombre, e.cargo, e.tipo_pago, e.salario, e.moneda,
              (SELECT to_char(MAX(x.fecha_pago), 'YYYY-MM-DD') FROM pagos_nomina x WHERE x.empleado_id = e.id) AS ultimo_pago
         FROM empleados e
        WHERE ${cuentaEmp} AND e.activo
          AND NOT EXISTS (SELECT 1 FROM pagos_nomina pn
                           WHERE pn.empleado_id = e.id AND pn.fecha_pago BETWEEN $${pe.length + 1} AND $${pe.length + 2})
        ORDER BY e.nombre`,
      [...pe, f.desde, f.hasta]
    ),
    totalesVentas(f),
  ]);

  const plantillaFilas = plantilla as Fila[];
  const pagosFilas = pagos as Fila[];
  const totalPagado = pagosFilas.reduce((s, r) => s + n(r.total), 0);

  return {
    plantilla: {
      activos: plantillaFilas.reduce((s, r) => s + n(r.activos), 0),
      inactivos: plantillaFilas.reduce((s, r) => s + n(r.inactivos), 0),
      altas_periodo: plantillaFilas.reduce((s, r) => s + n(r.altas_periodo), 0),
      // Por moneda: sumar pesos y dólares en una sola cifra no significa nada.
      masa_salarial_mensual: plantillaFilas
        .filter((r) => n(r.masa_mensual) > 0)
        .map((r) => ({ moneda: String(r.moneda), importe: r2(n(r.masa_mensual)) })),
    },
    pagado: {
      por_moneda: pagosFilas.map((r) => ({
        moneda: String(r.moneda),
        pagos: n(r.pagos),
        total: r2(n(r.total)),
        empleados_pagados: n(r.empleados_pagados),
      })),
      total: r2(totalPagado),
      // Solo orientativo si nómina y ventas comparten moneda.
      sobre_ventas_pct: pct(totalPagado, ventasPeriodo.importe),
    },
    por_cargo: (porCargo as Fila[]).map((r) => ({
      cargo: String(r.cargo),
      moneda: String(r.moneda),
      personas: n(r.personas),
      masa_mensual: r2(n(r.masa_mensual)),
    })),
    por_empleado: (porEmpleado as Fila[]).map((r) => ({
      empleado: String(r.empleado),
      cargo: r.cargo ?? null,
      moneda: String(r.moneda),
      pagos: n(r.pagos),
      total: r2(n(r.total)),
      ultimo_pago: r.ultimo_pago,
    })),
    por_mes: (porMes as Fila[]).map((r) => ({
      mes: String(r.mes),
      moneda: String(r.moneda),
      total: r2(n(r.total)),
      pagos: n(r.pagos),
    })),
    sin_pago_en_periodo: (sinPago as Fila[]).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      cargo: r.cargo,
      tipo_pago: r.tipo_pago,
      salario: r2(n(r.salario)),
      moneda: r.moneda,
      ultimo_pago: r.ultimo_pago,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTABILIDAD
// ═══════════════════════════════════════════════════════════════════════════

export async function contabilidad(f: FiltrosReporte) {
  const p: unknown[] = [];
  const cuenta = filtroCuenta('m', f, p);
  const enRango = rango('m.fecha', f, p);
  const filtro = `${cuenta} AND ${enRango}`;
  const g = granularidadAuto(f);
  const previo = periodoAnterior(f.desde, f.hasta);

  const [flujo, flujoPrevio, porCategoria, porFuente, serie, fiscal, topEgresos, origen] = await Promise.all([
    flujoContable(f),
    flujoContable({ ...f, ...previo }),
    // Los reversos de una cancelación cuentan como el negativo de su original
    // (`contabilidad/reversos.ts`): la venta cancelada se anula en su categoría
    // en vez de sumar a «Cancelaciones» como ingreso y egreso a la vez.
    AppDataSource.query(
      `SELECT x.tipo, COALESCE(NULLIF(x.categoria, ''), 'Sin categoría') AS categoria,
              COUNT(*) FILTER (WHERE o.id IS NULL)::int AS movimientos, COALESCE(SUM(s.signo * m.monto), 0) AS total
         FROM movimientos_contables m ${JOIN_ORIGINAL} ${LATERAL_CLASE} WHERE ${filtro}
        GROUP BY 1, 2 HAVING COALESCE(SUM(s.signo * m.monto), 0) <> 0 OR COUNT(*) FILTER (WHERE o.id IS NULL) > 0
        ORDER BY total DESC`,
      p
    ),
    AppDataSource.query(
      `SELECT COALESCE(x.fuente, 'manual') AS fuente,
              COALESCE(SUM(s.signo * m.monto) FILTER (WHERE x.tipo = 'ingreso'), 0) AS ingresos,
              COALESCE(SUM(s.signo * m.monto) FILTER (WHERE x.tipo = 'egreso'), 0) AS egresos,
              COUNT(*) FILTER (WHERE o.id IS NULL)::int AS movimientos
         FROM movimientos_contables m ${JOIN_ORIGINAL} ${LATERAL_CLASE} WHERE ${filtro}
        GROUP BY 1 ORDER BY (COALESCE(SUM(s.signo * m.monto), 0)) DESC`,
      p
    ),
    AppDataSource.query(
      `WITH periodos AS (
         SELECT generate_series(date_trunc('${g.unidad}', $${p.length + 1}::date),
                                date_trunc('${g.unidad}', $${p.length + 2}::date),
                                interval '${g.intervalo}')::date AS periodo)
       SELECT to_char(pe.periodo, 'YYYY-MM-DD') AS periodo,
              ${sumaNeta('ingreso')} AS ingresos,
              ${sumaNeta('egreso')} AS egresos
         FROM periodos pe
         LEFT JOIN movimientos_contables m ON date_trunc('${g.unidad}', m.fecha)::date = pe.periodo AND ${filtro}
         ${JOIN_ORIGINAL}
        GROUP BY pe.periodo ORDER BY pe.periodo`,
      [...p, f.desde, f.hasta]
    ),
    // Comprobantes: solo los gastos capturados. El IVA de una venta, el reverso
    // de una cancelación o una comisión automática no son gastos que pidan CFDI
    // (antes «1 egreso sin CFDI» aparecía por cancelar una venta).
    AppDataSource.query(
      `SELECT
         COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'egreso' AND NOT m.es_auto_generado AND m.tiene_cfdi), 0) AS egresos_con_cfdi,
         COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'egreso' AND NOT m.es_auto_generado AND NOT m.tiene_cfdi), 0) AS egresos_sin_cfdi,
         COUNT(*) FILTER (WHERE m.tipo = 'egreso' AND NOT m.es_auto_generado AND NOT m.tiene_cfdi)::int AS movimientos_sin_cfdi,
         COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'ingreso' AND m.tiene_cfdi), 0) AS ingresos_con_cfdi
       FROM movimientos_contables m WHERE ${filtro}`,
      p
    ),
    AppDataSource.query(
      `SELECT m.id, m.descripcion, COALESCE(NULLIF(m.categoria, ''), 'Sin categoría') AS categoria,
              to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.monto, COALESCE(m.fuente, 'manual') AS fuente, m.tiene_cfdi
         FROM movimientos_contables m WHERE ${filtro} AND m.tipo = 'egreso' AND m.revierte_movimiento_id IS NULL
        ORDER BY m.monto DESC LIMIT 10`,
      p
    ),
    AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE m.es_auto_generado)::int AS automaticos,
              COUNT(*) FILTER (WHERE NOT m.es_auto_generado)::int AS manuales
         FROM movimientos_contables m WHERE ${filtro}`,
      p
    ),
  ]);

  const categorias = porCategoria as Fila[];
  const fis = (fiscal as Fila[])[0] ?? {};
  const o = (origen as Fila[])[0] ?? {};
  const mapCategoria = (tipo: string, total: number) =>
    categorias
      .filter((r) => r.tipo === tipo)
      .map((r) => ({
        categoria: String(r.categoria),
        movimientos: n(r.movimientos),
        total: r2(n(r.total)),
        participacion_pct: pct(n(r.total), total),
      }));

  let acumulado = 0;
  const conCfdi = n(fis.egresos_con_cfdi);
  const sinCfdi = n(fis.egresos_sin_cfdi);

  return {
    flujo: {
      ...flujo,
      margen_neto_pct: pct(flujo.utilidad_neta, flujo.ingresos),
    },
    comparativa: {
      periodo_anterior: previo,
      ingresos_pct: variacion(flujo.ingresos, flujoPrevio.ingresos),
      egresos_pct: variacion(flujo.egresos, flujoPrevio.egresos),
      utilidad_anterior: flujoPrevio.utilidad_neta,
    },
    ingresos_por_categoria: mapCategoria('ingreso', flujo.ingresos),
    egresos_por_categoria: mapCategoria('egreso', flujo.egresos),
    por_fuente: (porFuente as Fila[]).map((r) => ({
      fuente: String(r.fuente),
      ingresos: r2(n(r.ingresos)),
      egresos: r2(n(r.egresos)),
      movimientos: n(r.movimientos),
    })),
    serie: {
      granularidad: g.unidad === 'day' ? 'dia' : g.unidad === 'week' ? 'semana' : 'mes',
      puntos: (serie as Fila[]).map((r) => {
        const neto = n(r.ingresos) - n(r.egresos);
        acumulado += neto;
        return {
          periodo: String(r.periodo),
          ingresos: r2(n(r.ingresos)),
          egresos: r2(n(r.egresos)),
          neto: r2(neto),
          acumulado: r2(acumulado),
        };
      }),
    },
    fiscal: {
      egresos_con_cfdi: r2(conCfdi),
      egresos_sin_cfdi: r2(sinCfdi),
      movimientos_sin_cfdi: n(fis.movimientos_sin_cfdi),
      // Gasto con comprobante: lo que en principio se puede deducir.
      egresos_deducibles_pct: pct(conCfdi, conCfdi + sinCfdi),
      ingresos_con_cfdi: r2(n(fis.ingresos_con_cfdi)),
    },
    origen: { automaticos: n(o.automaticos), manuales: n(o.manuales) },
    top_egresos: (topEgresos as Fila[]).map((r) => ({
      id: r.id,
      descripcion: r.descripcion,
      categoria: r.categoria,
      fecha: r.fecha,
      monto: r2(n(r.monto)),
      fuente: r.fuente,
      tiene_cfdi: Boolean(r.tiene_cfdi),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PANORAMA — todo el negocio en una vista
// ═══════════════════════════════════════════════════════════════════════════

/**
 * KPIs de todas las áreas visibles y las alertas que piden acción hoy.
 *
 * Reutiliza los reportes de cada área en lugar de repetir consultas, para que un
 * número del panorama no pueda contradecir al de su sección.
 */
type Resultados = {
  ventas: Awaited<ReturnType<typeof ventas>> | null;
  inventario: Awaited<ReturnType<typeof inventario>> | null;
  cotizaciones: Awaited<ReturnType<typeof cotizacionesArea>> | null;
  clientes: Awaited<ReturnType<typeof clientesArea>> | null;
  citas: Awaited<ReturnType<typeof citas>> | null;
  personal: Awaited<ReturnType<typeof personal>> | null;
  contabilidad: Awaited<ReturnType<typeof contabilidad>> | null;
};

/** Calcula, en paralelo, solo las áreas visibles. */
async function calcularVisibles(f: FiltrosReporte, visibles: Record<Area, boolean>): Promise<Resultados> {
  const [v, inv, cot, cli, cit, per, con] = await Promise.all([
    visibles.ventas ? ventas(f) : null,
    visibles.inventario ? inventario(f) : null,
    visibles.cotizaciones ? cotizacionesArea(f) : null,
    visibles.clientes ? clientesArea(f) : null,
    visibles.citas ? citas(f) : null,
    visibles.personal ? personal(f) : null,
    visibles.contabilidad ? contabilidad(f) : null,
  ]);
  return { ventas: v, inventario: inv, cotizaciones: cot, clientes: cli, citas: cit, personal: per, contabilidad: con };
}

export async function panorama(f: FiltrosReporte, visibles: Record<Area, boolean>) {
  return armarPanorama(visibles, await calcularVisibles(f, visibles));
}

function armarPanorama(visibles: Record<Area, boolean>, r: Resultados) {
  const { ventas: v, inventario: inv, cotizaciones: cot, clientes: cli, citas: cit, personal: per, contabilidad: con } = r;

  const alertas: { area: Area; nivel: 'alta' | 'media'; mensaje: string }[] = [];
  if (inv?.valuacion.sin_stock) {
    alertas.push({ area: 'inventario', nivel: 'alta', mensaje: `${inv.valuacion.sin_stock} insumo(s) sin existencias` });
  }
  if (inv?.valuacion.bajo_minimo) {
    alertas.push({ area: 'inventario', nivel: 'media', mensaje: `${inv.valuacion.bajo_minimo} insumo(s) por debajo del mínimo` });
  }
  if (cot?.vencidas.cantidad) {
    alertas.push({ area: 'cotizaciones', nivel: 'media', mensaje: `${cot.vencidas.cantidad} cotización(es) vencida(s) sin respuesta` });
  }
  if (cli && cli.seguimiento.mas_de_90_dias) {
    alertas.push({ area: 'clientes', nivel: 'media', mensaje: `${cli.seguimiento.mas_de_90_dias} cliente(s) sin contacto en más de 90 días` });
  }
  if (cit?.proximas.length) {
    alertas.push({ area: 'citas', nivel: 'media', mensaje: `${cit.proximas.length} cita(s) en los próximos 7 días` });
  }
  if (v?.productos_sin_costo.length) {
    alertas.push({
      area: 'ventas',
      nivel: 'media',
      mensaje: `${v.productos_sin_costo.length} producto(s) vendidos sin receta: su margen no se puede calcular`,
    });
  }
  if (con && con.fiscal.movimientos_sin_cfdi) {
    alertas.push({ area: 'contabilidad', nivel: 'media', mensaje: `${con.fiscal.movimientos_sin_cfdi} egreso(s) sin CFDI` });
  }

  return {
    areas: visibles,
    kpis: {
      ventas: v && {
        importe: v.totales.importe,
        num_ventas: v.totales.num_ventas,
        ticket_promedio: v.totales.ticket_promedio,
        margen_pct: v.totales.margen_pct,
        importe_pct: v.comparativa.importe_pct,
      },
      inventario: inv && {
        valor: inv.valuacion.valor_total,
        compras: inv.consumo.compras,
        mermas: inv.consumo.mermas,
        bajo_minimo: inv.valuacion.bajo_minimo,
      },
      cotizaciones: cot && {
        emitidas: cot.emitidas,
        importe_emitido: cot.importe_emitido,
        tasa_conversion_pct: cot.tasa_conversion_pct,
        vencidas: cot.vencidas.cantidad,
      },
      clientes: cli && {
        cartera: cli.cartera.total,
        nuevos: cli.cartera.nuevos_periodo,
        compradores_nuevos: cli.segmentos.nuevos,
        recurrentes: cli.segmentos.recurrentes,
      },
      citas: cit && {
        total: cit.totales.total,
        completadas: cit.totales.completadas,
        tasa_cancelacion_pct: cit.totales.tasa_cancelacion_pct,
      },
      personal: per && {
        activos: per.plantilla.activos,
        pagado: per.pagado.total,
        sobre_ventas_pct: per.pagado.sobre_ventas_pct,
      },
      contabilidad: con && {
        ingresos: con.flujo.ingresos,
        egresos: con.flujo.egresos,
        utilidad_neta: con.flujo.utilidad_neta,
        margen_neto_pct: con.flujo.margen_neto_pct,
      },
    },
    alertas,
  };
}

/** Todas las áreas visibles, completas: para el PDF. Cada área se calcula una sola vez. */
export async function completo(f: FiltrosReporte, visibles: Record<Area, boolean>) {
  const resultados = await calcularVisibles(f, visibles);
  return { panorama: armarPanorama(visibles, resultados), ...resultados };
}

export const CALCULAR_AREA: Record<Area, (f: FiltrosReporte) => Promise<unknown>> = {
  ventas,
  inventario,
  cotizaciones: cotizacionesArea,
  clientes: clientesArea,
  citas,
  personal,
  contabilidad,
};
