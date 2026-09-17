import { AppDataSource } from '../../config/database';
import { redisClient } from '../../config/redis';
import { Usuario } from '../../models/Usuario';
import { logger } from '../../utils/logger';

/**
 * Zona horaria del usuario.
 *
 * El navegador la manda en cada petición (`X-Zona-Horaria`, sale de
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`) y se guarda la del último
 * acceso: si el dueño viaja o abre la app desde otra sucursal, las citas nuevas
 * se crean en Google con su hora local. Sin ese dato se deduce del país.
 */

export const ZONA_POR_DEFECTO = 'America/Mexico_City';

/** Una zona representativa por país (la capital o la más poblada). */
const ZONA_POR_PAIS: Record<string, string> = {
  MX: 'America/Mexico_City',
  US: 'America/New_York',
  CA: 'America/Toronto',
  GT: 'America/Guatemala',
  SV: 'America/El_Salvador',
  HN: 'America/Tegucigalpa',
  NI: 'America/Managua',
  CR: 'America/Costa_Rica',
  PA: 'America/Panama',
  CU: 'America/Havana',
  DO: 'America/Santo_Domingo',
  PR: 'America/Puerto_Rico',
  CO: 'America/Bogota',
  VE: 'America/Caracas',
  EC: 'America/Guayaquil',
  PE: 'America/Lima',
  BO: 'America/La_Paz',
  CL: 'America/Santiago',
  AR: 'America/Argentina/Buenos_Aires',
  UY: 'America/Montevideo',
  PY: 'America/Asuncion',
  BR: 'America/Sao_Paulo',
  ES: 'Europe/Madrid',
};

/** Solo nombres IANA que el runtime reconoce (descarta basura y cabeceras manipuladas). */
export function esZonaValida(zona: unknown): zona is string {
  if (typeof zona !== 'string' || zona.length === 0 || zona.length > 64) return false;
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(zona)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

export function zonaPorPais(pais: unknown): string | null {
  if (typeof pais !== 'string') return null;
  return ZONA_POR_PAIS[pais.trim().toUpperCase()] ?? null;
}

/** Primera zona válida de la lista; si no hay, la del primer país conocido; si no, CDMX. */
export function resolverZonaHoraria(zonas: unknown[], paises: unknown[] = []): string {
  for (const zona of zonas) if (esZonaValida(zona)) return zona;
  for (const pais of paises) {
    const zona = zonaPorPais(pais);
    if (zona) return zona;
  }
  return ZONA_POR_DEFECTO;
}

const THROTTLE_S = 60 * 60;

/**
 * Guarda la zona del navegador si cambió. Se llama en cada petición autenticada
 * sin esperarla: una marca en Redis limita la escritura a una por hora mientras
 * la zona no cambie. Nunca lanza.
 */
export async function registrarZonaHoraria(usuarioId: string, cabecera: unknown): Promise<void> {
  if (!esZonaValida(cabecera)) return;
  try {
    const clave = `tz:${usuarioId}`;
    if (redisClient?.isReady) {
      const vista = await redisClient.get(clave);
      if (vista === cabecera) return;
    }
    await AppDataSource.getRepository(Usuario)
      .createQueryBuilder()
      .update()
      .set({ zona_horaria: cabecera })
      .where('id = :id', { id: usuarioId })
      .andWhere('zona_horaria IS DISTINCT FROM :zona', { zona: cabecera })
      .execute();
    if (redisClient?.isReady) await redisClient.set(clave, cabecera, { EX: THROTTLE_S });
  } catch (err) {
    logger.warn('[zonaHoraria] No se pudo registrar la zona horaria', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
