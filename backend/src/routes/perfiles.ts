import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppDataSource } from '../config/database';
import {
  PerfilAnalitico,
  PLATAFORMAS_PERFIL,
  type PlataformaPerfil,
} from '../models/PerfilAnalitico';
import { PerfilVideo } from '../models/PerfilVideo';
import { Producto } from '../models/Producto';
import { authenticate } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { uploadVideo } from '../middleware/upload';
import { StorageService } from '../services/StorageService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Máximo de vídeos con BYTES vivos por perfil. Al superarlo NO se rechaza la
 * subida: se archiva el más antiguo (fila + métricas intactas, bytes borrados),
 * así el usuario nunca se queda bloqueado y el coste de storage está acotado.
 */
const MAX_VIDEOS_ACTIVOS = 5;

const PLATAFORMAS = new Set<string>(PLATAFORMAS_PERFIL);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── Parsers ─────────────────────────────────────────────────────────────────
// Los vídeos llegan en multipart, así que TODO valor numérico entra como string.

/** Entero >= 0 acotado a int4; null si el valor no es utilizable. */
function entero(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), 2_000_000_000);
}

/** Porcentaje 0–100 con 2 decimales (cabe en numeric(5,2)). */
function porcentaje(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n * 100) / 100, 100);
}

function texto(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const limpio = raw.trim().slice(0, max);
  return limpio.length > 0 ? limpio : null;
}

/** ISO YYYY-MM-DD válido, o null. Evita mandar basura a una columna `date`. */
function fechaISO(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
  const valor = raw.trim();
  return Number.isNaN(new Date(`${valor}T00:00:00Z`).getTime()) ? null : valor;
}

/**
 * `undefined` = la clave no venía en el body (no tocar la columna).
 * `null`      = el usuario la vació a propósito.
 */
function campo<T>(
  body: Record<string, unknown>,
  clave: string,
  parser: (raw: unknown) => T | null
): T | null | undefined {
  if (!(clave in body)) return undefined;
  return parser(body[clave]);
}

/** '@Marca_MX' → 'marca_mx'. Un handle no distingue mayúsculas ni lleva arroba. */
function normalizarHandle(raw: unknown): string | null {
  const valor = texto(raw, 120);
  if (!valor) return null;
  const limpio = valor.replace(/^@+/, '').trim().toLowerCase();
  return limpio.length > 0 ? limpio : null;
}

/** Solo http(s): un `javascript:` guardado y renderizado sería XSS. */
function urlPublica(raw: unknown): string | null {
  const valor = texto(raw, 500);
  if (!valor) return null;
  try {
    const parsed = new URL(valor);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? valor : null;
  } catch {
    return null;
  }
}

const CLAVES_METRICAS_PERFIL = ['seguidores', 'alcance_mensual', 'engagement_rate'] as const;

// ─── Serializadores ──────────────────────────────────────────────────────────
// `numeric` vuelve de Postgres como string: se coacciona aquí para que el front
// no tenga que hacer Number() en cada render.

function mapPerfil(p: PerfilAnalitico, videos_activos?: number) {
  return {
    id: p.id,
    producto_id: p.producto_id ?? null,
    plataforma: p.plataforma,
    handle: p.handle,
    url: p.url ?? null,
    seguidores: p.seguidores ?? null,
    alcance_mensual: p.alcance_mensual ?? null,
    engagement_rate: p.engagement_rate === null || p.engagement_rate === undefined
      ? null
      : Number(p.engagement_rate),
    nicho: p.nicho ?? null,
    notas: p.notas ?? null,
    metricas_declaradas_at: p.metricas_declaradas_at ?? null,
    estado: p.estado,
    created_at: p.created_at,
    // Las métricas las escribe el usuario; el front debe etiquetarlas como tal.
    origen_metricas: 'declarado' as const,
    ...(videos_activos === undefined ? {} : { videos_activos }),
  };
}

