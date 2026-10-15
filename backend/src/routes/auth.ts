import { Router, Request, Response, CookieOptions } from 'express';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { InvitacionTrabajador } from '../models/InvitacionTrabajador';
import { AsignacionTrabajador } from '../models/AsignacionTrabajador';
import { computePermisosEfectivos } from '../services/billing/planService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, timingSafeEqual } from 'crypto';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { isEmailAvailable, sendPasswordResetEmail } from '../services/email/emailService';
import { loginLimiter, signupLimiter, passwordResetLimiter } from '../middleware/cors';
import { authenticate, AuthRequest, claveBloqueo } from '../middleware/auth';
import { urlApp } from '../utils/urlApp';
import {
  ErrorLoginGoogle,
  IntentoGoogle,
  PerfilGoogle,
  VIGENCIA_LOGIN_MS,
  consumirStateLogin,
  firmarStateLogin,
  loginGoogleConfigurado,
  nuevoPkce,
  perfilDesdeCodigo,
  urlAutorizacionLogin,
  verificarStateLogin,
} from '../services/google/loginGoogle';
import {
  aceptoExpresamente,
  documentosPendientes,
  origenDePeticion,
  OrigenPeticion,
  registrarAceptacion,
  versionesDesfasadas,
} from '../services/cumplimiento/aceptaciones';

const router = Router();

const BCRYPT_COST = 12;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESET_TTL_SECONDS = 60 * 60;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;
const LOGIN_FAIL_MAX = 10;
/**
 * Tras rotar un refresh token, el jti viejo queda "recién rotado" este tiempo.
 * Dos pestañas que renuevan a la vez mandan la misma cookie: la primera rota y
 * la segunda llega con el jti ya consumido. Dentro de la gracia se le pide que
 * reintente (la cookie nueva ya está en el navegador) en vez de tratarlo como
 * robo y cerrar todas las sesiones.
 */
const GRACIA_ROTACION_SECONDS = 30;

// ─── Cookie del refresh token ─────────────────────────────────────────────────
//
// El refresh token (7 días) viaja SOLO en una cookie HttpOnly: un XSS ya no
// puede leerlo de localStorage. El access token (15 min) sigue en el cuerpo.
// Requisito de despliegue: frontend y API bajo el mismo dominio registrable
// (app.tudominio.com + api.tudominio.com). Con dominios de proveedores distintos
// el navegador la trata como cookie de terceros y la bloquea.

export const COOKIE_REFRESH = 'bi_refresh';

function opcionesCookieRefresh(): CookieOptions {
  const sameSite = (process.env.REFRESH_COOKIE_SAMESITE ?? 'lax').toLowerCase();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite: sameSite === 'strict' || sameSite === 'none' ? sameSite : 'lax',
    // Solo viaja a las rutas que la necesitan (refresh y logout).
    path: '/api/auth',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

function ponerCookieRefresh(res: Response, refreshToken: string): void {
  res.cookie(COOKIE_REFRESH, refreshToken, { ...opcionesCookieRefresh(), maxAge: REFRESH_TTL_SECONDS * 1000 });
}

function borrarCookieRefresh(res: Response): void {
  res.clearCookie(COOKIE_REFRESH, opcionesCookieRefresh());
}

/**
 * Refresh token de la petición: la cookie, o el cuerpo para clientes que no son
 * navegador (integraciones, tests). Un navegador nunca lo recibe en el cuerpo.
 */
function refreshDePeticion(req: Request): string | undefined {
  const deCookie = req.cookies?.[COOKIE_REFRESH];
  if (typeof deCookie === 'string' && deCookie) return deCookie;
  const deCuerpo = req.body?.refreshToken;
  return typeof deCuerpo === 'string' && deCuerpo ? deCuerpo : undefined;
}

/**
 * Hash de bcrypt de una contraseña que nadie tiene. Cuando el email no existe se
 * compara contra él, para que la respuesta tarde lo mismo que con un email real
 * (si no, el tiempo delata qué cuentas existen).
 */
let hashFicticio: Promise<string> | null = null;
function obtenerHashFicticio(): Promise<string> {
  if (!hashFicticio) hashFicticio = bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_COST);
  return hashFicticio;
}

class InvitacionYaUsadaError extends Error {}

