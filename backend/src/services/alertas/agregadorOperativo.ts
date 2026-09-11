import { AppDataSource } from '../../config/database';
import { Articulo } from '../../models/Articulo';
import { MetaNegocio as MetaNegocioEntity } from '../../models/MetaNegocio';
import { evaluarAlertas } from './alertasService';
import { rangosPeriodo, resumirYFiltrar, ResumenNiveles, RangoFechas } from './periodos';
import { Alerta, ItemStock, MetaNegocio, SerieIngresos } from './types';

/**
 * Puente entre la base de datos y el servicio puro de alertas: resuelve stock,
 * serie de ingresos y avance de metas, y llama a evaluarAlertas().
 *
 * El scoping es siempre por usuario_id (dueño de la cuenta), igual que el resto
 * de rutas del proyecto, con filtro opcional por negocio.
 */

// Los decimales de TypeORM/pg llegan como string.
function num(valor: unknown): number {
  const n = typeof valor === 'string' ? parseFloat(valor) : typeof valor === 'number' ? valor : NaN;
  return Number.isFinite(n) ? n : 0;
}

export interface AgregadoVentas {
  suma: number;
  conteo: number;
}

/**
 * SUM(total) y COUNT(*) de ventas completadas en un rango de fechas cerrado.
 * Los parámetros se pasan siempre parametrizados ($n), nunca interpolados.
 */
export async function agregarVentas(
  usuarioId: string,
  desde: string,
  hasta: string,
  negocioId: string | null = null,
): Promise<AgregadoVentas> {
  const params: unknown[] = [usuarioId, desde, hasta];
  let sql = `
    SELECT COALESCE(SUM(total), 0) AS suma, COUNT(*)::int AS conteo
      FROM ventas
     WHERE usuario_id = $1
       AND estado = 'completada'
       AND fecha >= $2::date
       AND fecha <= $3::date`;

  if (negocioId) {
    params.push(negocioId);
    sql += `\n       AND negocio_id = $${params.length}`;
  }

  const filas: Array<{ suma: string | number; conteo: number }> = await AppDataSource.query(
    sql,
    params,
  );
  const fila = filas[0];
  return { suma: num(fila?.suma), conteo: num(fila?.conteo) };
}

/**
 * Artículos con control de stock relevante. Se excluyen los servicios (no tienen
 * existencias) y los vendibles sin mínimo configurado que además no son insumos,
 * para no inundar el panel con falsos "agotado".
 */
export async function obtenerStockCritico(
  usuarioId: string,
  negocioId: string | null = null,
  limite = 200,
): Promise<ItemStock[]> {
  const qb = AppDataSource.getRepository(Articulo)
    .createQueryBuilder('a')
    .select(['a.id', 'a.nombre', 'a.stock_actual', 'a.stock_minimo', 'a.unidad'])
    .where('a.usuario_id = :usuarioId', { usuarioId })
    .andWhere('a.activo = true')
    .andWhere("a.tipo <> 'servicio'")
    .andWhere('(a.es_insumo = true OR a.stock_minimo > 0)')
    .orderBy('a.stock_actual', 'ASC')
    .take(limite);

  if (negocioId) {
    qb.andWhere('a.negocio_id = :negocioId', { negocioId });
  }

  const filas = await qb.getMany();
  return filas.map((a) => ({
    nombre: a.nombre,
    stock_actual: num(a.stock_actual),
    stock_minimo: num(a.stock_minimo),
    unidad: a.unidad ?? undefined,
  }));
}

/**
 * Avance real por meta. Las metas de ingresos/ventas se agregan desde `ventas`
 * dentro de su propio periodo; las personalizadas usan su avance manual.
 * Periodos idénticos comparten una sola query (cache por clave).
 */
