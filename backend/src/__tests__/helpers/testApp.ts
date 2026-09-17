import app from '../../app';
import { AppDataSource } from '../../config/database';
import { initRedis, redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';
import { stopCalendarWorker } from '../../workers/calendarQueue';

export { app };

export async function initTestDb(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  // Redis es opcional para las rutas gateadas con fail-open/fail-closed
  // documentado en cada una; si no hay Redis local, los tests que dependen de
  // él aceptan también su respuesta degradada (ver auth.test.ts).
  if (!redisClient?.isReady) {
    try {
      await initRedis();
    } catch (err) {
      logger.warn('[test] Redis no disponible para tests de integración, continuando sin él:', err);
    }
  }
}

export async function closeTestDb(): Promise<void> {
  // La cola de Google Calendar abre su conexión al primer encolado.
  await stopCalendarWorker();
  if (redisClient?.isReady) {
    await redisClient.quit();
  }
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
