import { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { MovimientoContable } from '../../models/MovimientoContable';
import { r2 } from '../../utils/dinero';

/**
 * Consultas de Contabilidad que escalan con el tamaño de la cuenta.
 *
 * Antes cada pantalla cargaba TODO el historial en memoria (`getMany()` sin
 * límite) y sumaba en JavaScript: con 600 000 movimientos el listado generaba
 * ~442 MB de JSON y tumbaba el proceso, y el P&L congelaba el servidor varios
 * segundos para todos. Aquí el listado va paginado por cursor y todo lo demás
 * se agrega en SQL.
 */

export const FUENTES = [
  'manual', 'csv_import', 'pos', 'inventario', 'nomina', 'cotizacion', 'mantenimiento', 'delivery', 'terminal',
] as const;

export interface FiltrosMovimientos {
  usuarioId: string;
  productoId: string;
  tipo?: 'ingreso' | 'egreso';
  fuente?: (typeof FUENTES)[number];
  categoria?: string;
  q?: string;
  desde?: string;
  hasta?: string;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};


/** `%` y `_` del texto buscado se tratan como literales. */
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * WHERE común en SQL crudo. Los movimientos sin producto (p. ej. nómina) se ven
 * desde cualquier producto de la cuenta, como antes.
 */
function whereSql(f: FiltrosMovimientos, alias = 'm'): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.usuarioId, f.productoId];
  const partes = [`${alias}.usuario_id = $1`, `(${alias}.producto_id = $2 OR ${alias}.producto_id IS NULL)`];
  const agregar = (cond: (i: number) => string, valor: unknown) => {
    params.push(valor);
    partes.push(cond(params.length));
  };
  if (f.tipo) agregar((i) => `${alias}.tipo = $${i}`, f.tipo);
  if (f.fuente) agregar((i) => `COALESCE(${alias}.fuente, 'manual') = $${i}`, f.fuente);
  if (f.categoria) agregar((i) => `lower(trim(${alias}.categoria)) = lower(trim($${i}))`, f.categoria);
  if (f.desde) agregar((i) => `${alias}.fecha >= $${i}::date`, f.desde);
  if (f.hasta) agregar((i) => `${alias}.fecha <= $${i}::date`, f.hasta);
  if (f.q?.trim()) {
    const patron = `%${escaparLike(f.q.trim())}%`;
    agregar(
      (i) =>
        `(${alias}.descripcion ILIKE $${i} OR ${alias}.categoria ILIKE $${i} OR ${alias}.fuente ILIKE $${i} OR ${alias}.monto::text LIKE $${i})`,
      patron
    );
  }
  return { sql: partes.join(' AND '), params };
}

function aplicarFiltrosQb(qb: SelectQueryBuilder<MovimientoContable>, f: FiltrosMovimientos) {
  qb.where('m.usuario_id = :uid', { uid: f.usuarioId }).andWhere('(m.producto_id = :pid OR m.producto_id IS NULL)', {
    pid: f.productoId,
  });
  if (f.tipo) qb.andWhere('m.tipo = :tipo', { tipo: f.tipo });
  if (f.fuente) qb.andWhere("COALESCE(m.fuente, 'manual') = :fuente", { fuente: f.fuente });
  if (f.categoria) qb.andWhere('lower(trim(m.categoria)) = lower(trim(:categoria))', { categoria: f.categoria });
  if (f.desde) qb.andWhere('m.fecha >= :desde', { desde: f.desde });
  if (f.hasta) qb.andWhere('m.fecha <= :hasta', { hasta: f.hasta });
  if (f.q?.trim()) {
    qb.andWhere(
      '(m.descripcion ILIKE :q OR m.categoria ILIKE :q OR m.fuente ILIKE :q OR CAST(m.monto AS text) LIKE :q)',
      { q: `%${escaparLike(f.q.trim())}%` }
    );
  }
  return qb;
}

// ─── Listado paginado por cursor ─────────────────────────────────────────────

interface Cursor {
  f: string; // fecha
  c: string; // fecha_creacion con microsegundos
  i: string; // id
}

