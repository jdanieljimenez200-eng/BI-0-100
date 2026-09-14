import { FindOptionsWhere } from 'typeorm';
import { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Usuario, Plan } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { HerramientaSeleccionada } from '../models/HerramientaSeleccionada';
import { AsignacionTrabajador } from '../models/AsignacionTrabajador';
import {
  canAddMovimiento,
  canAddProducto as planCanAddProducto,
  planHasFeature,
  planIncluyeHerramienta,
  planPermiteSeleccion,
  getMaxHerramientas,
  PlanFeature,
  CapabilityKey,
  computePermisosEfectivos,
} from '../services/billing/planService';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

/**
 * Middleware factory para validar si usuario puede ejecutar análisis
 * Verifica plan limits basado en producto/módulo
 */
export function requireCanRunAnalisis(
  getCountFn: (usuarioId: string, productoId?: string) => Promise<number>
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const usuarioId = req.userId;
      const productoId = req.params.productoId || req.body.producto_id;

      if (!usuarioId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const usuarioRepo = AppDataSource.getRepository(Usuario);
      const usuario = await usuarioRepo.findOne({
        where: { id: usuarioId } as FindOptionsWhere<Usuario>,
      });

      if (!usuario) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Plan limits: freemium=1 por producto, resto = ilimitado (-1)
      const PLAN_LIMITES: Record<Plan | string, number> = {
        free: 1,
        freemium: 1,
        pro: -1,
        pro_plus: -1,
        business: -1,
        enterprise: -1,
      };

      const limite = PLAN_LIMITES[usuario.plan] ?? 1;

      // Si limite es -1 (ilimitado), permitir
      if (limite === -1) {
        return next();
      }

      // Contar usos actuales
      const currentCount = await getCountFn(usuarioId, productoId);

      if (currentCount >= limite) {
        return res.status(429).json({
          error: 'Plan limit reached',
          upgrade_required: true,
          plan: usuario.plan,
          limit: limite,
          current: currentCount,
          mensaje:
            'Alcanzaste el límite de tu plan para este módulo. Actualiza a Pro para análisis ilimitados.',
        });
      }

      next();
    } catch (err) {
      logger.error('requireCanRunAnalisis error:', err);
      res.status(500).json({ error: 'Error validating plan limits' });
    }
  };
}

/**
 * Obtener plan del usuario desde DB
 */
export async function getPlanFromDB(usuarioId: string): Promise<string> {
  const usuarioRepo = AppDataSource.getRepository(Usuario);
  const usuario = await usuarioRepo.findOne({
    where: { id: usuarioId } as FindOptionsWhere<Usuario>,
  });

  return usuario?.plan || 'freemium';
}

/**
 * Resolver cuenta efectiva para análisis
 */
export function resolveCuentaEfectiva(req: AuthRequest): string {
  return req.userId || '';
}

/**
 * Requerir Pro Plus
 */
export function requireProPlus() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const usuarioId = req.userId;
      if (!usuarioId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const usuarioRepo = AppDataSource.getRepository(Usuario);
      const usuario = await usuarioRepo.findOne({
        where: { id: usuarioId } as FindOptionsWhere<Usuario>,
      });

      if (!usuario) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (usuario.plan !== 'pro_plus' && usuario.plan !== 'business' && usuario.plan !== 'enterprise') {
        return res.status(403).json({
          error: 'This feature requires Pro+ plan or higher',
          currentPlan: usuario.plan,
        });
      }

      next();
    } catch (err) {
      logger.error('requireProPlus error:', err);
      res.status(500).json({ error: 'Error validating plan' });
    }
  };
}

async function getUsuarioOr401(
  req: AuthRequest,
  res: Response
): Promise<Usuario | null> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    where: { id: req.userId },
  });
  if (!usuario) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  return usuario;
}

