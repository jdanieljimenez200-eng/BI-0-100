import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages/messages';
import { AppDataSource } from './database';
import { logger } from '../utils/logger';
import { contextoIA } from '../utils/seguimientoIA';

/**
 * Único punto de contacto con Claude.
 *
 * Aquí viven tres decisiones que antes estaban repartidas en doce servicios:
 *  - qué modelo hace cada tipo de tarea,
 *  - con qué límites de tiempo y razonamiento se llama,
 *  - y cuánto cuesta cada llamada (se registra en `uso_ia`).
 *
 * La API key solo se lee aquí, del entorno del servidor. Nunca se pasa al
 * frontend, nunca se escribe en logs (ver utils/logger.ts) y en producción el
 * backend no arranca sin ella (`verificarClaveAnthropic`).
 */

// ─── Modelos por tipo de tarea ────────────────────────────────────────────────

export type TareaIA = 'mecanica' | 'estrategia' | 'extensa' | 'critica';

interface ConfigTarea {
  modelo: string;
  /** Razonamiento adaptativo. `null` = modelo sin effort (Haiku 4.5). */
  effort: 'low' | 'medium' | 'high' | null;
  /** Tiempo máximo por intento. Con razonamiento activo las respuestas tardan más. */
  timeoutMs: number;
  /** Multiplica el `max_tokens` de cada servicio: el razonamiento cuenta dentro del límite. */
  holguraTokens: number;
}

/**
 * - mecanica: salidas cortas con reglas verificables (copies, listas, resúmenes).
 * - estrategia: análisis y redacción con criterio (DAFO, brief, ventas, riesgos).
 * - extensa: la misma familia que estrategia, para salidas muy largas (calendario).
 * - critica: donde un error sale caro al cliente (dictamen legal).
 */
export const TAREAS: Record<TareaIA, ConfigTarea> = {
  mecanica: { modelo: 'claude-haiku-4-5', effort: null, timeoutMs: 45_000, holguraTokens: 1 },
  estrategia: { modelo: 'claude-sonnet-5', effort: 'medium', timeoutMs: 120_000, holguraTokens: 2 },
  extensa: { modelo: 'claude-sonnet-5', effort: 'medium', timeoutMs: 180_000, holguraTokens: 1.6 },
  critica: { modelo: 'claude-opus-5', effort: 'medium', timeoutMs: 180_000, holguraTokens: 2 },
};

/** Modelos que rechazan `temperature` con un 400 (familia 4.7+ y Sonnet 5). */
const SIN_SAMPLING = new Set(['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-fable-5-1']);
/** Modelos que pueden declinar por clasificador de seguridad: se reintenta en el servidor. */
const CON_FALLBACK = new Set(['claude-opus-5', 'claude-fable-5-1']);

// ─── Precios (USD por millón de tokens) ───────────────────────────────────────

export const PRECIOS_USD_POR_MILLON: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-fable-5-1': { input: 10, output: 50 },
};

/** Escritura de caché (5 min) = 1.25× input; lectura = 0.1× input. */
const FACTOR_CACHE_ESCRITURA = 1.25;
const FACTOR_CACHE_LECTURA = 0.1;

export interface UsoTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costoUsd(modelo: string, uso: UsoTokens): number {
  const precio = PRECIOS_USD_POR_MILLON[modelo];
  if (!precio) return 0;
  const escritura = uso.cache_creation_input_tokens ?? 0;
  const lectura = uso.cache_read_input_tokens ?? 0;
  const total =
    uso.input_tokens * precio.input +
    escritura * precio.input * FACTOR_CACHE_ESCRITURA +
    lectura * precio.input * FACTOR_CACHE_LECTURA +
    uso.output_tokens * precio.output;
  return Math.round((total / 1_000_000) * 1_000_000) / 1_000_000;
}

// ─── Clave ────────────────────────────────────────────────────────────────────

export function hayClaveAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * En producción, sin clave válida el backend no arranca: fallar cerrado es mejor
 * que servir a todos los clientes plantillas cobrándoles como si fuera IA.
 */
export function verificarClaveAnthropic(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const clave = process.env.ANTHROPIC_API_KEY ?? '';
  if (!clave.startsWith('sk-ant-')) {
    throw new Error('ANTHROPIC_API_KEY ausente o con formato inválido en producción');
  }
}

