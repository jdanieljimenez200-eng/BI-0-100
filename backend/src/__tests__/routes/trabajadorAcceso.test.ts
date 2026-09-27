import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * Lo que ve y puede hacer un trabajador fuera de las herramientas.
 *
 * Las herramientas ya resolvían la cuenta del dueño (`resolverAcceso`), pero
 * `/api/productos` y los módulos de análisis filtraban por `req.userId`, que para
 * un trabajador es su propio id: la lista de productos le salía vacía, y como
 * toda la app toma de ahí el producto activo, no podía usar nada de lo que el
 * dueño le había asignado.
 */
describeWithDb('Trabajador — productos y módulos de análisis', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const cuentas: string[] = [];

  const token = (userId: string) =>
    jwt.sign({ userId, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '15m', algorithm: 'HS256' });
  const get = (tok: string, ruta: string) => request.default(app).get(`/api${ruta}`).set('Authorization', `Bearer ${tok}`);

  let dueno: string;
  let trabajador: string;
  let productoAsignado: string;
  let productoAjeno: string;

  beforeAll(async () => {
    await initTestDb();
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Dueño', 'business') RETURNING id`,
      [`dueno-${randomUUID()}@example.com`],
    );
    cuentas.push(u.id);
    const [a] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Cafetería', 'MX') RETURNING id`, [u.id]);
    const [b] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Panadería', 'MX') RETURNING id`, [u.id]);
    const [t] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan, account_role, owner_id)
       VALUES ($1, 'x', 'Cajero', 'business', 'trabajador', $2) RETURNING id`,
      [`cajero-${randomUUID()}@example.com`, u.id],
    );
    cuentas.push(t.id);
    await q(
      `INSERT INTO asignaciones_trabajador (trabajador_id, cuenta_id, producto_id, permisos) VALUES ($1, $2, $3, $4::jsonb)`,
      [t.id, u.id, a.id, JSON.stringify({ mercado: true, marketing: true, finanzas: false })],
    );
    dueno = token(u.id);
    trabajador = token(t.id);
    productoAsignado = a.id;
    productoAjeno = b.id;
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [cuentas]).catch(() => undefined);
    await closeTestDb();
  });

  describe('GET /api/productos', () => {
    it('el trabajador ve solo el producto que tiene asignado', async () => {
      const res = await get(trabajador, '/productos');
      expect(res.status).toBe(200);
      expect(res.body.map((p: { id: string }) => p.id)).toEqual([productoAsignado]);
      expect((await get(trabajador, '/productos/count')).body.count).toBe(1);
    });

    it('el dueño sigue viendo todos los suyos', async () => {
      const res = await get(dueno, '/productos');
      expect(res.body.map((p: { id: string }) => p.id).sort()).toEqual([productoAsignado, productoAjeno].sort());
    });

    it('el trabajador abre su producto, y el no asignado responde 404', async () => {
      expect((await get(trabajador, `/productos/${productoAsignado}`)).status).toBe(200);
      expect((await get(trabajador, `/productos/${productoAjeno}`)).status).toBe(404);
    });

    it('un trabajador sin asignaciones activas no ve ninguno', async () => {
      await q(`UPDATE asignaciones_trabajador SET activo = false WHERE cuenta_id = $1`, [cuentas[0]]);
      try {
        const res = await get(trabajador, '/productos');
        expect(res.body).toEqual([]);
      } finally {
        await q(`UPDATE asignaciones_trabajador SET activo = true WHERE cuenta_id = $1`, [cuentas[0]]);
      }
    });
  });

  describe('Módulos de análisis', () => {
    it('con permiso del módulo opera sobre la cuenta del dueño', async () => {
      const res = await get(trabajador, `/mercado/traccion/${productoAsignado}`);
      expect(res.status).toBe(200);
    });

    it('sin permiso del módulo responde 403', async () => {
      const res = await get(trabajador, `/finanzas/calibracion/${productoAsignado}`);
      expect(res.status).toBe(403);
      expect(res.body.capability).toBe('finanzas');
    });

    it('un producto de la cuenta que no tiene asignado responde 404', async () => {
      expect((await get(trabajador, `/mercado/traccion/${productoAjeno}`)).status).toBe(404);
    });

    it('al dueño no le cambia nada', async () => {
      expect((await get(dueno, `/mercado/traccion/${productoAjeno}`)).status).toBe(200);
      expect((await get(dueno, `/finanzas/calibracion/${productoAsignado}`)).status).toBe(200);
    });
  });
});
