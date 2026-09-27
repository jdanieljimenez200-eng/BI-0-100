import { Router, Response } from 'express';
import { Not } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { Producto } from '../models/Producto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireCanRunAnalisis, getPlanFromDB, requireModuloAcceso } from '../middleware/requirePlan';
import { respuestaAnalisis } from '../services/billing/redactAnalisis';
import { getPlanGate } from '../services/billing/gatingAnalisis';
import { requireAnalisisLock } from '../middleware/idempotency';
import { validateBody, exigirUuid } from '../middleware/validate';
import { logger } from '../utils/logger';
import { MAX_ENTERO } from '../utils/limitesNumericos';
import { analysisQueue } from '../workers/analysisQueue';
import { cobrarCreditos, conCreditos, reembolsarCreditos, responderSinCreditos, CreditosInsuficientesError } from '../services/billing/creditosIA';
import { recibirReporteAds } from '../middleware/upload';
import {
  procesarReporteAdsCompleto,
  ReporteAdsError,
  ReporteAdsOutputSchema,
} from '../services/marketing/reporteAdsService';


const router = Router();
exigirUuid(router, 'id', 'productoId');
// Dueño, o trabajador con el permiso del módulo sobre la cuenta del dueño.
const acceso = [authenticate, requireModuloAcceso('marketing')];

// El body real que manda el formulario (frontend/app/dashboard/marketing/[productoId]/page.tsx).
// Antes un comentario en el frontend afirmaba que un id de plataforma fuera de
// este enum hacía fallar el POST con 400 — eso era falso, no existía ninguna
// validación server-side. Este schema sí la aplica de verdad.
const PLATAFORMAS = [
  'Instagram',
  'TikTok',
  'Facebook',
  'WhatsApp',
  'LinkedIn',
  'YouTube',
  'Twitter',
  'Pinterest',
  'Threads',
  'Telegram',
  'Snapchat',
  'Reddit',
] as const;

const AnalizarMarketingSchema = z
  .object({
    producto_id: z.string().uuid().optional(),
    productoId: z.string().uuid().optional(),
    voz_marca: z.enum(['Profesional', 'Divertido', 'Urgente', 'Empático']),
    meta_campana: z.enum(['Lanzamiento', 'Crecimiento']).optional(),
    metaCampana: z.enum(['Lanzamiento', 'Crecimiento']).optional(),
    // La columna es `integer`: se aceptan centavos (el worker redondea al
    // guardar) pero no un número que no quepa.
    presupuesto_mensual: z.number().finite().positive().max(MAX_ENTERO),
    presupuestoMensual: z.number().finite().positive().max(MAX_ENTERO).optional(),
    capacidad_contenido: z.enum(['1-2/semana', '3-4/semana', 'diario']),
    capacidadContenido: z.enum(['1-2/semana', '3-4/semana', 'diario']).optional(),
    plataformas: z.array(z.enum(PLATAFORMAS)).min(1).max(12),
    cliente_ideal: z.string().max(1000).optional(),
    clienteIdeal: z.string().max(1000).optional(),
    canal_cierre: z.enum(['whatsapp_dm', 'ecommerce_web', 'llamada', 'tienda_fisica']).optional(),
    canalCierre: z.enum(['whatsapp_dm', 'ecommerce_web', 'llamada', 'tienda_fisica']).optional(),
    nivel_traccion: z.enum(['desde_cero', 'en_marcha', 'escalando']).optional(),
    nivelTraccion: z.enum(['desde_cero', 'en_marcha', 'escalando']).optional(),
    margen_estimado: z.enum(['bajo_30', 'medio_30_50', 'alto_50_70', 'premium_70_plus']).optional(),
    margenEstimado: z.enum(['bajo_30', 'medio_30_50', 'alto_50_70', 'premium_70_plus']).optional(),
    analisis_mercado_id: z.string().uuid().optional(),
    analisisMercadoId: z.string().uuid().optional(),
    brief_analisis_id: z.string().uuid().optional(),
    briefAnalisisId: z.string().uuid().optional(),
    ventas_analisis_id: z.string().uuid().optional(),
    ventasAnalisisId: z.string().uuid().optional(),
    reporte_ads: ReporteAdsOutputSchema.optional(),
    reporteAds: ReporteAdsOutputSchema.optional(),
  })
  .refine((d) => Boolean(d.producto_id ?? d.productoId), {
    message: 'producto_id es requerido',
    path: ['producto_id'],
  });

