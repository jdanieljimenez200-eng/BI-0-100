import * as request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import {
  signupTestUser,
  hacerAdmin,
  cabeceras,
  codigoTotp,
  type TestUser,
  type AdminTestUser,
} from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';

/**
 * Verificación en dos pasos del panel de administración.
 *
 * La propiedad central: la sesión normal de un admin —su contraseña, su token—
 * ya NO basta para entrar al panel. Hace falta un código de su app, que da un
 * token de admin aparte. Cada test ataca una forma distinta de saltárselo.
 */
describeWithDb('Verificación en dos pasos del panel', () => {
  let superadmin: AdminTestUser;

  const post = (ruta: string, user: TestUser, body: Record<string, unknown> = {}, extra: Record<string, string> = {}) =>
    request
      .default(app)
      .post(`/api/admin/sesion${ruta}`)
      .set({ ...cabeceras(user), ...extra })
      .send(body);

  /** Admin con rol pero sin enrolar todavía. */
  async function adminSinEnrolar(): Promise<TestUser> {
    const u = await signupTestUser();
    await AppDataSource.query(`UPDATE usuarios SET admin_rol = 'soporte' WHERE id = $1`, [u.userId]);
    return u;
  }

  beforeAll(async () => {
    await initTestDb();
    superadmin = await hacerAdmin(await signupTestUser(), 'superadmin');
  }, 60_000);

  afterAll(async () => {
    await closeTestDb();
  });

  describe('La sesión normal ya no basta', () => {
    it('un admin con sesión pero sin token de admin no entra', async () => {
      const u = await adminSinEnrolar();
      const res = await request.default(app).get('/api/admin/stats').set(cabeceras(u));
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('ADMIN_MFA_REQUERIDO');
    });

    it('con token de admin, sí', async () => {
      const res = await request.default(app).get('/api/admin/stats').set(cabeceras(superadmin));
      expect(res.status).toBe(200);
    });

    it('el token de admin de otra persona no sirve con mi sesión', async () => {
      const otro = await hacerAdmin(await signupTestUser(), 'soporte');
      const res = await request
        .default(app)
        .get('/api/admin/stats')
        .set({ Authorization: `Bearer ${otro.accessToken}`, 'X-Admin-Token': superadmin.adminToken });
      expect(res.status).toBe(403);
    });

    it('un token de admin firmado con otra clave no sirve', async () => {
      const falso = jwt.sign(
        { sub: superadmin.userId, typ: 'admin', mfa: true, jti: 'x' },
        'clave-que-no-es-la-del-servidor-0123456789'
      );
      const res = await request
        .default(app)
        .get('/api/admin/stats')
        .set({ ...cabeceras(superadmin), 'X-Admin-Token': falso });
      expect(res.status).toBe(403);
    });

    it('el navegador puede enviar las cabeceras de admin (preflight CORS)', async () => {
      // Supertest no aplica CORS: sin este test, que el navegador bloqueara las
      // cabeceras X-Admin-* solo se vería al abrir el panel de verdad (y pasó).
      const res = await request
        .default(app)
        .options('/api/admin/stats')
        .set('Origin', process.env.FRONTEND_URL || 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'PATCH')
        .set('Access-Control-Request-Headers', 'authorization,x-admin-token,x-admin-totp');
      const permitidas = String(res.headers['access-control-allow-headers'] ?? '').toLowerCase();
      expect(permitidas).toContain('x-admin-token');
      expect(permitidas).toContain('x-admin-totp');
    });

    it('el access token normal no se puede usar como token de admin', async () => {
      const res = await request
        .default(app)
        .get('/api/admin/stats')
        .set({ ...cabeceras(superadmin), 'X-Admin-Token': superadmin.accessToken });
      expect(res.status).toBe(403);
    });
  });

  describe('Enrolamiento', () => {
    it('exige la contraseña aunque haya sesión', async () => {
      const u = await adminSinEnrolar();
      expect((await post('/enrolar', u)).status).toBe(401);
      expect((await post('/enrolar', u, { password: 'no-es-la-contraseña' })).status).toBe(401);
    });

    it('un usuario sin rol de admin no puede enrolarse', async () => {
      const normal = await signupTestUser();
      const res = await post('/enrolar', normal, { password: normal.password });
      expect(res.status).toBe(403);
    });

    it('el secreto se guarda cifrado, nunca en claro', async () => {
      const u = await adminSinEnrolar();
      const res = await post('/enrolar', u, { password: u.password });
      expect(res.status).toBe(200);
      expect(res.body.qr).toMatch(/^data:image\/png;base64,/);

      const [{ admin_totp_secreto }] = await AppDataSource.query(
        `SELECT admin_totp_secreto FROM usuarios WHERE id = $1`,
        [u.userId]
      );
      expect(admin_totp_secreto).toMatch(/^v1\./);
      expect(admin_totp_secreto).not.toContain(res.body.secreto);
    });

    it('un código incorrecto no activa la verificación', async () => {
      const u = await adminSinEnrolar();
      await post('/enrolar', u, { password: u.password });
      const res = await post('/enrolar/confirmar', u, { codigo: '000000' });
      expect(res.status).toBe(401);

      const estado = await request.default(app).get('/api/admin/sesion/estado').set(cabeceras(u));
      expect(estado.body.enrolado).toBe(false);
    });

    it('al confirmar da diez códigos de recuperación, que se guardan hasheados', async () => {
      const u = await adminSinEnrolar();
      const enrolar = await post('/enrolar', u, { password: u.password });
      const res = await post('/enrolar/confirmar', u, { codigo: codigoTotp(enrolar.body.secreto) });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.codigos_recuperacion).toHaveLength(10);

      const filas: { hash: string }[] = await AppDataSource.query(
        `SELECT hash FROM admin_codigos_recuperacion WHERE usuario_id = $1`,
        [u.userId]
      );
      expect(filas).toHaveLength(10);
      for (const codigo of res.body.codigos_recuperacion) {
        expect(filas.some((f) => f.hash.includes(codigo))).toBe(false);
      }
    });

    it('una vez activa, no se puede re-enrolar desde la propia cuenta', async () => {
      const res = await post('/enrolar', superadmin, { password: superadmin.password });
      expect(res.status).toBe(409);
    });
  });
});
