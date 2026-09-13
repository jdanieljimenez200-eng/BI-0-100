import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';
import { redisClient } from '../../config/redis';

/**
 * Bloqueo inmediato y cambio de plan desde el panel de admin.
 *
 * El caso que importa: a un usuario se le desactiva mientras tiene la sesión
 * abierta. Antes su access token seguía valiendo hasta caducar (15 min), así
 * que "bloquear" a alguien que está dentro no lo sacaba.
 */
describeWithDb('Panel de admin: bloqueo y plan', () => {
  let admin: TestUser;
  let victima: TestUser;

  const auth = (t: TestUser) => ({ Authorization: `Bearer ${t.accessToken}` });
  const usuarios = () => AppDataSource.getRepository(Usuario);

  beforeAll(async () => {
    await initTestDb();
    admin = await signupTestUser();
    victima = await signupTestUser();
    await usuarios().update({ id: admin.userId }, { es_admin: true });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // Sin Redis no hay forma de invalidar un token ya emitido; el test lo dice en
  // vez de pasar en falso.
  const conRedis = () => Boolean(redisClient?.isReady);

  describe('Desactivar corta la sesión al momento', () => {
    it('antes de desactivar, el token de la víctima funciona', async () => {
      const res = await request.default(app).get('/api/network/mis-fichas').set(auth(victima));
      expect(res.status).toBe(200);
    });

    it('al desactivar, el MISMO access token deja de valer en la siguiente petición', async () => {
      if (!conRedis()) {
        console.warn('Redis no disponible: no se puede comprobar el bloqueo inmediato');
        return;
      }

      const res = await request
        .default(app)
        .patch(`/api/admin/usuarios/${victima.userId}/activo`)
        .set(auth(admin))
        .send({ activo: false, motivo: 'Prueba automatizada de bloqueo' });
      expect(res.status).toBe(200);
      expect(res.body.sesiones_cerradas).toBe(true);

      const reintento = await request.default(app).get('/api/network/mis-fichas').set(auth(victima));
      expect(reintento.status).toBe(401);
    });

    it('tampoco puede renovar la sesión con su refresh token', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: victima.refreshToken });
      expect(res.status).toBe(401);
    });

    it('al reactivar puede volver a entrar con una sesión nueva', async () => {
      await request
        .default(app)
        .patch(`/api/admin/usuarios/${victima.userId}/activo`)
        .set(auth(admin))
        .send({ activo: true });

      const login = await request
        .default(app)
        .post('/api/auth/login')
        .send({ email: victima.email, password: victima.password });
      expect(login.status).toBe(200);

      const res = await request
        .default(app)
        .get('/api/network/mis-fichas')
        .set({ Authorization: `Bearer ${login.body.accessToken}` });
      expect(res.status).toBe(200);
    });

    it('desactivar a un usuario que no existe responde 404, no un "hecho" en falso', async () => {
      const res = await request
        .default(app)
        .patch('/api/admin/usuarios/00000000-0000-4000-8000-000000000000/activo')
        .set(auth(admin))
        .send({ activo: false, motivo: 'Prueba automatizada de bloqueo' });
      expect(res.status).toBe(404);
    });
  });

  describe('Cambio de plan', () => {
    it('sin suscripción de Stripe, el cambio se aplica', async () => {
      const res = await request
        .default(app)
        .patch(`/api/admin/usuarios/${victima.userId}/plan`)
        .set(auth(admin))
        .send({ plan: 'pro', motivo: 'Cortesía de prueba automatizada' });
      expect(res.status).toBe(200);
      expect((await usuarios().findOneByOrFail({ id: victima.userId })).plan).toBe('pro');
    });

    it('con suscripción de Stripe activa, se rechaza: Stripe lo revertiría', async () => {
      await usuarios().update({ id: victima.userId }, { stripe_subscription_id: 'sub_test_admin' });

      const res = await request
        .default(app)
        .patch(`/api/admin/usuarios/${victima.userId}/plan`)
        .set(auth(admin))
        .send({ plan: 'business', motivo: 'Cortesía de prueba automatizada' });
      expect(res.status).toBe(409);
      expect((await usuarios().findOneByOrFail({ id: victima.userId })).plan).toBe('pro');

      await usuarios().update({ id: victima.userId }, { stripe_subscription_id: null as unknown as string });
    });
  });
});
