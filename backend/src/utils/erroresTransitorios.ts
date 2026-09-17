import { QueryFailedError } from 'typeorm';

/**
 * ¿Merece la pena reintentar una operación que falló con este error?
 *
 * Transitorio = la infraestructura, no los datos: base de datos o Redis
 * inalcanzables, red cortada, proveedor de IA saturado. Reintentar un error de
 * datos (producto borrado, validación, bug) solo repite el mismo fallo, y en un
 * análisis repite también todas las llamadas de IA ya hechas y pagadas.
 */

/** Códigos de Postgres de conexión o capacidad, no de datos. */
export const CODIGOS_PG_TRANSITORIOS = new Set([
  '08000', '08003', '08006', '08001', '08004', // connection_exception family
  '57P01', '57P02', '57P03', // admin_shutdown / crash / cannot_connect_now
  '53300', '53400', // too_many_connections / config limit
  '40001', '40P01', // serialization_failure / deadlock_detected
]);

const CODIGOS_RED = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'EHOSTUNREACH']);

const MENSAJES_TRANSITORIOS =
  /connection terminated|connection is closed|socket hang up|timeout|timed out|too many clients|overloaded|temporarily unavailable/i;

/** Estados HTTP de un proveedor externo que indican "vuelve a intentarlo". */
const ESTADOS_HTTP_TRANSITORIOS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

export function esErrorDeBaseTransitorio(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (err instanceof QueryFailedError || typeof code === 'string') {
    return typeof code === 'string' && CODIGOS_PG_TRANSITORIOS.has(code);
  }
  return false;
}

export function esErrorTransitorio(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; status?: unknown; name?: unknown; message?: unknown; cause?: unknown };

  if (typeof e.code === 'string' && (CODIGOS_PG_TRANSITORIOS.has(e.code) || CODIGOS_RED.has(e.code))) return true;
  // SDKs de Anthropic/OpenAI/Stripe: `status` HTTP y errores de conexión con nombre propio.
  if (typeof e.status === 'number' && ESTADOS_HTTP_TRANSITORIOS.has(e.status)) return true;
  if (typeof e.name === 'string' && /APIConnection(Timeout)?Error|RateLimitError|InternalServerError/.test(e.name)) return true;
  if (typeof e.message === 'string' && MENSAJES_TRANSITORIOS.test(e.message)) return true;
  // Errores envueltos (p. ej. `new Error('…', { cause })`)
  return e.cause !== undefined && e.cause !== err ? esErrorTransitorio(e.cause) : false;
}
