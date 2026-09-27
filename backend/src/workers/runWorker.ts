import 'dotenv/config';
import 'reflect-metadata';

import { AppDataSource } from '../config/database';
import { migrarAlArrancar } from '../config/migracionesAlArrancar';
import { verificarClaveAnthropic } from '../config/anthropic';
import { verificarEntornoProduccion } from '../config/entorno';
import { initRedis, redisClient } from '../config/redis';
import { initSentry, reportarError, vaciarSentry } from '../config/sentry';
import { detenerPuenteSSE, iniciarPuenteSSE } from '../events/sse';
import { logger } from '../utils/logger';
import { startAnalysisWorker, stopAnalysisWorker } from './analysisQueue';
import { startCalendarWorker, stopCalendarWorker } from './calendarQueue';

/**
 * Proceso de trabajos en segundo plano, separado de la API.
 *
 * Con el worker dentro del proceso de la API, un análisis de IA o una ráfaga de
 * sincronizaciones con Google compartían CPU y event loop con las peticiones de
 * todos los usuarios, y cada despliegue de la API cortaba los trabajos en vuelo.
 *
 * Uso: la API con `RUN_WORKER=false` y este proceso aparte
 * (`npm run worker` en desarrollo, `npm run worker:prod` sobre dist/). Los
 * eventos para los navegadores salen por el puente SSE de Redis: los entrega el
 * proceso de la API que tiene la conexión abierta.
 */

async function arrancar(): Promise<void> {
  initSentry();
  process.on('uncaughtException', (err) => {
    logger.error('[worker] Uncaught exception:', err);
    reportarError(err, { tipo: 'uncaughtException', proceso: 'worker' });
    void vaciarSentry().finally(() => process.exit(1));
  });
  process.on('unhandledRejection', (razon) => {
    logger.error('[worker] Unhandled rejection:', razon);
    reportarError(razon, { tipo: 'unhandledRejection', proceso: 'worker' });
  });

  verificarClaveAnthropic();
  verificarEntornoProduccion();

  // Mismo candado que la API: si arrancan a la vez, migra solo uno.
  await migrarAlArrancar();
  await AppDataSource.initialize();
  await initRedis();
  // Sin el puente, los eventos del worker solo irían a clientes de ESTE proceso
  // (ninguno): hay que publicarlos en Redis.
  await iniciarPuenteSSE();

  startAnalysisWorker();
  startCalendarWorker();
  logger.info('[worker] Proceso de trabajos en segundo plano listo');
}

let cerrando = false;
async function cerrar(senal: string): Promise<void> {
  if (cerrando) return;
  cerrando = true;
  logger.info(`[worker] ${senal}: terminando los trabajos en curso…`);
  try {
    // close() espera a que acaben los trabajos activos antes de soltar la cola.
    await stopAnalysisWorker();
    await stopCalendarWorker();
    await detenerPuenteSSE();
    if (redisClient?.isReady) await redisClient.quit();
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    await vaciarSentry();
    process.exit(0);
  } catch (err) {
    logger.error('[worker] Error al cerrar:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void cerrar('SIGTERM'));
process.on('SIGINT', () => void cerrar('SIGINT'));

arrancar().catch(async (err) => {
  logger.error('[worker] No se pudo arrancar:', err);
  reportarError(err, { fase: 'arranque', proceso: 'worker' });
  await vaciarSentry();
  process.exit(1);
});
