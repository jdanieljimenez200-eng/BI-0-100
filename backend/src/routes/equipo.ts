import { Router, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
import { authenticate, AuthRequest } from '../middleware/auth';
import { ah } from '../utils/asyncHandler';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { AsignacionTrabajador } from '../models/AsignacionTrabajador';
import { InvitacionTrabajador } from '../models/InvitacionTrabajador';
import { randomBytes } from 'crypto';
import {
  canAddTrabajador,
  getLimites,
  sanitizePermisos,
  isCapabilityKey,
  CAPABILITIES,
} from '../services/billing/planService';
import { bloquearSesiones } from '../services/auth/bloqueoSesion';

const router = Router();
router.use(authenticate);

// ─── Guard: solo el dueño de la cuenta gestiona su equipo ─────────────────────
// Mismo criterio que productos.ts: account_role debe ser 'owner'. Los
// trabajadores no tienen acceso a ninguna ruta de /api/equipo.
async function requireOwnerAccount(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    select: ['account_role'],
    where: { id: req.userId! },
  });
  if (usuario?.account_role !== 'owner') {
    res.status(403).json({ error: 'Solo el dueño de la cuenta puede gestionar el equipo' });
    return;
  }
  next();
}
router.use(ah(requireOwnerAccount));

function handleValidation(req: AuthRequest, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── GET /api/equipo/capabilities ─────────────────────────────────────────────
// Catálogo de capacidades para que la UI pinte los toggles con su label y marca
// las sensibles (finanzas, nómina, contabilidad) para pedir confirmación.
router.get('/capabilities', (_req: AuthRequest, res: Response) => {
  res.json(CAPABILITIES);
});

// ─── GET /api/equipo/trabajadores ─────────────────────────────────────────────
// Lista los trabajadores de la cuenta (owner_id = dueño) con su conteo de
// asignaciones activas, más el límite del plan para que la UI sepa si puede
// añadir más.
router.get('/trabajadores', ah(async (req: AuthRequest, res: Response) => {
  const usuarioRepo = AppDataSource.getRepository(Usuario);

  const owner = await usuarioRepo.findOne({
    select: ['plan'],
    where: { id: req.userId! },
  });
  const plan = owner?.plan ?? 'freemium';

  const trabajadores = await usuarioRepo.find({
    select: ['id', 'email', 'nombre', 'activo', 'fecha_creacion'],
    where: { owner_id: req.userId!, account_role: 'trabajador' },
    order: { fecha_creacion: 'ASC' },
  });

  // Conteo de asignaciones activas por trabajador en una sola consulta.
  const asigRepo = AppDataSource.getRepository(AsignacionTrabajador);
  const conteos = trabajadores.length
    ? await asigRepo
        .createQueryBuilder('a')
        .select('a.trabajador_id', 'trabajador_id')
        .addSelect('COUNT(*)', 'total')
        .where('a.cuenta_id = :cuentaId', { cuentaId: req.userId! })
        .andWhere('a.activo = true')
        .groupBy('a.trabajador_id')
        .getRawMany<{ trabajador_id: string; total: string }>()
    : [];
  const conteoPorTrabajador = new Map(conteos.map((c) => [c.trabajador_id, Number(c.total)]));

  const limites = getLimites(plan);
  res.json({
    plan,
    max_trabajadores: limites.max_trabajadores,
    total: trabajadores.length,
    puede_agregar: canAddTrabajador(plan, trabajadores.length),
    trabajadores: trabajadores.map((t) => ({
      id: t.id,
      email: t.email,
      nombre: t.nombre,
      activo: t.activo,
      fecha_creacion: t.fecha_creacion,
      asignaciones_activas: conteoPorTrabajador.get(t.id) ?? 0,
    })),
  });
}));

// ─── POST /api/equipo/trabajadores ────────────────────────────────────────────
// Da de alta un trabajador bajo la cuenta del dueño. Respeta el tope
// max_trabajadores del plan vía canAddTrabajador.
router.post(
  '/trabajadores',
  [
    body('email').isEmail().normalizeEmail(),
    body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
    body('password')
      .isLength({ min: 8, max: 128 }).withMessage('Entre 8 y 128 caracteres')
      .matches(/[A-Z]/).withMessage('Debe contener mayúscula')
      .matches(/\d/).withMessage('Debe contener número')
      .matches(/[^A-Za-z0-9]/).withMessage('Debe contener carácter especial'),
  ],
  ah(async (req: AuthRequest, res: Response) => {
    if (!handleValidation(req, res)) return;

    const repo = AppDataSource.getRepository(Usuario);
    const invRepo = AppDataSource.getRepository(InvitacionTrabajador);

    const owner = await repo.findOne({ select: ['plan'], where: { id: req.userId! } });
    const plan = owner?.plan ?? 'freemium';

    const actuales = await repo.count({
      where: { owner_id: req.userId!, account_role: 'trabajador' },
    });
    const pendientes = await invRepo
      .createQueryBuilder('i')
      .where('i.cuenta_id = :cuentaId', { cuentaId: req.userId! })
      .andWhere('i.usado_por IS NULL')
      .andWhere('i.expira_en > now()')
      .getCount();

    if (!canAddTrabajador(plan, actuales + pendientes)) {
      const limites = getLimites(plan);
      res.status(403).json({
        error: limites.max_trabajadores === 0
          ? `Tu plan ${plan} no incluye equipo. Mejora tu plan para invitar trabajadores.`
          : `Alcanzaste el máximo de ${limites.max_trabajadores} trabajador(es) entre altas e invitaciones vigentes`,
        upgrade_required: true,
        plan_actual: plan,
      });
      return;
    }

    const { email, password, nombre } = req.body;
    const existe = await repo.findOneBy({ email });
    if (existe) {
      res.status(409).json({ error: 'Email ya registrado' });
      return;
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_COST);
    const trabajador = repo.create({
      email,
      password_hash,
      nombre,
      plan: 'freemium',          // irrelevante: el trabajador opera bajo el plan del dueño
      account_role: 'trabajador',
      owner_id: req.userId!,
      analisis_disponibles: 0,
      creditos_marketing: 0,
    });
    await repo.save(trabajador);

    res.status(201).json({
      id: trabajador.id,
      email: trabajador.email,
      nombre: trabajador.nombre,
      activo: trabajador.activo,
      fecha_creacion: trabajador.fecha_creacion,
      asignaciones_activas: 0,
    });
  })
);

// ─── DELETE /api/equipo/trabajadores/:id ──────────────────────────────────────
// Elimina al trabajador (debe pertenecer a esta cuenta). El FK con
// onDelete: 'CASCADE' borra sus asignaciones automáticamente.
// Además, revoca inmediatamente sus refresh tokens en Redis.
router.delete(
  '/trabajadores/:id',
  [param('id').isUUID()],
  ah(async (req: AuthRequest, res: Response) => {
    if (!handleValidation(req, res)) return;

    const repo = AppDataSource.getRepository(Usuario);
    const trabajador = await repo.findOne({
      select: ['id'],
      where: { id: req.params.id, owner_id: req.userId!, account_role: 'trabajador' },
    });
    if (!trabajador) {
      res.status(404).json({ error: 'Trabajador no encontrado' });
      return;
    }

    await repo.delete({ id: trabajador.id });
    // Revocar el refresh no basta: el access token seguiría valiendo hasta 15 min.
    await bloquearSesiones(trabajador.id);
    res.json({ message: 'Trabajador eliminado' });
  }
));

// ─── GET /api/equipo/trabajadores/:id/asignaciones ────────────────────────────
// Asignaciones del trabajador (solo de esta cuenta), con el nombre del producto.
router.get(
  '/trabajadores/:id/asignaciones',
  [param('id').isUUID()],
  ah(async (req: AuthRequest, res: Response) => {
    if (!handleValidation(req, res)) return;

    const trabajador = await AppDataSource.getRepository(Usuario).findOne({
      select: ['id'],
      where: { id: req.params.id, owner_id: req.userId!, account_role: 'trabajador' },
    });
    if (!trabajador) {
      res.status(404).json({ error: 'Trabajador no encontrado' });
      return;
    }

    const asignaciones = await AppDataSource.getRepository(AsignacionTrabajador)
      .createQueryBuilder('a')
      .innerJoin(Producto, 'p', 'p.id = a.producto_id')
      .select([
        'a.id AS id',
        'a.producto_id AS producto_id',
        'a.permisos AS permisos',
        'a.activo AS activo',
        'p.nombre AS producto_nombre',
      ])
      .where('a.trabajador_id = :tid', { tid: trabajador.id })
      .andWhere('a.cuenta_id = :cuentaId', { cuentaId: req.userId! })
      .orderBy('p.nombre', 'ASC')
      .getRawMany();

    res.json(asignaciones);
  }
));

// ─── POST /api/equipo/asignaciones ────────────────────────────────────────────
// Crea una asignación trabajador × producto. Falla con 409 si ya existe (usar
// PATCH para editar permisos). El producto y el trabajador deben ser de la cuenta.
router.post(
  '/asignaciones',
  [
    body('trabajador_id').isUUID().withMessage('trabajador_id debe ser UUID'),
    body('producto_id').isUUID().withMessage('producto_id debe ser UUID'),
    body('permisos').optional().isObject().withMessage('permisos debe ser objeto'),
  ],
  ah(async (req: AuthRequest, res: Response) => {
    if (!handleValidation(req, res)) return;

    const { trabajador_id, producto_id } = req.body;

    const trabajador = await AppDataSource.getRepository(Usuario).findOne({
      select: ['id'],
      where: { id: trabajador_id, owner_id: req.userId!, account_role: 'trabajador' },
    });
    if (!trabajador) {
      res.status(404).json({ error: 'Trabajador no encontrado en tu cuenta' });
      return;
    }

    const producto = await AppDataSource.getRepository(Producto).findOne({
      select: ['id'],
      where: { id: producto_id, usuario_id: req.userId! },
    });
    if (!producto) {
      res.status(404).json({ error: 'Producto no encontrado en tu cuenta' });
      return;
    }

    const repo = AppDataSource.getRepository(AsignacionTrabajador);
    const existe = await repo.findOne({
      select: ['id'],
      where: { trabajador_id, producto_id },
    });
    if (existe) {
      res.status(409).json({ error: 'Ya existe una asignación para este trabajador y producto. Usa PATCH para editarla.' });
      return;
    }

    const asignacion = repo.create({
      trabajador_id,
      cuenta_id: req.userId!,
      producto_id,
      permisos: sanitizePermisos(req.body.permisos),
      activo: true,
    });
    await repo.save(asignacion);

    res.status(201).json({
      id: asignacion.id,
      trabajador_id: asignacion.trabajador_id,
      producto_id: asignacion.producto_id,
      permisos: asignacion.permisos,
      activo: asignacion.activo,
    });
  })
);

// ─── PATCH /api/equipo/asignaciones/:id ───────────────────────────────────────
// Edita permisos y/o activa-desactiva la asignación. Solo asignaciones de esta cuenta.
router.patch(
  '/asignaciones/:id',
  [
    param('id').isUUID(),
    body('permisos').optional().isObject().withMessage('permisos debe ser objeto'),
    body('activo').optional().isBoolean().withMessage('activo debe ser booleano'),
  ],
  ah(async (req: AuthRequest, res: Response) => {
    if (!handleValidation(req, res)) return;

    const repo = AppDataSource.getRepository(AsignacionTrabajador);
    const asignacion = await repo.findOne({
      where: { id: req.params.id, cuenta_id: req.userId! },
    });
    if (!asignacion) {
      res.status(404).json({ error: 'Asignación no encontrada' });
      return;
    }

    if (req.body.permisos !== undefined && typeof req.body.permisos === 'object' && req.body.permisos !== null) {
      const actual = { ...(asignacion.permisos || {}) };
      for (const [key, val] of Object.entries(req.body.permisos)) {
        if (isCapabilityKey(key)) {
          if (val === true) {
            actual[key] = true;
          } else if (val === false) {
            delete actual[key];
          }
        }
      }
      asignacion.permisos = actual;
    }
    if (typeof req.body.activo === 'boolean') {
      asignacion.activo = req.body.activo;
    }
    await repo.save(asignacion);

    res.json({
      id: asignacion.id,
      trabajador_id: asignacion.trabajador_id,
      producto_id: asignacion.producto_id,
      permisos: asignacion.permisos,
      activo: asignacion.activo,
    });
  })
);

// ─── DELETE /api/equipo/asignaciones/:id ──────────────────────────────────────
// Revoca por completo la asignación (el trabajador deja de ver el producto).
router.delete(
  '/asignaciones/:id',
  [param('id').isUUID()],
  ah(async (req: AuthRequest, res: Response) => {
    if (!handleValidation(req, res)) return;

    const repo = AppDataSource.getRepository(AsignacionTrabajador);
    const asignacion = await repo.findOne({
      select: ['id'],
      where: { id: req.params.id, cuenta_id: req.userId! },
    });
    if (!asignacion) {
      res.status(404).json({ error: 'Asignación no encontrada' });
      return;
    }

    await repo.delete({ id: asignacion.id });
    res.json({ message: 'Asignación revocada' });
  })
);

// ─── POST /api/equipo/invitaciones ────────────────────────────────────────────
// Genera un código de un solo uso para que un trabajador se auto-registre y
// quede ligado a esta cuenta. Cuenta trabajadores + invitaciones vigentes sin
// usar contra el tope del plan para no rebasarlo al emitir códigos de más.
router.post(
  '/invitaciones',
  [
    body('email_destino').optional({ nullable: true }).isEmail().normalizeEmail()
      .withMessage('email_destino debe ser un email válido'),
    body('dias_validez').optional().isInt({ min: 1, max: 30 })
      .withMessage('dias_validez debe ser entre 1 y 30'),
  ],
  ah(async (req: AuthRequest, res: Response) => {
    if (!handleValidation(req, res)) return;

    const usuarioRepo = AppDataSource.getRepository(Usuario);
    const invRepo = AppDataSource.getRepository(InvitacionTrabajador);

    const owner = await usuarioRepo.findOne({ select: ['plan'], where: { id: req.userId! } });
    const plan = owner?.plan ?? 'freemium';

    const trabajadores = await usuarioRepo.count({
      where: { owner_id: req.userId!, account_role: 'trabajador' },
    });
    const pendientes = await invRepo
      .createQueryBuilder('i')
      .where('i.cuenta_id = :cuentaId', { cuentaId: req.userId! })
      .andWhere('i.usado_por IS NULL')
      .andWhere('i.expira_en > now()')
      .getCount();

    if (!canAddTrabajador(plan, trabajadores + pendientes)) {
      const limites = getLimites(plan);
      res.status(403).json({
        error: limites.max_trabajadores === 0
          ? `Tu plan ${plan} no incluye equipo. Mejora tu plan para invitar trabajadores.`
          : `Alcanzaste el máximo de ${limites.max_trabajadores} trabajador(es) entre altas e invitaciones vigentes`,
        upgrade_required: true,
        plan_actual: plan,
      });
      return;
    }

    // 16 chars hex en mayúsculas → cabe en varchar(16). Reintenta ante colisión.
    let codigo = '';
    for (let intento = 0; intento < 5; intento++) {
      codigo = randomBytes(8).toString('hex').toUpperCase();
      const choca = await invRepo.findOne({ select: ['id'], where: { codigo } });
      if (!choca) break;
      codigo = '';
    }
    if (!codigo) {
      res.status(500).json({ error: 'No se pudo generar un código único, reintenta' });
      return;
    }

    const dias = Number(req.body.dias_validez) || 7;
    const expira_en = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

    const invitacion = invRepo.create({
      codigo,
      cuenta_id: req.userId!,
      email_destino: req.body.email_destino || null,
      expira_en,
    });
    await invRepo.save(invitacion);

    res.status(201).json({
      id: invitacion.id,
      codigo: invitacion.codigo,
      email_destino: invitacion.email_destino,
      expira_en: invitacion.expira_en,
      fecha_creacion: invitacion.fecha_creacion,
    });
  })
);

// ─── GET /api/equipo/invitaciones ─────────────────────────────────────────────
// Lista las invitaciones vigentes sin usar (no caducadas) de la cuenta.
router.get('/invitaciones', ah(async (req: AuthRequest, res: Response) => {
  const invitaciones = await AppDataSource.getRepository(InvitacionTrabajador)
    .createQueryBuilder('i')
    .select([
      'i.id AS id',
      'i.codigo AS codigo',
      'i.email_destino AS email_destino',
      'i.expira_en AS expira_en',
      'i.fecha_creacion AS fecha_creacion',
    ])
    .where('i.cuenta_id = :cuentaId', { cuentaId: req.userId! })
    .andWhere('i.usado_por IS NULL')
    .andWhere('i.expira_en > now()')
    .orderBy('i.fecha_creacion', 'DESC')
    .getRawMany();

  res.json(invitaciones);
}));

// ─── DELETE /api/equipo/invitaciones/:id ──────────────────────────────────────
// Revoca una invitación sin usar (solo de esta cuenta).
router.delete(
  '/invitaciones/:id',
  [param('id').isUUID()],
  ah(async (req: AuthRequest, res: Response) => {
    if (!handleValidation(req, res)) return;

    const repo = AppDataSource.getRepository(InvitacionTrabajador);
    const invitacion = await repo.findOne({
      select: ['id', 'usado_por'],
      where: { id: req.params.id, cuenta_id: req.userId! },
    });
    if (!invitacion) {
      res.status(404).json({ error: 'Invitación no encontrada' });
      return;
    }
    if (invitacion.usado_por) {
      res.status(400).json({ error: 'No se puede revocar una invitación que ya ha sido utilizada' });
      return;
    }

    await repo.delete({ id: invitacion.id });
    res.json({ message: 'Invitación revocada' });
  })
);

export default router;