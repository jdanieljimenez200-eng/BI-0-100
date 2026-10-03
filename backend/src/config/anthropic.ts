import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages/messages';
import { AppDataSource } from './database';
import { logger } from '../utils/logger';
import { contextoIA } from '../utils/seguimientoIA';
import { recordError } from '../utils/metrics';

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
  /** Razonamiento adaptativo. `null` = modelo sin effort (Haiku 4.5). En la familia 5.5 siempre está activo. */
  effort: 'low' | 'medium' | 'high' | null;
  /** Tiempo máximo por intento. Con razonamiento activo las respuestas tardan más. */
  timeoutMs: number;
  /** Multiplica el `max_tokens` de cada servicio: el razonamiento cuenta dentro del límite. */
  holguraTokens: number;
}

/**
 * - mecanica: salidas cortas con reglas verificables (copies, listas, resúmenes).
 *   Antes en Haiku 4.5; desde 2026-10 en Sonnet 5.5 con poco razonamiento: los
 *   copies y mensajes los publica el cliente tal cual y la redacción pesa más que
 *   el ahorro.
 * - estrategia: análisis y redacción con criterio (DAFO, brief, ventas, riesgos).
 * - extensa: la misma familia que estrategia, para salidas muy largas (calendario).
 * - critica: donde un error sale caro al cliente (dictamen legal).
 *
 * En la familia 5.5 el `effort` se recalibró: «medium» no piensa lo mismo que en
 * Sonnet 5. Antes de subirlo, compara con «Probar» del panel de prompts.
 */
export const TAREAS: Record<TareaIA, ConfigTarea> = {
  mecanica: { modelo: 'claude-sonnet-5-5', effort: 'low', timeoutMs: 60_000, holguraTokens: 2 },
  estrategia: { modelo: 'claude-sonnet-5-5', effort: 'medium', timeoutMs: 120_000, holguraTokens: 2 },
  extensa: { modelo: 'claude-sonnet-5-5', effort: 'medium', timeoutMs: 180_000, holguraTokens: 1.6 },
  critica: { modelo: 'claude-opus-5-5', effort: 'medium', timeoutMs: 180_000, holguraTokens: 2 },
};

/**
 * Únicos modelos que aceptan `temperature`/`top_p`/`top_k`. Desde la familia 4.7
 * cada modelo nuevo responde 400 a un valor distinto del de fábrica, así que la
 * lista es de los que SÍ los aceptan: un modelo nuevo no puede tumbar todas las
 * llamadas por olvidar añadirlo.
 */
const ACEPTA_SAMPLING = new Set(['claude-haiku-4-5']);
/** Modelos que pueden declinar por clasificador de seguridad: se reintenta en el servidor. */
const CON_FALLBACK = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

// ─── Precios (USD por millón de tokens) ───────────────────────────────────────

export interface PrecioModelo {
  input: number;
  output: number;
  /** Lectura de caché como fracción del input. Por defecto 0.1; los modelos nuevos la abaratan. */
  cacheLectura?: number;
}

// Revisión: 2026-10 (platform.claude.com/docs/en/about-claude/pricing). Los
// modelos que ya no se usan se quedan: siguen en `uso_ia` y pueden responder
// como respaldo del servidor.
export const PRECIOS_USD_POR_MILLON: Record<string, PrecioModelo> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-5-5': { input: 4, output: 20, cacheLectura: 0.05 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-fable-5-1': { input: 10, output: 50, cacheLectura: 0.025 },
};

/** Escritura de caché (5 min) = 1.25× input; lectura = 0.1× input salvo que el modelo diga otra cosa. */
const FACTOR_CACHE_ESCRITURA = 1.25;
const FACTOR_CACHE_LECTURA = 0.1;

export interface UsoTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Precio de un modelo. La API puede devolver el id con sufijo de versión
 * (`claude-opus-5-20260101`) o un modelo de respaldo: se acepta el id base como
 * prefijo. Si no hay precio conocido, el coste se registra en 0 pero se avisa y
 * se cuenta en métricas: antes quedaba en 0 en silencio y el panel de costos
 * infravaloraba el gasto real.
 */
const modelosSinPrecioAvisados = new Set<string>();

export function precioDeModelo(modelo: string): PrecioModelo | null {
  const exacto = PRECIOS_USD_POR_MILLON[modelo];
  if (exacto) return exacto;
  const base = Object.keys(PRECIOS_USD_POR_MILLON)
    .filter((id) => modelo.startsWith(`${id}-`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? PRECIOS_USD_POR_MILLON[base] : null;
}

export function costoUsd(modelo: string, uso: UsoTokens): number {
  const precio = precioDeModelo(modelo);
  if (!precio) {
    recordError('ia_modelo_sin_precio');
    if (!modelosSinPrecioAvisados.has(modelo)) {
      modelosSinPrecioAvisados.add(modelo);
      logger.warn(`[IA] Modelo sin precio en PRECIOS_USD_POR_MILLON: ${modelo}. Su costo se registra en 0.`);
    }
    return 0;
  }
  const escritura = uso.cache_creation_input_tokens ?? 0;
  const lectura = uso.cache_read_input_tokens ?? 0;
  const total =
    uso.input_tokens * precio.input +
    escritura * precio.input * FACTOR_CACHE_ESCRITURA +
    lectura * precio.input * (precio.cacheLectura ?? FACTOR_CACHE_LECTURA) +
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

  if (!ACEPTA_SAMPLING.has(cfg.modelo)) {
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

  // Versión del modo con la que se hizo la llamada (`legal.dictamen` → `legal.modo`):
  // permite comparar el costo entre versiones de un prompt en el panel.
  const claveModo = `${seccion.split('.')[0]}.modo`;
  const promptVersionId = ctx?.versionesPrompt?.[claveModo] ?? null;

  if (!AppDataSource.isInitialized) return;
  AppDataSource.query(
    `INSERT INTO uso_ia (usuario_id, modulo, seccion, modelo, input_tokens, output_tokens,
                         cache_write_tokens, cache_read_tokens, costo_usd, duracion_ms, analisis_id,
                         prompt_version_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
      promptVersionId,
    ]
  ).catch((err: unknown) => logger.error('[IA] No se pudo registrar el uso:', err));
}
