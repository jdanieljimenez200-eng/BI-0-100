import * as Sentry from '@sentry/node';
import { logger, redactarSecretos } from '../utils/logger';

let activo = false;

/**
 * Inicializa Sentry si hay SENTRY_DSN. Sin DSN, `reportarError` no hace nada y el
 * resto del código (billing, fireAndForget, errorHandler) puede llamarlo igual.
 *
 * Antes esta función solo escribía "[Sentry] Initialized" sin llamar a
 * `Sentry.init`, y nadie la invocaba: un webhook de Stripe con error no
 * recuperable responde 200 y el único rastro que quedaba era un log.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('[Sentry] SENTRY_DSN no configurado: sin reporte de errores');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    // Los mensajes pasan por el mismo redactor que los logs: nunca claves ni tokens.
    beforeSend(event) {
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = redactarSecretos(ex.value);
      }
      if (event.message) event.message = redactarSecretos(event.message);
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-admin-token'];
        delete event.request.headers['x-admin-totp'];
      }
      return event;
    },
  });
  activo = true;
  logger.info('[Sentry] Inicializado');
}

export function reportarError(err: unknown, contexto?: Record<string, unknown>): void {
  if (!activo) return;
  try {
    Sentry.captureException(err, contexto ? { extra: contexto } : undefined);
  } catch {
    // Reportar nunca debe romper el flujo que falló.
  }
}

/** Da tiempo a enviar los eventos pendientes antes de salir del proceso. */
export async function vaciarSentry(timeoutMs = 2000): Promise<void> {
  if (!activo) return;
  try {
    await Sentry.close(timeoutMs);
  } catch {
    // noop
  }
}
