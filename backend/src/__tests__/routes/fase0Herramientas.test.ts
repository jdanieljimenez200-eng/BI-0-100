import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { hoyEnZona } from '../../utils/fechaLocal';

/**
 * Correcciones de la Fase 0 del análisis del backend de herramientas
 * (docs/audit/ANALISIS_BACKEND_HERRAMIENTAS_2026-09-17.md):
 *
 *  - Contabilidad paginada por cursor, resumen/P&L/canales/liquidaciones en SQL
 *    (antes cargaba todo el historial y tumbaba el proceso).
 *  - Una cotización se convierte en UNA venta aunque lleguen clics simultáneos.
 *  - "Hoy" en la zona del navegador, no en UTC.
 *  - Borrar producto/empleado/insumo/negocio ya no destruye historial.
 *  - La alerta de stock crítico lee el inventario real.
 */
describeWithDb('Fase 0 — correcciones críticas de las herramientas', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const cuentas: string[] = [];

  const crearCuenta = async (plan = 'business') => {
    const email = `fase0-${randomUUID()}@example.com`;
    const [u] = await q(`INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Fase 0', $2) RETURNING id`, [
      email,
      plan,
    ]);
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Taller', 'MX') RETURNING id`, [u.id]);
    cuentas.push(u.id);
    const token = jwt.sign({ userId: u.id, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '15m', algorithm: 'HS256' });
    const api = {
      get: (ruta: string) => request.default(app).get(`/api${ruta}`).set('Authorization', `Bearer ${token}`),
      post: (ruta: string, body: object = {}) => request.default(app).post(`/api${ruta}`).set('Authorization', `Bearer ${token}`).send(body),
      patch: (ruta: string, body: object = {}) =>
        request.default(app).patch(`/api${ruta}`).set('Authorization', `Bearer ${token}`).send(body),
      put: (ruta: string, body: object = {}) =>
        request.default(app).put(`/api${ruta}`).set('Authorization', `Bearer ${token}`).send(body),
      delete: (ruta: string) => request.default(app).delete(`/api${ruta}`).set('Authorization', `Bearer ${token}`),
    };
    return { uid: u.id as string, pid: p.id as string, api };
  };

  beforeAll(async () => {
    await initTestDb();
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [cuentas]).catch(() => undefined);
    await closeTestDb();
  });

  // ── Contabilidad ─────────────────────────────────────────────────────────────

  describe('Contabilidad a escala', () => {
    let c: Awaited<ReturnType<typeof crearCuenta>>;

    beforeAll(async () => {
      c = await crearCuenta();
      // 7 movimientos manuales en 3 meses + uno sin producto (nómina) + una venta con canal diferido
      const filas = [
        ['2026-06-10', 'ingreso', 'Venta mostrador', 'Ventas', 1000, false, true],
        ['2026-06-15', 'egreso', 'Renta junio', 'Renta', 400, false, true],
        ['2026-07-02', 'egreso', 'Compra insumos', 'Insumos', 150, false, false],
        ['2026-07-20', 'ingreso', 'Servicio afinación', 'Servicios', 800, false, true],
        ['2026-08-01', 'egreso', 'IVA por pagar', 'IVA por pagar', 64, true, true],
        ['2026-08-05', 'egreso', 'Luz', 'Servicios públicos', 90, false, true],
        ['2026-08-05', 'ingreso', 'Venta 50%', 'Ventas', 500, false, true],
      ];
      for (const [fecha, tipo, desc, cat, monto, auto, cfdi] of filas) {
        await q(
          `INSERT INTO movimientos_contables (usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente, es_auto_generado, tiene_cfdi)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9)`,
          [c.uid, c.pid, tipo, desc, cat, monto, fecha, auto, cfdi]
        );
      }
      await q(
        `INSERT INTO movimientos_contables (usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente, es_auto_generado)
         VALUES ($1, NULL, 'egreso', 'Nómina Rosa', 'Nómina', 300, '2026-08-10', 'nomina', true)`,
        [c.uid]
      );
      const canal = await c.api.post(`/contabilidad/${c.pid}/canales`, {
        nombre: 'Uber', tipo_canal: 'delivery', institucion: 'Uber Eats',
        comision_porcentaje: 0.3, retencion_isr_porcentaje: 0.01, retencion_iva_porcentaje: 0.08, dias_liquidacion: 7,
      });
      const r = await c.api.post(`/contabilidad/${c.pid}`, {
        tipo: 'ingreso', descripcion: 'Pedidos Uber', monto: 1000, fecha: '2026-08-12', canal_cobro_id: canal.body.id, desglosar_comision: true,
      });
      expect(r.status).toBe(201);
    });

    it('pagina por cursor sin repetir ni saltar movimientos', async () => {
      const vistos: string[] = [];
      let cursor: string | null = null;
      let paginas = 0;
      do {
        const r = await c.api.get(`/contabilidad/${c.pid}?limite=3${cursor ? `&antes=${cursor}` : ''}`);
        expect(r.status).toBe(200);
        expect(r.body.movimientos.length).toBeLessThanOrEqual(3);
        vistos.push(...r.body.movimientos.map((m: { id: string }) => m.id));
        cursor = r.body.siguiente;
        paginas++;
      } while (cursor && paginas < 20);

      const [{ n }] = await q(
        `SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE usuario_id = $1 AND (producto_id = $2 OR producto_id IS NULL)`,
        [c.uid, c.pid]
      );
      expect(vistos).toHaveLength(n);
      expect(new Set(vistos).size).toBe(n);
      // Más recientes primero
      const primera = await c.api.get(`/contabilidad/${c.pid}?limite=2`);
      expect(primera.body.movimientos[0].fecha >= primera.body.movimientos[1].fecha).toBe(true);
    });

    it('filtra en el servidor: tipo, fuente, categoría, texto y rango', async () => {
      const tipo = await c.api.get(`/contabilidad/${c.pid}?tipo=ingreso`);
      expect(tipo.body.movimientos.every((m: { tipo: string }) => m.tipo === 'ingreso')).toBe(true);
      const fuente = await c.api.get(`/contabilidad/${c.pid}?fuente=nomina`);
      expect(fuente.body.movimientos.map((m: { descripcion: string }) => m.descripcion)).toEqual(['Nómina Rosa']);
      const cat = await c.api.get(`/contabilidad/${c.pid}?categoria=renta`);
      expect(cat.body.movimientos).toHaveLength(1);
      const texto = await c.api.get(`/contabilidad/${c.pid}?q=${encodeURIComponent('50%')}`);
      expect(texto.body.movimientos.map((m: { descripcion: string }) => m.descripcion)).toEqual(['Venta 50%']);
      const rango = await c.api.get(`/contabilidad/${c.pid}?desde=2026-07-01&hasta=2026-07-31`);
      expect(rango.body.movimientos).toHaveLength(2);

      expect((await c.api.get(`/contabilidad/${c.pid}?desde=2026-02-30`)).status).toBe(400);
      expect((await c.api.get(`/contabilidad/${c.pid}?desde=2026-08-01&hasta=2026-07-01`)).status).toBe(400);
      expect((await c.api.get(`/contabilidad/${c.pid}?fuente=otra`)).status).toBe(400);
      expect((await c.api.get(`/contabilidad/${c.pid}?antes=basura`)).status).toBe(400);
    });

    it('el resumen agrega todo el historial en SQL', async () => {
      const r = await c.api.get(`/contabilidad/${c.pid}/resumen`);
      expect(r.status).toBe(200);
      const [esperado] = await q(
        `SELECT COUNT(*)::int AS total,
                SUM(monto) FILTER (WHERE tipo='ingreso')::float AS ingresos,
                SUM(monto) FILTER (WHERE tipo='egreso')::float AS egresos
           FROM movimientos_contables WHERE usuario_id = $1 AND (producto_id = $2 OR producto_id IS NULL)`,
        [c.uid, c.pid]
      );
      expect(r.body.kpis).toMatchObject({ total: esperado.total, ingresos: esperado.ingresos, egresos: esperado.egresos });
      expect(r.body.kpis.balance).toBeCloseTo(esperado.ingresos - esperado.egresos, 2);
      expect(r.body.conteo_fuentes.nomina).toBe(1);
      expect(r.body.conteo_tipos.todos).toBe(esperado.total);
      expect(r.body.categorias).toEqual(expect.arrayContaining(['Renta', 'Ventas', 'Nómina']));
      // Calibración: solo movimientos capturados (no auto-generados), 3 meses
      expect(r.body.calibracion).toMatchObject({ meses_analizados: 3, confianza: 'media' });
      // Base fiscal: egresos no auto-generados y con comprobante
      expect(r.body.fiscal_base.egresos_no_auto).toBe(400 + 150 + 90);
      expect(r.body.fiscal_base.egresos_con_comprobante).toBe(400 + 90);
    });

    it('exporta a CSV todos los movimientos filtrados', async () => {
      const r = await c.api.get(`/contabilidad/${c.pid}/exportar?tipo=egreso`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('text/csv');
      const lineas = r.text.trim().split('\n');
      expect(lineas[0]).toBe('ID,Fecha,Tipo,Descripcion,Categoria,Monto,Fuente,Comprobante_Fiscal,Auto_Generado');
      const [{ n }] = await q(
        `SELECT COUNT(*)::int AS n FROM movimientos_contables WHERE usuario_id = $1 AND (producto_id = $2 OR producto_id IS NULL) AND tipo = 'egreso'`,
        [c.uid, c.pid]
      );
      expect(lineas).toHaveLength(n + 1);
    });

    it('el P&L en SQL da lo mismo que el cálculo fila a fila anterior', async () => {
      const filas: Array<{ tipo: string; categoria: string | null; fuente: string | null; parent_movimiento_id: string | null;
        monto: string; monto_bruto: string | null; comision_monto: string | null; comision_iva: string | null; retencion_monto: string | null }> =
        await q(`SELECT * FROM movimientos_contables WHERE usuario_id = $1 AND (producto_id = $2 OR producto_id IS NULL)`, [c.uid, c.pid]);
      // Algoritmo anterior, tal cual (routes/contabilidad.ts antes de la Fase 0)
      let ingresos = 0, comisiones = 0, cogs = 0, opex = 0, impuestos = 0;
      const COGS = ['insumos', 'materiales', 'costo de venta', 'costo de ventas', 'mercancia', 'materia prima'];
      const COM = ['comisiones financieras / plataformas', 'comision', 'comisiones', 'comision clip', 'comision uber'];
      const IMP = ['iva por pagar', 'isr provisional', 'imss', 'infonavit', 'retención iva', 'retención isr', 'impuestos', 'iva acreditable / comisiones'];
      for (const m of filas) {
        const monto = Number(m.monto);
        const cat = (m.categoria || '').trim().toLowerCase();
        if (m.tipo === 'ingreso') {
          ingresos += Number(m.monto_bruto ?? monto);
          if (Number(m.comision_monto)) comisiones += Number(m.comision_monto) + Number(m.comision_iva ?? 0) + Number(m.retencion_monto ?? 0);
        } else if (COM.some((x) => cat.includes(x))) {
          if (!m.parent_movimiento_id) comisiones += monto;
        } else if (COGS.some((x) => cat.includes(x)) || m.fuente === 'inventario') cogs += monto;
        else if (IMP.some((x) => cat.includes(x))) impuestos += monto;
        else opex += monto;
      }
      const r = await c.api.get(`/contabilidad/${c.pid}/pnl`);
      expect(r.status).toBe(200);
      expect(r.body.periodo).toBe('Histórico acumulado');
      expect(r.body.pnl.ingresos_brutos).toBeCloseTo(ingresos, 2);
      expect(r.body.pnl.comisiones_pasarelas_delivery).toBeCloseTo(comisiones, 2);
      expect(r.body.pnl.costo_ventas_cogs).toBeCloseTo(cogs, 2);
      expect(r.body.pnl.gastos_operativos_opex).toBeCloseTo(opex, 2);
      expect(r.body.pnl.impuestos).toBeCloseTo(impuestos, 2);

      const mes = await c.api.get(`/contabilidad/${c.pid}/pnl?mes=2026-06`);
      expect(mes.body).toMatchObject({ periodo: '2026-06', pnl: { ingresos_brutos: 1000, gastos_operativos_opex: 400 } });
      expect((await c.api.get(`/contabilidad/${c.pid}/pnl?mes=2026-13`)).status).toBe(400);
      expect((await c.api.get(`/contabilidad/${c.pid}/pnl?desde=2026-02-30&hasta=2026-03-01`)).status).toBe(400);
    });

    it('análisis de canales y liquidaciones con KPIs en SQL', async () => {
      const canales = await c.api.get(`/contabilidad/${c.pid}/analisis-canales`);
      expect(canales.body.canales).toHaveLength(1);
      // 300 comisión + 48 IVA + 10 ISR + 80 IVA retenido
      expect(canales.body.canales[0]).toMatchObject({ institucion: 'Uber Eats', transacciones: 1, total_bruto: 1000, total_deducciones: 438, total_neto: 562 });
      expect(canales.body.totales.porcentaje_fuga_global).toBe(43.8);

      const liq = await c.api.get(`/contabilidad/${c.pid}/liquidaciones`);
      expect(liq.body.kpis).toMatchObject({ total_pendiente_cobro: 562, conteo_pendientes: 1, total_comisiones_deducidas: 438 });
      expect(liq.body.movimientos).toHaveLength(1);
      expect((await c.api.get(`/contabilidad/${c.pid}/liquidaciones?estado=liquidado`)).body.movimientos).toHaveLength(0);
    });
  });

  // ── Cotizaciones ─────────────────────────────────────────────────────────────

  it('tres clics simultáneos en "convertir a venta" crean UNA venta', async () => {
    const c = await crearCuenta();
    const cot = await c.api.post('/cotizaciones', {
      cliente_nombre: 'ACME', producto_id: c.pid, estado: 'enviada', moneda: 'MXN',
      items: [{ descripcion: 'Servicio', cantidad: 1, precio_unitario: 100 }],
    });
    const rs = await Promise.all([1, 2, 3].map(() => c.api.post(`/cotizaciones/${cot.body.id}/convertir-venta`, {})));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM ventas WHERE cotizacion_id = $1`, [cot.body.id]);
    expect(n).toBe(1);
  });

  // ── Fecha local ──────────────────────────────────────────────────────────────

  it('la fecha de venta, compra y liquidación sale de la zona del navegador', async () => {
    const c = await crearCuenta();
    // UTC+14 y UTC-11: al menos una de las dos cae en otro día que UTC casi siempre.
    for (const zona of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      const venta = await c.api
        .post('/pos/ventas', { producto_id: c.pid, lineas: [{ nombre: 'A', precio_unitario: 10, cantidad: 1 }] })
        .set('X-Zona-Horaria', zona);
      expect(venta.status).toBe(201);
      expect(venta.body.venta.fecha).toBe(hoyEnZona(zona));

      const insumo = await c.api.post('/inventario/insumos', { nombre: `Aceite ${zona}` });
      const compra = await c.api
        .post('/inventario/movimientos', { insumo_id: insumo.body.id, tipo: 'entrada', cantidad: 1, costo_unitario: 5 })
        .set('X-Zona-Horaria', zona);
      expect(compra.body.movimiento.fecha).toBe(hoyEnZona(zona));
    }
    // Sin cabecera y sin zona guardada: CDMX
    const sin = await c.api.post('/pos/ventas', { producto_id: c.pid, lineas: [{ nombre: 'A', precio_unitario: 10, cantidad: 1 }] });
    expect(sin.body.venta.fecha).toBe(hoyEnZona('America/Mexico_City'));
    // Una cabecera inválida no rompe nada
    const mala = await c.api
      .post('/pos/ventas', { producto_id: c.pid, lineas: [{ nombre: 'A', precio_unitario: 10, cantidad: 1 }] })
      .set('X-Zona-Horaria', 'Marte/Olympus');
    expect(mala.status).toBe(201);
  });

  it('hoyEnZona formatea YYYY-MM-DD en la zona pedida', () => {
    const instante = new Date('2026-09-18T02:59:59Z'); // 20:59 del 17 en CDMX
    expect(hoyEnZona('America/Mexico_City', instante)).toBe('2026-09-17');
    expect(hoyEnZona('UTC', instante)).toBe('2026-09-18');
    expect(hoyEnZona('zona-inventada', instante)).toBe('2026-09-17'); // cae a CDMX
  });

  // ── Borrados que destruían historial ─────────────────────────────────────────

  it('un producto con ventas no se borra; uno sin historial sí', async () => {
    const c = await crearCuenta();
    await c.api.post('/pos/ventas', { producto_id: c.pid, lineas: [{ nombre: 'A', precio_unitario: 50, cantidad: 1 }] });
    const bloqueado = await c.api.delete(`/productos/${c.pid}`);
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.con_historial).toBe(true);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM ventas WHERE producto_id = $1`, [c.pid]);
    expect(n).toBe(1);

    const [vacio] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Vacío', 'MX') RETURNING id`, [c.uid]);
    expect((await c.api.delete(`/productos/${vacio.id}`)).status).toBe(200);

    // Red de seguridad en la base: un DELETE directo también falla
    await expect(q(`DELETE FROM productos WHERE id = $1`, [c.pid])).rejects.toThrow(/foreign key/);
  });

  it('un empleado con pagos se desactiva; sin pagos se borra', async () => {
    const c = await crearCuenta();
    const conPagos = await c.api.post('/nomina/empleados', { nombre: 'Rosa', salario: 9000, moneda: 'MXN' });
    await c.api.post('/nomina/pagos', { empleado_id: conPagos.body.id, periodo_inicio: '2026-09-01', periodo_fin: '2026-09-15', fecha_pago: '2026-09-15' });
    const r = await c.api.delete(`/nomina/empleados/${conPagos.body.id}`);
    expect(r.body).toMatchObject({ ok: true, archivado: true });
    const [emp] = await q(`SELECT activo FROM empleados WHERE id = $1`, [conPagos.body.id]);
    expect(emp.activo).toBe(false);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM pagos_nomina WHERE empleado_id = $1`, [conPagos.body.id]);
    expect(n).toBe(1);

    const sinPagos = await c.api.post('/nomina/empleados', { nombre: 'Luis', salario: 8000, moneda: 'MXN' });
    expect((await c.api.delete(`/nomina/empleados/${sinPagos.body.id}`)).body).toMatchObject({ archivado: false });
    expect((await q(`SELECT 1 FROM empleados WHERE id = $1`, [sinPagos.body.id])).length).toBe(0);
  });

  it('un insumo con movimientos se archiva, sale de las recetas y del listado', async () => {
    const c = await crearCuenta();
    const insumo = await c.api.post('/inventario/insumos', { nombre: 'Harina', stock_actual: 10 });
    await c.api.post('/inventario/movimientos', { insumo_id: insumo.body.id, tipo: 'merma', cantidad: 1 });
    const item = await c.api.post('/pos/catalogo', { nombre: 'Pan', precio: 20 });
    await c.api.put(`/pos/catalogo/${item.body.id}/receta`, { insumos: [{ insumo_id: insumo.body.id, cantidad: 1 }] });

    const r = await c.api.delete(`/inventario/insumos/${insumo.body.id}`);
    expect(r.body).toMatchObject({ ok: true, archivado: true });
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM movimientos_inventario WHERE insumo_id = $1`, [insumo.body.id]);
    expect(n).toBe(2); // el inventario inicial y la merma
    expect((await c.api.get(`/pos/catalogo/${item.body.id}/receta`)).body.receta).toEqual([]);
    const lista = await c.api.get('/inventario/insumos');
    expect(lista.body.insumos.some((i: { id: string }) => i.id === insumo.body.id)).toBe(false);
    const todos = await c.api.get('/inventario/insumos?incluir_inactivos=true');
    expect(todos.body.insumos.some((i: { id: string }) => i.id === insumo.body.id)).toBe(true);

    const nuevo = await c.api.post('/inventario/insumos', { nombre: 'Sal' });
    expect((await c.api.delete(`/inventario/insumos/${nuevo.body.id}`)).body).toMatchObject({ archivado: false });
  });

  it('borrar un negocio deja su catálogo e insumos sin negocio', async () => {
    const c = await crearCuenta();
    const [neg] = await q(`INSERT INTO negocios (usuario_id, nombre) VALUES ($1, 'Sucursal') RETURNING id`, [c.uid]);
    const insumo = await c.api.post('/inventario/insumos', { nombre: 'Café', negocio_id: neg.id });
    await c.api.post('/inventario/movimientos', { insumo_id: insumo.body.id, tipo: 'merma', cantidad: 1 });
    const item = await c.api.post('/pos/catalogo', { nombre: 'Latte', precio: 50, negocio_id: neg.id });

    expect((await c.api.delete(`/negocios/${neg.id}`)).status).toBe(200);
    const [i] = await q(`SELECT negocio_id FROM insumos_inventario WHERE id = $1`, [insumo.body.id]);
    const [it] = await q(`SELECT negocio_id FROM items_pos WHERE id = $1`, [item.body.id]);
    expect(i).toEqual({ negocio_id: null });
    expect(it).toEqual({ negocio_id: null });
  });

  it('borrar la cuenta completa sigue funcionando con las FK nuevas', async () => {
    const c = await crearCuenta();
    await c.api.post('/pos/ventas', { producto_id: c.pid, lineas: [{ nombre: 'A', precio_unitario: 50, cantidad: 1 }] });
    const emp = await c.api.post('/nomina/empleados', { nombre: 'Ana', salario: 1000, moneda: 'MXN' });
    await c.api.post('/nomina/pagos', { empleado_id: emp.body.id, periodo_inicio: '2026-09-01', periodo_fin: '2026-09-15', fecha_pago: '2026-09-15' });
    const ins = await c.api.post('/inventario/insumos', { nombre: 'X', stock_actual: 5 });
    await c.api.post('/inventario/movimientos', { insumo_id: ins.body.id, tipo: 'merma', cantidad: 1 });
    await expect(q(`DELETE FROM usuarios WHERE id = $1`, [c.uid])).resolves.toBeDefined();
  });

  // ── Alertas ──────────────────────────────────────────────────────────────────

  it('la alerta de stock crítico ve los insumos del inventario', async () => {
    const c = await crearCuenta();
    await c.api.post('/inventario/insumos', { nombre: 'Tortilla', stock_actual: 0, unidad: 'pieza' });
    await c.api.post('/inventario/insumos', { nombre: 'Queso', stock_actual: 2, stock_minimo: 5, unidad: 'kg' });
    await c.api.post('/inventario/insumos', { nombre: 'Sal', stock_actual: 50, stock_minimo: 5 });
    const r = await request.default(app)
      .get('/api/dashboard/alertas-operativas')
      .set('Authorization', `Bearer ${jwt.sign({ userId: c.uid, jti: randomUUID() }, process.env.JWT_SECRET!, { expiresIn: '5m' })}`);
    expect(r.status).toBe(200);
    const stock = r.body.alertas.filter((a: { tipo: string }) => a.tipo === 'stock');
    expect(stock.map((a: { nivel: string }) => a.nivel).sort()).toEqual(['amarillo', 'rojo']);
    expect(stock.map((a: { mensaje: string }) => a.mensaje).join(' ')).toMatch(/Tortilla.*agotado|agotado.*Tortilla/);
    expect(r.body.articulos_evaluados).toBe(3);
  });
});