export function codificarCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodificarCursor(valor: unknown): Cursor | null {
  if (typeof valor !== 'string' || valor.length > 300) return null;
  try {
    const c = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (
      typeof c.f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.f) &&
      typeof c.c === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(c.c) &&
      typeof c.i === 'string' && /^[0-9a-f-]{36}$/i.test(c.i)
    ) {
      return c as Cursor;
    }
  } catch {
    /* cursor inválido */
  }
  return null;
}

/**
 * Página de movimientos (más recientes primero). Orden estable por fecha,
 * momento de alta e id: el cursor apunta al último de la página.
 */
export async function listarMovimientos(
  f: FiltrosMovimientos,
  limite: number,
  antes: Cursor | null
): Promise<{ movimientos: MovimientoContable[]; siguiente: string | null }> {
  const qb = aplicarFiltrosQb(AppDataSource.getRepository(MovimientoContable).createQueryBuilder('m'), f)
    .addSelect(`to_char(m.fecha_creacion, 'YYYY-MM-DD HH24:MI:SS.US')`, 'cursor_creacion')
    .orderBy('m.fecha', 'DESC')
    .addOrderBy('m.fecha_creacion', 'DESC')
    .addOrderBy('m.id', 'DESC')
    .limit(limite + 1);
  if (antes) {
    qb.andWhere('(m.fecha, m.fecha_creacion, m.id) < (:cf::date, :cc::timestamp, :ci::uuid)', {
      cf: antes.f,
      cc: antes.c,
      ci: antes.i,
    });
  }
  const { entities, raw } = await qb.getRawAndEntities<{ cursor_creacion: string }>();
  const hayMas = entities.length > limite;
  const movimientos = hayMas ? entities.slice(0, limite) : entities;
  const ultimo = movimientos[movimientos.length - 1];
  const siguiente =
    hayMas && ultimo
      ? codificarCursor({ f: String(ultimo.fecha), c: raw[movimientos.length - 1].cursor_creacion, i: ultimo.id })
      : null;
  return { movimientos, siguiente };
}

/**
 * Recorre todos los movimientos filtrados en lotes, con memoria constante
 * (exportación CSV).
 */
export async function* recorrerMovimientos(f: FiltrosMovimientos, lote = 2000): AsyncGenerator<MovimientoContable[]> {
  let cursor: Cursor | null = null;
  for (;;) {
    const pagina = await listarMovimientos(f, lote, cursor);
    if (pagina.movimientos.length) yield pagina.movimientos;
    if (!pagina.siguiente) return;
    cursor = decodificarCursor(pagina.siguiente);
  }
}

// ─── Resumen (KPIs de la pantalla) ───────────────────────────────────────────

export interface MesAgregado {
  mes: string; // YYYY-MM
  ingresos: number;
  egresos: number;
}

/** Ingresos/egresos capturados (no auto-generados) por mes: base de la calibración. */
export async function agregadoMensual(f: FiltrosMovimientos): Promise<MesAgregado[]> {
  const w = whereSql(f);
  const filas: Array<{ mes: string; ingresos: string; egresos: string }> = await AppDataSource.query(
    `SELECT to_char(date_trunc('month', m.fecha), 'YYYY-MM') AS mes,
            COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'ingreso'), 0) AS ingresos,
            COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'egreso'), 0) AS egresos
       FROM movimientos_contables m
      WHERE ${w.sql} AND m.es_auto_generado = false
      GROUP BY 1 ORDER BY 1`,
    w.params
  );
  return filas.map((r) => ({ mes: r.mes, ingresos: num(r.ingresos), egresos: num(r.egresos) }));
}