function mapVideo(v: PerfilVideo) {
  const vistas = v.vistas ?? 0;
  const interacciones =
    (v.likes ?? 0) + (v.comentarios ?? 0) + (v.compartidos ?? 0) + (v.guardados ?? 0);

  return {
    id: v.id,
    perfil_id: v.perfil_id,
    titulo: v.titulo,
    storage_url: v.storage_url ?? null,
    mime: v.mime ?? null,
    bytes: v.bytes ?? null,
    publicado_en: v.publicado_en ?? null,
    vistas: v.vistas ?? null,
    likes: v.likes ?? null,
    comentarios: v.comentarios ?? null,
    compartidos: v.compartidos ?? null,
    guardados: v.guardados ?? null,
    retencion_pct:
      v.retencion_pct === null || v.retencion_pct === undefined ? null : Number(v.retencion_pct),
    ctr_pct: v.ctr_pct === null || v.ctr_pct === undefined ? null : Number(v.ctr_pct),
    resumen_ia: v.resumen_ia ?? null,
    estado: v.estado,
    archivado_at: v.archivado_at ?? null,
    created_at: v.created_at,
    // Derivado, no persistido: si no hay vistas declaradas no se inventa un 0%.
    engagement_pct:
      vistas > 0 ? Math.round((interacciones / vistas) * 10000) / 100 : null,
  };
}

// ─── Multer ──────────────────────────────────────────────────────────────────

const subirVideo = uploadVideo.single('video');

/**
 * Mismo wrapper que routes/productos.ts (allí es local, no exportado): traduce
 * los fallos de multer a 4xx. Sin esto el Error del fileFilter llegaría al error
 * handler global como 500 "Internal Server Error" y el usuario no sabría que el
 * problema es el formato o el peso.
 */
function recibirVideo(req: Request, res: Response, next: NextFunction): void {
  subirVideo(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const esTamano = err.code === 'LIMIT_FILE_SIZE';
      res.status(esTamano ? 413 : 400).json({
        error: esTamano ? 'El vídeo supera el máximo de 50 MB' : 'Archivo de vídeo inválido',
      });
      return;
    }
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Archivo de vídeo inválido',
    });
  });
}

// ─── Helpers de acceso ───────────────────────────────────────────────────────

const perfilRepo = () => AppDataSource.getRepository(PerfilAnalitico);
const videoRepo = () => AppDataSource.getRepository(PerfilVideo);

/**
 * Carga el perfil comprobando propiedad. Devuelve null y responde 400/404 él
 * mismo para que cada ruta no repita el mismo bloque de guardas.
 */
async function cargarPerfil(req: AuthRequest, res: Response): Promise<PerfilAnalitico | null> {
  const id = String(req.params.id ?? '');
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'id de perfil inválido' });
    return null;
  }
  const perfil = await perfilRepo().findOne({ where: { id, usuario_id: req.userId } });
  if (!perfil) {
    res.status(404).json({ error: 'Perfil no encontrado' });
    return null;
  }
  return perfil;
}

/** Vídeo del perfil ya validado. Filtra también por usuario_id (defensa en profundidad). */
async function cargarVideo(
  req: AuthRequest,
  res: Response,
  perfil: PerfilAnalitico
): Promise<PerfilVideo | null> {
  const videoId = String(req.params.videoId ?? '');
  if (!UUID_RE.test(videoId)) {
    res.status(400).json({ error: 'videoId inválido' });
    return null;
  }
  const video = await videoRepo().findOne({
    where: { id: videoId, perfil_id: perfil.id, usuario_id: req.userId },
  });
  if (!video) {
    res.status(404).json({ error: 'Vídeo no encontrado' });
    return null;
  }
  return video;
}

/**
 * Archiva un vídeo: libera los bytes y conserva la fila con sus métricas.
 * El borrado en storage va DESPUÉS de persistir y es best-effort — al revés
 * dejaríamos una fila apuntando a un archivo que ya no existe.
 */
