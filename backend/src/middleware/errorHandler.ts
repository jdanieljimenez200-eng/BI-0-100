import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

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
  const statusCode = err.statusCode || err.status || 500;

  logger.error('Unhandled global error', {
    message,
    code: err?.code,
    statusCode,
    path: req.path,
    stack,
  });

  // Si los headers ya fueron enviados, delegar al manejador por defecto de Express
  if (res.headersSent) {
    return next(err);
  }

  // No filtrar mensajes internos (stack/SQL/drivers) al cliente en errores 5xx
  const clientMessage = statusCode < 500 ? message : 'Internal Server Error';

  res.status(statusCode).json({
    error: clientMessage,
    statusCode,
    ...(process.env.NODE_ENV === 'development' && { stack }),
  });
}