export async function resumenContable(f: FiltrosMovimientos) {
  const w = whereSql(f);
  const [[totales], porFuente, categorias] = await Promise.all([
    AppDataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE m.tipo = 'ingreso')::int AS n_ingresos,
              COUNT(*) FILTER (WHERE m.tipo = 'egreso')::int AS n_egresos,
              COUNT(*) FILTER (WHERE m.es_auto_generado = false)::int AS manuales,
              COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'ingreso'), 0) AS ingresos,
              COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'egreso'), 0) AS egresos,
              COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'egreso' AND m.es_auto_generado = false), 0) AS egresos_no_auto,
              COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'egreso' AND m.es_auto_generado = false AND m.tiene_cfdi), 0) AS egresos_con_comprobante
         FROM movimientos_contables m WHERE ${w.sql}`,
      w.params
    ),
    AppDataSource.query(
      `SELECT COALESCE(m.fuente, 'manual') AS fuente, COUNT(*)::int AS n
         FROM movimientos_contables m WHERE ${w.sql} GROUP BY 1`,
      w.params
    ) as Promise<Array<{ fuente: string; n: number }>>,
    AppDataSource.query(
      `SELECT DISTINCT trim(m.categoria) AS categoria
         FROM movimientos_contables m WHERE ${w.sql} AND trim(COALESCE(m.categoria, '')) <> ''
        ORDER BY 1 LIMIT 500`,
      w.params
    ) as Promise<Array<{ categoria: string }>>,
  ]);

  const ingresos = num(totales.ingresos);
  const egresos = num(totales.egresos);
  const conteoFuentes: Record<string, number> = { todos: totales.total };
  for (const fuente of FUENTES) conteoFuentes[fuente] = 0;
  for (const fila of porFuente) conteoFuentes[fila.fuente] = fila.n;

  return {
    kpis: { ingresos: r2(ingresos), egresos: r2(egresos), balance: r2(ingresos - egresos), total: totales.total },
    conteo_fuentes: conteoFuentes,
    conteo_tipos: { todos: totales.total, ingreso: totales.n_ingresos, egreso: totales.n_egresos },
    manuales: totales.manuales,
    categorias: categorias.map((c) => c.categoria),
    fiscal_base: {
      ingresos: r2(ingresos),
      egresos_no_auto: r2(num(totales.egresos_no_auto)),
      egresos_con_comprobante: r2(num(totales.egresos_con_comprobante)),
    },
  };
}

// ─── Estado de resultados (P&L) ──────────────────────────────────────────────

const CATEGORIAS_COGS = ['insumos', 'materiales', 'costo de venta', 'costo de ventas', 'mercancia', 'materia prima'];
const CATEGORIAS_COMISIONES = ['comisiones financieras / plataformas', 'comision', 'comisiones', 'comision clip', 'comision uber'];
const CATEGORIAS_IMPUESTOS = [
  'iva por pagar', 'isr provisional', 'imss', 'infonavit', 'retención iva', 'retención isr', 'impuestos', 'iva acreditable / comisiones',
];

/**
 * Mismas reglas de clasificación que el cálculo anterior fila a fila, aplicadas
 * sobre grupos (tipo, categoría, fuente, con/sin padre) agregados en SQL: el
 * resultado es idéntico y no se cargan filas en memoria.
 */
export async function pnl(f: FiltrosMovimientos) {
  const w = whereSql(f);
  const grupos: Array<{
    tipo: 'ingreso' | 'egreso';
    cat: string;
    fuente: string | null;
    sin_padre: boolean;
    monto: string;
    bruto: string;
    deducciones: string;
  }> = await AppDataSource.query(
    `SELECT m.tipo,
            lower(trim(COALESCE(m.categoria, ''))) AS cat,
            m.fuente,
            (m.parent_movimiento_id IS NULL) AS sin_padre,
            COALESCE(SUM(m.monto), 0) AS monto,
            COALESCE(SUM(COALESCE(m.monto_bruto, m.monto)), 0) AS bruto,
            COALESCE(SUM(CASE WHEN COALESCE(m.comision_monto, 0) <> 0
                              THEN m.comision_monto + COALESCE(m.comision_iva, 0) + COALESCE(m.retencion_monto, 0)
                              ELSE 0 END), 0) AS deducciones
       FROM movimientos_contables m
      WHERE ${w.sql}
      GROUP BY 1, 2, 3, 4`,
    w.params
  );

  let ingresosBrutos = 0;
  let comisionesPasarelas = 0;
  let costoVentasCOGS = 0;
  let gastosOperativosOPEX = 0;
  let impuestosTotales = 0;

  for (const g of grupos) {
    const monto = num(g.monto);
    if (g.tipo === 'ingreso') {
      ingresosBrutos += num(g.bruto);
      comisionesPasarelas += num(g.deducciones);
    } else if (CATEGORIAS_COMISIONES.some((c) => g.cat.includes(c))) {
      // Las auto-generadas (con padre) ya se contaron en su ingreso.
      if (g.sin_padre) comisionesPasarelas += monto;
    } else if (CATEGORIAS_COGS.some((c) => g.cat.includes(c)) || g.fuente === 'inventario') {
      costoVentasCOGS += monto;
    } else if (CATEGORIAS_IMPUESTOS.some((c) => g.cat.includes(c))) {
      impuestosTotales += monto;
    } else {
      gastosOperativosOPEX += monto;
    }
  }

  const ingresoNetoOperativo = Math.max(0, ingresosBrutos - comisionesPasarelas);
  const utilidadBruta = ingresoNetoOperativo - costoVentasCOGS;
  const ebitda = utilidadBruta - gastosOperativosOPEX;
  const utilidadNeta = ebitda - impuestosTotales;
  const pct = (parte: number, total: number) => (total > 0 ? r2((parte / total) * 100) : 0);

  return {
    ingresos_brutos: r2(ingresosBrutos),
    comisiones_pasarelas_delivery: r2(comisionesPasarelas),
    ingreso_neto_operativo: r2(ingresoNetoOperativo),
    costo_ventas_cogs: r2(costoVentasCOGS),
    utilidad_bruta: r2(utilidadBruta),
    margen_bruto_porcentaje: pct(utilidadBruta, ingresosBrutos),
    gastos_operativos_opex: r2(gastosOperativosOPEX),
    utilidad_operativa_ebitda: r2(ebitda),
    margen_operativo_porcentaje: pct(ebitda, ingresosBrutos),
    impuestos: r2(impuestosTotales),
    utilidad_neta: r2(utilidadNeta),
    margen_neto_porcentaje: pct(utilidadNeta, ingresosBrutos),
  };
}

// ─── Canales: fugas por comisiones ───────────────────────────────────────────

export async function analisisCanales(f: FiltrosMovimientos) {
  const w = whereSql({ ...f, tipo: 'ingreso' });
  const filas: Array<{
    clave: string;
    institucion: string;
    canal_nombre: string;
    transacciones: number;
    total_bruto: string;
    total_comisiones: string;
    total_comisiones_iva: string;
    total_retenciones: string;
    total_neto: string;
  }> = await AppDataSource.query(
    `SELECT clave,
            COALESCE(MAX(institucion), clave) AS institucion,
            COALESCE(MAX(canal), clave) AS canal_nombre,
            COUNT(*)::int AS transacciones,
            SUM(bruto) AS total_bruto,
            SUM(comision) AS total_comisiones,
            SUM(comision_iva) AS total_comisiones_iva,
            SUM(retencion) AS total_retenciones,
            SUM(COALESCE(neto, bruto - comision - comision_iva - retencion)) AS total_neto
       FROM (
         SELECT COALESCE(NULLIF(m.institucion_snapshot, ''), NULLIF(m.canal_nombre_snapshot, ''), 'Otras Terminales') AS clave,
                NULLIF(m.institucion_snapshot, '') AS institucion,
                NULLIF(m.canal_nombre_snapshot, '') AS canal,
                COALESCE(m.monto_bruto, m.monto, 0) AS bruto,
                COALESCE(m.comision_monto, 0) AS comision,
                COALESCE(m.comision_iva, 0) AS comision_iva,
                COALESCE(m.retencion_monto, 0) AS retencion,
                m.monto_neto AS neto
           FROM movimientos_contables m
          WHERE ${w.sql} AND (m.comision_monto IS NOT NULL OR m.canal_cobro_id IS NOT NULL)
       ) x
      GROUP BY clave`,
    w.params
  );

  let granTotalBruto = 0;
  let granTotalComisiones = 0;
  const canales = filas.map((c) => {
    const totalBruto = num(c.total_bruto);
    const deducciones = num(c.total_comisiones) + num(c.total_comisiones_iva) + num(c.total_retenciones);
    granTotalBruto += totalBruto;
    granTotalComisiones += deducciones;
    return {
      institucion: c.institucion,
      canal_nombre: c.canal_nombre,
      transacciones: c.transacciones,
      total_bruto: totalBruto,
      total_comisiones: num(c.total_comisiones),
      total_comisiones_iva: num(c.total_comisiones_iva),
      total_retenciones: num(c.total_retenciones),
      total_deducciones: deducciones,
      total_neto: num(c.total_neto),
      porcentaje_fuga: totalBruto > 0 ? Math.round((deducciones / totalBruto) * 1000) / 10 : 0,
    };
  });

  return {
    canales,
    totales: {
      gran_total_bruto: r2(granTotalBruto),
      gran_total_comisiones: r2(granTotalComisiones),
      porcentaje_fuga_global: granTotalBruto > 0 ? Math.round((granTotalComisiones / granTotalBruto) * 1000) / 10 : 0,
    },
  };
}

// ─── Liquidaciones ───────────────────────────────────────────────────────────

// El cobro de una venta cancelada ya no va a llegar nunca: si siguiera contando
// como pendiente, el panel pediría conciliar un depósito que no existe.
const COND_LIQUIDACION = `m.tipo = 'ingreso'
  AND (m.canal_cobro_id IS NOT NULL OR m.monto_bruto IS NOT NULL OR m.comision_monto IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM ventas v
     WHERE m.referencia_tipo = 'venta' AND v.id = m.referencia_id AND v.estado = 'cancelada'
  )`;

export async function kpisLiquidaciones(f: FiltrosMovimientos) {
  const w = whereSql(f);
  const [fila] = await AppDataSource.query(
    `SELECT COALESCE(SUM(COALESCE(m.monto_neto, m.monto, 0)) FILTER (WHERE m.estado_liquidacion = 'pendiente'), 0) AS pendiente,
            COALESCE(SUM(COALESCE(m.monto_neto, m.monto, 0)) FILTER (WHERE m.estado_liquidacion IS DISTINCT FROM 'pendiente'), 0) AS liquidado,
            COALESCE(SUM(COALESCE(m.comision_monto, 0) + COALESCE(m.comision_iva, 0) + COALESCE(m.retencion_monto, 0)), 0) AS comisiones,
            COUNT(*) FILTER (WHERE m.estado_liquidacion = 'pendiente')::int AS conteo_pendientes
       FROM movimientos_contables m
      WHERE ${w.sql} AND ${COND_LIQUIDACION}`,
    w.params
  );
  return {
    total_pendiente_cobro: r2(num(fila.pendiente)),
    total_liquidado: r2(num(fila.liquidado)),
    total_comisiones_deducidas: r2(num(fila.comisiones)),
    conteo_pendientes: fila.conteo_pendientes as number,
  };
}

/** Movimientos de liquidación: primero los pendientes, luego por fecha. */
export async function listarLiquidaciones(f: FiltrosMovimientos, estado: 'pendiente' | 'liquidado' | undefined, limite: number) {
  const qb = aplicarFiltrosQb(AppDataSource.getRepository(MovimientoContable).createQueryBuilder('m'), f)
    .andWhere(COND_LIQUIDACION)
    .orderBy(`CASE WHEN m.estado_liquidacion = 'pendiente' THEN 0 ELSE 1 END`, 'ASC')
    .addOrderBy('m.fecha', 'DESC')
    .addOrderBy('m.fecha_creacion', 'DESC')
    .limit(limite);
  if (estado === 'pendiente') qb.andWhere("m.estado_liquidacion = 'pendiente'");
  if (estado === 'liquidado') qb.andWhere("m.estado_liquidacion IS DISTINCT FROM 'pendiente'");
  return qb.getMany();
}
