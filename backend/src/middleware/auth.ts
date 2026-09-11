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

    // Validar que el token NO esté en denylist (si Redis está listo)
    if (payload.jti) {
      if (redisClient?.isReady) {
        try {
          const denied = await redisClient.get(`deny:${payload.jti}`);
          if (denied) {
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
