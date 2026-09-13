import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { authenticator as base } from 'otplib';
import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';

/**
 * Verificación en dos pasos del panel de administración.
 *
 * El patrón es el "modo sudo" de GitHub: iniciar sesión en la aplicación no
 * basta para entrar al panel. Hay que presentar además un código de la app de
 * autenticación, que da un **token de admin** aparte, corto (30 min) y firmado
 * con una clave distinta a la de las sesiones normales. Robar la contraseña de un
 * admin —o su token de sesión— deja de ser suficiente.
 *
 * Todo lo que protege contra abuso vive en Redis (códigos ya usados, intentos
 * fallidos) y, si Redis no responde, **se falla cerrado**: el panel no se abre.
 * En las sesiones normales la denylist falla abierta para no dejar a nadie fuera
 * de la aplicación; en el panel de admin es preferible no entrar a entrar sin
 * esas protecciones.
 */

const esProduccion = process.env.NODE_ENV === 'production';

/** Tolerancia de ±1 paso (30 s) para relojes de móvil algo desfasados. */
const authenticator = base.clone({ window: 1 });

export const DURACION_TOKEN_ADMIN_S = 30 * 60;
const VENTANA_ANTIRREPETICION_S = 90;
const MAX_FALLOS = 5;
const BLOQUEO_FALLOS_S = 15 * 60;
const NUM_CODIGOS_RECUPERACION = 10;

// ─── Claves ──────────────────────────────────────────────────────────────────

/**
 * Obtiene una clave de 32 bytes.
 *
 * En producción es OBLIGATORIA en su variable de entorno: sin ella se lanza y el
 * panel no abre. En desarrollo, si falta, se deriva del `JWT_SECRET` con HKDF y
 * una etiqueta distinta por uso, para no exigir configuración extra en local.
 */
function clave(variable: 'ADMIN_TOTP_KEY' | 'ADMIN_JWT_SECRET'): Buffer {
  const valor = process.env[variable];
  if (valor) {
    const buf = /^[0-9a-f]{64}$/i.test(valor) ? Buffer.from(valor, 'hex') : Buffer.from(valor, 'base64');
    if (buf.length < 32) throw new Error(`${variable} debe tener al menos 32 bytes (64 hex o base64)`);
    return buf.subarray(0, 32);
  }
  if (esProduccion) {
    throw new Error(`${variable} no está configurada: el panel de admin no puede abrirse sin ella`);
  }
  const semilla = process.env.JWT_SECRET;
  if (!semilla) throw new Error(`Falta ${variable} y tampoco hay JWT_SECRET del que derivarla`);
  return Buffer.from(crypto.hkdfSync('sha256', semilla, 'bi0a100', `panel-admin:${variable}`, 32));
}

// ─── Cifrado del secreto ─────────────────────────────────────────────────────

