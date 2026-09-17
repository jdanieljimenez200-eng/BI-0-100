import { Router, Response } from 'express';
import { exigirUuid } from '../middleware/validate';
import { Between, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { Cita } from '../models/Cita';
import { ah } from '../utils/asyncHandler';
import { resolverClienteParaVenta } from '../services/crm/resolverCliente';

const router = Router();
exigirUuid(router, 'id');
router.use(authenticate);
router.use(requireToolCapability('citas'));
// Desbloqueo por plan/selección para todas las rutas (sin getCount: el tope de
// movimientos no debe bloquear lecturas).
router.use(requireHerramientaAccess('citas'));

// Tope freemium: cada cita agendada cuenta como un movimiento.
const contarCitas = (cuentaId: string) =>
  AppDataSource.getRepository(Cita).count({ where: { usuario_id: cuentaId } });

const repo = () => AppDataSource.getRepository(Cita);

// ─── GET /api/calendario — citas de un mes ────────────────────────────────────
// Query: year=2025&month=6  (month 1-12)
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const year       = parseInt(req.query.year  as string) || new Date().getFullYear();
  const month      = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const negocio_id  = req.query.negocio_id  as string | undefined;
  const producto_id = req.query.producto_id as string | undefined;

  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'year debe ser 2000-2100 y month debe ser 1-12' });
    return;
  }

  const desde = `${year}-${String(month).padStart(2, '0')}-01`;
  const ultimoDia = new Date(year, month, 0).getDate();
  const hasta = `${year}-${String(month).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

  const qb = repo()
    .createQueryBuilder('c')
    .where('c.usuario_id = :uid', { uid: req.userId! })
    .andWhere('c.fecha BETWEEN :desde AND :hasta', { desde, hasta });

  if (negocio_id)  qb.andWhere('(c.negocio_id = :negocio_id OR c.negocio_id IS NULL)', { negocio_id });
  if (producto_id) qb.andWhere('(c.producto_id = :producto_id OR c.producto_id IS NULL)', { producto_id });

  const citas = await qb.orderBy('c.fecha', 'ASC').addOrderBy('c.hora_inicio', 'ASC').getMany();
  res.json(citas);
}));

// ─── GET /api/calendario/:id ──────────────────────────────────────────────────
router.get('/:id', ah(async (req: AuthRequest, res: Response) => {
  const cita = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cita) { res.status(404).json({ error: 'Cita no encontrada' }); return; }
  res.json(cita);
}));

// ─── POST /api/calendario ─────────────────────────────────────────────────────
router.post('/', requireHerramientaAccess('citas', contarCitas), ah(async (req: AuthRequest, res: Response) => {
  const {
    titulo, fecha, hora_inicio, hora_fin,
    cliente_nombre, cliente_telefono, cliente_email,
    estado = 'pendiente', notas, color = '#3B82F6', negocio_id, producto_id, cliente_id,
    crear_cliente,
  } = req.body as {
    titulo: string; fecha: string; hora_inicio: string; hora_fin: string;
    cliente_nombre?: string; cliente_telefono?: string; cliente_email?: string;
    estado?: Cita['estado']; notas?: string; color?: string; negocio_id?: string; producto_id?: string;
    cliente_id?: string;
    crear_cliente?: { nombre: string; telefono?: string; email?: string };
  };

  if (!titulo?.trim())   { res.status(400).json({ error: 'titulo es requerido' }); return; }
  if (!fecha)            { res.status(400).json({ error: 'fecha es requerida' }); return; }
  if (!hora_inicio)      { res.status(400).json({ error: 'hora_inicio es requerida' }); return; }
  if (!hora_fin)         { res.status(400).json({ error: 'hora_fin es requerida' }); return; }

  // Vínculo con el CRM, con el mismo servicio que usa el POS: valida que el
  // cliente sea de esta cuenta, permite darlo de alta sin salir de la agenda y
  // marca el contacto. Todo en una transacción: si la cita falla, no queda un
  // cliente huérfano.
  const creada = await AppDataSource.transaction(async (manager) => {
    const resCliente = await resolverClienteParaVenta(manager, {
      usuarioId:     req.userId!,
      trabajadorId:  req.trabajadorRealId ?? null,
      negocioId:     negocio_id ?? null,
      productoId:    producto_id ?? null,
      clienteId:     cliente_id ?? null,
      crearCliente:  crear_cliente ?? null,
      nombreLibre:   cliente_nombre ?? null,
      telefonoLibre: cliente_telefono ?? null,
    });
    if (!resCliente.ok) return resCliente;

    const cita = manager.create(Cita, {
      usuario_id:       req.userId!,
      creado_por_id:    req.trabajadorRealId ?? null,
      negocio_id:       negocio_id ?? null,
      producto_id:      producto_id ?? null,
      cliente_id:       resCliente.cliente_id,
      titulo:           titulo.trim(),
      fecha,
      hora_inicio,
      hora_fin,
      // Snapshot: la cita sigue siendo legible aunque el cliente se borre.
      cliente_nombre:   resCliente.cliente_nombre,
      cliente_telefono: resCliente.cliente_telefono,
      cliente_email:    cliente_email?.trim() || null,
      estado,
      notas:            notas?.trim() || null,
      color,
    });
    await manager.save(Cita, cita);
    return { ok: true as const, cita };
  });

  if (!creada.ok) {
    res.status(creada.status).json({ error: creada.error });
    return;
  }
  res.status(201).json(creada.cita);
}));

// ─── PATCH /api/calendario/:id ────────────────────────────────────────────────
router.patch('/:id', ah(async (req: AuthRequest, res: Response) => {
  const cita = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cita) { res.status(404).json({ error: 'Cita no encontrada' }); return; }

  const fields = ['titulo', 'fecha', 'hora_inicio', 'hora_fin', 'cliente_nombre',
    'cliente_telefono', 'cliente_email', 'estado', 'notas', 'color', 'cliente_id'] as const;
  for (const f of fields) {
    if (f in req.body) (cita as unknown as Record<string, unknown>)[f] = req.body[f];
  }

  await repo().save(cita);
  res.json(cita);
}));

// ─── DELETE /api/calendario/:id ───────────────────────────────────────────────
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
  const cita = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cita) { res.status(404).json({ error: 'Cita no encontrada' }); return; }
  await repo().remove(cita);
  res.json({ ok: true });
}));

// ─── POST /api/calendario/:id/whatsapp — recordatorio ────────────────────────
router.post('/:id/whatsapp', ah(async (req: AuthRequest, res: Response) => {
  const cita = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cita) { res.status(404).json({ error: 'Cita no encontrada' }); return; }

  const tel = (cita.cliente_telefono || '').replace(/[^\d]/g, '');
  if (!tel) { res.status(400).json({ error: 'El cliente no tiene teléfono' }); return; }

  const fechaFmt = new Date(cita.fecha + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const msg = `Hola ${cita.cliente_nombre?.split(' ')[0] || ''}. Te recuerdo tu cita *${cita.titulo}* el *${fechaFmt}* de *${cita.hora_inicio}* a *${cita.hora_fin}*. ¿Confirmas tu asistencia?`;
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;

  res.json({ whatsapp_url: url });
}));

export default router;
