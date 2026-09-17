import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';

// ─── Whitelists por tipo de media ───────────────────────────────────────────
// Extensiones permitidas — SVG excluido explícitamente (stored-XSS al servirse)
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Formatos que acepta el endpoint de transcripción (ver transcripcionService).
const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.webm',
  '.ogg',
  '.oga',
  '.flac',
  '.mpga',
  '.mp4',
]);

const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v']);

/**
 * Extensión canónica por MIME para las grabaciones del navegador.
 *
 * MediaRecorder + FormData envían el blob con originalname 'blob' (sin
 * extensión), así que validar solo por extensión rechazaría toda grabación
 * hecha en el cliente. Cuando el MIME es conocido se REESCRIBE originalname
 * con la extensión correspondiente: StorageService la usa para la Key y el
 * servicio de transcripción exige un nombre con extensión soportada.
 */
const EXT_POR_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

interface OpcionesUploader {
  /** Familia MIME exigida (primera barrera, spoofable). */
  tipoBase: 'image' | 'audio' | 'video';
  extensiones: ReadonlySet<string>;
  maxBytes: number;
  mensajeError: string;
}

/**
 * Subida efímera en memoria RAM: el buffer se pasa tal cual a StorageService,
 * que decide destino (S3 en prod / disco emulado en dev). Nunca se escribe un
 * temporal en disco.
 */
function crearUploader({ tipoBase, extensiones, maxBytes, mensajeError }: OpcionesUploader) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      // 1) MIME declarado. Se corta en ';' porque el navegador manda
      //    'audio/webm;codecs=opus'.
      const mime = file.mimetype.split(';')[0].trim().toLowerCase();
      if (!mime.startsWith(`${tipoBase}/`)) {
        cb(new Error(mensajeError));
        return;
      }

      // 2) SVG bloqueado aunque llegue como image/svg+xml
      if (mime === 'image/svg+xml') {
        cb(new Error('Formato SVG no permitido por seguridad'));
        return;
      }

      // 3) Extensión real en whitelist. Si el cliente no manda extensión
      //    (grabación del navegador) se deriva del MIME conocido; el nombre
      //    final del objeto lo genera StorageService con uuid.
      let ext = path.extname(file.originalname).toLowerCase();
      if (!extensiones.has(ext)) {
        const derivada = EXT_POR_MIME[mime];
        if (!derivada || !extensiones.has(derivada)) {
          cb(new Error(mensajeError));
          return;
        }
        ext = derivada;
        file.originalname = `grabacion${ext}`;
      }

      cb(null, true);
    },
  });
}

/** Imágenes de producto (comportamiento original: 5 MB, jpg/png/webp/gif). */
export const upload = crearUploader({
  tipoBase: 'image',
  extensiones: ALLOWED_IMAGE_EXTENSIONS,
  maxBytes: 5 * 1024 * 1024,
  mensajeError: 'Solo se permiten imágenes (jpg, png, webp, gif)',
});

/**
 * Audio para transcripción. El techo es 25 MB porque es el límite del endpoint
 * de transcripción: aceptar más aquí solo movería el fallo más adelante.
 */
export const uploadAudio = crearUploader({
  tipoBase: 'audio',
  extensiones: ALLOWED_AUDIO_EXTENSIONS,
  maxBytes: 25 * 1024 * 1024,
  mensajeError: 'Solo se permite audio (mp3, m4a, wav, webm, ogg, flac)',
});

/** Vídeo subido por el usuario (se almacena bajo el prefijo 'videos'). */
export const uploadVideo = crearUploader({
  tipoBase: 'video',
  extensiones: ALLOWED_VIDEO_EXTENSIONS,
  maxBytes: 50 * 1024 * 1024,
  mensajeError: 'Solo se permite vídeo (mp4, webm, mov)',
});

// ─── Cupo de subidas pesadas en memoria ───────────────────────────────────────
//
// Vídeo y audio llegan a RAM completos (hasta 50 MB por archivo) y ahí siguen
// mientras el handler los procesa (S3, ffmpeg, transcripción). Sin cupo, diez
// subidas simultáneas son ~500 MB y bastan para matar el contenedor por OOM.
// El cupo se reserva ANTES de que multer lea el cuerpo y se libera cuando la
// respuesta termina o la conexión se cierra.

export const MAX_SUBIDAS_PESADAS_POR_USUARIO = 2;