/** Verifica si el usuario tiene acceso a la herramienta (por plan de fábrica o por selección) */
export async function usuarioTieneHerramienta(usuario: Usuario, herramientaName: string): Promise<boolean> {
  if (planIncluyeHerramienta(usuario.plan, herramientaName)) {
    return true;
  }
  if (planPermiteSeleccion(usuario.plan)) {
    const cuentaId = usuario.account_role === 'trabajador' && usuario.owner_id
      ? usuario.owner_id
      : usuario.id;
    // Solo cuentan las primeras N elegidas (N = tope del plan). Si la cuenta bajó
    // de plan (p. ej. de Negocio con 4 a Emprendedor con 1), las que sobran quedan
    // guardadas pero sin acceso hasta que deseleccione o vuelva a subir.
    const vigentes = await AppDataSource.getRepository(HerramientaSeleccionada).find({
      select: ['herramienta_key'],
      where: { usuario_id: cuentaId },
      order: { created_at: 'ASC' },
      take: getMaxHerramientas(usuario.plan),
    });
    return vigentes.some((h) => h.herramienta_key === herramientaName);
  }
  return false;
}

/** La herramienta está incluida en el plan del usuario o fue seleccionada */
export function requireToolCapability(herramientaName: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const usuario = await getUsuarioOr401(req, res);
      if (!usuario) return;

      if (usuario.account_role === 'trabajador' && usuario.owner_id) {
        req.trabajadorRealId = usuario.id;
        req.cuentaEfectivaId = usuario.owner_id;
        req.userId = usuario.owner_id;

        const owner = await AppDataSource.getRepository(Usuario).findOne({
          where: { id: usuario.owner_id },
        });

        if (!owner) {
          return res.status(404).json({ error: 'Cuenta principal de la organización no encontrada' });
        }

        const tieneAccesoOwner = await usuarioTieneHerramienta(owner, herramientaName);
        if (!tieneAccesoOwner) {
          return res.status(403).json({
            error: `La herramienta '${herramientaName}' no está incluida en el plan de la organización`,
            plan: owner.plan,
          });
        }

        const asignaciones = await AppDataSource.getRepository(AsignacionTrabajador).find({
          select: ['permisos'],
          where: { trabajador_id: usuario.id, cuenta_id: usuario.owner_id, activo: true },
        });
        const permisos = computePermisosEfectivos('trabajador', asignaciones.map((a) => a.permisos));
        const tienePermiso = permisos[herramientaName as CapabilityKey] === true;
        if (!tienePermiso) {
          return res.status(403).json({
            error: `No tienes permisos para acceder a la herramienta '${herramientaName}'`,
            capability: herramientaName,
          });
        }
      } else {
        // Si un middleware anterior de la cadena ya resolvió a un trabajador,
        // `req.userId` apunta ahora al dueño: no se borra quién es la persona real.
        if (req.cuentaEfectivaId !== usuario.id) req.trabajadorRealId = undefined;
        req.cuentaEfectivaId = usuario.id;

        const tieneAcceso = await usuarioTieneHerramienta(usuario, herramientaName);
        if (!tieneAcceso) {
          return res.status(403).json({
            error: `La herramienta '${herramientaName}' no está incluida en tu plan`,
            plan: usuario.plan,
          });
        }
      }
      next();
    } catch (err) {
      logger.error('requireToolCapability error:', err);
      res.status(500).json({ error: 'Error validating tool access' });
    }
  };
}

/**
 * Acceso a herramienta con tope de movimientos (freemium).
 * getCount debe devolver los registros actuales de ESA herramienta.
 */
