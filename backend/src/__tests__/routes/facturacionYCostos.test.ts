import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, hacerAdmin, cabeceras, type TestUser, type AdminTestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';

/**
 * Lo que leen la página de facturación y el panel de costos de IA.
 *
 *  1. /billing/status devuelve los créditos del mes con lo ya gastado.
 *  2. /admin/costos-ia suma el costo real registrado y calcula margen por plan.
 *  3. Solo superadmin ve los costos: soporte y usuarios normales reciben 403.
 */
describeWithDb('Facturación y costos de IA', () => {
  let cliente: TestUser;
  let superadmin: AdminTestUser;
  let soporte: AdminTestUser;
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);

  beforeAll(async () => {
    await initTestDb();
    [cliente, superadmin, soporte] = await Promise.all([
      signupTestUser(),
      signupTestUser().then((u) => hacerAdmin(u, 'superadmin')),
      signupTestUser().then((u) => hacerAdmin(u, 'soporte')),
    ]);
    await q(`UPDATE usuarios SET plan = 'pro_plus' WHERE id = $1`, [cliente.userId]);
    await q(`INSERT INTO creditos_consumo (usuario_id, accion, creditos) VALUES ($1, 'legal', 4), ($1, 'marketing', 2)`, [cliente.userId]);
    await q(`INSERT INTO creditos_consumo (usuario_id, accion, creditos, reembolsado) VALUES ($1, 'legal', 4, true)`, [cliente.userId]);
    await q(
      `INSERT INTO uso_ia (usuario_id, modulo, seccion, modelo, input_tokens, output_tokens, costo_usd)
       VALUES ($1, 'legal', 'legal.dictamen', 'claude-opus-5', 3600, 8000, 0.218),
              ($1, 'marketing', 'marketing.calendario', 'claude-sonnet-5', 4500, 10500, 0.114)`,
      [cliente.userId]
    );
  });

  afterAll(async () => {
    await q(`DELETE FROM uso_ia WHERE usuario_id = $1`, [cliente.userId]).catch(() => undefined);
    await closeTestDb();
  });

  it('facturación muestra créditos del mes descontando solo lo no reembolsado', async () => {
    const res = await request.default(app).get('/api/billing/status').set(cabeceras(cliente));
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('pro_plus');
    expect(res.body.limites).toMatchObject({ nombre: 'Negocio', precio_mxn: 599, creditos_ia_mes: 60 });
    expect(res.body.creditos).toMatchObject({ mes: 60, usados: 6, disponibles: 54 });
    expect(new Date(res.body.creditos.renuevan_el).getUTCDate()).toBe(1);
  });

  it('el panel de costos suma lo registrado y calcula el margen del plan', async () => {
    const res = await request.default(app).get('/api/admin/costos-ia?dias=30').set(cabeceras(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.totales.periodo).toBeGreaterThanOrEqual(0.332 - 1e-6);

    const cuenta = res.body.top_cuentas.find((c: { usuario_id: string }) => c.usuario_id === cliente.userId);
    expect(cuenta).toMatchObject({ plan: 'pro_plus', llamadas: 2 });
    expect(cuenta.costo).toBeCloseTo(0.332, 6);

    const negocio = res.body.por_plan.find((p: { plan: string }) => p.plan === 'pro_plus');
    expect(negocio.ingreso_estimado).toBeGreaterThan(0);
    expect(negocio.margen_pct).toBeLessThan(100);
    expect(res.body.por_modelo.map((m: { modelo: string }) => m.modelo)).toEqual(expect.arrayContaining(['claude-opus-5', 'claude-sonnet-5']));
  });

  it('solo superadmin ve los costos', async () => {
    expect((await request.default(app).get('/api/admin/costos-ia').set(cabeceras(soporte))).status).toBe(403);
    expect((await request.default(app).get('/api/admin/costos-ia').set(cabeceras(cliente))).status).toBe(403);
  });
});
