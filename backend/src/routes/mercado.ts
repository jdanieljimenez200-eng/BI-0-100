import { Router, Response } from 'express';
import { Not } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { Producto } from '../models/Producto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireCanRunAnalisis, getPlanFromDB, requireModuloAcceso } from '../middleware/requirePlan';
import { respuestaAnalisis } from '../services/billing/redactAnalisis';
import { requireAnalisisLock } from '../middleware/idempotency';
import { validateBody, exigirUuid } from '../middleware/validate';
import { obtenerTraccionReal } from '../services/mercado/traccionReal';
import { hoyDePeticion } from '../utils/fechaLocal';
import { logger } from '../utils/logger';
import { analysisQueue } from '../workers/analysisQueue';
import { cobrarCreditos, reembolsarCreditos, responderSinCreditos, CreditosInsuficientesError } from '../services/billing/creditosIA';
import { PerfilNegocioSchema } from '../services/ia/perfilNegocio';
import { guardarPerfilNegocio } from '../services/ia/guardarPerfil';

const router = Router();
exigirUuid(router, 'id', 'productoId');
// Dueño, o trabajador con el permiso del módulo sobre la cuenta del dueño.
const acceso = [authenticate, requireModuloAcceso('mercado')];

// El body real que manda el formulario (frontend/app/dashboard/mercado/[productoId]/page.tsx).
// `nse_target`/`canal_adquisicion`/`competidores_conocidos` son texto libre de un
// select o input (no hay un enum fijo global que mantener sincronizado); el resto
// sí tiene forma fija. `tipo_local` ya se valida más abajo en el pipeline de zona
// (services/zona/types.ts), pero validarlo aquí también da un 400 inmediato en
// vez de esperar a que el worker falle de forma asíncrona.
const TIPOS_LOCAL = [
  'sin_local',
  'produccion_alimentos',
  'retail',
  'servicio_atencion',
  'oficina',
  'taller',
  'almacen',
  'ecommerce_bodega',
  'otro',
] as const;

