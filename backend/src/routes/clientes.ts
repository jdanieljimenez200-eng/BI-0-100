import { Router, Response } from 'express';
import { z } from 'zod';
import { exigirUuid, fechaISOOpcional, validateBody } from '../middleware/validate';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { Cliente } from '../models/Cliente';
import { Cita } from '../models/Cita';
import { Usuario } from '../models/Usuario';
import { Negocio } from '../models/Negocio';
import { Producto } from '../models/Producto';
import { camposExpedientePorVertical, filtrarAtributosPermitidos } from '../services/vertical/camposExpediente';
import { ah } from '../utils/asyncHandler';
import { hoyDePeticion } from '../utils/fechaLocal';
import { idempotente } from '../middleware/idempotency';
import { leerLimite, paginar, responderPagina } from '../utils/paginacion';

// Longitudes = columnas de `clientes`: sin tope, un texto largo era un 500.
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();
const ClienteSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido').max(200),
  empresa: textoOpcional(200),
  email: textoOpcional(200),
  telefono: textoOpcional(30),
  direccion: textoOpcional(2000),
  notas: textoOpcional(10000),
  categoria: textoOpcional(100),
  // varchar(8) cuenta caracteres, no unidades UTF-16 (un emoji compuesto ocupa varias).
  emoji: z.string().refine((e) => [...e].length <= 8, 'emoji demasiado largo').nullable().optional(),
  estado: z.enum(['lead', 'cliente', 'inactivo']).optional(),
  fecha_ultimo_contacto: fechaISOOpcional('fecha_ultimo_contacto inválida (YYYY-MM-DD)'),
  negocio_id: z.string().uuid().nullable().optional(),
  producto_id: z.string().uuid().nullable().optional(),
  atributos_extra: z.record(z.unknown()).optional(),
});
// Al editar no se cambia a qué negocio/producto pertenece (el formulario los reenvía igual).
const EditarClienteSchema = ClienteSchema.partial().extend({ activo: z.boolean().optional() });

const router = Router();
exigirUuid(router, 'id');
router.use(authenticate);
router.use(requireToolCapability('clientes'));
// Desbloqueo por plan/selección para todas las rutas (sin getCount: el tope de
// movimientos no debe bloquear lecturas).
router.use(requireHerramientaAccess('clientes'));

// Tope freemium: cada cliente registrado cuenta como un movimiento.
const contarClientes = (cuentaId: string) =>
  AppDataSource.getRepository(Cliente).count({ where: { usuario_id: cuentaId } });

const repo = () => AppDataSource.getRepository(Cliente);
const citaRepo = () => AppDataSource.getRepository(Cita);

// ─── GET /api/clientes — list con búsqueda y filtros ─────────────────────────
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const { q, estado, categoria, negocio_id, producto_id } = req.query as Record<string, string | undefined>;

  const qb = repo()
    .createQueryBuilder('c')
    .where('c.usuario_id = :uid', { uid: req.userId! });

  if (estado) qb.andWhere('c.estado = :estado', { estado });
  if (categoria) qb.andWhere('c.categoria = :categoria', { categoria });
  if (negocio_id) qb.andWhere('(c.negocio_id = :negocio_id OR c.negocio_id IS NULL)', { negocio_id });
  if (producto_id) qb.andWhere('(c.producto_id = :producto_id OR c.producto_id IS NULL)', { producto_id });

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    qb.andWhere(
      '(c.nombre ILIKE :t OR c.empresa ILIKE :t OR c.email ILIKE :t OR c.telefono ILIKE :t)',
      { t: term }
    );
  }

  const pagina = await paginar(
    qb,
    [{ expr: 'c.fecha_actualizacion', tipo: 'timestamp' }, { expr: 'c.id', tipo: 'uuid' }],
    req.query.antes,
    leerLimite(req.query.limite)
  );
  if (!pagina) { res.status(400).json({ error: 'Cursor de paginación inválido' }); return; }
  responderPagina(res, pagina);
}));

// ─── GET /api/clientes/expediente/campos — definición de campos del vertical ──
router.get('/expediente/campos', ah(async (req: AuthRequest, res: Response) => {
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    where: { id: req.userId! },
    select: ['id', 'vertical_activo'],
  });
  res.json({
    vertical: usuario?.vertical_activo ?? null,
    campos: camposExpedientePorVertical(usuario?.vertical_activo ?? null),
  });
}));

// ─── GET /api/clientes/:id ───────────────────────────────────────────────────
router.get('/:id', ah(async (req: AuthRequest, res: Response) => {
  const cliente = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cliente) { res.status(404).json({ error: 'Cliente no encontrado' }); return; }
  res.json(cliente);
}));

// ─── GET /api/clientes/:id/citas — agenda del expediente ─────────────────────
router.get('/:id/citas', ah(async (req: AuthRequest, res: Response) => {
  const cliente = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cliente) { res.status(404).json({ error: 'Cliente no encontrado' }); return; }

  const citas = await citaRepo().find({
    where: { usuario_id: req.userId!, cliente_id: cliente.id },
    order: { fecha: 'DESC', hora_inicio: 'DESC' },
    take: 200,
  });
  res.json(citas);
}));

