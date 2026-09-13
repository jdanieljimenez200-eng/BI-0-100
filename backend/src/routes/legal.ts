import { Router, Request, Response } from 'express';
import { Not } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { AnalisisLegal } from '../models/AnalisisLegal';
import { Producto } from '../models/Producto';
import { authenticate } from '../middleware/auth';
import { requireCanRunAnalisis, getPlanFromDB } from '../middleware/requirePlan';
import { respuestaAnalisis } from '../services/billing/redactAnalisis';
import { requireAnalisisLock } from '../middleware/idempotency';
import { validateBody } from '../middleware/validate';
import { logger } from '../utils/logger';
import { analysisQueue } from '../workers/analysisQueue';

const router = Router();

// El body real que manda el formulario (frontend/app/dashboard/legal/[productoId]/page.tsx).
// `forma_juridica` depende del país del producto (lista curada en el frontend, no un
// enum fijo), así que aquí solo se valida que no venga vacía; el resto sí tiene forma fija.
const AnalizarLegalSchema = z
  .object({
    producto_id: z.string().uuid().optional(),
    productoId: z.string().uuid().optional(),
    forma_juridica: z.string().min(1).max(100),
    tiene_empleados: z.boolean(),
    numero_empleados: z.number().finite().int().nonnegative().optional().nullable(),
    vende_en_linea: z.boolean(),
    exporta_importa: z.boolean(),
    giro_especifico: z.string().max(200).optional(),
    estado_constitucion: z.string().max(100).optional(),
    anios_operando: z.enum(['0', '1-2', '3-5', '+5']),
  })
  .refine((d) => Boolean(d.producto_id ?? d.productoId), {
    message: 'producto_id es requerido',
    path: ['producto_id'],
  });

// Freemium: 1 análisis por módulo por producto. Los fallidos no consumen cuota.
const contarAnalisisLegal = (usuarioId: string, productoId?: string): Promise<number> =>
  AppDataSource.getRepository(AnalisisLegal).count({
    where: {
      usuario_id: usuarioId,
      ...(productoId ? { producto_id: productoId } : {}),
      estado_analisis: Not('error'),
      // Si la IA falló y se entregó plantilla, no se cobra el intento.
      resultado_estimado: false,
    },
  });

// POST /api/legal/analizar
router.post(
  '/analizar',
  authenticate,
  requireAnalisisLock('legal'),
  requireCanRunAnalisis(contarAnalisisLegal),
  validateBody(AnalizarLegalSchema),
  async (req: any, res: Response) => {
  try {
    const bodySrc = { ...(req.body ?? {}) };
    // El frontend env�a producto_id (snake); el contrato interno usa productoId.
    const productoId = bodySrc.productoId ?? bodySrc.producto_id;
    delete bodySrc.productoId;
    delete bodySrc.producto_id;
    const payload = bodySrc;
    const usuarioId = req.userId;

    // Validate producto belongs to user
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: productoId, usuario_id: usuarioId },
    });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Create analysis record
    const analisisRepo = AppDataSource.getRepository(AnalisisLegal);
    const analisis = analisisRepo.create({
      producto_id: productoId,
      usuario_id: usuarioId,
      estado_analisis: 'procesando',
    });
    await analisisRepo.save(analisis);

    // Enqueue job — si Redis falla, la fila NUNCA debe quedar 'procesando'
    try {
      await analysisQueue.add(
        'analyze',
        {
          moduleName: 'legal',
          analisisId: analisis.id,
          usuarioId,
          productoId,
          payload,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: { age: 24 * 3600 },
        }
      );
    } catch (enqueueErr) {
      logger.error('[legal] Failed to enqueue job:', enqueueErr);
      await analisisRepo.update(analisis.id, {
        estado_analisis: 'error',
        error_mensaje: 'No se pudo encolar el análisis. Reintenta.',
      });
      return res.status(503).json({ error: 'Servicio de análisis temporalmente no disponible' });
    }

    res.status(202).json({ analisis_id: analisis.id });
  } catch (err: unknown) {
    logger.error('POST /api/legal/analizar error:', err);
    res.status(500).json({ error: 'Error al crear análisis' });
  }
}
);

// GET /api/legal/:id — detalle completo del análisis (scoped al dueño)
router.get('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisLegal).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Análisis no encontrado' });
    }
    const plan = await getPlanFromDB(req.userId);
    res.json(respuestaAnalisis('legal', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/legal/:id error:', err);
    res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// GET /api/legal/:id/status
router.get('/:id/status', authenticate, async (req: any, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisLegal).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Análisis no encontrado' });
    }
    res.json({
      id: analisis.id,
      estado: analisis.estado_analisis,
      error: analisis.error_mensaje,
    });
  } catch (err: unknown) {
    logger.error('GET /api/legal/:id/status error:', err);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

export default router;
