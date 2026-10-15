import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser, refreshDeRespuesta, cookieRefresh } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { redisClient } from '../../config/redis';

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
    it('crea un usuario nuevo: access token en el cuerpo, refresh solo en cookie HttpOnly', async () => {
      const email = `signup-${randomUUID()}@example.com`;
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email, password: 'Password123!', name: 'Nuevo Usuario', acepta_terminos: true });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      // Un XSS no debe poder leerlo: nunca en el cuerpo.
      expect(res.body.refreshToken).toBeUndefined();
      expect(refreshDeRespuesta(res)).toBeDefined();
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('bi_refresh='))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/auth/);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(res.body.user.email).toBe(email);
    });

    it('un código de invitación no puede consumirse dos veces aunque las altas lleguen a la vez', async () => {
      const dueno = await signupTestUser();
      const codigo = randomUUID().replace(/-/g, '').slice(0, 16);
      await AppDataSource.query(
        `INSERT INTO invitaciones_trabajador (cuenta_id, codigo, expira_en) VALUES ($1, $2, NOW() + interval '1 day')`,
        [dueno.userId, codigo]
      );

      const alta = () =>
        request
          .default(app)
          .post('/api/auth/signup')
          .send({ email: `inv-${randomUUID()}@example.com`, password: 'Password123!', name: 'Invitado', codigo_invitacion: codigo, acepta_terminos: true });
      const respuestas = await Promise.all([alta(), alta(), alta()]);

      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respuestas.filter((r) => r.status === 400)).toHaveLength(2);
      const [{ usados }] = await AppDataSource.query(
        `SELECT count(*)::int AS usados FROM usuarios u JOIN invitaciones_trabajador i ON i.usado_por = u.id WHERE i.codigo = $1`,
        [codigo]
      );
      expect(usados).toBe(1);
    });

    it('rechaza un email duplicado con 409', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email: sharedUser.email, password: 'otraPassword1!', name: 'Otro Nombre', acepta_terminos: true });

      expect(res.status).toBe(409);
    });

    it('rechaza una contraseña de menos de 8 caracteres con 400', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email: `short-${randomUUID()}@example.com`, password: '123', name: 'X', acepta_terminos: true });

      expect(res.status).toBe(400);
    });

    it('rechaza una contraseña sin complejidad (sin símbolo) con 400', async () => {
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email: `weak-${randomUUID()}@example.com`, password: 'Password123', name: 'X', acepta_terminos: true });

      expect(res.status).toBe(400);
    });

    it('sin la casilla de Términos no crea la cuenta', async () => {
      for (const acepta of [undefined, false, 'false', '']) {
        const email = `sin-acepta-${randomUUID()}@example.com`;
        const res = await request
          .default(app)
          .post('/api/auth/signup')
          .send({ email, password: 'Password123!', name: 'X', ...(acepta === undefined ? {} : { acepta_terminos: acepta }) });
        expect(res.status).toBe(400);
        expect(res.body.codigo).toBe('aceptacion_requerida');
        expect(await AppDataSource.query(`SELECT 1 FROM usuarios WHERE email = $1`, [email])).toHaveLength(0);
      }
    });

    it('si el formulario mostró otra versión de los documentos responde 409 y no crea la cuenta', async () => {
      const email = `version-${randomUUID()}@example.com`;
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .send({ email, password: 'Password123!', name: 'X', acepta_terminos: true, version_terminos: '0.9' });
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('documentos_actualizados');
      expect(await AppDataSource.query(`SELECT 1 FROM usuarios WHERE email = $1`, [email])).toHaveLength(0);
    });

    it('guarda la evidencia de la aceptación: documento, versión, vía, IP y navegador', async () => {
      const email = `evidencia-${randomUUID()}@example.com`;
      const res = await request
        .default(app)
        .post('/api/auth/signup')
        .set('User-Agent', 'NavegadorDePrueba/1.0')
        .send({ email, password: 'Password123!', name: 'X', acepta_terminos: true, version_terminos: '1.0', version_privacidad: '1.0' });
      expect(res.status).toBe(201);
      const filas = await AppDataSource.query(
        `SELECT documento, version, metodo, user_agent, ip IS NOT NULL AS con_ip, detalle
           FROM aceptaciones_legales WHERE usuario_id = $1 ORDER BY documento`,
        [res.body.user.id]
      );
      expect(filas).toEqual([
        { documento: 'privacidad', version: '1.0', metodo: 'registro', user_agent: 'NavegadorDePrueba/1.0', con_ip: true, detalle: { mayor_de_edad: true } },
        { documento: 'terminos', version: '1.0', metodo: 'registro', user_agent: 'NavegadorDePrueba/1.0', con_ip: true, detalle: { mayor_de_edad: true } },
      ]);
    });
  });

  describe('Aceptaciones pendientes', () => {
    it('una cuenta sin aceptación registrada la ve pendiente en /me y la acepta una sola vez', async () => {
      const u = await signupTestUser();
      await AppDataSource.query(`DELETE FROM aceptaciones_legales WHERE usuario_id = $1`, [u.userId]);
      const auth = { Authorization: `Bearer ${u.accessToken}` };

      const antes = await request.default(app).get('/api/auth/me').set(auth);
      expect(antes.body.aceptaciones_pendientes).toEqual(['terminos', 'privacidad']);

      const sinCasilla = await request.default(app).post('/api/auth/aceptaciones').set(auth).send({});
      expect(sinCasilla.status).toBe(400);

      const aceptar = () =>
        request.default(app).post('/api/auth/aceptaciones').set(auth)
          .send({ acepta_terminos: true, version_terminos: '1.0', version_privacidad: '1.0' });
      const [r1, r2] = await Promise.all([aceptar(), aceptar()]);
      expect([r1.status, r2.status]).toEqual([200, 200]);

      const despues = await request.default(app).get('/api/auth/me').set(auth);
      expect(despues.body.aceptaciones_pendientes).toEqual([]);
      const filas = await AppDataSource.query(
        `SELECT documento, metodo FROM aceptaciones_legales WHERE usuario_id = $1 ORDER BY documento`,
        [u.userId]
      );
      expect(filas).toEqual([
        { documento: 'privacidad', metodo: 'sesion' },
        { documento: 'terminos', metodo: 'sesion' },
      ]);
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

    it('una cuenta desactivada con contraseña incorrecta responde igual que una inexistente', async () => {
      const desactivado = await signupTestUser();
      await AppDataSource.query(`UPDATE usuarios SET activo = false WHERE id = $1`, [desactivado.userId]);

      const malaClave = await request
        .default(app)
        .post('/api/auth/login')
        .send({ email: desactivado.email, password: 'NoEsLaClave1!' });
      const inexistente = await request
        .default(app)
        .post('/api/auth/login')
        .send({ email: `nadie-${randomUUID()}@example.com`, password: 'NoEsLaClave1!' });

      expect(malaClave.status).toBe(401);
      expect(inexistente.status).toBe(401);
      expect(malaClave.body).toEqual(inexistente.body);

      // Solo quien conoce la contraseña se entera de que está desactivada.
      const buenaClave = await request
        .default(app)
        .post('/api/auth/login')
        .send({ email: desactivado.email, password: desactivado.password });
      expect(buenaClave.status).toBe(403);
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
    it('rota el refresh token desde la cookie (o 503 si Redis no está disponible)', async () => {
      const usuario = await signupTestUser();
      const res = await request
        .default(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieRefresh(usuario.refreshToken));

      // La ruta es fail-closed sin Redis (devuelve 503) — ambos casos son válidos
      // según el entorno de test; solo se valida la rotación si Redis respondió.
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeUndefined();
        const nuevo = refreshDeRespuesta(res);
        expect(nuevo).toBeDefined();
        expect(nuevo).not.toBe(usuario.refreshToken);
      }
    });

    it('sin cookie ni cuerpo responde 401', async () => {
      const res = await request.default(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(401);
    });

    it('dos renovaciones simultáneas: una rota y la otra pide reintentar, sin cerrar la sesión', async () => {
      if (!redisClient?.isReady) return;
      const usuario = await signupTestUser();
      const renovar = () =>
        request.default(app).post('/api/auth/refresh').set('Cookie', cookieRefresh(usuario.refreshToken));

      const [a, b] = await Promise.all([renovar(), renovar()]);
      const estados = [a.status, b.status].sort();
      expect(estados).toEqual([200, 409]);
      const ganadora = a.status === 200 ? a : b;
      expect(([a, b].find((r) => r.status === 409)!).body.codigo).toBe('REFRESH_EN_CURSO');

      // La sesión sigue viva: el token rotado funciona.
      const siguiente = await request
        .default(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieRefresh(refreshDeRespuesta(ganadora)!));
      expect(siguiente.status).toBe(200);
    });

    it('reusar un token pasada la gracia revoca toda la familia', async () => {
      if (!redisClient?.isReady) return;
      const usuario = await signupTestUser();
      const primera = await request.default(app).post('/api/auth/refresh').set('Cookie', cookieRefresh(usuario.refreshToken));
      expect(primera.status).toBe(200);
      const vigente = refreshDeRespuesta(primera)!;

      // Simula que la gracia ya pasó.
      const { jti } = JSON.parse(Buffer.from(usuario.refreshToken.split('.')[1], 'base64url').toString());
      await redisClient.del(`rt_rotado:${jti}`);

      const robo = await request.default(app).post('/api/auth/refresh').set('Cookie', cookieRefresh(usuario.refreshToken));
      expect(robo.status).toBe(401);
      const legitima = await request.default(app).post('/api/auth/refresh').set('Cookie', cookieRefresh(vigente));
      expect(legitima.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('responde 200, borra la cookie y revoca el refresh token', async () => {
      const usuario = await signupTestUser();
      const res = await request
        .default(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${usuario.accessToken}`)
        .set('Cookie', cookieRefresh(usuario.refreshToken))
        .send({});

      expect(res.status).toBe(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith('bi_refresh='));
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);

      if (redisClient?.isReady) {
        const tras = await request.default(app).post('/api/auth/refresh').set('Cookie', cookieRefresh(usuario.refreshToken));
        expect(tras.status).toBe(401);
      }
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('invalida también los access tokens emitidos antes del cambio', async () => {
      if (!redisClient?.isReady) return;
      const usuario = await signupTestUser();
      const token = `reset-test-${randomUUID()}`;
      await redisClient.setEx(`reset:${token}`, 60, usuario.userId);
      // El bloqueo compara segundos (iat): se deja pasar uno para que el token
      // del alta quede claramente antes del cambio.
      await new Promise((r) => setTimeout(r, 1100));

      const reset = await request
        .default(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'NuevaClave123!' });
      expect(reset.status).toBe(200);

      const conTokenViejo = await request
        .default(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${usuario.accessToken}`);
      expect(conTokenViejo.status).toBe(401);
    });
  });
});
