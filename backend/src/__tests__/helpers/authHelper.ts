import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { app } from './testApp';

export interface TestUser {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  password: string;
}

/**
 * Crea un usuario real vía POST /api/auth/signup y devuelve sus tokens.
 * Usa un email aleatorio por llamada para no colisionar con el constraint
 * único de `email` entre ejecuciones/tests distintos.
 */
export async function signupTestUser(
  overrides: Partial<{ email: string; password: string; name: string }> = {}
): Promise<TestUser> {
  const email = overrides.email ?? `test-${randomUUID()}@example.com`;
  const password = overrides.password ?? 'Testpassword123!';
  const name = overrides.name ?? 'Test User';

  const response = await request.default(app).post('/api/auth/signup').send({ email, password, name });

  if (response.status !== 201) {
    throw new Error(
      `signupTestUser: signup falló con status ${response.status}: ${JSON.stringify(response.body)}`
    );
  }

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
    userId: response.body.user.id,
    email,
    password,
  };
}

// ─── Admin con verificación en dos pasos ─────────────────────────────────────

export interface AdminTestUser extends TestUser {
  /** Token de admin (cabecera X-Admin-Token), obtenido con un código TOTP real. */
  adminToken: string;
  /** Secreto TOTP en claro, para generar códigos frescos en los tests. */
  totpSecreto: string;
  /** Códigos ya gastados: el servidor no acepta el mismo dos veces. */
  codigosUsados: Set<string>;
}

/**
 * Convierte un usuario de test en admin por el camino de verdad: asigna el rol,
 * se enrola con su contraseña, escanea (lee el secreto), confirma con un código
 * y recibe el token de admin. Así los tests pasan por las mismas comprobaciones
 * que una persona, en vez de saltárselas.
 */
export async function hacerAdmin(
  user: TestUser,
  rol: 'soporte' | 'moderador' | 'superadmin' = 'superadmin'
): Promise<AdminTestUser> {
  // Import perezoso: los tests que no usan admin no cargan la base aquí.
  const { AppDataSource } = await import('../../config/database');
  await AppDataSource.query(`UPDATE usuarios SET admin_rol = $1 WHERE id = $2`, [rol, user.userId]);

  const enrolar = await request
    .default(app)
    .post('/api/admin/sesion/enrolar')
    .set({ Authorization: `Bearer ${user.accessToken}` })
    .send({ password: user.password });
  if (enrolar.status !== 200) {
    throw new Error(`hacerAdmin: enrolar falló con ${enrolar.status}: ${JSON.stringify(enrolar.body)}`);
  }

  const secreto: string = enrolar.body.secreto;
  const primerCodigo = codigoTotp(secreto);
  const confirmar = await request
    .default(app)
    .post('/api/admin/sesion/enrolar/confirmar')
    .set({ Authorization: `Bearer ${user.accessToken}` })
    .send({ codigo: primerCodigo });
  if (confirmar.status !== 200) {
    throw new Error(`hacerAdmin: confirmar falló con ${confirmar.status}: ${JSON.stringify(confirmar.body)}`);
  }

  return {
    ...user,
    adminToken: confirmar.body.token,
    totpSecreto: secreto,
    codigosUsados: new Set([primerCodigo]),
  };
}

/**
 * Un código que este admin aún no ha gastado. El servidor acepta el paso actual
 * y los dos vecinos, así que hay como mucho tres por ventana de 30 s: un test que
 * necesite más debe usar otro admin en vez de esperar.
 */
export function codigoFresco(admin: AdminTestUser): string {
  for (const pasos of [0, 1, -1]) {
    const codigo = codigoTotp(admin.totpSecreto, pasos);
    if (!admin.codigosUsados.has(codigo)) {
      admin.codigosUsados.add(codigo);
      return codigo;
    }
  }
  throw new Error('codigoFresco: este admin no tiene más códigos en esta ventana; usa otro admin');
}

/**
 * Código TOTP para el secreto. `pasos` desplaza la ventana de 30 s: el servidor
 * acepta ±1 paso, así que 1 y -1 dan códigos válidos y DISTINTOS del actual, útiles
 * cuando el actual ya se gastó (un código no vale dos veces).
 */
export function codigoTotp(secreto: string, pasos = 0): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { authenticator } = require('otplib');
  return authenticator.clone({ epoch: Date.now() + pasos * 30_000 }).generate(secreto);
}

/** Cabeceras de una petición: sesión normal y, si es admin, su token de admin. */
export function cabeceras(user: TestUser | AdminTestUser): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${user.accessToken}` };
  if ('adminToken' in user && user.adminToken) h['X-Admin-Token'] = user.adminToken;
  return h;
}
