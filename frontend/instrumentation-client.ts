import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Capturar errores de red/fetch en el cliente
  integrations: [Sentry.browserTracingIntegration()],
  // No inicializar si no hay DSN
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});

// Requerido por Next 16 para instrumentar las transiciones de ruta del App Router
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;