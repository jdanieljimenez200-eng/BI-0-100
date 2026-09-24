import { Router, Response } from 'express';
import { z } from 'zod';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { exigirUuid, fechaISO, validateBody } from '../middleware/validate';
import { requireHerramientaAccess } from '../middleware/requirePlan';
import { idempotente } from '../middleware/idempotency';
import { TurnoEspera, EstadoTurno } from '../models/TurnoEspera';
import { LugarAtencion } from '../models/LugarAtencion';
import { Negocio } from '../models/Negocio';
import { Producto } from '../models/Producto';
import { ah } from '../utils/asyncHandler';
import { hoyDePeticion } from '../utils/fechaLocal';
import { resolverClienteParaVenta } from '../services/crm/resolverCliente';

/**
 * Fila de espera del día, montada en /api/calendario/espera.
 *
 * Quien llega sin cita se anota aquí: nombre, cuántos son y, cuando le toca,
 * en qué lugar se le atiende. Hereda autenticación y gating de `citas` del
 * router padre, y se monta ANTES de las rutas `/:id` de calendario.ts.
 */
const router = Router();
exigirUuid(router, 'id');

const repo = () => AppDataSource.getRepository(TurnoEspera);

// Tope freemium: cada turno anotado cuenta como un movimiento de la herramienta.
// Contador propio: el de citas se deja como estaba para no cambiar su límite.
const contarTurnos = (cuentaId: string) => repo().count({ where: { usuario_id: cuentaId } });

const uuidOpcional = z.string().uuid().nullable().optional();
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();

const CamposTurno = {
  cliente_nombre: z.string().trim().min(1, 'El nombre es requerido').max(200),
  cliente_telefono: textoOpcional(30),
  personas: z.number().int().min(1).max(999).optional(),
  notas: textoOpcional(2000),
  lugar_id: uuidOpcional,
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

const CrearTurnoSchema = z.object(CamposTurno);
const EditarTurnoSchema = z.object(CamposTurno).partial();
const EstadoSchema = z.object({
  estado: z.enum(['atendido', 'liberado', 'no_llego', 'esperando']),
  lugar_id: uuidOpcional,
});

/** El lugar, el negocio y el producto tienen que ser de la cuenta. */
async function referenciasDeLaCuenta(
  manager: EntityManager,
  cuentaId: string,
  refs: { lugarId?: string | null; negocioId?: string | null; productoId?: string | null }
): Promise<string | null> {
  if (refs.negocioId && !(await manager.exists(Negocio, { where: { id: refs.negocioId, usuario_id: cuentaId } }))) {
    return 'Negocio no encontrado';
  }
  if (refs.productoId && !(await manager.exists(Producto, { where: { id: refs.productoId, usuario_id: cuentaId } }))) {
    return 'Producto no encontrado';
  }
  if (refs.lugarId && !(await manager.exists(LugarAtencion, { where: { id: refs.lugarId, usuario_id: cuentaId } }))) {
    return 'Lugar no encontrado';
  }
  return null;
}

/** ¿Hay alguien sentado ya en ese lugar? Evita sentar a dos grupos en la misma mesa. */
async function lugarOcupadoPor(manager: EntityManager, cuentaId: string, lugarId: string, turnoId: string) {
  return manager.findOne(TurnoEspera, {
    where: { usuario_id: cuentaId, lugar_id: lugarId, estado: 'atendido' },
    select: ['id', 'cliente_nombre'],
  }).then((t) => (t && t.id !== turnoId ? t : null));
}

// ─── GET /api/calendario/espera ───────────────────────────────────────────────
// Fila de un día (por defecto hoy, en la zona del negocio). Es un listado corto
// de una jornada: no necesita cursor.
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const { fecha, producto_id } = req.query as Record<string, string | undefined>;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ error: 'fecha inválida (YYYY-MM-DD)' });
    return;
  }
  if (producto_id && !z.string().uuid().safeParse(producto_id).success) {
    res.status(400).json({ error: 'producto_id debe ser un identificador válido' });
    return;
  }

  const dia = fecha ?? (await hoyDePeticion(req));
  const qb = repo()
    .createQueryBuilder('t')
    .where('t.usuario_id = :uid', { uid: req.userId! })
    .andWhere('t.fecha = :dia', { dia });
  if (producto_id) qb.andWhere('(t.producto_id = :producto_id OR t.producto_id IS NULL)', { producto_id });

  const turnos = await qb.orderBy('t.hora_llegada', 'ASC').getMany();
  res.json({ fecha: dia, turnos });
}));

