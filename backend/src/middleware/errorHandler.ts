import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { reportarError } from '../config/sentry';

/**
 * Errores de Postgres que causa el DATO que mandó el cliente, no el servidor:
 * un texto más largo que su varchar, un número que no cabe en su numeric, un
 * valor que un CHECK no admite, un duplicado. Llegaban aquí como 500 y como
 * alerta de Sentry. La validación de cada ruta debe atraparlos antes (topes de
 * `utils/limitesNumericos.ts` y `.max()` en los textos); esto es la red por si
 * algún campo se escapa. El mensaje es genérico a propósito: el de Postgres
 * lleva nombres de columnas y valores.
 */
const ERRORES_DEL_DATO: Record<string, { status: number; mensaje: string }> = {
  '22001': { status: 400, mensaje: 'Un texto supera la longitud permitida.' },
  '22003': { status: 400, mensaje: 'Un número está fuera del rango permitido.' },
  '22P02': { status: 400, mensaje: 'Un valor no tiene el formato esperado.' },
  '22007': { status: 400, mensaje: 'Una fecha no tiene el formato esperado.' },
  '22008': { status: 400, mensaje: 'Una fecha está fuera de rango.' },
  '23514': { status: 400, mensaje: 'Un valor no está permitido.' },
  '23505': { status: 409, mensaje: 'Ya existe un registro con esos datos.' },
};

/**
 * Manejador global de errores para Express.
 * Se ejecuta al final de la cadena de middleware y captura
 * cualquier error no manejado.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const explicito = err?.statusCode || err?.status;
  const delDato = !explicito && typeof err?.code === 'string' ? ERRORES_DEL_DATO[err.code] : undefined;
  const statusCode = explicito || delDato?.status || 500;

  if (delDato) {
    logger.warn('Dato rechazado por Postgres', { message, code: err.code, statusCode, path: req.path });
  } else {
    logger.error('Unhandled global error', {
      message,
      code: err?.code,
      statusCode,
      path: req.path,
      stack,
    });
  }
  if (statusCode >= 500) {
    reportarError(err, { path: req.path, method: req.method });
  }

  // Si los headers ya fueron enviados, delegar al manejador por defecto de Express
  if (res.headersSent) {
    return next(err);
  }

  // No filtrar mensajes internos (stack/SQL/drivers) al cliente en errores 5xx,
  // ni el de Postgres en los errores del dato.
  const clientMessage = delDato ? delDato.mensaje : statusCode < 500 ? message : 'Internal Server Error';

  res.status(statusCode).json({
    error: clientMessage,
    statusCode,
    ...(process.env.NODE_ENV === 'development' && { stack }),
  });
}