export async function resolverAvanceMetas(
  usuarioId: string,
  metas: MetaNegocioEntity[],
): Promise<Map<string, number>> {
  const avances = new Map<string, number>();
  const cache = new Map<string, AgregadoVentas>();

  for (const meta of metas) {
    if (meta.tipo === 'personalizada') {
      avances.set(meta.id, num(meta.avance_manual));
      continue;
    }

    const clave = `${meta.negocio_id ?? '-'}|${meta.periodo_inicio}|${meta.periodo_fin}`;
    let agregado = cache.get(clave);
    if (!agregado) {
      agregado = await agregarVentas(
        usuarioId,
        meta.periodo_inicio,
        meta.periodo_fin,
        meta.negocio_id ?? null,
      );
      cache.set(clave, agregado);
    }

    avances.set(meta.id, meta.tipo === 'ingresos' ? agregado.suma : agregado.conteo);
  }

  return avances;
}

export interface OpcionesAlertasOperativas {
  usuarioId: string;
  negocioId?: string | null;
  dias?: number;
  umbralCaidaIngresos?: number;
  soloAccionables?: boolean;
}

export interface AlertasOperativas {
  /** Alertas visibles: ya recortadas si se pidió `soloAccionables`. */
  alertas: Alerta[];
  /**
   * Conteos sobre TODAS las alertas evaluadas, incluidas las verdes ocultas por
   * `soloAccionables`. Por eso `resumen.total` puede ser mayor que
   * `alertas.length`: el resumen describe el diagnóstico, no la lista mostrada.
   */
  resumen: ResumenNiveles;
  periodo: {
    dias: number;
    actual: RangoFechas;
    anterior: RangoFechas;
    ingreso_actual: number;
    ingreso_anterior: number;
    ventas_actual: number;
    ventas_anterior: number;
  };
  metas_evaluadas: number;
  articulos_evaluados: number;
}

/**
 * Punto de entrada del panel: arma la EntradaAlertas y devuelve las alertas ya
 * ordenadas por severidad más el contexto del periodo comparado.
 */
export async function generarAlertasOperativas(
  opciones: OpcionesAlertasOperativas,
): Promise<AlertasOperativas> {
  const { usuarioId } = opciones;
  const negocioId = opciones.negocioId ?? null;
  const rangos = rangosPeriodo(opciones.dias ?? 30);

  const metasRepo = AppDataSource.getRepository(MetaNegocioEntity);
  const whereMetas = negocioId
    ? { usuario_id: usuarioId, activa: true, negocio_id: negocioId }
    : { usuario_id: usuarioId, activa: true };

  const [ventasActual, ventasAnterior, stock, metas] = await Promise.all([
    agregarVentas(usuarioId, rangos.actual.desde, rangos.actual.hasta, negocioId),
    agregarVentas(usuarioId, rangos.anterior.desde, rangos.anterior.hasta, negocioId),
    obtenerStockCritico(usuarioId, negocioId),
    metasRepo.find({ where: whereMetas, order: { periodo_fin: 'ASC' }, take: 100 }),
  ]);

  // Las metas que aún no arrancan no producen diagnóstico.
  const hoy = rangos.actual.hasta;
  const metasVigentes = metas.filter((m) => m.periodo_inicio <= hoy);
  const avances = await resolverAvanceMetas(usuarioId, metasVigentes);

  const entradaMetas: MetaNegocio[] = metasVigentes.map((m) => ({
    nombre: m.nombre,
    objetivo: num(m.objetivo),
    actual: avances.get(m.id) ?? 0,
  }));

  const ingresos: SerieIngresos = {
    ingreso_actual: ventasActual.suma,
    ingreso_anterior: ventasAnterior.suma,
  };

  const evaluadas = evaluarAlertas({
    stock,
    ingresos,
    metas: entradaMetas,
    umbralCaidaIngresos: opciones.umbralCaidaIngresos,
  });

  // Se resume ANTES de recortar: `soloAccionables` es filtro de presentación y no
  // debe vaciar el conteo de verdes ni reducir el total que muestra el badge.
  const { alertas, resumen } = resumirYFiltrar(evaluadas, opciones.soloAccionables ?? false);

  return {
    alertas,
    resumen,
    periodo: {
      dias: rangos.dias,
      actual: rangos.actual,
      anterior: rangos.anterior,
      ingreso_actual: ventasActual.suma,
      ingreso_anterior: ventasAnterior.suma,
      ventas_actual: ventasActual.conteo,
      ventas_anterior: ventasAnterior.conteo,
    },
    metas_evaluadas: entradaMetas.length,
    articulos_evaluados: stock.length,
  };
}