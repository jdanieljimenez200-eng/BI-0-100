import { FindOptionsWhere } from 'typeorm';
import { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Usuario, Plan } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { HerramientaSeleccionada } from '../models/HerramientaSeleccionada';
import { AsignacionTrabajador } from '../models/AsignacionTrabajador';
import {
  canAddMovimiento,
  getMaxMovimientosHerramienta,
  canAddProducto as planCanAddProducto,
  planHasFeature,
  planIncluyeHerramienta,
  planPermiteSeleccion,
  getMaxHerramientas,
  PlanFeature,
  CapabilityKey,
  AccionSensible,
  computePermisosEfectivos,
} from '../services/billing/planService';
import { AuthRequest } from './auth';
import { redisClient } from '../config/redis';
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

// ─── Memo por petición ───────────────────────────────────────────────────────
//
// Una petición de herramienta pasa por dos o tres middlewares de gating y cada
// uno volvía a cargar el usuario, el dueño y la selección de herramientas: de 4
// a 11 consultas antes de llegar a la lógica. Ahora cada dato se carga una vez
// por petición. El plan y los permisos del trabajador se leen SIEMPRE frescos
// (un cambio de plan o una revocación de acceso deben notarse ya); solo la
// selección de herramientas se cachea en Redis, y se invalida al cambiarla o
// al cambiar el plan (`invalidatePlanCache`).

type ReqConMemo = AuthRequest & { _memoGating?: Map<string, Promise<unknown>> };

function memo<T>(req: AuthRequest, clave: string, fn: () => Promise<T>): Promise<T> {
  const r = req as ReqConMemo;
  if (!r._memoGating) r._memoGating = new Map();
  if (!r._memoGating.has(clave)) r._memoGating.set(clave, fn());
  return r._memoGating.get(clave) as Promise<T>;
}

const cargarUsuario = (req: AuthRequest, id: string) =>
  memo(req, `u:${id}`, () => AppDataSource.getRepository(Usuario).findOne({ where: { id } }));

const cargarPermisosTrabajador = (req: AuthRequest, trabajadorId: string, cuentaId: string) =>
  memo(req, `p:${trabajadorId}:${cuentaId}`, async () => {
    const asignaciones = await AppDataSource.getRepository(AsignacionTrabajador).find({
      select: ['permisos'],
      where: { trabajador_id: trabajadorId, cuenta_id: cuentaId, activo: true },
    });
    return computePermisosEfectivos('trabajador', asignaciones.map((a) => a.permisos));
  });

/**
 * ¿Puede quien hace la petición ejecutar una acción sensible (cancelar una
 * venta, cobrar fuera del catálogo)?
 *
 * El dueño siempre puede. Un trabajador necesita el permiso explícito en alguna
 * de sus asignaciones activas de esta cuenta; se lee fresco (una revocación
 * debe notarse ya) y memorizado por petición. Llámala DESPUÉS del gating de la
 * herramienta: para entonces `req.userId` ya es la cuenta y `trabajadorRealId`
 * la persona real.
 */
export async function permiteAccion(req: AuthRequest, accion: AccionSensible): Promise<boolean> {
  const trabajadorId = req.trabajadorRealId;
  if (!trabajadorId) return true; // dueño
  const cuentaId = req.cuentaEfectivaId ?? req.userId!;
  const permisos = await memo(req, `acc:${trabajadorId}:${cuentaId}`, async () => {
    const asignaciones = await AppDataSource.getRepository(AsignacionTrabajador).find({
      select: ['permisos'],
      where: { trabajador_id: trabajadorId, cuenta_id: cuentaId, activo: true },
    });
    return asignaciones.map((a) => a.permisos ?? {});
  });
  return permisos.some((p) => p[accion] === true);
}

async function getUsuarioOr401(
  req: AuthRequest,
  res: Response
): Promise<Usuario | null> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const usuario = await cargarUsuario(req, req.userId);
  if (!usuario) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  return usuario;
}

const TTL_SELECCION_S = 60;
const claveSeleccion = (cuentaId: string) => `herr_sel:${cuentaId}`;

/**
 * Herramientas elegidas que cuentan (las primeras N, N = tope del plan). Si la
 * cuenta bajó de plan, las que sobran quedan guardadas pero sin acceso.
 * Cacheado 60 s por cuenta y plan; `invalidatePlanCache` lo borra.
 */