/** Comprueba un código de invitación para `email`; el error es el texto que ve el usuario. */
async function validarInvitacion(codigo: string, email: string): Promise<{ invitacion: InvitacionTrabajador } | { error: string }> {
  const inv = await AppDataSource.getRepository(InvitacionTrabajador).findOne({ where: { codigo } });
  if (!inv) return { error: 'Código de invitación inválido' };
  if (inv.usado_por) return { error: 'Este código de invitación ya fue utilizado' };
  if (new Date() > new Date(inv.expira_en)) return { error: 'El código de invitación ha expirado' };
  if (inv.email_destino && inv.email_destino.trim().toLowerCase() !== email) {
    return { error: 'Este código de invitación está restringido a otro correo' };
  }
  return { invitacion: inv };
}

/**
 * Crea la cuenta y, si hay invitación, la consume en la misma transacción.
 * Lanza InvitacionYaUsadaError si otra alta se la llevó antes, o el 23505 de
 * Postgres si el email ya existe (dos altas simultáneas).
 *
 * La aceptación de Términos y Aviso de Privacidad se registra en la misma
 * transacción: no puede quedar una cuenta sin la prueba de su consentimiento.
 */
async function crearCuenta(datos: {
  email: string;
  passwordHash: string;
  nombre: string;
  tipoCuenta: 'negocio' | 'experto';
  invitacion: InvitacionTrabajador | null;
  googleSub?: string | null;
  aceptacion: { metodo: 'registro' | 'google'; origen: OrigenPeticion };
}): Promise<Usuario> {
  const { invitacion } = datos;
  return AppDataSource.transaction(async (manager) => {
    const u = manager.create(Usuario, {
      email: datos.email,
      password_hash: datos.passwordHash,
      google_sub: datos.googleSub ?? null,
      nombre: datos.nombre,
      account_role: invitacion ? 'trabajador' : 'owner',
      owner_id: invitacion ? invitacion.cuenta_id : undefined,
      plan: 'freemium',
      // Un colaborador invitado entra a la cuenta de un negocio, elija lo que elija.
      tipo_cuenta: !invitacion && datos.tipoCuenta === 'experto' ? 'experto' : 'negocio',
      analisis_disponibles: 0,
      creditos_marketing: 0,
    });
    await manager.save(Usuario, u);

    if (invitacion) {
      // Consumo atómico: la comprobación `usado_por` se leyó sin bloqueo y dos
      // altas simultáneas con el mismo código la pasaban las dos. Solo una de
      // estas UPDATE afecta a la fila; la otra revierte su alta.
      const consumo = await manager
        .createQueryBuilder()
        .update(InvitacionTrabajador)
        .set({ usado_por: u.id, usado_en: new Date() })
        .where('id = :id AND usado_por IS NULL', { id: invitacion.id })
        .execute();
      if (consumo.affected !== 1) throw new InvitacionYaUsadaError();
    }
    await registrarAceptacion(manager, u.id, datos.aceptacion.metodo, datos.aceptacion.origen);
    return u;
  });
}

/**
 * La política real, alineada con lo que el frontend ya promete en signup y
 * reset-password (mínimo 8 caracteres, mayúscula, número y símbolo). Antes
 * el backend solo exigía 6 caracteres sin complejidad — el copy prometía
 * más de lo que se validaba.
 */
function errorDePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  if (password.length > MAX_PASSWORD_LENGTH) return `La contraseña no puede superar ${MAX_PASSWORD_LENGTH} caracteres`;
  if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir al menos una mayúscula';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número';
  if (!/[^A-Za-z0-9]/.test(password)) return 'La contraseña debe incluir al menos un símbolo';
  return null;
}

// Helper para obtener secretos JWT
function getJWTSecrets() {
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

  if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET are required in environment variables');
  }

  return { JWT_SECRET, JWT_REFRESH_SECRET };
}

function safeRedis(): typeof redisClient | null {
  return redisClient && redisClient.isReady ? redisClient : null;
}

