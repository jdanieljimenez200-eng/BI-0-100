import { Router, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { validateBody, exigirUuid, esUuid, fechaISO, fechaISOOpcional } from '../middleware/validate';
import { Empleado } from '../models/Empleado';
import { PagoNomina } from '../models/PagoNomina';
import { MovimientoContable } from '../models/MovimientoContable';
import { ah } from '../utils/asyncHandler';
import { monedaDeCuenta } from '../utils/monedaCuenta';
import { idempotente } from '../middleware/idempotency';
import { leerLimite, paginar, responderPagina } from '../utils/paginacion';

const CrearEmpleadoSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido'),
  cargo: z.string().optional(),
  salario: z.number({ invalid_type_error: 'salario debe ser numérico' }).positive('salario debe ser mayor a 0'),
  tipo_pago: z.enum(['semanal', 'quincenal', 'mensual', 'por_hora', 'honorarios']).optional().default('mensual'),
  moneda: z.string().optional(), // sin valor: la del país del producto (monedaDeCuenta)
  telefono: z.string().optional(),
  email: z.string().optional(),
  fecha_inicio: fechaISOOpcional('fecha_inicio inválida (YYYY-MM-DD)'),
  notas: z.string().optional(),
  negocio_id: z.string().uuid().nullable().optional(),
  producto_id: z.string().uuid().nullable().optional(),
});

const CrearPagoNominaSchema = z.object({
  empleado_id: z.string().uuid('empleado_id debe ser un UUID válido'),
  monto: z.number({ invalid_type_error: 'monto debe ser numérico' }).positive('monto debe ser mayor a 0').optional(),
  periodo_inicio: fechaISO('periodo_inicio inválido (YYYY-MM-DD)'),
  periodo_fin: fechaISO('periodo_fin inválido (YYYY-MM-DD)'),
  fecha_pago: fechaISO('fecha_pago inválida (YYYY-MM-DD)'),
  notas: z.string().optional(),
}).refine((p) => p.periodo_fin >= p.periodo_inicio, {
  message: 'periodo_fin no puede ser anterior a periodo_inicio',
  path: ['periodo_fin'],
});

// Editar: los mismos campos que el alta, todos opcionales, más `activo`.
const EditarEmpleadoSchema = CrearEmpleadoSchema.omit({ negocio_id: true, producto_id: true })
  .partial()
  .extend({ activo: z.boolean().optional() });

const router = Router();
exigirUuid(router, 'id');
router.use(authenticate);
router.use(requireToolCapability('nomina'));
// Desbloqueo por plan/selección para todas las rutas (sin getCount: el tope de
// movimientos no debe bloquear lecturas).
router.use(requireHerramientaAccess('nomina'));

// Tope freemium: cada pago de nómina cuenta como un movimiento. Los empleados
// (alta del catálogo) no consumen cupo, igual que el catálogo del POS.
const contarPagosNomina = (cuentaId: string) =>
  AppDataSource.getRepository(PagoNomina).count({ where: { usuario_id: cuentaId } });

const repoEmp  = () => AppDataSource.getRepository(Empleado);
const repoPago = () => AppDataSource.getRepository(PagoNomina);
const repoMov  = () => AppDataSource.getRepository(MovimientoContable);

// ═══════════════════════════════════════════════════════════════
// EMPLEADOS
// ═══════════════════════════════════════════════════════════════

router.get('/empleados', ah(async (req: AuthRequest, res: Response) => {
  const { activo, negocio_id, producto_id } = req.query as { activo?: string; negocio_id?: string; producto_id?: string };
  const qb = repoEmp()
    .createQueryBuilder('e')
    .where('e.usuario_id = :uid', { uid: req.userId! });

  if (activo === 'true')  qb.andWhere('e.activo = true');
  if (activo === 'false') qb.andWhere('e.activo = false');
  if (negocio_id)  qb.andWhere('(e.negocio_id = :negocio_id OR e.negocio_id IS NULL)', { negocio_id });
  if (producto_id) qb.andWhere('(e.producto_id = :producto_id OR e.producto_id IS NULL)', { producto_id });

  const rows = await qb.orderBy('e.nombre', 'ASC').getMany();
  res.json(rows);
}));

