const mockQuery = jest.fn();
const mockDb = { isInitialized: true, query: (...args: unknown[]) => mockQuery(...args) };
const mockRedis = { isReady: true };

jest.mock('../../config/database', () => ({ AppDataSource: mockDb }));
jest.mock('../../config/redis', () => ({ redisClient: mockRedis, initRedis: jest.fn() }));

import request from 'supertest';
import app, { tokenMetricasValido } from '../../app';

/**
 * /health es lo único que miran el HEALTHCHECK de Docker y Railway, y solo por el
 * código HTTP. Antes respondía 200 "ok" siempre, aunque Postgres o Redis
 * estuvieran caídos.
 */
describe('GET /health', () => {
  beforeEach(() => {
    mockQuery.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    mockDb.isInitialized = true;
    mockRedis.isReady = true;
  });

  it('200 cuando Postgres y Redis responden', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'connected', redis: 'connected' });
    expect(typeof res.body.uptime_s).toBe('number');
    expect(['running', 'disabled', 'stopped']).toContain(res.body.worker);
    expect(mockQuery).toHaveBeenCalledWith('SELECT 1');
  });

  it('503 si Postgres no responde aunque el DataSource siga inicializado', async () => {
    mockQuery.mockRejectedValue(new Error('Connection terminated'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'disconnected', redis: 'connected' });
  });

  it('503 si Redis no está listo', async () => {
    mockRedis.isReady = false;
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'connected', redis: 'disconnected' });
  });

  it('503 sin consultar la base si nunca se inicializó', async () => {
    mockDb.isInitialized = false;
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

/** Antes, en producción sin METRICS_TOKEN, /metrics quedaba público. */
describe('GET /metrics en producción', () => {
  const TOKEN = 't'.repeat(40);
  const entornoOriginal = { NODE_ENV: process.env.NODE_ENV, METRICS_TOKEN: process.env.METRICS_TOKEN };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });
  afterEach(() => {
    process.env.NODE_ENV = entornoOriginal.NODE_ENV;
    process.env.METRICS_TOKEN = entornoOriginal.METRICS_TOKEN ?? '';
  });

  it('sin METRICS_TOKEN configurado responde 404', async () => {
    process.env.METRICS_TOKEN = '';
    expect((await request(app).get('/metrics')).status).toBe(404);
  });

  it('exige el token por Bearer o X-Metrics-Token', async () => {
    process.env.METRICS_TOKEN = TOKEN;
    expect((await request(app).get('/metrics')).status).toBe(401);
    expect((await request(app).get('/metrics').set('Authorization', 'Bearer otro')).status).toBe(401);
    expect((await request(app).get('/metrics').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(200);
    expect((await request(app).get('/metrics').set('X-Metrics-Token', TOKEN)).status).toBe(200);
  });

  it('compara tokens de distinta longitud sin lanzar', () => {
    expect(tokenMetricasValido('corto', TOKEN)).toBe(false);
    expect(tokenMetricasValido(undefined, TOKEN)).toBe(false);
    expect(tokenMetricasValido(TOKEN, TOKEN)).toBe(true);
  });
});
