import { Queue, Worker, UnrecoverableError } from 'bullmq';
import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';
import { recordError, updateJobStatus } from '../utils/metrics';
import { procesarAnalisis } from './analysisWorker';
import { AppDataSource } from '../config/database';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { AnalisisLegal } from '../models/AnalisisLegal';
import { AnalisisBrief } from '../models/AnalisisBrief';
import { AnalisisVentas } from '../models/AnalisisVentas';
import type { ObjectLiteral, Repository } from 'typeorm';
import { emitAnalysisUpdate } from '../events/sse';
import { reembolsarCreditos } from '../services/billing/creditosIA';

const QUEUE_NAME = 'analysis-queue';

/**
 * Opciones base cuando las credenciales llegan por variables separadas.
 * REDIS_TLS=true activa TLS; ioredis usa `tls: {}` para TLS con los defaults.
 */
function opcionesRedisBase(): RedisOptions {
  return {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    family: 4,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
  };
}

/**
 * Crea una conexión ioredis para BullMQ. Prioriza REDIS_URL (redis:// o
 * rediss://) para que un proveedor gestionado funcione sin desglosar
 * credenciales; `extra` lleva las opciones propias de cada rol (productor con
 * reintentos y timeout, worker con maxRetriesPerRequest: null).
 */
function crearConexionRedis(extra: RedisOptions): Redis {
  const url = process.env.REDIS_URL;
  if (url) {
    return new Redis(url, { family: 4, ...extra });
  }
  return new Redis({ ...opcionesRedisBase(), ...extra });
}

let queueConnection: Redis | null = null;
let queueInstance: Queue | null = null;
let worker: Worker | null = null;

/**
 * Conexión del productor (enqueue): permite reintentos y timeout por comando
 * para que un fallo de Redis rechace la promesa en vez de colgar el request.
 *
 * Se crea de forma PEREZOSA: si se creara al importar el módulo, el handle de
 * Redis mantendría el event loop vivo en cualquier proceso que lo importe
 * (tests, scripts CLI, herramientas de diagnóstico), impidiendo que terminen
 * solos, además de abrir un socket que muchos de esos procesos nunca usan.
 */
function getQueueConnection(): Redis {
  if (!queueConnection) {
    queueConnection = crearConexionRedis({
      maxRetriesPerRequest: 3,
      commandTimeout: 8000,
    });
  }
  return queueConnection;
}

/** Devuelve la cola del productor, creándola en el primer uso real. */
export function getAnalysisQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, { connection: getQueueConnection() });
  }
  return queueInstance;
}

/**
 * Compatibilidad con los 10 puntos de llamada existentes (`analysisQueue.add(...)`).
 * El proxy resuelve la cola real en el primer acceso a una propiedad, de modo
 * que importar este módulo ya no abre ninguna conexión.
 */
export const analysisQueue: Queue = new Proxy({} as Queue, {
  get(_target, prop) {
    const cola = getAnalysisQueue() as unknown as Record<string | symbol, unknown>;
    const valor = cola[prop];
    return typeof valor === 'function' ? valor.bind(cola) : valor;
  },
  set(_target, prop, valor) {
    const cola = getAnalysisQueue() as unknown as Record<string | symbol, unknown>;
    cola[prop] = valor;
    return true;
  },
  has(_target, prop) {
    return prop in (getAnalysisQueue() as unknown as Record<string | symbol, unknown>);
  },
});

/**
 * Lo que ve el usuario cuando un análisis falla de verdad. El detalle técnico
 * (errores de base de datos, del proveedor de IA) va solo a los logs.
 */
export const MENSAJE_ERROR_ANALISIS =
  'No pudimos completar el análisis. Vuelve a intentarlo: este intento no se descuenta de tu plan.';

/**
 * Único punto que marca un análisis como error y avisa al usuario. Se llama
 * cuando ya no quedan reintentos: si se marcara en el primer fallo, la pantalla
 * mostraría "error" aunque el segundo intento terminara bien.
 */
