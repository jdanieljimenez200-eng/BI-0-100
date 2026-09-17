import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Idempotency lock para endpoints POST /:modulo/analizar.
 *
 * Previene:
 *   - Doble-clic del usuario → 2 análisis + 2 cobros de Anthropic.
 *   - Race entre el plan-check y el insert de la fila `procesando`.
 *
 * Diseño:
 *   Clave Redis:  analisis_lock:{modulo}:{usuarioId}:{productoId}
 *   TTL:          30 s (cubre el click burst; la fila DB y el job BullMQ
 *                 persisten el estado real más allá de eso).
 *   NX:           si la clave existe, rechaza con 409.
 *
 * Si la petición se acepta (202), el lock caduca solo por TTL: no se borra al
 * completar el análisis porque eso obligaría a propagar el release hasta el worker.
 *
 * Si la petición termina en error (400 de validación, 402 sin créditos, 404,
 * 5xx…) el lock se borra al responder: no se creó ningún análisis, y antes quien
 * corregía el formulario y reenviaba en menos de 30 s recibía un 409 "Ya hay un
 * análisis en curso" que no existía.
 */
export function requireAnalisisLock(modulo: string, opciones: { porCuenta?: boolean } = {}) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    // Los routers usan tanto snake_case como camelCase
    const productoId = req.body?.producto_id ?? req.body?.productoId;
    if (!productoId || !req.userId) {
      // Si falta algún dato, que la validación downstream maneje el 400.
      next();
      return;
    }

    // `porCuenta`: para módulos cuya cuota es por cuenta y no por producto.
    const key = opciones.porCuenta
      ? `analisis_lock:${modulo}:${req.userId}`
      : `analisis_lock:${modulo}:${req.userId}:${productoId}`;

    try {
      const acquired = await redisClient.set(key, '1', { NX: true, EX: 30 });
      if (!acquired) {
        res.status(409).json({
          error: 'Ya hay un análisis en curso para este producto. Espera unos segundos antes de reintentar.',
          retry_after_seconds: 30,
        });
        return;
      }
      res.once('finish', () => {
        if (res.statusCode < 400) return;
        redisClient.del(key).catch((err: unknown) => logger.warn('[idempotency] No se pudo liberar el lock:', err));
      });
    } catch (err) {
      // Si Redis está caído, fallamos abierto para no bloquear a los usuarios.
      // El riesgo (doble-click) es menor que el de un outage de Redis bloqueando
      // todos los análisis. Se loguea para que el oncall lo vea.
      logger.error('[idempotency] Redis unreachable, proceeding without lock:', err);
    }

    next();
  };
}
