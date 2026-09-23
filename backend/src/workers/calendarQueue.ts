import { Queue, Worker, UnrecoverableError } from 'bullmq';
import type Redis from 'ioredis';
import { AppDataSource } from '../config/database';
import { ConexionGoogleCalendar } from '../models/ConexionGoogleCalendar';
import { Cita } from '../models/Cita';
import { logger } from '../utils/logger';
import { recordError } from '../utils/metrics';
import { crearConexionRedis } from './analysisQueue';
import { marcarErrorCita, procesarTrabajoCalendario, TrabajoCalendario } from '../services/google/calendarSync';

/**
 * Cola `calendar-sync`: copia a Google Calendar las altas, cambios y bajas de
 * citas sin hacer esperar al usuario. Conexión perezosa, como `analysisQueue`.
 */

const QUEUE_NAME = 'calendar-sync';

let conexion: Redis | null = null;
let cola: Queue<TrabajoCalendario> | null = null;
let worker: Worker<TrabajoCalendario> | null = null;

export function getCola(): Queue<TrabajoCalendario> {
  if (!cola) {
    conexion = crearConexionRedis({ maxRetriesPerRequest: 3, commandTimeout: 8000 }, 'productor');
    cola = new Queue<TrabajoCalendario>(QUEUE_NAME, {
      connection: conexion,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000, age: 24 * 3600 },
        removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
      },
    });
    cola.on('error', (err) => logger.error('[CalendarQueue] Error de la cola:', err.message));
  }
  return cola;
}

/**
 * Prioridad en la cola (menor = antes).
 *
 * El limitador es global para todas las cuentas: conectar un calendario con 500
 * citas ocupaba la cola ~100 s y, mientras tanto, mover una cita de cualquier
 * otro negocio esperaba su turno detrás de esas 500. Lo que el usuario acaba de
 * tocar va primero; el volcado masivo rellena los huecos.
 */
const PRIORIDAD_INTERACTIVA = 1;
const PRIORIDAD_MASIVA = 10;

/** ¿La cuenta tiene un Google Calendar conectado y activo? */
export async function cuentaConGoogle(cuentaId: string): Promise<boolean> {
  const n = await AppDataSource.getRepository(ConexionGoogleCalendar).count({
    where: { cuenta_id: cuentaId, activa: true },
  });
  return n > 0;
}

/**
 * Encola la copia de una cita. No lanza: si Redis no responde, la cita queda en
 * `error` y el usuario puede pulsar «Sincronizar ahora».
 */
export async function encolarGuardarCita(cuentaId: string, citaId: string): Promise<void> {
  try {
    if (!(await cuentaConGoogle(cuentaId))) return;
    await AppDataSource.getRepository(Cita).update(citaId, { google_sync_estado: 'pendiente', google_sync_error: null });
    await getCola().add('guardar', { tipo: 'guardar', citaId }, { priority: PRIORIDAD_INTERACTIVA });
  } catch (err) {
    logger.warn('[CalendarQueue] No se pudo encolar la cita', { citaId, error: err instanceof Error ? err.message : String(err) });
    await marcarErrorCita(citaId, 'No se pudo programar la sincronización').catch(() => undefined);
  }
}

/** Sube de golpe varias citas («Sincronizar ahora» y al conectar). Devuelve cuántas encoló. */
export async function encolarCitas(citaIds: string[]): Promise<number> {
  if (citaIds.length === 0) return 0;
  await AppDataSource.getRepository(Cita)
    .createQueryBuilder()
    .update()
    .set({ google_sync_estado: 'pendiente', google_sync_error: null })
    .whereInIds(citaIds)
    .execute();
  await getCola().addBulk(
    citaIds.map((citaId) => ({
      name: 'guardar',
      data: { tipo: 'guardar' as const, citaId },
      opts: { priority: PRIORIDAD_MASIVA },
    })),
  );
  return citaIds.length;
}

export async function encolarBorrarEvento(cuentaId: string, eventId: string | null): Promise<void> {
  if (!eventId) return;
  try {
    if (!(await cuentaConGoogle(cuentaId))) return;
    await getCola().add('borrar', { tipo: 'borrar', cuentaId, eventId }, { priority: PRIORIDAD_INTERACTIVA });
  } catch (err) {
    logger.warn('[CalendarQueue] No se pudo encolar el borrado', { error: err instanceof Error ? err.message : String(err) });
  }
}

export function startCalendarWorker(): Worker<TrabajoCalendario> {
  if (worker) return worker;
  worker = new Worker<TrabajoCalendario>(QUEUE_NAME, (job) => procesarTrabajoCalendario(job.data), {
    connection: crearConexionRedis({ maxRetriesPerRequest: null }, 'worker'),
    concurrency: 2,
    // Google permite ~10 escrituras/s por usuario; con esto sobra margen.
    limiter: { max: 5, duration: 1000 },
  });
  worker.on('error', (err) => {
    logger.error('[CalendarWorker] Error del worker:', err.message);
    recordError('calendar_worker_error');
  });
  worker.on('failed', async (job, error) => {
    if (!job) return;
    const definitivo = error instanceof UnrecoverableError || error.name === 'UnrecoverableError';
    if (!definitivo && job.attemptsMade >= (job.opts.attempts ?? 1) && job.data.tipo === 'guardar') {
      // Agotó los reintentos por un fallo transitorio.
      await marcarErrorCita(job.data.citaId, `Google no respondió: ${error.message}`).catch(() => undefined);
    }
  });
  logger.info('[CalendarWorker] Worker de Google Calendar inicializado');
  return worker;
}

export async function stopCalendarWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (cola) {
    await cola.close();
    cola = null;
  }
  if (conexion) {
    conexion.disconnect();
    conexion = null;
  }
}
