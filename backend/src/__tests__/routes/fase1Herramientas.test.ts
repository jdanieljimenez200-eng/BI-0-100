import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import type { Request } from 'express';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { usuarioParaLimite } from '../../middleware/cors';

/**
 * Fase 1 del análisis del backend de herramientas
 * (docs/audit/ANALISIS_BACKEND_HERRAMIENTAS_2026-09-17.md): folios O(1),
 * gating con memo y caché invalidable, idempotencia, paginación por cursor,
 * rate limit por usuario, validación con topes y CSV atómico.
 */
describeWithDb('Fase 1 — escala y control de las herramientas', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const cuentas: string[] = [];

  const crearCuenta = async (plan = 'business') => {
    const email = `fase1-${randomUUID()}@example.com`;
    const [u] = await q(`INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Fase 1', $2) RETURNING id`, [email, plan]);
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Café', 'MX') RETURNING id`, [u.id]);
    cuentas.push(u.id);
    const token = jwt.sign({ userId: u.id, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '15m', algorithm: 'HS256' });
    const conAuth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const api = {
      get: (ruta: string) => conAuth(request.default(app).get(`/api${ruta}`)),
      post: (ruta: string, body: object = {}) => conAuth(request.default(app).post(`/api${ruta}`)).send(body),
      patch: (ruta: string, body: object = {}) => conAuth(request.default(app).patch(`/api${ruta}`)).send(body),
      delete: (ruta: string, body: object = {}) => conAuth(request.default(app).delete(`/api${ruta}`)).send(body),
    };
    return { uid: u.id as string, pid: p.id as string, token, api };
  };
  const venta = (pid: string, extra: object = {}) => ({
    producto_id: pid,
    lineas: [{ nombre: 'Café', precio_unitario: 40, cantidad: 1 }],
    ...extra,
  });

  beforeAll(async () => {
    await initTestDb();
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [cuentas]).catch(() => undefined);
    await closeTestDb();
  });

  // ── Folios ───────────────────────────────────────────────────────────────────

  describe('Folios con contador O(1)', () => {
    it('20 ventas simultáneas reciben 20 folios distintos y consecutivos', async () => {
      const c = await crearCuenta();
      const rs = await Promise.all(Array.from({ length: 20 }, () => c.api.post('/pos/ventas', venta(c.pid))));
      expect(rs.every((r) => r.status === 201)).toBe(true);
      const folios = rs.map((r) => r.body.venta.numero_ticket as string).sort();
      expect(folios).toEqual(Array.from({ length: 20 }, (_, i) => `POS-${String(i + 1).padStart(6, '0')}`));
      const [sec] = await q(`SELECT ultimo FROM secuencias_folio WHERE usuario_id = $1 AND tipo = 'venta'`, [c.uid]);
      expect(sec.ultimo).toBe(20);
    });

    it('se siembra con lo existente y se corrige solo si se desincroniza', async () => {
      const c = await crearCuenta();
      await q(
        `INSERT INTO ventas (usuario_id, producto_id, numero_ticket, fecha, subtotal, impuesto_monto, impuesto_tasa, impuesto_nombre, moneda, total, metodo_pago, estado)
         VALUES ($1, $2, 'POS-000050', CURRENT_DATE, 1, 0, 0, 'IVA', 'MXN', 1, 'efectivo', 'completada'),
                ($1, $2, 'IMP-99999999999', CURRENT_DATE, 1, 0, 0, 'IVA', 'MXN', 1, 'efectivo', 'completada')`,
        [c.uid, c.pid]
      );
      // Sin contador: se siembra desde el máximo con formato propio (ignora el importado)
      const r1 = await c.api.post('/pos/ventas', venta(c.pid));
      expect(r1.body.venta.numero_ticket).toBe('POS-000051');

      // Alguien inserta por fuera (seed): el contador va por detrás y se corrige
      await q(
        `INSERT INTO ventas (usuario_id, producto_id, numero_ticket, fecha, subtotal, impuesto_monto, impuesto_tasa, impuesto_nombre, moneda, total, metodo_pago, estado)
         VALUES ($1, $2, 'POS-000052', CURRENT_DATE, 1, 0, 0, 'IVA', 'MXN', 1, 'efectivo', 'completada'),
                ($1, $2, 'POS-000060', CURRENT_DATE, 1, 0, 0, 'IVA', 'MXN', 1, 'efectivo', 'completada')`,
        [c.uid, c.pid]
      );
      const r2 = await c.api.post('/pos/ventas', venta(c.pid));
      expect(r2.status).toBe(201);
      expect(r2.body.venta.numero_ticket).toBe('POS-000061');
    });

    it('las cotizaciones siguen su propia secuencia', async () => {
      const c = await crearCuenta();
      const a = await c.api.post('/cotizaciones', { cliente_nombre: 'A', items: [] });
      const b = await c.api.post('/cotizaciones', { cliente_nombre: 'B', items: [] });
      expect([a.body.numero, b.body.numero]).toEqual(['COT-000001', 'COT-000002']);
    });
  });

  // ── Idempotencia ─────────────────────────────────────────────────────────────

  describe('Idempotency-Key', () => {
    it('el mismo cobro enviado dos veces a la vez crea UNA venta', async () => {
      const c = await crearCuenta();
      const clave = randomUUID();
      const [a, b] = await Promise.all([
        c.api.post('/pos/ventas', venta(c.pid)).set('Idempotency-Key', clave),
        c.api.post('/pos/ventas', venta(c.pid)).set('Idempotency-Key', clave),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.venta.id).toBe(b.body.venta.id);
      expect([a.headers['idempotent-replayed'], b.headers['idempotent-replayed']]).toContain('true');
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM ventas WHERE usuario_id = $1`, [c.uid]);
      expect(n).toBe(1);

      // Un reintento posterior (p. ej. tras un corte de red) repite la respuesta
      const tarde = await c.api.post('/pos/ventas', venta(c.pid)).set('Idempotency-Key', clave);
      expect(tarde.body.venta.id).toBe(a.body.venta.id);
    });

    it('misma clave con otro contenido es 422; sin clave, dos cobros', async () => {
      const c = await crearCuenta();
      const clave = randomUUID();
      await c.api.post('/pos/ventas', venta(c.pid)).set('Idempotency-Key', clave);
      const otra = await c.api
        .post('/pos/ventas', venta(c.pid, { lineas: [{ nombre: 'Té', precio_unitario: 30, cantidad: 1 }] }))
        .set('Idempotency-Key', clave);
      expect(otra.status).toBe(422);

      await c.api.post('/pos/ventas', venta(c.pid));
      await c.api.post('/pos/ventas', venta(c.pid));
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM ventas WHERE usuario_id = $1`, [c.uid]);
      expect(n).toBe(3);

      expect((await c.api.post('/pos/ventas', venta(c.pid)).set('Idempotency-Key', 'corta')).status).toBe(400);
    });

    it('también protege el pago de nómina y la conversión de cotizaciones', async () => {
      const c = await crearCuenta();
      const emp = await c.api.post('/nomina/empleados', { nombre: 'Rosa', salario: 9000, moneda: 'MXN' });
      const pago = { empleado_id: emp.body.id, periodo_inicio: '2026-09-01', periodo_fin: '2026-09-15', fecha_pago: '2026-09-15' };
      const clave = randomUUID();
      await Promise.all([1, 2, 3].map(() => c.api.post('/nomina/pagos', pago).set('Idempotency-Key', clave)));
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM pagos_nomina WHERE empleado_id = $1`, [emp.body.id]);
      expect(n).toBe(1);
    });
  });

  // ── Tope gratuito sin carreras ───────────────────────────────────────────────

  it('6 altas simultáneas con tope gratuito de 2 crean exactamente 2', async () => {
    const c = await crearCuenta('freemium');
    const rs = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => c.api.post('/clientes', { nombre: `Cliente ${i}` })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 201, 429, 429, 429, 429]);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM clientes WHERE usuario_id = $1`, [c.uid]);
    expect(n).toBe(2);
  });

  // ── Gating: caché de la selección invalidada al cambiarla ────────────────────

  it('seleccionar y quitar una herramienta se nota al instante (sin esperar la caché)', async () => {
    const c = await crearCuenta('pro');
    expect((await c.api.get('/clientes')).status).toBe(403);
    const sel = await c.api.post('/herramientas/seleccionar', { herramienta_key: 'clientes' });
    expect([200, 201]).toContain(sel.status);
    expect((await c.api.get('/clientes')).status).toBe(200);
    expect((await c.api.delete('/herramientas/deseleccionar', { herramienta_key: 'clientes' })).status).toBe(200);
    expect((await c.api.get('/clientes')).status).toBe(403);
  });

  it('el pool limita el tiempo por consulta', async () => {
    const [fila] = await q(`SHOW statement_timeout`);
    expect(fila.statement_timeout).toBe('30s');
  });

  // ── Paginación ───────────────────────────────────────────────────────────────

  describe('Paginación por cursor', () => {
    it('ventas: cada página trae ventas completas con todos sus ítems', async () => {
      const c = await crearCuenta();
      for (let i = 0; i < 5; i++) {
        await c.api.post('/pos/ventas', {
          producto_id: c.pid,
          lineas: [
            { nombre: 'Café', precio_unitario: 40, cantidad: 1 },
            { nombre: 'Pan', precio_unitario: 20, cantidad: 2 },
          ],
        });
      }
      const p1 = await c.api.get('/pos/ventas?limite=3');
      expect(p1.body).toHaveLength(3); // antes: LIMIT sobre filas unidas → 1-2 ventas
      expect(p1.body.every((v: { items: unknown[] }) => v.items.length === 2)).toBe(true);
      expect(p1.headers['x-siguiente']).toBeTruthy();
      const p2 = await c.api.get(`/pos/ventas?limite=3&antes=${p1.headers['x-siguiente']}`);
      expect(p2.body).toHaveLength(2);
      expect(p2.headers['x-siguiente']).toBeUndefined();
      const ids = [...p1.body, ...p2.body].map((v: { id: string }) => v.id);
      expect(new Set(ids).size).toBe(5);
      expect((await c.api.get('/pos/ventas?antes=basura')).status).toBe(400);
    });

    it('clientes, cotizaciones, movimientos de inventario y pagos de nómina paginan', async () => {
      const c = await crearCuenta();
      for (let i = 0; i < 3; i++) {
        await c.api.post('/clientes', { nombre: `C${i}` });
        await c.api.post('/cotizaciones', { cliente_nombre: `Q${i}`, items: [] });
      }
      const insumo = await c.api.post('/inventario/insumos', { nombre: 'Leche', stock_actual: 10 });
      // Tres movimientos: el inventario inicial y dos mermas.
      for (let i = 0; i < 2; i++) await c.api.post('/inventario/movimientos', { insumo_id: insumo.body.id, tipo: 'merma', cantidad: 1 });
      const emp = await c.api.post('/nomina/empleados', { nombre: 'Ana', salario: 1000, moneda: 'MXN' });
      for (const d of ['01', '02', '03']) {
        await c.api.post('/nomina/pagos', { empleado_id: emp.body.id, periodo_inicio: `2026-09-${d}`, periodo_fin: `2026-09-${d}`, fecha_pago: `2026-09-${d}` });
      }
      for (const ruta of ['/clientes', '/cotizaciones', '/inventario/movimientos', '/nomina/pagos']) {
        const p1 = await c.api.get(`${ruta}?limite=2`);
        expect({ ruta, n: p1.body.length }).toEqual({ ruta, n: 2 });
        const p2 = await c.api.get(`${ruta}?limite=2&antes=${p1.headers['x-siguiente']}`);
        expect({ ruta, n: p2.body.length, siguiente: p2.headers['x-siguiente'] }).toEqual({ ruta, n: 1, siguiente: undefined });
      }
    });

    it('historial de mantenimiento: pagina y el gasto total suma todo, no solo la página', async () => {
      const c = await crearCuenta();
      const equipo = await c.api.post('/mantenimientos', { nombre: 'Refrigerador' });
      for (const [costo, fecha] of [[100, '2026-01-10'], [200, '2026-03-10'], [300.5, '2026-05-10']] as const) {
        await c.api.post(`/mantenimientos/${equipo.body.id}/registrar`, { costo, fecha });
      }
      const p1 = await c.api.get(`/mantenimientos/${equipo.body.id}/historial?limite=2`);
      expect(p1.body.historial.map((h: { fecha: string }) => h.fecha)).toEqual(['2026-05-10', '2026-03-10']);
      expect(p1.body.gasto_total).toBe(600.5);
      const p2 = await c.api.get(`/mantenimientos/${equipo.body.id}/historial?limite=2&antes=${p1.headers['x-siguiente']}`);
      expect(p2.body.historial.map((h: { fecha: string }) => h.fecha)).toEqual(['2026-01-10']);
      expect(p2.headers['x-siguiente']).toBeUndefined();
      expect((await c.api.get('/mantenimientos?negocio_id=no-es-uuid')).status).toBe(400);
    });
  });

  // ── Rate limit por usuario ───────────────────────────────────────────────────

  it('el rate limit cuenta por usuario solo con un token con firma válida', () => {
    const uid = randomUUID();
    const valido = jwt.sign({ userId: uid }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
    const falso = jwt.sign({ userId: uid }, 'otro-secreto-cualquiera-de-32-caracteres', { algorithm: 'HS256' });
    const req = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {}, cookies: {} }) as unknown as Request;
    expect(usuarioParaLimite(req(valido))).toBe(uid);
    expect(usuarioParaLimite(req(falso))).toBeNull(); // nadie puede gastar el cupo de otro
    expect(usuarioParaLimite(req())).toBeNull();
  });

  // ── Validación ───────────────────────────────────────────────────────────────

  describe('Validación con topes de columna', () => {
    it('inventario rechaza texto en números, tipos inventados y salidas sin stock con 400', async () => {
      const c = await crearCuenta();
      expect((await c.api.post('/inventario/insumos', { nombre: 'Harina', stock_actual: 'mucho' })).status).toBe(400);
      const ins = await c.api.post('/inventario/insumos', { nombre: 'Harina', stock_actual: 2 });
      expect((await c.api.patch(`/inventario/insumos/${ins.body.id}`, { nombre: null })).status).toBe(400);
      expect((await c.api.patch(`/inventario/insumos/${ins.body.id}`, { stock_minimo: 'x' })).status).toBe(400);
      expect((await c.api.post('/inventario/movimientos', { insumo_id: ins.body.id, tipo: 'robo', cantidad: 1 })).status).toBe(400);
      const sin = await c.api.post('/inventario/movimientos', { insumo_id: ins.body.id, tipo: 'salida', cantidad: 5 });
      expect(sin.status).toBe(400);
      expect(sin.body.error).toMatch(/No hay stock suficiente/);
      expect((await c.api.post('/inventario/movimientos', { insumo_id: 'no-uuid', tipo: 'entrada', cantidad: 1 })).status).toBe(400);
    });

    it('POS: precios desbordados son 400 y 0.125 kg se guarda completo', async () => {
      const c = await crearCuenta();
      expect((await c.api.post('/pos/ventas', venta(c.pid, { lineas: [{ nombre: 'A', precio_unitario: 1e12, cantidad: 1 }] }))).status).toBe(400);
      expect(
        (await c.api.post('/pos/ventas', venta(c.pid, { lineas: [{ nombre: 'A', precio_unitario: 9_000_000_000, cantidad: 2 }] }))).status
      ).toBe(400);
      const fino = await c.api.post('/pos/ventas', venta(c.pid, { lineas: [{ nombre: 'Queso', precio_unitario: 10, cantidad: 0.125 }] }));
      expect(fino.status).toBe(201);
      const [it] = await q(`SELECT cantidad::text, subtotal_linea::text FROM venta_items WHERE venta_id = $1`, [fino.body.venta.id]);
      // 10 × 0.125 = 1.25 cobrados; la línea guarda el importe sin el IVA incluido (1.25 / 1.16).
      expect(it).toEqual({ cantidad: '0.125', subtotal_linea: '1.08' });
      expect(Number(fino.body.venta.total)).toBe(1.25);

      const item = await c.api.post('/pos/catalogo', { nombre: 'Latte', precio: 50 });
      expect((await c.api.patch(`/pos/catalogo/${item.body.id}`, { precio: 'caro' })).status).toBe(400);
      expect((await c.api.patch(`/pos/catalogo/${item.body.id}`, { nombre: null })).status).toBe(400);
      expect((await c.api.patch(`/pos/catalogo/${item.body.id}`, { precio: 55, activo: false })).status).toBe(200);
      expect((await c.api.post('/pos/catalogo', { nombre: 'X', precio: 1, negocio_id: randomUUID() })).status).toBe(404);
    });

    it('contabilidad: edición validada e importación CSV atómica y solo sobre productos propios', async () => {
      const c = await crearCuenta();
      const otro = await crearCuenta();
      const mov = await c.api.post(`/contabilidad/${c.pid}`, { tipo: 'egreso', descripcion: 'Luz', monto: 100, fecha: '2026-09-01' });
      const id = mov.body.id;
      expect((await c.api.patch(`/contabilidad/movimiento/${id}`, { monto: -5 })).status).toBe(400);
      expect((await c.api.patch(`/contabilidad/movimiento/${id}`, { descripcion: '  ' })).status).toBe(400);
      expect(Number((await c.api.patch(`/contabilidad/movimiento/${id}`, { monto: 120 })).body.monto)).toBe(120);

      const rows = [
        { fecha: '2026-02-10', tipo: 'ingreso', descripcion: 'ok', monto: 10 },
        { fecha: '2026-02-30', tipo: 'ingreso', descripcion: 'fecha imposible', monto: 10 },
      ];
      const r = await c.api.post(`/contabilidad/${c.pid}/import`, { rows });
      expect(r.status).toBe(201);
      expect(r.body.importados).toBe(1);
      expect(r.body.errores).toEqual([expect.objectContaining({ fila: 3 })]);

      expect((await c.api.post(`/contabilidad/${otro.pid}/import`, { rows })).status).toBe(404);
    });
  });
});
