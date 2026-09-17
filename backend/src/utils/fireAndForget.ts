import { logger } from './logger';
import { reportarError } from '../config/sentry';

/**
 * Envuelve un `.catch()` de fire-and-forget para que los errores queden
 * registrados con contexto, en lugar de ser tragados.
 *
 * Uso:
 *   sendEmail(...).catch(swallowWithLog('email:welcome', { userId }));
 *
 * El error NO se re-lanza — el caller usó fire-and-forget a propósito.
 */
export function swallowWithLog(
  context: string,
  extra: Record<string, unknown> = {}
): (err: unknown) => void {
  return (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[fire-and-forget:${context}] ${message}`, extra);
    reportarError(err, { context, ...extra });
  };
}
