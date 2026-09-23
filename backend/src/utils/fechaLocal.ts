import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import type { AuthRequest } from '../middleware/auth';
import { esZonaValida, ZONA_POR_DEFECTO } from '../services/google/zonaHoraria';

/**
 * "Hoy" en la zona horaria de quien opera.
 *
 * `new Date().toISOString().slice(0, 10)` da el día en UTC: en México, todo lo
 * cobrado desde las 18:00 (19:00 en horario de verano) quedaba con la fecha de
 * mañana, y el último día del mes caía en el mes siguiente (cortes de caja,
 * P&L mensual, IVA).
 */
export function hoyEnZona(zona: string, ahora: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: esZonaValida(zona) ? zona : ZONA_POR_DEFECTO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/**
 * Zona de la petición: la del navegador que la manda (cabecera X-Zona-Horaria,
 * ver frontend/lib/api.ts); si no viene, la última guardada del usuario real
 * (el trabajador, no el dueño: es quien está en el mostrador); si tampoco, CDMX.
 */
export async function zonaDePeticion(req: AuthRequest): Promise<string> {
  const cabecera = req.headers['x-zona-horaria'];
  if (esZonaValida(cabecera)) return cabecera;
  const usuarioId = req.trabajadorRealId ?? req.userId;
  if (usuarioId) {
    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: usuarioId },
      select: ['id', 'zona_horaria'],
    });
    if (esZonaValida(usuario?.zona_horaria)) return usuario!.zona_horaria!;
  }
  return ZONA_POR_DEFECTO;
}

export async function hoyDePeticion(req: AuthRequest, ahora: Date = new Date()): Promise<string> {
  return hoyEnZona(await zonaDePeticion(req), ahora);
}
