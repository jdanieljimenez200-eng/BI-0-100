import { AppDataSource } from '../../config/database';
import { PromptIA, type SeccionExtraDef } from '../../models/PromptIA';
import { logger } from '../../utils/logger';
import type { VersionesPrompt } from '../../utils/seguimientoIA';
import { textoPorDefecto } from './prompts';

/**
 * De dónde sale cada parte editable del prompt.
 *
 * Orden de resolución para una clave:
 *  1. la versión ANCLADA al trabajo (se fijó al empezar el análisis);
 *  2. la versión PUBLICADA en `prompts_ia`;
 *  3. el texto por defecto del REPOSITORIO (`services/ia/prompts`).
 *
 * Si la base no responde se usa el repositorio: la IA nunca se queda sin prompt.
 *
 * Cachés:
 *  - por id, solo lo que ya no es borrador: es inmutable (lo garantiza un
 *    trigger), así que no caduca;
 *  - «qué versión está publicada» vive 60 s y se invalida al publicar. En
 *    producción el worker es otro proceso: tarda como mucho eso en enterarse.
 */

export type OrigenPrompt = 'anclado' | 'publicado' | 'repositorio' | 'ausente';

export interface VersionResuelta {
  clave: string;
  /** `null` = texto del repositorio (o ausente). */
  id: string | null;
  /** 0 = repositorio. */
  version: number;
  origen: OrigenPrompt;
  /** `null` solo si no hay ni versión publicada ni texto en el repositorio. */
  contenido: string | null;
  secciones_extra: SeccionExtraDef[];
  secciones_ocultas: string[];
}

const TTL_PUBLICADO_MS = 60_000;

const publicados = new Map<string, { fila: PromptIA | null; expira: number }>();
const inmutables = new Map<string, PromptIA>();

function desdeFila(fila: PromptIA, origen: OrigenPrompt): VersionResuelta {
  return {
    clave: fila.clave,
    id: fila.id,
    version: fila.version,
    origen,
    contenido: fila.contenido,
    secciones_extra: Array.isArray(fila.secciones_extra) ? fila.secciones_extra : [],
    secciones_ocultas: Array.isArray(fila.secciones_ocultas) ? fila.secciones_ocultas : [],
  };
}

function desdeRepositorio(clave: string): VersionResuelta {
  const contenido = textoPorDefecto(clave);
  return {
    clave,
    id: null,
    version: 0,
    origen: contenido === null ? 'ausente' : 'repositorio',
    contenido,
    secciones_extra: [],
    secciones_ocultas: [],
  };
}

async function filaPublicada(clave: string): Promise<PromptIA | null> {
  const ahora = Date.now();
  const cacheada = publicados.get(clave);
  if (cacheada && cacheada.expira > ahora) return cacheada.fila;
  if (!AppDataSource.isInitialized) return null;
  try {
    const fila = await AppDataSource.getRepository(PromptIA).findOne({ where: { clave, estado: 'publicado' } });
    publicados.set(clave, { fila, expira: ahora + TTL_PUBLICADO_MS });
    if (fila) inmutables.set(fila.id, fila);
    return fila;
  } catch (err) {
    // Sin caché del error: el siguiente análisis vuelve a intentarlo.
    logger.warn(`[IA] No se pudo leer el prompt publicado de ${clave}; se usa el del repositorio`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function filaPorId(id: string): Promise<PromptIA | null> {
  const cacheada = inmutables.get(id);
  if (cacheada) return cacheada;
  if (!AppDataSource.isInitialized) return null;
  try {
    const fila = await AppDataSource.getRepository(PromptIA).findOneBy({ id });
    // Un borrador se sigue editando: nunca se cachea.
    if (fila && fila.estado !== 'borrador') inmutables.set(id, fila);
    return fila;
  } catch (err) {
    logger.warn(`[IA] No se pudo leer la versión de prompt ${id}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Versión que se usa para `clave`.
 *
 * `anclada`: el id fijado al trabajo; `null` si se ancló el texto del
 * repositorio; `undefined` si esta clave no se ancló (se usa la publicada).
 */
export async function resolverPrompt(clave: string, anclada?: string | null): Promise<VersionResuelta> {
  if (anclada === null) return desdeRepositorio(clave);
  if (anclada) {
    const fila = await filaPorId(anclada);
    if (fila && fila.clave === clave) return desdeFila(fila, 'anclado');
    logger.warn(`[IA] La versión anclada ${anclada} de ${clave} no está disponible; se usa la publicada`);
  }
  const fila = await filaPublicada(clave);
  return fila ? desdeFila(fila, 'publicado') : desdeRepositorio(clave);
}

/** Qué versión anclar a un trabajo para cada clave (`null` = repositorio). */
export async function versionesAAnclar(claves: string[]): Promise<VersionesPrompt> {
  const versiones: VersionesPrompt = {};
  for (const clave of claves) {
    const fila = await filaPublicada(clave);
    versiones[clave] = fila?.id ?? null;
  }
  return versiones;
}

/** Tras publicar o revertir: que el siguiente análisis lea la versión nueva. */
export function invalidarCachePrompts(clave?: string): void {
  if (clave) publicados.delete(clave);
  else publicados.clear();
}

/** Solo para tests. */
export function _reiniciarCachePrompts(): void {
  publicados.clear();
  inmutables.clear();
}