async function herramientasVigentes(cuentaId: string, plan: Plan): Promise<string[]> {
  const cache = redisClient?.isReady ? redisClient : null;
  if (cache) {
    try {
      const guardado = await cache.get(claveSeleccion(cuentaId));
      if (guardado) {
        const { plan: planGuardado, lista } = JSON.parse(guardado) as { plan: string; lista: string[] };
        if (planGuardado === plan) return lista;
      }
    } catch {
      /* sin caché: se lee de la base */
    }
  }
  const filas = await AppDataSource.getRepository(HerramientaSeleccionada).find({
    select: ['herramienta_key'],
    where: { usuario_id: cuentaId },
    order: { created_at: 'ASC' },
    take: getMaxHerramientas(plan),
  });
  const lista = filas.map((h) => h.herramienta_key);
  if (cache) {
    await cache.set(claveSeleccion(cuentaId), JSON.stringify({ plan, lista }), { EX: TTL_SELECCION_S }).catch(() => undefined);
  }
  return lista;
}

/** Verifica si el usuario tiene acceso a la herramienta (por plan de fábrica o por selección) */
export async function usuarioTieneHerramienta(usuario: Usuario, herramientaName: string, req?: AuthRequest): Promise<boolean> {
  if (planIncluyeHerramienta(usuario.plan, herramientaName)) {
    return true;
  }
  if (planPermiteSeleccion(usuario.plan)) {
    const cuentaId = usuario.account_role === 'trabajador' && usuario.owner_id
      ? usuario.owner_id
      : usuario.id;
    const vigentes = req
      ? await memo(req, `s:${cuentaId}:${usuario.plan}`, () => herramientasVigentes(cuentaId, usuario.plan))
      : await herramientasVigentes(cuentaId, usuario.plan);
    return vigentes.includes(herramientaName);
  }
  return false;
}

/**
 * Resuelve quién opera y sobre qué cuenta, y comprueba acceso y permiso.
 * Devuelve la cuenta (dueño) con su plan, o `null` si ya respondió con error.
 */
async function resolverAcceso(
  req: AuthRequest,
  res: Response,
  herramientaName: string
): Promise<Usuario | null> {
  const usuario = await getUsuarioOr401(req, res);
  if (!usuario) return null;

  if (usuario.account_role === 'trabajador' && usuario.owner_id) {
    req.trabajadorRealId = usuario.id;
    req.cuentaEfectivaId = usuario.owner_id;
    req.userId = usuario.owner_id;

    const owner = await cargarUsuario(req, usuario.owner_id);
    if (!owner) {
      res.status(404).json({ error: 'Cuenta principal de la organización no encontrada' });
      return null;
    }
    if (!(await usuarioTieneHerramienta(owner, herramientaName, req))) {
      res.status(403).json({
        error: `La herramienta '${herramientaName}' no está incluida en el plan de la organización`,
        plan: owner.plan,
      });
      return null;
    }
    const permisos = await cargarPermisosTrabajador(req, usuario.id, usuario.owner_id);
    if (permisos[herramientaName as CapabilityKey] !== true) {
      res.status(403).json({
        error: `No tienes permisos para acceder a la herramienta '${herramientaName}'`,
        capability: herramientaName,
      });
      return null;
    }
    return owner;
  }

  // Si un middleware anterior de la cadena ya resolvió a un trabajador,
  // `req.userId` apunta ahora al dueño: no se borra quién es la persona real.
  if (req.cuentaEfectivaId !== usuario.id) req.trabajadorRealId = undefined;
  req.cuentaEfectivaId = usuario.id;

  if (!(await usuarioTieneHerramienta(usuario, herramientaName, req))) {
    res.status(403).json({
      error: `La herramienta '${herramientaName}' no está incluida en tu plan`,
      plan: usuario.plan,
    });
    return null;
  }
  return usuario;
}

/** La herramienta está incluida en el plan del usuario o fue seleccionada */
export function requireToolCapability(herramientaName: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (await resolverAcceso(req, res, herramientaName)) next();
    } catch (err) {
      logger.error('requireToolCapability error:', err);
      res.status(500).json({ error: 'Error validating tool access' });
    }
  };
}

/**
 * Acceso a un módulo de análisis (mercado, marketing, ventas, brief, finanzas,
 * legal) para quien hace la petición.
 *
 * Los módulos no dependen del plan como las herramientas (su cupo lo controla
 * `requireCanRunAnalisis`), pero un trabajador opera sobre la cuenta del dueño y
 * necesita el permiso del módulo, igual que en `resolverAcceso`. Antes las rutas
 * de los módulos solo llevaban `authenticate`: para un trabajador `req.userId` era
 * su propio id, no encontraba ningún producto ni análisis de la cuenta y todo
 * respondía 404, aunque el menú le mostrara el módulo.
 *
 * Para el dueño no cambia nada. Va SIEMPRE después de `authenticate` (que fija
 * `req.userId` desde el token y desharía el cambio de cuenta si corriera detrás).
 */
