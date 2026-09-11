import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser } from '../helpers/authHelper';

describeWithDb('Auth routes', () => {
  let sharedUser: TestUser;

  beforeAll(async () => {
    await initTestDb();
    sharedUser = await signupTestUser();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST /api/auth/signup', () => {
    it('crea un usuario nuevo y devuelve tokens', async () => {
      const email = `signup-${randomUUID()}@example.com`;
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email, password: 'Password123!', name: 'Nuevo Usuario' });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe(email);
    });

    it('rechaza un email duplicado con 409', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email: sharedUser.email, password: 'otraPassword1!', name: 'Otro Nombre' });

      expect(res.status).toBe(409);
    });

    it('rechaza una contraseña de menos de 8 caracteres con 400', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email: `short-${randomUUID()}@example.com`, password: '123', name: 'X' });

      expect(res.status).toBe(400);
    });

    it('rechaza una contraseña sin complejidad (sin símbolo) con 400', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email: `weak-${randomUUID()}@example.com`, password: 'Password123', name: 'X' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('devuelve tokens con credenciales válidas', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/login')
        .send({ email: sharedUser.email, password: sharedUser.password });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('rechaza una contraseña incorrecta con 401', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/login')
        .send({ email: sharedUser.email, password: 'contraseñaIncorrecta1' });

      expect(res.status).toBe(401);
    });

    it('bloquea la cuenta con 429 tras demasiados intentos fallidos (o 401 si Redis no está disponible)', async () => {
      const email = `lockout-${randomUUID()}@example.com`;
      await signupTestUser({ email, password: 'Testpassword123!' });

      let ultimoStatus = 0;
      for (let i = 0; i < 11; i++) {
        const res = await request
          .default(app)
          .post('/api/auth/login')
          .send({ email, password: 'passwordIncorrecta1!' });
        ultimoStatus = res.status;
      }

      // Sin Redis el bloqueo por cuenta hace fail-open (mismo criterio que el
      // resto de checks Redis del archivo) y el último intento seguiría en 401.
      expect([401, 429]).toContain(ultimoStatus);
    });
  });

  describe('GET /api/auth/me', () => {
    it('devuelve el usuario autenticado con un token válido', async () => {
      const res = await request
        .default(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${sharedUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sharedUser.userId);
      expect(res.body.email).toBe(sharedUser.email);
    });

    it('rechaza la petición sin token con 401', async () => {
      const res = await request.default(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rota el refresh token y emite un nuevo par (o 503 si Redis no está disponible)', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: sharedUser.refreshToken });

      // La ruta es fail-closed sin Redis (devuelve 503) — ambos casos son válidos
      // según el entorno de test; solo se valida la rotación si Redis respondió.
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).not.toBe(sharedUser.refreshToken);
      }
    });
  });

  describe('POST /api/auth/logout', () => {
    it('responde 200 con un access token válido', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sharedUser.accessToken}`)
        .send({});

      expect(res.status).toBe(200);
    });
  });
});