async function archivarVideo(video: PerfilVideo): Promise<PerfilVideo> {
  const anterior = video.storage_url;

  video.storage_url = null;
  video.estado = 'archivado';
  video.archivado_at = new Date();
  const guardado = await videoRepo().save(video);

  if (anterior) {
    StorageService.deleteFile(anterior, 'videos').catch(() => {});
  }
  return guardado;
}

// ─── Perfiles ────────────────────────────────────────────────────────────────

/**
 * GET /api/perfiles?productoId=…&incluirArchivados=true
 * Lista los perfiles de la cuenta con su nº de vídeos activos (lo que consume
 * cupo), para que el front pueda pintar "3 / 5" sin una segunda llamada.
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const productoId = String(req.query.productoId ?? '').trim();
    if (productoId && !UUID_RE.test(productoId)) {
      return res.status(400).json({ error: 'productoId inválido' });
    }

    const incluirArchivados = String(req.query.incluirArchivados ?? '') === 'true';

    const perfiles = await perfilRepo().find({
      where: {
        usuario_id: req.userId,
        ...(productoId ? { producto_id: productoId } : {}),
        ...(incluirArchivados ? {} : { estado: 'activo' as const }),
      },
      order: { created_at: 'DESC' },
    });

    if (perfiles.length === 0) {
      return res.json([]);
    }

    // Un solo GROUP BY en vez de N counts: la lista es corta pero el patrón
    // evita el N+1 si un usuario acumula perfiles.
    const filas = await videoRepo()
      .createQueryBuilder('v')
      .select('v.perfil_id', 'perfil_id')
      .addSelect('COUNT(*)', 'total')
      .where('v.usuario_id = :usuarioId', { usuarioId: req.userId })
      .andWhere("v.estado = 'activo'")
      .groupBy('v.perfil_id')
      .getRawMany<{ perfil_id: string; total: string }>();

    const activosPorPerfil = new Map(filas.map((f) => [f.perfil_id, Number(f.total)]));

    return res.json(perfiles.map((p) => mapPerfil(p, activosPorPerfil.get(p.id) ?? 0)));
  } catch (err) {
    logger.error('GET /api/perfiles error:', err);
    return res.status(500).json({ error: 'Error al listar perfiles' });
  }
});

/** POST /api/perfiles — crea un perfil social. */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const plataforma = String(body.plataforma ?? '').trim().toLowerCase();
    if (!PLATAFORMAS.has(plataforma)) {
      return res.status(400).json({
        error: `plataforma inválida (permitidas: ${PLATAFORMAS_PERFIL.join(', ')})`,
      });
    }

    const handle = normalizarHandle(body.handle);
    if (!handle) {
      return res.status(400).json({ error: 'handle es requerido' });
    }

    // producto_id se valida contra la BD: sin esto un usuario podría colgar un
    // perfil de un producto ajeno pasando un UUID cualquiera.
    let productoId: string | null = null;
    if (typeof body.producto_id === 'string' && body.producto_id.trim()) {
      productoId = body.producto_id.trim();
      if (!UUID_RE.test(productoId)) {
        return res.status(400).json({ error: 'producto_id inválido' });
      }
      const existe = await AppDataSource.getRepository(Producto).findOne({
        where: { id: productoId, usuario_id: req.userId },
        select: ['id'],
      });
      if (!existe) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
    }

    const seguidores = entero(body.seguidores);
    const alcance = entero(body.alcance_mensual);
    const engagement = porcentaje(body.engagement_rate);
    const declaroMetricas = seguidores !== null || alcance !== null || engagement !== null;

    const repo = perfilRepo();
    const duplicado = await repo.findOne({
      where: { usuario_id: req.userId, plataforma: plataforma as PlataformaPerfil, handle },
      select: ['id'],
    });
    if (duplicado) {
      return res.status(409).json({ error: 'Ya tienes ese perfil registrado en esa plataforma' });
    }

    const perfil = repo.create({
      usuario_id: req.userId!,
      producto_id: productoId,
      plataforma: plataforma as PlataformaPerfil,
      handle,
      url: urlPublica(body.url),
      seguidores,
      alcance_mensual: alcance,
      engagement_rate: engagement,
      nicho: texto(body.nicho, 120),
      notas: texto(body.notas, 2000),
      metricas_declaradas_at: declaroMetricas ? new Date() : null,
      estado: 'activo',
    });
    await repo.save(perfil);

    return res.status(201).json(mapPerfil(perfil, 0));
  } catch (err) {
    logger.error('POST /api/perfiles error:', err);
    return res.status(500).json({ error: 'Error al crear el perfil' });
  }
});

