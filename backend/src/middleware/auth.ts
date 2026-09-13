import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { recordAuthDenylistFailure } from '../utils/metrics';

export interface AuthRequest extends Request {
  userId?: string;
  userPlan?: string;
  cuentaEfectivaId?: string;
  trabajadorRealId?: string;
}

/**
 * Marca de sesiones bloqueadas (ver `services/auth/bloqueoSesion.ts`).
 *
 * Vive aquí y no en el servicio para no crear una importación circular: el
 * servicio necesita `routes/auth`, y `routes/auth` importa este middleware.
 */
export const claveBloqueo = (userId: string) => `bloqueado:${userId}`;

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.access_token ?? req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'JWT_SECRET not configured' });
      return;
    }

    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as { userId: string; jti?: string };

    // Denylist del token y bloqueo de la cuenta, en una sola ida a Redis.
    //
    // El bloqueo existe porque desactivar una cuenta en la base no invalida un
    // access token ya emitido: sin esta marca, a quien se bloquea le quedarían
    // hasta 15 minutos de acceso.
    if (redisClient?.isReady) {
      try {
        const [denegado, bloqueado] = await redisClient.mGet([
          payload.jti ? `deny:${payload.jti}` : `deny:__sin_jti__`,
          claveBloqueo(payload.userId),
        ]);
        if (denegado || bloqueado) {
          res.status(401).json({ error: 'Token inválido o expirado' });
          return;
        }
      } catch (redisErr) {
        logger.warn('[auth] Fallo transitorio al consultar denylist en Redis:', redisErr);
        recordAuthDenylistFailure();
      }
    } else {
      logger.warn('[auth] Redis no disponible para consultar denylist JWT (fail-open activo)');
      recordAuthDenylistFailure();
    }

    req.userId = payload.userId;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Token inválido o expirado' });
    } else {
      // Error de infraestructura (Redis caído, error de red) — no enmascarar como 401
      logger.error('[auth] Unexpected error during token validation:', error);
      res.status(500).json({ error: 'Error interno de autenticación' });
    }
  }
}
