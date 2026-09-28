import { logger } from '../utils/logger';

/**
 * Contrato de variables de entorno de producción.
 *
 * Existe porque cada servicio lee su variable cuando la necesita, y un nombre
 * mal escrito en el hosting no se notaba hasta que un cliente lo sufría: con
 * `S3_BUCKET_NAME` en vez de `AWS_BUCKET_NAME` fallaba cada subida, y sin los
 * `STRIPE_PRODUCT_*` un cliente que pagaba Pro quedaba en Gratis. Aquí se
 * comprueba todo al arrancar: si falta algo imprescindible, el backend no
 * arranca y el log dice exactamente qué.
 *
 * Solo aplica con NODE_ENV=production. En desarrollo cada servicio degrada solo.
 */

type Entorno = Record<string, string | undefined>;

export interface RevisionEntorno {
  /** Impiden arrancar. */
  faltantes: string[];
  /** Funciones que quedarán desactivadas; se registran, no bloquean. */
  avisos: string[];
}

const MIN_LONGITUD_SECRETO = 32;

/** Planes de pago → sufijo de sus variables. Mismo mapeo que `services/billing/stripeService.ts`. */
const PLANES_STRIPE = ['PRO', 'PRO_PLUS', 'BUSINESS', 'ENTERPRISE'] as const;
const CATEGORIAS_PATROCINIO = ['LEGAL', 'MARKETING', 'VENTAS'] as const;

const definida = (env: Entorno, nombre: string): boolean => Boolean(env[nombre]?.trim());

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);

/**
 * Cómo irá cifrada la conexión a Postgres. `sslmode` de la URL manda sobre
 * `ssl: false` de config/database.ts (node-postgres mezcla la URL encima de las
 * opciones; comprobado contra un Postgres sin SSL el 2026-09-27).
 */
function tlsDePostgres(env: Entorno): 'ok' | 'debil' | 'ninguno' | 'no_aplica' {
  const url = env.DATABASE_URL?.trim();
  if (!url) return 'no_aplica';
  let host = '';
  let sslmode: string | null = null;
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^\[|\]$/g, '');
    sslmode = u.searchParams.get('sslmode');
  } catch {
    return 'no_aplica';
  }
  if (HOSTS_LOCALES.has(host)) return 'no_aplica';
  if (sslmode === 'verify-full' || env.DB_SSL === 'true') return 'ok';
  if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'verify-ca') return 'debil';
  return 'ninguno';
}

