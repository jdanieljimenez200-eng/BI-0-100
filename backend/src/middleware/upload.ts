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

const subirVideoSingle = uploadVideo.single('video');

export function recibirVideo(req: Request, res: Response, next: NextFunction): void {
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