import { EntityManager } from 'typeorm';

/**
 * Folios correlativos por cuenta (tickets del POS y cotizaciones).
 *
 * Antes cada folio salía de `MAX(regexp_replace(numero))` bajo un advisory
 * lock: un Seq Scan de TODAS las ventas de la cuenta en cada venta (116 ms con
 * 200 000 ventas) mientras el lock frenaba al resto de cajas. Ahora hay un
 * contador por cuenta y tipo en `secuencias_folio`: el UPDATE es O(1) y el
 * bloqueo de fila serializa igual que antes, sin recorrer nada.
 *
 * Debe llamarse DENTRO de la transacción que crea el registro: el bloqueo de la
 * fila del contador dura hasta el commit, así que dos cajas nunca reciben el
 * mismo número y un rollback no "quema" folios de otras.
 */

interface ConfigFolio {
  tabla: 'ventas' | 'cotizaciones';
  columna: 'numero_ticket' | 'numero';
  prefijo: string;
}

const CONFIG: Record<'venta' | 'cotizacion', ConfigFolio> = {
  venta: { tabla: 'ventas', columna: 'numero_ticket', prefijo: 'POS-' },
  cotizacion: { tabla: 'cotizaciones', columna: 'numero', prefijo: 'COT-' },
};

const formatear = (cfg: ConfigFolio, n: number) => `${cfg.prefijo}${String(n).padStart(6, '0')}`;

/** Máximo numérico existente (solo al crear el contador o si se desincronizó). */
async function maximoExistente(manager: EntityManager, cfg: ConfigFolio, usuarioId: string): Promise<number> {
  // Solo cuentan los folios con el formato propio (PREFIJO + hasta 9 dígitos):
  // un número importado o de prueba con otro formato no debe desbordar el entero.
  const [fila] = await manager.query(
    `SELECT COALESCE(MAX(substring(${cfg.columna} FROM $2::int)::integer), 0) AS max_num
       FROM ${cfg.tabla}
      WHERE usuario_id = $1 AND ${cfg.columna} ~ $3`,
    [usuarioId, cfg.prefijo.length + 1, `^${cfg.prefijo}[0-9]{1,9}$`]
  );
  return Number(fila?.max_num ?? 0);
}

export async function siguienteFolio(
  manager: EntityManager,
  usuarioId: string,
  tipo: 'venta' | 'cotizacion'
): Promise<string> {
  const cfg = CONFIG[tipo];

  // Camino normal: incrementar el contador (bloquea su fila hasta el commit).
  let filas: Array<{ ultimo: number }> = await manager.query(
    `UPDATE secuencias_folio SET ultimo = ultimo + 1 WHERE usuario_id = $1 AND tipo = $2 RETURNING ultimo`,
    [usuarioId, tipo]
  );
  // TypeORM devuelve [filas, afectadas] en UPDATE ... RETURNING.
  if (Array.isArray(filas[0])) filas = filas[0] as unknown as Array<{ ultimo: number }>;

  let numero: number;
  if (filas.length > 0) {
    numero = Number(filas[0].ultimo);
  } else {
    // Primera vez para esta cuenta: se siembra con lo que ya existe. El
    // advisory lock evita que dos primeras ventas simultáneas siembren a la vez.
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`folio:${tipo}:${usuarioId}`]);
    const base = await maximoExistente(manager, cfg, usuarioId);
    const [insertada] = await manager.query(
      `INSERT INTO secuencias_folio (usuario_id, tipo, ultimo) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id, tipo) DO UPDATE SET ultimo = secuencias_folio.ultimo + 1
       RETURNING ultimo`,
      [usuarioId, tipo, base + 1]
    );
    numero = Number(insertada.ultimo);
  }

  // Autocorrección: si alguien insertó registros sin pasar por aquí (seeds,
  // importaciones), el número podría existir ya. Comprobarlo usa el índice
  // único (usuario_id, numero); resincronizar solo ocurre en ese caso raro.
  const [ocupado] = await manager.query(
    `SELECT 1 FROM ${cfg.tabla} WHERE usuario_id = $1 AND ${cfg.columna} = $2 LIMIT 1`,
    [usuarioId, formatear(cfg, numero)]
  );
  if (ocupado) {
    numero = (await maximoExistente(manager, cfg, usuarioId)) + 1;
    await manager.query(`UPDATE secuencias_folio SET ultimo = $3 WHERE usuario_id = $1 AND tipo = $2`, [
      usuarioId,
      tipo,
      numero,
    ]);
  }

  return formatear(cfg, numero);
}

/** Ticket del POS (también lo usa la conversión de cotizaciones: una sola secuencia). */
export function siguienteFolioVenta(manager: EntityManager, usuarioId: string): Promise<string> {
  return siguienteFolio(manager, usuarioId, 'venta');
}
