/**
 * "Resumen completo" del negocio — bajo demanda, sin persistencia propia.
 *
 * Decisión de producto: llevar un historial por-análisis (score, snapshots,
 * diffs) crecía indefinidamente y era caro de mantener sin aportar
 * suficiente valor. En su lugar, cada vez que el usuario lo pide, se lee el
 * ÚLTIMO análisis completado de cada uno de los 6 módulos directamente de
 * sus tablas (sin tabla intermedia), se calcula una recomendación
 * determinista de cuándo conviene repetir cada uno (según cuánto tiempo pasó
 * vs. una cadencia razonable por módulo), y se le pide a Claude que escriba
 * un resumen narrativo — cacheado 15 min en Redis para que dos clics
 * seguidos no dupliquen el costo. Nunca se guarda en Postgres.
 */

import crypto from 'crypto';
import { AppDataSource } from '../../config/database';
import { AnalisisMercado } from '../../models/AnalisisMercado';
import { AnalisisMarketing } from '../../models/AnalisisMarketing';
import { AnalisisFinanzas } from '../../models/AnalisisFinanzas';
import { AnalisisLegal } from '../../models/AnalisisLegal';
import { AnalisisBrief } from '../../models/AnalisisBrief';
import { AnalisisVentas } from '../../models/AnalisisVentas';
import { sanitizeForLLM } from '../../utils/sanitizeForLLM';
import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';
import { crearMensaje, textoDe } from '../../config/anthropic';

export type ModuloResumen = 'mercado' | 'marketing' | 'finanzas' | 'legal' | 'brief' | 'ventas';

const TTL_CACHE_SEGUNDOS = 900; // 15 min
const CACHE_VERSION = 'v1';

// Cadencia sugerida por módulo: cada cuánto tiene sentido volver a analizar,
// según qué tan rápido cambia esa dimensión del negocio.
const CADENCIA_DIAS: Record<ModuloResumen, number> = {
  mercado: 60, // competencia y demanda se mueven en semanas/meses
  marketing: 45, // estrategias y canales rotan más seguido
  finanzas: 90, // solo si cambian precios/costos de forma relevante
  legal: 180, // la normativa cambia lento
  brief: 365, // identidad de marca no debería cambiar seguido
  ventas: 30, // el pulso comercial es el más rápido de los 6
};

const LABEL_MODULO: Record<ModuloResumen, string> = {
  mercado: 'Mercado',
  marketing: 'Marketing',
  finanzas: 'Finanzas',
  legal: 'Legal',
  brief: 'Brief de marca',
  ventas: 'Ventas',
};

export interface ModuloResumenInfo {
  modulo: ModuloResumen;
  label: string;
  tiene_analisis: boolean;
  fecha_ultimo: string | null;
  dias_transcurridos: number | null;
  cadencia_dias: number;
  recomendacion: string;
  /** 1-2 campos clave del resultado (ej. "viabilidad_score=72"), para enriquecer el resumen de IA. */
  campos_clave: string | null;
}

export interface ResumenCompleto {
  resumen_ia: string;
  modulos: ModuloResumenInfo[];
  es_mock: boolean;
  desde_cache: boolean;
  generado_en: string;
}

interface FilaAnalisisBase {
  fecha_creacion: Date;
  [campo: string]: unknown;
}

function repoDelModulo(modulo: ModuloResumen) {
  switch (modulo) {
    case 'mercado':
      return AppDataSource.getRepository(AnalisisMercado);
    case 'marketing':
      return AppDataSource.getRepository(AnalisisMarketing);
    case 'finanzas':
      return AppDataSource.getRepository(AnalisisFinanzas);
    case 'legal':
      return AppDataSource.getRepository(AnalisisLegal);
    case 'brief':
      return AppDataSource.getRepository(AnalisisBrief);
    case 'ventas':
      return AppDataSource.getRepository(AnalisisVentas);
  }
}

