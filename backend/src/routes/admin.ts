import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { AppDataSource } from '../config/database';
import { Usuario, Plan } from '../models/Usuario';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { logger } from '../utils/logger';
import { bloquearSesiones, levantarBloqueo } from '../services/auth/bloqueoSesion';
import { invalidatePlanCache } from '../middleware/requirePlan';
import { AuditoriaAdmin } from '../models/AuditoriaAdmin';
import { registrarAccionAdmin, MotivoSchema } from '../services/admin/auditoria';

const router = Router();

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
      const conditions: string[] = ['1=1'];
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

export default router;
