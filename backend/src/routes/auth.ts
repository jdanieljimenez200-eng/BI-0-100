import { Router, Request, Response, CookieOptions } from 'express';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { InvitacionTrabajador } from '../models/InvitacionTrabajador';
import { AsignacionTrabajador } from '../models/AsignacionTrabajador';
import { computePermisosEfectivos } from '../services/billing/planService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'crypto';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { isEmailAvailable, sendPasswordResetEmail } from '../services/email/emailService';
import { loginLimiter, signupLimiter, passwordResetLimiter } from '../middleware/cors';
import { authenticate, AuthRequest, claveBloqueo } from '../middleware/auth';

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
      const invRepo = AppDataSource.getRepository(InvitacionTrabajador);
      const inv = await invRepo.findOne({ where: { codigo: codigoInvitacion } });
      if (!inv) {
        return res.status(400).json({ error: 'Código de invitación inválido' });
      }
      if (inv.usado_por) {
        return res.status(400).json({ error: 'Este código de invitación ya fue utilizado' });
      }
      if (new Date() > new Date(inv.expira_en)) {
        return res.status(400).json({ error: 'El código de invitación ha expirado' });
      }
      if (inv.email_destino && inv.email_destino.trim().toLowerCase() !== email) {
        return res.status(400).json({ error: 'Este código de invitación está restringido a otro correo' });
      }
      invitacionValida = inv;
    }

    // Hash password (cost 12)
    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    // Crear usuario dentro de transacción si hay invitación para marcarla como usada atómicamente
    let usuario: Usuario;
    try {
      usuario = await AppDataSource.transaction(async (manager) => {
        const u = manager.create(Usuario, {
          email,
          password_hash: hashedPassword,
          nombre: name.trim(),
          account_role: invitacionValida ? 'trabajador' : 'owner',
          owner_id: invitacionValida ? invitacionValida.cuenta_id : undefined,
          plan: 'freemium',
          // Un colaborador invitado entra a la cuenta de un negocio, elija lo que elija.
          tipo_cuenta: !invitacionValida && req.body.tipo_cuenta === 'experto' ? 'experto' : 'negocio',
          analisis_disponibles: 0,
          creditos_marketing: 0,
        });
        await manager.save(Usuario, u);

        if (invitacionValida) {
          // Consumo atómico: la comprobación `usado_por` de arriba se leyó sin
          // bloqueo y dos altas simultáneas con el mismo código la pasaban las
          // dos. Solo una de estas UPDATE afecta a la fila; la otra revierte su alta.
          const consumo = await manager
            .createQueryBuilder()
            .update(InvitacionTrabajador)
            .set({ usado_por: u.id, usado_en: new Date() })
            .where('id = :id AND usado_por IS NULL', { id: invitacionValida.id })
            .execute();
          if (consumo.affected !== 1) throw new InvitacionYaUsadaError();
        }
        return u;
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

export default router;