/** Emite un refresh token con jti y lo registra en Redis (one-time) */
async function issueRefreshToken(userId: string): Promise<string> {
  const { JWT_REFRESH_SECRET } = getJWTSecrets();
  const jti = randomUUID();
  const refreshToken = jwt.sign({ userId, jti }, JWT_REFRESH_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
  const redis = safeRedis();
  if (redis) {
    try {
      await redis.setEx(`rt:${jti}`, REFRESH_TTL_SECONDS, userId);
      await redis.sAdd(`rt_user:${userId}`, jti);
      await redis.expire(`rt_user:${userId}`, REFRESH_TTL_SECONDS);
    } catch (err) {
      logger.error('[auth] No se pudo registrar refresh jti en Redis:', err);
    }
  }
  return refreshToken;
}

function issueAccessToken(usuario: Usuario): string {
  const { JWT_SECRET } = getJWTSecrets();
  return jwt.sign(
    { userId: usuario.id, email: usuario.email, role: usuario.account_role, jti: randomUUID() },
    JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256' }
  );
}

/**
 * Bloqueo por intentos fallidos, por cuenta (no solo por IP). El rate limit
 * de `loginLimiter` es por IP y no frena credential-stuffing distribuido
 * (muchas IPs contra el mismo email). Mismo mensaje genérico que el límite
 * por IP para no filtrar si el email existe.
 */
async function estaBloqueadoPorIntentos(email: string): Promise<boolean> {
  const redis = safeRedis();
  if (!redis) return false; // fail-open: mismo criterio que el resto de checks Redis de este archivo
  try {
    const count = await redis.get(`login_fail:${email}`);
    return count !== null && Number(count) >= LOGIN_FAIL_MAX;
  } catch (err) {
    logger.warn('[auth] No se pudo verificar bloqueo por intentos de login:', err);
    return false;
  }
}

async function registrarIntentoFallido(email: string): Promise<void> {
  const redis = safeRedis();
  if (!redis) return;
  try {
    const key = `login_fail:${email}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, LOGIN_FAIL_WINDOW_SECONDS);
  } catch (err) {
    logger.warn('[auth] No se pudo registrar intento fallido de login:', err);
  }
}

async function limpiarIntentosFallidos(email: string): Promise<void> {
  const redis = safeRedis();
  if (!redis) return;
  try {
    await redis.del(`login_fail:${email}`);
  } catch (err) {
    logger.warn('[auth] No se pudo limpiar intentos fallidos de login:', err);
  }
}

/** Revoca todos los refresh tokens activos de un usuario */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  const redis = safeRedis();
  if (!redis) return;
  try {
    const jtis = await redis.sMembers(`rt_user:${userId}`);
    if (jtis.length > 0) {
      await redis.del(jtis.map((j) => `rt:${j}`));
    }
    await redis.del(`rt_user:${userId}`);
  } catch (err) {
    logger.error('[auth] Error revocando refresh tokens:', err);
  }
}

/** Calcula los permisos efectivos de un usuario para entregar en el payload de auth */
export async function getUserPermissions(usuario: Usuario): Promise<Record<string, boolean>> {
  if (usuario.account_role !== 'trabajador') {
    return computePermisosEfectivos(usuario.account_role);
  }
  const asignaciones = await AppDataSource.getRepository(AsignacionTrabajador).find({
    where: { trabajador_id: usuario.id, activo: true },
    select: ['permisos'],
  });
  return computePermisosEfectivos('trabajador', asignaciones.map((a) => a.permisos));
}

// Signup & Register handler
const handleSignup = async (req: Request, res: Response) => {
  try {
    const emailRaw = req.body.email;
    const password = req.body.password;
    const name = req.body.name || req.body.nombre;

    if (!emailRaw || typeof emailRaw !== 'string' || !emailRaw.trim()) {
      return res.status(400).json({ error: 'El correo electrónico es requerido' });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ error: 'La contraseña es requerida' });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    // Consentimiento expreso: casilla sin marcar por defecto en el formulario.
    if (!aceptoExpresamente(req.body.acepta_terminos)) {
      return res.status(400).json({
        error: 'Para crear tu cuenta acepta los Términos y el Aviso de Privacidad y confirma que eres mayor de edad',
        codigo: 'aceptacion_requerida',
      });
    }
    if (versionesDesfasadas(req.body).length > 0) {
      return res.status(409).json({
        error: 'Actualizamos los Términos o el Aviso de Privacidad. Recarga la página y revísalos antes de continuar.',
        codigo: 'documentos_actualizados',
      });
    }

    const email = emailRaw.trim().toLowerCase();

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Formato de correo electrónico inválido' });
    }

    // Validar contraseña
    const errorPassword = errorDePassword(password);
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword });
    }

    const usuarioRepo = AppDataSource.getRepository(Usuario);

    // Verificar si el usuario ya existe
    const usuarioExistente = await usuarioRepo.findOne({ where: { email } });
    if (usuarioExistente) {
      return res.status(409).json({ error: 'Ya existe una cuenta registrada con este correo electrónico' });
    }

    const codigoInvitacion = typeof req.body.codigo_invitacion === 'string' ? req.body.codigo_invitacion.trim() : undefined;
    let invitacionValida: InvitacionTrabajador | null = null;

    if (codigoInvitacion) {
      const r = await validarInvitacion(codigoInvitacion, email);
      if ('error' in r) return res.status(400).json({ error: r.error });
      invitacionValida = r.invitacion;
    }

    // Hash password (cost 12)
    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    let usuario: Usuario;
    try {
      usuario = await crearCuenta({
        email,
        passwordHash: hashedPassword,
        nombre: name.trim(),
        tipoCuenta: req.body.tipo_cuenta === 'experto' ? 'experto' : 'negocio',
        invitacion: invitacionValida,
        aceptacion: { metodo: 'registro', origen: origenDePeticion(req) },
      });
    } catch (err) {
      if (err instanceof InvitacionYaUsadaError) {
        return res.status(400).json({ error: 'Este código de invitación ya fue utilizado' });
      }
      // Dos altas simultáneas con el mismo email: la segunda choca con el índice único.
      if ((err as { code?: string })?.code === '23505') {
        return res.status(409).json({ error: 'Ya existe una cuenta registrada con este correo electrónico' });
      }
      throw err;
    }

    // Generar tokens (access con jti revocable + refresh rotatorio en cookie HttpOnly)
    const accessToken = issueAccessToken(usuario);
    ponerCookieRefresh(res, await issueRefreshToken(usuario.id));

    // Opcional: Enviar email de bienvenida
    if (isEmailAvailable()) {
      try {
        logger.info(`[auth] Bienvenida pendiente de envío a ${usuario.email}`);
      } catch (error) {
        logger.warn('Welcome email could not be sent:', error);
      }
    }

    const permisos = await getUserPermissions(usuario);
    const userPayload = {
      id: usuario.id,
      email: usuario.email,
      name: usuario.nombre,
      role: usuario.account_role,
      account_role: usuario.account_role,
      plan: usuario.plan,
      tipo_cuenta: usuario.tipo_cuenta,
      permisos,
    };

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      accessToken,
      user: userPayload,
    });
  } catch (err) {
    logger.error('POST /api/auth/signup error:', err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

// Login handler
const handleLogin = async (req: Request, res: Response) => {
  try {
    const emailRaw = req.body.email;
    const password = req.body.password;

    if (!emailRaw || typeof emailRaw !== 'string' || !emailRaw.trim()) {
      return res.status(400).json({ error: 'El correo electrónico es requerido' });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ error: 'La contraseña es requerida' });
    }

    const email = emailRaw.trim().toLowerCase();

    if (await estaBloqueadoPorIntentos(email)) {
      return res.status(429).json({ error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' });
    }

    const usuarioRepo = AppDataSource.getRepository(Usuario);
    const usuario = await usuarioRepo.findOne({ where: { email } });

    // La contraseña se comprueba SIEMPRE, también si el email no existe (contra
    // un hash ficticio), y antes de mirar si la cuenta está desactivada. Así ni
    // el tiempo de respuesta ni el "Cuenta desactivada" delatan qué emails
    // tienen cuenta a quien no conoce su contraseña.
    const passwordMatch = await bcrypt.compare(password, usuario?.password_hash ?? (await obtenerHashFicticio()));
    if (!usuario || !passwordMatch) {
      await registrarIntentoFallido(email);
      return res.status(401).json({ error: 'Email o contraseña inválida' });
    }

    if (usuario.activo === false) {
      return res.status(403).json({ error: 'Cuenta desactivada. Contacta soporte.' });
    }

    await limpiarIntentosFallidos(email);

    const accessToken = issueAccessToken(usuario);
    ponerCookieRefresh(res, await issueRefreshToken(usuario.id));

    const permisos = await getUserPermissions(usuario);
    const userPayload = {
      id: usuario.id,
      email: usuario.email,
      name: usuario.nombre,
      plan: usuario.plan,
      account_role: usuario.account_role,
      tipo_cuenta: usuario.tipo_cuenta,
      permisos,
    };

    res.json({
      message: 'Login exitoso',
      accessToken,
      user: userPayload,
    });
  } catch (err) {
    logger.error('POST /api/auth/login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// Routes
router.post('/signup', signupLimiter, handleSignup);
router.post('/register', signupLimiter, handleSignup);
router.post('/login', loginLimiter, handleLogin);

// Me endpoint — usa `authenticate` para respetar la denylist de jti que escribe
// POST /logout; verificar el JWT a mano aquí dejaba pasar tokens ya revocados.
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: req.userId },
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const permisos = await getUserPermissions(usuario);
    const userPayload = {
      id: usuario.id,
      email: usuario.email,
      name: usuario.nombre,
      plan: usuario.plan,
      account_role: usuario.account_role,
      tipo_cuenta: usuario.tipo_cuenta,
      es_admin: usuario.es_admin ?? false,
      permisos,
      // La app pide aceptarlos antes de seguir (cuentas previas al registro de
      // aceptaciones, colaboradores dados de alta por el dueño, versión nueva).
      aceptaciones_pendientes: await documentosPendientes(usuario.id),
    };

    res.json(userPayload);
  } catch (err) {
    logger.error('GET /api/auth/me error:', err);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

/**
 * Cambia lo que el usuario eligió al registrarse. Un experto que también tiene
 * negocio activa aquí el panel de análisis, y al revés. No toca plan ni permisos.
 */
/**
 * Acepta, ya con sesión, los documentos que la cuenta tenga pendientes. Misma
 * casilla y mismas comprobaciones que el registro.
 */
router.post('/aceptaciones', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!aceptoExpresamente(req.body?.acepta_terminos)) {
      return res.status(400).json({
        error: 'Acepta los Términos y el Aviso de Privacidad y confirma que eres mayor de edad',
        codigo: 'aceptacion_requerida',
      });
    }
    if (versionesDesfasadas(req.body).length > 0) {
      return res.status(409).json({
        error: 'Actualizamos los Términos o el Aviso de Privacidad. Recarga la página y revísalos antes de continuar.',
        codigo: 'documentos_actualizados',
      });
    }
    const origen = origenDePeticion(req);
    await AppDataSource.transaction(async (manager) => {
      // Con el cerrojo de la fila del usuario, dos clics a la vez no duplican la aceptación.
      await manager.query(`SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE`, [req.userId]);
      const pendientes = await documentosPendientes(req.userId!, manager);
      if (pendientes.length) await registrarAceptacion(manager, req.userId!, 'sesion', origen, pendientes);
    });
    return res.json({ aceptaciones_pendientes: [] });
  } catch (err) {
    logger.error('POST /api/auth/aceptaciones error:', err);
    return res.status(500).json({ error: 'No se pudo registrar la aceptación' });
  }
});

router.patch('/tipo-cuenta', authenticate, async (req: AuthRequest, res: Response) => {
  const tipo = req.body?.tipo_cuenta;
  if (tipo !== 'negocio' && tipo !== 'experto') {
    return res.status(400).json({ error: 'tipo_cuenta debe ser negocio o experto' });
  }
  try {
    await AppDataSource.getRepository(Usuario).update(req.userId!, { tipo_cuenta: tipo });
    res.json({ tipo_cuenta: tipo });
  } catch (err) {
    logger.error('PATCH /api/auth/tipo-cuenta error:', err);
    res.status(500).json({ error: 'No se pudo cambiar el tipo de cuenta' });
  }
});

// Refresh token endpoint — rotación one-time con detección de reuso
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = refreshDePeticion(req);

    if (!refreshToken) {
      return res.status(401).json({ error: 'Sesión no encontrada. Inicia sesión nuevamente.' });
    }

    const { JWT_REFRESH_SECRET } = getJWTSecrets();
    let decoded: { userId?: string; jti?: string };
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as {
        userId?: string;
        jti?: string;
      };
    } catch {
      borrarCookieRefresh(res);
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    if (!decoded.userId || !decoded.jti) {
      borrarCookieRefresh(res);
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const redis = safeRedis();
    if (!redis) {
      logger.error('[auth] Redis no disponible durante refresh — rechazando por seguridad');
      return res.status(503).json({ error: 'Servicio temporalmente no disponible' });
    }

    // Una sola transacción de Redis (MULTI): mirar si ya se había rotado,
    // consumir el jti (GETDEL) y marcarlo como rotado. Con GET y luego DEL, dos
    // peticiones simultáneas con el mismo token pasaban las dos; y con la marca
    // escrita en otro paso, la segunda podía consultarla antes de que existiera.
    const [yaRotado, storedUserId] = (await redis
      .multi()
      .get(`rt_rotado:${decoded.jti}`)
      .getDel(`rt:${decoded.jti}`)
      .setEx(`rt_rotado:${decoded.jti}`, GRACIA_ROTACION_SECONDS, '1')
      .exec()) as unknown as [string | null, string | null, unknown];

    if (!storedUserId || storedUserId !== decoded.userId) {
      if (yaRotado) {
        // Otra pestaña acaba de rotarlo: no es un robo. El navegador ya tiene la
        // cookie nueva, así que basta con reintentar.
        return res.status(409).json({ error: 'La sesión se está renovando', codigo: 'REFRESH_EN_CURSO' });
      }
      // Token reusado fuera de la gracia o revocado → invalidar toda la familia
      await revokeAllUserRefreshTokens(decoded.userId);
      borrarCookieRefresh(res);
      return res.status(401).json({ error: 'Sesión revocada. Inicia sesión nuevamente.' });
    }

    await redis.sRem(`rt_user:${decoded.userId}`, decoded.jti);

    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: decoded.userId },
    });

    if (!usuario || usuario.activo === false) {
      borrarCookieRefresh(res);
      return res.status(401).json({ error: 'Cuenta no encontrada o desactivada' });
    }

    // Generar nuevos tokens
    const newAccessToken = issueAccessToken(usuario);
    ponerCookieRefresh(res, await issueRefreshToken(usuario.id));

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    logger.error('POST /api/auth/refresh error:', err);
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
});

// Logout endpoint — revoca access (denylist jti) y refresh (cookie o cuerpo)
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { JWT_SECRET, JWT_REFRESH_SECRET } = getJWTSecrets();
    const redis = safeRedis();

    const accessToken = req.headers.authorization?.split(' ')[1];
    if (accessToken && redis) {
      try {
        const payload = jwt.verify(accessToken, JWT_SECRET, {
          algorithms: ['HS256'],
        }) as { jti?: string };
        if (payload.jti) {
          await redis.setEx(`deny:${payload.jti}`, ACCESS_TTL_SECONDS, '1');
        }
      } catch {
        // access token ya expirado/inválido: nada que revocar
      }
    }

    const refreshToken = refreshDePeticion(req);
    borrarCookieRefresh(res);
    if (refreshToken && redis) {
      try {
        const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
          algorithms: ['HS256'],
        }) as { userId?: string; jti?: string };
        if (payload.jti && payload.userId) {
          await redis.del(`rt:${payload.jti}`);
          await redis.sRem(`rt_user:${payload.userId}`, payload.jti);
        }
      } catch {
        // refresh inválido: nada que revocar
      }
    }

    res.json({ message: 'Logout exitoso' });
  } catch (err) {
    logger.error('POST /api/auth/logout error:', err);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

// Forgot password — genera token one-time en Redis (30-60 min) y envía email
router.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body ?? {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email es requerido' });
    }

    const normalized = email.trim().toLowerCase();
    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { email: normalized },
    });

    // Respuesta genérica para evitar enumeración de cuentas
    if (usuario && usuario.activo !== false) {
      const resetToken = randomBytes(32).toString('hex');
      const redis = safeRedis();
      if (redis) {
        await redis.setEx(`reset:${resetToken}`, RESET_TTL_SECONDS, usuario.id);
        if (isEmailAvailable()) {
          await sendPasswordResetEmail(normalized, resetToken);
        } else if (process.env.NODE_ENV === 'development') {
          // Solo en desarrollo local: nunca filtrar tokens de reseteo en logs de producción
          logger.info(
            `[auth] [DEV ONLY] Reset token para ${normalized}: /auth/reset-password?token=${resetToken} (expira en ${RESET_TTL_SECONDS / 60} min)`
          );
        } else {
          logger.warn(`[auth] Solicitud de reset para ${normalized} sin servicio de email configurado`);
        }
      } else {
        logger.error('[auth] Redis no disponible para reset-password');
      }
    }

    res.json({ message: 'Si el correo existe, enviaremos instrucciones para restablecer la contraseña' });
  } catch (err) {
    logger.error('POST /api/auth/forgot-password error:', err);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// Reset password — consume el token one-time y rota credenciales + sesiones
router.post('/reset-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body ?? {};
    if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
    }
    const errorPassword = errorDePassword(password);
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword });
    }

    const redis = safeRedis();
    if (!redis) {
      return res.status(503).json({ error: 'Servicio temporalmente no disponible' });
    }

    const userId = await redis.get(`reset:${token}`);
    if (!userId) {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    // Consumir token (one-time)
    await redis.del(`reset:${token}`);

    const usuarioRepo = AppDataSource.getRepository(Usuario);
    const usuario = await usuarioRepo.findOne({ where: { id: userId } });
    if (!usuario) {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    usuario.password_hash = await bcrypt.hash(password, BCRYPT_COST);
    await usuarioRepo.save(usuario);

    // Revocar todas las sesiones activas del usuario: los refresh tokens y,
    // con la marca de bloqueo, también los access tokens ya emitidos. Si alguien
    // cambia la contraseña porque le robaron la sesión, el ladrón no conserva
    // 15 minutos de acceso. La marca solo afecta a tokens emitidos hasta ahora.
    await revokeAllUserRefreshTokens(usuario.id);
    try {
      await redis.set(claveBloqueo(usuario.id), String(Math.floor(Date.now() / 1000)), { EX: ACCESS_TTL_SECONDS });
    } catch (err) {
      logger.error('[auth] No se pudo invalidar los access tokens tras el reset:', err);
    }
    borrarCookieRefresh(res);

    res.json({ message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' });
  } catch (err) {
    logger.error('POST /api/auth/reset-password error:', err);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
  }
});

// ─── Entrar y registrarse con Google ─────────────────────────────────────────
//
// GET /google lleva al navegador a Google; Google vuelve a GET /google/callback,
// que crea o enlaza la cuenta, pone la cookie del refresh token y redirige a la
// app (/auth/google), que canjea esa cookie por el access token como en un
// refresh normal. El token nunca viaja en una URL.

const COOKIE_GOOGLE = 'bi_google';

function opcionesCookieGoogle(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // `lax` basta: Google vuelve con una navegación GET de nivel superior.
    sameSite: 'lax',
    path: '/api/auth/google',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}



/** Métodos de acceso disponibles, para que la pantalla no muestre botones muertos. */
router.get('/proveedores', (_req: Request, res: Response) => {
  res.json({ google: loginGoogleConfigurado() });
});

router.get('/google', (req: Request, res: Response) => {
  const modo = req.query.modo === 'registro' ? 'registro' : 'login';
  const origen = modo === 'registro' ? '/auth/signup' : '/auth/login';
  if (!loginGoogleConfigurado()) return res.redirect(urlApp(origen, { error: 'google_no_disponible' }));

  const codigo = typeof req.query.codigo === 'string' ? req.query.codigo.trim().toUpperCase() : '';
  const nonce = randomBytes(16).toString('base64url');
  const { verificador, reto } = nuevoPkce();
  const state = firmarStateLogin(
    {
      modo,
      tipoCuenta: req.query.tipo === 'experto' ? 'experto' : 'negocio',
      codigoInvitacion: /^[A-Z0-9_-]{4,32}$/.test(codigo) ? codigo : null,
      // La casilla del formulario de registro. Sin ella no se crea una cuenta
      // nueva (sí se entra a una que ya existe).
      aceptaTerminos: req.query.acepta === '1',
    },
    nonce
  );
  res.cookie(COOKIE_GOOGLE, `${nonce}.${verificador}`, { ...opcionesCookieGoogle(), maxAge: VIGENCIA_LOGIN_MS });
  return res.redirect(urlAutorizacionLogin(state, nonce, reto));
});

type ResultadoGoogle = { usuario: Usuario; nuevo: boolean } | { error: string };

/**
 * La cuenta de un perfil de Google: primero por `google_sub`; si no, por email
 * (se enlaza: Google ya verificó que ese correo es suyo); si no, se crea.
 */
async function cuentaDeGoogle(perfil: PerfilGoogle, intento: IntentoGoogle, origen: OrigenPeticion): Promise<ResultadoGoogle> {
  const repo = AppDataSource.getRepository(Usuario);
  const porSub = await repo.findOne({ where: { google_sub: perfil.sub } });
  if (porSub) return { usuario: porSub, nuevo: false };

  const porEmail = await repo.findOne({ where: { email: perfil.email } });
  if (porEmail) {
    if (porEmail.google_sub && porEmail.google_sub !== perfil.sub) return { error: 'google_otra_cuenta' };
    await repo.update(porEmail.id, { google_sub: perfil.sub });
    porEmail.google_sub = perfil.sub;
    return { usuario: porEmail, nuevo: false };
  }

  // Cuenta nueva: hace falta la aceptación expresa del formulario de registro.
  // Desde «Iniciar sesión» no hay casilla, así que se manda a registrarse.
  if (!intento.aceptaTerminos) return { error: 'aceptacion_requerida' };

  let invitacion: InvitacionTrabajador | null = null;
  if (intento.codigoInvitacion) {
    const r = await validarInvitacion(intento.codigoInvitacion, perfil.email);
    if ('error' in r) return { error: 'invitacion_invalida' };
    invitacion = r.invitacion;
  }
  try {
    const usuario = await crearCuenta({
      email: perfil.email,
      // Contraseña que nadie conoce: entra con Google y, si algún día quiere
      // contraseña, la pone con «¿Olvidaste tu contraseña?».
      passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_COST),
      nombre: perfil.nombre ?? perfil.email.split('@')[0],
      tipoCuenta: intento.tipoCuenta,
      invitacion,
      googleSub: perfil.sub,
      aceptacion: { metodo: 'google', origen },
    });
    return { usuario, nuevo: true };
  } catch (err) {
    if (err instanceof InvitacionYaUsadaError) return { error: 'invitacion_invalida' };
    // Otra pestaña creó la misma cuenta a la vez: se entra con la que ganó.
    if ((err as { code?: string })?.code === '23505') {
      const ganadora = await repo.findOne({ where: { google_sub: perfil.sub } });
      if (ganadora) return { usuario: ganadora, nuevo: false };
    }
    throw err;
  }
}

router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const intento = verificarStateLogin(state);
  const origen = intento?.modo === 'registro' ? '/auth/signup' : '/auth/login';
  const fallar = (motivo: string) => {
    res.clearCookie(COOKIE_GOOGLE, opcionesCookieGoogle());
    return res.redirect(urlApp(origen, { error: motivo }));
  };

  if (error) return fallar(error === 'access_denied' ? 'oauth_denied' : 'google_failed');
  if (!intento || typeof code !== 'string' || !code) return fallar('session_expired');

  // El nonce del state tiene que ser el de la cookie de ESTE navegador.
  const [nonceCookie, verificador] = String(req.cookies?.[COOKIE_GOOGLE] ?? '').split('.');
  const a = Buffer.from(nonceCookie ?? '');
  const b = Buffer.from(intento.nonce);
  if (!verificador || a.length !== b.length || !timingSafeEqual(a, b)) return fallar('session_expired');
  if (!(await consumirStateLogin(state!))) return fallar('session_expired');

  try {
    const perfil = await perfilDesdeCodigo(code, verificador, intento.nonce);
    if (!perfil.emailVerificado) return fallar('email_no_verificado');

    const r = await cuentaDeGoogle(perfil, intento, origenDePeticion(req));
    if ('error' in r) return fallar(r.error);
    if (r.usuario.activo === false) return fallar('cuenta_desactivada');

    await limpiarIntentosFallidos(r.usuario.email);
    ponerCookieRefresh(res, await issueRefreshToken(r.usuario.id));
    res.clearCookie(COOKIE_GOOGLE, opcionesCookieGoogle());
    return res.redirect(urlApp('/auth/google', r.nuevo ? { nuevo: '1' } : {}));
  } catch (err) {
    if (err instanceof ErrorLoginGoogle) {
      logger.warn(`[auth] Login con Google rechazado: ${err.message}`);
      return fallar(err.codigo);
    }
    logger.error('GET /api/auth/google/callback error:', err);
    return fallar('google_failed');
  }
});

export default router;
