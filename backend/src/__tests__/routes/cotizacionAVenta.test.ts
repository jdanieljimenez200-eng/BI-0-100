import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * «Aceptar» una cotización y convertirla en venta son dos cosas distintas.
 *
 * El botón «Aceptar» de la interfaz solo cambia el estado a 'aceptada', y la
 * conversión respondía 409 «ya se convirtió en venta» a cualquier cotización
 * aceptada: aceptarla primero dejaba al negocio sin forma de registrar la
 * venta. Lo que decide si ya se vendió es la venta vigente, y si esa venta se
 * cancela la cotización puede venderse otra vez.
 */
describeWithDb('Cotización aceptada → venta', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  let cuenta: string;
  let productoId: string;
  let tok: string;

  const api = () => {
    const a = request.default(app);
    const auth = { Authorization: `Bearer ${tok}` };
    return {
      get: (r: string) => a.get(`/api${r}`).set(auth),
      post: (r: string, b: object = {}) => a.post(`/api${r}`).set(auth).send(b),
      patch: (r: string, b: object) => a.patch(`/api${r}`).set(auth).send(b),
    };
  };

  beforeAll(async () => {
    await initTestDb();
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Cotiza', 'business') RETURNING id`,
      [`cotiza-${randomUUID()}@example.com`],
    );
    cuenta = u.id;
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Taller', 'MX') RETURNING id`, [u.id]);
    productoId = p.id;
    tok = jwt.sign({ userId: u.id, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '15m', algorithm: 'HS256' });
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM movimientos_contables WHERE usuario_id = $1`, [cuenta]).catch(() => undefined);
    await q(`DELETE FROM venta_items WHERE venta_id IN (SELECT id FROM ventas WHERE usuario_id = $1)`, [cuenta]).catch(() => undefined);
    await q(`DELETE FROM ventas WHERE usuario_id = $1`, [cuenta]).catch(() => undefined);
    await q(`DELETE FROM usuarios WHERE id = $1`, [cuenta]).catch(() => undefined);
    await closeTestDb();
  });

  it('se puede aceptar primero y convertir después; cancelada la venta, se vende otra vez', async () => {
    const cot = await api().post('/cotizaciones', {
      cliente_nombre: 'Hotel Riviera',
      producto_id: productoId,
      items: [{ descripcion: 'Lavado de flotilla', cantidad: 3, precio_unitario: 1250 }],
      impuesto_tasa: 16,
      moneda: 'MXN',
      estado: 'enviada',
    });
    expect(cot.status).toBe(201);
    expect(cot.body.venta_id ?? null).toBeNull();

    const aceptada = await api().patch(`/cotizaciones/${cot.body.id}`, { estado: 'aceptada' });
    expect(aceptada.status).toBe(200);
    expect(aceptada.body.venta_id).toBeNull();

    const conv = await api().post(`/cotizaciones/${cot.body.id}/convertir-venta`);
    expect(conv.status).toBe(201);
    expect(Number(conv.body.venta.total)).toBe(4350);

    const lista = await api().get(`/cotizaciones?producto_id=${productoId}`);
    const enLista = lista.body.find((c: { id: string }) => c.id === cot.body.id);
    expect(enLista).toMatchObject({ estado: 'aceptada', venta_id: conv.body.venta.id, venta_ticket: conv.body.venta.numero_ticket });

    const otra = await api().post(`/cotizaciones/${cot.body.id}/convertir-venta`);
    expect(otra.status).toBe(409);
    expect(otra.body.venta_id).toBe(conv.body.venta.id);

    expect((await api().post(`/pos/ventas/${conv.body.venta.id}/cancelar`, { motivo: 'El cliente pagó otro servicio' })).status).toBe(200);
    const trasCancelar = await api().get(`/cotizaciones/${cot.body.id}`);
    expect(trasCancelar.body).toMatchObject({ estado: 'enviada', venta_id: null });

    const deNuevo = await api().post(`/cotizaciones/${cot.body.id}/convertir-venta`);
    expect(deNuevo.status).toBe(201);
    expect(deNuevo.body.venta.id).not.toBe(conv.body.venta.id);

    const [{ vigentes, total }] = await q(
      `SELECT COUNT(*) FILTER (WHERE estado <> 'cancelada')::int AS vigentes, COUNT(*)::int AS total FROM ventas WHERE cotizacion_id = $1`,
      [cot.body.id],
    );
    expect({ vigentes, total }).toEqual({ vigentes: 1, total: 2 });
  });

  it('la cotización queda ligada al cliente del CRM y la venta hereda el vínculo', async () => {
    const [cli] = await q(`INSERT INTO clientes (usuario_id, nombre, telefono) VALUES ($1, 'María Gómez', '3311112222') RETURNING id`, [cuenta]);
    const cot = await api().post('/cotizaciones', {
      cliente_id: cli.id,
      cliente_nombre: 'María Gómez',
      producto_id: productoId,
      items: [{ descripcion: 'Consulta', cantidad: 1, precio_unitario: 500 }],
      moneda: 'MXN',
    });
    expect(cot.status).toBe(201);
    expect(cot.body.cliente_id).toBe(cli.id);

    const conv = await api().post(`/cotizaciones/${cot.body.id}/convertir-venta`);
    expect(conv.status).toBe(201);
    expect(conv.body.venta.cliente_id).toBe(cli.id);
  });

  it('el método de pago de la venta tiene que ser uno de los del POS', async () => {
    const cot = await api().post('/cotizaciones', {
      cliente_nombre: 'Pago raro', producto_id: productoId, moneda: 'MXN',
      items: [{ descripcion: 'Servicio', cantidad: 1, precio_unitario: 100 }],
    });
    expect((await api().post(`/cotizaciones/${cot.body.id}/convertir-venta`, { metodo_pago: 'bitcoin' })).status).toBe(400);
    const ok = await api().post(`/cotizaciones/${cot.body.id}/convertir-venta`, { metodo_pago: 'tarjeta' });
    expect(ok.status).toBe(201);
    expect(ok.body.venta.metodo_pago).toBe('tarjeta');
  });

  it('no acepta cliente ni producto de otra cuenta', async () => {
    const [otra] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre) VALUES ($1, 'x', 'Otra') RETURNING id`,
      [`otra-${randomUUID()}@example.com`],
    );
    try {
      const [cliAjeno] = await q(`INSERT INTO clientes (usuario_id, nombre) VALUES ($1, 'Ajeno') RETURNING id`, [otra.id]);
      const [prodAjeno] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Ajeno', 'MX') RETURNING id`, [otra.id]);
      const base = { cliente_nombre: 'X', items: [{ descripcion: 'A', cantidad: 1, precio_unitario: 1 }], moneda: 'MXN' };

      expect((await api().post('/cotizaciones', { ...base, producto_id: productoId, cliente_id: cliAjeno.id })).status).toBe(404);
      expect((await api().post('/cotizaciones', { ...base, producto_id: prodAjeno.id })).status).toBe(404);
    } finally {
      await q(`DELETE FROM usuarios WHERE id = $1`, [otra.id]);
    }
  });
});
