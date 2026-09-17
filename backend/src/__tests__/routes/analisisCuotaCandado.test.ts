import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

// La cola real mandaría trabajos al worker del entorno de desarrollo.
jest.mock('../../workers/analysisQueue', () => ({
  analysisQueue: { add: jest.fn().mockResolvedValue({}) },
  startAnalysisWorker: jest.fn(),
  stopAnalysisWorker: jest.fn(),
}));

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { redisClient } from '../../config/redis';
import { analysisQueue } from '../../workers/analysisQueue';

const encolar = analysisQueue.add as jest.Mock;

const BRIEF = {
  emocion: 'Confianza',
  estilo_visual: 'Minimalista',
  paleta_elegida: 'A',
  tipo_logo: 'Isotipo',
  tono_comunicacion: 'Cercano',
  posicionamiento: 'Confiable (el de siempre)',
  nivel_diferenciacion: 'Medio (algunas diferencias)',
};

/**
 * Entrada de un análisis: cuota, candado y validación.
 *
 * Lo que se vigila:
 *  1. Un análisis entregado con plantilla (IA caída) no consume la cuota gratuita.
 *  2. La cuota de Marca es por cuenta, y el candado también: no se puede lanzar
 *     a la vez sobre dos productos para saltarse el conteo.
 *  3. `radioKm` llega al trabajo de Mercado en vez de perderse en la validación.
 */
describeWithDb('Entrada de análisis: cuota, candado y validación', () => {
  let usuarioId: string;
  let productoA: string;
  let productoB: string;
  let token: string;

  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const post = (ruta: string, body: object) =>
    request.default(app).post(`/api/${ruta}`).set('Authorization', `Bearer ${token}`).send(body);
  const soltarCandados = async () => {
    if (!redisClient?.isReady) return;
    const claves = await redisClient.keys(`analisis_lock:*:${usuarioId}*`);
    if (claves.length) await redisClient.del(claves);
  };

  beforeAll(async () => {
    await initTestDb();
    const email = `cuota-${randomUUID()}@example.com`;
    const [u] = await q(`INSERT INTO usuarios (email, password_hash, nombre) VALUES ($1, 'x', 'Cuota') RETURNING id`, [email]);
    usuarioId = u.id;
    const productos = await q(
      `INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'A', 'MX'), ($1, 'B', 'MX') RETURNING id`,
      [usuarioId]
    );
    [productoA, productoB] = productos.map((p: { id: string }) => p.id);
    token = jwt.sign({ userId: usuarioId, email, role: 'owner', jti: randomUUID() }, process.env.JWT_SECRET!, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });
  }, 60_000);

  afterAll(async () => {
    await soltarCandados();
    await q(`DELETE FROM usuarios WHERE id = $1`, [usuarioId]).catch(() => undefined);
    await closeTestDb();
  });

  beforeEach(async () => {
    encolar.mockClear();
    await soltarCandados();
  });

  it('un brief estimado no consume la cuota gratuita', async () => {
    await q(
      `INSERT INTO analisis_brief (usuario_id, producto_id, estado_analisis, resultado_estimado) VALUES ($1, $2, 'completado', true)`,
      [usuarioId, productoA]
    );
    const res = await post('brief/analizar', { producto_id: productoA, ...BRIEF });
    expect(res.status).toBe(202);
  });

  it('con Redis, el candado de Marca es por cuenta: el segundo producto a la vez da 409', async () => {
    if (!redisClient?.isReady) return;
    await q(`DELETE FROM analisis_brief WHERE usuario_id = $1`, [usuarioId]);
    expect((await post('brief/analizar', { producto_id: productoA, ...BRIEF })).status).toBe(202);
    expect((await post('brief/analizar', { producto_id: productoB, ...BRIEF })).status).toBe(409);
  });

  it('con Redis, un error de validación libera el candado: corregir y reenviar no da 409', async () => {
    if (!redisClient?.isReady) return;
    await q(`DELETE FROM analisis_brief WHERE usuario_id = $1`, [usuarioId]);
    const invalido = await post('brief/analizar', { producto_id: productoA });
    expect(invalido.status).toBe(400);
    // El lock se borra en el evento 'finish' de la respuesta.
    await new Promise((r) => setTimeout(r, 50));
    expect((await post('brief/analizar', { producto_id: productoA, ...BRIEF })).status).toBe(202);
  });

  it('un brief real sí consume la cuota', async () => {
    await q(`DELETE FROM analisis_brief WHERE usuario_id = $1`, [usuarioId]);
    await q(
      `INSERT INTO analisis_brief (usuario_id, producto_id, estado_analisis, resultado_estimado) VALUES ($1, $2, 'completado', false)`,
      [usuarioId, productoA]
    );
    expect((await post('brief/analizar', { producto_id: productoB, ...BRIEF })).status).toBe(429);
  });

  it('radioKm llega al trabajo de Mercado', async () => {
    const res = await post('mercado/analizar', {
      producto_id: productoB,
      pais: 'MX',
      scope: 'local',
      forma_cobro: 'Pago Único',
      nse_target: 'C',
      radioKm: 3,
    });
    expect(res.status).toBe(202);
    expect(encolar).toHaveBeenCalledWith(
      'analyze',
      expect.objectContaining({ payload: expect.objectContaining({ radioKm: 3 }) }),
      expect.anything()
    );
  });
});
