import type { Response } from 'express';
import type { RedisClientType } from 'redis';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * SSE (Server-Sent Events) — registro de clientes por usuario.
 * El frontend usa polling como fallback; SSE envía actualizaciones push
 * cuando la conexión está activa.
 *
 * Las conexiones viven en la memoria de cada proceso, pero el evento puede
 * nacer en otro: el worker (con RUN_WORKER=false va en un proceso aparte) o
 * cualquier otra réplica de la API. Por eso cada evento se PUBLICA en Redis y
 * cada proceso lo entrega a sus propios clientes. Sin Redis se entrega solo a
 * los clientes locales, como antes.
 */

const CANAL_SSE = 'sse:eventos';

const clients = new Map<string, Set<Response>>();

let suscriptor: RedisClientType | null = null;

interface MensajeSse {
  userId: string;
  event: string;
  data: unknown;
}

/** Conecta este proceso al canal de eventos. Llamar tras `initRedis`. */
export async function iniciarPuenteSSE(): Promise<void> {
  if (suscriptor || !redisClient?.isReady) return;
  try {
    // Una conexión en modo suscripción no admite otros comandos: va aparte.
    const sub = redisClient.duplicate() as RedisClientType;
    sub.on('error', (err) => logger.error('[SSE] Error del suscriptor Redis:', err));
    await sub.connect();
    await sub.subscribe(CANAL_SSE, (mensaje) => {
      try {
        const { userId, event, data } = JSON.parse(mensaje) as MensajeSse;
        pushLocal(userId, event, data);
      } catch (err) {
        logger.warn('[SSE] Mensaje de Redis malformado:', err);
      }
    });
    suscriptor = sub;
    logger.info('[SSE] Puente Redis activo');
  } catch (err) {
    logger.error('[SSE] No se pudo activar el puente Redis; eventos solo locales:', err);
  }
}

export async function detenerPuenteSSE(): Promise<void> {
  if (!suscriptor) return;
  const sub = suscriptor;
  suscriptor = null;
  try {
    await sub.quit();
  } catch {
    // ya cerrada
  }
}

const MAX_CLIENTS_POR_USUARIO = 5;

export function addClient(userId: string, res: Response): void {
  if (!userId || !res) return;
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  // Evitar acumulación ilimitada de conexiones por usuario
  while (set.size >= MAX_CLIENTS_POR_USUARIO) {
    const oldest = set.values().next().value;
    if (!oldest) break;
    removeClient(userId, oldest);
    try {
      oldest.end();
    } catch {
      /* ya cerrada */
    }
  }
  set.add(res);
}

export function removeClient(userId: string, res: Response): void {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    clients.delete(userId);
  }
}

/**
 * Emite un evento. Con el puente activo se publica en Redis y lo entrega el
 * suscriptor de cada proceso (incluido este); si la publicación falla, se
 * entrega al menos a los clientes locales.
 */
function push(userId: string, event: string, data: unknown): void {
  if (suscriptor && redisClient?.isReady) {
    redisClient.publish(CANAL_SSE, JSON.stringify({ userId, event, data } satisfies MensajeSse)).catch((err) => {
      logger.warn('[SSE] No se pudo publicar en Redis; entrega solo local:', err);
      pushLocal(userId, event, data);
    });
    return;
  }
  pushLocal(userId, event, data);
}

function pushLocal(userId: string, event: string, data: unknown): boolean {
  const set = clients.get(userId);
  if (!set || set.size === 0) return false;
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(frame);
    } catch {
      removeClient(userId, res);
    }
  }
  return true;
}

export function emitAnalysisUpdate(
  userId: string,
  data: {
    tipo: string;
    estado: 'procesando' | 'completado' | 'error';
    productoId: string;
    id: string;
    errorMessage?: string;
  }
): void {
  push(userId, 'analysis-update', data);
}