export async function marcarAnalisisError(
  moduleName: string,
  analisisId: string,
  usuarioId?: string,
  productoId?: string
): Promise<void> {
  try {
    if (!AppDataSource.isInitialized) return;
    let repo;
    switch (moduleName) {
      case 'mercado':
        repo = AppDataSource.getRepository(AnalisisMercado);
        break;
      case 'marketing':
        repo = AppDataSource.getRepository(AnalisisMarketing);
        break;
      case 'finanzas':
        repo = AppDataSource.getRepository(AnalisisFinanzas);
        break;
      case 'legal':
        repo = AppDataSource.getRepository(AnalisisLegal);
        break;
      case 'brief':
        repo = AppDataSource.getRepository(AnalisisBrief);
        break;
      case 'ventas':
        repo = AppDataSource.getRepository(AnalisisVentas);
        break;
      default:
        // Módulo desconocido: la fila quedaría en 'procesando' para siempre y
        // el polling del frontend no terminaría nunca. Se registra para que el
        // olvido sea visible en logs y métricas en vez de silencioso.
        logger.error(
          `[Worker] marcarAnalisisError: módulo sin repositorio ('${moduleName}'), análisis ${analisisId} queda sin marcar`
        );
        recordError('unknown_analysis_module');
        updateJobStatus('failed');
        return;
    }
    // El `switch` deja a `repo` como unión de seis Repository<T> y llamar a
    // `update` sobre esa unión desborda al compilador (TS2590). Se estrecha a
    // un único tipo: las seis entidades comparten `id`, `estado_analisis` y
    // `error_mensaje`, que son las únicas columnas que se tocan aquí.
    await (repo as unknown as Repository<ObjectLiteral>).update(
      { id: analisisId },
      { estado_analisis: 'error', error_mensaje: MENSAJE_ERROR_ANALISIS }
    );
    if (usuarioId) {
      emitAnalysisUpdate(usuarioId, {
        tipo: moduleName,
        estado: 'error',
        productoId: productoId ?? '',
        id: analisisId,
        errorMessage: MENSAJE_ERROR_ANALISIS,
      });
    }
    await reembolsarCreditos({ referenciaId: analisisId });
    updateJobStatus('failed');
    recordError(`analysis_failed_${moduleName}`);
  } catch (err) {
    logger.error('[Worker] No se pudo marcar análisis como error:', err);
  }
}

/**
 * Limpia análisis atascados en estado 'procesando' por más de `maxAgeMinutes` (default: 15 minutos).
 * Previene análisis zombi ante caídas inesperadas de pods, workers o timeouts del LLM.
 */
export async function limpiarAnalisisColgados(maxAgeMinutes: number = 15): Promise<number> {
  if (!AppDataSource.isInitialized) return 0;

  const tablas = [
    'analisis_mercado',
    'analisis_marketing',
    'analisis_finanzas',
    'analisis_legal',
    'analisis_brief',
    'analisis_ventas',
  ];

  let totalLimpiados = 0;
  const timeoutMensaje = 'Tiempo de procesamiento excedido: el análisis tardó más de lo esperado y fue finalizado automáticamente.';

  for (const tabla of tablas) {
    try {
      const result = await AppDataSource.query(
        `UPDATE ${tabla}
         SET estado_analisis = 'error',
             error_mensaje = $1
         WHERE estado_analisis = 'procesando'
           AND fecha_creacion < (NOW() - make_interval(mins => $2))`,
        [timeoutMensaje, maxAgeMinutes]
      );
      const rowsAffected = result?.[1] || 0;
      if (rowsAffected > 0) {
        totalLimpiados += rowsAffected;
        logger.warn(`[Worker] limpiarAnalisisColgados: ${rowsAffected} fila(s) en ${tabla} marcadas como error por timeout.`);
      }
    } catch (err) {
      logger.error(`[Worker] Error limpiando análisis colgados en ${tabla}:`, err);
    }
  }

  if (totalLimpiados > 0) {
    recordError('analysis_stale_timeout');
    updateJobStatus('failed', totalLimpiados);
  }

  return totalLimpiados;
}

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Arranca el worker en este proceso. En producción se recomienda ejecutarlo
 * en un proceso aparte (node dist/workers/runWorker.js) para poder desplegar
 * la API sin matar jobs en vuelo.
 */
export function startAnalysisWorker(): Worker {
  if (worker) return worker;

  // BullMQ exige maxRetriesPerRequest: null en conexiones bloqueantes
  const workerConnection = crearConexionRedis({ maxRetriesPerRequest: null });

  worker = new Worker(QUEUE_NAME, procesarAnalisis, {
    connection: workerConnection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),
  });

  worker.on('completed', (job) => {
    logger.info(`[Worker] Job completado: ${job.id}`);
  });

  worker.on('failed', async (job, error) => {
    logger.error(`[Worker] Job ${job?.id} falló (intento ${job?.attemptsMade}):`, error.message);
    const attempts = job?.opts.attempts ?? 1;
    const definitivo = error instanceof UnrecoverableError || error.name === 'UnrecoverableError';
    if (job && (definitivo || job.attemptsMade >= attempts) && job.data?.moduleName && job.data?.analisisId) {
      await marcarAnalisisError(job.data.moduleName, job.data.analisisId, job.data.usuarioId, job.data.productoId);
    }
  });

  // Barrido inicial de análisis colgados y temporizador periódico cada 10 min
  limpiarAnalisisColgados(15).catch((err) =>
    logger.error('[Worker] Error en barrido inicial de análisis colgados:', err)
  );

  if (!cleanupTimer) {
    cleanupTimer = setInterval(() => {
      limpiarAnalisisColgados(15).catch((err) =>
        logger.error('[Worker] Error en barrido recurrente de análisis colgados:', err)
      );
    }, 10 * 60 * 1000);
    cleanupTimer.unref();
  }

  logger.info('[Worker] Analysis worker inicializado con limpiador de análisis colgados');
  return worker;
}

export async function stopAnalysisWorker(): Promise<void> {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('[Worker] Worker cerrado correctamente');
  }
  // No instanciar la cola durante el apagado si nunca se usó.
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (queueConnection) {
    queueConnection.disconnect();
    queueConnection = null;
  }
}