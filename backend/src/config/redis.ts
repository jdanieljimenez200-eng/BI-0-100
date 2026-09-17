import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

export let redisClient: RedisClientType;

/**
 * Crea el cliente según el escenario de despliegue:
 *  1. REDIS_URL (redis:// o rediss://) — proveedores gestionados; el esquema
 *     rediss:// activa TLS y la URL puede llevar usuario/contraseña.
 *  2. REDIS_HOST/REDIS_PORT + REDIS_PASSWORD (+ REDIS_TLS=true) — despliegues
 *     donde las credenciales llegan por variables separadas.
 *  3. Sin variables: host 'redis' del docker-compose local, sin auth.
 */
function crearCliente(): { cliente: RedisClientType; destino: string } {
  const url = process.env.REDIS_URL;
  if (url) {
    return { cliente: createClient({ url }) as unknown as RedisClientType, destino: 'REDIS_URL' };
  }

  const host = process.env.REDIS_HOST || 'redis';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD;
  const usarTls = process.env.REDIS_TLS === 'true';

  // Dos ramas explícitas: RedisSocketOptions es una unión discriminada y
  // pasar `tls: undefined` rompe la inferencia de tipos.
  const cliente = (
    usarTls
      ? createClient({
          // RedisTlsOptions no admite `family`: con TLS se deja que Node
          // resuelva la familia de direcciones.
          socket: { host, port, tls: true },
          ...(password ? { password } : {}),
        })
      : createClient({
          socket: { host, port, family: 4 },
          ...(password ? { password } : {}),
        })
  ) as unknown as RedisClientType;

  return { cliente, destino: `${host}:${port}${usarTls ? ' TLS' : ''}${password ? ' auth' : ''}` };
}

/**
 * Conecta a Redis.
 *
 * Redis guarda refresh tokens, la denylist de logout y los tokens de reset de
 * contraseña, así que en producción debe ir siempre con auth y TLS.
 *
 * El listener de `error` se registra ANTES de conectar y en TODOS los
 * escenarios: node-redis emite `error` en cada corte y reconexión, y un
 * EventEmitter que emite `error` sin listener lanza una excepción no capturada
 * que tumba el proceso. Antes solo la rama host/puerto lo tenía, y producción
 * usa REDIS_URL.
 */
export async function initRedis(): Promise<RedisClientType> {
  try {
    const { cliente, destino } = crearCliente();
    redisClient = cliente;

    redisClient.on('error', (err) => {
      logger.error('[Redis] Client error:', err);
    });
    redisClient.on('reconnecting', () => {
      logger.warn('[Redis] Reconectando…');
    });

    await redisClient.connect();
    logger.info(`[Redis] Connected (${destino})`);
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}
