import { Router, Response } from 'express';
import { Not } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { AnalisisBrief } from '../models/AnalisisBrief';
import { Producto } from '../models/Producto';
import { authenticate } from '../middleware/auth';
import { requireCanRunAnalisis, getPlanFromDB, requireModuloAcceso } from '../middleware/requirePlan';
import { respuestaAnalisis } from '../services/billing/redactAnalisis';
import { requireAnalisisLock } from '../middleware/idempotency';
import { validateBody, exigirUuid } from '../middleware/validate';
import { logger } from '../utils/logger';
import { analysisQueue } from '../workers/analysisQueue';
import { cobrarCreditos, reembolsarCreditos, responderSinCreditos, CreditosInsuficientesError } from '../services/billing/creditosIA';
import { USOS_MARCA } from '../services/brief/types';
import { PerfilNegocioSchema } from '../services/ia/perfilNegocio';
import { guardarPerfilNegocio } from '../services/ia/guardarPerfil';

/** Texto libre opcional: los formularios mandan `campo || null`. */
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();

const router = Router();
exigirUuid(router, 'id', 'productoId');
// Dueño, o trabajador con el permiso del módulo sobre la cuenta del dueño.
const acceso = [authenticate, requireModuloAcceso('brief')];

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
    // «Afina tu análisis» (brief@2): opcionales; sin ellos el brief lo dice como supuesto.
    marcas_admiradas: textoOpcional(200),
    marcas_evitar: textoOpcional(200),
    elementos_conservar: textoOpcional(300),
    usos_marca: z.array(z.enum(USOS_MARCA)).max(USOS_MARCA.length).nullable().optional(),
    perfil_negocio: PerfilNegocioSchema.optional(),
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
      // Si la IA falló y se entregó plantilla, no se cobra el intento.
      resultado_estimado: false,
    },
  });

// POST /api/brief/analizar
router.post(
  '/analizar',
  ...acceso,
  // La cuota de brief es por cuenta: el candado también, o se podía lanzar a la
  // vez sobre varios productos y pasar todos el conteo antes del primer insert.
  requireAnalisisLock('brief', { porCuenta: true }),
  requireCanRunAnalisis(contarAnalisisBrief),
  validateBody(AnalizarBriefSchema),
  async (req: any, res: Response) => {
  try {
    const bodySrc = { ...(req.body ?? {}) };
    // El frontend env�a producto_id (snake); el contrato interno usa productoId.
    const productoId = bodySrc.productoId ?? bodySrc.producto_id;
    const perfilNuevo = bodySrc.perfil_negocio;
    delete bodySrc.productoId;
    delete bodySrc.producto_id;
    delete bodySrc.perfil_negocio;
    const payload = bodySrc;
    const usuarioId = req.userId;

    // Validate producto belongs to user
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: productoId, usuario_id: usuarioId },
    });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    // El perfil del negocio («Afina tu análisis») se guarda en el producto y lo reusan los demás módulos.
    await guardarPerfilNegocio(producto, perfilNuevo);

    // Create analysis record
    const analisisRepo = AppDataSource.getRepository(AnalisisBrief);
    const analisis = analisisRepo.create({
      producto_id: productoId,
      usuario_id: usuarioId,
      estado_analisis: 'procesando',
    });
    await analisisRepo.save(analisis);

    // Créditos de IA: se cobran antes de encolar y se devuelven si el análisis
    // falla o sale de plantilla (worker y cola, ver services/billing/creditosIA.ts).
    try {
      await cobrarCreditos(usuarioId!, await getPlanFromDB(usuarioId!), 'brief', analisis.id);
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
      await reembolsarCreditos({ referenciaId: analisis.id });
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
router.get('/recientes', ...acceso,async (req: any, res: Response) => {
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
router.get('/producto/:productoId', ...acceso,async (req: any, res: Response) => {
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
router.get('/:id', ...acceso,async (req: any, res: Response) => {
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
router.get('/:id/status', ...acceso,async (req: any, res: Response) => {
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