/** PUT /api/perfiles/:id — actualización parcial (solo las claves enviadas). */
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const perfil = await cargarPerfil(req, res);
    if (!perfil) return;

    const body = (req.body ?? {}) as Record<string, unknown>;

    if ('handle' in body) {
      const handle = normalizarHandle(body.handle);
      if (!handle) {
        return res.status(400).json({ error: 'handle inválido' });
      }
      if (handle !== perfil.handle) {
        const duplicado = await perfilRepo().findOne({
          where: { usuario_id: req.userId, plataforma: perfil.plataforma, handle },
          select: ['id'],
        });
        if (duplicado) {
          return res.status(409).json({ error: 'Ya tienes ese perfil registrado en esa plataforma' });
        }
        perfil.handle = handle;
      }
    }

    if ('plataforma' in body) {
      const plataforma = String(body.plataforma ?? '').trim().toLowerCase();
      if (!PLATAFORMAS.has(plataforma)) {
        return res.status(400).json({ error: 'plataforma inválida' });
      }
      perfil.plataforma = plataforma as PlataformaPerfil;
    }

    const url = campo(body, 'url', urlPublica);
    if (url !== undefined) perfil.url = url;

    const seguidores = campo(body, 'seguidores', entero);
    if (seguidores !== undefined) perfil.seguidores = seguidores;

    const alcance = campo(body, 'alcance_mensual', entero);
    if (alcance !== undefined) perfil.alcance_mensual = alcance;

    const engagement = campo(body, 'engagement_rate', porcentaje);
    if (engagement !== undefined) perfil.engagement_rate = engagement;

    const nicho = campo(body, 'nicho', (raw) => texto(raw, 120));
    if (nicho !== undefined) perfil.nicho = nicho;

    const notas = campo(body, 'notas', (raw) => texto(raw, 2000));
    if (notas !== undefined) perfil.notas = notas;

    if ('estado' in body) {
      const estado = String(body.estado ?? '');
      if (estado !== 'activo' && estado !== 'archivado') {
        return res.status(400).json({ error: "estado debe ser 'activo' o 'archivado'" });
      }
      perfil.estado = estado;
    }

    // Solo se refresca la marca temporal si se tocó una métrica: así el análisis
    // puede avisar de datos viejos aunque el usuario haya editado el nicho ayer.
    if (CLAVES_METRICAS_PERFIL.some((clave) => clave in body)) {
      perfil.metricas_declaradas_at = new Date();
    }

    await perfilRepo().save(perfil);
    return res.json(mapPerfil(perfil));
  } catch (err) {
    logger.error('PUT /api/perfiles/:id error:', err);
    return res.status(500).json({ error: 'Error al actualizar el perfil' });
  }
});

