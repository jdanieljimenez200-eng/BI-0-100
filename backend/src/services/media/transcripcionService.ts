import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import path from 'path';
import { logger } from '../../utils/logger';

/**
 * Transcripción de audio a texto (voz → prompt).
 *
 * Degradación elegante al estilo de `isEmailAvailable()`: sin OPENAI_API_KEY el
 * servicio se declara NO disponible y el caller decide si responde 503 o cae a
 * un flujo manual. Nunca se instancia el cliente en import-time para que los
 * tests puros no necesiten credenciales.
 */

/** Formatos que acepta el endpoint de transcripción. */
const EXTENSIONES_SOPORTADAS: ReadonlySet<string> = new Set([
  '.flac',
  '.m4a',
  '.mp3',
  '.mp4',
  '.mpeg',
  '.mpga',
  '.oga',
  '.ogg',
  '.wav',
  '.webm',
]);

/** Límite duro del endpoint (25 MB). El uploader ya corta antes. */
export const MAX_BYTES_TRANSCRIPCION = 25 * 1024 * 1024;

const MODELO = process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1';

let cliente: OpenAI | null = null;

export function isTranscripcionAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getCliente(): OpenAI {
  if (!isTranscripcionAvailable()) {
    throw new Error('[TRANSCRIPCION] OPENAI_API_KEY no configurada');
  }
  if (!cliente) {
    cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cliente;
}

export interface Transcripcion {
  texto: string;
  /** Idioma forzado (ISO-639-1) o null si se dejó a autodetección. */
  idioma: string | null;
  modelo: string;
}

export interface OpcionesTranscripcion {
  /** ISO-639-1 ('es'). Fijarlo mejora precisión y latencia. */
  idioma?: string;
  /** MIME original, se reenvía para que el servicio no adivine el contenedor. */
  mimetype?: string;
}

/**
 * Transcribe un buffer de audio. Lanza con mensaje presentable al usuario en
 * los casos previsibles (vacío, demasiado grande, formato no soportado); el
 * resto se registra y se propaga para que la ruta responda 502/503.
 */
export async function transcribirAudio(
  buffer: Buffer,
  originalname: string,
  opciones: OpcionesTranscripcion = {}
): Promise<Transcripcion> {
  if (buffer.length === 0) {
    throw new Error('El audio recibido está vacío');
  }
  if (buffer.length > MAX_BYTES_TRANSCRIPCION) {
    const mb = Math.round(MAX_BYTES_TRANSCRIPCION / (1024 * 1024));
    throw new Error(`El audio supera el máximo de ${mb} MB`);
  }

  const ext = path.extname(originalname).toLowerCase();
  if (!EXTENSIONES_SOPORTADAS.has(ext)) {
    throw new Error(`Formato de audio no soportado (${ext || 'sin extensión'})`);
  }

  const idioma = opciones.idioma ?? null;

  try {
    // El nombre importa: el servicio deduce el contenedor de la extensión.
    const archivo = await toFile(buffer, `audio${ext}`, {
      type: opciones.mimetype || undefined,
    });

    const respuesta = await getCliente().audio.transcriptions.create({
      file: archivo,
      model: MODELO,
      response_format: 'json',
      language: idioma ?? undefined,
    });

    const texto =
      typeof (respuesta as { text?: unknown }).text === 'string'
        ? (respuesta as { text: string }).text.trim()
        : '';

    if (!texto) {
      throw new Error('La transcripción llegó vacía (audio sin voz reconocible)');
    }

    return { texto, idioma, modelo: MODELO };
  } catch (err) {
    logger.error('[TRANSCRIPCION] Falló la transcripción de audio:', err);
    throw err instanceof Error ? err : new Error('Error desconocido al transcribir el audio');
  }
}