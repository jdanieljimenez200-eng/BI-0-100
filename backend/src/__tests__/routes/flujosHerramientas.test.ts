import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * Las herramientas sincronizadas entre sí, de punta a punta.
 *
 *   POS (receta + canal de cobro) → inventario, contabilidad con comisiones,
 *   liquidaciones, CRM y reportes; y la cancelación lo revierte todo.
 *   Cotización → venta → cancelación.
 *   Compra de inventario y pago de nómina → egresos.
 *   Clientes y movimientos manuales: validación y aislamiento entre cuentas.
 */
describeWithDb('Flujos entre herramientas', () => {
  let cuentaId: string;
  let otraId: string;
  let token: string;
  let tokenOtra: string;
  let productoId: string;
  let productoAjenoId: string;

  const HOY = new Date().toISOString().slice(0, 10);

  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const tokenDe = (uid: string, email: string) =>
    jwt.sign({ userId: uid, email, role: 'owner', jti: randomUUID() }, process.env.JWT_SECRET!, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });
  const api = (t = token) => ({
    get: (ruta: string) => request.default(app).get(`/api${ruta}`).set('Authorization', `Bearer ${t}`),
    post: (ruta: string, body: object = {}) =>
      request.default(app).post(`/api${ruta}`).set('Authorization', `Bearer ${t}`).send(body),
    patch: (ruta: string, body: object = {}) =>
      request.default(app).patch(`/api${ruta}`).set('Authorization', `Bearer ${t}`).send(body),
    put: (ruta: string, body: object = {}) =>
      request.default(app).put(`/api${ruta}`).set('Authorization', `Bearer ${t}`).send(body),
    delete: (ruta: string) => request.default(app).delete(`/api${ruta}`).set('Authorization', `Bearer ${t}`),
  });

  const crearCuenta = async (prefijo: string) => {
    const email = `${prefijo}-${randomUUID()}@example.com`;
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Flujos', 'business') RETURNING id`,
      [email]
    );
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Taquería', 'MX') RETURNING id`, [u.id]);
    return { id: u.id as string, email, productoId: p.id as string };
  };

  const stock = async (insumoId: string) => Number((await q(`SELECT stock_actual FROM insumos_inventario WHERE id = $1`, [insumoId]))[0].stock_actual);
  const movimientosDeVenta = (ventaId: string) =>
    q(
      `SELECT tipo, categoria, monto::float AS monto, fuente, estado_liquidacion, parent_movimiento_id
         FROM movimientos_contables WHERE referencia_tipo = 'venta' AND referencia_id = $1 ORDER BY fecha_creacion`,
      [ventaId]
    );

  beforeAll(async () => {
    await initTestDb();
    const a = await crearCuenta('flujos');
    cuentaId = a.id;
    productoId = a.productoId;
    token = tokenDe(a.id, a.email);
    const b = await crearCuenta('flujos-otra');
    otraId = b.id;
    productoAjenoId = b.productoId;
    tokenOtra = tokenDe(b.id, b.email);
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [[cuentaId, otraId]]).catch(() => undefined);
    await closeTestDb();
  });

  // ── Canales de cobro ────────────────────────────────────────────────────────

  describe('Canales de cobro', () => {
    it('carga el catálogo inicial una sola vez y solo sobre productos propios', async () => {
      const r = await api().post(`/contabilidad/${productoId}/canales/seed-defaults`);
      expect(r.status).toBe(201);
      const primera = (await api().get(`/contabilidad/${productoId}/canales`)).body.length;
      expect(primera).toBeGreaterThanOrEqual(7);
      await api().post(`/contabilidad/${productoId}/canales/seed-defaults`);
      expect((await api().get(`/contabilidad/${productoId}/canales`)).body).toHaveLength(primera);

      expect((await api().post(`/contabilidad/${productoAjenoId}/canales/seed-defaults`)).status).toBe(404);
      expect(
        (await api().post(`/contabilidad/${productoAjenoId}/canales`, { nombre: 'X', tipo_canal: 'terminal', institucion: 'X' })).status
      ).toBe(404);
    });

    it('crea, edita, simula precio y desactiva un canal; otra cuenta no lo ve', async () => {
      const creado = await api().post(`/contabilidad/${productoId}/canales`, {
        nombre: 'Terminal prueba',
        tipo_canal: 'terminal',
        institucion: 'Banco X',
        comision_porcentaje: 0.03,
        dias_liquidacion: 2,
      });
      expect(creado.status).toBe(201);
      const id = creado.body.id;

      const editado = await api().put(`/contabilidad/${productoId}/canales/${id}`, {
        nombre: 'Terminal prueba',
        tipo_canal: 'terminal',
        institucion: 'Banco X',
        comision_porcentaje: 0.025,
        dias_liquidacion: 2,
      });
      expect(editado.status).toBe(200);

      const sim = await api().post(`/contabilidad/${productoId}/canales/simular`, { monto_deseado_neto: 100, canal_cobro_id: id });
      expect(sim.status).toBe(200);
      // 100 / (1 - 0.025 * 1.16) = 102.99
      expect(JSON.stringify(sim.body)).toContain('102.99');

      expect((await api(tokenOtra).put(`/contabilidad/${productoAjenoId}/canales/${id}`, editado.body)).status).toBe(404);
      expect((await api(tokenOtra).delete(`/contabilidad/${productoAjenoId}/canales/${id}`)).status).toBe(404);

      expect((await api().delete(`/contabilidad/${productoId}/canales/${id}`)).status).toBe(200);
      const activos = (await api().get(`/contabilidad/${productoId}/canales`)).body as Array<{ id: string }>;
      expect(activos.some((c) => c.id === id)).toBe(false);
    });
  });

  // ── POS ───────────────────────────────────────────────────────────────────

  describe('Venta del POS', () => {
    let insumoId: string;
    let itemId: string;
    let canalId: string;

    beforeAll(async () => {
      const insumo = await api().post('/inventario/insumos', { nombre: 'Tortilla', unidad: 'pieza', stock_actual: 10, costo_promedio: 2 });
      expect(insumo.status).toBe(201);
      insumoId = insumo.body.id;
      const item = await api().post('/pos/catalogo', { nombre: 'Taco', precio: 100 });
      expect(item.status).toBe(201);
      itemId = item.body.id ?? item.body.item?.id;
      expect((await api().put(`/pos/catalogo/${itemId}/receta`, { insumos: [{ insumo_id: insumoId, cantidad: 2 }] })).status).toBe(200);
      const canal = await api().post(`/contabilidad/${productoId}/canales`, {
        nombre: 'Clip test',
        tipo_canal: 'terminal',
        institucion: 'Clip',
        comision_porcentaje: 0.036,
        dias_liquidacion: 1,
      });
      canalId = canal.body.id;
    });

    const vender = (extra: object = {}, t = token) =>
      api(t).post('/pos/ventas', {
        producto_id: productoId,
        lineas: [{ item_pos_id: itemId, nombre: 'Taco', precio_unitario: 100, cantidad: 3 }],
        ...extra,
      });

    it('con terminal: descuenta inventario, registra ingreso + comisiones, queda por liquidar y se revierte al cancelar', async () => {
      const r = await vender({ canal_cobro_id: canalId, crear_cliente: { nombre: 'Cliente POS' } });
      expect(r.status).toBe(201);
      const venta = r.body.venta;
      expect(Number(venta.total)).toBe(348); // 300 + IVA 16 %
      // Comisión 3.6 % de 348 = 12.53; IVA de la comisión = 2.00
      expect(Number(venta.comision_monto)).toBe(12.53);
      expect(Number(venta.comision_iva)).toBe(2);
      expect(Number(venta.monto_neto)).toBe(333.47);
      expect(venta.metodo_pago).toBe('tarjeta');
      expect(venta.cliente_id).toBeTruthy();

      // Inventario: 3 tacos × 2 tortillas
      expect(await stock(insumoId)).toBe(4);

      // Contabilidad: ingreso de la venta (fuente POS, pendiente de depósito) + comisión + IVA de la comisión + IVA de la venta
      const movs = await movimientosDeVenta(venta.id);
      const padre = movs.find((m: { parent_movimiento_id: string | null; tipo: string }) => m.tipo === 'ingreso' && !m.parent_movimiento_id);
      expect(padre).toMatchObject({ monto: 348, fuente: 'pos', estado_liquidacion: 'pendiente' });
      const comisiones = movs.filter((m: { categoria: string }) => /Comisi/.test(m.categoria));
      expect(comisiones.map((m: { monto: number }) => m.monto).sort((a: number, b: number) => a - b)).toEqual([2, 12.53]);

      // Liquidaciones: aparece como pendiente y al conciliar se liquidan también las comisiones
      const liq = await api().get(`/contabilidad/${productoId}/liquidaciones`);
      expect(liq.body.kpis.conteo_pendientes).toBe(1);
      expect(liq.body.kpis.total_pendiente_cobro).toBe(333.47);
      const movPadreId = r.body.movimiento_contable_id;
      expect((await api().patch(`/contabilidad/liquidaciones/${movPadreId}/conciliar`, { fecha_liquidacion: HOY })).status).toBe(200);
      expect((await api().get(`/contabilidad/${productoId}/liquidaciones`)).body.kpis.conteo_pendientes).toBe(0);

      // CRM: el cliente nuevo existe y es de esta cuenta
      expect((await api().get(`/clientes/${venta.cliente_id}`)).body.nombre).toBe('Cliente POS');
      expect((await api(tokenOtra).get(`/clientes/${venta.cliente_id}`)).status).toBe(404);

      // Reportes: la venta cuenta
      const rep = await api().get(`/reportes/area/ventas?desde=${HOY}&hasta=${HOY}`);
      expect(rep.status).toBe(200);
      expect(rep.body.totales).toMatchObject({ num_ventas: 1, importe: 348 });

      // Cancelar: vuelve el stock y desaparecen todos los asientos
      expect((await api().delete(`/pos/ventas/${venta.id}`)).status).toBe(200);
      expect(await stock(insumoId)).toBe(10);
      expect(await movimientosDeVenta(venta.id)).toEqual([]);
      expect((await api().get(`/reportes/area/ventas?desde=${HOY}&hasta=${HOY}`)).body.totales.num_ventas).toBe(0);
    });

    it('en efectivo el ingreso ya está en caja (no queda pendiente de liquidar)', async () => {
      const r = await vender({ metodo_pago: 'efectivo' });
      expect(r.status).toBe(201);
      const [padre] = await q(`SELECT estado_liquidacion, fecha_liquidacion, canal_cobro_id FROM movimientos_contables WHERE id = $1`, [
        r.body.movimiento_contable_id,
      ]);
      expect(padre.estado_liquidacion).toBe('liquidado');
      expect(padre.canal_cobro_id).toBeNull();
      await api().delete(`/pos/ventas/${r.body.venta.id}`);
    });

    it('un canal inexistente, desactivado o de otra cuenta aborta la venta sin dejar rastro', async () => {
      const antes = Number((await q(`SELECT COUNT(*) FROM ventas WHERE usuario_id = $1`, [cuentaId]))[0].count);
      const ajeno = await api(tokenOtra).post(`/contabilidad/${productoAjenoId}/canales`, {
        nombre: 'Ajeno',
        tipo_canal: 'terminal',
        institucion: 'Otro',
      });
      const desactivado = await api().post(`/contabilidad/${productoId}/canales`, { nombre: 'Viejo', tipo_canal: 'terminal', institucion: 'X' });
      await api().delete(`/contabilidad/${productoId}/canales/${desactivado.body.id}`);

      for (const id of [randomUUID(), ajeno.body.id, desactivado.body.id]) {
        const r = await vender({ canal_cobro_id: id });
        expect(r.status).toBe(404);
      }
      expect(Number((await q(`SELECT COUNT(*) FROM ventas WHERE usuario_id = $1`, [cuentaId]))[0].count)).toBe(antes);
      expect(await stock(insumoId)).toBe(10);
    });

    it('una fecha imposible es 400', async () => {
      expect((await vender({ fecha: '2026-02-30' })).status).toBe(400);
    });
  });

  // ── Cotizaciones ────────────────────────────────────────────────────────────

  describe('Cotización → venta', () => {
    it('convierte una sola vez, la venta queda enlazada y al cancelarla la cotización vuelve a enviada', async () => {
      const cot = await api().post('/cotizaciones', {
        cliente_nombre: 'Empresa ACME',
        producto_id: productoId,
        items: [{ descripcion: 'Servicio', cantidad: 2, precio_unitario: 500 }],
        impuesto_tasa: 16,
        moneda: 'MXN',
        estado: 'enviada',
        fecha_vencimiento: '',
      });
      expect(cot.status).toBe(201);
      expect(cot.body.fecha_vencimiento).toBeNull();

      const conv = await api().post(`/cotizaciones/${cot.body.id}/convertir-venta`, {});
      expect(conv.status).toBe(201);
      const ventaId = conv.body.venta.id;
      expect(conv.body.venta.cotizacion_id).toBe(cot.body.id);
      expect((await api().get(`/cotizaciones/${cot.body.id}`)).body.estado).toBe('aceptada');
      // El ingreso referencia la cotización y la venta apunta a él.
      const [mov] = await q(
        `SELECT m.fuente, m.referencia_tipo, m.monto::float AS monto FROM ventas v JOIN movimientos_contables m ON m.id = v.movimiento_contable_id WHERE v.id = $1`,
        [ventaId]
      );
      expect(mov).toEqual({ fuente: 'cotizacion', referencia_tipo: 'cotizacion', monto: 1160 });

      expect((await api().post(`/cotizaciones/${cot.body.id}/convertir-venta`, {})).status).toBe(409);

      await api().delete(`/pos/ventas/${ventaId}`);
      expect((await api().get(`/cotizaciones/${cot.body.id}`)).body.estado).toBe('enviada');
      const huerfanos = await q(`SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE referencia_id = $1`, [cot.body.id]);
      expect(huerfanos[0].n).toBe(0);
    });

    it('editar valida estado, fecha e items', async () => {
      const cot = await api().post('/cotizaciones', { cliente_nombre: 'Validación', items: [] });
      const id = cot.body.id;
      expect((await api().patch(`/cotizaciones/${id}`, { estado: 'inventado' })).status).toBe(400);
      expect((await api().patch(`/cotizaciones/${id}`, { fecha_vencimiento: '2026-13-01' })).status).toBe(400);
      expect((await api().patch(`/cotizaciones/${id}`, { descuento_pct: 150 })).status).toBe(400);
      const ok = await api().patch(`/cotizaciones/${id}`, { estado: 'enviada', fecha_vencimiento: '2026-12-31' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ estado: 'enviada', fecha_vencimiento: '2026-12-31' });
      expect((await api(tokenOtra).patch(`/cotizaciones/${id}`, { estado: 'rechazada' })).status).toBe(404);
    });
  });

  // ── Inventario y nómina → contabilidad ─────────────────────────────────────

  describe('Egresos automáticos', () => {
    it('una compra de inventario suma stock y crea el egreso', async () => {
      const insumo = await api().post('/inventario/insumos', { nombre: 'Aceite', unidad: 'litro' });
      const compra = await api().post('/inventario/movimientos', {
        insumo_id: insumo.body.id,
        tipo: 'entrada',
        cantidad: 5,
        costo_unitario: 40,
        producto_id: productoId,
        fecha: HOY,
      });
      expect(compra.status).toBe(201);
      expect(await stock(insumo.body.id)).toBe(5);
      const [egreso] = await q(
        `SELECT tipo, monto::float AS monto, fuente FROM movimientos_contables WHERE usuario_id = $1 AND referencia_tipo = 'compra_inventario' ORDER BY fecha_creacion DESC LIMIT 1`,
        [cuentaId]
      );
      expect(egreso).toEqual({ tipo: 'egreso', monto: 200, fuente: 'inventario' });

      const mala = await api().post('/inventario/movimientos', { insumo_id: insumo.body.id, tipo: 'entrada', cantidad: 1, fecha: '2026-02-31' });
      expect(mala.status).toBe(400);
      expect(await stock(insumo.body.id)).toBe(5);
    });

    it('un pago de nómina crea el egreso y valida periodo y fechas', async () => {
      const emp = await api().post('/nomina/empleados', { nombre: 'Rosa', salario: 9000, tipo_pago: 'quincenal', moneda: 'MXN', fecha_inicio: '' });
      expect(emp.status).toBe(201);
      expect(emp.body.fecha_inicio).toBeNull();

      const pago = await api().post('/nomina/pagos', {
        empleado_id: emp.body.id,
        periodo_inicio: '2026-09-01',
        periodo_fin: '2026-09-15',
        fecha_pago: '2026-09-15',
      });
      expect(pago.status).toBe(201);
      const [egreso] = await q(
        `SELECT tipo, monto::float AS monto, fuente, referencia_tipo FROM movimientos_contables WHERE usuario_id = $1 AND fuente = 'nomina' ORDER BY fecha_creacion DESC LIMIT 1`,
        [cuentaId]
      );
      expect(egreso).toEqual({ tipo: 'egreso', monto: 9000, fuente: 'nomina', referencia_tipo: 'pago_nomina' });

      const base = { empleado_id: emp.body.id, periodo_inicio: '2026-09-01', periodo_fin: '2026-09-15', fecha_pago: '2026-09-15' };
      expect((await api().post('/nomina/pagos', { ...base, periodo_fin: '2026-08-01' })).status).toBe(400);
      expect((await api().post('/nomina/pagos', { ...base, fecha_pago: 'mañana' })).status).toBe(400);
      expect((await api().patch(`/nomina/empleados/${emp.body.id}`, { salario: 'mucho' })).status).toBe(400);
      expect((await api().patch(`/nomina/empleados/${emp.body.id}`, { tipo_pago: 'diario' })).status).toBe(400);
      const ed = await api().patch(`/nomina/empleados/${emp.body.id}`, { salario: 9500, activo: false });
      expect(ed.status).toBe(200);
      expect(Number(ed.body.salario)).toBe(9500);
      expect(ed.body.activo).toBe(false);
      expect((await api(tokenOtra).post('/nomina/pagos', base)).status).toBe(404);
    });
  });

  // ── Clientes ────────────────────────────────────────────────────────────────

  describe('Clientes', () => {
    it('CRUD con validación y aislamiento', async () => {
      const c = await api().post('/clientes', {
        nombre: 'Juan Díaz',
        telefono: '5511112222',
        estado: 'lead',
        fecha_ultimo_contacto: '',
        producto_id: productoId,
        emoji: '👨‍👩‍👧',
      });
      expect(c.status).toBe(201);
      expect(c.body).toMatchObject({ estado: 'lead', fecha_ultimo_contacto: null });

      const lista = await api().get('/clientes?q=juan');
      expect(lista.body.map((x: { id: string }) => x.id)).toContain(c.body.id);
      expect((await api(tokenOtra).get('/clientes?q=juan')).body).toEqual([]);

      expect((await api().post('/clientes', { nombre: '' })).status).toBe(400);
      expect((await api().post('/clientes', { nombre: 'X', estado: 'vip' })).status).toBe(400);
      expect((await api().post('/clientes', { nombre: 'X', fecha_ultimo_contacto: '2026-02-30' })).status).toBe(400);
      expect((await api().post('/clientes', { nombre: 'X', producto_id: productoAjenoId })).status).toBe(404);

      const ed = await api().patch(`/clientes/${c.body.id}`, { estado: 'cliente', email: '', nombre: 'Juan Díaz Pérez' });
      expect(ed.status).toBe(200);
      expect(ed.body).toMatchObject({ estado: 'cliente', email: null, nombre: 'Juan Díaz Pérez' });
      expect((await api().patch(`/clientes/${c.body.id}`, { nombre: null })).status).toBe(400);
      expect((await api(tokenOtra).patch(`/clientes/${c.body.id}`, { nombre: 'Robado' })).status).toBe(404);
      expect((await api(tokenOtra).delete(`/clientes/${c.body.id}`)).status).toBe(404);

      const wa = await api().post(`/clientes/${c.body.id}/whatsapp`, {});
      expect(wa.body.whatsapp_url).toContain('wa.me/5511112222');

      expect((await api().delete(`/clientes/${c.body.id}`)).status).toBe(200);
      expect((await api().get(`/clientes/${c.body.id}`)).status).toBe(404);
    });
  });

  // ── Movimientos manuales ───────────────────────────────────────────────────

  describe('Contabilidad manual', () => {
    it('valida fecha y canal; un egreso nunca queda pendiente de liquidar', async () => {
      const base = { tipo: 'egreso', descripcion: 'Renta', monto: 5000, fecha: HOY, categoria: 'Renta' };
      expect((await api().post(`/contabilidad/${productoId}`, { ...base, fecha: '2026-02-30' })).status).toBe(400);
      expect((await api().post(`/contabilidad/${productoId}`, { ...base, tipo: 'ingreso', canal_cobro_id: randomUUID() })).status).toBe(404);

      const egreso = await api().post(`/contabilidad/${productoId}`, base);
      expect(egreso.status).toBe(201);
      const id = egreso.body.id ?? egreso.body.movimiento?.id;
      const [mov] = await q(`SELECT estado_liquidacion FROM movimientos_contables WHERE id = $1`, [id]);
      expect(mov.estado_liquidacion).toBe('liquidado');

      expect((await api(tokenOtra).delete(`/contabilidad/movimiento/${id}`)).status).toBe(404);
      expect((await api().get(`/contabilidad/${productoId}`)).body.some((m: { id: string }) => m.id === id)).toBe(true);
    });

    it('un ingreso con canal de depósito diferido queda pendiente con su desglose', async () => {
      const canal = await api().post(`/contabilidad/${productoId}/canales`, {
        nombre: 'Uber test',
        tipo_canal: 'delivery',
        institucion: 'Uber Eats',
        comision_porcentaje: 0.3,
        retencion_isr_porcentaje: 0.01,
        retencion_iva_porcentaje: 0.08,
        dias_liquidacion: 7,
      });
      const r = await api().post(`/contabilidad/${productoId}`, {
        tipo: 'ingreso',
        descripcion: 'Pedidos Uber semana',
        monto: 1000,
        fecha: HOY,
        canal_cobro_id: canal.body.id,
        desglosar_comision: true,
      });
      expect(r.status).toBe(201);
      const id = r.body.id ?? r.body.movimiento?.id;
      const [mov] = await q(
        `SELECT fuente, estado_liquidacion, comision_monto::float AS c, comision_iva::float AS i, retencion_monto::float AS ret, monto_neto::float AS neto
           FROM movimientos_contables WHERE id = $1`,
        [id]
      );
      // 300 comisión + 48 IVA + 10 ISR + 80 IVA retenido = 438 → neto 562
      expect(mov).toEqual({ fuente: 'delivery', estado_liquidacion: 'pendiente', c: 300, i: 48, ret: 90, neto: 562 });
      const hijos = await q(`SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE parent_movimiento_id = $1`, [id]);
      expect(hijos[0].n).toBe(4);
    });
  });
});