/**
 * DELETE /api/perfiles/:id — borra el perfil y sus vídeos.
 * El FK es ON DELETE CASCADE, pero los objetos del storage NO se borran solos:
 * se recogen antes para limpiarlos best-effort después.
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const perfil = await cargarPerfil(req, res);
    if (!perfil) return;

    const videos = await videoRepo().find({
      where: { perfil_id: perfil.id, usuario_id: req.userId },
      select: ['id', 'storage_url'],
    });

    await perfilRepo().remove(perfil);

    for (const video of videos) {
      if (video.storage_url) {
        StorageService.deleteFile(video.storage_url, 'videos').catch(() => {});
      }
    }

    return res.json({ message: 'Perfil eliminado', id: perfil.id });
  } catch (err) {
    logger.error('DELETE /api/perfiles/:id error:', err);
    return res.status(500).json({ error: 'Error al eliminar el perfil' });
  }
});

// ─── Vídeos del perfil ───────────────────────────────────────────────────────

/** GET /api/perfiles/:id/videos — histórico completo (activos + archivados). */
router.get('/:id/videos', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const perfil = await cargarPerfil(req, res);
    if (!perfil) return;

    const videos = await videoRepo().find({
      where: { perfil_id: perfil.id, usuario_id: req.userId },
      order: { created_at: 'DESC' },
    });

    const activos = videos.filter((v) => v.estado === 'activo').length;

    return res.json({
      perfil: mapPerfil(perfil, activos),
      max_activos: MAX_VIDEOS_ACTIVOS,
      videos: videos.map(mapVideo),
    });
  } catch (err) {
    logger.error('GET /api/perfiles/:id/videos error:', err);
    return res.status(500).json({ error: 'Error al listar los vídeos del perfil' });
  }
});

/**
 * POST /api/perfiles/:id/videos — sube un vídeo con sus métricas declaradas.
 *
 * Al llegar al tope se archiva el más antiguo en lugar de rechazar la subida:
 * el usuario recupera el hueco, el histórico se mantiene y el storage no crece.
 * La respuesta informa de qué se archivó (`archivado_automaticamente`).
 */
router.post('/:id/videos', authenticate, recibirVideo, async (req: AuthRequest, res: Response) => {
  try {
    const perfil = await cargarPerfil(req, res);
    if (!perfil) return;

    const archivo = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!archivo?.buffer?.length) {
      return res.status(400).json({ error: 'Falta el vídeo (campo "video" del form-data)' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const titulo = texto(body.titulo, 200) ?? archivo.originalname.slice(0, 200);

    let storageUrl: string;
    try {
      storageUrl = await StorageService.uploadFile(
        archivo.buffer,
        archivo.originalname,
        archivo.mimetype,
        'videos'
      );
    } catch (err) {
      logger.error('[perfiles] Falló la subida de vídeo:', err);
      return res.status(500).json({ error: 'No se pudo guardar el vídeo' });
    }

    const repo = videoRepo();
    const video = repo.create({
      perfil_id: perfil.id,
      usuario_id: req.userId!,
      titulo,
      storage_url: storageUrl,
      mime: archivo.mimetype.split(';')[0].trim().toLowerCase().slice(0, 100),
      bytes: archivo.buffer.length,
      publicado_en: fechaISO(body.publicado_en),
      vistas: entero(body.vistas),
      likes: entero(body.likes),
      comentarios: entero(body.comentarios),
      compartidos: entero(body.compartidos),
      guardados: entero(body.guardados),
      retencion_pct: porcentaje(body.retencion_pct),
      ctr_pct: porcentaje(body.ctr_pct),
      resumen_ia: texto(body.resumen_ia, 4000),
      estado: 'activo',
    });

    try {
      await repo.save(video);
    } catch (err) {
      // La fila no existe: el objeto subido quedaría huérfano en storage.
      StorageService.deleteFile(storageUrl, 'videos').catch(() => {});
      throw err;
    }

    // El recién subido ya cuenta, de ahí el `>` en vez de `>=`.
    const activos = await repo.find({
      where: { perfil_id: perfil.id, usuario_id: req.userId, estado: 'activo' },
      order: { created_at: 'ASC' },
    });

    const archivados: string[] = [];
    const aArchivar = activos
      .slice(0, Math.max(0, activos.length - MAX_VIDEOS_ACTIVOS))
      .filter((v) => v.id !== video.id); // nunca archivar el que se acaba de subir
    await Promise.all(aArchivar.map((v) => archivarVideo(v)));
    archivados.push(...aArchivar.map((v) => v.id));

    return res.status(201).json({
      video: mapVideo(video),
      max_activos: MAX_VIDEOS_ACTIVOS,
      // Los archivados conservan métricas y resumen: solo se liberaron los bytes.
      archivado_automaticamente: archivados,
    });
  } catch (err) {
    logger.error('POST /api/perfiles/:id/videos error:', err);
    return res.status(500).json({ error: 'Error al subir el vídeo del perfil' });
  }
});

/** PATCH /api/perfiles/:id/videos/:videoId — corrige métricas o resumen. */
router.patch(
  '/:id/videos/:videoId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const perfil = await cargarPerfil(req, res);
      if (!perfil) return;
      const video = await cargarVideo(req, res, perfil);
      if (!video) return;

      const body = (req.body ?? {}) as Record<string, unknown>;

      const titulo = campo(body, 'titulo', (raw) => texto(raw, 200));
      if (titulo !== undefined) {
        if (titulo === null) {
          return res.status(400).json({ error: 'titulo no puede quedar vacío' });
        }
        video.titulo = titulo;
      }

      const publicado = campo(body, 'publicado_en', fechaISO);
      if (publicado !== undefined) video.publicado_en = publicado;

      const vistas = campo(body, 'vistas', entero);
      if (vistas !== undefined) video.vistas = vistas;

      const likes = campo(body, 'likes', entero);
      if (likes !== undefined) video.likes = likes;

      const comentarios = campo(body, 'comentarios', entero);
      if (comentarios !== undefined) video.comentarios = comentarios;

      const compartidos = campo(body, 'compartidos', entero);
      if (compartidos !== undefined) video.compartidos = compartidos;

      const guardados = campo(body, 'guardados', entero);
      if (guardados !== undefined) video.guardados = guardados;

      const retencion = campo(body, 'retencion_pct', porcentaje);
      if (retencion !== undefined) video.retencion_pct = retencion;

      const ctr = campo(body, 'ctr_pct', porcentaje);
      if (ctr !== undefined) video.ctr_pct = ctr;

      const resumen = campo(body, 'resumen_ia', (raw) => texto(raw, 4000));
      if (resumen !== undefined) video.resumen_ia = resumen;

      await videoRepo().save(video);
      return res.json(mapVideo(video));
    } catch (err) {
      logger.error('PATCH /api/perfiles/:id/videos/:videoId error:', err);
      return res.status(500).json({ error: 'Error al actualizar el vídeo' });
    }
  }
);

