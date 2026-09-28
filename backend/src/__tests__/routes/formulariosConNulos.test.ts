import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * Los formularios mandan `campo || null` en los campos opcionales vacíos.
 *
 * Cotizaciones y Nómina los validaban con `z.string().optional()`, que acepta
 * que el campo falte pero rechaza `null`: crear una cotización sin empresa,
 * email o teléfono, o dar de alta un empleado sin cargo, respondía 400. Los
 * tests anteriores omitían esos campos en vez de mandarlos a null, como hace la
 * interfaz, y por eso no lo veían.
 */
describeWithDb('Formularios que mandan null en los campos vacíos', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  let cuenta: string;
  let productoId: string;
  let tok: string;

  const post = (ruta: string, body: object) =>
    request.default(app).post(`/api${ruta}`).set('Authorization', `Bearer ${tok}`).send(body);

  beforeAll(async () => {
    await initTestDb();
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Nulos', 'business') RETURNING id`,
      [`nulos-${randomUUID()}@example.com`],
    );
    cuenta = u.id;
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Taller', 'MX') RETURNING id`, [u.id]);
    productoId = p.id;
    tok = jwt.sign({ userId: u.id, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '15m', algorithm: 'HS256' });
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = $1`, [cuenta]).catch(() => undefined);
    await closeTestDb();
  });

  it('cotización con empresa, email, teléfono, vencimiento y notas en null', async () => {
    const res = await post('/cotizaciones', {
      cliente_nombre: 'Hotel Riviera',
      cliente_empresa: null,
      cliente_email: null,
      cliente_telefono: null,
      items: [{ descripcion: 'Lavado de flotilla', cantidad: 3, precio_unitario: 1250, subtotal: 3750 }],
      descuento_pct: 0,
      impuesto_tasa: 16,
      impuesto_nombre: 'IVA',
      moneda: 'MXN',
      estado: 'borrador',
      fecha_vencimiento: null,
      notas: null,
      negocio_id: null,
      producto_id: productoId,
    });
    expect(res.status).toBe(201);
    expect(res.body.cliente_email).toBeNull();
    expect(Number(res.body.total)).toBe(4350);
  });

  it('empleado sin cargo, teléfono, email, fecha de inicio ni notas', async () => {
    const res = await post('/nomina/empleados', {
      nombre: 'Ana López',
      cargo: null,
      salario: 12000,
      tipo_pago: 'quincenal',
      moneda: 'MXN',
      telefono: null,
      email: null,
      fecha_inicio: null,
      notas: null,
      negocio_id: null,
      producto_id: productoId,
    });
    expect(res.status).toBe(201);

    const pago = await post('/nomina/pagos', {
      empleado_id: res.body.id,
      periodo_inicio: '2026-09-01',
      periodo_fin: '2026-09-15',
      fecha_pago: '2026-09-15',
      notas: null,
    });
    expect(pago.status).toBe(201);
  });
});
