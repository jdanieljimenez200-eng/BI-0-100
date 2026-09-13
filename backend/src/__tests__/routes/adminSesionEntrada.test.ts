import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import {
  signupTestUser,
  hacerAdmin,
  cabeceras,
  codigoTotp,
  codigoFresco,
  type TestUser,
  type AdminTestUser,
} from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { redisClient } from '../../config/redis';

/**
 * Verificación en dos pasos: entrar con código, códigos de recuperación y
 * reconfirmación en acciones peligrosas. (Separado de adminSesion.test.ts por el
 * límite de registros por IP: cada fichero de test puede crear diez cuentas.)
 *
 * La propiedad central: la sesión normal de un admin —su contraseña, su token—
 * ya NO basta para entrar al panel. Hace falta un código de su app, que da un
 * token de admin aparte. Cada test ataca una forma distinta de saltárselo.
 */
describeWithDb('Verificación en dos pasos: entrada y reconfirmación', () => {
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

  describe('Entrada con código', () => {
    it('un código correcto da token; el mismo código dos veces, no', async () => {
      const admin = await hacerAdmin(await signupTestUser(), 'moderador');
      const codigo = codigoFresco(admin);

      const primera = await post('/verificar', admin, { codigo });
      expect(primera.status).toBe(200);
      expect(primera.body.token).toBeTruthy();

      const segunda = await post('/verificar', admin, { codigo });
      expect(segunda.status).toBe(401);
    });

    it('cinco fallos bloquean la cuenta, incluso para un código correcto', async () => {
      if (!redisClient?.isReady) return;
      const admin = await hacerAdmin(await signupTestUser(), 'soporte');

      for (let i = 0; i < 5; i++) {
        expect((await post('/verificar', admin, { codigo: String(100000 + i) })).status).toBe(401);
      }
      const bloqueado = await post('/verificar', admin, { codigo: codigoFresco(admin) });
      expect(bloqueado.status).toBe(429);
    });

    it('un código de recuperación vale una sola vez', async () => {
      const u = await adminSinEnrolar();
      const enrolar = await post('/enrolar', u, { password: u.password });
      const confirmar = await post('/enrolar/confirmar', u, { codigo: codigoTotp(enrolar.body.secreto) });
      const [codigo] = confirmar.body.codigos_recuperacion as string[];

      // Se acepta escrito con minúsculas y espacios: se copia a mano.
      const primera = await post('/verificar', u, { codigo_recuperacion: ` ${codigo.toLowerCase()} ` });
      expect(primera.status).toBe(200);
      expect(primera.body.codigos_restantes).toBe(9);

      const segunda = await post('/verificar', u, { codigo_recuperacion: codigo });
      expect(segunda.status).toBe(401);

      const [registro] = await AppDataSource.query(
        `SELECT accion FROM auditoria_admin WHERE recurso_id = $1 AND accion = 'admin.codigo_recuperacion_usado'`,
        [u.userId]
      );
      expect(registro).toBeDefined();
    });

    it('cerrar la sesión de admin invalida el token al momento', async () => {
      const admin = await hacerAdmin(await signupTestUser(), 'soporte');
      expect((await request.default(app).get('/api/admin/stats').set(cabeceras(admin))).status).toBe(200);

      await post('/cerrar', admin);
      const res = await request.default(app).get('/api/admin/stats').set(cabeceras(admin));
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('ADMIN_MFA_REQUERIDO');
    });
  });

  describe('Reconfirmación en lo peligroso', () => {
    it('cambiar un rol sin código fresco se rechaza, aunque el token de admin sea válido', async () => {
      const objetivo = await signupTestUser();
      const res = await request
        .default(app)
        .patch(`/api/admin/usuarios/${objetivo.userId}/rol`)
        .set(cabeceras(superadmin))
        .send({ rol: 'soporte', motivo: 'Sin reconfirmar no debe pasar' });
      expect(res.status).toBe(401);
      expect(res.body.codigo).toBe('TOTP_REQUERIDO');

      const [{ admin_rol }] = await AppDataSource.query(`SELECT admin_rol FROM usuarios WHERE id = $1`, [
        objetivo.userId,
      ]);
      expect(admin_rol).toBeNull();
    });

    it('un superadmin puede reiniciar el 2FA de otro, que tendrá que enrolarse y pierde su sesión', async () => {
      const actor = await hacerAdmin(await signupTestUser(), 'superadmin');
      const perdido = await hacerAdmin(await signupTestUser(), 'moderador');

      const res = await request
        .default(app)
        .post(`/api/admin/usuarios/${perdido.userId}/2fa/reiniciar`)
        .set({ ...cabeceras(actor), 'X-Admin-Totp': codigoFresco(actor) })
        .send({ motivo: 'Perdió el móvil y los códigos de recuperación' });
      expect(res.status).toBe(200);

      // Sus sesiones se cortan: si el móvil lo tiene otra persona, no sigue dentro.
      if (redisClient?.isReady) {
        expect((await request.default(app).get('/api/admin/stats').set(cabeceras(perdido))).status).toBe(401);
      }

      // Y puede volver a entrar: el bloqueo invalida los tokens anteriores, no los
      // nuevos. Se espera al segundo siguiente porque el `iat` del JWT va en
      // segundos y el bloqueo rechaza, por prudencia, lo emitido en su mismo segundo.
      await new Promise((r) => setTimeout(r, 1100));
      const login = await request.default(app).post('/api/auth/login').send({ email: perdido.email, password: perdido.password });
      expect(login.status).toBe(200);
      const estado = await request
        .default(app)
        .get('/api/admin/sesion/estado')
        .set({ Authorization: `Bearer ${login.body.accessToken}` });
      expect(estado.status).toBe(200);
      expect(estado.body.enrolado).toBe(false);
    });
  });
});
