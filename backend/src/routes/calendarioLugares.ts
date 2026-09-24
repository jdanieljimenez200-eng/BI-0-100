import { Router, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { exigirUuid, validateBody } from '../middleware/validate';
import { LugarAtencion } from '../models/LugarAtencion';
import { TurnoEspera } from '../models/TurnoEspera';
import { Negocio } from '../models/Negocio';
import { Producto } from '../models/Producto';
import { ah } from '../utils/asyncHandler';

/**
 * Catálogo de lugares de atención, montado en /api/calendario/lugares.
 *
 * Hereda del router padre la autenticación y el gating de la herramienta
 * `citas`: se monta ANTES de las rutas `/:id` de calendario.ts, o `exigirUuid`
 * respondería 400 al ver la palabra "lugares" donde espera un UUID.
 */
const router = Router();
exigirUuid(router, 'id');

const repo = () => AppDataSource.getRepository(LugarAtencion);

const uuidOpcional = z.string().uuid().nullable().optional();

const CamposLugar = {
  nombre: z.string().trim().min(1, 'nombre es requerido').max(60),
  capacidad: z.number().int().min(1).max(999).nullable().optional(),
  orden: z.number().int().min(0).max(9999).optional(),
  activo: z.boolean().optional(),
  negocio_id: uuidOpcional,
  producto_id: uuidOpcional,
};

const CrearLugarSchema = z.object(CamposLugar);
const EditarLugarSchema = z.object(CamposLugar).partial();

/** negocio_id / producto_id tienen que ser de la cuenta, como en las citas. */
async function perteneceALaCuenta(
  cuentaId: string,
  negocioId?: string | null,
  productoId?: string | null
): Promise<string | null> {
  if (negocioId && !(await AppDataSource.manager.exists(Negocio, { where: { id: negocioId, usuario_id: cuentaId } }))) {
    return 'Negocio no encontrado';
  }
  if (productoId && !(await AppDataSource.manager.exists(Producto, { where: { id: productoId, usuario_id: cuentaId } }))) {
    return 'Producto no encontrado';
  }
  return null;
}

// ─── GET /api/calendario/lugares ──────────────────────────────────────────────
// Con `producto_id`, los de ese producto más los compartidos (producto_id NULL),
// igual que el listado de citas. `incluir_inactivos=true` trae los archivados.
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const { producto_id, incluir_inactivos } = req.query as Record<string, string | undefined>;
  if (producto_id && !z.string().uuid().safeParse(producto_id).success) {
    res.status(400).json({ error: 'producto_id debe ser un identificador válido' });
    return;
  }

  const qb = repo()
    .createQueryBuilder('l')
    .where('l.usuario_id = :uid', { uid: req.userId! });
  if (incluir_inactivos !== 'true') qb.andWhere('l.activo = true');
  if (producto_id) qb.andWhere('(l.producto_id = :producto_id OR l.producto_id IS NULL)', { producto_id });

  const lugares = await qb.orderBy('l.orden', 'ASC').addOrderBy('l.nombre', 'ASC').getMany();

  // Ocupación: un lugar está ocupado si tiene un turno en `atendido` (el estado
  // `liberado` es justo lo que lo devuelve a la lista de libres).
  const ocupados = lugares.length
    ? await AppDataSource.getRepository(TurnoEspera).find({
        where: { usuario_id: req.userId!, estado: 'atendido' },
        select: ['id', 'lugar_id', 'cliente_nombre', 'personas', 'hora_atendido'],
      })
    : [];
  const porLugar = new Map(ocupados.filter((t) => t.lugar_id).map((t) => [t.lugar_id!, t]));

  res.json(
    lugares.map((l) => ({
      ...l,
      ocupado_por: porLugar.get(l.id)
        ? {
            turno_id: porLugar.get(l.id)!.id,
            cliente_nombre: porLugar.get(l.id)!.cliente_nombre,
            personas: porLugar.get(l.id)!.personas,
            desde: porLugar.get(l.id)!.hora_atendido,
          }
        : null,
    })),
  );
}));

// ─── POST /api/calendario/lugares ─────────────────────────────────────────────
router.post('/', validateBody(CrearLugarSchema), ah(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof CrearLugarSchema>;

  const ajeno = await perteneceALaCuenta(req.userId!, body.negocio_id, body.producto_id);
  if (ajeno) { res.status(404).json({ error: ajeno }); return; }

  const repetido = await repo()
    .createQueryBuilder('l')
    .where('l.usuario_id = :uid AND l.activo = true AND lower(l.nombre) = lower(:nombre)', {
      uid: req.userId!,
      nombre: body.nombre,
    })
    .getExists();
  if (repetido) { res.status(409).json({ error: `Ya tienes un lugar llamado «${body.nombre}»` }); return; }

  const lugar = repo().create({
    usuario_id: req.userId!,
    creado_por_id: req.trabajadorRealId ?? null,
    negocio_id: body.negocio_id ?? null,
    producto_id: body.producto_id ?? null,
    nombre: body.nombre,
    capacidad: body.capacidad ?? null,
    orden: body.orden ?? 0,
    activo: body.activo ?? true,
  });
  await repo().save(lugar);
  res.status(201).json(lugar);
}));

// ─── PATCH /api/calendario/lugares/:id ────────────────────────────────────────
router.patch('/:id', validateBody(EditarLugarSchema), ah(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof EditarLugarSchema>;
  const lugar = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!lugar) { res.status(404).json({ error: 'Lugar no encontrado' }); return; }

  const ajeno = await perteneceALaCuenta(req.userId!, body.negocio_id, body.producto_id);
  if (ajeno) { res.status(404).json({ error: ajeno }); return; }

  if (body.nombre !== undefined && body.nombre.toLowerCase() !== lugar.nombre.toLowerCase()) {
    const repetido = await repo()
      .createQueryBuilder('l')
      .where('l.usuario_id = :uid AND l.activo = true AND lower(l.nombre) = lower(:nombre) AND l.id <> :id', {
        uid: req.userId!,
        nombre: body.nombre,
        id: lugar.id,
      })
      .getExists();
    if (repetido) { res.status(409).json({ error: `Ya tienes un lugar llamado «${body.nombre}»` }); return; }
  }

  if (body.nombre !== undefined) lugar.nombre = body.nombre;
  if ('capacidad' in body) lugar.capacidad = body.capacidad ?? null;
  if (body.orden !== undefined) lugar.orden = body.orden;
  if (body.activo !== undefined) lugar.activo = body.activo;
  if ('negocio_id' in body) lugar.negocio_id = body.negocio_id ?? null;
  if ('producto_id' in body) lugar.producto_id = body.producto_id ?? null;

  await repo().save(lugar);
  res.json(lugar);
}));

// ─── DELETE /api/calendario/lugares/:id ───────────────────────────────────────
// Con turnos a cuestas se archiva, igual que los insumos del inventario: el
// historial de la fila tiene que seguir diciendo dónde se sentó cada quien.
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
  const lugar = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!lugar) { res.status(404).json({ error: 'Lugar no encontrado' }); return; }

  const conHistorial = await AppDataSource.getRepository(TurnoEspera).exists({
    where: { lugar_id: lugar.id, usuario_id: req.userId! },
  });
  if (!conHistorial) {
    await repo().remove(lugar);
    res.json({ ok: true, archivado: false });
    return;
  }

  await repo().update({ id: lugar.id, usuario_id: req.userId! }, { activo: false });
  res.json({
    ok: true,
    archivado: true,
    mensaje: 'El lugar ya se usó en la fila: se archivó para conservar el historial.',
  });
}));

export default router;