router.get('/empleados/:id', ah(async (req: AuthRequest, res: Response) => {
  const emp = await repoEmp().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!emp) { res.status(404).json({ error: 'Empleado no encontrado' }); return; }
  res.json(emp);
}));

router.post('/empleados', validateBody(CrearEmpleadoSchema), ah(async (req: AuthRequest, res: Response) => {
  const { nombre, cargo, salario, tipo_pago = 'mensual', moneda,
    telefono, email, fecha_inicio, notas, negocio_id, producto_id } = req.body as {
    nombre: string; cargo?: string; salario: number;
    tipo_pago?: Empleado['tipo_pago']; moneda?: string;
    telefono?: string; email?: string; fecha_inicio?: string;
    notas?: string; negocio_id?: string; producto_id?: string;
  };

  if (!nombre?.trim()) { res.status(400).json({ error: 'nombre es requerido' }); return; }
  if (!salario || salario <= 0) { res.status(400).json({ error: 'salario debe ser mayor a 0' }); return; }

  // Sin moneda explícita, la del país del producto: un negocio mexicano daba de
  // alta a su gente con sueldos en dólares.
  const monedaEmpleado = moneda || (await monedaDeCuenta(req.userId!, producto_id));

  const emp = repoEmp().create({
    usuario_id: req.userId!, negocio_id: negocio_id ?? null, producto_id: producto_id ?? null,
    nombre: nombre.trim(), cargo: cargo?.trim() || null, salario, tipo_pago, moneda: monedaEmpleado,
    telefono: telefono?.trim() || null, email: email?.trim() || null,
    fecha_inicio: fecha_inicio ?? null, notas: notas?.trim() || null, activo: true,
  });
  await repoEmp().save(emp);
  res.status(201).json(emp);
}));

router.patch('/empleados/:id', validateBody(EditarEmpleadoSchema), ah(async (req: AuthRequest, res: Response) => {
  const emp = await repoEmp().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!emp) { res.status(404).json({ error: 'Empleado no encontrado' }); return; }

  const fields = ['nombre', 'cargo', 'salario', 'tipo_pago', 'moneda',
    'telefono', 'email', 'fecha_inicio', 'notas', 'activo'] as const;
  for (const f of fields) {
    if (f in req.body) (emp as unknown as Record<string, unknown>)[f] = req.body[f];
  }
  await repoEmp().save(emp);
  res.json(emp);
}));

// Con pagos registrados, el empleado se desactiva en lugar de borrarse: el
// borrado arrastraba en cascada su historial de nómina, que hay que conservar.
router.delete('/empleados/:id', ah(async (req: AuthRequest, res: Response) => {
  const emp = await repoEmp().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!emp) { res.status(404).json({ error: 'Empleado no encontrado' }); return; }

  const conPagos = await repoPago().exists({ where: { empleado_id: emp.id, usuario_id: req.userId! } });
  if (!conPagos) {
    await repoEmp().remove(emp);
    res.json({ ok: true, archivado: false });
    return;
  }
  emp.activo = false;
  await repoEmp().save(emp);
  res.json({ ok: true, archivado: true, empleado: emp, mensaje: 'El empleado tiene pagos registrados: se desactivó para conservar su historial de nómina.' });
}));

// ═══════════════════════════════════════════════════════════════
// PAGOS — registra egreso en Finanzas automáticamente
// ═══════════════════════════════════════════════════════════════

