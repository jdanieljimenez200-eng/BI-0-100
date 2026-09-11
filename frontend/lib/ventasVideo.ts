import axios from 'axios';
import api from '@/lib/api';
import { API_ORIGIN } from '@/lib/config';

/**
 * Cliente de los endpoints de vídeo usados por el MÓDULO DE VENTAS
 * (frontend/app/dashboard/ventas/[productoId]/page.tsx).
 *
 * El vídeo se persiste sobre el producto porque así lo expone el backend
 * (backend/src/routes/productos.ts), pero la única UI que lo sube/borra vive en
 * ventas:
 *  - POST   /api/productos/:id/video  → multipart, campo "video" → { message, id, video_url }
 *  - DELETE /api/productos/:id/video  → { message, id } (idempotente)
 *
 * Los límites replican exactamente los de `uploadVideo`
 * (backend/src/middleware/upload.ts) para fallar en el cliente antes de gastar
 * una subida de hasta 50 MB.
 */

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Whitelist de extensiones del middleware (ALLOWED_VIDEO_EXTENSIONS). */
export const VIDEO_EXTENSIONES = ['.mp4', '.webm', '.mov', '.m4v'] as const;

/**
 * Extensión derivable desde el MIME (EXT_POR_MIME del middleware). Un archivo
 * sin extensión en el nombre solo pasa el filtro si su MIME está aquí.
 */
const EXT_POR_MIME: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

/** Valor para el atributo `accept` del <input type="file">. */
export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v';

export interface RespuestaSubidaVideo {
  message: string;
  id: string;
  video_url: string;
}

export interface RespuestaBorradoVideo {
  message: string;
  id: string;
}

export function formatearMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

/**
 * Valida el archivo con los mismos criterios que el backend.
 * @returns mensaje de error listo para mostrar, o null si el archivo es válido.
 */
export function validarVideo(file: File): string | null {
  if (!file.size) {
    return 'El archivo está vacío.';
  }

  // El navegador puede mandar 'video/webm;codecs=vp9' — igual que el fileFilter,
  // se corta en ';'.
  const mime = (file.type || '').split(';')[0].trim().toLowerCase();
  if (!mime.startsWith('video/')) {
    return 'El archivo debe ser un vídeo (mp4, webm, mov o m4v).';
  }

  const punto = file.name.lastIndexOf('.');
  const ext = punto >= 0 ? file.name.slice(punto).toLowerCase() : '';
  const extPermitida =
    (VIDEO_EXTENSIONES as readonly string[]).includes(ext) || Boolean(EXT_POR_MIME[mime]);
  if (!extPermitida) {
    return 'Formato no permitido. Usa mp4, webm, mov o m4v.';
  }

  if (file.size > VIDEO_MAX_BYTES) {
    return `El vídeo supera el máximo de ${formatearMB(VIDEO_MAX_BYTES)} (pesa ${formatearMB(file.size)}).`;
  }

  return null;
}

/**
 * Sube o reemplaza el vídeo del producto.
 *
 * El header 'Content-Type': 'multipart/form-data' se declara igual que en el
 * resto del proyecto; axios lo sustituye por el que lleva el boundary al
 * detectar un FormData en el navegador.
 */
export async function subirVideoProducto(
  productoId: string,
  file: File,
  onProgress?: (porcentaje: number) => void,
  signal?: AbortSignal
): Promise<RespuestaSubidaVideo> {
  const fd = new FormData();
  fd.append('video', file);

  const { data } = await api.post<RespuestaSubidaVideo>(
    `/productos/${encodeURIComponent(productoId)}/video`,
    fd,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
      onUploadProgress: (evento) => {
        if (!onProgress) return;
        const total = evento.total ?? file.size;
        if (!total) return;
        onProgress(Math.min(100, Math.round((evento.loaded * 100) / total)));
      },
    }
  );

  return data;
}

/** Quita el vídeo del producto. Responde 200 aunque ya no hubiera vídeo. */
export async function eliminarVideoProducto(productoId: string): Promise<RespuestaBorradoVideo> {
  const { data } = await api.delete<RespuestaBorradoVideo>(
    `/productos/${encodeURIComponent(productoId)}/video`
  );
  return data;
}

export function urlPublicaVideo(videoUrl: string): string {
  if (/^(https?:)?\/\//i.test(videoUrl) || videoUrl.startsWith('blob:') || videoUrl.startsWith('data:')) {
    return videoUrl;
  }
  return `${API_ORIGIN}${videoUrl.startsWith('/') ? '' : '/'}${videoUrl}`;
}

/** Traduce errores de axios/backend a un mensaje mostrable al usuario. */
export function mensajeErrorVideo(err: unknown): string {
  if (axios.isCancel(err)) {
    return 'Subida cancelada.';
  }
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error;
    }
    if (err.response?.status === 413) {
      return `El vídeo supera el máximo de ${formatearMB(VIDEO_MAX_BYTES)}.`;
    }
    if (err.response?.status === 404) {
      return 'Producto no encontrado.';
    }
    if (!err.response) {
      return 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
    }
  }
  return 'No se pudo completar la operación. Intenta de nuevo.';
}