// ─── POST /api/calendario/espera ──────────────────────────────────────────────
router.post(
  '/',
  idempotente('turno'),
  requireHerramientaAccess('citas', contarTurnos),
  validateBody(CrearTurnoSchema),
  ah(async (req: AuthRequest, res: Response) => {
    const body = req.body as z.infer<typeof CrearTurnoSchema>;
    const hoy = await hoyDePeticion(req);

    const creado = await AppDataSource.transaction(async (manager) => {
      const ajeno = await referenciasDeLaCuenta(manager, req.userId!, {
        lugarId: body.lugar_id,
        negocioId: body.negocio_id,
        productoId: body.producto_id,
      });
      if (ajeno) return { ok: false as const, status: 404, error: ajeno };

      // El CRM solo entra en juego si lo piden: la fila va deprisa y casi
      // siempre son datos sueltos de alguien que pasaba por ahí.
      let clienteId: string | null = null;
      let nombre = body.cliente_nombre;
      let telefono = body.cliente_telefono ?? null;

      if (body.cliente_id || body.crear_cliente) {
        const resCliente = await resolverClienteParaVenta(manager, {
          usuarioId: req.userId!,
          trabajadorId: req.trabajadorRealId ?? null,
          negocioId: body.negocio_id ?? null,
          productoId: body.producto_id ?? null,
          clienteId: body.cliente_id ?? null,
          crearCliente: body.cliente_id ? null : body.crear_cliente ?? null,
          nombreLibre: body.cliente_nombre,
          telefonoLibre: body.cliente_telefono ?? null,
          hoy,
        });
        if (!resCliente.ok) return resCliente;
        clienteId = resCliente.cliente_id;
        nombre = resCliente.cliente_nombre || body.cliente_nombre;
        telefono = resCliente.cliente_telefono ?? telefono;
      }

      const turno = manager.create(TurnoEspera, {
        usuario_id: req.userId!,
        creado_por_id: req.trabajadorRealId ?? null,
        negocio_id: body.negocio_id ?? null,
        producto_id: body.producto_id ?? null,
        cliente_id: clienteId,
        lugar_id: body.lugar_id ?? null,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        personas: body.personas ?? 1,
        notas: body.notas || null,
        fecha: hoy,
        estado: 'esperando' as EstadoTurno,
      });
      await manager.save(TurnoEspera, turno);
      return { ok: true as const, turno };
    });

    if (!creado.ok) {
      res.status(creado.status).json({ error: creado.error });
      return;
    }
    res.status(201).json(creado.turno);
  }),
);

// ─── PATCH /api/calendario/espera/:id ─────────────────────────────────────────
router.patch('/:id', validateBody(EditarTurnoSchema), ah(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof EditarTurnoSchema>;

  const resultado = await AppDataSource.transaction(async (manager) => {
    const turno = await manager.findOne(TurnoEspera, { where: { id: req.params.id, usuario_id: req.userId! } });
    if (!turno) return { ok: false as const, status: 404, error: 'Turno no encontrado' };

    const ajeno = await referenciasDeLaCuenta(manager, req.userId!, { lugarId: body.lugar_id });
    if (ajeno) return { ok: false as const, status: 404, error: ajeno };

    if ('lugar_id' in body && body.lugar_id) {
      const ocupado = await lugarOcupadoPor(manager, req.userId!, body.lugar_id, turno.id);
      if (ocupado) {
        return { ok: false as const, status: 409, error: `Ese lugar lo ocupa ${ocupado.cliente_nombre}` };
      }
    }

    if (body.cliente_nombre !== undefined) turno.cliente_nombre = body.cliente_nombre;
    if ('cliente_telefono' in body) turno.cliente_telefono = body.cliente_telefono || null;
    if (body.personas !== undefined) turno.personas = body.personas;
    if ('notas' in body) turno.notas = body.notas || null;
    if ('lugar_id' in body) turno.lugar_id = body.lugar_id ?? null;

    await manager.save(TurnoEspera, turno);
    return { ok: true as const, turno };
  });

  if (!resultado.ok) {
    res.status(resultado.status).json({ error: resultado.error });
    return;
  }
  res.json(resultado.turno);
}));