// ─── POST /api/clientes ──────────────────────────────────────────────────────
router.post('/', idempotente('cliente'), requireHerramientaAccess('clientes', contarClientes), validateBody(ClienteSchema), ah(async (req: AuthRequest, res: Response) => {
  const { nombre, empresa, email, telefono, direccion, notas, categoria, emoji, estado, negocio_id, producto_id, fecha_ultimo_contacto, atributos_extra } =
    req.body as z.infer<typeof ClienteSchema>;

  // El expediente cuelga de un negocio/producto de ESTA cuenta, o de ninguno.
  if (negocio_id && !(await AppDataSource.getRepository(Negocio).exists({ where: { id: negocio_id, usuario_id: req.userId! } }))) {
    res.status(404).json({ error: 'Negocio no encontrado' });
    return;
  }
  if (producto_id && !(await AppDataSource.getRepository(Producto).exists({ where: { id: producto_id, usuario_id: req.userId! } }))) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }

  // Solo se aceptan las keys declaradas para el vertical del usuario.
  let atributosPermitidos: Record<string, unknown> = {};
  if (atributos_extra && typeof atributos_extra === 'object') {
    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: req.userId! },
      select: ['id', 'vertical_activo'],
    });
    atributosPermitidos = filtrarAtributosPermitidos(
      usuario?.vertical_activo ?? null,
      atributos_extra,
    );
  }

  const cliente = repo().create({
    usuario_id:             req.userId!,
    creado_por_id:          req.trabajadorRealId ?? null,
    negocio_id:             negocio_id ?? null,
    producto_id:            producto_id ?? null,
    nombre:                 nombre.trim(),
    empresa:                empresa?.trim() || null,
    email:                  email?.trim() || null,
    telefono:               telefono?.trim() || null,
    direccion:              direccion?.trim() || null,
    notas:                  notas?.trim() || null,
    categoria:              categoria?.trim() || null,
    emoji:                  emoji ?? null,
    estado:                 estado ?? 'cliente',
    fecha_ultimo_contacto:  fecha_ultimo_contacto ?? null,
    atributos_extra:        atributosPermitidos,
    activo:                 true,
  });

  await repo().save(cliente);
  res.status(201).json(cliente);
}));

// ─── PATCH /api/clientes/:id ─────────────────────────────────────────────────
router.patch('/:id', validateBody(EditarClienteSchema), ah(async (req: AuthRequest, res: Response) => {
  const cliente = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cliente) { res.status(404).json({ error: 'Cliente no encontrado' }); return; }

  const updatable = ['nombre', 'empresa', 'email', 'telefono', 'direccion', 'notas', 'categoria', 'emoji', 'estado', 'activo', 'fecha_ultimo_contacto'] as const;
  for (const k of updatable) {
    if (k in req.body) {
      // El esquema ya descartó nombre/estado vacíos; el resto vacío se guarda como null.
      const valor = req.body[k];
      (cliente as unknown as Record<string, unknown>)[k] = valor === '' ? null : valor;
    }
  }

  // Merge de campos de expediente en atributos_extra. Solo se aceptan las keys
  // declaradas para el vertical del usuario; el resto se descarta. Merge parcial:
  // las keys no enviadas conservan su valor previo.
  if (req.body.atributos_extra && typeof req.body.atributos_extra === 'object') {
    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: req.userId! },
      select: ['id', 'vertical_activo'],
    });
    const permitidos = filtrarAtributosPermitidos(
      usuario?.vertical_activo ?? null,
      req.body.atributos_extra as Record<string, unknown>,
    );
    cliente.atributos_extra = { ...cliente.atributos_extra, ...permitidos };
  }

  await repo().save(cliente);
  res.json(cliente);
}));

// ─── DELETE /api/clientes/:id ────────────────────────────────────────────────
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
  const cliente = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cliente) { res.status(404).json({ error: 'Cliente no encontrado' }); return; }
  await repo().remove(cliente);
  res.json({ ok: true });
}));

// ─── POST /api/clientes/:id/whatsapp — devuelve wa.me link ───────────────────
router.post('/:id/whatsapp', ah(async (req: AuthRequest, res: Response) => {
  const cliente = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cliente) { res.status(404).json({ error: 'Cliente no encontrado' }); return; }

  const { mensaje } = req.body as { mensaje?: string };
  const telefonoLimpio = (cliente.telefono || '').replace(/[^\d]/g, '');
  const base = telefonoLimpio ? `https://wa.me/${telefonoLimpio}` : 'https://wa.me/';
  const msgFinal = mensaje?.trim() || `Hola ${cliente.nombre.split(' ')[0]}.`;
  const url = `${base}?text=${encodeURIComponent(msgFinal)}`;

  // Auto-actualizar fecha_ultimo_contacto
  cliente.fecha_ultimo_contacto = await hoyDePeticion(req);
  await repo().save(cliente);

  res.json({ whatsapp_url: url, cliente });
}));

export default router;
