import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../utils/logger';

/**
 * Extracción de frames de vídeo para análisis visual con Claude.
 *
 * ffmpeg necesita un archivo real (no acepta un buffer en memoria para
 * `.screenshots()`), así que el vídeo se escribe a un temporal en
 * `os.tmpdir()`. Si algo falla a medias (ffprobe, extracción, lectura), el
 * `finally` limpia igual el directorio completo — nunca deja basura.
 */

export interface FrameExtraida {
  base64: string;
  media_type: 'image/jpeg';
}

function obtenerDuracion(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const duracion = data?.format?.duration;
      if (!duracion || !Number.isFinite(duracion)) {
        reject(new Error('No se pudo determinar la duración del vídeo'));
        return;
      }
      resolve(duracion);
    });
  });
}

/**
 * Extrae `n` frames distribuidos en los primeros `maxSegundos` de duración
 * del vídeo. Los pitches son cortos, así que acotar a `maxSegundos` evita
 * gastar tiempo/tokens en el resto de un vídeo largo mal subido por error.
 * Propaga cualquier error de ffmpeg (binario ausente, vídeo corrupto) —
 * quien la llame decide el fallback, esta función no se lo traga.
 */
export async function extraerFrames(
  buffer: Buffer,
  n = 5,
  maxSegundos = 90
): Promise<FrameExtraida[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `frames-${crypto.randomUUID()}-`));
  const videoPath = path.join(dir, 'input.mp4');

  try {
    await fs.writeFile(videoPath, buffer);

    const duracion = await obtenerDuracion(videoPath);
    const limite = Math.min(duracion, maxSegundos);
    const timestamps = Array.from({ length: n }, (_, i) => {
      const t = (limite * (i + 1)) / (n + 1);
      return Math.max(0.1, t).toFixed(2);
    });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .screenshots({
          timestamps,
          folder: dir,
          filename: 'frame-%i.jpg',
        });
    });

    const frames: FrameExtraida[] = [];
    for (let i = 1; i <= n; i++) {
      const data = await fs.readFile(path.join(dir, `frame-${i}.jpg`));
      frames.push({ base64: data.toString('base64'), media_type: 'image/jpeg' });
    }
    return frames;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch((err) => {
      logger.warn('[frameExtraction] No se pudo limpiar el directorio temporal:', err);
    });
  }
}
