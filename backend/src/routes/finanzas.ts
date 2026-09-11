import { Router, Request, Response } from 'express';
import { Not } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { Producto } from '../models/Producto';
import { authenticate } from '../middleware/auth';
import { requireCanRunAnalisis, getPlanFromDB } from '../middleware/requirePlan';
import { requirePlanFeature } from '../middleware/requirePlan';
import { respuestaAnalisis } from '../services/billing/redactAnalisis';
import { requireAnalisisLock } from '../middleware/idempotency';
import { validateBody } from '../middleware/validate';
import { logger } from '../utils/logger';
import { analysisQueue } from '../workers/analysisQueue';

const router = Router();

// El body real que manda el formulario (frontend/app/dashboard/finanzas/[productoId]/page.tsx):
// 5 números no-negativos + producto_id. Antes no se validaba nada server-side —
// un valor faltante/NaN se guardaba igual y el análisis quedaba "completado" con
// resultados NaN/Infinity sin ningún error visible.
const AnalizarFinanzasSchema = z
  .object({
    producto_id: z.string().uuid().optional(),
    productoId: z.string().uuid().optional(),
    precio_venta: z.number().finite().nonnegative(),
    costo_variable_unitario: z.number().finite().nonnegative(),
    costos_fijos_mensuales: z.number().finite().nonnegative(),
    unidades_mes_inicial: z.number().finite().nonnegative(),
    tasa_crecimiento_mensual: z.number().finite().nonnegative(),
  })
  .refine((d) => Boolean(d.producto_id ?? d.productoId), {
    message: 'producto_id es requerido',
    path: ['producto_id'],
  })
  .refine((d) => d.precio_venta > d.costo_variable_unitario, {
    message: 'El precio de venta debe ser mayor al costo variable unitario',
    path: ['precio_venta'],
  });

// Freemium: 1 análisis por módulo por producto. Los fallidos no consumen cuota.
const contarAnalisisFinanzas = (usuarioId: string, productoId?: string): Promise<number> =>
  AppDataSource.getRepository(AnalisisFinanzas).count({
    where: {
      usuario_id: usuarioId,
      ...(productoId ? { producto_id: productoId } : {}),
      estado_analisis: Not('error'),
    },
  });

// POST /api/finanzas/analizar
router.post(
  '/analizar',
  authenticate,
  requireAnalisisLock('finanzas'),
  requireCanRunAnalisis(contarAnalisisFinanzas),
  validateBody(AnalizarFinanzasSchema),
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
    const analisisRepo = AppDataSource.getRepository(AnalisisFinanzas);
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
          moduleName: 'finanzas',
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
      logger.error('[finanzas] Failed to enqueue job:', enqueueErr);
      await analisisRepo.update(analisis.id, {
        estado_analisis: 'error',
        error_mensaje: 'No se pudo encolar el análisis. Reintenta.',
      });
      return res.status(503).json({ error: 'Servicio de análisis temporalmente no disponible' });
    }

    res.status(202).json({ analisis_id: analisis.id });
  } catch (err: unknown) {
    logger.error('POST /api/finanzas/analizar error:', err);
    res.status(500).json({ error: 'Error al crear análisis' });
  }
}
);

// PATCH /api/finanzas/:id/overrides — edición de supuestos del Centro de Mando.
// Feature 'centro_mando' (Pro+): se aplica sobre el ÚLTIMO análisis del producto
// o sobre el :id recibido; persiste en overrides_data y la UI recalcula local.
router.patch(
  '/:id/overrides',
  authenticate,
  requirePlanFeature('centro_mando', 'Edición de supuestos (Centro de Mando)'),
  async (req: any, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(AnalisisFinanzas);
      const analisis = await repo.findOne({
        where: { id: req.params.id, usuario_id: req.userId },
      });
      if (!analisis) {
        return res.status(404).json({ error: 'Análisis no encontrado' });
      }

      const body = req.body ?? {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Overrides inválidos' });
      }

      // Solo claves numéricas conocidas; ignora cualquier otra cosa.
      const CLAVES = [
        'precio_venta',
        'costo_variable_unitario',
        'costos_fijos_mensuales',
        'unidades_mes_inicial',
        'tasa_crecimiento_mensual',
      ] as const;
      const limpio: Record<string, number> = {};
      for (const k of CLAVES) {
        const v = Number((body as Record<string, unknown>)[k]);
        if (Number.isFinite(v) && v >= 0) limpio[k] = v;
      }
      if (Object.keys(limpio).length === 0) {
        return res.status(400).json({ error: 'Ningún campo numérico válido para actualizar' });
      }

      analisis.overrides_data = { ...(analisis.overrides_data ?? {}), ...limpio };
      await repo.save(analisis);

      return res.json({ mensaje: 'Supuestos actualizados', overrides_data: analisis.overrides_data });
    } catch (err: unknown) {
      logger.error('PATCH /api/finanzas/:id/overrides error:', err);
      return res.status(500).json({ error: 'Error al guardar supuestos' });
    }
  }
);

// GET /api/finanzas/:id — detalle completo (recortado por plan server-side)
router.get('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisFinanzas).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Análisis no encontrado' });
    }
    const plan = await getPlanFromDB(req.userId);
    res.json(respuestaAnalisis('finanzas', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/finanzas/:id error:', err);
    res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// GET /api/finanzas/:id/status
router.get('/:id/status', authenticate, async (req: any, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisFinanzas).findOne({
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
    logger.error('GET /api/finanzas/:id/status error:', err);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

export default router;