export function revisarEntornoProduccion(env: Entorno = process.env): RevisionEntorno {
  const faltantes: string[] = [];
  const avisos: string[] = [];

  const exigir = (nombre: string, motivo: string): void => {
    if (!definida(env, nombre)) faltantes.push(`${nombre} (${motivo})`);
  };

  // ── Base de datos y Redis (config/database.ts, config/redis.ts) ──────────
  // Sin DATABASE_URL la conexión cae a `postgres:postgres@postgres:5432/bi0a100`
  // y sin REDIS_URL a `redis:6379`, los valores del compose de desarrollo: el
  // arranque fallaba con un ECONNREFUSED que no decía qué variable faltaba.
  if (!definida(env, 'DATABASE_URL') && !definida(env, 'DB_HOST')) {
    faltantes.push('DATABASE_URL (conexión a PostgreSQL)');
  }
  if (!definida(env, 'REDIS_URL') && !definida(env, 'REDIS_HOST')) {
    faltantes.push('REDIS_URL (colas, sesiones revocadas y límites de peticiones)');
  }
  const tls = tlsDePostgres(env);
  if (tls === 'ninguno') {
    avisos.push('DATABASE_URL apunta a un host remoto sin TLS: añade ?sslmode=verify-full o DB_SSL=true');
  } else if (tls === 'debil') {
    avisos.push(
      'DATABASE_URL usa sslmode=require/prefer/verify-ca: hoy node-postgres lo trata como verify-full, ' +
        'pero en su próxima versión mayor dejará de verificar el certificado. Usa sslmode=verify-full'
    );
  }

  // ── Sesiones ──────────────────────────────────────────────────────────────
  for (const nombre of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!definida(env, nombre)) {
      faltantes.push(`${nombre} (firma de sesiones)`);
    } else if ((env[nombre] ?? '').length < MIN_LONGITUD_SECRETO) {
      faltantes.push(`${nombre} (debe tener al menos ${MIN_LONGITUD_SECRETO} caracteres)`);
    }
  }

  // ── Panel de administración (services/admin/totp.ts) ──────────────────────
  exigir('ADMIN_TOTP_KEY', 'cifra los secretos TOTP del panel de admin');
  exigir('ADMIN_JWT_SECRET', 'firma el token del panel de admin');

  // ── Almacenamiento de archivos (services/StorageService.ts) ───────────────
  exigir('AWS_ACCESS_KEY_ID', 'subida de archivos');
  exigir('AWS_SECRET_ACCESS_KEY', 'subida de archivos');
  if (!definida(env, 'AWS_BUCKET_NAME')) {
    faltantes.push(
      definida(env, 'S3_BUCKET_NAME')
        ? 'AWS_BUCKET_NAME (hay S3_BUCKET_NAME, que el código no lee: renómbrala)'
        : 'AWS_BUCKET_NAME (subida de archivos)'
    );
  }
  exigir('AWS_BUCKET_URL_BASE', 'URL pública con la que se sirven los archivos subidos');

  // ── Correo (services/email/emailService.ts) ───────────────────────────────
  // Los enlaces de restablecer contraseña se construyen con NEXT_PUBLIC_APP_URL
  // y sin ella caen a http://localhost:3000.
  const hayCorreo = definida(env, 'RESEND_API_KEY') || definida(env, 'SMTP_PASSWORD');
  if (!hayCorreo) {
    avisos.push('Sin RESEND_API_KEY ni SMTP_PASSWORD: no se enviarán correos (restablecer contraseña incluido)');
  } else {
    exigir('NEXT_PUBLIC_APP_URL', 'los enlaces de los correos apuntarían a localhost');
  }

  // ── Métricas (app.ts /metrics) ────────────────────────────────────────────
  if (!definida(env, 'METRICS_TOKEN')) {
    avisos.push('Sin METRICS_TOKEN: /metrics responde 404 y Prometheus no podrá leer métricas');
  } else if ((env.METRICS_TOKEN ?? '').length < MIN_LONGITUD_SECRETO) {
    faltantes.push(`METRICS_TOKEN (debe tener al menos ${MIN_LONGITUD_SECRETO} caracteres)`);
  }

  // ── Stripe ────────────────────────────────────────────────────────────────
  // Stripe es opcional por diseño: sin clave, la facturación responde 503 y el
  // resto funciona. Pero una clave a medio configurar cobra sin activar planes.
  if (!definida(env, 'STRIPE_SECRET_KEY')) {
    avisos.push('STRIPE_SECRET_KEY no definida: los pagos quedan desactivados');
  } else {
    exigir('STRIPE_WEBHOOK_SECRET', 'sin ella se rechazan todos los webhooks y ningún pago activa su plan');

    let planesConPrecio = 0;
    for (const plan of PLANES_STRIPE) {
      const tienePrecio =
        definida(env, `STRIPE_PRICE_${plan}_MENSUAL`) ||
        definida(env, `STRIPE_PRICE_${plan}`) ||
        definida(env, `STRIPE_PRICE_${plan}_ANUAL`);
      if (!tienePrecio) {
        avisos.push(`Plan ${plan.toLowerCase()} sin STRIPE_PRICE_${plan}_MENSUAL/_ANUAL: no se ofrecerá`);
        continue;
      }
      planesConPrecio++;
      // Sin el producto, extractSubscriptionPlan no reconoce la suscripción y
      // deja al cliente que acaba de pagar en 'freemium'.
      exigir(`STRIPE_PRODUCT_${plan}`, `el plan ${plan.toLowerCase()} tiene precio pero no producto: quien lo pague quedaría en Gratis`);
    }
    if (planesConPrecio === 0) {
      faltantes.push('STRIPE_PRICE_<PLAN>_MENSUAL (Stripe está activo pero ningún plan tiene precio)');
    }

    const hayPrecioComunPatrocinio = definida(env, 'STRIPE_PRICE_PATROCINIO');
    for (const categoria of CATEGORIAS_PATROCINIO) {
      if (!hayPrecioComunPatrocinio && !definida(env, `STRIPE_PRICE_PATROCINIO_${categoria}`)) {
        avisos.push(`Patrocinio ${categoria.toLowerCase()} sin STRIPE_PRICE_PATROCINIO_${categoria}: no se podrá contratar`);
      }
    }
  }

  // ── Google Calendar (services/google/) ────────────────────────────────────
  // Opcional: sin GOOGLE_CLIENT_ID el botón de conectar no aparece. Con él, una
  // configuración a medias rompería el enlace en el callback de Google.
  if (!definida(env, 'GOOGLE_CLIENT_ID')) {
    avisos.push('GOOGLE_CLIENT_ID no definida: la sincronización con Google Calendar queda desactivada');
  } else {
    exigir('GOOGLE_CLIENT_SECRET', 'intercambio del código de Google Calendar');
    exigir('GOOGLE_REDIRECT_URI', 'URL de retorno registrada en Google Cloud');
    if (!definida(env, 'GOOGLE_TOKENS_KEY')) {
      faltantes.push('GOOGLE_TOKENS_KEY (cifra los tokens de Google Calendar)');
    } else if (!claveDe32Bytes(env.GOOGLE_TOKENS_KEY ?? '')) {
      faltantes.push('GOOGLE_TOKENS_KEY (debe tener 32 bytes: 64 hex o base64)');
    }
  }

  // ── Entrar con Google (services/google/loginGoogle.ts) ────────────────────
  // Opcional: sin GOOGLE_LOGIN_REDIRECT_URI el botón «Continuar con Google» no
  // aparece. Con ella, el cliente tiene que estar completo o el callback fallaría.
  if (!definida(env, 'GOOGLE_LOGIN_REDIRECT_URI')) {
    avisos.push('GOOGLE_LOGIN_REDIRECT_URI no definida: entrar y registrarse con Google queda desactivado');
  } else {
    exigir('GOOGLE_CLIENT_ID', 'cliente OAuth para entrar con Google');
    exigir('GOOGLE_CLIENT_SECRET', 'canje del código al entrar con Google');
  }

  return { faltantes, avisos };
}

/** 64 caracteres hex o base64 que decodifique a 32 bytes o más. */
export function claveDe32Bytes(valor: string): boolean {
  const buf = /^[0-9a-f]{64}$/i.test(valor) ? Buffer.from(valor, 'hex') : Buffer.from(valor, 'base64');
  return buf.length >= 32;
}

/**
 * Se llama al arrancar (`initializeApp`). En producción lanza si falta algo
 * imprescindible; fuera de producción no hace nada.
 */
export function verificarEntornoProduccion(env: Entorno = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const { faltantes, avisos } = revisarEntornoProduccion(env);
  for (const aviso of avisos) logger.warn(`[entorno] ${aviso}`);

  if (faltantes.length > 0) {
    throw new Error(
      `Variables de entorno de producción ausentes o inválidas:\n  - ${faltantes.join('\n  - ')}`
    );
  }
}
