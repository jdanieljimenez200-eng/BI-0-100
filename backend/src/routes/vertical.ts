import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { authenticate, AuthRequest } from '../middleware/auth';
import { puedeElegirVertical } from '../services/vertical/verticalService';
import { ah } from '../utils/asyncHandler';

const router = Router();

/**
 * POST /api/vertical/elegir
 * Fija la profesión (vertical) del usuario. Solo funciona UNA vez: si el
 * usuario ya tiene vertical_activo responde 409 — la elección es irreversible
 * por diseño. NO existe ningún PATCH/PUT sobre vertical_activo: esa ausencia
 * es lo que garantiza la inmutabilidad.
 */
router.post(
  '/elegir',
  authenticate,
  [body('vertical').isString().trim().notEmpty()],
  ah(async (req: AuthRequest, res: Response) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array() });
    }

    const { vertical } = req.body as { vertical: string };
    const repo = AppDataSource.getRepository(Usuario);

    const usuario = await repo.findOne({ where: { id: req.userId } });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const decision = puedeElegirVertical(usuario.vertical_activo ?? null, vertical);
    if (!decision.ok) {
      if (decision.motivo === 'ya_elegido') {
        return res.status(409).json({
          error: 'Ya elegiste tu profesión y no se puede cambiar',
          vertical_activo: usuario.vertical_activo,
        });
      }
      return res.status(400).json({ error: 'Vertical no válido' });
    }

    usuario.vertical_activo = vertical;
    await repo.save(usuario);

    return res.status(200).json({ vertical_activo: usuario.vertical_activo });
  })
);

export default router;