function maxSubidasPesadasGlobal(): number {
  const valor = parseInt(process.env.MAX_SUBIDAS_PESADAS_SIMULTANEAS || '', 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 8;
}

const subidasPesadasPorUsuario = new Map<string, number>();
let subidasPesadasEnCurso = 0;

/** Solo para tests. */
export function _subidasPesadasEnCurso(): number {
  return subidasPesadasEnCurso;
}

/**
 * Reserva un cupo de subida pesada. Si no hay, responde 429 y devuelve false.
 * Se identifica por usuario autenticado y, sin él, por IP.
 */
export function reservarCupoSubidaPesada(req: Request, res: Response): boolean {
  const clave = (req as Request & { userId?: string }).userId ?? `ip:${req.ip ?? 'desconocida'}`;
  const delUsuario = subidasPesadasPorUsuario.get(clave) ?? 0;

  if (delUsuario >= MAX_SUBIDAS_PESADAS_POR_USUARIO || subidasPesadasEnCurso >= maxSubidasPesadasGlobal()) {
    res.setHeader('Retry-After', '15');
    res.status(429).json({
      error:
        delUsuario >= MAX_SUBIDAS_PESADAS_POR_USUARIO
          ? 'Ya tienes subidas grandes en curso. Espera a que terminen e inténtalo de nuevo.'
          : 'Hay muchas subidas grandes en curso ahora mismo. Inténtalo de nuevo en unos segundos.',
    });
    return false;
  }

  subidasPesadasPorUsuario.set(clave, delUsuario + 1);
  subidasPesadasEnCurso++;

  let liberado = false;
  const liberar = (): void => {
    if (liberado) return;
    liberado = true;
    subidasPesadasEnCurso--;
    const restantes = (subidasPesadasPorUsuario.get(clave) ?? 1) - 1;
    if (restantes <= 0) subidasPesadasPorUsuario.delete(clave);
    else subidasPesadasPorUsuario.set(clave, restantes);
  };
  res.once('finish', liberar);
  res.once('close', liberar);
  return true;
}

const subirVideoSingle = uploadVideo.single('video');

export function recibirVideo(req: Request, res: Response, next: NextFunction): void {
  if (!reservarCupoSubidaPesada(req, res)) return;
  subirVideoSingle(req, res, (err: unknown) => {
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

// ─── Subida combinada multi-campo (varios tipos de archivo en una petición) ──
// A diferencia de `crearUploader`, aquí cada campo del multipart valida
// contra su PROPIO whitelist (por fieldname), porque un mismo endpoint acepta
// más de un tipo de archivo a la vez (ej. audio+vídeo, o vídeo+foto).
interface CampoArchivoConfig {
  tipoBase: 'audio' | 'video' | 'image';
  extensiones: ReadonlySet<string>;
  mensajeError: string;
}

function fileFilterPorCampos(campos: Record<string, CampoArchivoConfig>): multer.Options['fileFilter'] {
  return (_req, file, cb) => {
    const config = campos[file.fieldname];
    if (!config) {
      cb(new Error('Campo de archivo no reconocido'));
      return;
    }

    const mime = file.mimetype.split(';')[0].trim().toLowerCase();
    if (!mime.startsWith(`${config.tipoBase}/`)) {
      cb(new Error(config.mensajeError));
      return;
    }

    if (mime === 'image/svg+xml') {
      cb(new Error('Formato SVG no permitido por seguridad'));
      return;
    }

    let ext = path.extname(file.originalname).toLowerCase();
    if (!config.extensiones.has(ext)) {
      const derivada = EXT_POR_MIME[mime];
      if (!derivada || !config.extensiones.has(derivada)) {
        cb(new Error(config.mensajeError));
        return;
      }
      ext = derivada;
      file.originalname = `grabacion${ext}`;
    }

    cb(null, true);
  };
}

const CAMPOS_GUION: Record<string, CampoArchivoConfig> = {
  audio: {
    tipoBase: 'audio',
    extensiones: ALLOWED_AUDIO_EXTENSIONS,
    mensajeError: 'Solo se permite audio (mp3, m4a, wav, webm, ogg, flac)',
  },
  video: {
    tipoBase: 'video',
    extensiones: ALLOWED_VIDEO_EXTENSIONS,
    mensajeError: 'Solo se permite vídeo (mp4, webm, mov)',
  },
};

const uploadGuion = multer({
  storage: multer.memoryStorage(),
  // Límite por archivo igual al techo de vídeo (50MB); el de audio se acota
  // aparte en transcripcionService (25MB) con su propio mensaje de error.
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: fileFilterPorCampos(CAMPOS_GUION),
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]);

export function recibirGuionArchivos(req: Request, res: Response, next: NextFunction): void {
  if (!reservarCupoSubidaPesada(req, res)) return;
  uploadGuion(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const esTamano = err.code === 'LIMIT_FILE_SIZE';
      res.status(esTamano ? 413 : 400).json({
        error: esTamano ? 'El archivo supera el máximo de 50 MB' : 'Archivo inválido',
      });
      return;
    }
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Archivo inválido',
    });
  });
}

// ─── Subida combinada para Competitor Intel (vídeo O foto del competidor) ───
const CAMPOS_COMPETIDOR: Record<string, CampoArchivoConfig> = {
  video: {
    tipoBase: 'video',
    extensiones: ALLOWED_VIDEO_EXTENSIONS,
    mensajeError: 'Solo se permite vídeo (mp4, webm, mov)',
  },
  foto: {
    tipoBase: 'image',
    extensiones: ALLOWED_IMAGE_EXTENSIONS,
    mensajeError: 'Solo se permite imagen (jpg, png, webp, gif)',
  },
};

