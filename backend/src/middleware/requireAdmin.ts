import { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Usuario, type AdminRol } from '../models/Usuario';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

/**
 * Control de acceso del panel de administración.
 *
 * Matriz de permisos (quién puede qué):
 *
 * | Acción                                        | soporte | moderador | superadmin |
 * |-----------------------------------------------|:-------:|:---------:|:----------:|
 * | Ver estadísticas y lista de usuarios          |    ✓    |     ✓     |     ✓      |
 * | Desactivar / reactivar usuario                |    ✓    |     –     |     ✓      |
 * | Revisar fichas, abrir cédula, moderar reseñas |    –    |     ✓     |     ✓      |
 * | Cambiar plan                                  |    –    |     –     |     ✓      |
 * | Asignar roles, ver auditoría                  |    –    |     –     |     ✓      |
 *
 * El rol se lee de la base en cada petición, no del token: quitarle el rol a
 * alguien tiene efecto en su siguiente clic, no cuando caduque su sesión.
 *
 * Usa `admin_rol`, NUNCA `account_role` ('owner'), que es un rol de
 * multi-tenancy (dueño de cuenta) y no de plataforma.
 */

export interface AdminRequest extends AuthRequest {
  adminRol?: AdminRol;
}

/** Roles que pueden hacer cada cosa. La matriz de arriba, en código. */
export const PERMISOS = {
  verPanel: ['soporte', 'moderador', 'superadmin'],
  gestionarActivo: ['soporte', 'superadmin'],
  moderarRed: ['moderador', 'superadmin'],
  cambiarPlan: ['superadmin'],
  gestionarRoles: ['superadmin'],
  verAuditoria: ['superadmin'],
} as const satisfies Record<string, readonly AdminRol[]>;

export type Permiso = keyof typeof PERMISOS;

/** Qué puede hacer un rol, para que la interfaz no ofrezca lo que va a fallar. */
export function permisosDe(rol: AdminRol): Record<Permiso, boolean> {
  return Object.fromEntries(
    (Object.keys(PERMISOS) as Permiso[]).map((p) => [p, (PERMISOS[p] as readonly AdminRol[]).includes(rol)])
  ) as Record<Permiso, boolean>;
}

/**
 * Exige un rol de administración que tenga el permiso indicado.
 *
 * 401 sin sesión, 403 si la cuenta no es admin, está desactivada o su rol no
 * alcanza. No se distingue "no eres admin" de "tu rol no llega": a quien no
 * tiene acceso no le hace falta saber qué hay detrás.
 */
export const requirePermiso =
  (permiso: Permiso) => async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

      const usuario = await AppDataSource.getRepository(Usuario).findOne({
        where: { id: req.userId },
        select: ['id', 'admin_rol', 'activo'],
      });

      const rol = usuario?.admin_rol ?? null;
      const permitidos = PERMISOS[permiso] as readonly AdminRol[];
      if (!usuario || !usuario.activo || !rol || !permitidos.includes(rol)) {
        return res.status(403).json({ error: 'Acceso denegado: tu rol de administración no permite esta acción' });
      }

      req.adminRol = rol;
      next();
    } catch (error) {
      logger.error('requirePermiso middleware error:', error);
      res.status(500).json({ error: 'Error interno' });
    }
  };

/** Cualquier rol de administración. Es el antiguo `requireAdmin`. */
export const requireAdmin = requirePermiso('verPanel');