const clientes = new Map<number, Anthropic>();

function cliente(timeoutMs: number): Anthropic {
  let c = clientes.get(timeoutMs);
  if (!c) {
    // Un reintento: el peor caso de una llamada es 2× timeout y luego entra la plantilla.
    c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: timeoutMs, maxRetries: 1 });
    clientes.set(timeoutMs, c);
  }
  return c;
}

/** Solo para tests: descarta los clientes cacheados. */
export function _reiniciarClientes(): void {
  clientes.clear();
}

// ─── Llamada ──────────────────────────────────────────────────────────────────

export type ParametrosMensaje = Omit<MessageCreateParamsNonStreaming, 'model' | 'stream'>;

/**
 * Crea un mensaje con el modelo de la tarea, adapta los parámetros a lo que ese
 * modelo acepta y registra el uso.
 *
 * `seccion` identifica la llamada en el registro de costos (p. ej. 'mercado.dafo').
 */
export async function crearMensaje(seccion: string, tarea: TareaIA, params: ParametrosMensaje): Promise<Message> {
  const cfg = TAREAS[tarea];
  const cuerpo: Record<string, unknown> = {
    ...params,
    model: cfg.modelo,
    max_tokens: Math.ceil(params.max_tokens * cfg.holguraTokens),
  };

  if (SIN_SAMPLING.has(cfg.modelo)) {
    delete cuerpo.temperature;
    delete cuerpo.top_p;
    delete cuerpo.top_k;
  }
  if (cfg.effort) {
    cuerpo.thinking = { type: 'adaptive' };
    cuerpo.output_config = { ...(params.output_config ?? {}), effort: cfg.effort };
  }

  const c = cliente(cfg.timeoutMs);
  const inicio = Date.now();
  const mensaje = CON_FALLBACK.has(cfg.modelo)
    ? ((await c.beta.messages.create({
        ...(cuerpo as unknown as Parameters<typeof c.beta.messages.create>[0]),
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        stream: false,
      })) as unknown as Message)
    : await c.messages.create({ ...(cuerpo as unknown as MessageCreateParamsNonStreaming), stream: false });

  registrarUso(seccion, mensaje, Date.now() - inicio);

  if (mensaje.stop_reason === 'refusal') {
    throw new Error(`Claude declinó la petición (${seccion})`);
  }
  if (mensaje.stop_reason === 'max_tokens') {
    logger.warn(`[IA] ${seccion} se cortó por max_tokens con ${mensaje.model}`);
  }
  return mensaje;
}

/** Texto de la respuesta. Con razonamiento activo el primer bloque puede ser `thinking`. */
export function textoDe(mensaje: Message): string {
  return mensaje.content
    .filter((b): b is Extract<Message['content'][number], { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

// ─── Registro de uso ──────────────────────────────────────────────────────────

function registrarUso(seccion: string, mensaje: Message, duracionMs: number): void {
  const uso = mensaje.usage;
  // El modelo que respondió (puede ser el de respaldo si hubo fallback).
  const modelo = mensaje.model;
  const costo = costoUsd(modelo, uso);
  const ctx = contextoIA();

  logger.info(
    `[IA] ${seccion} ${modelo} in=${uso.input_tokens} out=${uso.output_tokens} cache=${uso.cache_read_input_tokens ?? 0} $${costo.toFixed(4)} ${duracionMs}ms`
  );

  if (!AppDataSource.isInitialized) return;
  AppDataSource.query(
    `INSERT INTO uso_ia (usuario_id, modulo, seccion, modelo, input_tokens, output_tokens,
                         cache_write_tokens, cache_read_tokens, costo_usd, duracion_ms, analisis_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      ctx?.usuarioId ?? null,
      ctx?.modulo ?? seccion.split('.')[0],
      seccion,
      modelo,
      uso.input_tokens,
      uso.output_tokens,
      uso.cache_creation_input_tokens ?? 0,
      uso.cache_read_input_tokens ?? 0,
      costo,
      duracionMs,
      ctx?.analisisId ?? null,
    ]
  ).catch((err: unknown) => logger.error('[IA] No se pudo registrar el uso:', err));
}
