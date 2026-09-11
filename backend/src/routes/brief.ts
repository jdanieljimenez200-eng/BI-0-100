import { Router, Request, Response } from 'express';
import { Not } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { AnalisisBrief } from '../models/AnalisisBrief';
import { Producto } from '../models/Producto';
import { authenticate } from '../middleware/auth';
import { requireCanRunAnalisis, getPlanFromDB } from '../middleware/requirePlan';
import { respuestaAnalisis } from '../services/billing/redactAnalisis';
import { requireAnalisisLock } from '../middleware/idempotency';
import { validateBody } from '../middleware/validate';
import { logger } from '../utils/logger';
import { analysisQueue } from '../workers/analysisQueue';

const router = Router();

// El body real que manda el formulario (frontend/app/dashboard/marca/page.tsx).
// La mayoría de los campos son texto libre por diseño (el formulario permite
// "otro" con texto custom en varios de ellos), así que solo se acota tamaño;
// `paleta_elegida`, `posicionamiento` y `nivel_diferenciacion` sí son selección
// fija (RadioCard sin escape a texto libre) y se validan como enum real.
const AnalizarBriefSchema = z
  .object({
    producto_id: z.string().uuid().optional(),
    productoId: z.string().uuid().optional(),
    percepcion: z.array(z.string().max(200)).max(20).optional(),
    emocion: z.string().min(1).max(200),
    anti_valores: z.array(z.string().max(200)).max(20).optional(),
    estilo_visual: z.string().min(1).max(200),
    paleta_elegida: z.enum(['A', 'B', 'C']),
    tipo_logo: z.string().min(1).max(200),
    simbolo_representativo: z.string().max(300).optional(),
    resultado_cliente: z.string().max(500).optional(),
    tono_comunicacion: z.string().min(1).max(200),
    posicionamiento: z.enum([
      'Líder de precio (más barato)',
      'Calidad premium (mejor calidad)',
      'Especialista (nicho específico)',
      'Innovador (primero en su tipo)',
      'Confiable (el de siempre)',
    ]),
    nivel_diferenciacion: z.enum([
      'Bajo (similar a competencia)',
      'Medio (algunas diferencias)',
      'Alto (claramente distinto)',
      'Único (sin comparación directa)',
    ]),
  })
  .refine((d) => Boolean(d.producto_id ?? d.productoId), {
    message: 'producto_id es requerido',
    path: ['producto_id'],
  });

// Freemium: el límite de brief es GLOBAL POR CUENTA (1 por usuario), no por
// producto como el resto de módulos. Por eso se ignora el productoId que
// requireCanRunAnalisis pasa como segundo argumento: la firma se mantiene para
// respetar el contrato del middleware. Los fallidos no consumen cuota.
const contarAnalisisBrief = (usuarioId: string, _productoId?: string): Promise<number> =>
  AppDataSource.getRepository(AnalisisBrief).count({
    where: {
      usuario_id: usuarioId,
      estado_analisis: Not('error'),
    },
  });

// POST /api/brief/analizar
router.post(
  '/analizar',
  authenticate,
  requireAnalisisLock('brief'),
  requireCanRunAnalisis(contarAnalisisBrief),
  validateBody(AnalizarBriefSchema),
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
    const analisisRepo = AppDataSource.getRepository(AnalisisBrief);
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
          moduleName: 'brief',
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
      logger.error('[brief] Failed to enqueue job:', enqueueErr);
      await analisisRepo.update(analisis.id, {
        estado_analisis: 'error',
        error_mensaje: 'No se pudo encolar el análisis. Reintenta.',
      });
      return res.status(503).json({ error: 'Servicio de análisis temporalmente no disponible' });
    }

    res.status(202).json({ analisis_id: analisis.id });
  } catch (err: unknown) {
    logger.error('POST /api/brief/analizar error:', err);
    res.status(500).json({ error: 'Error al crear análisis' });
  }
}
);

// GET /api/brief/recientes — últimos 20 completados del usuario (recortados por plan)
router.get('/recientes', authenticate, async (req: any, res: Response) => {
  try {
    const lista = await AppDataSource.getRepository(AnalisisBrief).find({
      where: { usuario_id: req.userId, estado_analisis: 'completado' },
      order: { fecha_creacion: 'DESC' },
      take: 20,
    });
    const plan = await getPlanFromDB(req.userId);
    res.json(lista.map((fila) => respuestaAnalisis('brief', plan, fila)));
  } catch (err: unknown) {
    logger.error('GET /api/brief/recientes error:', err);
    res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// GET /api/brief/producto/:productoId — último análisis del producto (para vincular módulos)
router.get('/producto/:productoId', authenticate, async (req: any, res: Response) => {
  try {
    // Verificar que el producto pertenezca al usuario
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: req.params.productoId, usuario_id: req.userId },
    });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const analisis = await AppDataSource.getRepository(AnalisisBrief).findOne({
      where: {
        producto_id: req.params.productoId,
        usuario_id: req.userId,
        estado_analisis: Not('error'),
      },
      order: { fecha_creacion: 'DESC' },
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Sin análisis previos para este producto' });
    }
    const plan = await getPlanFromDB(req.userId);
    return res.json(respuestaAnalisis('brief', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/brief/producto/:productoId error:', err);
    res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// GET /api/brief/:id — detalle completo del análisis (scoped al dueño)
router.get('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisBrief).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Análisis no encontrado' });
    }
    const plan = await getPlanFromDB(req.userId);
    res.json(respuestaAnalisis('brief', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/brief/:id error:', err);
    res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// GET /api/brief/:id/status
router.get('/:id/status', authenticate, async (req: any, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisBrief).findOne({
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
    logger.error('GET /api/brief/:id/status error:', err);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

export default router;
