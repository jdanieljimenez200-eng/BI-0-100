import { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

/**
 * Middleware que valida si el usuario es administrador de plataforma.
 * Usa el flag `es_admin` en BD — NUNCA confiar en account_role ('owner'),
 * que es un rol de multi-tenancy (dueño de cuenta) y no de plataforma.
 */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const usuarioId = req.userId;

    if (!usuarioId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usuarioRepo = AppDataSource.getRepository(Usuario);
    const usuario = await usuarioRepo.findOne({
      where: { id: usuarioId },
    });

    if (!usuario) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!usuario.es_admin || !usuario.activo) {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere permisos de administrador' });
    }

    next();
  } catch (error) {
    logger.error('requireAdmin middleware error:', error);
    res.status(500).json({ error: 'Error interno' });
  }
};