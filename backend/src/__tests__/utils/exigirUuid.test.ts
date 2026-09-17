import express, { Router } from 'express';
import request from 'supertest';
import { exigirUuid, esUuid } from '../../middleware/validate';

/**
 * Un id que no es UUID llegaba a Postgres, que lo rechaza con 22P02, y la API
 * respondía 500. Debe ser un 400 antes de tocar la base.
 */
describe('exigirUuid', () => {
  const handler = jest.fn((_req, res) => res.json({ ok: true }));
  const app = express();
  const router = Router();
  router.use((req, res, next) => (req.headers.authorization ? next() : res.status(401).json({ error: 'sin sesión' })));
  exigirUuid(router, 'id', 'productoId');
  router.get('/:id', handler);
  router.get('/producto/:productoId/estado', handler);
  app.use('/api/cosas', router);

  const ID = '0b9f8a3c-1d2e-4f5a-8b6c-7d8e9f0a1b2c';
  beforeEach(() => handler.mockClear());

  it('deja pasar un UUID', async () => {
    const res = await request(app).get(`/api/cosas/${ID}`).set('Authorization', 'x');
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('responde 400 sin llegar al handler si no es UUID', async () => {
    const res = await request(app).get('/api/cosas/abc').set('Authorization', 'x');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id/);
    expect(handler).not.toHaveBeenCalled();
  });

  it('valida cada parámetro por su nombre', async () => {
    const res = await request(app).get("/api/cosas/producto/1' OR 1=1/estado").set('Authorization', 'x');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/productoId/);
  });

  it('sin sesión sigue respondiendo 401 antes de validar', async () => {
    const res = await request(app).get('/api/cosas/abc');
    expect(res.status).toBe(401);
  });

  it('esUuid acepta mayúsculas y rechaza lo demás', () => {
    expect(esUuid(ID.toUpperCase())).toBe(true);
    expect(esUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(esUuid(`${ID}x`)).toBe(false);
    expect(esUuid(123)).toBe(false);
  });
});
