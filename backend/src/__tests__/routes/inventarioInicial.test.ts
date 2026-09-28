import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * Un insumo dado de alta con existencias nacía con stock que ningún movimiento
 * explicaba: el historial del almacén empezaba en cero y no cuadraba con el
 * stock. Ahora el alta deja un ajuste «Inventario inicial», sin gasto contable
 * (no es una compra de hoy) y sin consumir el tope del plan gratuito.
 */
describeWithDb('Inventario inicial al dar de alta un insumo', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const cuentas: string[] = [];

  const cuenta = async (plan: string) => {
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Almacén', $2) RETURNING id`,
      [`almacen-${randomUUID()}@example.com`, plan],
    );
    cuentas.push(u.id);
    const tok = jwt.sign({ userId: u.id, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '15m', algorithm: 'HS256' });
    return { id: u.id as string, post: (r: string, b: object) => request.default(app).post(`/api${r}`).set('Authorization', `Bearer ${tok}`).send(b) };
  };

  beforeAll(async () => { await initTestDb(); }, 60_000);
  afterAll(async () => {
    for (const id of cuentas) await q(`DELETE FROM usuarios WHERE id = $1`, [id]).catch(() => undefined);
    await closeTestDb();
  });

  it('deja un ajuste con el stock y el costo iniciales, sin asiento contable', async () => {
    const c = await cuenta('business');
    const res = await c.post('/inventario/insumos', { nombre: 'Aceite de masaje', unidad: 'litro', stock_actual: 5, costo_promedio: 180 });
    expect(res.status).toBe(201);

    const movs = await q(
      `SELECT tipo, cantidad::float AS cantidad, costo_unitario::float AS costo, costo_total::float AS total, stock_resultante::float AS stock, motivo
         FROM movimientos_inventario WHERE insumo_id = $1`,
      [res.body.id],
    );
    expect(movs).toEqual([{ tipo: 'ajuste', cantidad: 5, costo: 180, total: 900, stock: 5, motivo: 'Inventario inicial' }]);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE usuario_id = $1`, [c.id]);
    expect(n).toBe(0);
  });

  it('sin stock inicial no hay movimiento', async () => {
    const c = await cuenta('business');
    const res = await c.post('/inventario/insumos', { nombre: 'Toallas', unidad: 'pieza' });
    expect(res.status).toBe(201);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM movimientos_inventario WHERE insumo_id = $1`, [res.body.id]);
    expect(n).toBe(0);
  });

  it('el inventario inicial no gasta los movimientos del plan gratuito', async () => {
    const c = await cuenta('freemium');
    const a = await c.post('/inventario/insumos', { nombre: 'Gel', unidad: 'litro', stock_actual: 3, costo_promedio: 90 });
    const b = await c.post('/inventario/insumos', { nombre: 'Vendas', unidad: 'pieza', stock_actual: 20, costo_promedio: 15 });
    expect([a.status, b.status]).toEqual([201, 201]);

    const mov = (insumo_id: string) => c.post('/inventario/movimientos', { insumo_id, tipo: 'salida', cantidad: 1 });
    expect((await mov(a.body.id)).status).toBe(201);
    expect((await mov(b.body.id)).status).toBe(201);
  });
});
