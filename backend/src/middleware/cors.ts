import rateLimit, { MemoryStore, type Options, type Store, type IncrementResponse } from 'express-rate-limit';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Configuración de orígenes permitidos para CORS:
 * - Soporta URLs separadas por comas en FRONTEND_URL o CORS_ORIGIN (ej. "https://app.bi0a100.com,https://staging.bi0a100.com").
 * - Dev: acepta localhost y 127.0.0.1 en cualquier puerto.
 * - Prod: FRONTEND_URL es OBLIGATORIO (el arranque falla si falta).
 */
function crearValidadorOrigen(): (origin: string) => boolean {
  const originStr = process.env.FRONTEND_URL || process.env.CORS_ORIGIN;
  if (!originStr && process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_URL es obligatorio en producción (CORS)');
  }
  const esLocal = (origin: string) => origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  if (!originStr) return esLocal;

  const origins = new Set(
    originStr
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  );
  return (origin) => origins.has(origin) || (process.env.NODE_ENV !== 'production' && esLocal(origin));
}

export const origenPermitido = crearValidadorOrigen();

/**
 * Un origen no permitido recibe 403 y la petición no se procesa.
 *
 * Antes el callback de `cors` devolvía un Error y el manejador global lo
 * convertía en 500: un navegador en un dominio no listado (p. ej. www en vez del
 * apex) generaba errores 5xx, alertas y ruido en Sentry por una petición legítima
 * de rechazar. Las peticiones sin cabecera Origin (servidor a servidor, webhooks,
 * Prometheus) no se ven afectadas.
 */
function rechazarOrigenNoPermitido(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && !origenPermitido(origin)) {
    res.status(403).json({ error: 'Origen no permitido' });
    return;
  }
  next();
}