const uploadCompetidor = multer({
  storage: multer.memoryStorage(),
  // Techo igual al de vídeo (50MB); una foto real nunca se acerca a ese peso.
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: fileFilterPorCampos(CAMPOS_COMPETIDOR),
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'foto', maxCount: 1 },
]);

export function recibirCompetidorArchivos(req: Request, res: Response, next: NextFunction): void {
  if (!reservarCupoSubidaPesada(req, res)) return;
  uploadCompetidor(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const esTamano = err.code === 'LIMIT_FILE_SIZE';
      res.status(esTamano ? 413 : 400).json({
        error: esTamano ? 'El archivo supera el máximo de 50 MB' : 'Archivo inválido',
      });
      return;
    }
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Archivo inválido',
    });
  });
}

// ─── Subida de reportes de anuncios (CSV, XLSX, XLS) ─────────────────────────

const ALLOWED_REPORTE_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);

const ALLOWED_REPORTE_MIMES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'text/comma-separated-values',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

export const uploadReporte = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_REPORTE_EXTENSIONS.has(ext)) {
      cb(new Error('Solo se permiten archivos de reporte en formato CSV o Excel (.xlsx, .xls)'));
      return;
    }
    const mime = file.mimetype.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_REPORTE_MIMES.has(mime) && mime !== '') {
      cb(new Error('Solo se permiten archivos de reporte en formato CSV o Excel (.xlsx, .xls)'));
      return;
    }
    cb(null, true);
  },
});

const subirReporteSingle = uploadReporte.single('reporte');

export function recibirReporteAds(req: Request, res: Response, next: NextFunction): void {
  subirReporteSingle(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const esTamano = err.code === 'LIMIT_FILE_SIZE';
      res.status(esTamano ? 413 : 400).json({
        error: esTamano ? 'El archivo supera el máximo de 10 MB' : 'Archivo de reporte inválido',
      });
      return;
    }
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Archivo de reporte inválido',
    });
  });
}
// ─── Red de expertos ─────────────────────────────────────────────────────────

/**
 * Documento de acreditación (cédula, licencia, colegiación).
 *
 * Acepta PDF además de imagen, que es como viene una cédula de verdad. El
 * fichero no va a `StorageService`: lo guarda `documentosService` en una carpeta
 * que NO se publica como estática, porque esto es un documento de identidad y no
 * puede quedar accesible a quien tenga el enlace.
 */
const ALLOWED_DOCUMENTO_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_DOCUMENTO_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MENSAJE_DOCUMENTO = 'El documento debe ser un PDF o una imagen (jpg, png, webp)';

export const uploadDocumentoExperto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.split(';')[0].trim().toLowerCase();
    // Extensión Y tipo declarado: cualquiera de los dos por separado se falsea
    // renombrando el fichero o tocando la cabecera.
    if (!ALLOWED_DOCUMENTO_EXTENSIONS.has(ext) || !ALLOWED_DOCUMENTO_MIMES.has(mime)) {
      cb(new Error(MENSAJE_DOCUMENTO));
      return;
    }
    cb(null, true);
  },
});

const subirDocumentoSingle = uploadDocumentoExperto.single('documento');

export function recibirDocumentoExperto(req: Request, res: Response, next: NextFunction): void {
  subirDocumentoSingle(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const esTamano = err.code === 'LIMIT_FILE_SIZE';
      res.status(esTamano ? 413 : 400).json({
        error: esTamano ? 'El documento supera el máximo de 8 MB' : MENSAJE_DOCUMENTO,
      });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : MENSAJE_DOCUMENTO });
  });
}

/**
 * Imágenes públicas de un perfil de la red (foto, portada, galería): van a
 * StorageService. `campo` es el nombre del campo del formulario.
 */
function recibirImagenRed(campo: string, maxMb: number) {
  const single = crearUploader({
    tipoBase: 'image',
    extensiones: ALLOWED_IMAGE_EXTENSIONS,
    maxBytes: maxMb * 1024 * 1024,
    mensajeError: 'La imagen debe ser jpg, png, webp o gif',
  }).single(campo);

  return (req: Request, res: Response, next: NextFunction): void => {
    single(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        const esTamano = err.code === 'LIMIT_FILE_SIZE';
        res.status(esTamano ? 413 : 400).json({
          error: esTamano ? `La imagen supera el máximo de ${maxMb} MB` : 'Imagen inválida',
        });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Imagen inválida' });
    });
  };
}

export const recibirAvatarExperto = recibirImagenRed('avatar', 3);
export const recibirPortadaExperto = recibirImagenRed('portada', 5);
export const recibirImagenGaleria = recibirImagenRed('imagen', 5);
