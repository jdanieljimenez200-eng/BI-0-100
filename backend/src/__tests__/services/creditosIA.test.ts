import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

jest.mock('../../workers/analysisQueue', () => ({
  analysisQueue: { add: jest.fn().mockResolvedValue({}) },
  startAnalysisWorker: jest.fn(),
  stopAnalysisWorker: jest.fn(),
}));

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { redisClient } from '../../config/redis';
import { PLAN_LIMITES } from '../../services/billing/planService';
import {
  COSTO_CREDITOS,
  CreditosInsuficientesError,
  cobrarCreditos,
  conCreditos,
  costoDe,
  estadoCreditos,
  reembolsarCreditos,
} from '../../services/billing/creditosIA';
import { registrarFallbackIA } from '../../utils/seguimientoIA';

/**
 * Créditos mensuales de IA.
 *
 *  1. Precios y créditos del plan son los aprobados (docs/pricing/PROPUESTA_PLANES_2026-09.md).
 *  2. No se puede gastar más de lo que da el plan, ni con peticiones simultáneas.
 *  3. Lo que falla o sale de plantilla se devuelve.
 *  4. Al agotarse, la ruta responde 402 con oferta de subir de plan y no deja rastro.
 */
describe('Créditos de IA: reglas', () => {
  it('planes con los precios y créditos aprobados', () => {
    expect(PLAN_LIMITES.pro).toMatchObject({ nombre: 'Emprendedor', precio_mxn: 299, precio_mxn_anual: 2990, creditos_ia_mes: 25 });
    expect(PLAN_LIMITES.pro_plus).toMatchObject({ nombre: 'Negocio', precio_mxn: 599, creditos_ia_mes: 55 });
    expect(PLAN_LIMITES.business).toMatchObject({ nombre: 'Empresa', precio_mxn: 1199, creditos_ia_mes: 120 });
    expect(PLAN_LIMITES.enterprise).toMatchObject({ precio_mxn: 4999, creditos_ia_mes: 600 });
    expect(PLAN_LIMITES.freemium).toMatchObject({ precio_mxn: 0, creditos_ia_mes: 5 });
  });

  it('una suite completa cuesta 11 créditos y Legal es la acción más cara', () => {
    const suite = ['mercado', 'marketing', 'legal', 'finanzas', 'brief', 'ventas'] as const;
    expect(suite.reduce((s, a) => s + COSTO_CREDITOS[a], 0)).toBe(11);
    expect(Math.max(...Object.values(COSTO_CREDITOS))).toBe(COSTO_CREDITOS.legal);
  });

  it('en el plan gratuito los análisis no gastan créditos, las acciones bajo demanda sí', () => {
    expect(costoDe('legal', 'freemium')).toBe(0);
    expect(costoDe('mercado', 'freemium')).toBe(0);
    expect(costoDe('ventas_guion', 'freemium')).toBe(1);
    expect(costoDe('legal', 'pro')).toBe(4);
  });
});

describeWithDb('Créditos de IA: cobro', () => {
  let usuarioId: string;
  let productoId: string;
  let token: string;
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);

  beforeAll(async () => {
    await initTestDb();
    const email = `creditos-${randomUUID()}@example.com`;
    const [u] = await q(`INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Créditos', 'pro') RETURNING id`, [email]);
    usuarioId = u.id;
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Producto', 'MX') RETURNING id`, [usuarioId]);
    productoId = p.id;
    token = jwt.sign({ userId: usuarioId, email, role: 'owner', jti: randomUUID() }, process.env.JWT_SECRET!, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });
  }, 60_000);

  afterAll(async () => {
    if (redisClient?.isReady) {
      const claves = await redisClient.keys(`analisis_lock:*:${usuarioId}*`);
      if (claves.length) await redisClient.del(claves);
    }
    await q(`DELETE FROM usuarios WHERE id = $1`, [usuarioId]).catch(() => undefined);
    await closeTestDb();
  });

  beforeEach(async () => {
    await q(`DELETE FROM creditos_consumo WHERE usuario_id = $1`, [usuarioId]);
  });

  it('peticiones simultáneas no gastan más créditos de los que hay', async () => {
    // Pro = 25 créditos; Legal = 4 → caben 6.
    const intentos = await Promise.allSettled(Array.from({ length: 10 }, () => cobrarCreditos(usuarioId, 'pro', 'legal')));
    const cobrados = intentos.filter((r) => r.status === 'fulfilled').length;
    const rechazados = intentos.filter((r) => r.status === 'rejected' && r.reason instanceof CreditosInsuficientesError).length;

    expect(cobrados).toBe(6);
    expect(rechazados).toBe(4);
    expect(await estadoCreditos(usuarioId, 'pro')).toMatchObject({ mes: 25, usados: 24, disponibles: 1 });
  });

  it('un reembolso devuelve los créditos', async () => {
    const cobro = await cobrarCreditos(usuarioId, 'pro', 'legal', randomUUID());
    expect((await estadoCreditos(usuarioId, 'pro')).usados).toBe(4);
    await reembolsarCreditos({ cobroId: cobro });
    expect((await estadoCreditos(usuarioId, 'pro')).usados).toBe(0);
  });

  it('una acción bajo demanda que falla o sale de plantilla no cuesta nada', async () => {
    const clave = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba';
    try {
      await expect(conCreditos(usuarioId, 'pro', 'ventas_guion', async () => { throw new Error('IA caída'); })).rejects.toThrow();
      await conCreditos(usuarioId, 'pro', 'ventas_guion', async () => {
        registrarFallbackIA('ventas.guion');
        return 'plantilla';
      });
      expect((await estadoCreditos(usuarioId, 'pro')).usados).toBe(0);

      await conCreditos(usuarioId, 'pro', 'ventas_guion', async () => 'respuesta real');
      expect((await estadoCreditos(usuarioId, 'pro')).usados).toBe(1);
    } finally {
      process.env.ANTHROPIC_API_KEY = clave;
    }
  });

  it('sin créditos la ruta responde 402 con oferta de subir de plan y no deja el análisis', async () => {
    await q(`INSERT INTO creditos_consumo (usuario_id, accion, creditos) VALUES ($1, 'legal', 24)`, [usuarioId]);

    const res = await request
      .default(app)
      .post('/api/legal/analizar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        producto_id: productoId,
        forma_juridica: 'Persona física',
        tiene_empleados: false,
        vende_en_linea: false,
        exporta_importa: false,
        anios_operando: '0',
      });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ codigo: 'creditos_agotados', upgrade_required: true, disponibles: 1, necesarios: 4 });
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM analisis_legal WHERE usuario_id = $1`, [usuarioId]);
    expect(n).toBe(0);
  });

  it('el catálogo público de planes no pide sesión', async () => {
    const res = await request.default(app).get('/api/billing/planes');
    expect(res.status).toBe(200);
    expect(res.body.planes.pro.precio_mxn).toBe(299);
    expect(res.body.costo_creditos.legal).toBe(4);
  });
});
