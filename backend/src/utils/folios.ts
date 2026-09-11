import { EntityManager } from 'typeorm';

/**
 * Reserva el siguiente número de ticket del POS para un usuario.
 *
 * Debe llamarse DENTRO de una transacción: el advisory lock es de transacción
 * (`pg_advisory_xact_lock`) y se libera al hacer commit o rollback.
 *
 * El siguiente número sale de `MAX(...) + 1`, nunca de `COUNT(...)`: contar
 * produce folios repetidos en cuanto se borra un ticket previo.
 *
 * Extraído de `routes/pos.ts` para que la conversión de cotizaciones use
 * exactamente la misma secuencia y el mismo lock, en vez de una copia que
 * pudiera desincronizarse.
 */
export async function siguienteFolioVenta(
  manager: EntityManager,
  usuarioId: string,
): Promise<string> {
  await manager.query(
    `SELECT pg_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint)`,
    [`pos_seq:${usuarioId}`],
  );
  const result = await manager.query(
    `SELECT MAX(NULLIF(regexp_replace(numero_ticket, '[^0-9]', '', 'g'), '')::integer) AS max_num
     FROM ventas
     WHERE usuario_id = $1`,
    [usuarioId],
  );
  const maxNum = Number(result[0]?.max_num ?? 0);
  return `POS-${String(maxNum + 1).padStart(6, '0')}`;
}