// ─── POST /api/calendario/espera/:id/llamar ───────────────────────────────────
// Marca el llamado y, si hay teléfono, devuelve el enlace de WhatsApp con el
// mensaje escrito (igual que el recordatorio de citas: la app nunca envía sola).
router.post('/:id/llamar', ah(async (req: AuthRequest, res: Response) => {
  const turno = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!turno) { res.status(404).json({ error: 'Turno no encontrado' }); return; }
  if (turno.estado !== 'esperando' && turno.estado !== 'llamado') {
    res.status(400).json({ error: 'Este turno ya no está en la fila' });
    return;
  }

  turno.estado = 'llamado';
  turno.hora_llamado = new Date();
  await repo().save(turno);

  const tel = (turno.cliente_telefono || '').replace(/[^\d]/g, '');
  let whatsapp_url: string | null = null;
  if (tel) {
    const lugar = turno.lugar_id
      ? await AppDataSource.getRepository(LugarAtencion).findOne({
          where: { id: turno.lugar_id, usuario_id: req.userId! },
          select: ['nombre'],
        })
      : null;
    const donde = lugar ? ` Te esperamos en *${lugar.nombre}*.` : '';
    const msg = `Hola ${turno.cliente_nombre.split(' ')[0]}. Ya es tu turno.${donde} Cuando quieras, pasa.`;
    whatsapp_url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
  }

  // Sin teléfono no es un error: se llama de viva voz y queda marcado en pantalla.
  res.json({ turno, whatsapp_url });
}));

// ─── POST /api/calendario/espera/:id/estado ───────────────────────────────────
const TRANSICIONES: Record<string, EstadoTurno[]> = {
  atendido: ['esperando', 'llamado'],
  liberado: ['atendido'],
  no_llego: ['esperando', 'llamado'],
  esperando: ['llamado', 'no_llego'],
};

router.post('/:id/estado', validateBody(EstadoSchema), ah(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof EstadoSchema>;

  const resultado = await AppDataSource.transaction(async (manager) => {
    const turno = await manager.findOne(TurnoEspera, { where: { id: req.params.id, usuario_id: req.userId! } });
    if (!turno) return { ok: false as const, status: 404, error: 'Turno no encontrado' };

    if (!TRANSICIONES[body.estado].includes(turno.estado)) {
      return {
        ok: false as const,
        status: 400,
        error: `Un turno «${turno.estado}» no puede pasar a «${body.estado}»`,
      };
    }

    if (body.estado === 'atendido') {
      const lugarId = body.lugar_id ?? turno.lugar_id;
      if (!lugarId) return { ok: false as const, status: 400, error: 'Elige el lugar donde lo vas a atender' };

      const ajeno = await referenciasDeLaCuenta(manager, req.userId!, { lugarId });
      if (ajeno) return { ok: false as const, status: 404, error: ajeno };

      const ocupado = await lugarOcupadoPor(manager, req.userId!, lugarId, turno.id);
      if (ocupado) return { ok: false as const, status: 409, error: `Ese lugar lo ocupa ${ocupado.cliente_nombre}` };

      turno.lugar_id = lugarId;
      turno.hora_atendido = new Date();
    }
    if (body.estado === 'liberado') turno.hora_liberado = new Date();
    if (body.estado === 'esperando') {
      // Deshacer un llamado o un "no llegó" por error.
      turno.hora_llamado = null;
    }

    turno.estado = body.estado;
    await manager.save(TurnoEspera, turno);
    return { ok: true as const, turno };
  });

  if (!resultado.ok) {
    res.status(resultado.status).json({ error: resultado.error });
    return;
  }
  res.json(resultado.turno);
}));

// ─── DELETE /api/calendario/espera/:id ────────────────────────────────────────
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
  const turno = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!turno) { res.status(404).json({ error: 'Turno no encontrado' }); return; }
  await repo().remove(turno);
  res.json({ ok: true });
}));

export default router;
