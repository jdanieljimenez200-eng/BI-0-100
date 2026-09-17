import crypto from 'crypto';

/**
 * Cifrado de los refresh tokens de Google (AES-256-GCM, mismo formato que los
 * secretos TOTP de `services/admin/totp.ts`: `v1.<iv>.<tag>.<cifrado>`).
 *
 * Un refresh token da acceso al calendario del usuario hasta que lo revoque:
 * un volcado de la base sin GOOGLE_TOKENS_KEY no debe servir para nada.
 */

function clave(): Buffer {
  const valor = process.env.GOOGLE_TOKENS_KEY;
  if (valor) {
    const buf = /^[0-9a-f]{64}$/i.test(valor) ? Buffer.from(valor, 'hex') : Buffer.from(valor, 'base64');
    if (buf.length < 32) throw new Error('GOOGLE_TOKENS_KEY debe tener al menos 32 bytes (64 hex o base64)');
    return buf.subarray(0, 32);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('GOOGLE_TOKENS_KEY no está configurada');
  }
  // Desarrollo y tests: derivada del JWT_SECRET, como en el panel de admin.
  const semilla = process.env.JWT_SECRET;
  if (!semilla) throw new Error('Falta GOOGLE_TOKENS_KEY y tampoco hay JWT_SECRET del que derivarla');
  return Buffer.from(crypto.hkdfSync('sha256', semilla, 'bi0a100', 'google-calendar:tokens', 32));
}

export function cifrarToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const cifrado = Buffer.concat([cifrador.update(token, 'utf8'), cifrador.final()]);
  return ['v1', iv, cifrador.getAuthTag(), cifrado]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function descifrarToken(guardado: string): string {
  const [version, iv, tag, cifrado] = guardado.split('.');
  if (version !== 'v1' || !iv || !tag || !cifrado) throw new Error('Token de Google con formato desconocido');
  const descifrador = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64url'));
  descifrador.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([descifrador.update(Buffer.from(cifrado, 'base64url')), descifrador.final()]).toString('utf8');
}
