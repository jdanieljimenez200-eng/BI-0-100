import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Runtime Node.js (SSR, route handlers, server actions)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      enabled: !!process.env.SENTRY_DSN,
    });
  }

  // Runtime Edge (middleware, edge routes)
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
      enabled: !!process.env.SENTRY_DSN,
    });
  }
}

// Captura de errores del servidor en Next 16 (reemplaza el hook implícito de Next 13)
export const onRequestError = Sentry.captureRequestError;