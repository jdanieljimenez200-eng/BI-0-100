import { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Usuario, type AdminRol } from '../models/Usuario';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';
import {
  tokenAdminValido,
  verificarCodigo,
  descifrarSecreto,
  VerificacionNoDisponible,
  DemasiadosIntentos,
} from '../services/admin/totp';

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
 * | Enviar a papelera / restaurar cuentas         |    –    |     –     |     ✓      |
 * | Editar, probar y publicar prompts de IA       |    –    |     –     |     ✓      |
 *
 * Tres capas, en este orden:
 *
 *  1. **Rol**, leído de la base en cada petición: quitárselo a alguien tiene
 *     efecto en su siguiente clic, no cuando caduque su sesión.
 *  2. **Token de admin** (cabecera `X-Admin-Token`), que solo se obtiene con un
 *     código de la app de autenticación. La sesión normal no basta.
 *  3. **Código fresco** (cabecera `X-Admin-Totp`) en las acciones irreversibles,
 *     aunque el token de admin siga vigente.
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
  gestionarPapelera: ['superadmin'],
  // Gasto de IA por cuenta: dato de negocio y de clientes, solo superadmin.
  verCostos: ['superadmin'],
  // Los prompts deciden lo que la IA dice a todos los clientes: solo superadmin.
  gestionarPrompts: ['superadmin'],
} as const satisfies Record<string, readonly AdminRol[]>;

export type Permiso = keyof typeof PERMISOS;

/** Qué puede hacer un rol, para que la interfaz no ofrezca lo que va a fallar. */
export function permisosDe(rol: AdminRol): Record<Permiso, boolean> {
  return Object.fromEntries(
    (Object.keys(PERMISOS) as Permiso[]).map((p) => [p, (PERMISOS[p] as readonly AdminRol[]).includes(rol)])
  ) as Record<Permiso, boolean>;
}

/** Rol de la cuenta si está activa y le alcanza para el permiso; si no, `null`. */
async function rolPermitido(userId: string, permiso: Permiso): Promise<AdminRol | null> {
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    where: { id: userId },
    select: ['id', 'admin_rol', 'activo'],
  });
  const rol = usuario?.admin_rol ?? null;
  if (!usuario || !usuario.activo || !rol) return null;
  return (PERMISOS[permiso] as readonly AdminRol[]).includes(rol) ? rol : null;
}

const DENEGADO = { error: 'Acceso denegado: tu rol de administración no permite esta acción' };

/**
 * Solo el rol, SIN exigir el token de admin.
 *
 * Existe para una única cosa: las rutas de `/api/admin/sesion`, que son las que
 * precisamente emiten ese token. En cualquier otro sitio se usa `requirePermiso`.
 */
export const requireRolSinMfa =
  (permiso: Permiso = 'verPanel') => async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
      const rol = await rolPermitido(req.userId, permiso);
      if (!rol) return res.status(403).json(DENEGADO);
      req.adminRol = rol;
      next();
    } catch (error) {
      logger.error('requireRolSinMfa error:', error);
      res.status(500).json({ error: 'Error interno' });
    }
  };

/**
 * Rol con el permiso + token de admin válido del mismo usuario.
 *
 * Sin token responde 403 con `codigo: 'ADMIN_MFA_REQUERIDO'`, para que la
 * interfaz pida el código en vez de mostrar un error genérico.
 */
export const requirePermiso =
  (permiso: Permiso) => async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

      const rol = await rolPermitido(req.userId, permiso);
      if (!rol) return res.status(403).json(DENEGADO);

      const token = req.get('x-admin-token') ?? undefined;
      if (!(await tokenAdminValido(token, req.userId))) {
        return res.status(403).json({
          error: 'Verifica tu identidad con el código de tu app de autenticación para entrar al panel',
          codigo: 'ADMIN_MFA_REQUERIDO',
        });
      }

      req.adminRol = rol;
      next();
    } catch (error) {
      if (error instanceof VerificacionNoDisponible) {
        return res.status(503).json({ error: 'El panel de administración no está disponible ahora mismo' });
      }
      logger.error('requirePermiso error:', error);
      res.status(500).json({ error: 'Error interno' });
    }
  };

/** Cualquier rol de administración, con token de admin. */
export const requireAdmin = requirePermiso('verPanel');

/**
 * Exige un código TOTP recién generado en la propia petición (`X-Admin-Totp`).
 *
 * Para lo irreversible o lo que da poder: una sesión de admin abierta hace 25
 * minutos en un portátil desbloqueado no debe bastar para dar un rol de
 * superadmin o enviar una cuenta a la papelera.
 *
 * Es una función y no un middleware a propósito: se llama DENTRO del handler,
 * después de validar la petición. Un código solo vale una vez, así que gastarlo
 * en una petición que iba a fallar igualmente (datos inválidos, actuar sobre uno
 * mismo) obligaría a esperar al siguiente código para nada.
 *
 * Si devuelve `false`, ya ha enviado la respuesta de error.
 */
export async function exigirTotpFresco(req: AdminRequest, res: Response): Promise<boolean> {
  try {
    const codigo = req.get('x-admin-totp');
    if (!codigo) {
      res.status(401).json({
        error: 'Esta acción necesita un código nuevo de tu app de autenticación',
        codigo: 'TOTP_REQUERIDO',
      });
      return false;
    }

    const usuario = await AppDataSource.getRepository(Usuario)
      .createQueryBuilder('u')
      .addSelect('u.admin_totp_secreto')
      .where('u.id = :id', { id: req.userId })
      .getOne();
    if (!usuario?.admin_totp_secreto || !usuario.admin_totp_activado_en) {
      res.status(403).json({ error: 'No tienes la verificación en dos pasos activa', codigo: 'ADMIN_MFA_REQUERIDO' });
      return false;
    }

    const ok = await verificarCodigo(req.userId!, descifrarSecreto(usuario.admin_totp_secreto), codigo);
    if (!ok) {
      res.status(401).json({ error: 'Código incorrecto o ya usado', codigo: 'TOTP_REQUERIDO' });
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof DemasiadosIntentos) {
      res.status(429).json({ error: `Demasiados intentos. Vuelve a probar en ${Math.ceil(error.segundos / 60)} min` });
      return false;
    }
    if (error instanceof VerificacionNoDisponible) {
      res.status(503).json({ error: 'El panel de administración no está disponible ahora mismo' });
      return false;
    }
    throw error;
  }
}
