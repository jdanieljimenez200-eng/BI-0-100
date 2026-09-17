import { Router, Request, Response } from 'express';
import { exigirUuid } from '../middleware/validate';
import { body, query, validationResult } from 'express-validator';
import { AppDataSource } from '../config/database';
import { Usuario, Plan, type AdminRol } from '../models/Usuario';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  requireAdmin,
  requirePermiso,
  exigirTotpFresco,
  permisosDe,
  type AdminRequest,
} from '../middleware/requireAdmin';
import { logger } from '../utils/logger';
import { PLAN_LIMITES } from '../services/billing/planService';
import { bloquearSesiones, levantarBloqueo } from '../services/auth/bloqueoSesion';
import { invalidatePlanCache } from '../middleware/requirePlan';
import { AuditoriaAdmin } from '../models/AuditoriaAdmin';
import * as papelera from '../services/admin/papelera';
import { cancelarSuscripcion } from '../services/billing/stripeService';
import { registrarAccionAdmin, MotivoSchema } from '../services/admin/auditoria';

const router = Router();
exigirUuid(router, 'id');

// Todos los endpoints requieren auth + admin
router.use(authenticate as (req: Request, res: Response, next: () => void) => void);
router.use(requireAdmin as (req: Request, res: Response, next: () => void) => void);

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────

router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsuarios,
      usuariosHoy,
      planDist,
      totalProductos,
      analisisCounts,
      signups7d,
      recientes,
      conversionData,
    ] = await Promise.all([
      AppDataSource.query(`SELECT COUNT(*) AS total FROM usuarios`),
      AppDataSource.query(`SELECT COUNT(*) AS total FROM usuarios WHERE fecha_creacion >= NOW() - INTERVAL '1 day'`),
      AppDataSource.query(`SELECT plan, COUNT(*) AS total FROM usuarios GROUP BY plan ORDER BY total DESC`),
      AppDataSource.query(`SELECT COUNT(*) AS total FROM productos WHERE status = 'activo'`),
      AppDataSource.query(`
        SELECT 'mercado' AS modulo, COUNT(*) AS total FROM analisis_mercado
        UNION ALL SELECT 'marketing', COUNT(*) FROM analisis_marketing
        UNION ALL SELECT 'ventas', COUNT(*) FROM analisis_ventas
        UNION ALL SELECT 'finanzas', COUNT(*) FROM analisis_finanzas
        UNION ALL SELECT 'legal', COUNT(*) FROM analisis_legal
      `),
      AppDataSource.query(`
        SELECT DATE(fecha_creacion) AS dia, COUNT(*) AS total
        FROM usuarios
        WHERE fecha_creacion >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(fecha_creacion)
        ORDER BY dia
      `),
      AppDataSource.query(`
        SELECT id, email, nombre, plan, fecha_creacion
        FROM usuarios ORDER BY fecha_creacion DESC LIMIT 8
      `),
      AppDataSource.query(`
        SELECT
          COUNT(*) FILTER (WHERE plan != 'freemium') AS paid,
          COUNT(*) AS total
        FROM usuarios
      `),
    ]);

    const totalAnalisis = analisisCounts.reduce(
      (sum: number, r: { total: string }) => sum + parseInt(r.total), 0
    );
    const convPaid  = parseInt(conversionData[0].paid  ?? '0');
    const convTotal = parseInt(conversionData[0].total ?? '1');

    res.json({
      usuarios: {
        total: parseInt(totalUsuarios[0].total),
        hoy:   parseInt(usuariosHoy[0].total),
        por_plan: planDist.map((r: { plan: string; total: string }) => ({
          plan: r.plan, total: parseInt(r.total),
        })),
      },
      productos:       { total: parseInt(totalProductos[0].total) },
      analisis:        analisisCounts.map((r: { modulo: string; total: string }) => ({ modulo: r.modulo, total: parseInt(r.total) })),
      total_analisis:  totalAnalisis,
      conversion_rate: convTotal > 0 ? Math.round((convPaid / convTotal) * 1000) / 10 : 0,
      signups_7d:      signups7d.map((r: { dia: string; total: string }) => ({ dia: String(r.dia).slice(0, 10), total: parseInt(r.total) })),
      recientes:       recientes.map((r: Record<string, unknown>) => ({ id: r.id, email: r.email, nombre: r.nombre, plan: r.plan, fecha_creacion: r.fecha_creacion })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener stats' });
  }
});

