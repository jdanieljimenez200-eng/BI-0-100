import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { MetaNegocio } from '../models/MetaNegocio';
import { Negocio } from '../models/Negocio';
import { resolverAvanceMetas } from '../services/alertas/agregadorOperativo';
import { ah } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTO_MAX = 1_000_000_000_000;

const MetaBaseSchema = z.object({
  nombre: z.string().min(2).max(200),
  tipo: z.enum(['ingresos', 'ventas', 'personalizada']),
  objetivo: z.number().positive().max(MONTO_MAX),
  avance_manual: z.number().min(0).max(MONTO_MAX).optional(),
  periodo_inicio: z.string().regex(FECHA_RE, 'Formato esperado YYYY-MM-DD'),
  periodo_fin: z.string().regex(FECHA_RE, 'Formato esperado YYYY-MM-DD'),
  negocio_id: z.string().uuid().nullable().optional(),
  notas: z.string().max(500).nullable().optional(),
  activa: z.boolean().optional(),
});

// Comparar YYYY-MM-DD como texto es equivalente a comparar fechas.
const MetaInputSchema = MetaBaseSchema.refine((d) => d.periodo_fin >= d.periodo_inicio, {
  message: 'periodo_fin debe ser igual o posterior a periodo_inicio',
  path: ['periodo_fin'],
});

const MetaPatchSchema = MetaBaseSchema.partial().refine(
  (d) => !d.periodo_inicio || !d.periodo_fin || d.periodo_fin >= d.periodo_inicio,
  { message: 'periodo_fin debe ser igual o posterior a periodo_inicio', path: ['periodo_fin'] },
);

function errores(issues: z.ZodIssue[]) {
  return issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

function serializar(meta: MetaNegocio, actual: number) {
  const objetivo = Number(meta.objetivo);
  return {
    id: meta.id,
    nombre: meta.nombre,
    tipo: meta.tipo,
    objetivo,
    actual,
    porcentaje: objetivo > 0 ? Math.round((actual / objetivo) * 100) : null,
    cumplida: objetivo > 0 && actual >= objetivo,
    avance_manual: Number(meta.avance_manual),
    periodo_inicio: meta.periodo_inicio,
    periodo_fin: meta.periodo_fin,
    negocio_id: meta.negocio_id,
    notas: meta.notas,
    activa: meta.activa,
    fecha_creacion: meta.fecha_creacion,
    fecha_actualizacion: meta.fecha_actualizacion,
  };
}

/** 404 si el negocio no existe o no pertenece al usuario. */
async function negocioValido(negocioId: string, usuarioId: string): Promise<boolean> {
  const negocio = await AppDataSource.getRepository(Negocio).findOneBy({
    id: negocioId,
    usuario_id: usuarioId,
  });
  return negocio !== null;
}

// GET /api/metas?negocio_id=UUID&activa=1
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(MetaNegocio);
  const where: Record<string, unknown> = { usuario_id: req.userId! };

  if (typeof req.query.negocio_id === 'string' && req.query.negocio_id !== '') {
    where.negocio_id = req.query.negocio_id;
  }
  if (req.query.activa === '1' || req.query.activa === 'true') where.activa = true;
  if (req.query.activa === '0' || req.query.activa === 'false') where.activa = false;

  const metas = await repo.find({ where, order: { periodo_fin: 'DESC' }, take: 200 });
  const avances = await resolverAvanceMetas(req.userId!, metas);

  return res.json({
    metas: metas.map((m) => serializar(m, avances.get(m.id) ?? 0)),
    total: metas.length,
  });
}));

// GET /api/metas/:id
router.get('/:id', ah(async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(MetaNegocio);
  const meta = await repo.findOneBy({ id: req.params.id, usuario_id: req.userId! });
  if (!meta) return res.status(404).json({ error: 'Meta no encontrada' });

  const avances = await resolverAvanceMetas(req.userId!, [meta]);
  return res.json(serializar(meta, avances.get(meta.id) ?? 0));
}));

// POST /api/metas
router.post('/', ah(async (req: AuthRequest, res: Response) => {
  const parsed = MetaInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', issues: errores(parsed.error.issues) });
  }
  const datos = parsed.data;

  if (datos.negocio_id && !(await negocioValido(datos.negocio_id, req.userId!))) {
    return res.status(404).json({ error: 'Negocio no encontrado' });
  }

  const repo = AppDataSource.getRepository(MetaNegocio);
  const meta = repo.create({
    usuario_id: req.userId!,
    negocio_id: datos.negocio_id ?? null,
    nombre: datos.nombre,
    tipo: datos.tipo,
    objetivo: datos.objetivo,
    avance_manual: datos.tipo === 'personalizada' ? datos.avance_manual ?? 0 : 0,
    periodo_inicio: datos.periodo_inicio,
    periodo_fin: datos.periodo_fin,
    notas: datos.notas ?? null,
    activa: datos.activa ?? true,
  });
  await repo.save(meta);

  const avances = await resolverAvanceMetas(req.userId!, [meta]);
  return res.status(201).json(serializar(meta, avances.get(meta.id) ?? 0));
}));

// PATCH /api/metas/:id
router.patch('/:id', ah(async (req: AuthRequest, res: Response) => {
  const parsed = MetaPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', issues: errores(parsed.error.issues) });
  }

  const repo = AppDataSource.getRepository(MetaNegocio);
  const meta = await repo.findOneBy({ id: req.params.id, usuario_id: req.userId! });
  if (!meta) return res.status(404).json({ error: 'Meta no encontrada' });

  const datos = parsed.data;
  if (datos.negocio_id && !(await negocioValido(datos.negocio_id, req.userId!))) {
    return res.status(404).json({ error: 'Negocio no encontrado' });
  }

  // El rango final debe seguir siendo coherente al combinar con lo ya guardado.
  const inicioFinal = datos.periodo_inicio ?? meta.periodo_inicio;
  const finFinal = datos.periodo_fin ?? meta.periodo_fin;
  if (finFinal < inicioFinal) {
    return res.status(400).json({
      error: 'Datos inválidos',
      issues: [{ path: 'periodo_fin', message: 'periodo_fin debe ser igual o posterior a periodo_inicio' }],
    });
  }

  if (datos.nombre !== undefined) meta.nombre = datos.nombre;
  if (datos.tipo !== undefined) meta.tipo = datos.tipo;
  if (datos.objetivo !== undefined) meta.objetivo = datos.objetivo;
  if (datos.avance_manual !== undefined) meta.avance_manual = datos.avance_manual;
  if (datos.periodo_inicio !== undefined) meta.periodo_inicio = datos.periodo_inicio;
  if (datos.periodo_fin !== undefined) meta.periodo_fin = datos.periodo_fin;
  if (datos.negocio_id !== undefined) meta.negocio_id = datos.negocio_id ?? null;
  if (datos.notas !== undefined) meta.notas = datos.notas ?? null;
  if (datos.activa !== undefined) meta.activa = datos.activa;

  // Cambiar a un tipo automático deja sin efecto el avance manual.
  if (meta.tipo !== 'personalizada') meta.avance_manual = 0;

  await repo.save(meta);
  const avances = await resolverAvanceMetas(req.userId!, [meta]);
  return res.json(serializar(meta, avances.get(meta.id) ?? 0));
}));

// DELETE /api/metas/:id
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(MetaNegocio);
  const meta = await repo.findOneBy({ id: req.params.id, usuario_id: req.userId! });
  if (!meta) return res.status(404).json({ error: 'Meta no encontrada' });

  await repo.delete(meta.id);
  return res.json({ message: 'Meta eliminada' });
}));

export default router;