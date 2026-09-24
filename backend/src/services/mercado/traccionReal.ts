import { AppDataSource } from '../../config/database';
import { filtroVentas, FiltrosReporte } from '../reportes/reportesService';
import { r2 } from '../../utils/dinero';

/**
 * Tracción real del producto, sacada de las ventas del POS.
 *
 * El formulario de Mercado pedía «clientes al mes» y «tasa de repetición» a
 * mano, incluso a negocios que llevan meses cobrando en la plataforma: el
 * análisis se construía sobre un recuerdo, no sobre lo que pasó. Aquí se
 * agrega en SQL lo que de verdad se vendió.
 *
 * Solo meses COMPLETOS: el mes en curso siempre va a medias y hundiría el
 * promedio. Se reutiliza `filtroVentas` de Reportes para heredar su regla de
 * oro: las ventas canceladas no cuentan.
 */
export interface TraccionReal {
  /** Tickets por mes (promedio de los meses completos con ventas). */
  clientes_mes: number;
  /** Importe medio por ticket. */
  ticket_promedio: number;
  /**
   * % de clientes identificados que volvieron a comprar. `null` cuando hay
   * menos de 5 clientes con nombre: con 2 o 3 el porcentaje es ruido.
   */
  tasa_repeticion: number | null;
  meses_analizados: number;
  desde: string;
  hasta: string;
  /** Con un solo mes de historial no se puede hablar de tendencia. */
  confianza: 'alta' | 'media' | 'baja';
}

/** Primer día del mes, N meses antes del mes de `hoy`. */
function inicioMesesAtras(hoy: string, meses: number): string {
  const [a, m] = hoy.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - meses, 1));
  return d.toISOString().slice(0, 10);
}

/** Último día del mes anterior al de `hoy`. */
function finMesAnterior(hoy: string): string {
  const [a, m] = hoy.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
}

const MESES_VENTANA = 6;
const MIN_CLIENTES_PARA_REPETICION = 5;

/**
 * @param hoy Día local del negocio (`hoyDePeticion`), nunca `new Date()` en UTC.
 * @returns null si el producto no tiene ventas cerradas en la ventana.
 */
export async function obtenerTraccionReal(
  usuarioId: string,
  productoId: string,
  hoy: string
): Promise<TraccionReal | null> {
  const desde = inicioMesesAtras(hoy, MESES_VENTANA);
  const hasta = finMesAnterior(hoy);
  if (hasta < desde) return null;

  const f: FiltrosReporte = { usuarioId, productoId, desde, hasta };
  const { sql, params } = filtroVentas(f, 1);

  const meses: { mes: string; ventas: number; ingresos: number }[] = await AppDataSource.query(
    `SELECT to_char(v.fecha, 'YYYY-MM')          AS mes,
            COUNT(*)::int                        AS ventas,
            COALESCE(SUM(v.total), 0)::float     AS ingresos
       FROM ventas v
      WHERE ${sql}
      GROUP BY 1
      ORDER BY 1`,
    params
  );

  if (meses.length === 0) return null;

  const ventasTotales = meses.reduce((s, m) => s + m.ventas, 0);
  const ingresosTotales = meses.reduce((s, m) => s + m.ingresos, 0);
  if (ventasTotales === 0) return null;

  // Clientes que repitieron, solo entre los identificados en el CRM.
  const [rep] = await AppDataSource.query(
    `SELECT COUNT(*)::int                                  AS clientes,
            COUNT(*) FILTER (WHERE compras > 1)::int       AS recurrentes
       FROM (SELECT v.cliente_id, COUNT(*) AS compras
               FROM ventas v
              WHERE ${sql} AND v.cliente_id IS NOT NULL
              GROUP BY v.cliente_id) t`,
    params
  );
  const clientesIdentificados = Number(rep?.clientes ?? 0);
  const tasa_repeticion =
    clientesIdentificados >= MIN_CLIENTES_PARA_REPETICION
      ? Math.round((Number(rep.recurrentes) / clientesIdentificados) * 100)
      : null;

  return {
    clientes_mes: Math.round(ventasTotales / meses.length),
    ticket_promedio: r2(ingresosTotales / ventasTotales),
    tasa_repeticion,
    meses_analizados: meses.length,
    desde: `${meses[0].mes}-01`,
    hasta,
    confianza: meses.length >= 3 ? 'alta' : meses.length === 2 ? 'media' : 'baja',
  };
}
