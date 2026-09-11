import type { Response } from 'express';
import { logger } from '../utils/logger';

/**
 * SSE (Server-Sent Events) — registro de clientes por usuario.
 * El frontend usa polling como fallback; SSE envía actualizaciones push
 * cuando la conexión está activa.
 */

const clients = new Map<string, Set<Response>>();

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

function push(userId: string, event: string, data: unknown): boolean {
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

export function emitAnalysisList(
  userId: string,
  data: {
    tipo: string;
    lista: unknown[];
  }
): void {
  push(userId, 'analysis-list', data);
}

export function emitTabCheck(userId: string): void {
  push(userId, 'tab-check', { ts: Date.now() });
}

export function getClientCount(): number {
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}

// Compatibilidad: el stub anterior exponía initializeSocket/getSocket
export function initializeSocket() {
  logger.info('[SSE] Registro de clientes inicializado');
}

export function getSocket() {
  return null;
}