export const corsMiddleware = [
  rechazarOrigenNoPermitido,
  cors({
    origin: (origin, callback) => callback(null, !origin || origenPermitido(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    // X-Admin-Token y X-Admin-Totp: verificación en dos pasos del panel de admin.
    // Sin ellas, el preflight del navegador bloquea toda petición del panel.
    // X-Zona-Horaria: zona IANA del navegador (services/google/zonaHoraria.ts); sin
    // ella en la lista, el preflight bloquearía todas las peticiones de la app.
    // Idempotency-Key: altas idempotentes (middleware/idempotency.ts).
    allowedHeaders: ['Content-Type', 'Authorization', 'x-bypass-rate-limit', 'X-Admin-Token', 'X-Admin-Totp', 'X-Zona-Horaria', 'Idempotency-Key'],
    // Cabeceras de respuesta que el navegador puede leer: el cursor de la página
    // siguiente de los listados (utils/paginacion.ts) y la marca de respuesta repetida.
    exposedHeaders: ['X-Siguiente', 'Idempotent-Replayed'],
  }),
];

/** Rutas con alta frecuencia legítima: stream SSE y polling de estado. */
const SSE_PATH = /^\/events\/?$/;
const STATUS_PATH = /\/status\/?$/;

/**
 * Salto de los límites por IP para pruebas de carga y QA.
 *
 * Solo en entornos que se declaran explícitamente de desarrollo o test: si un
 * despliegue arranca sin NODE_ENV, el código fijo del repo y RATE_LIMIT_DISABLED
 * no deben poder apagar la protección. En producción solo vale el secreto
 * RATE_LIMIT_BYPASS_SECRET (mínimo 32 caracteres).
 */
const ENTORNO_LOCAL = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

const isBypassRequest = (req: { headers?: Record<string, unknown> }): boolean => {
  if (ENTORNO_LOCAL && process.env.RATE_LIMIT_DISABLED === 'true') return true;
  const token = req.headers ? req.headers['x-bypass-rate-limit'] : undefined;
  if (typeof token !== 'string' || !token) return false;
  if (ENTORNO_LOCAL && token === 'bi0a100-qa-bypass') return true;
  const secreto = process.env.RATE_LIMIT_BYPASS_SECRET;
  if (secreto && secreto.length >= 32 && token === secreto) return true;
  return false;
};

/**
 * Almacén de contadores de rate limit en Redis, con memoria como respaldo.
 *
 * Con el almacén en memoria por defecto, cada réplica contaba por su lado (N
 * réplicas = N veces el límite) y cada deploy ponía los contadores a cero, lo que
 * regalaba una ventana nueva a un ataque de fuerza bruta. Si Redis no está
 * disponible se cuenta en memoria: mejor un límite por proceso que ninguno.
 */
export class AlmacenLimiteRedis implements Store {
  readonly prefix: string;
  private windowMs = 60_000;
  private readonly memoria = new MemoryStore();

  constructor(nombre: string) {
    this.prefix = `rl:${nombre}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.memoria.init(options);
  }

  private redis() {
    return redisClient?.isReady ? redisClient : null;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = this.redis();
    if (redis) {
      try {
        const clave = this.prefix + key;
        // SET NX PX abre la ventana solo si no existe; INCR cuenta; PTTL da el reinicio.
        const [, hits, ttl] = (await redis
          .multi()
          .set(clave, '0', { PX: this.windowMs, NX: true })
          .incr(clave)
          .pTTL(clave)
          .exec()) as unknown as [unknown, number, number];
        const restante = Number(ttl) > 0 ? Number(ttl) : this.windowMs;
        return { totalHits: Number(hits), resetTime: new Date(Date.now() + restante) };
      } catch (err) {
        logger.warn('[rate-limit] Redis no respondió; se cuenta en memoria:', err);
      }
    }
    return this.memoria.increment(key);
  }

  async decrement(key: string): Promise<void> {
    const redis = this.redis();
    if (redis) {
      try {
        await redis.decr(this.prefix + key);
        return;
      } catch {
        // se cae a memoria
      }
    }
    await this.memoria.decrement(key);
  }

  async resetKey(key: string): Promise<void> {
    const redis = this.redis();
    if (redis) {
      try {
        await redis.del(this.prefix + key);
      } catch {
        // noop
      }
    }
    await this.memoria.resetKey(key);
  }
}

/**
 * Usuario del access token, si es válido (firma HS256 comprobada). Con él el
 * límite general cuenta por persona y no por IP: todas las cajas de un negocio
 * salen por la misma IP pública, y con el CGNAT de las operadoras móviles
 * desconocidos compartían cupo. Un token falso o caducado cuenta por IP (así
 * nadie puede agotar el cupo de otro inventando tokens).
 */
export function usuarioParaLimite(req: Request): string | null {
  const r = req as Request & { _uidLimite?: string | null };
  if (r._uidLimite !== undefined) return r._uidLimite;
  let uid: string | null = null;
  const token = req.cookies?.access_token ?? req.headers.authorization?.split(' ')[1];
  const secreto = process.env.JWT_SECRET;
  if (token && secreto) {
    try {
      const payload = jwt.verify(token, secreto, { algorithms: ['HS256'] }) as { userId?: unknown };
      if (typeof payload.userId === 'string') uid = payload.userId;
    } catch {
      uid = null;
    }
  }
  r._uidLimite = uid;
  return uid;
}

const LIMITE_POR_IP = process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : 300;
const LIMITE_POR_USUARIO = process.env.RATE_LIMIT_MAX_USUARIO ? parseInt(process.env.RATE_LIMIT_MAX_USUARIO, 10) : 1200;

const baseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 1 200 cada 15 min por usuario (80/min: una caja con mucho movimiento) y
  // 300 por IP para peticiones sin sesión.
  max: (req) => (usuarioParaLimite(req) ? LIMITE_POR_USUARIO : LIMITE_POR_IP),
  keyGenerator: (req) => {
    const uid = usuarioParaLimite(req);
    return uid ? `u:${uid}` : `ip:${req.ip ?? 'desconocida'}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new AlmacenLimiteRedis('api'),
  // Un solo análisis en curso (1 req/3s = 300/15min) agotaba la ventana
  // completa por sí mismo y devolvía 429 al resto de la app.
  skip: (req) => isBypassRequest(req) || SSE_PATH.test(req.path) || STATUS_PATH.test(req.path),
});

/** Límite general para toda la API (excluye SSE y los endpoints /status) */
export const apiLimiter = baseLimiter;

/** Límite propio del polling de estado: acotado por minuto, no por ventana larga */
export const analysisStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  store: new AlmacenLimiteRedis('status'),
  skip: (req) => isBypassRequest(req) || !STATUS_PATH.test(req.path),
  message: { error: 'Demasiadas consultas de estado. Reduce la frecuencia de sondeo.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Límite estricto anti credential-stuffing para login */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  store: new AlmacenLimiteRedis('login'),
  skip: (req) => isBypassRequest(req),
  message: { error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Límite anti-abuso para registros */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  store: new AlmacenLimiteRedis('signup'),
  skip: (req) => isBypassRequest(req),
  message: { error: 'Demasiados registros desde esta IP. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Límite para forgot-password (anti enumeración/spam de email) */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: new AlmacenLimiteRedis('reset'),
  skip: (req) => isBypassRequest(req),
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
