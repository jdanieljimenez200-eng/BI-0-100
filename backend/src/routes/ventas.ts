import { Router, Request, Response, NextFunction } from 'express';
import { exigirUuid } from '../middleware/validate';
import multer from 'multer';
import { Not } from 'typeorm';
import { AppDataSource } from '../config/database';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { Producto } from '../models/Producto';
import { AnalisisBrief } from '../models/AnalisisBrief';
import { authenticate } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { requireCanRunAnalisis, getPlanFromDB, requireModuloAcceso } from '../middleware/requirePlan';
import { requireAnalisisLock } from '../middleware/idempotency';
import { respuestaAnalisis } from '../services/billing/redactAnalisis';
import { generarHistoriaMock, generarTipsMock, generarRebatidas, generarFollowUps, generarPalabrasClaveAds } from '../services/ventas/ventasService';
import { redisClient } from '../config/redis';
import { analysisQueue } from '../workers/analysisQueue';
import { cobrarCreditos, conCreditos, reembolsarCreditos, responderSinCreditos, CreditosInsuficientesError } from '../services/billing/creditosIA';
import { logger } from '../utils/logger';
import { hoyDePeticion } from '../utils/fechaLocal';
import { uploadAudio, reservarCupoSubidaPesada } from '../middleware/upload';
import {
  isTranscripcionAvailable,
  transcribirAudio,
} from '../services/media/transcripcionService';
import { CICLOS_VENTA, QUIEN_DECIDE, type TipNegociacion, type VentasAnalisisInput } from '../services/ventas/types';
import { embudoDePayload, inputDeVentas } from '../services/ventas/ventasOrchestrator';

const router = Router();
exigirUuid(router, 'id', 'productoId');
// Dueño, o trabajador con el permiso del módulo sobre la cuenta del dueño.
const acceso = [authenticate, requireModuloAcceso('ventas')];

const TIPOS_VENTA = new Set(['B2C_directo', 'B2B', 'hibrido', 'servicios']);
const CANALES = new Set(['directo', 'marketplace', 'redes_sociales', 'telefono', 'combinado']);
const EQUIPOS = new Set(['solo_tu', '1_2_personas', '3_mas_personas']);

/**
 * `producto_id` viaja en el body y se usa como clave del findOne. Sin validarlo,
 * un body sin ese campo deja `id: undefined` y TypeORM DESCARTA la condición:
 * la consulta devolvería CUALQUIER producto del usuario y el análisis se
 * crearía contra un producto que nadie pidió.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Freemium: 1 análisis por producto; los fallidos no consumen cuota.
const contarAnalisisVentas = (usuarioId: string, productoId?: string): Promise<number> =>
  AppDataSource.getRepository(AnalisisVentas).count({
    where: {
      usuario_id: usuarioId,
      ...(productoId ? { producto_id: productoId } : {}),
      estado_analisis: Not('error'),
      // Si la IA falló y se entregó plantilla, no se cobra el intento.
      resultado_estimado: false,
    },
  });

/** Tope de la columna decimal(10,2) de `analisis_ventas.ticket_promedio`. */
const TICKET_MAXIMO = 99_999_999.99;

function parseInput(body: Record<string, unknown>): { input?: VentasAnalisisInput; error?: string } {
  const tipo_venta = String(body.tipo_venta ?? 'B2C_directo');
  const canal_principal = String(body.canal_principal ?? 'directo');
  const tamano_equipo = String(body.tamano_equipo ?? 'solo_tu');
  const ticket_promedio = Number(body.ticket_promedio);

  if (!TIPOS_VENTA.has(tipo_venta)) return { error: 'tipo_venta inválido' };
  if (!CANALES.has(canal_principal)) return { error: 'canal_principal inválido' };
  if (!EQUIPOS.has(tamano_equipo)) return { error: 'tamano_equipo inválido' };
  if (!Number.isFinite(ticket_promedio) || ticket_promedio <= 0) {
    return { error: 'ticket_promedio debe ser mayor a 0' };
  }
  // `analisis_ventas.ticket_promedio` es decimal(10,2): sin tope, un dedazo
  // (1000000000) llegaba a Postgres, reventaba el INSERT y el usuario veía un
  // 500 en vez de un aviso de dato inválido.
  if (ticket_promedio > TICKET_MAXIMO) {
    return { error: `ticket_promedio no puede pasar de ${TICKET_MAXIMO.toLocaleString('es-MX')}` };
  }

  // Tu embudo de ventas (opcional): vacío = no declarado; fuera de rango = 400.
  const opcional = (v: unknown) => v === undefined || v === null || v === '';
  const embudo: Partial<VentasAnalisisInput> = {};
  if (!opcional(body.contactos_mes)) {
    const n = Number(body.contactos_mes);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { error: 'contactos_mes debe ser un entero entre 0 y 1,000,000' };
    embudo.contactos_mes = n;
  }
  if (!opcional(body.tasa_cierre_pct)) {
    const n = Number(body.tasa_cierre_pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'tasa_cierre_pct debe estar entre 0 y 100' };
    embudo.tasa_cierre_pct = n;
  }
  if (!opcional(body.ciclo_venta)) {
    if (!(CICLOS_VENTA as readonly unknown[]).includes(body.ciclo_venta)) return { error: 'ciclo_venta inválido' };
    embudo.ciclo_venta = body.ciclo_venta as VentasAnalisisInput['ciclo_venta'];
  }
  if (!opcional(body.quien_decide)) {
    if (!(QUIEN_DECIDE as readonly unknown[]).includes(body.quien_decide)) return { error: 'quien_decide inválido' };
    embudo.quien_decide = body.quien_decide as VentasAnalisisInput['quien_decide'];
  }
  if (typeof body.objeciones_frecuentes === 'string' && body.objeciones_frecuentes.trim()) {
    if (body.objeciones_frecuentes.trim().length > 400) return { error: 'objeciones_frecuentes no puede pasar de 400 caracteres' };
    embudo.objeciones_frecuentes = body.objeciones_frecuentes.trim();
  }

  return {
    input: {
      tipo_venta: tipo_venta as VentasAnalisisInput['tipo_venta'],
      canal_principal: canal_principal as VentasAnalisisInput['canal_principal'],
      ticket_promedio,
      tamano_equipo: tamano_equipo as VentasAnalisisInput['tamano_equipo'],
      objetivo_ventas:
        typeof body.objetivo_ventas === 'string' && body.objetivo_ventas.trim()
          ? body.objetivo_ventas.trim().slice(0, 300)
          : undefined,
      ...embudo,
    },
  };
}

