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
    expect(PLAN_LIMITES.pro).toMatchObject({ nombre: 'Emprendedor', precio_mxn: 449, precio_mxn_anual: 4490, creditos_ia_mes: 20 });
    expect(PLAN_LIMITES.pro_plus).toMatchObject({ nombre: 'Negocio', precio_mxn: 599, creditos_ia_mes: 60 });
    expect(PLAN_LIMITES.business).toMatchObject({ nombre: 'Empresa', precio_mxn: 1199, creditos_ia_mes: 120 });
    expect(PLAN_LIMITES.enterprise).toMatchObject({ precio_mxn: 4999, creditos_ia_mes: 600 });
    expect(PLAN_LIMITES.freemium).toMatchObject({ precio_mxn: 0, creditos_ia_mes: 5 });
  });

  it('una suite completa cuesta 11 créditos y Legal es la acción más cara', () => {
    const suite = ['mercado', 'marketing', 'legal', 'finanzas', 'brief', 'ventas'] as const;
    expect(suite.reduce((s, a) => s + COSTO_CREDITOS[a], 0)).toBe(11);
    expect(Math.max(...Object.values(COSTO_CREDITOS))).toBe(COSTO_CREDITOS.legal);
  });

  it('estrategia 70/30: el plan de entrada cuesta ~75 % del medio y da bastante menos', () => {
    const entrada = PLAN_LIMITES.pro;
    const medio = PLAN_LIMITES.pro_plus;
    const ratioPrecio = entrada.precio_mxn / medio.precio_mxn;
    expect(ratioPrecio).toBeGreaterThanOrEqual(0.7);
    expect(ratioPrecio).toBeLessThanOrEqual(0.8);
    // Por cada peso, el plan medio da más créditos, herramientas y productos.
    expect(medio.creditos_ia_mes / medio.precio_mxn).toBeGreaterThan((entrada.creditos_ia_mes / entrada.precio_mxn) * 2);
    expect(medio.max_herramientas).toBeGreaterThan(entrada.max_herramientas * 3);
    expect(entrada.legal_analisis).toBe(false);
    expect(medio.legal_analisis).toBe(true);
    // El plan alto ancla: cuesta el doble del medio.
    expect(PLAN_LIMITES.business.precio_mxn).toBeGreaterThanOrEqual(medio.precio_mxn * 2);
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
    const [u] = await q(`INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Créditos', 'pro_plus') RETURNING id`, [email]);
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
    // Negocio = 60 créditos; Legal = 4 → caben 15.
    const intentos = await Promise.allSettled(Array.from({ length: 20 }, () => cobrarCreditos(usuarioId, 'pro_plus', 'legal')));
    const cobrados = intentos.filter((r) => r.status === 'fulfilled').length;
    const rechazados = intentos.filter((r) => r.status === 'rejected' && r.reason instanceof CreditosInsuficientesError).length;

    expect(cobrados).toBe(15);
    expect(rechazados).toBe(5);
    expect(await estadoCreditos(usuarioId, 'pro_plus')).toMatchObject({ mes: 60, usados: 60, disponibles: 0 });
  });

  it('un reembolso devuelve los créditos', async () => {
    const cobro = await cobrarCreditos(usuarioId, 'pro_plus', 'legal', randomUUID());
    expect((await estadoCreditos(usuarioId, 'pro_plus')).usados).toBe(4);
    await reembolsarCreditos({ cobroId: cobro });
    expect((await estadoCreditos(usuarioId, 'pro_plus')).usados).toBe(0);
  });

  it('una acción bajo demanda que falla o sale de plantilla no cuesta nada', async () => {
    const clave = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba';
    try {
      await expect(conCreditos(usuarioId, 'pro_plus', 'ventas_guion', async () => { throw new Error('IA caída'); })).rejects.toThrow();
      await conCreditos(usuarioId, 'pro_plus', 'ventas_guion', async () => {
        registrarFallbackIA('ventas.guion');
        return 'plantilla';
      });
      expect((await estadoCreditos(usuarioId, 'pro_plus')).usados).toBe(0);

      await conCreditos(usuarioId, 'pro_plus', 'ventas_guion', async () => 'respuesta real');
      expect((await estadoCreditos(usuarioId, 'pro_plus')).usados).toBe(1);
    } finally {
      process.env.ANTHROPIC_API_KEY = clave;
    }
  });

  it('sin créditos la ruta responde 402 con oferta de subir de plan y no deja el análisis', async () => {
    await q(`INSERT INTO creditos_consumo (usuario_id, accion, creditos) VALUES ($1, 'legal', 57)`, [usuarioId]);

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
    expect(res.body).toMatchObject({ codigo: 'creditos_agotados', upgrade_required: true, disponibles: 3, necesarios: 4 });
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM analisis_legal WHERE usuario_id = $1`, [usuarioId]);
    expect(n).toBe(0);
  });

  it('Legal está bloqueado en los planes sin legal_analisis, con oferta de mejora', async () => {
    await q(`UPDATE usuarios SET plan = 'pro' WHERE id = $1`, [usuarioId]);
    try {
      const res = await request
        .default(app)
        .post('/api/legal/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({ producto_id: productoId, forma_juridica: 'Persona física', tiene_empleados: false, vende_en_linea: false, exporta_importa: false, anios_operando: '0' });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ feature: 'legal_analisis', upgrade_required: true });
    } finally {
      await q(`UPDATE usuarios SET plan = 'pro_plus' WHERE id = $1`, [usuarioId]);
    }
  });

  it('al bajar de plan solo quedan activas las primeras herramientas elegidas', async () => {
    const { usuarioTieneHerramienta } = await import('../../middleware/requirePlan');
    await q(`DELETE FROM herramientas_seleccionadas WHERE usuario_id = $1`, [usuarioId]);
    for (const [i, k] of ['pos', 'inventario', 'clientes'].entries()) {
      await q(`INSERT INTO herramientas_seleccionadas (usuario_id, herramienta_key, created_at) VALUES ($1, $2, NOW() - make_interval(mins => $3))`, [usuarioId, k, 10 - i]);
    }
    const base = { id: usuarioId, account_role: 'owner', owner_id: null } as never;
    // Negocio (4): las tres valen.
    expect(await usuarioTieneHerramienta({ ...(base as object), plan: 'pro_plus' } as never, 'clientes')).toBe(true);
    // Emprendedor (1): solo la primera elegida.
    expect(await usuarioTieneHerramienta({ ...(base as object), plan: 'pro' } as never, 'pos')).toBe(true);
    expect(await usuarioTieneHerramienta({ ...(base as object), plan: 'pro' } as never, 'clientes')).toBe(false);
  });

  it('el catálogo público de planes no pide sesión', async () => {
    const res = await request.default(app).get('/api/billing/planes');
    expect(res.status).toBe(200);
    expect(res.body.planes.pro.precio_mxn).toBe(449);
    expect(res.body.costo_creditos.legal).toBe(4);
  });
});
