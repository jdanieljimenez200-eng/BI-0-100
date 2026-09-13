import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, cabeceras, type TestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';

/**
 * Reportes por área.
 *
 * Lo que se vigila:
 *  1. Solo se reporta lo contratado, y a un trabajador solo lo que tiene
 *     permitido. Tener acceso a Reportes no puede abrir los sueldos de Nómina.
 *  2. Los números salen de los datos: se siembra un escenario pequeño con
 *     cifras redondas y se comprueba cada total.
 */
describeWithDb('Reportes por área', () => {
  let completa: TestUser; // business: todas las herramientas
  let parcial: TestUser; // pro_plus con solo POS y Contabilidad
  let trabajador: TestUser; // de `completa`, con permiso solo de contabilidad
  let productoId: string;

  const DESDE = '2026-03-01';
  const HASTA = '2026-03-31';
  const qs = `?desde=${DESDE}&hasta=${HASTA}`;

  const get = (u: TestUser, ruta: string) => request.default(app).get(`/api/reportes${ruta}`).set(cabeceras(u));

  beforeAll(async () => {
    await initTestDb();
    [completa, parcial, trabajador] = await Promise.all([signupTestUser(), signupTestUser(), signupTestUser()]);
    const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);

    await q(`UPDATE usuarios SET plan = 'business' WHERE id = $1`, [completa.userId]);
    await q(`UPDATE usuarios SET plan = 'pro_plus' WHERE id = $1`, [parcial.userId]);
    for (const k of ['pos', 'contabilidad']) {
      await q(`INSERT INTO herramientas_seleccionadas (usuario_id, herramienta_key) VALUES ($1, $2)`, [parcial.userId, k]);
    }

    const [prod] = await q(`INSERT INTO productos (usuario_id, nombre) VALUES ($1, 'Producto de reportes') RETURNING id`, [
      completa.userId,
    ]);
    productoId = prod.id;

    await q(`UPDATE usuarios SET account_role = 'trabajador', owner_id = $1 WHERE id = $2`, [
      completa.userId,
      trabajador.userId,
    ]);
    await q(
      `INSERT INTO asignaciones_trabajador (trabajador_id, cuenta_id, producto_id, permisos)
       VALUES ($1, $2, $3, '{"contabilidad": true}'::jsonb)`,
      [trabajador.userId, completa.userId, productoId]
    );

    // ── Escenario de datos, cifras redondas ─────────────────────────────────
    const u = completa.userId;
    // Ventas: 3 completadas (100 + 200 + 300 = 600) y 1 cancelada (999).
    for (const [total, estado, metodo] of [
      [100, 'completada', 'efectivo'],
      [200, 'completada', 'tarjeta'],
      [300, 'completada', 'tarjeta'],
      [999, 'cancelada', 'efectivo'],
    ] as const) {
      await q(
        `INSERT INTO ventas (usuario_id, producto_id, numero_ticket, fecha, subtotal, total, metodo_pago, estado)
         VALUES ($1, $2, 'T-' || substr(md5(random()::text), 1, 10), '2026-03-10', $3, $3, $4, $5)`,
        [u, productoId, total, metodo, estado]
      );
    }
    // Inventario: un insumo con 10 u. a 5 = 50 de valor, sin movimientos en marzo.
    await q(
      `INSERT INTO insumos_inventario (usuario_id, nombre, unidad, stock_actual, stock_minimo, costo_promedio)
       VALUES ($1, 'Harina', 'kg', 10, 20, 5)`,
      [u]
    );
    // Citas: 2 completadas, 1 cancelada.
    for (const estado of ['completada', 'completada', 'cancelada']) {
      await q(
        `INSERT INTO citas (usuario_id, titulo, fecha, hora_inicio, hora_fin, estado)
         VALUES ($1, 'Consulta', '2026-03-12', '10:00', '11:00', $2)`,
        [u, estado]
      );
    }
    // Personal: 1 empleado quincenal de 1000 (2000/mes) con un pago de 1000 en marzo.
    const [emp] = await q(
      `INSERT INTO empleados (usuario_id, nombre, cargo, salario, tipo_pago, moneda)
       VALUES ($1, 'Ana', 'Cajera', 1000, 'quincenal', 'MXN') RETURNING id`,
      [u]
    );
    await q(
      `INSERT INTO pagos_nomina (usuario_id, empleado_id, empleado_nombre, monto, moneda, periodo_inicio, periodo_fin, fecha_pago)
       VALUES ($1, $2, 'Ana', 1000, 'MXN', '2026-03-01', '2026-03-15', '2026-03-15')`,
      [u, emp.id]
    );
    // Contabilidad: ingreso 600, egresos 400 (300 con CFDI, 100 sin).
    for (const [tipo, categoria, monto, cfdi] of [
      ['ingreso', 'Ventas', 600, true],
      ['egreso', 'Renta', 300, true],
      ['egreso', 'Papelería', 100, false],
    ] as const) {
      await q(
        `INSERT INTO movimientos_contables (usuario_id, tipo, descripcion, categoria, monto, fecha, tiene_cfdi)
         VALUES ($1, $2, $3, $3, $4, '2026-03-05', $5)`,
        [u, tipo, categoria, monto, cfdi]
      );
    }
  }, 60_000);

  afterAll(async () => {
    await closeTestDb();
  });

  describe('Acceso', () => {
    it('una cuenta con todas las herramientas ve las 7 áreas', async () => {
      const res = await get(completa, '/areas');
      expect(res.status).toBe(200);
      expect(Object.values(res.body.areas).every(Boolean)).toBe(true);
    });

    it('una cuenta con solo POS y Contabilidad ve solo esas dos áreas', async () => {
      const res = await get(parcial, '/areas');
      expect(res.body.areas).toEqual({
        ventas: true,
        contabilidad: true,
        inventario: false,
        cotizaciones: false,
        clientes: false,
        citas: false,
        personal: false,
      });
    });

    it('un área no contratada responde 403, también por los endpoints antiguos', async () => {
      const area = await get(parcial, `/area/personal${qs}`);
      expect(area.status).toBe(403);
      expect(area.body.codigo).toBe('area_no_disponible');
      expect((await get(parcial, `/almacen${qs}`)).status).toBe(403);
    });

    it('un trabajador con permiso solo de contabilidad no ve los sueldos', async () => {
      const areas = await get(trabajador, '/areas');
      expect(areas.body.areas.contabilidad).toBe(true);
      expect(areas.body.areas.personal).toBe(false);
      expect((await get(trabajador, `/area/personal${qs}`)).status).toBe(403);
      expect((await get(trabajador, `/area/contabilidad${qs}`)).status).toBe(200);
    });

    it('el reporte completo del trabajador no incluye las áreas que no puede ver', async () => {
      const res = await get(trabajador, `/completo${qs}`);
      expect(res.status).toBe(200);
      expect(res.body.personal).toBeNull();
      expect(res.body.ventas).toBeNull();
      expect(res.body.contabilidad).not.toBeNull();
    });

    it('un área inventada da 404', async () => {
      expect((await get(completa, `/area/secretos${qs}`)).status).toBe(404);
    });
  });

  describe('Números', () => {
    it('ventas: suma solo las completadas y cuenta la cancelada aparte', async () => {
      const { body } = await get(completa, `/area/ventas${qs}`);
      expect(body.totales).toMatchObject({ num_ventas: 3, importe: 600, canceladas: 1, importe_cancelado: 999 });
      const tarjeta = body.metodos_pago.find((m: { metodo_pago: string }) => m.metodo_pago === 'tarjeta');
      expect(tarjeta).toMatchObject({ num_ventas: 2, importe: 500 });
    });

    it('inventario: valúa el stock y marca el insumo bajo mínimo y sin movimiento', async () => {
      const { body } = await get(completa, `/area/inventario${qs}`);
      expect(body.valuacion).toMatchObject({ insumos_activos: 1, valor_total: 50, bajo_minimo: 1, sin_stock: 0 });
      expect(body.sin_movimiento.map((i: { nombre: string }) => i.nombre)).toContain('Harina');
    });

    it('citas: tasa de cancelación y duración media', async () => {
      const { body } = await get(completa, `/area/citas${qs}`);
      expect(body.totales).toMatchObject({ total: 3, completadas: 2, canceladas: 1, duracion_promedio_min: 60 });
      expect(body.totales.tasa_cancelacion_pct).toBeCloseTo(33.33, 1);
    });

    it('personal: masa mensual normaliza la quincena y compara nómina con ventas', async () => {
      const { body } = await get(completa, `/area/personal${qs}`);
      expect(body.plantilla.masa_salarial_mensual).toEqual([{ moneda: 'MXN', importe: 2000 }]);
      expect(body.pagado.total).toBe(1000);
      // 1000 de nómina sobre 600 de ventas.
      expect(body.pagado.sobre_ventas_pct).toBeCloseTo(166.67, 1);
      expect(body.sin_pago_en_periodo).toHaveLength(0);
    });

    it('contabilidad: utilidad, categorías y parte deducible', async () => {
      const { body } = await get(completa, `/area/contabilidad${qs}`);
      expect(body.flujo).toMatchObject({ ingresos: 600, egresos: 400, utilidad_neta: 200 });
      expect(body.fiscal).toMatchObject({ egresos_con_cfdi: 300, egresos_sin_cfdi: 100, egresos_deducibles_pct: 75 });
      expect(body.egresos_por_categoria[0]).toMatchObject({ categoria: 'Renta', total: 300, participacion_pct: 75 });
      // La serie diaria acumula hasta el total del periodo.
      const puntos = body.serie.puntos;
      expect(puntos[puntos.length - 1].acumulado).toBe(200);
    });

    it('panorama: alerta del insumo bajo mínimo y del egreso sin CFDI', async () => {
      const { body } = await get(completa, `/panorama${qs}`);
      const mensajes = body.alertas.map((a: { mensaje: string }) => a.mensaje).join(' | ');
      expect(mensajes).toMatch(/por debajo del mínimo/);
      expect(mensajes).toMatch(/sin CFDI/);
      expect(body.kpis.contabilidad.utilidad_neta).toBe(200);
    });
  });
});
