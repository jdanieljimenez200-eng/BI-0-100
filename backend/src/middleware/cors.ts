import rateLimit from 'express-rate-limit';
import cors from 'cors';

/**
 * Configuración de orígenes permitidos para CORS:
 * - Soporta URLs separadas por comas en FRONTEND_URL o CORS_ORIGIN (ej. "https://app.bi0a100.com,https://staging.bi0a100.com").
 * - Dev: acepta localhost y 127.0.0.1 en cualquier puerto.
 * - Prod: FRONTEND_URL es OBLIGATORIO (el arranque falla si falta).
 */
function getOriginConfig(): cors.CorsOptions['origin'] {
  const originStr = process.env.FRONTEND_URL || process.env.CORS_ORIGIN;
  if (!originStr && process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_URL es obligatorio en producción (CORS)');
  }
  if (!originStr) {
    return (origin, callback) => {
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} not allowed by CORS (Dev)`));
    };
  }

  const origins = new Set(
    originStr
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  );

  return (origin, callback) => {
    if (!origin || origins.has(origin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  };
}

export const corsMiddleware = cors({
  origin: getOriginConfig(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // X-Admin-Token y X-Admin-Totp: verificación en dos pasos del panel de admin.
  // Sin ellas, el preflight del navegador bloquea toda petición del panel.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'X-Admin-Totp'],
});

/** Rutas con alta frecuencia legítima: stream SSE y polling de estado. */
const SSE_PATH = /^\/events\/?$/;
const STATUS_PATH = /\/status\/?$/;

const baseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Un solo análisis en curso (1 req/3s = 300/15min) agotaba la ventana
  // completa por sí mismo y devolvía 429 al resto de la app.
  skip: (req) => SSE_PATH.test(req.path) || STATUS_PATH.test(req.path),
});

/** Límite general para toda la API (excluye SSE y los endpoints /status) */
export const apiLimiter = baseLimiter;

/** Límite propio del polling de estado: acotado por minuto, no por ventana larga */
export const analysisStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  skip: (req) => !STATUS_PATH.test(req.path),
  message: { error: 'Demasiadas consultas de estado. Reduce la frecuencia de sondeo.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Límite estricto anti credential-stuffing para login */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Límite anti-abuso para registros */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados registros desde esta IP. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Límite para forgot-password (anti enumeración/spam de email) */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
