import crypto from 'crypto';
import { redisClient } from '../../config/redis';

/**
 * OAuth 2.0 de Google para Calendar, con `fetch` directo (sin `googleapis`).
 *
 * Solo se pide `calendar.events` (crear y editar eventos) más `openid email`
 * para mostrar con qué cuenta se conectó. El `state` va firmado y caduca: el
 * callback es público y sin él cualquiera podría enlazar su Google a la cuenta
 * de otro usuario.
 */

export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];

const URL_AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_REVOCAR = 'https://oauth2.googleapis.com/revoke';
const VIGENCIA_STATE_MS = 10 * 60 * 1000;

/** Error de una llamada a Google, con su estado HTTP para decidir si se reintenta. */
export class ErrorGoogle extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly codigo?: string
  ) {
    super(message);
    this.name = 'ErrorGoogle';
  }

  /** El usuario revocó el acceso o el token dejó de valer: hay que reconectar. */
  get requiereReconectar(): boolean {
    return this.codigo === 'invalid_grant' || this.status === 401;
  }
}

export function googleConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_REDIRECT_URI?.trim()
  );
}

function config() {
  if (!googleConfigurado()) throw new ErrorGoogle('Google Calendar no está configurado', 503);
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    redirectUri: process.env.GOOGLE_REDIRECT_URI!.trim(),
  };
}

// ─── state firmado ───────────────────────────────────────────────────────────

export interface DatosState {
  usuarioId: string;
  cuentaId: string;
}

function claveState(): Buffer {
  const secreto = process.env.JWT_SECRET;
  if (!secreto) throw new Error('JWT_SECRET no configurado');
  return Buffer.from(crypto.hkdfSync('sha256', secreto, 'bi0a100', 'google-calendar:state', 32));
}

function firmar(cuerpo: string): string {
  return crypto.createHmac('sha256', claveState()).update(cuerpo).digest('base64url');
}

export function firmarState(datos: DatosState, ahora = Date.now()): string {
  const cuerpo = Buffer.from(
    JSON.stringify({ u: datos.usuarioId, c: datos.cuentaId, e: ahora + VIGENCIA_STATE_MS, n: crypto.randomBytes(8).toString('hex') })
  ).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

/** Devuelve los datos si la firma es buena y no ha caducado; si no, `null`. */
export function verificarState(state: unknown, ahora = Date.now()): DatosState | null {
  if (typeof state !== 'string' || state.length > 1000) return null;
  const [cuerpo, firma] = state.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as { u?: unknown; c?: unknown; e?: unknown };
    if (typeof datos.u !== 'string' || typeof datos.c !== 'string' || typeof datos.e !== 'number') return null;
    if (datos.e < ahora) return null;
    return { usuarioId: datos.u, cuentaId: datos.c };
  } catch {
    return null;
  }
}

/**
 * Un `state` solo se canjea una vez (si Redis responde). Evita que un enlace de
 * callback copiado de los logs o del historial se reutilice.
 */
export async function consumirState(state: string): Promise<boolean> {
  if (!redisClient?.isReady) return true;
  const huella = crypto.createHash('sha256').update(state).digest('hex');
  const r = await redisClient.set(`gcal:state:${huella}`, '1', { NX: true, PX: VIGENCIA_STATE_MS });
  return r === 'OK';
}

export function urlAutorizacion(datos: DatosState): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // Sin `consent`, Google no vuelve a entregar refresh token a quien ya autorizó.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: firmarState(datos),
  });
  return `${URL_AUTORIZACION}?${params.toString()}`;
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

interface RespuestaToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function pedirToken(cuerpo: Record<string, string>): Promise<RespuestaToken> {
  let res: Response;
  try {
    res = await fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(cuerpo).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // Red caída o timeout: transitorio.
    throw new ErrorGoogle(`No se pudo contactar a Google: ${err instanceof Error ? err.message : String(err)}`, 503);
  }
  const datos = (await res.json().catch(() => ({}))) as RespuestaToken;
  if (!res.ok || !datos.access_token) {
    throw new ErrorGoogle(datos.error_description || datos.error || `Google respondió ${res.status}`, res.status, datos.error);
  }
  return datos;
}

/** Email de la cuenta de Google, leído del id_token (llega directo de Google por TLS). */
function emailDeIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email.slice(0, 200) : null;
  } catch {
    return null;
  }
}

export interface ResultadoCodigo {
  refreshToken: string;
  accessToken: string;
  expiraEnS: number;
  email: string | null;
}

export async function intercambiarCodigo(codigo: string): Promise<ResultadoCodigo> {
  const { clientId, clientSecret, redirectUri } = config();
  const datos = await pedirToken({
    code: codigo,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (!datos.refresh_token) {
    throw new ErrorGoogle('Google no entregó un refresh token; vuelve a conectar', 400, 'sin_refresh_token');
  }
  if (!(datos.scope ?? '').split(' ').includes('https://www.googleapis.com/auth/calendar.events')) {
    throw new ErrorGoogle('No se concedió permiso para el calendario', 400, 'scope_insuficiente');
  }
  return {
    refreshToken: datos.refresh_token,
    accessToken: datos.access_token!,
    expiraEnS: datos.expires_in ?? 3600,
    email: emailDeIdToken(datos.id_token),
  };
}

const claveAccessToken = (conexionId: string) => `gcal:at:${conexionId}`;

/** Access token vigente, reutilizando el de Redis mientras no caduque. */
export async function obtenerAccessToken(conexionId: string, refreshToken: string): Promise<string> {
  if (redisClient?.isReady) {
    const enCache = await redisClient.get(claveAccessToken(conexionId)).catch(() => null);
    if (enCache) return enCache;
  }
  const { clientId, clientSecret } = config();
  const datos = await pedirToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const ttl = Math.max(60, (datos.expires_in ?? 3600) - 120);
  if (redisClient?.isReady) {
    await redisClient.set(claveAccessToken(conexionId), datos.access_token!, { EX: ttl }).catch(() => undefined);
  }
  return datos.access_token!;
}

export async function olvidarAccessToken(conexionId: string): Promise<void> {
  if (redisClient?.isReady) await redisClient.del(claveAccessToken(conexionId)).catch(() => undefined);
}

/** Revoca el acceso en Google. Si falla, no importa: la conexión se borra igual. */
export async function revocarToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(URL_REVOCAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