/**
 * Regex UUID v1-5. Necesario validar antes de pasarlo a TypeORM: sin esto,
 * un productoId vacio o invalido genera findOne con id = NULL y devuelve
 * cualquier producto (o ninguno de forma silenciosa).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Freemium: 1 analisis por modulo por producto. Los fallidos no consumen cuota.
const contarAnalisisMarketing = (usuarioId: string, productoId?: string): Promise<number> =>
  AppDataSource.getRepository(AnalisisMarketing).count({
    where: {
      usuario_id: usuarioId,
      ...(productoId ? { producto_id: productoId } : {}),
      estado_analisis: Not('error'),
      // Si la IA falló y se entregó plantilla, no se cobra el intento.
      resultado_estimado: false,
    },
  });

// POST /api/marketing/analizar
router.post(
  '/analizar',
  ...acceso,
  requireAnalisisLock('marketing'),
  requireCanRunAnalisis(contarAnalisisMarketing),
  validateBody(AnalizarMarketingSchema),
  async (req: AuthRequest, res: Response) => {
  try {
    const bodySrc = { ...(req.body ?? {}) };
    // El frontend envia snake_case; el contrato del orquestador es camelCase.
    const productoId = bodySrc.productoId ?? bodySrc.producto_id;
    delete bodySrc.productoId;
    delete bodySrc.producto_id;
    const payload = {
      vozMarca: bodySrc.vozMarca ?? bodySrc.voz_marca,
      presupuestoMensual:
        bodySrc.presupuestoMensual ?? (Number(bodySrc.presupuesto_mensual) || undefined),
      metaCampana: bodySrc.metaCampana ?? bodySrc.meta_campana,
      clienteIdeal: bodySrc.clienteIdeal ?? bodySrc.cliente_ideal,
      plataformas: Array.isArray(bodySrc.plataformas) ? bodySrc.plataformas : undefined,
      capacidadContenido: bodySrc.capacidadContenido ?? bodySrc.capacidad_contenido,
      analisisMercadoId: bodySrc.analisisMercadoId ?? bodySrc.analisis_mercado_id ?? undefined,
      briefAnalisisId: bodySrc.briefAnalisisId ?? bodySrc.brief_analisis_id ?? undefined,
      ventasAnalisisId: bodySrc.ventasAnalisisId ?? bodySrc.ventas_analisis_id ?? undefined,
      canalCierre: bodySrc.canalCierre ?? bodySrc.canal_cierre ?? undefined,
      nivelTraccion: bodySrc.nivelTraccion ?? bodySrc.nivel_traccion ?? undefined,
      margenEstimado: bodySrc.margenEstimado ?? bodySrc.margen_estimado ?? undefined,
      reporteAds: bodySrc.reporteAds ?? bodySrc.reporte_ads ?? undefined,
    };
    const usuarioId = req.userId;

    // Validar UUID antes de consultar la BD (fix H2)
    if (!productoId || !UUID_RE.test(String(productoId))) {
      return res.status(400).json({ error: 'producto_id invalido' });
    }

    // Validate producto belongs to user
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: productoId, usuario_id: usuarioId },
    });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Create analysis record
    const analisisRepo = AppDataSource.getRepository(AnalisisMarketing);
    const analisis = analisisRepo.create({
      producto_id: productoId,
      usuario_id: usuarioId!,
      estado_analisis: 'procesando',
      reporte_ads_data: payload.reporteAds || null,
    });
    await analisisRepo.save(analisis);

    // Créditos de IA: se cobran antes de encolar y se devuelven si el análisis
    // falla o sale de plantilla (worker y cola, ver services/billing/creditosIA.ts).
    try {
      await cobrarCreditos(usuarioId!, await getPlanFromDB(usuarioId!), 'marketing', analisis.id);
    } catch (err) {
      if (err instanceof CreditosInsuficientesError) {
        await analisisRepo.delete(analisis.id);
        return responderSinCreditos(res, err);
      }
      throw err;
    }

    // Enqueue job — si Redis falla, la fila NUNCA debe quedar 'procesando'
    try {
      await analysisQueue.add(
        'analyze',
        {
          moduleName: 'marketing',
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
      logger.error('[marketing] Failed to enqueue job:', enqueueErr);
      await analisisRepo.update(analisis.id, {
        estado_analisis: 'error',
        error_mensaje: 'No se pudo encolar el analisis. Reintenta.',
      });
      await reembolsarCreditos({ referenciaId: analisis.id });
      return res.status(503).json({ error: 'Servicio de analisis temporalmente no disponible' });
    }

    res.status(202).json({ analisis_id: analisis.id });
  } catch (err: unknown) {
    logger.error('POST /api/marketing/analizar error:', err);
    res.status(500).json({ error: 'Error al crear analisis' });
  }
}
);

// GET /api/marketing/producto/:productoId — ultimo analisis del producto (para vincular modulos)
router.get('/producto/:productoId', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    // Verificar que el producto pertenezca al usuario
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: req.params.productoId, usuario_id: req.userId },
    });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const analisis = await AppDataSource.getRepository(AnalisisMarketing).findOne({
      where: {
        producto_id: req.params.productoId,
        usuario_id: req.userId,
        estado_analisis: Not('error'),
      },
      order: { fecha_creacion: 'DESC' },
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Sin analisis previos para este producto' });
    }
    const plan = await getPlanFromDB(req.userId!);
    return res.json(respuestaAnalisis('marketing', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/marketing/producto/:productoId error:', err);
    res.status(500).json({ error: 'Error al obtener analisis' });
  }
});

// POST /api/marketing/metricas-pasadas/parse — parseo e interpretación de reportes de anuncios (Pro+)
router.post(
  '/metricas-pasadas/parse',
  ...acceso,
  async (req: AuthRequest, res: Response, next) => {
    try {
      const plan = await getPlanFromDB(req.userId!);
      const gate = getPlanGate(plan, 'marketing');
      if (!gate.permite('marketing.reporte_ads')) {
        return res.status(403).json({
          error: 'El Examinador de Estadísticas Pasadas requiere un plan de pago',
          code: 'UPGRADE_REQUIRED',
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  },
  recibirReporteAds,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No se ha proporcionado ningún archivo de reporte publicitario' });
      }

      let contextoProducto: any = undefined;
      const productoId = req.body?.producto_id || req.body?.productoId;
      if (productoId && UUID_RE.test(String(productoId))) {
        const prod = await AppDataSource.getRepository(Producto).findOne({
          where: { id: productoId, usuario_id: req.userId },
        });
        if (prod) {
          contextoProducto = {
            nombre: prod.nombre,
            categoria: prod.categoria,
            precio: prod.precio || undefined,
            pais: prod.pais || undefined,
            // El ICP no vive en Producto sino en AnalisisVentas.perfil_cliente_data
            // (lo resuelve marketingOrchestrator). Aquí se deja fuera a propósito.
          };
        }
      }

      const plan = await getPlanFromDB(req.userId!);
      const resultado = await conCreditos(req.userId!, plan, 'marketing_reporte_ads', () =>
        procesarReporteAdsCompleto(req.file!.buffer, req.file!.originalname, contextoProducto)
      );

      return res.json(resultado);
    } catch (err: unknown) {
      if (err instanceof ReporteAdsError) {
        return res.status(err.statusCode).json({ error: err.message, statusCode: err.statusCode });
      }
      if (err instanceof CreditosInsuficientesError) return responderSinCreditos(res, err);
      logger.error('POST /api/marketing/metricas-pasadas/parse error:', err);
      return res.status(500).json({ error: 'Error al procesar el reporte publicitario' });
    }
  }
);

// GET /api/marketing/:id — detalle completo del analisis (scoped al dueno)
router.get('/:id', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisMarketing).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
      relations: ['producto'],
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Analisis no encontrado' });
    }
    const plan = await getPlanFromDB(req.userId!);
    res.json(respuestaAnalisis('marketing', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/marketing/:id error:', err);
    res.status(500).json({ error: 'Error al obtener analisis' });
  }
});

// GET /api/marketing/:id/status
router.get('/:id/status', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisMarketing).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
      select: ['id', 'estado_analisis', 'error_mensaje'],
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Analisis no encontrado' });
    }
    res.json({
      id: analisis.id,
      estado: analisis.estado_analisis,
      error: analisis.error_mensaje,
    });
  } catch (err: unknown) {
    logger.error('GET /api/marketing/:id/status error:', err);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

export default router;
