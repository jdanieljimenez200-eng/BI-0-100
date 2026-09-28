import { Router, Response } from 'express';
import { z } from 'zod';
import { EntityManager } from 'typeorm';
import { exigirUuid, fechaISO, validateBody } from '../middleware/validate';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { Cita } from '../models/Cita';
import { Negocio } from '../models/Negocio';
import { Producto } from '../models/Producto';
import { ah } from '../utils/asyncHandler';
import { resolverClienteParaVenta } from '../services/crm/resolverCliente';
import { encolarBorrarEvento, encolarGuardarCita } from '../workers/calendarQueue';
import { hoyDePeticion } from '../utils/fechaLocal';
import { paisDeCuenta } from '../utils/monedaCuenta';
import { telefonoWhatsApp } from '../utils/whatsapp';
import { idempotente } from '../middleware/idempotency';
import lugaresRouter from './calendarioLugares';
import esperaRouter from './calendarioEspera';

const router = Router();
exigirUuid(router, 'id');
router.use(authenticate);
router.use(requireToolCapability('citas'));
// Desbloqueo por plan/selección para todas las rutas (sin getCount: el tope de
// movimientos no debe bloquear lecturas).
router.use(requireHerramientaAccess('citas'));

// Fila de espera y catálogo de lugares. Van ANTES de las rutas `/:id` de abajo:
// si se montaran después, `GET /api/calendario/lugares` entraría por `/:id` y
// `exigirUuid` respondería 400 al ver "lugares" donde espera un UUID.
router.use('/lugares', lugaresRouter);
router.use('/espera', esperaRouter);

// Tope freemium: cada cita agendada cuenta como un movimiento.
const contarCitas = (cuentaId: string) =>
  AppDataSource.getRepository(Cita).count({ where: { usuario_id: cuentaId } });

const repo = () => AppDataSource.getRepository(Cita);

// ─── Validación ───────────────────────────────────────────────────────────────

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Hora inválida (HH:MM)');
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();
const uuidOpcional = z.string().uuid().nullable().optional();
const EstadoSchema = z.enum(['pendiente', 'confirmada', 'cancelada', 'completada']);