router.get('/pagos', ah(async (req: AuthRequest, res: Response) => {
  const { empleado_id, negocio_id } = req.query as { empleado_id?: string; negocio_id?: string };
  if ((empleado_id && !esUuid(empleado_id)) || (negocio_id && !esUuid(negocio_id))) {
    res.status(400).json({ error: 'empleado_id y negocio_id deben ser UUID' });
    return;
  }
  const qb = repoPago().createQueryBuilder('p').where('p.usuario_id = :uid', { uid: req.userId! });
  if (empleado_id) qb.andWhere('p.empleado_id = :empleado_id', { empleado_id });
  if (negocio_id) {
    qb.andWhere('p.empleado_id IN (SELECT e.id FROM empleados e WHERE e.usuario_id = :uid AND e.negocio_id = :negocio_id)', {
      negocio_id,
    });
  }
  const pagina = await paginar(
    qb,
    [{ expr: 'p.fecha_pago', tipo: 'date' }, { expr: 'p.fecha_creacion', tipo: 'timestamp' }, { expr: 'p.id', tipo: 'uuid' }],
    req.query.antes,
    leerLimite(req.query.limite, 100)
  );
  if (!pagina) { res.status(400).json({ error: 'Cursor de paginación inválido' }); return; }
  responderPagina(res, pagina);
}));

router.post('/pagos', idempotente('nomina_pago'), requireHerramientaAccess('nomina', contarPagosNomina), validateBody(CrearPagoNominaSchema), ah(async (req: AuthRequest, res: Response) => {
  const { empleado_id, monto, periodo_inicio, periodo_fin, fecha_pago, notas } = req.body as {
    empleado_id: string; monto: number;
    periodo_inicio: string; periodo_fin: string; fecha_pago: string; notas?: string;
  };

  if (!empleado_id) { res.status(400).json({ error: 'empleado_id es requerido' }); return; }

  const emp = await repoEmp().findOne({ where: { id: empleado_id, usuario_id: req.userId! } });
  if (!emp) { res.status(404).json({ error: 'Empleado no encontrado' }); return; }

  const montoFinal = monto ?? Number(emp.salario);

  if (montoFinal <= 0) {
    res.status(400).json({ error: 'monto debe ser mayor a 0' });
    return;
  }

  const { pago, movimiento } = await AppDataSource.transaction(async manager => {
    const mov = manager.create(MovimientoContable, {
      usuario_id:  req.userId!,
      creado_por_id: req.trabajadorRealId ?? null,
      producto_id: null,
      tipo:        'egreso',
      descripcion: `Nómina: ${emp.nombre}${emp.cargo ? ` (${emp.cargo})` : ''} · ${periodo_inicio} – ${periodo_fin}`,
      monto:       montoFinal,
      fecha:       fecha_pago,
      categoria:   'Nómina',
      fuente:      'nomina',
      es_auto_generado: true,
    });
    await manager.save(MovimientoContable, mov);

    const pg = manager.create(PagoNomina, {
      usuario_id:      req.userId!,
      creado_por_id:   req.trabajadorRealId ?? null,
      empleado_id,
      empleado_nombre: emp.nombre,
      monto:           montoFinal,
      moneda:          emp.moneda,
      periodo_inicio,
      periodo_fin,
      fecha_pago,
      notas:           notas?.trim() || null,
      movimiento_id:   mov.id,
    });
    await manager.save(PagoNomina, pg);

    // El asiento se crea antes que el pago (PagoNomina.movimiento_id lo exige),
    // asi que la referencia inversa se completa aqui. Sin ella, un egreso de
    // nomina no se puede rastrear hasta el pago que lo origino.
    mov.referencia_tipo = 'pago_nomina';
    mov.referencia_id = pg.id;
    await manager.save(MovimientoContable, mov);

    return { pago: pg, movimiento: mov };
  });

  res.status(201).json({ pago, movimiento });
}));

router.delete('/pagos/:id', ah(async (req: AuthRequest, res: Response) => {
  const pago = await repoPago().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!pago) { res.status(404).json({ error: 'Pago no encontrado' }); return; }

  await AppDataSource.transaction(async manager => {
    if (pago.movimiento_id) {
      await manager.delete(MovimientoContable, { id: pago.movimiento_id, usuario_id: req.userId! });
    }
    await manager.remove(PagoNomina, pago);
  });

  res.json({ ok: true });
}));

export default router;
