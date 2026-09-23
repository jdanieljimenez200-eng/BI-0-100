import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { hoyEnZona } from '../../utils/fechaLocal';

/**
 * Conciliar una liquidación (PATCH /contabilidad/liquidaciones/:id/conciliar).
 *
 * La fecha llegaba del cuerpo sin validar y se guardaba directa en una columna
 * `date`: un texto cualquiera rompía la query y salía como 500 en vez de 400.
 */
describeWithDb('Conciliación de liquidaciones', () => {
  let usuarioId: string;
  let otroUsuarioId: string;
  let productoId: string;
  let token: string;

  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const tokenDe = (uid: string, email: string) =>
    jwt.sign({ userId: uid, email, role: 'owner', jti: randomUUID() }, process.env.JWT_SECRET!, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });

  const crearMovimiento = async (dueno = usuarioId): Promise<string> => {
    const [mov] = await q(
      `INSERT INTO movimientos_contables
         (usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente, estado_liquidacion)
       VALUES ($1, $2, 'ingreso', 'Venta con terminal', 'Ventas', 1000, CURRENT_DATE, 'pos', 'pendiente')
       RETURNING id`,
      [dueno, dueno === usuarioId ? productoId : null]
    );
    return mov.id;
  };

  beforeAll(async () => {
    await initTestDb();
    const email = `liq-${randomUUID()}@example.com`;
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Liquidaciones', 'business') RETURNING id`,
      [email]
    );
    usuarioId = u.id;
    token = tokenDe(u.id, email);

    const [p] = await q(
      `INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Producto liquidaciones', 'MX') RETURNING id`,
      [usuarioId]
    );
    productoId = p.id;

    const [otro] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Otro', 'business') RETURNING id`,
      [`liq-otro-${randomUUID()}@example.com`]
    );
    otroUsuarioId = otro.id;
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [[usuarioId, otroUsuarioId]]).catch(() => undefined);
    await closeTestDb();
  });

  const conciliar = (id: string, body: object) =>
    request.default(app)
      .patch(`/api/contabilidad/liquidaciones/${id}/conciliar`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('marca la liquidación con la fecha enviada', async () => {
    const id = await crearMovimiento();
    const res = await conciliar(id, { fecha_liquidacion: '2026-09-10' });

    expect(res.status).toBe(200);
    expect(res.body.movimiento).toMatchObject({ estado_liquidacion: 'liquidado', fecha_liquidacion: '2026-09-10' });
  });

  it('sin fecha usa hoy', async () => {
    const id = await crearMovimiento();
    const res = await conciliar(id, {});

    expect(res.status).toBe(200);
    expect(res.body.movimiento.fecha_liquidacion).toBe(hoyEnZona('America/Mexico_City'));
  });

  it('una fecha con formato inválido responde 400, no 500', async () => {
    const id = await crearMovimiento();

    for (const fecha of ['ayer', '10/09/2026', '2026-13-45', "2026-09-10'; DROP TABLE movimientos_contables; --"]) {
      const res = await conciliar(id, { fecha_liquidacion: fecha });
      expect(res.status).toBe(400);
    }

    const [{ estado_liquidacion }] = await q(`SELECT estado_liquidacion FROM movimientos_contables WHERE id = $1`, [id]);
    expect(estado_liquidacion).toBe('pendiente');
    // La tabla sigue ahí: el intento de inyección no llegó a la base.
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM movimientos_contables WHERE usuario_id = $1`, [usuarioId]);
    expect(n).toBeGreaterThan(0);
  });

  it('no se puede conciliar el movimiento de otra cuenta', async () => {
    const ajeno = await crearMovimiento(otroUsuarioId);
    const res = await conciliar(ajeno, { fecha_liquidacion: '2026-09-10' });
    expect(res.status).toBe(404);
  });

  it('un id que no es UUID responde 400', async () => {
    const res = await conciliar('no-es-uuid', {});
    expect(res.status).toBe(400);
  });
});