const CamposCita = {
  titulo: z.string().trim().min(1, 'titulo es requerido').max(200),
  fecha: fechaISO('fecha inválida (YYYY-MM-DD)'),
  hora_inicio: hora,
  hora_fin: hora,
  cliente_nombre: textoOpcional(200),
  cliente_telefono: textoOpcional(30),
  cliente_email: z.union([z.string().trim().email('Email inválido').max(200), z.literal('')]).nullable().optional(),
  estado: EstadoSchema.optional(),
  notas: textoOpcional(5000),
  color: z.string().trim().regex(/^(#[0-9a-fA-F]{3,8}|[a-z-]{1,20})$/, 'Color inválido').optional(),
  negocio_id: uuidOpcional,
  producto_id: uuidOpcional,
  cliente_id: uuidOpcional,
  crear_cliente: z
    .object({
      nombre: z.string().trim().min(1).max(200),
      telefono: z.string().trim().max(30).optional(),
      email: z.string().trim().max(200).optional(),
    })
    .nullable()
    .optional(),
};

const finDespuesDeInicio = (d: { hora_inicio?: string; hora_fin?: string }) =>
  !d.hora_inicio || !d.hora_fin || minutos(d.hora_fin) > minutos(d.hora_inicio);
const MSG_HORAS = { message: 'La hora de fin debe ser posterior a la de inicio', path: ['hora_fin'] };

const CrearCitaSchema = z.object(CamposCita).refine(finDespuesDeInicio, MSG_HORAS);
const EditarCitaSchema = z.object(CamposCita).partial().refine(finDespuesDeInicio, MSG_HORAS);

/** negocio_id / producto_id tienen que ser de la cuenta: si no, la cita quedaría colgada de datos ajenos. */
async function perteneceALaCuenta(
  manager: EntityManager,
  cuentaId: string,
  negocioId?: string | null,
  productoId?: string | null
): Promise<string | null> {
  if (negocioId && !(await manager.exists(Negocio, { where: { id: negocioId, usuario_id: cuentaId } }))) {
    return 'Negocio no encontrado';
  }
  if (productoId && !(await manager.exists(Producto, { where: { id: productoId, usuario_id: cuentaId } }))) {
    return 'Producto no encontrado';
  }
  return null;
}

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
  const uuid = z.string().uuid();
  if ((negocio_id && !uuid.safeParse(negocio_id).success) || (producto_id && !uuid.safeParse(producto_id).success)) {
    res.status(400).json({ error: 'negocio_id y producto_id deben ser identificadores válidos' });
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
router.post('/', idempotente('cita'), requireHerramientaAccess('citas', contarCitas), validateBody(CrearCitaSchema), ah(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof CrearCitaSchema>;

  // Vínculo con el CRM, con el mismo servicio que usa el POS: valida que el
  // cliente sea de esta cuenta, permite darlo de alta sin salir de la agenda y
  // marca el contacto. Todo en una transacción: si la cita falla, no queda un
  // cliente huérfano.
  const creada = await AppDataSource.transaction(async (manager) => {
    const ajeno = await perteneceALaCuenta(manager, req.userId!, body.negocio_id, body.producto_id);
    if (ajeno) return { ok: false as const, status: 404, error: ajeno };

    const resCliente = await resolverClienteParaVenta(manager, {
      usuarioId:     req.userId!,
      trabajadorId:  req.trabajadorRealId ?? null,
      negocioId:     body.negocio_id ?? null,
      productoId:    body.producto_id ?? null,
      clienteId:     body.cliente_id ?? null,
      crearCliente:  body.crear_cliente ?? null,
      nombreLibre:   body.cliente_nombre ?? null,
      telefonoLibre: body.cliente_telefono ?? null,
      hoy: await hoyDePeticion(req),
    });
    if (!resCliente.ok) return resCliente;

    const cita = manager.create(Cita, {
      usuario_id:       req.userId!,
      creado_por_id:    req.trabajadorRealId ?? null,
      negocio_id:       body.negocio_id ?? null,
      producto_id:      body.producto_id ?? null,
      cliente_id:       resCliente.cliente_id,
      titulo:           body.titulo,
      fecha:            body.fecha,
      hora_inicio:      body.hora_inicio,
      hora_fin:         body.hora_fin,
      // Snapshot: la cita sigue siendo legible aunque el cliente se borre.
      cliente_nombre:   resCliente.cliente_nombre,
      cliente_telefono: resCliente.cliente_telefono,
      cliente_email:    body.cliente_email || null,
      estado:           body.estado ?? 'pendiente',
      notas:            body.notas || null,
      color:            body.color ?? '#3B82F6',
    });
    await manager.save(Cita, cita);
    return { ok: true as const, cita };
  });

  if (!creada.ok) {
    res.status(creada.status).json({ error: creada.error });
    return;
  }
  await encolarGuardarCita(req.userId!, creada.cita.id);
  res.status(201).json(await repo().findOneByOrFail({ id: creada.cita.id }));
}));

// ─── PATCH /api/calendario/:id ────────────────────────────────────────────────
router.patch('/:id', validateBody(EditarCitaSchema), ah(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof EditarCitaSchema>;

  const resultado = await AppDataSource.transaction(async (manager) => {
    const cita = await manager.findOne(Cita, { where: { id: req.params.id, usuario_id: req.userId! } });
    if (!cita) return { ok: false as const, status: 404, error: 'Cita no encontrada' };

    const horaInicio = body.hora_inicio ?? cita.hora_inicio;
    const horaFin = body.hora_fin ?? cita.hora_fin;
    if (minutos(horaFin) <= minutos(horaInicio)) {
      return { ok: false as const, status: 400, error: MSG_HORAS.message };
    }

    // Cambiar el cliente pasa por el mismo servicio que el alta: sin esto se
    // podía enlazar la cita a un cliente de otra cuenta.
    if ('cliente_id' in body || body.crear_cliente) {
      const resCliente = await resolverClienteParaVenta(manager, {
        usuarioId:     req.userId!,
        trabajadorId:  req.trabajadorRealId ?? null,
        negocioId:     cita.negocio_id,
        productoId:    cita.producto_id,
        clienteId:     body.cliente_id ?? null,
        crearCliente:  body.cliente_id ? null : body.crear_cliente ?? null,
        nombreLibre:   body.cliente_nombre ?? cita.cliente_nombre,
        telefonoLibre: body.cliente_telefono ?? cita.cliente_telefono,
        hoy: await hoyDePeticion(req),
      });
      if (!resCliente.ok) return resCliente;
      cita.cliente_id = resCliente.cliente_id;
      cita.cliente_nombre = resCliente.cliente_nombre;
      cita.cliente_telefono = resCliente.cliente_telefono;
    } else {
      if ('cliente_nombre' in body) cita.cliente_nombre = body.cliente_nombre || null;
      if ('cliente_telefono' in body) cita.cliente_telefono = body.cliente_telefono || null;
    }

    if (body.titulo !== undefined) cita.titulo = body.titulo;
    if (body.fecha !== undefined) cita.fecha = body.fecha;
    cita.hora_inicio = horaInicio;
    cita.hora_fin = horaFin;
    if ('cliente_email' in body) cita.cliente_email = body.cliente_email || null;
    if (body.estado !== undefined) cita.estado = body.estado;
    if ('notas' in body) cita.notas = body.notas || null;
    if (body.color !== undefined) cita.color = body.color;

    await manager.save(Cita, cita);
    return { ok: true as const, cita };
  });

  if (!resultado.ok) {
    res.status(resultado.status).json({ error: resultado.error });
    return;
  }
  await encolarGuardarCita(req.userId!, resultado.cita.id);
  res.json(await repo().findOneByOrFail({ id: resultado.cita.id }));
}));

// ─── DELETE /api/calendario/:id ───────────────────────────────────────────────
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
  const cita = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cita) { res.status(404).json({ error: 'Cita no encontrada' }); return; }
  const eventId = cita.google_event_id;
  await repo().remove(cita);
  await encolarBorrarEvento(req.userId!, eventId);
  res.json({ ok: true });
}));

// ─── POST /api/calendario/:id/whatsapp — recordatorio ────────────────────────
router.post('/:id/whatsapp', ah(async (req: AuthRequest, res: Response) => {
  const cita = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cita) { res.status(404).json({ error: 'Cita no encontrada' }); return; }

  const tel = cita.cliente_telefono
    ? telefonoWhatsApp(cita.cliente_telefono, await paisDeCuenta(req.userId!, cita.producto_id))
    : '';
  if (!tel) { res.status(400).json({ error: 'El cliente no tiene teléfono' }); return; }

  const fechaFmt = new Date(cita.fecha + 'T12:00:00Z').toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
  const msg = `Hola ${cita.cliente_nombre?.split(' ')[0] || ''}. Te recuerdo tu cita *${cita.titulo}* el *${fechaFmt}* de *${cita.hora_inicio.slice(0, 5)}* a *${cita.hora_fin.slice(0, 5)}*. ¿Confirmas tu asistencia?`;
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;

  res.json({ whatsapp_url: url });
}));

export default router;
