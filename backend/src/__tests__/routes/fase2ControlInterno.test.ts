import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * Fase 2 — control interno de caja.
 *
 * Lo que se prueba aquí es el fraude clásico de un negocio con empleados:
 * cobrar, "cancelar" la venta y quedarse el efectivo; cobrar un precio distinto
 * al de la lista; o retocar la contabilidad para que cuadre. Antes todo eso era
 * posible y no dejaba rastro.
 */
describeWithDb('Fase 2 — control interno del dinero', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const cuentas: string[] = [];

  const token = (userId: string) =>
    jwt.sign({ userId, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '15m', algorithm: 'HS256' });

  const cliente = (tok: string) => ({
    get: (ruta: string) => request.default(app).get(`/api${ruta}`).set('Authorization', `Bearer ${tok}`),
    post: (ruta: string, body: object = {}) =>
      request.default(app).post(`/api${ruta}`).set('Authorization', `Bearer ${tok}`).send(body),
    patch: (ruta: string, body: object = {}) =>
      request.default(app).patch(`/api${ruta}`).set('Authorization', `Bearer ${tok}`).send(body),
    put: (ruta: string, body: object = {}) =>
      request.default(app).put(`/api${ruta}`).set('Authorization', `Bearer ${tok}`).send(body),
    delete: (ruta: string, body: object = {}) =>
      request.default(app).delete(`/api${ruta}`).set('Authorization', `Bearer ${tok}`).send(body),
  });

  /** Cuenta con producto, un item de catálogo a 100 y (opcional) un trabajador. */
  const crearCuenta = async (permisosTrabajador: Record<string, boolean> | null = null) => {
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Fase 2', 'business') RETURNING id`,
      [`fase2-${randomUUID()}@example.com`],
    );
    cuentas.push(u.id);
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Cafetería', 'MX') RETURNING id`, [u.id]);
    const api = cliente(token(u.id));
    const item = await api.post('/pos/catalogo', { nombre: 'Café', precio: 100 });

    let trabajador: ReturnType<typeof cliente> | null = null;
    let trabajadorId: string | null = null;
    if (permisosTrabajador) {
      const [t] = await q(
        `INSERT INTO usuarios (email, password_hash, nombre, plan, account_role, owner_id)
         VALUES ($1, 'x', 'Cajero', 'business', 'trabajador', $2) RETURNING id`,
        [`cajero-${randomUUID()}@example.com`, u.id],
      );
      cuentas.push(t.id);
      trabajadorId = t.id;
      await q(
        `INSERT INTO asignaciones_trabajador (trabajador_id, cuenta_id, producto_id, permisos) VALUES ($1, $2, $3, $4::jsonb)`,
        [t.id, u.id, p.id, JSON.stringify(permisosTrabajador)],
      );
      trabajador = cliente(token(t.id));
    }
    return { uid: u.id as string, pid: p.id as string, itemId: item.body.id as string, api, trabajador, trabajadorId };
  };

  const vender = (api: ReturnType<typeof cliente>, pid: string, itemId: string, precio = 100, extra: object = {}) =>
    api.post('/pos/ventas', {
      producto_id: pid,
      lineas: [{ item_pos_id: itemId, nombre: 'Café', precio_unitario: precio, cantidad: 1 }],
      ...extra,
    });

  beforeAll(async () => {
    await initTestDb();
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [cuentas]).catch(() => undefined);
    await closeTestDb();
  });

  // ── Cancelación de ventas ───────────────────────────────────────────────────

  describe('Cancelar una venta', () => {
    it('un cajero sin permiso no puede; con permiso sí, y queda su nombre en la auditoría', async () => {
      const c = await crearCuenta({ pos: true });
      const venta = (await vender(c.trabajador!, c.pid, c.itemId)).body.venta;

      const sinPermiso = await c.trabajador!.post(`/pos/ventas/${venta.id}/cancelar`, { motivo: 'me lo quedo' });
      expect(sinPermiso.status).toBe(403);
      expect(sinPermiso.body.permiso).toBe('cancelar_ventas');
      expect((await q(`SELECT estado FROM ventas WHERE id = $1`, [venta.id]))[0].estado).toBe('completada');

      // El dueño le concede el permiso: ahora sí, y con rastro.
      await q(`UPDATE asignaciones_trabajador SET permisos = permisos || '{"cancelar_ventas": true}'::jsonb WHERE trabajador_id = $1`, [
        c.trabajadorId,
      ]);
      const conPermiso = await c.trabajador!.post(`/pos/ventas/${venta.id}/cancelar`, { motivo: 'Cliente se arrepintió' });
      expect(conPermiso.status).toBe(200);

      const [fila] = await q(`SELECT estado, cancelada_por_id, motivo_cancelacion, fecha_cancelacion FROM ventas WHERE id = $1`, [
        venta.id,
      ]);
      expect(fila.estado).toBe('cancelada');
      expect(fila.cancelada_por_id).toBe(c.trabajadorId); // la persona real, no la cuenta
      expect(fila.motivo_cancelacion).toBe('Cliente se arrepintió');
      expect(fila.fecha_cancelacion).not.toBeNull();

      const [aud] = await q(`SELECT accion, actor_id, monto_antes::float AS monto_antes FROM auditoria_dinero WHERE entidad_id = $1`, [
        venta.id,
      ]);
      expect(aud).toMatchObject({ accion: 'venta_cancelada', actor_id: c.trabajadorId });
      expect(aud.monto_antes).toBe(100); // el precio del catálogo ya incluye el IVA
    });

    it('la venta no se borra: queda cancelada con asientos inversos y fuera de reportes', async () => {
      const c = await crearCuenta();
      const venta = (await vender(c.api, c.pid, c.itemId)).body.venta;

      expect((await c.api.post(`/pos/ventas/${venta.id}/cancelar`, {})).status).toBe(200);

      // Sigue existiendo, con sus líneas.
      expect((await q(`SELECT COUNT(*)::int AS n FROM venta_items WHERE venta_id = $1`, [venta.id]))[0].n).toBe(1);

      // Cada asiento tiene su inverso y la suma queda en cero.
      const [neto] = await q(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)::float AS neto,
                COUNT(*) FILTER (WHERE categoria = 'Cancelaciones')::int AS inversos
           FROM movimientos_contables WHERE referencia_tipo = 'venta' AND referencia_id = $1`,
        [venta.id],
      );
      expect(neto.neto).toBe(0);
      expect(neto.inversos).toBeGreaterThan(0);

      // El importe cancelado deja de contar como venta.
      const dia = (await q(`SELECT to_char(fecha, 'YYYY-MM-DD') AS d FROM ventas WHERE id = $1`, [venta.id]))[0].d;
      const rep = await c.api.get(`/reportes/area/ventas?desde=${dia}&hasta=${dia}&producto_id=${c.pid}`);
      expect(rep.status).toBe(200);
      expect(rep.body.totales.num_ventas).toBe(0);
    });

    it('cancelar dos veces es 409 y no duplica asientos', async () => {
      const c = await crearCuenta();
      const venta = (await vender(c.api, c.pid, c.itemId)).body.venta;
      await c.api.post(`/pos/ventas/${venta.id}/cancelar`, {});
      const antes = (await q(`SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE referencia_id = $1`, [venta.id]))[0].n;

      expect((await c.api.post(`/pos/ventas/${venta.id}/cancelar`, {})).status).toBe(409);
      // DELETE es el alias antiguo: tampoco vuelve a cancelar ni borra nada.
      expect((await c.api.delete(`/pos/ventas/${venta.id}`)).status).toBe(409);
      expect((await q(`SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE referencia_id = $1`, [venta.id]))[0].n).toBe(antes);
      expect((await q(`SELECT COUNT(*)::int AS n FROM ventas WHERE id = $1`, [venta.id]))[0].n).toBe(1);
    });

    it('lo cobrado con terminal deja de esperar depósito al cancelarse', async () => {
      const c = await crearCuenta();
      const canal = await c.api.post(`/contabilidad/${c.pid}/canales`, {
        nombre: 'Terminal',
        tipo_canal: 'terminal',
        institucion: 'Banco',
        comision_porcentaje: 0.036,
        dias_liquidacion: 2,
      });
      const venta = (await vender(c.api, c.pid, c.itemId, 100, { canal_cobro_id: canal.body.id })).body.venta;
      expect((await c.api.get(`/contabilidad/${c.pid}/liquidaciones`)).body.kpis.conteo_pendientes).toBe(1);

      await c.api.post(`/pos/ventas/${venta.id}/cancelar`, {});
      expect((await c.api.get(`/contabilidad/${c.pid}/liquidaciones`)).body.kpis.conteo_pendientes).toBe(0);
    });
  });

  // ── Precio del catálogo ─────────────────────────────────────────────────────

  // ── Impuesto al consumo ─────────────────────────────────────────────────────

  describe('Si el negocio cobra IVA lo decide el dueño en el punto de cobro', () => {
    it('sin IVA se cobra lo mismo y no se registra impuesto; el cajero no lo puede cambiar', async () => {
      const c = await crearCuenta({ pos: true });

      const inicial = await c.api.get(`/pos/punto-cobro/${c.pid}`);
      expect(inicial.status).toBe(200);
      expect(inicial.body).toMatchObject({ cobra_impuesto: true, impuesto: { nombre: 'IVA', tasa: 0.16 }, puede_cambiar: true });

      // El cajero ve la configuración pero no la cambia: es el régimen fiscal del dueño.
      expect((await c.trabajador!.get(`/pos/punto-cobro/${c.pid}`)).body.puede_cambiar).toBe(false);
      expect((await c.trabajador!.patch(`/pos/punto-cobro/${c.pid}`, { cobra_impuesto: false })).status).toBe(403);

      // Con IVA: 100 de catálogo = 100 cobrados, 13.79 de IVA dentro.
      const conIva = (await vender(c.api, c.pid, c.itemId)).body.venta;
      expect(Number(conIva.total)).toBe(100);
      expect(Number(conIva.impuesto_monto)).toBe(13.79);

      // Monotributo, Nuevo RUS, no responsable de IVA: se cobra igual, sin impuesto registrado.
      expect((await c.api.patch(`/pos/punto-cobro/${c.pid}`, { cobra_impuesto: false })).body.cobra_impuesto).toBe(false);
      const sinIva = (await vender(c.trabajador!, c.pid, c.itemId)).body.venta;
      expect(Number(sinIva.total)).toBe(100);
      expect(Number(sinIva.impuesto_monto)).toBe(0);
      const porPagar = await q(
        `SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE referencia_id = $1 AND categoria LIKE '% por pagar'`,
        [sinIva.id],
      );
      expect(porPagar[0].n).toBe(0);

      expect((await c.api.patch(`/pos/punto-cobro/${c.pid}`, { cobra_impuesto: 'no' })).status).toBe(400);
      expect((await c.api.get(`/pos/punto-cobro/${randomUUID()}`)).status).toBe(404);
    });
  });

  describe('El precio lo pone el catálogo', () => {
    it('un cajero sin permiso no puede cobrar otro precio; con permiso queda registrado', async () => {
      const c = await crearCuenta({ pos: true });
      const rebajada = await vender(c.trabajador!, c.pid, c.itemId, 10);
      expect(rebajada.status).toBe(403);
      expect(rebajada.body.permiso).toBe('precio_libre');

      await q(`UPDATE asignaciones_trabajador SET permisos = permisos || '{"precio_libre": true}'::jsonb WHERE trabajador_id = $1`, [
        c.trabajadorId,
      ]);
      const conPermiso = await vender(c.trabajador!, c.pid, c.itemId, 10);
      expect(conPermiso.status).toBe(201);

      const [linea] = await q(
        `SELECT precio_unitario::float AS cobrado, precio_catalogo::float AS lista FROM venta_items WHERE venta_id = $1`,
        [conPermiso.body.venta.id],
      );
      expect(linea).toEqual({ cobrado: 10, lista: 100 });

      const [aud] = await q(
        `SELECT accion, monto_antes::float AS antes, monto_despues::float AS despues FROM auditoria_dinero
          WHERE entidad_id = $1 AND accion = 'precio_fuera_de_catalogo'`,
        [conPermiso.body.venta.id],
      );
      expect(aud).toEqual({ accion: 'precio_fuera_de_catalogo', antes: 100, despues: 10 });
    });

    it('el precio de lista se guarda aunque nadie lo cambie, y un item ajeno es 404', async () => {
      const c = await crearCuenta();
      const otra = await crearCuenta();

      const normal = await vender(c.api, c.pid, c.itemId, 100);
      expect(normal.status).toBe(201);
      const [linea] = await q(`SELECT precio_catalogo::float AS lista FROM venta_items WHERE venta_id = $1`, [normal.body.venta.id]);
      expect(linea.lista).toBe(100);
      // Sin auditoría: no hubo nada que auditar.
      expect(
        (await q(`SELECT COUNT(*)::int AS n FROM auditoria_dinero WHERE entidad_id = $1`, [normal.body.venta.id]))[0].n,
      ).toBe(0);

      // Un item del catálogo de OTRA cuenta ya no se enlaza en silencio.
      expect((await vender(c.api, c.pid, otra.itemId, 100)).status).toBe(404);
    });
  });

  // ── Asientos derivados ──────────────────────────────────────────────────────

  describe('Contabilidad: lo derivado se corrige en su herramienta', () => {
    it('el asiento de una venta no se edita ni se borra desde Contabilidad', async () => {
      const c = await crearCuenta();
      const r = await vender(c.api, c.pid, c.itemId);
      const movId = r.body.movimiento_contable_id;

      const editar = await c.api.patch(`/contabilidad/movimiento/${movId}`, { monto: 1 });
      expect(editar.status).toBe(409);
      expect(editar.body.referencia_tipo).toBe('venta');
      expect((await c.api.delete(`/contabilidad/movimiento/${movId}`)).status).toBe(409);
      expect((await q(`SELECT monto::float AS monto FROM movimientos_contables WHERE id = $1`, [movId]))[0].monto).toBe(100);
    });

    it('un asiento manual sí se edita y se borra, y ambas cosas quedan auditadas', async () => {
      const c = await crearCuenta();
      const mov = await c.api.post(`/contabilidad/${c.pid}`, {
        tipo: 'egreso',
        descripcion: 'Servilletas',
        monto: 100,
        fecha: '2026-09-10',
      });
      expect(mov.status).toBe(201);

      expect((await c.api.patch(`/contabilidad/movimiento/${mov.body.id}`, { monto: 250 })).status).toBe(200);
      expect((await c.api.delete(`/contabilidad/movimiento/${mov.body.id}`)).status).toBe(200);

      const auditoria = await q(
        `SELECT accion, monto_antes::float AS antes, monto_despues::float AS despues FROM auditoria_dinero
          WHERE entidad_id = $1 ORDER BY fecha_creacion`,
        [mov.body.id],
      );
      expect(auditoria).toEqual([
        { accion: 'movimiento_editado', antes: 100, despues: 250 },
        { accion: 'movimiento_borrado', antes: 250, despues: null },
      ]);
    });

    it('la auditoría la ve el dueño, no el trabajador', async () => {
      const c = await crearCuenta({ pos: true, contabilidad: true });
      expect((await c.api.get('/contabilidad/auditoria')).status).toBe(200);
      expect((await c.trabajador!.get('/contabilidad/auditoria')).status).toBe(403);
    });
  });

  // ── Almacén ─────────────────────────────────────────────────────────────────

  it('un movimiento de almacén generado por una venta no se borra a mano', async () => {
    const c = await crearCuenta();
    const insumo = await c.api.post('/inventario/insumos', { nombre: 'Vaso', stock_actual: 10 });
    await c.api.put(`/pos/catalogo/${c.itemId}/receta`, { insumos: [{ insumo_id: insumo.body.id, cantidad: 1 }] });
    const venta = (await vender(c.api, c.pid, c.itemId)).body.venta;

    const [mov] = await q(`SELECT id FROM movimientos_inventario WHERE venta_id = $1`, [venta.id]);
    const r = await c.api.delete(`/inventario/movimientos/${mov.id}`);
    expect(r.status).toBe(409);
    expect(r.body.venta_id).toBe(venta.id);
  });

  // ── Moneda ──────────────────────────────────────────────────────────────────

  it('empleados y cotizaciones de un negocio mexicano nacen en MXN, no en dólares', async () => {
    const c = await crearCuenta();
    const emp = await c.api.post('/nomina/empleados', { nombre: 'Ana', salario: 8000, producto_id: c.pid });
    expect(emp.body.moneda).toBe('MXN');

    const cot = await c.api.post('/cotizaciones', { cliente_nombre: 'ACME', producto_id: c.pid, items: [] });
    expect(cot.body.moneda).toBe('MXN');

    // Una moneda explícita se respeta.
    const enDolares = await c.api.post('/nomina/empleados', { nombre: 'Bob', salario: 500, moneda: 'USD', producto_id: c.pid });
    expect(enDolares.body.moneda).toBe('USD');
  });
});