async function obtenerUltimoCompletado(modulo: ModuloResumen, productoId: string): Promise<FilaAnalisisBase | null> {
  const repo = repoDelModulo(modulo);
  return repo.findOne({
    where: { producto_id: productoId, estado_analisis: 'completado' },
    order: { fecha_creacion: 'DESC' },
  }) as Promise<FilaAnalisisBase | null>;
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / (24 * 60 * 60 * 1000)));
}

function construirRecomendacion(tieneAnalisis: boolean, diasTranscurridos: number | null, cadenciaDias: number): string {
  if (!tieneAnalisis) return 'Aún no lo analizas — hazlo cuando quieras validar esta parte del negocio.';
  if (diasTranscurridos === null) return 'Sin fecha registrada.';
  if (diasTranscurridos >= cadenciaDias) {
    return `Han pasado ${diasTranscurridos} días desde tu último análisis (recomendado cada ${cadenciaDias}). Conviene repetirlo.`;
  }
  const faltan = cadenciaDias - diasTranscurridos;
  return `Analizado hace ${diasTranscurridos} días. Aún dentro de la ventana recomendada (repite en unos ${faltan} días, o antes si algo cambió).`;
}

/** Extrae 2-3 campos clave por módulo, livianos, para no inflar el prompt. */
function resumenCampos(modulo: ModuloResumen, fila: FilaAnalisisBase): string {
  switch (modulo) {
    case 'mercado':
      return `viabilidad_score=${fila.viabilidad_score ?? 'n/d'}`;
    case 'legal':
      return `puntaje_cumplimiento=${fila.puntaje_cumplimiento ?? 'n/d'}`;
    case 'marketing': {
      const estrategias = fila.estrategias_data as { puntaje_fit: number; recomendada: boolean }[] | null;
      const recomendada = Array.isArray(estrategias) ? estrategias.find((e) => e.recomendada) : null;
      return recomendada ? `estrategia_recomendada_fit=${recomendada.puntaje_fit}` : 'sin estrategia calculada';
    }
    case 'finanzas': {
      const resumen = fila.resumen_data as { viabilidad?: string; roi_anual?: number } | null;
      return resumen ? `viabilidad=${resumen.viabilidad ?? 'n/d'}, roi_anual=${resumen.roi_anual ?? 'n/d'}%` : 'sin resumen calculado';
    }
    case 'ventas':
      return 'diagnóstico de ventas generado (tips, guion, ICP)';
    case 'brief':
      return 'kit de identidad de marca generado';
  }
}

function claveCache(usuarioId: string, productoId: string, modulos: ModuloResumenInfo[]): string {
  const huella = JSON.stringify(modulos.map((m) => `${m.modulo}|${m.fecha_ultimo ?? '-'}`));
  const hash = crypto.createHash('sha256').update(huella).digest('hex').slice(0, 32);
  return `progreso:resumen-completo:${CACHE_VERSION}:${usuarioId}:${productoId}:${hash}`;
}

function redisDisponible(): boolean {
  return Boolean(redisClient && redisClient.isOpen);
}

async function leerCache(clave: string): Promise<ResumenCompleto | null> {
  if (!redisDisponible()) return null;
  try {
    const raw = await redisClient.get(clave);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumenCompleto;
    return { ...parsed, desde_cache: true };
  } catch (err) {
    logger.warn('resumenCompletoService: lectura de caché falló, se regenera', err);
    return null;
  }
}

async function escribirCache(clave: string, valor: ResumenCompleto): Promise<void> {
  if (!redisDisponible()) return;
  try {
    await redisClient.set(clave, JSON.stringify({ ...valor, desde_cache: false }), { EX: TTL_CACHE_SEGUNDOS });
  } catch (err) {
    logger.warn('resumenCompletoService: escritura de caché falló', err);
  }
}