export function requireHerramientaAccess(
  herramientaName: string,
  getCount?: (cuentaId: string) => Promise<number>
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const usuario = await getUsuarioOr401(req, res);
      if (!usuario) return;

      if (usuario.account_role === 'trabajador' && usuario.owner_id) {
        req.trabajadorRealId = usuario.id;
        req.cuentaEfectivaId = usuario.owner_id;
        req.userId = usuario.owner_id;

        const owner = await AppDataSource.getRepository(Usuario).findOne({
          where: { id: usuario.owner_id },
        });

        if (!owner) {
          return res.status(404).json({ error: 'Cuenta principal de la organización no encontrada' });
        }

        const tieneAccesoOwner = await usuarioTieneHerramienta(owner, herramientaName);
        if (!tieneAccesoOwner) {
          return res.status(403).json({
            error: `La herramienta '${herramientaName}' no está incluida en el plan de la organización`,
            plan: owner.plan,
          });
        }

        const asignaciones = await AppDataSource.getRepository(AsignacionTrabajador).find({
          select: ['permisos'],
          where: { trabajador_id: usuario.id, cuenta_id: usuario.owner_id, activo: true },
        });
        const permisos = computePermisosEfectivos('trabajador', asignaciones.map((a) => a.permisos));
        const tienePermiso = permisos[herramientaName as CapabilityKey] === true;
        if (!tienePermiso) {
          return res.status(403).json({
            error: `No tienes permisos para acceder a la herramienta '${herramientaName}'`,
            capability: herramientaName,
          });
        }

        if (getCount) {
          const current = await getCount(usuario.owner_id);
          if (!canAddMovimiento(owner.plan, current)) {
            return res.status(429).json({
              error: 'Límite de movimientos del plan alcanzado',
              upgrade_required: true,
              plan: owner.plan,
              mensaje: 'Actualiza a un plan de pago para movimientos ilimitados.',
            });
          }
        }
      } else {
        // Si un middleware anterior de la cadena ya resolvió a un trabajador,
        // `req.userId` apunta ahora al dueño: no se borra quién es la persona real.
        if (req.cuentaEfectivaId !== usuario.id) req.trabajadorRealId = undefined;
        req.cuentaEfectivaId = usuario.id;

        const tieneAcceso = await usuarioTieneHerramienta(usuario, herramientaName);
        if (!tieneAcceso) {
          return res.status(403).json({
            error: `La herramienta '${herramientaName}' no está incluida en tu plan`,
            plan: usuario.plan,
          });
        }

        if (getCount) {
          const current = await getCount(usuario.id);
          if (!canAddMovimiento(usuario.plan, current)) {
            return res.status(429).json({
              error: 'Límite de movimientos de tu plan alcanzado',
              upgrade_required: true,
              plan: usuario.plan,
              mensaje: 'Actualiza a un plan de pago para movimientos ilimitados.',
            });
          }
        }
      }
      next();
    } catch (err) {
      logger.error('requireHerramientaAccess error:', err);
      res.status(500).json({ error: 'Error validating herramienta access' });
    }
  };
}

/** Feature booleana del plan (csv_import, centro_mando, etc.) */
export function requirePlanFeature(featureName: PlanFeature, featureDesc: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const usuario = await getUsuarioOr401(req, res);
      if (!usuario) return;

      // Un trabajador usa lo que contrató la cuenta, no el plan de su propio usuario.
      let plan = usuario.plan;
      if (usuario.account_role === 'trabajador' && usuario.owner_id) {
        const owner = await AppDataSource.getRepository(Usuario).findOne({ where: { id: usuario.owner_id }, select: ['id', 'plan'] });
        plan = owner?.plan ?? plan;
      }

      if (!planHasFeature(plan, featureName)) {
        return res.status(403).json({
          error: `${featureDesc} requiere un plan superior`,
          feature: featureName,
          plan,
          plan_actual: plan,
          // El frontend lo trata como oferta de mejora, no como error del formulario.
          upgrade_required: true,
        });
      }
      next();
    } catch (err) {
      logger.error('requirePlanFeature error:', err);
      res.status(500).json({ error: 'Error validating plan feature' });
    }
  };
}

/**
 * Cache de plan por usuario. Hoy la lectura de plan va directo a BD en cada
 * middleware; si se introduce caché Redis, invalidar aquí tras cambios de plan.
 */
export async function invalidatePlanCache(_userId: string): Promise<void> {
  /* no-op intencional hasta introducir caché */
}

/** Tope de productos activos según plan */
export function requireCanAddProducto() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const usuario = await getUsuarioOr401(req, res);
      if (!usuario) return;

      const count = await AppDataSource.getRepository(Producto).count({
        where: { usuario_id: usuario.id } as FindOptionsWhere<Producto>,
      });

      if (!planCanAddProducto(usuario.plan, count)) {
        return res.status(429).json({
          error: 'Límite de productos de tu plan alcanzado',
          upgrade_required: true,
          plan: usuario.plan,
          current: count,
        });
      }
      next();
    } catch (err) {
      logger.error('requireCanAddProducto error:', err);
      res.status(500).json({ error: 'Error validating product limit' });
    }
  };
}

export async function resolveCuentaPorAnalisis(analisisId: string): Promise<string | null> {
  // Reservado para analítica multi-cuenta; hoy el scope es siempre owner directo.
  void analisisId;
  return null;
}
