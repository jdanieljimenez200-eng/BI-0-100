/**
 * Cómo cuentan los reversos (asientos inversos de una venta cancelada) en los
 * agregados de dinero. Un reverso es el NEGATIVO de lo que revierte, no un
 * movimiento más: el reverso de un ingreso resta ingresos (no suma egresos) y
 * el de un impuesto resta impuestos (no suma ingresos).
 *
 * Antes cada consulta sumaba los reversos por su tipo: una venta de $87 con $12
 * de IVA, cancelada, salía como $99 de ingresos y $99 de egresos, $87 de gasto
 * operativo en el estado de resultados y $99 de base para la estimación fiscal.
 *
 * Todo con el alias `m` para el movimiento y `o` para el original que revierte
 * (NULL en un asiento normal). Usar siempre estas piezas en una consulta nueva
 * sobre `movimientos_contables` que sume dinero.
 */

/** Une cada movimiento con el asiento que revierte, si lo hay. */
export const JOIN_ORIGINAL = `LEFT JOIN movimientos_contables o ON o.id = m.revierte_movimiento_id`;

/**
 * Suma neta de un tipo: lo de ese tipo menos los reversos de ese tipo.
 * `condicionExtra` se escribe sobre `m`; para los reversos se evalúa sobre el
 * original (`o`), que es el que dice de qué clase es lo revertido.
 */
export function sumaNeta(tipo: 'ingreso' | 'egreso', condicionExtra = 'TRUE'): string {
  return `(COALESCE(SUM(m.monto) FILTER (WHERE o.id IS NULL AND m.tipo = '${tipo}' AND ${condicionExtra}), 0)
          - COALESCE(SUM(m.monto) FILTER (WHERE o.tipo = '${tipo}' AND ${condicionExtra.replace(/\bm\./g, 'o.')}), 0))`;
}

/**
 * Clase con la que cuenta cada fila (`x`, la del original si es un reverso) y
 * signo (`s.signo`, -1 en un reverso). Para agrupar por categoría, fuente, etc.
 */
export const LATERAL_CLASE = `
  CROSS JOIN LATERAL (SELECT CASE WHEN o.id IS NULL THEN 1 ELSE -1 END AS signo) s
  CROSS JOIN LATERAL (SELECT (CASE WHEN o.id IS NULL THEN m ELSE o END).*) x`;

/** Impuesto cobrado dentro del precio (p. ej. «IVA por pagar» de una venta), del alias dado. */
export const esImpuestoTrasladado = (a: string) =>
  `(${a}.tipo = 'egreso' AND ${a}.es_auto_generado AND lower(trim(COALESCE(${a}.categoria, ''))) LIKE '% por pagar')`;
