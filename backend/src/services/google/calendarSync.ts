import { UnrecoverableError } from 'bullmq';
import { AppDataSource } from '../../config/database';
import { Cita } from '../../models/Cita';
import { ConexionGoogleCalendar } from '../../models/ConexionGoogleCalendar';
import { Producto } from '../../models/Producto';
import { Usuario } from '../../models/Usuario';
import { esErrorTransitorio } from '../../utils/erroresTransitorios';
import { logger } from '../../utils/logger';
import { descifrarToken } from './cifradoTokens';
import { ErrorGoogle, obtenerAccessToken, olvidarAccessToken } from './oauthGoogle';
import { resolverZonaHoraria } from './zonaHoraria';

/**
 * Copia de las citas en Google Calendar (solo app → Google).
 *
 * El id del evento se deriva del id de la cita: si un reintento llega después de
 * que Google ya creó el evento, el alta responde 409 y se actualiza en vez de
 * duplicarlo.
 */

export type TrabajoCalendario =
  | { tipo: 'guardar'; citaId: string }
  | { tipo: 'borrar'; cuentaId: string; eventId: string };

const API = 'https://www.googleapis.com/calendar/v3';

/** Google exige base32hex (0-9, a-v), 5-1024 caracteres: el hex del UUID cumple. */
export function idEventoDeCita(citaId: string): string {
  return `bi${citaId.replace(/-/g, '').toLowerCase()}`;
}

