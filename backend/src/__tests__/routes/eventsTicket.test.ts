import http from 'http';
import type { AddressInfo } from 'net';
import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser } from '../helpers/authHelper';
import { redisClient } from '../../config/redis';

/** Abre el stream y devuelve el status y el primer bloque recibido. */
function abrirStream(base: string, ruta: string): Promise<{ status: number; primerBloque: string }> {
  return new Promise((resolver, rechazar) => {
    const req = http.get(`${base}${ruta}`, (res) => {
      res.setEncoding('utf8');
      res.once('data', (bloque: string) => {
        resolver({ status: res.statusCode ?? 0, primerBloque: bloque });
        req.destroy();
      });
    });
    req.on('error', (err) => ((err as NodeJS.ErrnoException).code === 'ECONNRESET' ? undefined : rechazar(err)));
  });
}

/**
 * EventSource no permite cabeceras y el access token viajaba en `?token=`,
 * donde acaba en logs de proxies. Ahora se abre con un ticket de un solo uso.
 */
describeWithDb('SSE con ticket de un solo uso', () => {
  let usuario: TestUser;
  let servidor: http.Server;
  let base: string;

  beforeAll(async () => {
    await initTestDb();
    usuario = await signupTestUser();
    servidor = app.listen(0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await closeTestDb();
  });

  it('el ticket exige sesión', async () => {
    const res = await request.default(app).post('/api/events/ticket');
    expect(res.status).toBe(401);
  });

  it('abre el stream con el ticket y el ticket no sirve dos veces', async () => {
    if (!redisClient?.isReady) return;
    const { body, status } = await request
      .default(app)
      .post('/api/events/ticket')
      .set('Authorization', `Bearer ${usuario.accessToken}`);
    expect(status).toBe(200);
    expect(body.ticket).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    const primera = await abrirStream(base, `/events?ticket=${body.ticket}`);
    expect(primera.status).toBe(200);
    expect(primera.primerBloque).toContain('"status":"connected"');

    const reuso = await request.default(app).get(`/api/events?ticket=${body.ticket}`);
    expect(reuso.status).toBe(401);
  });

  it('un JWT en la query ya no abre el stream', async () => {
    const res = await request.default(app).get(`/api/events?token=${usuario.accessToken}`);
    expect(res.status).toBe(401);
  });
});