const AnalizarMercadoSchema = z
  .object({
    producto_id: z.string().uuid().optional(),
    productoId: z.string().uuid().optional(),
    pais: z.string().min(2).max(10),
    scope: z.enum(['local', 'nacional']),
    estado: z.string().max(100).optional(),
    ciudad: z.string().max(100).optional(),
    forma_cobro: z.enum(['Pago Único', 'Suscripción']),
    recurrencia_meses: z.number().finite().int().positive().optional(),
    clientes_mes: z.number().finite().nonnegative().optional(),
    tasa_repeticion: z.number().finite().nonnegative().optional(),
    canal_adquisicion: z.string().max(100).optional(),
    nse_target: z.string().min(1).max(100),
    competidores_conocidos: z.string().max(1000).optional(),
    tipo_local: z.enum(TIPOS_LOCAL).optional(),
    zona: z.string().max(100).optional(),
    m2_declarados: z.number().finite().positive().optional(),
    precio_m2_mes_declarado: z.number().finite().positive().optional(),
    precio_venta_m2_declarado: z.number().finite().positive().optional(),
    personal: z.number().finite().int().nonnegative().optional(),
    renta_declarada: z.number().finite().nonnegative().optional(),
    // Lo usa el cálculo de densidad; sin declararlo aquí la validación lo borraba.
    radioKm: z.number().finite().positive().max(500).optional(),
    // «Afina tu análisis»: se guarda en el producto y lo reutilizan los demás módulos.
    perfil_negocio: PerfilNegocioSchema.optional(),
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
const contarAnalisisMercado = (usuarioId: string, productoId?: string): Promise<number> =>
  AppDataSource.getRepository(AnalisisMercado).count({
    where: {
      usuario_id: usuarioId,
      ...(productoId ? { producto_id: productoId } : {}),
      estado_analisis: Not('error'),
      // Si la IA falló y se entregó plantilla, no se cobra el intento.
      resultado_estimado: false,
    },
  });

// POST /api/mercado/analizar
router.post(
  '/analizar',
  ...acceso,
  requireAnalisisLock('mercado'),
  requireCanRunAnalisis(contarAnalisisMercado),
  validateBody(AnalizarMercadoSchema),
  async (req: AuthRequest, res: Response) => {
  try {
    const bodySrc = { ...(req.body ?? {}) };
    // El frontend envia producto_id (snake); el contrato interno usa productoId.
    const productoId = bodySrc.productoId ?? bodySrc.producto_id;
    delete bodySrc.productoId;
    delete bodySrc.producto_id;
    // El perfil es del negocio: va al producto, no al payload del trabajo.
    const perfilNuevo = bodySrc.perfil_negocio;
    delete bodySrc.perfil_negocio;
    const payload = bodySrc;
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
    await guardarPerfilNegocio(producto, perfilNuevo);

    // Create analysis record
    const analisisRepo = AppDataSource.getRepository(AnalisisMercado);
    const analisis = analisisRepo.create({
      producto_id: productoId,
      usuario_id: usuarioId!,
      estado_analisis: 'procesando',
    });
    await analisisRepo.save(analisis);

    // Créditos de IA: se cobran antes de encolar y se devuelven si el análisis
    // falla o sale de plantilla (worker y cola, ver services/billing/creditosIA.ts).
    try {
      await cobrarCreditos(usuarioId!, await getPlanFromDB(usuarioId!), 'mercado', analisis.id);
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
          moduleName: 'mercado',
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
      logger.error('[mercado] Failed to enqueue job:', enqueueErr);
      await analisisRepo.update(analisis.id, {
        estado_analisis: 'error',
        error_mensaje: 'No se pudo encolar el analisis. Reintenta.',
      });
      await reembolsarCreditos({ referenciaId: analisis.id });
      return res.status(503).json({ error: 'Servicio de analisis temporalmente no disponible' });
    }

    res.status(202).json({ analisis_id: analisis.id });
  } catch (err: unknown) {
    logger.error('POST /api/mercado/analizar error:', err);
    res.status(500).json({ error: 'Error al crear analisis' });
  }
}
);

// GET /api/mercado/producto/:productoId — ultimo analisis del producto (para vincular modulos)
router.get('/producto/:productoId', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    // Verificar que el producto pertenezca al usuario
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: req.params.productoId, usuario_id: req.userId },
    });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const analisis = await AppDataSource.getRepository(AnalisisMercado).findOne({
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
    return res.json(respuestaAnalisis('mercado', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/mercado/producto/:productoId error:', err);
    res.status(500).json({ error: 'Error al obtener analisis' });
  }
});

/**
 * GET /api/mercado/traccion/:productoId — lo que de verdad vendió el producto.
 *
 * El formulario pedía «clientes al mes» y «tasa de repetición» a mano aunque el
 * negocio llevara meses cobrando con el POS. Esto devuelve la tracción real para
 * precargarlos. Va ANTES de `/:id` o `exigirUuid` respondería 400 al ver la
 * palabra «traccion» donde espera un UUID.
 */
router.get('/traccion/:productoId', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    // `exigirUuid(router, 'id', 'productoId')` ya rechaza con 400 un id mal
    // formado antes de llegar aquí.
    const { productoId } = req.params;

    const existe = await AppDataSource.manager.exists(Producto, {
      where: { id: productoId, usuario_id: req.userId! },
    });
    if (!existe) return res.status(404).json({ error: 'Producto no encontrado' });

    const traccion = await obtenerTraccionReal(req.userId!, productoId, await hoyDePeticion(req));
    // 200 con `null`: «este producto todavía no tiene ventas» es una respuesta,
    // no un error que el formulario deba tratar como fallo.
    return res.json({ traccion });
  } catch (err: unknown) {
    logger.error('GET /api/mercado/traccion/:productoId error:', err);
    res.status(500).json({ error: 'Error al leer las ventas del producto' });
  }
});

// GET /api/mercado/:id — detalle completo del analisis (scoped al dueno)
router.get('/:id', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisMercado).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Analisis no encontrado' });
    }
    const plan = await getPlanFromDB(req.userId!);
    res.json(respuestaAnalisis('mercado', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/mercado/:id error:', err);
    res.status(500).json({ error: 'Error al obtener analisis' });
  }
});

// GET /api/mercado/:id/status
router.get('/:id/status', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisMercado).findOne({
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
    logger.error('GET /api/mercado/:id/status error:', err);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

export default router;
