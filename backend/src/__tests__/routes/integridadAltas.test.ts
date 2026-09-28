import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * Altas que guardaban referencias de otra cuenta sin mirar, un simulador que
 * callaba un canal inexistente y un borrado de almacén que dejaba el stock mal.
 */
describeWithDb('Integridad de altas y borrados de herramientas', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const cuentas: string[] = [];
  let productoId: string;
  let productoAjeno: string;
  let negocioAjeno: string;
  let tok: string;

  const api = () => {
    const a = request.default(app);
    const auth = { Authorization: `Bearer ${tok}` };
    return {
      post: (r: string, b: object = {}) => a.post(`/api${r}`).set(auth).send(b),
      delete: (r: string) => a.delete(`/api${r}`).set(auth),
    };
  };

  const nuevaCuenta = async () => {
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Integridad', 'business') RETURNING id`,
      [`integridad-${randomUUID()}@example.com`],
    );
    cuentas.push(u.id);
    return u.id as string;
  };

  beforeAll(async () => {
    await initTestDb();
    const cuenta = await nuevaCuenta();
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Spa', 'MX') RETURNING id`, [cuenta]);
    productoId = p.id;
    tok = jwt.sign({ userId: cuenta, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '15m', algorithm: 'HS256' });

    const otra = await nuevaCuenta();
    productoAjeno = (await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Ajeno', 'MX') RETURNING id`, [otra]))[0].id;
    negocioAjeno = (await q(`INSERT INTO negocios (usuario_id, nombre) VALUES ($1, 'Ajeno') RETURNING id`, [otra]))[0].id;
  }, 60_000);

  afterAll(async () => {
    for (const id of cuentas) {
      await q(`DELETE FROM movimientos_inventario WHERE usuario_id = $1`, [id]).catch(() => undefined);
      await q(`DELETE FROM movimientos_contables WHERE usuario_id = $1`, [id]).catch(() => undefined);
      await q(`DELETE FROM usuarios WHERE id = $1`, [id]).catch(() => undefined);
    }
    await closeTestDb();
  });

  it('nómina: no da de alta un empleado en el negocio o producto de otra cuenta', async () => {
    const base = { nombre: 'Ana', salario: 12000 };
    expect((await api().post('/nomina/empleados', { ...base, producto_id: productoAjeno })).status).toBe(404);
    expect((await api().post('/nomina/empleados', { ...base, negocio_id: negocioAjeno })).status).toBe(404);
    expect((await api().post('/nomina/empleados', { ...base, producto_id: productoId })).status).toBe(201);
  });

  it('POS: una venta no se registra en el negocio de otra cuenta', async () => {
    const res = await api().post('/pos/ventas', {
      producto_id: productoId,
      negocio_id: negocioAjeno,
      lineas: [{ nombre: 'Masaje', precio_unitario: 500, cantidad: 1 }],
      metodo_pago: 'efectivo',
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Negocio/);
  });

  it('almacén: una compra con producto ajeno se rechaza en vez de perder su egreso', async () => {
    const insumo = await api().post('/inventario/insumos', { nombre: 'Aceite', unidad: 'litro' });
    const compra = { insumo_id: insumo.body.id, tipo: 'entrada', cantidad: 2, costo_unitario: 100 };
    expect((await api().post('/inventario/movimientos', { ...compra, producto_id: productoAjeno })).status).toBe(404);

    const ok = await api().post('/inventario/movimientos', { ...compra, producto_id: productoId });
    expect(ok.status).toBe(201);
    const [egreso] = await q(`SELECT tipo, monto::float AS monto FROM movimientos_contables WHERE id = $1`, [ok.body.movimiento_contable_id]);
    expect(egreso).toEqual({ tipo: 'egreso', monto: 200 });
  });

  it('almacén: deshacer el último movimiento revierte stock, costo promedio y egreso; uno anterior no', async () => {
    const insumo = await api().post('/inventario/insumos', { nombre: 'Gel', unidad: 'litro', stock_actual: 5, costo_promedio: 180 });
    const compra = await api().post('/inventario/movimientos', {
      insumo_id: insumo.body.id, tipo: 'entrada', cantidad: 3, costo_unitario: 200, producto_id: productoId,
    });
    expect(compra.status).toBe(201);
    const [despues] = await q(`SELECT stock_actual::float AS s, costo_promedio::float AS c FROM insumos_inventario WHERE id = $1`, [insumo.body.id]);
    expect(despues).toEqual({ s: 8, c: 187.5 });

    // El inventario inicial ya no es el último: no se deshace.
    const [inicial] = await q(`SELECT id FROM movimientos_inventario WHERE insumo_id = $1 AND motivo = 'Inventario inicial'`, [insumo.body.id]);
    expect((await api().delete(`/inventario/movimientos/${inicial.id}`)).status).toBe(409);

    const [movCompra] = await q(
      `SELECT id, movimiento_contable_id FROM movimientos_inventario WHERE insumo_id = $1 AND tipo = 'entrada'`,
      [insumo.body.id],
    );
    const borrado = await api().delete(`/inventario/movimientos/${movCompra.id}`);
    expect(borrado.status).toBe(200);
    const [antes] = await q(`SELECT stock_actual::float AS s, costo_promedio::float AS c FROM insumos_inventario WHERE id = $1`, [insumo.body.id]);
    expect(antes).toEqual({ s: 5, c: 180 });
    if (movCompra.movimiento_contable_id) {
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE id = $1`, [movCompra.movimiento_contable_id]);
      expect(n).toBe(0);
    }
  });

  it('simulador de precios: un canal inexistente responde 404 en vez de simular sin comisión', async () => {
    const res = await api().post(`/contabilidad/${productoId}/canales/simular`, { monto_deseado_neto: 1000, canal_cobro_id: randomUUID() });
    expect(res.status).toBe(404);
  });
});