// ─── GET /api/admin/usuarios ──────────────────────────────────────────────────

router.get(
  '/usuarios',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('plan').optional().isIn(['freemium', 'pro', 'pro_plus', 'business', 'enterprise', '']),
    query('search').optional().isString().isLength({ max: 100 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const page = parseInt(String(req.query.page ?? '1'));
    const limit = parseInt(String(req.query.limit ?? '20'));
    const offset = (page - 1) * limit;
    const plan = req.query.plan as string | undefined;
    const search = req.query.search as string | undefined;

    try {
      // Las cuentas en la papelera tienen su propia pestaña.
      const conditions: string[] = ['u.eliminado_en IS NULL'];
      const params: unknown[] = [];

      if (plan) {
        params.push(plan);
        conditions.push(`u.plan = $${params.length}`);
      }
      if (search) {
        const escapedSearch = search.toLowerCase().replace(/[%_\\]/g, '\\$&');
        params.push(`%${escapedSearch}%`);
        conditions.push(`(LOWER(u.email) LIKE $${params.length} ESCAPE '\\' OR LOWER(u.nombre) LIKE $${params.length} ESCAPE '\\')`);
      }

      const where = conditions.join(' AND ');

      const [rows, countRows] = await Promise.all([
        AppDataSource.query(
          `SELECT u.id, u.email, u.nombre, u.plan,
                  CASE WHEN u.es_admin THEN 'admin' ELSE u.account_role END AS role,
                  u.es_admin, u.activo, u.fecha_creacion,
                  COUNT(p.id) AS productos
           FROM usuarios u
           LEFT JOIN productos p ON p.usuario_id = u.id AND p.status = 'activo'
           WHERE ${where}
           GROUP BY u.id
           ORDER BY u.fecha_creacion DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        ),
        AppDataSource.query(
          `SELECT COUNT(*) AS total FROM usuarios u WHERE ${where}`,
          params,
        ),
      ]);

      res.json({
        usuarios: rows.map((r: Record<string, unknown>) => ({
          ...r,
          productos: parseInt(r.productos as string),
        })),
        total: parseInt(countRows[0].total),
        page,
        pages: Math.ceil(parseInt(countRows[0].total) / limit),
      });
    } catch (err) {
      logger.error('GET /api/admin/usuarios error:', err);
      res.status(500).json({ error: 'Error al obtener usuarios' });
    }
  },
);

// ─── PATCH /api/admin/usuarios/:id/plan ───────────────────────────────────────

router.patch(
  '/usuarios/:id/plan',
  requirePermiso('cambiarPlan'),
  [body('plan').isIn(['freemium', 'pro', 'pro_plus', 'business', 'enterprise'])],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const motivo = MotivoSchema.safeParse(req.body?.motivo);
    if (!motivo.success) return res.status(400).json({ error: motivo.error.errors[0].message });

    const { id } = req.params;
    const { plan } = req.body as { plan: Plan };

    try {
      const resultado = await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Usuario);
        const usuario = await repo.findOne({
          where: { id },
          select: ['id', 'plan', 'stripe_subscription_id'],
          lock: { mode: 'pessimistic_write' },
        });
        if (!usuario) return { status: 404, cuerpo: { error: 'Usuario no encontrado' } };

        // Con una suscripción de Stripe viva, el plan lo manda Stripe: el próximo
        // evento del webhook (una renovación, un cambio de tarjeta) reescribe
        // `plan` y el cambio manual desaparece sin avisar a nadie. Mejor decirlo
        // ahora que dejar creer que se aplicó.
        if (usuario.stripe_subscription_id) {
          return {
            status: 409,
            cuerpo: {
              error:
                'Este usuario tiene una suscripción activa en Stripe: el plan se gestiona desde Stripe. Un cambio aquí lo revertiría el siguiente evento de facturación.',
            },
          };
        }

        const anterior = usuario.plan;
        await repo.update(id, { plan });
        await registrarAccionAdmin(manager, req, {
          accion: 'usuario.plan_cambiado',
          recursoTipo: 'usuario',
          recursoId: id,
          antes: { plan: anterior },
          despues: { plan },
          motivo: motivo.data,
        });
        return { status: 200, cuerpo: { message: `Plan actualizado a ${plan}`, plan } };
      });

      if (resultado.status === 200) await invalidatePlanCache(id);
      return res.status(resultado.status).json(resultado.cuerpo);
    } catch (err) {
      logger.error('[admin] error al cambiar plan:', err);
      return res.status(500).json({ error: 'Error al actualizar plan' });
    }
  },
);

// ─── PATCH /api/admin/usuarios/:id/activo ─────────────────────────────────────

router.patch(
  '/usuarios/:id/activo',
  requirePermiso('gestionarActivo'),
  [body('activo').isBoolean()],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;
    const { activo } = req.body as { activo: boolean };

    // Desactivar es destructivo y exige motivo; reactivar lo acepta si viene.
    let motivoTexto: string | null = null;
    if (activo) {
      motivoTexto = typeof req.body?.motivo === 'string' ? req.body.motivo : null;
    } else {
      const motivo = MotivoSchema.safeParse(req.body?.motivo);
      if (!motivo.success) return res.status(400).json({ error: motivo.error.errors[0].message });
      motivoTexto = motivo.data;
    }

    // No permitir que un admin se desactive a sí mismo
    if (id === req.userId) {
      return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });
    }

    try {
      const encontrado = await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Usuario);
        const usuario = await repo.findOne({
          where: { id },
          select: ['id', 'activo'],
          lock: { mode: 'pessimistic_write' },
        });
        if (!usuario) return false;

        await repo.update(id, { activo });
        await registrarAccionAdmin(manager, req, {
          accion: activo ? 'usuario.reactivado' : 'usuario.desactivado',
          recursoTipo: 'usuario',
          recursoId: id,
          antes: { activo: usuario.activo },
          despues: { activo },
          motivo: motivoTexto,
        });
        return true;
      });
      if (!encontrado) return res.status(404).json({ error: 'Usuario no encontrado' });

      // Redis va DESPUÉS del commit: si la transacción se hubiera revertido, no
      // hay que dejar a nadie bloqueado por un cambio que no ocurrió.
      if (activo) {
        await levantarBloqueo(id);
        return res.json({ message: 'Usuario activado' });
      }

      // Desactivar en la base no saca a quien ya está dentro: su access token
      // sigue valiendo hasta caducar. Esto corta las sesiones al momento.
      const sesionesCortadas = await bloquearSesiones(id);
      return res.json({
        message: sesionesCortadas
          ? 'Usuario desactivado y sus sesiones cerradas'
          : 'Usuario desactivado. No se pudieron cerrar sus sesiones abiertas: caducarán solas en 15 minutos.',
        sesiones_cerradas: sesionesCortadas,
      });
    } catch (err) {
      logger.error('[admin] error al cambiar activo:', err);
      return res.status(500).json({ error: 'Error al actualizar usuario' });
    }
  },
);

// ─── GET /api/admin/auditoria ─────────────────────────────────────────────────

/** Consulta del registro de auditoría. Solo lectura: la tabla no admite otra cosa. */
router.get(
  '/auditoria',
  requirePermiso('verAuditoria'),
  [
    query('admin_id').optional().isUUID(),
    query('recurso_id').optional().isString().isLength({ max: 64 }),
    query('accion').optional().isString().isLength({ max: 60 }),
    query('desde').optional().isISO8601(),
    query('hasta').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const POR_PAGINA = 50;
    const page = Number(req.query.page ?? 1);

    try {
      const qb = AppDataSource.getRepository(AuditoriaAdmin)
        .createQueryBuilder('a')
        .orderBy('a.fecha', 'DESC')
        .skip((page - 1) * POR_PAGINA)
        .take(POR_PAGINA);

      if (req.query.admin_id) qb.andWhere('a.admin_id = :adminId', { adminId: req.query.admin_id });
      if (req.query.recurso_id) qb.andWhere('a.recurso_id = :recursoId', { recursoId: req.query.recurso_id });
      // Prefijo: "usuario." trae todas las acciones sobre usuarios. Los comodines
      // que escriba el admin se quitan: el prefijo es literal.
      if (req.query.accion) {
        qb.andWhere('a.accion LIKE :accion', { accion: `${String(req.query.accion).replace(/[%_\\]/g, '')}%` });
      }
      if (req.query.desde) qb.andWhere('a.fecha >= :desde', { desde: req.query.desde });
      if (req.query.hasta) qb.andWhere('a.fecha <= :hasta', { hasta: req.query.hasta });

      const [registros, total] = await qb.getManyAndCount();
      return res.json({ registros, total, page, pages: Math.max(1, Math.ceil(total / POR_PAGINA)) });
    } catch (err) {
      logger.error('[admin] error leyendo auditoría:', err);
      return res.status(500).json({ error: 'Error al leer la auditoría' });
    }
  },
);


// ─── GET /api/admin/costos-ia ─────────────────────────────────────────────────

/**
 * Gasto de IA: por día, módulo, sección, modelo y plan, y las cuentas que más
 * gastan. Sale de `uso_ia`, que registra el costo de cada llamada.
 *
 * Los ingresos del periodo se estiman con el precio mensual de cada plan activo:
 * sirve para vigilar el margen, no sustituye a los informes de Stripe.
 */
router.get(
  '/costos-ia',
  requirePermiso('verCostos'),
  [query('dias').optional().isInt({ min: 1, max: 365 })],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const dias = Number(req.query.dias ?? 30);
    const desde = `NOW() - make_interval(days => $1)`;

    try {
      const q = (sql: string) => AppDataSource.query(sql, [dias]);
      const [totales, porDia, porModulo, porSeccion, porModelo, porPlan, topCuentas] = await Promise.all([
        q(`SELECT COALESCE(SUM(costo_usd), 0)::float AS periodo,
                  COALESCE(SUM(costo_usd) FILTER (WHERE fecha >= date_trunc('day', NOW())), 0)::float AS hoy,
                  COALESCE(SUM(costo_usd) FILTER (WHERE fecha >= date_trunc('month', NOW())), 0)::float AS mes,
                  COUNT(*)::int AS llamadas,
                  COUNT(DISTINCT usuario_id)::int AS cuentas
             FROM uso_ia WHERE fecha >= ${desde}`),
        q(`SELECT to_char(date_trunc('day', fecha), 'YYYY-MM-DD') AS dia, SUM(costo_usd)::float AS costo, COUNT(*)::int AS llamadas
             FROM uso_ia WHERE fecha >= ${desde} GROUP BY 1 ORDER BY 1`),
        q(`SELECT modulo, SUM(costo_usd)::float AS costo, COUNT(*)::int AS llamadas,
                  COUNT(DISTINCT analisis_id)::int AS analisis
             FROM uso_ia WHERE fecha >= ${desde} GROUP BY 1 ORDER BY costo DESC`),
        q(`SELECT seccion, modelo, COUNT(*)::int AS llamadas, AVG(costo_usd)::float AS costo_medio,
                  SUM(costo_usd)::float AS costo, AVG(input_tokens)::int AS input_medio, AVG(output_tokens)::int AS output_medio
             FROM uso_ia WHERE fecha >= ${desde} GROUP BY 1, 2 ORDER BY costo DESC`),
        q(`SELECT modelo, SUM(costo_usd)::float AS costo, SUM(input_tokens)::bigint AS input_tokens,
                  SUM(output_tokens)::bigint AS output_tokens, SUM(cache_read_tokens)::bigint AS cache_read_tokens
             FROM uso_ia WHERE fecha >= ${desde} GROUP BY 1 ORDER BY costo DESC`),
        q(`SELECT COALESCE(u.plan, 'sin cuenta') AS plan, COUNT(DISTINCT i.usuario_id)::int AS cuentas,
                  SUM(i.costo_usd)::float AS costo,
                  (SUM(i.costo_usd) / NULLIF(COUNT(DISTINCT i.usuario_id), 0))::float AS costo_por_cuenta
             FROM uso_ia i LEFT JOIN usuarios u ON u.id = i.usuario_id
            WHERE i.fecha >= ${desde} GROUP BY 1 ORDER BY costo DESC`),
        q(`SELECT i.usuario_id, u.email, u.plan, SUM(i.costo_usd)::float AS costo, COUNT(*)::int AS llamadas
             FROM uso_ia i LEFT JOIN usuarios u ON u.id = i.usuario_id
            WHERE i.fecha >= ${desde} AND i.usuario_id IS NOT NULL
            GROUP BY 1, 2, 3 ORDER BY costo DESC LIMIT 20`),
      ]);

      const precioPlan = (plan: string) => (plan in PLAN_LIMITES ? PLAN_LIMITES[plan as Plan].precio_usd_mensual : 0);
      const por_plan = (porPlan as { plan: string; cuentas: number; costo: number; costo_por_cuenta: number }[]).map((p) => {
        const ingreso = precioPlan(p.plan) * p.cuentas * (dias / 30);
        return { ...p, ingreso_estimado: ingreso, margen_pct: ingreso > 0 ? Math.round(((ingreso - p.costo) / ingreso) * 1000) / 10 : null };
      });

      return res.json({
        dias,
        totales: totales[0],
        por_dia: porDia,
        por_modulo: porModulo,
        por_seccion: porSeccion,
        por_modelo: porModelo,
        por_plan,
        top_cuentas: topCuentas,
      });
    } catch (err) {
      logger.error('[admin] error leyendo costos de IA:', err);
      return res.status(500).json({ error: 'Error al leer los costos de IA' });
    }
  },
);

// ─── GET /api/admin/yo ────────────────────────────────────────────────────────

/**
 * Rol y permisos de quien está usando el panel.
 *
 * La interfaz lo usa para no ofrecer lo que va a fallar. No sustituye a la
 * comprobación de cada endpoint: esconder un botón no impide la llamada.
 */
router.get('/yo', async (req: AdminRequest, res: Response) => {
  const rol = req.adminRol!;
  return res.json({ id: req.userId, rol, permisos: permisosDe(rol) });
});

// ─── GET /api/admin/administradores ───────────────────────────────────────────

router.get('/administradores', requirePermiso('gestionarRoles'), async (_req: AuthRequest, res: Response) => {
  try {
    const admins = await AppDataSource.getRepository(Usuario).find({
      where: { es_admin: true },
      select: ['id', 'email', 'nombre', 'admin_rol', 'activo', 'fecha_creacion'],
      order: { fecha_creacion: 'ASC' },
    });
    return res.json({ administradores: admins });
  } catch (err) {
    logger.error('[admin] error listando administradores:', err);
    return res.status(500).json({ error: 'Error al listar administradores' });
  }
});

// ─── PATCH /api/admin/usuarios/:id/rol ────────────────────────────────────────

const ROLES_VALIDOS: AdminRol[] = ['soporte', 'moderador', 'superadmin'];

/**
 * Asigna, cambia o retira el rol de administración de una cuenta.
 *
 * Reglas fijas, comprobadas aquí y no en la interfaz:
 *
 *  - Nadie cambia su propio rol. Ni para subirlo (escalada) ni para bajarlo
 *    (dejar la plataforma sin superadmin por un clic en falso).
 *  - No se puede retirar el último superadmin: el panel quedaría sin nadie que
 *    pueda asignar roles, y la única salida sería tocar la base a mano.
 *  - La comprobación del último superadmin y el cambio van en la misma
 *    transacción con bloqueo: dos superadmins degradándose el uno al otro a la
 *    vez no pueden dejar la cuenta a cero.
 */
router.patch(
  '/usuarios/:id/rol',
  requirePermiso('gestionarRoles'),
  [body('rol').custom((v) => v === null || ROLES_VALIDOS.includes(v))],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'El rol debe ser soporte, moderador, superadmin o null' });
    }
    const motivo = MotivoSchema.safeParse(req.body?.motivo);
    if (!motivo.success) return res.status(400).json({ error: motivo.error.errors[0].message });

    const { id } = req.params;
    const rol = req.body.rol as AdminRol | null;

    if (id === req.userId) {
      return res.status(400).json({ error: 'No puedes cambiar tu propio rol de administración' });
    }
    // Después de validar: no se gasta el código en una petición que iba a fallar.
    if (!(await exigirTotpFresco(req, res))) return;

    try {
      const resultado = await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Usuario);

        // Bloqueo de todas las filas de superadmin: serializa los cambios de rol
        // que pueden dejar la plataforma sin ninguno.
        const superadmins = await repo.find({
          where: { admin_rol: 'superadmin' },
          select: ['id'],
          lock: { mode: 'pessimistic_write' },
        });

        const usuario = await repo.findOne({
          where: { id },
          select: ['id', 'email', 'admin_rol'],
          lock: { mode: 'pessimistic_write' },
        });
        if (!usuario) return { status: 404, cuerpo: { error: 'Usuario no encontrado' } };

        const anterior = usuario.admin_rol;
        if (anterior === rol) {
          return { status: 200, cuerpo: { message: 'Sin cambios', rol } };
        }

        const dejaDeSerSuperadmin = anterior === 'superadmin' && rol !== 'superadmin';
        if (dejaDeSerSuperadmin && superadmins.length <= 1) {
          return {
            status: 409,
            cuerpo: { error: 'No se puede retirar el último superadmin: asigna antes el rol a otra persona' },
          };
        }

        if (rol === null) {
          // Sin rol no hay panel: su secreto TOTP y sus códigos de recuperación
          // no tienen por qué seguir existiendo. Si vuelve a ser admin, se enrola
          // de nuevo.
          await repo.update(id, { admin_rol: null, admin_totp_secreto: null, admin_totp_activado_en: null });
          await manager.query(`DELETE FROM admin_codigos_recuperacion WHERE usuario_id = $1`, [id]);
        } else {
          await repo.update(id, { admin_rol: rol });
        }
        await registrarAccionAdmin(manager, req, {
          accion: rol === null ? 'rol.retirado' : 'rol.asignado',
          recursoTipo: 'rol',
          recursoId: id,
          antes: { admin_rol: anterior, email: usuario.email },
          despues: { admin_rol: rol },
          motivo: motivo.data,
        });
        return { status: 200, cuerpo: { message: rol ? `Rol asignado: ${rol}` : 'Rol retirado', rol } };
      });

      return res.status(resultado.status).json(resultado.cuerpo);
    } catch (err) {
      logger.error('[admin] error cambiando rol:', err);
      return res.status(500).json({ error: 'Error al cambiar el rol' });
    }
  },
);


// ─── POST /api/admin/usuarios/:id/2fa/reiniciar ───────────────────────────────

/**
 * Reinicia la verificación en dos pasos de otro admin que perdió el móvil y sus
 * códigos de recuperación. Al entrar de nuevo tendrá que enrolarse.
 *
 * Es la operación que convierte "perdí el acceso" en "alguien más puede atar su
 * móvil a mi cuenta", así que pide lo máximo: superadmin, código fresco y motivo.
 * Además cierra sus sesiones: si el móvil lo tiene otra persona, no puede seguir
 * dentro mientras tanto.
 */
router.post(
  '/usuarios/:id/2fa/reiniciar',
  requirePermiso('gestionarRoles'),
  async (req: AuthRequest, res: Response) => {
    const motivo = MotivoSchema.safeParse(req.body?.motivo);
    if (!motivo.success) return res.status(400).json({ error: motivo.error.errors[0].message });

    const { id } = req.params;
    if (id === req.userId) {
      return res.status(400).json({ error: 'No puedes reiniciar tu propia verificación en dos pasos' });
    }
    if (!(await exigirTotpFresco(req, res))) return;

    try {
      const existe = await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Usuario);
        const usuario = await repo.findOne({ where: { id }, select: ['id', 'admin_totp_activado_en'] });
        if (!usuario) return false;

        await repo.update(id, { admin_totp_secreto: null, admin_totp_activado_en: null });
        await manager.query(`DELETE FROM admin_codigos_recuperacion WHERE usuario_id = $1`, [id]);
        await registrarAccionAdmin(manager, req, {
          accion: 'admin.2fa_reiniciado',
          recursoTipo: 'usuario',
          recursoId: id,
          antes: { activado: Boolean(usuario.admin_totp_activado_en) },
          despues: { activado: false },
          motivo: motivo.data,
        });
        return true;
      });
      if (!existe) return res.status(404).json({ error: 'Usuario no encontrado' });

      await bloquearSesiones(id);
      return res.json({ message: 'Verificación en dos pasos reiniciada. Tendrá que enrolarse de nuevo.' });
    } catch (err) {
      logger.error('[admin] error reiniciando 2FA:', err);
      return res.status(500).json({ error: 'Error al reiniciar la verificación' });
    }
  },
);


// ─── Papelera ─────────────────────────────────────────────────────────────────

/** Cuentas en la papelera, con los días que les quedan antes de la purga. */
router.get('/papelera', requirePermiso('gestionarPapelera'), async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ cuentas: await papelera.listarPapelera(), dias: papelera.DIAS_PAPELERA });
  } catch (err) {
    logger.error('[admin] error listando la papelera:', err);
    return res.status(500).json({ error: 'Error al leer la papelera' });
  }
});

/**
 * Envía una cuenta a la papelera.
 *
 * Es lo más destructivo del panel, así que pide lo máximo: superadmin, motivo y
 * código fresco. Tras el commit corta las sesiones de la cuenta (y de sus
 * trabajadores) y cancela sus suscripciones de Stripe. Si Stripe no confirma, la
 * respuesta lo dice: una cuenta en la papelera que sigue cobrándose es un
 * problema que el admin tiene que saber que existe.
 */
router.post('/usuarios/:id/papelera', requirePermiso('gestionarPapelera'), async (req: AuthRequest, res: Response) => {
  const motivo = MotivoSchema.safeParse(req.body?.motivo);
  if (!motivo.success) return res.status(400).json({ error: motivo.error.errors[0].message });

  const { id } = req.params;
  if (id === req.userId) return res.status(400).json({ error: 'No puedes enviar tu propia cuenta a la papelera' });
  if (!(await exigirTotpFresco(req, res))) return;

  try {
    const r = await AppDataSource.transaction((manager) => papelera.enviarAPapelera(manager, req, id, motivo.data));

    for (const afectado of r.idsAfectados) await bloquearSesiones(afectado);

    const sinCancelar: string[] = [];
    for (const sub of r.suscripciones) {
      if (!(await cancelarSuscripcion(sub))) sinCancelar.push(sub);
    }
    if (sinCancelar.length) {
      logger.error(`[admin] cuenta ${id} en papelera con suscripciones sin cancelar: ${sinCancelar.join(', ')}`);
    }

    return res.json({
      message: 'Cuenta enviada a la papelera',
      cuentas_afectadas: r.idsAfectados.length,
      suscripciones_canceladas: r.suscripciones.length - sinCancelar.length,
      suscripciones_sin_cancelar: sinCancelar,
    });
  } catch (err) {
    if (err instanceof papelera.ErrorPapelera) return res.status(err.status).json({ error: err.message });
    logger.error('[admin] error enviando a la papelera:', err);
    return res.status(500).json({ error: 'Error al enviar a la papelera' });
  }
});

router.post('/usuarios/:id/restaurar', requirePermiso('gestionarPapelera'), async (req: AuthRequest, res: Response) => {
  const motivo = MotivoSchema.safeParse(req.body?.motivo);
  if (!motivo.success) return res.status(400).json({ error: motivo.error.errors[0].message });
  if (!(await exigirTotpFresco(req, res))) return;

  try {
    const r = await AppDataSource.transaction((manager) =>
      papelera.restaurarDePapelera(manager, req, req.params.id, motivo.data)
    );
    for (const restaurado of r.idsRestaurados) await levantarBloqueo(restaurado);
    return res.json({
      message: 'Cuenta restaurada. Si tenía suscripción, tendrá que volver a contratarla: Stripe no la reanuda.',
      cuentas_restauradas: r.idsRestaurados.length,
    });
  } catch (err) {
    if (err instanceof papelera.ErrorPapelera) return res.status(err.status).json({ error: err.message });
    logger.error('[admin] error restaurando de la papelera:', err);
    return res.status(500).json({ error: 'Error al restaurar' });
  }
});

export default router;
