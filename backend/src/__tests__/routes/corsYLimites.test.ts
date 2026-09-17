const mockRedis: { isReady: boolean; multi: jest.Mock; decr: jest.Mock; del: jest.Mock } = {
  isReady: false,
  multi: jest.fn(),
  decr: jest.fn(async () => 0),
  del: jest.fn(async () => 1),
};

jest.mock('../../config/database', () => ({ AppDataSource: { isInitialized: false, query: jest.fn() } }));
jest.mock('../../config/redis', () => ({ redisClient: mockRedis, initRedis: jest.fn() }));

import request from 'supertest';
import type { Options } from 'express-rate-limit';
import app from '../../app';
import { AlmacenLimiteRedis } from '../../middleware/cors';

/** Antes, un origen no listado producía un 500 con el error de CORS. */
describe('CORS', () => {
  it('un origen no permitido recibe 403 y no llega a la ruta', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Origen no permitido' });

    const post = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({});
    expect(post.status).toBe(403);
  });

  it('el frontend permitido pasa el preflight con credenciales', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('las peticiones sin Origin (servidor a servidor) no se ven afectadas', async () => {
    const res = await request(app).get('/api/billing/planes');
    expect(res.status).toBe(200);
  });
});

/**
 * Con el almacén en memoria cada réplica contaba por su lado y cada deploy
 * reiniciaba los contadores. Ahora cuentan en Redis, con memoria de respaldo.
 */
describe('AlmacenLimiteRedis', () => {
  const opciones = { windowMs: 60_000 } as Options;

  beforeEach(() => {
    mockRedis.isReady = false;
    mockRedis.multi.mockReset();
  });

  it('cuenta en Redis con una ventana que se abre una sola vez', async () => {
    mockRedis.isReady = true;
    const cadena = {
      set: jest.fn().mockReturnThis(),
      incr: jest.fn().mockReturnThis(),
      pTTL: jest.fn().mockReturnThis(),
      exec: jest.fn(async () => [null, 3, 42_000]),
    };
    mockRedis.multi.mockReturnValue(cadena);

    const almacen = new AlmacenLimiteRedis('login');
    almacen.init(opciones);
    const r = await almacen.increment('1.2.3.4');

    expect(r.totalHits).toBe(3);
    expect(r.resetTime!.getTime()).toBeGreaterThan(Date.now() + 40_000);
    expect(cadena.set).toHaveBeenCalledWith('rl:login:1.2.3.4', '0', { PX: 60_000, NX: true });
    expect(cadena.incr).toHaveBeenCalledWith('rl:login:1.2.3.4');
  });

  it('sin Redis cuenta en memoria', async () => {
    const almacen = new AlmacenLimiteRedis('api');
    almacen.init(opciones);
    expect((await almacen.increment('k')).totalHits).toBe(1);
    expect((await almacen.increment('k')).totalHits).toBe(2);
    expect(mockRedis.multi).not.toHaveBeenCalled();
  });

  it('si Redis falla a mitad cae a memoria en vez de dejar pasar sin límite', async () => {
    mockRedis.isReady = true;
    mockRedis.multi.mockImplementation(() => {
      throw new Error('socket closed');
    });
    const almacen = new AlmacenLimiteRedis('api');
    almacen.init(opciones);
    expect((await almacen.increment('k')).totalHits).toBe(1);
  });
});
