import type { Response } from 'express';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Paginación por cursor (keyset) para los listados de las herramientas.
 *
 * Antes cada listado cortaba en 200 (clientes, cotizaciones, ventas...) sin
 * forma de pedir más: el usuario no podía ver su historial desde la
 * herramienta. Con OFFSET la página 1 000 recorrería 200 000 filas; el cursor
 * apunta a la última fila vista y la siguiente página empieza justo después.
 *
 * La respuesta sigue siendo un array (compatible con las pantallas existentes)
 * y el cursor de la página siguiente va en la cabecera `X-Siguiente`
 * (expuesta por CORS). Sin cabecera, no hay más páginas.
 */

export interface ColumnaOrden {
  /** Expresión SQL de la columna (p. ej. `v.fecha`). */
  expr: string;
  /** Tipo para comparar el valor del cursor (`date`, `timestamp`, `uuid`...). */
  tipo: 'date' | 'timestamp' | 'uuid' | 'text';
}

export const LIMITE_POR_DEFECTO = 200;
export const LIMITE_MAXIMO = 500;

export function leerLimite(valor: unknown, porDefecto = LIMITE_POR_DEFECTO): number {
  const n = parseInt(String(valor ?? ''), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), LIMITE_MAXIMO) : porDefecto;
}

const texto = (col: ColumnaOrden) =>
  col.tipo === 'timestamp'
    ? `to_char(${col.expr}, 'YYYY-MM-DD HH24:MI:SS.US')`
    : col.tipo === 'date'
      ? `to_char(${col.expr}, 'YYYY-MM-DD')`
      : `${col.expr}::text`;

export function decodificarCursor(valor: unknown, columnas: number): string[] | null {
  if (typeof valor !== 'string' || valor.length > 400) return null;
  try {
    const partes = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8'));
    if (Array.isArray(partes) && partes.length === columnas && partes.every((p) => typeof p === 'string' && p.length <= 80)) {
      return partes;
    }
  } catch {
    /* cursor inválido */
  }
  return null;
}

/**
 * Aplica orden descendente, filtro de cursor y límite a `qb` (sin joins que
 * multipliquen filas) y devuelve la página y el cursor siguiente.
 * Devuelve `null` si el cursor recibido no es válido (responder 400).
 */
export async function paginar<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  columnas: ColumnaOrden[],
  antes: unknown,
  limite: number
): Promise<{ filas: T[]; siguiente: string | null } | null> {
  let cursor: string[] | null = null;
  if (antes !== undefined && antes !== '') {
    cursor = decodificarCursor(antes, columnas.length);
    if (!cursor) return null;
  }

  columnas.forEach((c, i) => {
    qb.addSelect(texto(c), `cur_${i}`);
    if (i === 0) qb.orderBy(c.expr, 'DESC');
    else qb.addOrderBy(c.expr, 'DESC');
  });
  if (cursor) {
    const tupla = columnas.map((c) => c.expr).join(', ');
    const valores = columnas.map((c, i) => `:cur_${i}::${c.tipo}`).join(', ');
    const params = Object.fromEntries(cursor.map((v, i) => [`cur_${i}`, v]));
    qb.andWhere(`(${tupla}) < (${valores})`, params);
  }
  qb.limit(limite + 1);

  const { entities, raw } = await qb.getRawAndEntities<Record<string, string>>();
  const hayMas = entities.length > limite;
  const filas = hayMas ? entities.slice(0, limite) : entities;
  const ultimo = raw[filas.length - 1];
  const siguiente =
    hayMas && ultimo ? Buffer.from(JSON.stringify(columnas.map((_, i) => ultimo[`cur_${i}`]))).toString('base64url') : null;
  return { filas, siguiente };
}

/** Pone el cursor en la cabecera y responde el array. */
export function responderPagina<T>(res: Response, pagina: { filas: T[]; siguiente: string | null }): void {
  if (pagina.siguiente) res.setHeader('X-Siguiente', pagina.siguiente);
  res.json(pagina.filas);
}
