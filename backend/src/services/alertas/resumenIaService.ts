/**
 * Resumen ejecutivo (IA) de las alertas OPERATIVAS.
 *
 * Se apoya en lo que ya calculó `agregadorOperativo.generarAlertasOperativas()`
 * (stock crítico, ingresos periodo vs. periodo anterior y avance de metas) y le
 * pide a Claude un titular + diagnóstico + prioridades accionables. No vuelve a
 * consultar la base de datos: recibe el agregado ya resuelto.
 *
 * Decisiones de diseño:
 * - NUNCA se llama al LLM sin necesidad. Si no hay alertas evaluadas, o falta
 *   ANTHROPIC_API_KEY, o el LLM falla, se devuelve un resumen local determinista
 *   (`es_mock: true`) con la misma forma. El endpoint nunca rompe por esto.
 * - Caché en Redis con clave por usuario + huella del contenido evaluado, para
 *   que refrescar el panel no genere un cobro por request. Si el contenido de las
 *   alertas cambia, la huella cambia y se regenera solo.
 * - Todo texto que venga de datos del usuario (nombres de artículos y metas
 *   incrustados en los mensajes de alerta) pasa por sanitizeForLLM antes de
 *   entrar al prompt.
 * - Las cifras de ingresos se tratan como números sin unidad: el agregador no
 *   asume moneda ni centavos, así que aquí tampoco.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { parseLLMJson } from '../../middleware/validate';
import { sanitizeForLLM } from '../../utils/sanitizeForLLM';
import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';
import type { Alerta, NivelAlerta } from './types';
import type { AlertasOperativas } from './agregadorOperativo';
import { crearMensaje, hayClaveAnthropic, textoDe } from '../../config/anthropic';

// ─── Salida ─────────────────────────────────────────────────────────────────

export interface PrioridadResumen {
  nivel: NivelAlerta;
  /** Qué hay que atender, en 3-6 palabras. */
  foco: string;
  /** Acción concreta y ejecutable. */
  accion: string;
}