/**
 * POST /api/perfiles/:id/videos/:videoId/archivar — libera los bytes y deja
 * la fila viva. Idempotente: archivar dos veces responde 200 igualmente.
 */
router.post(
  '/:id/videos/:videoId/archivar',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const perfil = await cargarPerfil(req, res);
      if (!perfil) return;
      const video = await cargarVideo(req, res, perfil);
      if (!video) return;

      if (video.estado === 'archivado' && !video.storage_url) {
        return res.json(mapVideo(video));
      }

      const archivado = await archivarVideo(video);
      return res.json(mapVideo(archivado));
    } catch (err) {
      logger.error('POST /api/perfiles/:id/videos/:videoId/archivar error:', err);
      return res.status(500).json({ error: 'Error al archivar el vídeo' });
    }
  }
);

/**
 * DELETE /api/perfiles/:id/videos/:videoId — borrado REAL (fila + bytes).
 * Se separa de /archivar a propósito: archivar conserva el histórico que
 * alimenta la tendencia; esto lo elimina sin vuelta atrás.
 */
router.delete(
  '/:id/videos/:videoId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const perfil = await cargarPerfil(req, res);
      if (!perfil) return;
      const video = await cargarVideo(req, res, perfil);
      if (!video) return;

      const url = video.storage_url;
      await videoRepo().remove(video);
      if (url) {
        StorageService.deleteFile(url, 'videos').catch(() => {});
      }

      return res.json({ message: 'Vídeo eliminado' });
    } catch (err) {
      logger.error('DELETE /api/perfiles/:id/videos/:videoId error:', err);
      return res.status(500).json({ error: 'Error al eliminar el vídeo' });
    }
  }
);

export default router;