export function requireModuloAcceso(modulo: CapabilityKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const usuario = await getUsuarioOr401(req, res);
      if (!usuario) return;
      if (usuario.account_role === 'trabajador' && usuario.owner_id) {
        const permisos = await cargarPermisosTrabajador(req, usuario.id, usuario.owner_id);
        if (permisos[modulo] !== true) {
          res.status(403).json({ error: `No tienes permisos para el módulo '${modulo}'`, capability: modulo });
          return;
        }
        // Si la petición nombra un producto, tiene que ser uno de los asignados:
        // la lista de productos del trabajador ya solo muestra esos.
        const productoId = req.params?.productoId ?? req.body?.productoId ?? req.body?.producto_id ?? req.query?.producto_id;
        if (typeof productoId === 'string' && productoId) {
          const asignados = await memo(req, `pa:${usuario.id}:${usuario.owner_id}`, async () =>
            (await AppDataSource.getRepository(AsignacionTrabajador).find({
              select: ['producto_id'],
              where: { trabajador_id: usuario.id, cuenta_id: usuario.owner_id!, activo: true },
            })).map((a) => a.producto_id)
          );
          if (!asignados.includes(productoId)) {
            res.status(404).json({ error: 'Producto no encontrado' });
            return;
          }
        }
        req.trabajadorRealId = usuario.id;
        req.cuentaEfectivaId = usuario.owner_id;
        req.userId = usuario.owner_id;
      } else {
        req.cuentaEfectivaId = usuario.id;
      }
      next();
    } catch (err) {
      logger.error('requireModuloAcceso error:', err);
      res.status(500).json({ error: 'Error validando el acceso al módulo' });
    }
  };
}

/**
 * Ids de los productos de la cuenta que un trabajador tiene asignados (activos),
 * o `null` si quien pregunta es el dueño (ve todos los suyos).
 */
export async function productosAsignados(usuarioId: string): Promise<{ cuentaId: string; ids: string[] | null }> {
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    select: ['id', 'account_role', 'owner_id'],
    where: { id: usuarioId },
  });
  if (!usuario || usuario.account_role !== 'trabajador' || !usuario.owner_id) {
    return { cuentaId: usuarioId, ids: null };
  }
  const asignaciones = await AppDataSource.getRepository(AsignacionTrabajador).find({
    select: ['producto_id'],
    where: { trabajador_id: usuario.id, cuenta_id: usuario.owner_id, activo: true },
  });
  return { cuentaId: usuario.owner_id, ids: asignaciones.map((a) => a.producto_id).filter(Boolean) as string[] };
}

const movimientosIlimitados = (plan: Plan) => getMaxMovimientosHerramienta(plan) === -1;

/**
 * Serializa las altas de una cuenta gratuita en una herramienta mientras dura la
 * petición: el tope se comprueba contando y el alta ocurre después, así que dos
 * altas simultáneas podían pasar las dos (medido: 3 creados con tope 2). Sin
 * Redis no hay candado (falla abierto: el tope es comercial, no de seguridad).
 */
async function tomarCandadoTope(req: AuthRequest, res: Response, cuentaId: string, herramienta: string): Promise<void> {
  const cache = redisClient?.isReady ? redisClient : null;
  if (!cache) return;
  const clave = `tope:${cuentaId}:${herramienta}`;
  const valor = `${process.pid}:${Math.random()}`;
  const limite = Date.now() + 5000;
  while (Date.now() < limite) {
    const ok = await cache.set(clave, valor, { NX: true, PX: 15000 }).catch(() => 'OK');
    if (ok === 'OK') {
      let liberado = false;
      const liberar = () => {
        if (liberado) return;
        liberado = true;
        void cache
          .eval(`if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`, {
            keys: [clave],
            arguments: [valor],
          })
          .catch(() => undefined);
      };
      res.once('finish', liberar);
      res.once('close', liberar);
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
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
      const cuenta = await resolverAcceso(req, res, herramientaName);
      if (!cuenta) return;

      // Planes ilimitados: sin contar. El COUNT recorre todo el historial de la
      // herramienta y corría en cada alta de cualquier plan.
      if (getCount && !movimientosIlimitados(cuenta.plan)) {
        await tomarCandadoTope(req, res, cuenta.id, herramientaName);
        const current = await getCount(cuenta.id);
        if (!canAddMovimiento(cuenta.plan, current)) {
          return res.status(429).json({
            error: req.trabajadorRealId ? 'Límite de movimientos del plan alcanzado' : 'Límite de movimientos de tu plan alcanzado',
            upgrade_required: true,
            plan: cuenta.plan,
            mensaje: 'Actualiza a un plan de pago para movimientos ilimitados.',
          });
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
 * Invalida lo cacheado del gating de una cuenta (la selección de herramientas
 * vigente). Llamar tras cambios de plan (billing, admin) o de selección.
 */
export async function invalidatePlanCache(userId: string): Promise<void> {
  if (!redisClient?.isReady) return;
  await redisClient.del(claveSeleccion(userId)).catch(() => undefined);
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