export interface ResumenIaAlertas {
  titular: string;
  diagnostico: string;
  prioridades: PrioridadResumen[];
  siguiente_paso: string;
  /** true = generado localmente sin LLM (sin API key, sin alertas o tras un fallo). */
  es_mock: boolean;
  /** true = servido desde caché Redis, no regenerado en esta request. */
  desde_cache: boolean;
  generado_en: string; // ISO 8601
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const TTL_CACHE_SEGUNDOS = 900; // 15 min: el panel se refresca mucho más seguido
const MAX_ALERTAS_PROMPT = 25;  // tope de contexto enviado al LLM
const MAX_PRIORIDADES = 5;
const CACHE_VERSION = 'v1';

const PESO_NIVEL: Record<NivelAlerta, number> = { rojo: 0, amarillo: 1, verde: 2 };

const SYSTEM_PROMPT_RESUMEN = `Eres un analista de operaciones de PyMEs. Recibes alertas ya calculadas por el sistema (stock, ingresos y metas) y devuelves un resumen ejecutivo accionable en español de México.

REGLAS:
- Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después.
- Cada frase debe referenciar un dato concreto de las alertas recibidas (nombre, cantidad o porcentaje). Prohibido dar consejos genéricos.
- No inventes datos, productos, cifras ni causas que no estén en la entrada.
- Prioriza siempre lo rojo sobre lo amarillo, y dentro de lo rojo, lo que frena ventas.
- Tono directo, sin relleno motivacional. Máximo 2 frases por campo de texto.`;

// ─── Schema del output del LLM ──────────────────────────────────────────────

const ResumenIaOutputSchema = z
  .object({
    titular: z.string().min(1),
    diagnostico: z.string().min(1),
    prioridades: z
      .array(
        z.object({
          nivel: z.enum(['rojo', 'amarillo', 'verde']),
          foco: z.string().min(1),
          accion: z.string().min(1),
        }),
      )
      .default([]),
    siguiente_paso: z.string().min(1),
  })
  .passthrough();

// ─── Helpers puros ──────────────────────────────────────────────────────────

function numero(valor: unknown): number {
  const n = typeof valor === 'string' ? parseFloat(valor) : typeof valor === 'number' ? valor : NaN;
  return Number.isFinite(n) ? n : 0;
}

function fmt(valor: number): string {
  return Math.round(valor).toLocaleString('es-MX');
}

/** Nivel más grave presente en el resumen de conteos. */
export function severidadDominante(resumen: { rojo: number; amarillo: number }): NivelAlerta {
  if (resumen.rojo > 0) return 'rojo';
  if (resumen.amarillo > 0) return 'amarillo';
  return 'verde';
}

/**
 * Variación porcentual de ingresos respecto al periodo anterior.
 * Devuelve null cuando el periodo anterior fue 0 (no hay base de comparación).
 */
export function variacionIngresos(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

/**
 * Huella de caché: mismo usuario + mismas alertas + mismo periodo ⇒ misma clave.
 * Se incluyen los ingresos redondeados porque son parte del diagnóstico aunque
 * no siempre generen alerta.
 */
export function claveCache(
  usuarioId: string,
  negocioId: string | null,
  dias: number,
  alertas: Alerta[],
  ingresoActual: number,
  ingresoAnterior: number,
): string {
  const huella = JSON.stringify({
    n: negocioId ?? '-',
    d: dias,
    a: alertas.map((x) => `${x.nivel}|${x.tipo}|${x.mensaje}`),
    ia: Math.round(ingresoActual),
    ip: Math.round(ingresoAnterior),
  });
  const hash = crypto.createHash('sha256').update(huella).digest('hex').slice(0, 32);
  return `alertas:resumen-ia:${CACHE_VERSION}:${usuarioId}:${hash}`;
}

/**
 * Resumen determinista sin LLM. Es el fallback y también la respuesta cuando no
 * hay nada que analizar. Mantiene exactamente el mismo contrato que la vía IA
 * para que el frontend no tenga que ramificar.
 */
export function construirResumenLocal(datos: AlertasOperativas): ResumenIaAlertas {
  const { resumen, periodo } = datos;
  const nivel = severidadDominante(resumen);
  const variacion = variacionIngresos(
    numero(periodo.ingreso_actual),
    numero(periodo.ingreso_anterior),
  );

  const ordenadas = [...datos.alertas].sort((a, b) => PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel]);

  const prioridades: PrioridadResumen[] = ordenadas
    .filter((a) => a.nivel !== 'verde')
    .slice(0, 3)
    .map((a) => ({
      nivel: a.nivel,
      foco: a.tipo === 'stock' ? 'Inventario' : a.tipo === 'ingresos' ? 'Ingresos' : 'Metas',
      accion: a.mensaje,
    }));

  const tramoIngresos =
    variacion === null
      ? `Ingresos del periodo: ${fmt(numero(periodo.ingreso_actual))} (sin periodo anterior comparable).`
      : `Ingresos ${variacion >= 0 ? 'arriba' : 'abajo'} ${Math.abs(variacion)}% vs. el periodo anterior (${fmt(numero(periodo.ingreso_actual))} vs. ${fmt(numero(periodo.ingreso_anterior))}).`;

  const alcance = `Se revisaron ${datos.articulos_evaluados} artículo(s) con control de stock y ${datos.metas_evaluadas} meta(s) vigente(s) en los últimos ${periodo.dias} días.`;

  if (resumen.total === 0) {
    return {
      titular: 'Sin señales de riesgo en el periodo',
      diagnostico: `${alcance} No se detectaron alertas. ${tramoIngresos}`,
      prioridades: [],
      siguiente_paso:
        datos.articulos_evaluados === 0 && datos.metas_evaluadas === 0
          ? 'Configura stock mínimo en tus artículos y al menos una meta para que el panel pueda vigilar la operación.'
          : 'Mantén el seguimiento: no hay acciones urgentes con los datos de este periodo.',
      es_mock: true,
      desde_cache: false,
      generado_en: new Date().toISOString(),
    };
  }

  const titular =
    nivel === 'rojo'
      ? `${resumen.rojo} alerta(s) crítica(s) requieren acción hoy`
      : nivel === 'amarillo'
        ? `${resumen.amarillo} punto(s) de atención antes de que escalen`
        : 'Operación estable con avisos informativos';

  return {
    titular,
    diagnostico: `${alcance} ${resumen.rojo} en rojo, ${resumen.amarillo} en amarillo y ${resumen.verde} en verde. ${tramoIngresos}`,
    prioridades,
    siguiente_paso:
      prioridades.length > 0
        ? `Empieza por: ${prioridades[0].accion}`
        : 'No hay pendientes accionables: las alertas presentes son informativas.',
    es_mock: true,
    desde_cache: false,
    generado_en: new Date().toISOString(),
  };
}

// ─── Caché Redis (tolerante a fallos) ───────────────────────────────────────

function redisDisponible(): boolean {
  return Boolean(redisClient && redisClient.isOpen);
}

async function leerCache(clave: string): Promise<ResumenIaAlertas | null> {
  if (!redisDisponible()) return null;
  try {
    const raw = await redisClient.get(clave);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return { ...(parsed as ResumenIaAlertas), desde_cache: true };
  } catch (err) {
    logger.warn('resumenIaAlertas: lectura de caché falló, se regenera', err);
    return null;
  }
}

async function escribirCache(clave: string, valor: ResumenIaAlertas): Promise<void> {
  if (!redisDisponible()) return;
  try {
    await redisClient.set(clave, JSON.stringify({ ...valor, desde_cache: false }), {
      EX: TTL_CACHE_SEGUNDOS,
    });
  } catch (err) {
    logger.warn('resumenIaAlertas: escritura de caché falló', err);
  }
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

function construirPrompt(datos: AlertasOperativas): string {
  const { resumen, periodo } = datos;
  const variacion = variacionIngresos(
    numero(periodo.ingreso_actual),
    numero(periodo.ingreso_anterior),
  );

  const ordenadas = [...datos.alertas].sort((a, b) => PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel]);
  const listado = ordenadas
    .slice(0, MAX_ALERTAS_PROMPT)
    .map(
      (a) =>
        `  - [${a.nivel}] (${sanitizeForLLM(a.tipo, { maxLen: 20 })}) ${sanitizeForLLM(a.mensaje, { maxLen: 200 })}`,
    )
    .join('\n');

  const omitidas = Math.max(0, ordenadas.length - MAX_ALERTAS_PROMPT);

  return `Analiza estas alertas operativas y genera el resumen ejecutivo.

<periodo>
  <dias>${periodo.dias}</dias>
  <actual>${periodo.actual.desde} a ${periodo.actual.hasta}</actual>
  <anterior>${periodo.anterior.desde} a ${periodo.anterior.hasta}</anterior>
  <ingreso_actual>${fmt(numero(periodo.ingreso_actual))}</ingreso_actual>
  <ingreso_anterior>${fmt(numero(periodo.ingreso_anterior))}</ingreso_anterior>
  <variacion_ingresos>${variacion === null ? 'sin base de comparación' : `${variacion}%`}</variacion_ingresos>
  <ventas_actual>${periodo.ventas_actual}</ventas_actual>
  <ventas_anterior>${periodo.ventas_anterior}</ventas_anterior>
</periodo>

<alcance>
  <articulos_evaluados>${datos.articulos_evaluados}</articulos_evaluados>
  <metas_evaluadas>${datos.metas_evaluadas}</metas_evaluadas>
</alcance>

<conteo_alertas>
  <rojo>${resumen.rojo}</rojo>
  <amarillo>${resumen.amarillo}</amarillo>
  <verde>${resumen.verde}</verde>
  <total>${resumen.total}</total>
</conteo_alertas>

<alertas>
${listado || '  (ninguna)'}
</alertas>
${omitidas > 0 ? `\n<nota>Se omitieron ${omitidas} alertas menos graves del listado.</nota>\n` : ''}
Devuelve exactamente esta estructura JSON:
{
  "titular": "Una línea con el estado del negocio y el dato que lo justifica",
  "diagnostico": "1-2 frases explicando qué está pasando, citando cifras reales de la entrada",
  "prioridades": [
    { "nivel": "rojo", "foco": "Qué atender", "accion": "Acción concreta con el nombre/cifra del dato" }
  ],
  "siguiente_paso": "La única acción a ejecutar primero, con su dato de respaldo"
}

Incluye como máximo ${MAX_PRIORIDADES} prioridades, ordenadas de la más grave a la menos grave, y solo sobre alertas que existan en la entrada.`;
}

// ─── Entrada pública ────────────────────────────────────────────────────────

export interface OpcionesResumenIa {
  usuarioId: string;
  /** Agregado ya calculado por generarAlertasOperativas(). */
  datos: AlertasOperativas;
  negocioId?: string | null;
  /** Ignora la caché y fuerza una nueva generación. */
  refrescar?: boolean;
}

/**
 * Devuelve el resumen ejecutivo de las alertas operativas.
 * Nunca lanza: ante cualquier fallo cae al resumen local determinista.
 */
export async function generarResumenIaAlertas(
  opciones: OpcionesResumenIa,
): Promise<ResumenIaAlertas> {
  const { usuarioId, datos } = opciones;
  const negocioId = opciones.negocioId ?? null;

  // Sin nada evaluado no hay nada que interpretar: se ahorra el llamado.
  if (datos.resumen.total === 0) return construirResumenLocal(datos);

  const clave = claveCache(
    usuarioId,
    negocioId,
    datos.periodo.dias,
    datos.alertas,
    numero(datos.periodo.ingreso_actual),
    numero(datos.periodo.ingreso_anterior),
  );

  if (!opciones.refrescar) {
    const enCache = await leerCache(clave);
    if (enCache) return enCache;
  }

  if (!process.env.ANTHROPIC_API_KEY) return construirResumenLocal(datos);

  try {

    const msg = await crearMensaje('alertas.resumen', 'mecanica', {
      max_tokens: 900,
      temperature: 0.2,
      system: SYSTEM_PROMPT_RESUMEN,
      messages: [{ role: 'user', content: construirPrompt(datos) }],
    });

    const text = textoDe(msg);
    const parsed = parseLLMJson(text, ResumenIaOutputSchema);

    const resultado: ResumenIaAlertas = {
      titular: parsed.titular.trim(),
      diagnostico: parsed.diagnostico.trim(),
      // `.default([])` no se refleja en el tipo inferido al combinarlo con
      // `.passthrough()`, así que el fallback explícito es necesario.
      prioridades: (parsed.prioridades ?? []).slice(0, MAX_PRIORIDADES).map((p) => ({
        nivel: p.nivel,
        foco: p.foco.trim(),
        accion: p.accion.trim(),
      })),
      siguiente_paso: parsed.siguiente_paso.trim(),
      es_mock: false,
      desde_cache: false,
      generado_en: new Date().toISOString(),
    };

    await escribirCache(clave, resultado);
    return resultado;
  } catch (err) {
    logger.warn('Claude resumen de alertas falló, usando fallback local:', err);
    return construirResumenLocal(datos);
  }
}