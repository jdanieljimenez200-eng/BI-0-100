import crypto from 'crypto';
import { redisClient } from '../../config/redis';

/**
 * Entrar y registrarse con Google: OpenID Connect, flujo de código con PKCE.
 *
 * Mismo cliente OAuth que Google Calendar (GOOGLE_CLIENT_ID/SECRET) con su
 * propia URL de retorno (GOOGLE_LOGIN_REDIRECT_URI). Solo se piden `openid email
 * profile`: nada de acceso a datos de Google más allá de saber quién es.
 *
 * Tres defensas en el ida y vuelta:
 *  - `state` firmado (HMAC), con caducidad y de un solo uso (Redis): el
 *    callback es público y no puede aceptar peticiones fabricadas.
 *  - El `state` lleva un nonce que también va en una cookie HttpOnly del
 *    navegador que empezó el flujo: sin ella, un atacante podría hacer que la
 *    víctima entrara en la cuenta del atacante (login CSRF).
 *  - PKCE: el `code` robado de una URL no se puede canjear sin el verificador,
 *    que solo está en esa cookie.
 */

const URL_AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const EMISORES = new Set(['https://accounts.google.com', 'accounts.google.com']);
export const VIGENCIA_LOGIN_MS = 10 * 60 * 1000;

export type ModoGoogle = 'login' | 'registro';

export interface IntentoGoogle {
  modo: ModoGoogle;
  tipoCuenta: 'negocio' | 'experto';
  codigoInvitacion: string | null;
}

export interface PerfilGoogle {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre: string | null;
}

/** Fallo del flujo con Google; `codigo` es el que ve la pantalla de login (`?error=`). */
export class ErrorLoginGoogle extends Error {
  constructor(message: string, public readonly codigo: string = 'google_failed') {
    super(message);
    this.name = 'ErrorLoginGoogle';
  }
}

export function loginGoogleConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_LOGIN_REDIRECT_URI?.trim()
  );
}

function config() {
  if (!loginGoogleConfigurado()) throw new ErrorLoginGoogle('El inicio de sesión con Google no está configurado', 'google_no_disponible');
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    redirectUri: process.env.GOOGLE_LOGIN_REDIRECT_URI!.trim(),
  };
}

// ─── state firmado ───────────────────────────────────────────────────────────

function claveState(): Buffer {
  const secreto = process.env.JWT_SECRET;
  if (!secreto) throw new Error('JWT_SECRET no configurado');
  // Clave derivada propia: un state de Google Calendar no sirve aquí ni al revés.
  return Buffer.from(crypto.hkdfSync('sha256', secreto, 'bi0a100', 'google-login:state', 32));
}

const firmar = (cuerpo: string) => crypto.createHmac('sha256', claveState()).update(cuerpo).digest('base64url');

export function firmarStateLogin(intento: IntentoGoogle, nonce: string, ahora = Date.now()): string {
  const cuerpo = Buffer.from(
    JSON.stringify({ m: intento.modo, t: intento.tipoCuenta, c: intento.codigoInvitacion, n: nonce, e: ahora + VIGENCIA_LOGIN_MS })
  ).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

/** Datos del state si la firma es buena y no ha caducado; si no, `null`. */
export function verificarStateLogin(state: unknown, ahora = Date.now()): (IntentoGoogle & { nonce: string }) | null {
  if (typeof state !== 'string' || state.length > 1500) return null;
  const [cuerpo, firma] = state.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Record<string, unknown>;
    if ((d.m !== 'login' && d.m !== 'registro') || (d.t !== 'negocio' && d.t !== 'experto')) return null;
    if (typeof d.n !== 'string' || typeof d.e !== 'number' || d.e < ahora) return null;
    if (d.c !== null && typeof d.c !== 'string') return null;
    return { modo: d.m, tipoCuenta: d.t, codigoInvitacion: d.c, nonce: d.n };
  } catch {
    return null;
  }
}

/** Un state solo se canjea una vez (si Redis responde). */
export async function consumirStateLogin(state: string): Promise<boolean> {
  if (!redisClient?.isReady) return true;
  const huella = crypto.createHash('sha256').update(state).digest('hex');
  const r = await redisClient.set(`glogin:state:${huella}`, '1', { NX: true, PX: VIGENCIA_LOGIN_MS });
  return r === 'OK';
}

// ─── PKCE y URL de Google ────────────────────────────────────────────────────

export function nuevoPkce(): { verificador: string; reto: string } {
  const verificador = crypto.randomBytes(32).toString('base64url');
  const reto = crypto.createHash('sha256').update(verificador).digest('base64url');
  return { verificador, reto };
}

export function urlAutorizacionLogin(state: string, nonce: string, reto: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: reto,
    code_challenge_method: 'S256',
    // Deja elegir cuenta aunque haya una sola abierta: en un equipo compartido
    // del negocio es fácil entrar sin querer con la cuenta de otro.
    prompt: 'select_account',
  });
  return `${URL_AUTORIZACION}?${params.toString()}`;
}

// ─── Canje del código ────────────────────────────────────────────────────────

/**
 * Canjea el código y valida el id_token.
 *
 * El id_token llega directo del endpoint de tokens de Google, por TLS y con
 * nuestro secreto de cliente: OpenID Connect permite validar el emisor por esa
 * conexión en vez de por la firma (Core §3.1.3.7). Sí se comprueban emisor,
 * audiencia, caducidad y el nonce de este intento.
 */
export async function perfilDesdeCodigo(codigo: string, verificador: string, nonce: string, ahora = Date.now()): Promise<PerfilGoogle> {
  const { clientId, clientSecret, redirectUri } = config();
  let res: Response;
  try {
    res = await fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codigo,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verificador,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new ErrorLoginGoogle(`No se pudo contactar a Google: ${err instanceof Error ? err.message : String(err)}`);
  }
  const datos = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !datos.id_token) {
    throw new ErrorLoginGoogle(datos.error_description || datos.error || `Google respondió ${res.status}`);
  }

  let p: Record<string, unknown>;
  try {
    p = JSON.parse(Buffer.from(datos.id_token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    throw new ErrorLoginGoogle('id_token ilegible');
  }
  if (typeof p.iss !== 'string' || !EMISORES.has(p.iss)) throw new ErrorLoginGoogle('id_token de otro emisor');
  const audiencias = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!audiencias.includes(clientId)) throw new ErrorLoginGoogle('id_token para otro cliente');
  if (typeof p.exp !== 'number' || p.exp * 1000 < ahora) throw new ErrorLoginGoogle('id_token caducado');
  if (typeof p.nonce !== 'string' || p.nonce !== nonce) throw new ErrorLoginGoogle('id_token de otro intento');
  if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 64) throw new ErrorLoginGoogle('id_token sin sub');
  if (typeof p.email !== 'string' || !p.email) throw new ErrorLoginGoogle('Google no compartió el email', 'email_no_verificado');

  return {
    sub: p.sub,
    email: p.email.trim().toLowerCase().slice(0, 254),
    emailVerificado: p.email_verified === true || p.email_verified === 'true',
    nombre: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 120) : null,
  };
}