function construirResumenLocal(modulos: ModuloResumenInfo[]): string {
  const analizados = modulos.filter((m) => m.tiene_analisis);
  const sinAnalizar = modulos.filter((m) => !m.tiene_analisis);
  const partes: string[] = [];
  if (analizados.length === 0) {
    return 'Aún no has completado ningún análisis. Corre al menos Mercado y Finanzas para tener un primer diagnóstico de tu negocio.';
  }
  partes.push(`Has analizado ${analizados.length} de 6 áreas de tu negocio.`);
  const atrasados = analizados.filter((m) => (m.dias_transcurridos ?? 0) >= m.cadencia_dias);
  if (atrasados.length > 0) {
    partes.push(`Te conviene refrescar: ${atrasados.map((m) => m.label).join(', ')}.`);
  }
  if (sinAnalizar.length > 0) {
    partes.push(`Todavía no corres: ${sinAnalizar.map((m) => m.label).join(', ')}.`);
  }
  return partes.join(' ');
}

async function construirResumenIa(modulos: ModuloResumenInfo[]): Promise<{ texto: string; esMock: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) return { texto: construirResumenLocal(modulos), esMock: true };

  try {
    const listado = modulos
      .map((m) => {
        const estado = m.tiene_analisis
          ? `analizado hace ${m.dias_transcurridos} días (${sanitizeForLLM(m.campos_clave ?? '', { maxLen: 100 })})`
          : 'sin analizar';
        return `- ${m.label}: ${estado}. ${sanitizeForLLM(m.recomendacion, { maxLen: 200 })}`;
      })
      .join('\n');

    const msg = await crearMensaje('alertas.resumen_completo', 'mecanica', {
      max_tokens: 500,
      temperature: 0.3,
      system:
        'Eres un asesor de negocios que resume, en español y en un párrafo corto (3-5 frases), el estado general ' +
        'de un negocio a partir de los análisis que ya corrió en 6 áreas (Mercado, Marketing, Finanzas, Legal, ' +
        'Brief de marca, Ventas). Menciona qué está fuerte, qué falta analizar, y cuál conviene refrescar primero. ' +
        'No inventes datos que no estén en la entrada. Responde solo el texto del resumen, sin JSON ni encabezados.',
      messages: [{ role: 'user', content: `Estado de los 6 módulos:\n${listado}` }],
    });
    const text = textoDe(msg).trim();
    return text ? { texto: text, esMock: false } : { texto: construirResumenLocal(modulos), esMock: true };
  } catch (err) {
    logger.warn('resumenCompletoService: Claude falló, usando fallback local:', err);
    return { texto: construirResumenLocal(modulos), esMock: true };
  }
}

/** Nunca lanza: ante cualquier fallo, cae al resumen local determinista. */
export async function generarResumenCompleto(usuarioId: string, productoId: string): Promise<ResumenCompleto> {
  const ahora = new Date();
  const modulos: ModuloResumenInfo[] = await Promise.all(
    (Object.keys(CADENCIA_DIAS) as ModuloResumen[]).map(async (modulo) => {
      const fila = await obtenerUltimoCompletado(modulo, productoId);
      const tieneAnalisis = !!fila;
      const diasTranscurridos = fila ? diasEntre(fila.fecha_creacion, ahora) : null;
      const cadenciaDias = CADENCIA_DIAS[modulo];
      return {
        modulo,
        label: LABEL_MODULO[modulo],
        tiene_analisis: tieneAnalisis,
        fecha_ultimo: fila ? fila.fecha_creacion.toISOString() : null,
        dias_transcurridos: diasTranscurridos,
        cadencia_dias: cadenciaDias,
        recomendacion: construirRecomendacion(tieneAnalisis, diasTranscurridos, cadenciaDias),
        campos_clave: fila ? resumenCampos(modulo, fila) : null,
      };
    })
  );

  const clave = claveCache(usuarioId, productoId, modulos);
  const enCache = await leerCache(clave);
  if (enCache) return enCache;

  const { texto, esMock } = await construirResumenIa(modulos);
  const resultado: ResumenCompleto = {
    resumen_ia: texto,
    modulos,
    es_mock: esMock,
    desde_cache: false,
    generado_en: ahora.toISOString(),
  };

  await escribirCache(clave, resultado);
  return resultado;
}