/** AES-256-GCM. Formato: `v1.<iv>.<tag>.<cifrado>` en base64url. */
export function cifrarSecreto(secreto: string): string {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', clave('ADMIN_TOTP_KEY'), iv);
  const cifrado = Buffer.concat([cifrador.update(secreto, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return ['v1', iv, tag, cifrado].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function descifrarSecreto(guardado: string): string {
  const [version, iv, tag, cifrado] = guardado.split('.');
  if (version !== 'v1' || !iv || !tag || !cifrado) throw new Error('Secreto TOTP con formato desconocido');
  const descifrador = crypto.createDecipheriv('aes-256-gcm', clave('ADMIN_TOTP_KEY'), Buffer.from(iv, 'base64url'));
  descifrador.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([descifrador.update(Buffer.from(cifrado, 'base64url')), descifrador.final()]).toString('utf8');
}

// ─── Enrolamiento ────────────────────────────────────────────────────────────

export function generarSecreto(): string {
  return authenticator.generateSecret();
}

/** URI `otpauth://` y QR para escanear con Google Authenticator, 1Password, etc. */
export async function datosEnrolamiento(email: string, secreto: string) {
  const uri = authenticator.keyuri(email, '0 a 100 · Panel', secreto);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  return { uri, qr };
}

// ─── Verificación de códigos ─────────────────────────────────────────────────

function redisListo() {
  return redisClient?.isReady ? redisClient : null;
}

export class VerificacionNoDisponible extends Error {}
export class DemasiadosIntentos extends Error {
  constructor(public readonly segundos: number) {
    super('Demasiados intentos');
  }
}

/**
 * Comprueba un código TOTP con sus dos protecciones:
 *
 *  - **Un código, un uso.** Un código vale 30-90 s. Si alguien lo ve por encima
 *    del hombro o lo intercepta, no puede reutilizarlo en esa ventana.
 *  - **Cinco fallos, quince minutos fuera.** Un código tiene 6 cifras: sin
 *    límite, probar el millón de combinaciones es cuestión de tiempo.
 *
 * Lanza `VerificacionNoDisponible` si no hay Redis (fallo cerrado) y
 * `DemasiadosIntentos` si la cuenta está bloqueada.
 */
/** Lanza si la cuenta ya agotó sus intentos. Comparte contador con la recuperación. */
async function comprobarBloqueo(userId: string) {
  const redis = redisListo();
  if (!redis) throw new VerificacionNoDisponible('Redis no disponible');
  const claveFallos = `totp_fallos:${userId}`;
  const fallos = Number((await redis.get(claveFallos)) ?? 0);
  if (fallos >= MAX_FALLOS) {
    const ttl = await redis.ttl(claveFallos);
    throw new DemasiadosIntentos(ttl > 0 ? ttl : BLOQUEO_FALLOS_S);
  }
  return redis;
}

async function anotarFallo(redis: NonNullable<ReturnType<typeof redisListo>>, userId: string) {
  const claveFallos = `totp_fallos:${userId}`;
  const n = await redis.incr(claveFallos);
  if (n === 1) await redis.expire(claveFallos, BLOQUEO_FALLOS_S);
}

export async function verificarCodigo(userId: string, secreto: string, codigo: string): Promise<boolean> {
  const redis = await comprobarBloqueo(userId);
  const claveFallos = `totp_fallos:${userId}`;

  const limpio = String(codigo ?? '').replace(/\s+/g, '');
  const valido = /^\d{6}$/.test(limpio) && authenticator.check(limpio, secreto);

  if (!valido) {
    await anotarFallo(redis, userId);
    return false;
  }

  // SET NX: si el código ya se usó en su ventana, no vale. Atómico, así que dos
  // peticiones simultáneas con el mismo código no pasan las dos.
  const primeraVez = await redis.set(`totp_usado:${userId}:${limpio}`, '1', {
    NX: true,
    EX: VENTANA_ANTIRREPETICION_S,
  });
  if (primeraVez !== 'OK') return false;

  await redis.del(claveFallos);
  return true;
}

// ─── Códigos de recuperación ─────────────────────────────────────────────────

/** Sin 0/O ni 1/I/L: se leen en voz alta o se copian a mano sin confusiones. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function codigoAleatorio(): string {
  const bytes = crypto.randomBytes(10);
  const letras = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
  return `${letras.slice(0, 5)}-${letras.slice(5)}`;
}

export function normalizarCodigoRecuperacion(codigo: string): string {
  return String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Diez códigos nuevos, en claro (se enseñan una vez) y hasheados (se guardan). */
export async function generarCodigosRecuperacion(): Promise<{ claros: string[]; hashes: string[] }> {
  const claros = Array.from({ length: NUM_CODIGOS_RECUPERACION }, codigoAleatorio);
  const hashes = await Promise.all(claros.map((c) => bcrypt.hash(normalizarCodigoRecuperacion(c), 10)));
  return { claros, hashes };
}

/**
 * Busca, entre los hashes vivos, el que corresponde al código. Devuelve su índice
 * o -1. Cuenta como intento fallido igual que un código TOTP incorrecto: si no,
 * los códigos de recuperación serían una puerta sin límite de intentos.
 */
export async function coincidenciaRecuperacion(userId: string, codigo: string, hashes: string[]): Promise<number> {
  const redis = await comprobarBloqueo(userId);
  const normal = normalizarCodigoRecuperacion(codigo);
  if (normal.length === 10) {
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(normal, hashes[i])) {
        await redis.del(`totp_fallos:${userId}`);
        return i;
      }
    }
  }
  await anotarFallo(redis, userId);
  return -1;
}

// ─── Token de admin ──────────────────────────────────────────────────────────

interface PayloadAdmin {
  sub: string;
  typ: 'admin';
  mfa: true;
  jti: string;
}

export function emitirTokenAdmin(userId: string): { token: string; expiraEn: Date } {
  const token = jwt.sign(
    { sub: userId, typ: 'admin', mfa: true, jti: crypto.randomUUID() } satisfies PayloadAdmin,
    clave('ADMIN_JWT_SECRET'),
    { algorithm: 'HS256', expiresIn: DURACION_TOKEN_ADMIN_S }
  );
  return { token, expiraEn: new Date(Date.now() + DURACION_TOKEN_ADMIN_S * 1000) };
}

/**
 * Valida el token de admin: firma, tipo, que sea del MISMO usuario que la sesión
 * normal y que no se haya cerrado. Un token de admin de otra persona, o uno
 * robado con la sesión de otra cuenta, no vale.
 */
export async function tokenAdminValido(token: string | undefined, userId: string): Promise<boolean> {
  if (!token) return false;
  let payload: PayloadAdmin;
  try {
    payload = jwt.verify(token, clave('ADMIN_JWT_SECRET'), { algorithms: ['HS256'] }) as PayloadAdmin;
  } catch {
    return false;
  }
  if (payload.typ !== 'admin' || payload.mfa !== true || payload.sub !== userId) return false;

  const redis = redisListo();
  if (!redis) throw new VerificacionNoDisponible('Redis no disponible');
  return !(await redis.get(`deny_admin:${payload.jti}`));
}

/** Cierra la sesión de admin antes de que caduque. */
export async function revocarTokenAdmin(token: string | undefined): Promise<void> {
  if (!token) return;
  const payload = jwt.decode(token) as (PayloadAdmin & { exp?: number }) | null;
  const redis = redisListo();
  if (!payload?.jti || !redis) return;
  const restante = Math.max(1, (payload.exp ?? 0) - Math.floor(Date.now() / 1000));
  try {
    await redis.set(`deny_admin:${payload.jti}`, '1', { EX: restante });
  } catch (err) {
    logger.error('[totp] no se pudo revocar el token de admin:', err);
  }
}