// ─── Rutas estáticas PRIMERO (evita sombreado por '/:id') ───────────────────

// GET /api/ventas/tips — tips rápidos de catálogo (sin coste de IA).
router.get('/tips', ...acceso,async (_req: AuthRequest, res: Response) => {
  const tips: TipNegociacion[] = generarTipsMock({
    tipo_venta: 'B2C_directo',
    canal_principal: 'directo',
    ticket_promedio: 0,
    tamano_equipo: 'solo_tu',
  });
  return res.json(tips);
});

// GET /api/ventas/historias/diaria?productoId=… — "la historia del día".
// Determinista por fecha y categoría (coste 0); las historias personalizadas
// por IA viven dentro del análisis completo.
router.get('/historias/diaria', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const productoId = String(req.query.productoId ?? '');
    // Día local de quien pide: en UTC, en México «la historia del día» cambiaba
    // a la de mañana desde las 18:00.
    const fechaISO = await hoyDePeticion(req);

    if (!productoId) {
      return res.json(
        generarHistoriaMock(
          { tipo_venta: 'B2C_directo', canal_principal: 'directo', ticket_promedio: 0, tamano_equipo: 'solo_tu' },
          fechaISO
        )
      );
    }

    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: productoId, usuario_id: req.userId },
      select: ['id', 'categoria', 'pais', 'precio', 'nombre'],
    });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const categoria = producto.categoria || 'general';

    const cacheKey = `ventas:historia:${fechaISO}:${categoria}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch {
      /* Redis caído: generamos sin caché */
    }

    const historia = generarHistoriaMock(
      {
        tipo_venta: 'B2C_directo',
        canal_principal: 'directo',
        ticket_promedio: Number(producto.precio) || 0,
        tamano_equipo: 'solo_tu',
      },
      fechaISO
    );
    historia.industria = categoria;

    try {
      const finDeDia = new Date(`${fechaISO}T23:59:59Z`).getTime() - Date.now();
      await redisClient.setEx(
        cacheKey,
        Math.max(60, Math.floor(finDeDia / 1000)),
        JSON.stringify(historia)
      );
    } catch {
      /* sin caché no pasa nada */
    }

    return res.json(historia);
  } catch (err) {
    logger.error('GET /api/ventas/historias/diaria error:', err);
    return res.status(500).json({ error: 'Error al obtener la historia del día' });
  }
});

// ─── Transcripción de voz → texto ───────────────────────────────────────────

const subirAudio = uploadAudio.single('audio');

/**
 * Envuelve a multer para traducir sus fallos a 4xx. Sin esto, el Error del
 * fileFilter (formato no permitido) llegaría al error handler global y saldría
 * como 500 con "Internal Server Error", ocultando la causa real al usuario.
 */
function recibirAudio(req: Request, res: Response, next: NextFunction): void {
  if (!reservarCupoSubidaPesada(req, res)) return;
  subirAudio(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const esTamano = err.code === 'LIMIT_FILE_SIZE';
      res.status(esTamano ? 413 : 400).json({
        error: esTamano
          ? 'El audio supera el máximo de 25 MB'
          : 'Archivo de audio inválido',
      });
      return;
    }
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Archivo de audio inválido',
    });
  });
}

/** ISO-639-1 o undefined para autodetección ('auto'). Default 'es'. */
function normalizarIdioma(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return 'es';
  const valor = raw.trim().toLowerCase();
  if (valor === 'auto') return undefined;
  return /^[a-z]{2}$/.test(valor) ? valor : 'es';
}

/**
 * POST /api/ventas/transcribir — dictar el objetivo de ventas o las notas de
 * una llamada en lugar de escribirlos. El buffer NUNCA se persiste: se
 * transcribe en memoria y se descarta, así que no toca StorageService.
 * Sin OPENAI_API_KEY responde 503 en vez de romper (degradación elegante).
 */
router.post(
  '/transcribir',
  ...acceso,
  recibirAudio,
  async (req: AuthRequest, res: Response) => {
    if (!isTranscripcionAvailable()) {
      return res
        .status(503)
        .json({ error: 'La transcripción de voz no está disponible en este entorno' });
    }

    const archivo = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!archivo?.buffer?.length) {
      return res.status(400).json({ error: 'Falta el audio (campo "audio" del form-data)' });
    }

    try {
      const transcripcion = await transcribirAudio(archivo.buffer, archivo.originalname, {
        idioma: normalizarIdioma(req.body?.idioma),
        mimetype: archivo.mimetype,
      });
      return res.json(transcripcion);
    } catch (err) {
      // El uploader ya filtró tamaño y formato: lo que queda es fallo del
      // proveedor o audio sin voz reconocible.
      logger.error('POST /api/ventas/transcribir error:', err);
      return res.status(502).json({ error: 'No se pudo transcribir el audio. Reintenta.' });
    }
  }
);

// POST /api/ventas/analizar
router.post(
  '/analizar',
  ...acceso,
  requireAnalisisLock('ventas'),
  requireCanRunAnalisis(contarAnalisisVentas),
  async (req: AuthRequest, res: Response) => {
    try {
      const productoId =
        typeof req.body?.producto_id === 'string' ? req.body.producto_id.trim() : '';
      const usuarioId = req.userId;

      if (!UUID_RE.test(productoId)) {
        return res.status(400).json({ error: 'producto_id inválido' });
      }

      const producto = await AppDataSource.getRepository(Producto).findOne({
        where: { id: productoId, usuario_id: usuarioId },
      });
      if (!producto) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }

      const { input, error } = parseInput(req.body ?? {});
      if (!input) {
        return res.status(400).json({ error });
      }

      const repo = AppDataSource.getRepository(AnalisisVentas);
      const analisis = repo.create({
        usuario_id: usuarioId!,
        producto_id: productoId,
        pais: producto.pais || 'MX',
        nombre_producto: producto.nombre,
        categoria: producto.categoria || '',
        precio: Number(producto.precio) || 0,
        tipo_venta: input.tipo_venta,
        canal_principal: input.canal_principal,
        ticket_promedio: input.ticket_promedio,
        tamano_equipo: input.tamano_equipo,
        objetivo_ventas: input.objetivo_ventas ?? null,
        inputs_data: { ...input },
        estado_analisis: 'procesando',
      });
      await repo.save(analisis);

      // Créditos de IA: se cobran antes de encolar y se devuelven si el análisis
      // falla o sale de plantilla (worker y cola, ver services/billing/creditosIA.ts).
      try {
        await cobrarCreditos(usuarioId!, await getPlanFromDB(usuarioId!), 'ventas', analisis.id);
      } catch (err) {
        if (err instanceof CreditosInsuficientesError) {
          await repo.delete(analisis.id);
          return responderSinCreditos(res, err);
        }
        throw err;
      }

      // Enqueue — si Redis falla la fila NUNCA queda en 'procesando'
      try {
        await analysisQueue.add(
          'analyze',
          {
            moduleName: 'ventas',
            analisisId: analisis.id,
            usuarioId,
            productoId,
            payload: {
              tipo_venta: input.tipo_venta,
              canal_principal: input.canal_principal,
              ticket_promedio: input.ticket_promedio,
              tamano_equipo: input.tamano_equipo,
              objetivo_ventas: input.objetivo_ventas,
              contactos_mes: input.contactos_mes,
              tasa_cierre_pct: input.tasa_cierre_pct,
              ciclo_venta: input.ciclo_venta,
              quien_decide: input.quien_decide,
              objeciones_frecuentes: input.objeciones_frecuentes,
              // El worker no tiene la petición: el día local viaja con el trabajo.
              fecha_local: await hoyDePeticion(req),
            },
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: { age: 24 * 3600 },
          }
        );
      } catch (enqueueErr) {
        logger.error('[ventas] Failed to enqueue job:', enqueueErr);
        await repo.update(analisis.id, {
          estado_analisis: 'error',
          error_mensaje: 'No se pudo encolar el análisis. Reintenta.',
        });
        await reembolsarCreditos({ referenciaId: analisis.id });
        return res.status(503).json({ error: 'Servicio de análisis temporalmente no disponible' });
      }

      return res.status(202).json({ analisis_id: analisis.id });
    } catch (err) {
      logger.error('POST /api/ventas/analizar error:', err);
      return res.status(500).json({ error: 'Error al crear análisis de ventas' });
    }
  }
);

// GET /api/ventas/producto/:productoId — último análisis del producto (para
// que otros módulos, ej. Marketing, consulten el ICP sin retipear nada).
// Ruta estática: debe registrarse antes de `/:id` o "producto" se
// interpretaría como un id de análisis.
router.get('/producto/:productoId', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: req.params.productoId, usuario_id: req.userId },
    });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const analisis = await AppDataSource.getRepository(AnalisisVentas).findOne({
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
    const plan = await getPlanFromDB(req.userId!);
    return res.json(respuestaAnalisis('ventas', plan, analisis));
  } catch (err: unknown) {
    logger.error('GET /api/ventas/producto/:productoId error:', err);
    res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// GET /api/ventas/:id — detalle completo con recorte por plan
router.get('/:id', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const fila = await AppDataSource.getRepository(AnalisisVentas).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
    });
    if (!fila) {
      return res.status(404).json({ error: 'Análisis no encontrado' });
    }

    const plan = await getPlanFromDB(req.userId!);
    // Candado server-side + secciones_bloqueadas para la UI
    return res.json(respuestaAnalisis('ventas', plan, fila));
  } catch (err) {
    logger.error('GET /api/ventas/:id error:', err);
    return res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// GET /api/ventas/:id/status — polling ligero
router.get('/:id/status', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisVentas).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
      select: ['id', 'estado_analisis', 'error_mensaje'],
    });
    if (!analisis) {
      return res.status(404).json({ error: 'Análisis no encontrado' });
    }
    return res.json({
      id: analisis.id,
      estado: analisis.estado_analisis,
      error: analisis.error_mensaje,
    });
  } catch (err) {
    logger.error('GET /api/ventas/:id/status error:', err);
    return res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// ─── NUEVOS ENDPOINTS V2 ─────────────────────────────────────────────────────

import { getVentasGate } from '../services/billing/gatingAnalisis';
import {
  evaluarGuion,
  evaluarGuionConVideo,
  analizarCompetidor,
  analizarCompetidorFoto,
  generarComparativa,
  PerfilClienteSchema,
} from '../services/ventas/ventasService';
import type {
  PerfilClienteIdeal,
  EvaluacionGuion,
  AnalisisCompetidor,
  ImagenParaAnalisis,
} from '../services/ventas/types';
import { recibirGuionArchivos, recibirCompetidorArchivos } from '../middleware/upload';
import { extraerFrames } from '../services/media/frameExtractionService';
import type { FrameExtraida } from '../services/media/frameExtractionService';
import { v4 as uuidv4 } from 'uuid';

/**
 * PATCH /api/ventas/:id/perfil
 * Edita el ICP del análisis. El body puede ser un perfil completo (reemplaza)
 * o campos parciales (merge). Solo el usuario owner puede editarlo.
 */
router.patch('/:id/perfil', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AnalisisVentas);
    const analisis = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId } });
    if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

    const plan = await getPlanFromDB(req.userId!);
    const gate = getVentasGate(plan);
    if (!gate.tiene_icp) return res.status(403).json({ error: 'Tu plan no incluye el Perfil del Cliente Ideal' });

    // Merge: si el cliente manda campos parciales, se fusionan con los existentes.
    // Limitamos a 50 claves y 10 KB para no inflar el JSONB (fix H17), y
    // validamos tanto el fragmento como el resultado del merge contra el
    // schema real del ICP para no dejar `psicografia` (u otro campo) en una
    // forma que luego tumbe `evaluarGuion()`.
    const actual = (analisis.perfil_cliente_data ?? {}) as Record<string, unknown>;
    const nuevo = (req.body ?? {}) as Record<string, unknown>;
    const claves = Object.keys(nuevo).slice(0, 50);
    const patch = Object.fromEntries(claves.map((k) => [k, nuevo[k]]));
    if (JSON.stringify(patch).length > 10_000) {
      return res.status(413).json({ error: 'Perfil demasiado grande (máx. 10 KB)' });
    }

    const patchValido = PerfilClienteSchema.deepPartial().safeParse(patch);
    if (!patchValido.success) {
      return res.status(400).json({ error: 'Formato de perfil inválido', detalles: patchValido.error.flatten() });
    }

    const mergeado = { ...actual, ...patch };
    const mergeadoValido = PerfilClienteSchema.safeParse(mergeado);
    if (!mergeadoValido.success) {
      return res.status(400).json({ error: 'El perfil resultante es inválido', detalles: mergeadoValido.error.flatten() });
    }

    analisis.perfil_cliente_data = mergeadoValido.data;
    await repo.save(analisis);

    return res.json({ perfil_cliente_data: analisis.perfil_cliente_data });
  } catch (err) {
    logger.error('PATCH /api/ventas/:id/perfil error:', err);
    return res.status(500).json({ error: 'Error al actualizar el perfil del cliente' });
  }
});

/**
 * Input de las llamadas bajo demanda (objeciones, seguimientos, guiones,
 * competencia): lo que se declaró en el análisis más lo que sabe hoy el
 * producto (descripción, propuesta de valor, perfil). Antes cada ruta lo armaba
 * a mano con la mitad de los datos, y la de borrar competidor sin el país.
 */
async function inputDesdeAnalisis(analisis: AnalisisVentas): Promise<VentasAnalisisInput> {
  const payload: Record<string, unknown> = {
    ...(analisis.inputs_data ?? {}),
    tipo_venta: analisis.tipo_venta,
    canal_principal: analisis.canal_principal,
    ticket_promedio: Number(analisis.ticket_promedio) || 0,
    tamano_equipo: analisis.tamano_equipo,
    objetivo_ventas: analisis.objetivo_ventas ?? undefined,
  };
  const producto = await AppDataSource.getRepository(Producto).findOneBy({ id: analisis.producto_id });
  if (producto) return inputDeVentas(producto, payload);
  // Sin producto: lo que guardó el análisis.
  return {
    tipo_venta: (analisis.tipo_venta as VentasAnalisisInput['tipo_venta']) ?? 'B2C_directo',
    canal_principal: (analisis.canal_principal as VentasAnalisisInput['canal_principal']) ?? 'directo',
    ticket_promedio: Number(analisis.ticket_promedio) || 0,
    tamano_equipo: (analisis.tamano_equipo as VentasAnalisisInput['tamano_equipo']) ?? 'solo_tu',
    objetivo_ventas: analisis.objetivo_ventas ?? undefined,
    nombre_producto: analisis.nombre_producto,
    categoria: analisis.categoria,
    precio: Number(analisis.precio) || undefined,
    pais: analisis.pais,
    ...embudoDePayload(payload),
  };
}

/**
 * GET /api/ventas/:id/objeciones — rebatidas sugeridas para las objeciones del
 * ICP. Se genera una sola vez y se cachea en la fila (no en cada vista).
 */
router.get('/:id/objeciones', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AnalisisVentas);
    const analisis = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId } });
    if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

    const plan = await getPlanFromDB(req.userId!);
    const gate = getVentasGate(plan);
    if (!gate.tiene_icp) return res.status(403).json({ error: 'El Perfil de Cliente Ideal requiere plan Emprendedor o superior' });

    const perfil = analisis.perfil_cliente_data as PerfilClienteIdeal | null;
    if (!perfil) return res.status(400).json({ error: 'Este análisis no tiene un Perfil de Cliente Ideal generado' });

    if (!analisis.rebatidas_objeciones_data) {
      // Se genera una sola vez por análisis y queda guardada: se cobra esa vez.
      const input = await inputDesdeAnalisis(analisis);
      const rebatidas = await conCreditos(req.userId!, plan, 'ventas_objeciones', () =>
        generarRebatidas(perfil, input)
      );
      analisis.rebatidas_objeciones_data = rebatidas;
      await repo.save(analisis);
    }

    return res.json({ rebatidas: analisis.rebatidas_objeciones_data });
  } catch (err) {
    if (err instanceof CreditosInsuficientesError) return responderSinCreditos(res, err);
    logger.error('GET /api/ventas/:id/objeciones error:', err);
    return res.status(500).json({ error: 'Error al generar rebatidas' });
  }
});

/**
 * GET /api/ventas/:id/palabras-clave-ads — keywords de Google Ads e intereses
 * de Meta Ads, derivados del ICP. Se genera una sola vez y se cachea.
 */
router.get('/:id/palabras-clave-ads', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AnalisisVentas);
    const analisis = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId } });
    if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

    const plan = await getPlanFromDB(req.userId!);
    const gate = getVentasGate(plan);
    if (!gate.tiene_icp) return res.status(403).json({ error: 'El Perfil de Cliente Ideal requiere plan Emprendedor o superior' });

    const perfil = analisis.perfil_cliente_data as PerfilClienteIdeal | null;
    if (!perfil) return res.status(400).json({ error: 'Este análisis no tiene un Perfil de Cliente Ideal generado' });

    if (!analisis.palabras_clave_ads_data) {
      const palabras = await generarPalabrasClaveAds(perfil, await inputDesdeAnalisis(analisis));
      analisis.palabras_clave_ads_data = palabras;
      await repo.save(analisis);
    }

    return res.json(analisis.palabras_clave_ads_data);
  } catch (err) {
    logger.error('GET /api/ventas/:id/palabras-clave-ads error:', err);
    return res.status(500).json({ error: 'Error al generar palabras clave' });
  }
});

/** Tono de comunicación del último Brief completado, si existe (fallback: neutro). */
async function cargarTonoBrief(usuarioId: string, productoId: string): Promise<string | undefined> {
  const brief = await AppDataSource.getRepository(AnalisisBrief).findOne({
    where: { usuario_id: usuarioId, producto_id: productoId, estado_analisis: 'completado' },
    order: { fecha_creacion: 'DESC' },
  });
  return brief?.tono_comunicacion ?? undefined;
}

/**
 * GET /api/ventas/:id/followups — secuencia de mensajes de seguimiento
 * (inmediato/48h/1 semana), en el tono de marca del Brief si existe. Se
 * genera una sola vez y se cachea en la fila.
 */
router.get('/:id/followups', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AnalisisVentas);
    const analisis = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId } });
    if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

    const plan = await getPlanFromDB(req.userId!);
    const gate = getVentasGate(plan);
    if (!gate.tiene_script_scorer) {
      return res.status(403).json({ error: 'La secuencia de seguimiento requiere plan Negocio o superior' });
    }

    if (!analisis.followups_data) {
      const tono = await cargarTonoBrief(req.userId!, analisis.producto_id);
      const followups = await generarFollowUps(await inputDesdeAnalisis(analisis), tono);
      analisis.followups_data = followups;
      await repo.save(analisis);
    }

    return res.json({ followups: analisis.followups_data });
  } catch (err) {
    logger.error('GET /api/ventas/:id/followups error:', err);
    return res.status(500).json({ error: 'Error al generar la secuencia de seguimiento' });
  }
});

/**
 * POST /api/ventas/:id/guion
 * Evalúa un guion/hook/CTA y lo agrega al historial de evaluaciones.
 * El guion viene en body.guion (texto), en un archivo de audio (field: audio),
 * en un vídeo subido directo (field: video), o pidiendo reusar el vídeo de
 * pitch ya subido al Producto (usar_video_producto=true). Cuando hay vídeo
 * (subido o reusado) se extraen frames y se analiza también visualmente con
 * la visión de Claude — ver `evaluarGuionConVideo`.
 * Síncrono: responde con el resultado en ~5-15s (más si hay análisis visual).
 */
router.post(
  '/:id/guion',
  ...acceso,
  recibirGuionArchivos,
  async (req: AuthRequest, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(AnalisisVentas);
      const analisis = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId } });
      if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

      const plan = await getPlanFromDB(req.userId!);
      const gate = getVentasGate(plan);
      if (!gate.tiene_script_scorer) {
        return res.status(403).json({ error: 'El Evaluador de Guiones requiere plan Negocio o superior' });
      }

      const archivos = (req as AuthRequest & { files?: Record<string, Express.Multer.File[]> }).files;
      const archivoAudio = archivos?.audio?.[0];
      const archivoVideo = archivos?.video?.[0];

      let guion: string = typeof req.body?.guion === 'string' ? req.body.guion.trim() : '';
      let origen: 'texto' | 'audio' | 'video_pitch' | 'video_directo' = 'texto';
      let frames: FrameExtraida[] = [];

      if (!guion && archivoAudio?.buffer?.length) {
        if (!isTranscripcionAvailable()) {
          return res.status(503).json({ error: 'Transcripción no disponible. Pega el guion como texto.' });
        }
        const resultado = await transcribirAudio(archivoAudio.buffer, archivoAudio.originalname, { idioma: 'es', mimetype: archivoAudio.mimetype });
        guion = resultado.texto ?? '';
        origen = 'audio';
      }

      // Vídeo subido directo en esta misma petición: transcripción (texto) y
      // extracción de frames (visión) en paralelo sobre el mismo buffer. Si la
      // extracción de frames falla, se sigue solo con el texto (frames=[]).
      if (!guion && archivoVideo?.buffer?.length) {
        if (!isTranscripcionAvailable()) {
          return res.status(503).json({ error: 'Transcripción no disponible. Pega el guion como texto.' });
        }
        try {
          const [resultado, framesExtraidos] = await Promise.all([
            transcribirAudio(archivoVideo.buffer, archivoVideo.originalname, { idioma: 'es', mimetype: archivoVideo.mimetype }),
            extraerFrames(archivoVideo.buffer).catch((err) => {
              logger.warn('[ventas] Falló extracción de frames del vídeo subido:', err);
              return [] as FrameExtraida[];
            }),
          ]);
          guion = resultado.texto ?? '';
          origen = 'video_directo';
          frames = framesExtraidos;
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : 'Error al procesar el vídeo';
          logger.warn('[ventas] Falló transcripción de vídeo subido:', err);
          if (mensaje.includes('supera el máximo')) {
            return res.status(413).json({ error: `${mensaje}. Vuelve a subir un vídeo más ligero.` });
          }
          if (mensaje.includes('no soportado')) {
            return res.status(400).json({ error: 'Formato de vídeo no compatible con transcripción. Vuelve a subirlo en mp4 o webm.' });
          }
          return res.status(502).json({ error: 'No se pudo procesar el vídeo. Intenta de nuevo.' });
        }
      }

      if (!guion && String(req.body?.usar_video_producto) === 'true') {
        if (!isTranscripcionAvailable()) {
          return res.status(503).json({ error: 'Transcripción no disponible. Pega el guion como texto.' });
        }
        const producto = await AppDataSource.getRepository(Producto).findOne({
          where: { id: analisis.producto_id, usuario_id: req.userId },
        });
        if (!producto?.video_url) {
          return res.status(400).json({ error: 'Este producto no tiene un vídeo de pitch subido' });
        }
        try {
          const descarga = await fetch(producto.video_url);
          if (!descarga.ok) throw new Error(`No se pudo descargar el vídeo (${descarga.status})`);
          const buffer = Buffer.from(await descarga.arrayBuffer());
          const nombreArchivo = producto.video_url.split('/').pop() || 'pitch.mp4';
          const [resultado, framesExtraidos] = await Promise.all([
            transcribirAudio(buffer, nombreArchivo, { idioma: 'es' }),
            extraerFrames(buffer).catch((err) => {
              logger.warn('[ventas] Falló extracción de frames del vídeo de pitch:', err);
              return [] as FrameExtraida[];
            }),
          ]);
          guion = resultado.texto ?? '';
          origen = 'video_pitch';
          frames = framesExtraidos;
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : 'Error al procesar el vídeo';
          logger.warn('[ventas] Falló transcripción de vídeo de pitch:', err);
          if (mensaje.includes('supera el máximo')) {
            return res.status(413).json({ error: `${mensaje}. Vuelve a subir un vídeo más ligero.` });
          }
          if (mensaje.includes('no soportado')) {
            return res.status(400).json({ error: 'Formato de vídeo no compatible con transcripción. Vuelve a subirlo en mp4 o webm.' });
          }
          return res.status(502).json({ error: 'No se pudo procesar el vídeo. Intenta de nuevo.' });
        }
      }

      if (!guion || guion.length < 10) {
        return res.status(400).json({ error: 'El guion debe tener al menos 10 caracteres' });
      }
      if (guion.length > 5000) {
        return res.status(400).json({ error: 'El guion no puede superar 5000 caracteres' });
      }

      // Input del análisis para personalizar el scorer
      const input = await inputDesdeAnalisis(analisis);

      const perfilCliente = analisis.perfil_cliente_data as PerfilClienteIdeal | null;
      const evaluacion: EvaluacionGuion = await conCreditos(req.userId!, plan, 'ventas_guion', () =>
        frames.length > 0
          ? evaluarGuionConVideo(guion, frames, input, perfilCliente)
          : evaluarGuion(guion, input, perfilCliente)
      );

      // Persistir en el historial (array jsonb)
      const historial = Array.isArray(analisis.evaluaciones_guion_data) ? analisis.evaluaciones_guion_data as unknown[] : [];
      const entrada = { id: uuidv4(), guion_input: guion.slice(0, 500), resultado: evaluacion, origen };
      // Máximo 20 evaluaciones guardadas (FIFO)
      const actualizado = [...historial, entrada].slice(-20);
      analisis.evaluaciones_guion_data = actualizado;
      await repo.save(analisis);

      return res.json({ evaluacion, id: (entrada as { id: string }).id });
    } catch (err) {
      if (err instanceof CreditosInsuficientesError) return responderSinCreditos(res, err);
      logger.error('POST /api/ventas/:id/guion error:', err);
      return res.status(500).json({ error: 'Error al evaluar el guion' });
    }
  }
);

/**
 * GET /api/ventas/:id/guiones — historial de evaluaciones
 */
router.get('/:id/guiones', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisVentas).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
      select: ['id', 'evaluaciones_guion_data', 'secciones_bloqueadas'],
    });
    if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

    const plan = await getPlanFromDB(req.userId!);
    const gate = getVentasGate(plan);
    if (!gate.tiene_script_scorer) return res.status(403).json({ error: 'Requiere plan Negocio o superior' });

    return res.json({ evaluaciones: Array.isArray(analisis.evaluaciones_guion_data) ? analisis.evaluaciones_guion_data : [] });
  } catch (err) {
    logger.error('GET /api/ventas/:id/guiones error:', err);
    return res.status(500).json({ error: 'Error al obtener historial' });
  }
});

/**
 * POST /api/ventas/:id/competidores
 * Registra un competidor/referente: nombre + redes sociales/página web
 * (texto de referencia, nunca se visitan) + opcionalmente un vídeo O una
 * foto. Con vídeo se transcribe y se analiza el texto; con foto se analiza
 * visualmente con la visión de Claude; sin ninguno, corre sobre un placeholder
 * genérico marcado como degradado. Actualiza la comparativa global.
 */
router.post(
  '/:id/competidores',
  ...acceso,
  recibirCompetidorArchivos,
  async (req: AuthRequest, res: Response) => {
    let cobroCompetidor: string | null = null;
    try {
      const repo = AppDataSource.getRepository(AnalisisVentas);
      const analisis = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId } });
      if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

      const plan = await getPlanFromDB(req.userId!);
      const gate = getVentasGate(plan);
      if (!gate.tiene_competitor_intel) {
        return res.status(403).json({ error: 'El análisis de competidores requiere plan Negocio o superior' });
      }

      const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 100) : '';
      if (!nombre) return res.status(400).json({ error: 'El campo "nombre" del competidor es requerido' });

      const redesSociales = typeof req.body?.redes_sociales === 'string' && req.body.redes_sociales.trim()
        ? req.body.redes_sociales.trim().slice(0, 300)
        : undefined;
      const paginaWeb = typeof req.body?.pagina_web === 'string' && req.body.pagina_web.trim()
        ? req.body.pagina_web.trim().slice(0, 200)
        : undefined;
      const contexto = (redesSociales || paginaWeb) ? { redes_sociales: redesSociales, pagina_web: paginaWeb } : undefined;

      // Máx 10 competidores por análisis — se valida ANTES de gastar una
      // llamada a Claude en un competidor que de todos modos se va a rechazar.
      const datosActuales = (analisis.competidores_data ?? { competidores: [], comparativa: null }) as {
        competidores: AnalisisCompetidor[];
        comparativa: unknown;
      };
      const listaExistente: AnalisisCompetidor[] = Array.isArray(datosActuales.competidores) ? datosActuales.competidores : [];
      if (listaExistente.length >= 10) {
        return res.status(422).json({ error: 'Máximo 10 competidores por análisis' });
      }

      // Input del análisis propio para comparar
      const input = await inputDesdeAnalisis(analisis);

      const archivos = (req as AuthRequest & { files?: Record<string, Express.Multer.File[]> }).files;
      const archivoVideo = archivos?.video?.[0];
      const archivoFoto = archivos?.foto?.[0];

      let analisisComp: AnalisisCompetidor;
      let origen: 'video' | 'foto' | 'texto';
      let degradado: boolean;
      // Un cobro por competidor (análisis + comparativa). Se devuelve si algo falla.
      cobroCompetidor = await cobrarCreditos(req.userId!, plan, 'ventas_competidor');

      if (archivoVideo?.buffer?.length) {
        // Transcripción del video del competidor
        let transcripcion = typeof req.body?.transcripcion === 'string' ? req.body.transcripcion.trim() : '';
        if (!transcripcion && isTranscripcionAvailable()) {
          try {
            const t = await transcribirAudio(archivoVideo.buffer, archivoVideo.originalname, { idioma: 'es', mimetype: archivoVideo.mimetype });
            transcripcion = t.texto ?? '';
          } catch (e) {
            logger.warn('Transcripción de video de competidor falló, se analiza sin audio:', e);
          }
        }
        degradado = !transcripcion;
        if (!transcripcion) transcripcion = `Video del competidor: ${nombre}`;
        analisisComp = await analizarCompetidor(nombre, transcripcion, input, contexto);
        origen = 'video';
      } else if (archivoFoto?.buffer?.length) {
        const mediaType = archivoFoto.mimetype.split(';')[0].trim().toLowerCase() as ImagenParaAnalisis['media_type'];
        const imagen: ImagenParaAnalisis = { base64: archivoFoto.buffer.toString('base64'), media_type: mediaType };
        analisisComp = await analizarCompetidorFoto(nombre, imagen, input, contexto);
        origen = 'foto';
        degradado = false;
      } else {
        // Sin vídeo ni foto: si mandaron transcripción/descripción manual se
        // usa esa; si no, corre sobre un placeholder genérico y se marca
        // degradado para que el frontend avise que no es un análisis real.
        const transcripcionManual = typeof req.body?.transcripcion === 'string' ? req.body.transcripcion.trim() : '';
        degradado = !transcripcionManual;
        const transcripcion = transcripcionManual || `Competidor: ${nombre}`;
        analisisComp = await analizarCompetidor(nombre, transcripcion, input, contexto);
        origen = 'texto';
      }

      const entradaComp = {
        ...analisisComp,
        id: uuidv4(),
        redes_sociales: redesSociales,
        pagina_web: paginaWeb,
        origen,
        transcripcion_degradada: degradado,
      };
      const nuevaLista = [...listaExistente, entradaComp];

      const miProducto = { nombre: analisis.nombre_producto, categoria: analisis.categoria ?? undefined };
      const comparativa = await generarComparativa(miProducto, nuevaLista, input);

      analisis.competidores_data = { competidores: nuevaLista, comparativa };
      await repo.save(analisis);

      return res.json({ competidor: entradaComp, comparativa });
    } catch (err) {
      if (err instanceof CreditosInsuficientesError) return responderSinCreditos(res, err);
      await reembolsarCreditos({ cobroId: cobroCompetidor });
      logger.error('POST /api/ventas/:id/competidores error:', err);
      return res.status(500).json({ error: 'Error al analizar competidor' });
    }
  }
);

/**
 * GET /api/ventas/:id/competidores — lista de competidores + comparativa
 */
router.get('/:id/competidores', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const analisis = await AppDataSource.getRepository(AnalisisVentas).findOne({
      where: { id: req.params.id, usuario_id: req.userId },
      select: ['id', 'competidores_data', 'secciones_bloqueadas'],
    });
    if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

    const plan = await getPlanFromDB(req.userId!);
    const gate = getVentasGate(plan);
    if (!gate.tiene_competitor_intel) return res.status(403).json({ error: 'Requiere plan Negocio o superior' });

    const datos = (analisis.competidores_data ?? { competidores: [], comparativa: null }) as {
      competidores: AnalisisCompetidor[];
      comparativa: unknown;
    };
    return res.json(datos);
  } catch (err) {
    logger.error('GET /api/ventas/:id/competidores error:', err);
    return res.status(500).json({ error: 'Error al obtener competidores' });
  }
});

/**
 * DELETE /api/ventas/:id/competidores/:compId
 * Elimina un competidor y regenera la comparativa.
 */
router.delete('/:id/competidores/:compId', ...acceso,async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AnalisisVentas);
    const analisis = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId } });
    if (!analisis) return res.status(404).json({ error: 'Análisis no encontrado' });

    const plan = await getPlanFromDB(req.userId!);
    const gate = getVentasGate(plan);
    if (!gate.tiene_competitor_intel) return res.status(403).json({ error: 'Requiere plan Negocio o superior' });

    const datos = (analisis.competidores_data ?? { competidores: [], comparativa: null }) as {
      competidores: Array<AnalisisCompetidor & { id: string }>;
      comparativa: unknown;
    };
    const nuevaLista = (datos.competidores ?? []).filter((c) => c.id !== req.params.compId);

    const input = await inputDesdeAnalisis(analisis);

    const miProducto = { nombre: analisis.nombre_producto, categoria: analisis.categoria ?? undefined };
    const comparativa = nuevaLista.length > 0 ? await generarComparativa(miProducto, nuevaLista, input) : null;

    analisis.competidores_data = { competidores: nuevaLista, comparativa };
    await repo.save(analisis);

    return res.json({ competidores: nuevaLista, comparativa });
  } catch (err) {
    logger.error('DELETE /api/ventas/:id/competidores/:compId error:', err);
    return res.status(500).json({ error: 'Error al eliminar competidor' });
  }
});

export default router;

