import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';
import { revokeAllUserRefreshTokens } from '../../routes/auth';
import { claveBloqueo } from '../../middleware/auth';

/**
 * Bloqueo inmediato de las sesiones de un usuario.
 *
 * Desactivar una cuenta en la base no basta para sacar a quien la está usando:
 * `authenticate` solo verifica la firma del access token, y ese token sigue
 * siendo válido hasta que caduca (15 min). Durante ese rato, "bloquear" a un
 * atacante no lo saca de nada.
 *
 * Se resuelve en dos piezas:
 *
 *  1. Se revocan los refresh tokens, para que no pueda renovar la sesión.
 *  2. Se marca `bloqueado:{userId}` en Redis durante lo que dura un access token.
 *     `authenticate` la consulta en la misma ida a Redis que ya hace para la
 *     denylist, así que no añade una consulta a la base por petición.
 *
 * Pasada la marca, el access token ya ha caducado y el refresh está revocado:
 * no queda nada con lo que entrar.
 */

/** Vida del access token (ver `jwt.sign(..., { expiresIn: '15m' })` en auth.ts). */
const VIDA_ACCESS_TOKEN_S = 15 * 60;

/**
 * Corta ya todas las sesiones del usuario.
 *
 * Devuelve `false` si Redis no está disponible: la cuenta queda desactivada en la
 * base (no podrá volver a entrar ni renovar), pero un access token ya emitido
 * seguirá valiendo hasta caducar. Quien llama debe poder decírselo al admin.
 */
export async function bloquearSesiones(userId: string): Promise<boolean> {
  await revokeAllUserRefreshTokens(userId);

  if (!redisClient?.isReady) {
    logger.warn(`[bloqueo] Redis no disponible: las sesiones de ${userId} caducarán solas en 15 min`);
    return false;
  }
  try {
    await redisClient.set(claveBloqueo(userId), '1', { EX: VIDA_ACCESS_TOKEN_S });
    return true;
  } catch (err) {
    logger.error(`[bloqueo] No se pudo marcar el bloqueo de ${userId}:`, err);
    return false;
  }
}

/** Levanta la marca al reactivar, para no dejar fuera a quien vuelve a entrar. */
export async function levantarBloqueo(userId: string): Promise<void> {
  if (!redisClient?.isReady) return;
  try {
    await redisClient.del(claveBloqueo(userId));
  } catch (err) {
    logger.error(`[bloqueo] No se pudo levantar el bloqueo de ${userId}:`, err);
  }
}
