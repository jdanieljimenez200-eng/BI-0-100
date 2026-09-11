import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { extraerFrames } from '../../services/media/frameExtractionService';

const execFileAsync = promisify(execFile);

/**
 * Genera un vídeo sintético mínimo (barras de color + tono, sin cámara real)
 * con el propio binario ffmpeg para no versionar un .mp4 binario en el repo.
 * Si el binario ffmpeg no está instalado en el entorno que corre los tests,
 * este describe entero se salta en vez de fallar en rojo.
 */
async function ffmpegDisponible(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function generarVideoDePrueba(duracionSegundos: number): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-extraction-fixture-'));
  const salida = path.join(dir, 'fixture.mp4');
  try {
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', `testsrc=duration=${duracionSegundos}:size=64x64:rate=10`,
      '-f', 'lavfi', '-i', `sine=frequency=1000:duration=${duracionSegundos}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-y', salida,
    ]);
    return await fs.readFile(salida);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe('frameExtractionService — extraerFrames', () => {
  let disponible = false;
  let videoBuffer: Buffer;

  beforeAll(async () => {
    disponible = await ffmpegDisponible();
    if (disponible) {
      videoBuffer = await generarVideoDePrueba(3);
    }
  }, 30000);

  it('extrae el número de frames pedido, cada uno un JPEG válido, y limpia los temporales', async () => {
    if (!disponible) {
      console.warn('[test] ffmpeg no disponible en este entorno — se salta frameExtractionService.test.ts');
      return;
    }

    const antesDeExtraer = await fs.readdir(os.tmpdir());

    const frames = await extraerFrames(videoBuffer, 3, 90);

    expect(frames.length).toBe(3);
    for (const frame of frames) {
      expect(frame.media_type).toBe('image/jpeg');
      const bytes = Buffer.from(frame.base64, 'base64');
      // Firma JPEG: FF D8 FF
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      expect(bytes[2]).toBe(0xff);
    }

    const despuesDeExtraer = await fs.readdir(os.tmpdir());
    const dirsFrameNuevos = despuesDeExtraer.filter(
      (n) => n.startsWith('frames-') && !antesDeExtraer.includes(n)
    );
    expect(dirsFrameNuevos.length).toBe(0);
  }, 30000);

  it('propaga el error cuando el buffer no es un vídeo válido', async () => {
    if (!disponible) return;

    await expect(extraerFrames(Buffer.from('esto no es un video'), 3, 90)).rejects.toThrow();
  }, 15000);
});
