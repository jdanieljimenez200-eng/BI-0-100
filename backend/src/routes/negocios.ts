import { Router, Response } from 'express';
import { exigirUuid } from '../middleware/validate';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { Negocio } from '../models/Negocio';
import { ah } from '../utils/asyncHandler';

const router = Router();
exigirUuid(router, 'id');
router.use(authenticate);

const NegocioInputSchema = z.object({
  nombre: z.string().min(2).max(80),
  emoji: z.string().max(10).optional().nullable(),
  descripcion: z.string().max(300).optional().nullable(),
});

// GET /api/negocios
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const negocios = await AppDataSource.getRepository(Negocio).find({
    where: { usuario_id: req.userId! },
    order: { fecha_creacion: 'ASC' },
  });
  res.json(negocios);
}));

// POST /api/negocios
router.post('/', ah(async (req: AuthRequest, res: Response) => {
  const parsed = NegocioInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Datos inválidos',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const repo = AppDataSource.getRepository(Negocio);
  const negocio = repo.create({
    usuario_id: req.userId!,
    nombre: parsed.data.nombre,
    emoji: parsed.data.emoji ?? '',
    descripcion: parsed.data.descripcion ?? undefined,
  });
  await repo.save(negocio);
  return res.status(201).json(negocio);
}));

// PATCH /api/negocios/:id
router.patch('/:id', ah(async (req: AuthRequest, res: Response) => {
  const parsed = NegocioInputSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  const repo = AppDataSource.getRepository(Negocio);
  const negocio = await repo.findOneBy({ id: req.params.id, usuario_id: req.userId! });
  if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
  const updateData: Partial<Pick<Negocio, 'nombre' | 'emoji' | 'descripcion'>> = {};
  if (parsed.data.nombre !== undefined) updateData.nombre = parsed.data.nombre;
  if (parsed.data.emoji !== undefined && parsed.data.emoji !== null) updateData.emoji = parsed.data.emoji;
  if (parsed.data.descripcion !== undefined) updateData.descripcion = parsed.data.descripcion ?? undefined;
  await repo.update(negocio.id, updateData);
  return res.json(await repo.findOneBy({ id: negocio.id }));
}));

// DELETE /api/negocios/:id
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Negocio);
  const negocio = await repo.findOneBy({ id: req.params.id, usuario_id: req.userId! });
  if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
  // Desasociar productos antes de borrar la carpeta
  await AppDataSource.query(
    `UPDATE productos SET negocio_id = NULL WHERE negocio_id = $1 AND usuario_id = $2`,
    [negocio.id, req.userId!],
  );
  await repo.delete(negocio.id);
  return res.json({ message: 'Negocio eliminado' });
}));

export default router;