function normalizarHora(hora: string): string {
  const [h = '00', m = '00', s = '00'] = hora.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.slice(0, 2).padStart(2, '0')}`;
}

function segundos(hora: string): number {
  const [h, m, s] = normalizarHora(hora).split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function horaDeSegundos(total: number): string {
  const t = Math.min(total, 23 * 3600 + 59 * 60);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

const ESTADO_EVENTO: Record<Cita['estado'], 'confirmed' | 'tentative' | 'cancelled'> = {
  pendiente: 'tentative',
  confirmada: 'confirmed',
  completada: 'confirmed',
  cancelada: 'cancelled',
};

export interface EventoGoogle {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  status: 'confirmed' | 'tentative' | 'cancelled';
  extendedProperties: { private: { bi0a100_cita_id: string } };
}

type DatosCita = Pick<
  Cita,
  'id' | 'titulo' | 'fecha' | 'hora_inicio' | 'hora_fin' | 'estado' | 'cliente_nombre' | 'cliente_telefono' | 'notas'
>;

/** Hora local de la cita + zona IANA: Google la sitúa bien aunque cambie el horario de verano. */
export function construirEvento(cita: DatosCita, zona: string): EventoGoogle {
  const inicio = normalizarHora(cita.hora_inicio);
  // Google rechaza eventos que terminan antes de empezar.
  const fin = segundos(cita.hora_fin) > segundos(inicio) ? normalizarHora(cita.hora_fin) : horaDeSegundos(segundos(inicio) + 30 * 60);

  const lineas = [
    cita.cliente_nombre ? `Cliente: ${cita.cliente_nombre}` : null,
    cita.cliente_telefono ? `Teléfono: ${cita.cliente_telefono}` : null,
    cita.notas ? `\n${cita.notas}` : null,
    '\nCreada desde BI 0 A 100',
  ].filter(Boolean);

  return {
    id: idEventoDeCita(cita.id),
    summary: cita.titulo,
    description: lineas.join('\n').slice(0, 8000),
    start: { dateTime: `${cita.fecha}T${inicio}`, timeZone: zona },
    end: { dateTime: `${cita.fecha}T${fin}`, timeZone: zona },
    status: ESTADO_EVENTO[cita.estado] ?? 'confirmed',
    extendedProperties: { private: { bi0a100_cita_id: cita.id } },
  };
}

// ─── Llamadas a la API ───────────────────────────────────────────────────────

interface ConexionConToken extends ConexionGoogleCalendar {
  refresh_token_cifrado: string;
}

async function llamar(
  conexion: ConexionConToken,
  metodo: 'POST' | 'PATCH' | 'DELETE',
  ruta: string,
  cuerpo?: unknown,
  reintentoAuth = true
): Promise<{ status: number; datos: Record<string, unknown> }> {
  const token = await obtenerAccessToken(conexion.id, descifrarToken(conexion.refresh_token_cifrado));
  let res: Response;
  try {
    res = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new ErrorGoogle(`Sin respuesta de Google Calendar: ${err instanceof Error ? err.message : String(err)}`, 503);
  }
  if (res.status === 401 && reintentoAuth) {
    // Token de la caché revocado o caducado antes de tiempo: uno nuevo y otra vez.
    await olvidarAccessToken(conexion.id);
    return llamar(conexion, metodo, ruta, cuerpo, false);
  }
  const datos = (res.status === 204 ? {} : await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, datos };
}

function errorDeRespuesta(status: number, datos: Record<string, unknown>): ErrorGoogle {
  const err = datos.error as { message?: string; errors?: Array<{ reason?: string }> } | undefined;
  const razon = err?.errors?.[0]?.reason;
  // 403 por cuota se reintenta; 403 por permisos obliga a reconectar.
  const estado = status === 403 && razon && /rateLimit|quota/i.test(razon) ? 429 : status;
  return new ErrorGoogle(err?.message || `Google Calendar respondió ${status}`, estado, razon);
}

function rutaEventos(conexion: ConexionGoogleCalendar, eventId?: string): string {
  const base = `/calendars/${encodeURIComponent(conexion.calendario_id)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

async function conexionActiva(cuentaId: string): Promise<ConexionConToken | null> {
  return (await AppDataSource.getRepository(ConexionGoogleCalendar)
    .createQueryBuilder('g')
    .addSelect('g.refresh_token_cifrado')
    .where('g.cuenta_id = :cuentaId AND g.activa = true', { cuentaId })
    .orderBy('g.fecha_actualizacion', 'DESC')
    .getOne()) as ConexionConToken | null;
}

async function zonaParaCita(cita: Cita, conexion: ConexionGoogleCalendar): Promise<string> {
  const usuarios = AppDataSource.getRepository(Usuario);
  const [dueno, quienConecto, producto] = await Promise.all([
    usuarios.findOne({ where: { id: cita.usuario_id }, select: ['id', 'zona_horaria', 'datos_negocio'] }),
    conexion.usuario_id === cita.usuario_id
      ? null
      : usuarios.findOne({ where: { id: conexion.usuario_id }, select: ['id', 'zona_horaria'] }),
    cita.producto_id
      ? AppDataSource.getRepository(Producto).findOne({ where: { id: cita.producto_id }, select: ['id', 'pais'] })
      : null,
  ]);
  return resolverZonaHoraria(
    [dueno?.zona_horaria, quienConecto?.zona_horaria],
    [producto?.pais, (dueno?.datos_negocio as { pais?: unknown } | undefined)?.pais]
  );
}

// ─── Trabajos ────────────────────────────────────────────────────────────────

async function guardar(citaId: string): Promise<string> {
  const repoCitas = AppDataSource.getRepository(Cita);
  const cita = await repoCitas.findOne({ where: { id: citaId } });
  if (!cita) return 'cita_borrada';

  const conexion = await conexionActiva(cita.usuario_id);
  if (!conexion) {
    await repoCitas.update(cita.id, { google_sync_estado: null, google_sync_error: null });
    return 'sin_conexion';
  }

  // Cancelada y nunca subida: no hay nada que crear en Google.
  if (cita.estado === 'cancelada' && !cita.google_event_id) {
    await repoCitas.update(cita.id, { google_sync_estado: 'sincronizada', google_sync_error: null });
    return 'nada_que_hacer';
  }

  const evento = construirEvento(cita, await zonaParaCita(cita, conexion));
  const { id, ...cambios } = evento;

  let eventId = cita.google_event_id;
  let r = eventId ? await llamar(conexion, 'PATCH', rutaEventos(conexion, eventId), cambios) : null;

  if (!r || r.status === 404 || r.status === 410) {
    r = await llamar(conexion, 'POST', rutaEventos(conexion), evento);
    if (r.status === 409) {
      // Ya existe (reintento, o se conectó de nuevo el mismo calendario).
      r = await llamar(conexion, 'PATCH', rutaEventos(conexion, id), cambios);
    }
    eventId = id;
  }
  if (r.status < 200 || r.status >= 300) throw errorDeRespuesta(r.status, r.datos);

  await repoCitas.update(cita.id, {
    google_event_id: typeof r.datos.id === 'string' ? r.datos.id : eventId,
    google_sync_estado: 'sincronizada',
    google_sync_error: null,
  });
  return 'sincronizada';
}

async function borrar(cuentaId: string, eventId: string): Promise<string> {
  const conexion = await conexionActiva(cuentaId);
  if (!conexion) return 'sin_conexion';
  const r = await llamar(conexion, 'DELETE', rutaEventos(conexion, eventId));
  if (r.status === 404 || r.status === 410 || (r.status >= 200 && r.status < 300)) return 'borrada';
  throw errorDeRespuesta(r.status, r.datos);
}

const recortar = (texto: string) => texto.slice(0, 300);

export async function marcarErrorCita(citaId: string, mensaje: string): Promise<void> {
  await AppDataSource.getRepository(Cita).update(citaId, {
    google_sync_estado: 'error',
    google_sync_error: recortar(mensaje),
  });
}

/**
 * Ejecuta un trabajo. Los errores transitorios se relanzan tal cual para que
 * BullMQ reintente; el resto se marca en la cita (o en la conexión, si Google
 * retiró el permiso) y se lanza como `UnrecoverableError`.
 */
export async function procesarTrabajoCalendario(trabajo: TrabajoCalendario): Promise<string> {
  try {
    return trabajo.tipo === 'guardar'
      ? await guardar(trabajo.citaId)
      : await borrar(trabajo.cuentaId, trabajo.eventId);
  } catch (err) {
    if (esErrorTransitorio(err)) throw err;

    const mensaje = err instanceof Error ? err.message : String(err);
    if (err instanceof ErrorGoogle && (err.requiereReconectar || err.status === 403)) {
      const cuentaId =
        trabajo.tipo === 'borrar'
          ? trabajo.cuentaId
          : (await AppDataSource.getRepository(Cita).findOne({ where: { id: trabajo.citaId }, select: ['id', 'usuario_id'] }))
              ?.usuario_id;
      if (cuentaId) {
        await AppDataSource.getRepository(ConexionGoogleCalendar).update(
          { cuenta_id: cuentaId, activa: true },
          { activa: false, ultimo_error: recortar(`Google retiró el acceso: ${mensaje}. Vuelve a conectar tu calendario.`) }
        );
      }
    }
    if (trabajo.tipo === 'guardar') await marcarErrorCita(trabajo.citaId, mensaje);
    logger.warn('[calendarSync] Trabajo descartado', { tipo: trabajo.tipo, error: mensaje });
    throw new UnrecoverableError(mensaje);
  }
}
