import { randomUUID } from 'crypto';
import { initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { obtenerTraccionReal } from '../../services/mercado/traccionReal';

/**
 * Tracción real del POS hacia Mercado.
 *
 * Lo que se vigila:
 *  1. Sale de las ventas, no de lo que el dueño recuerde.
 *  2. Las canceladas NO cuentan (regla 9 de CLAUDE.md).
 *  3. El mes en curso no entra: siempre va a medias y hundiría el promedio.
 *  4. Sin ventas devuelve null, para que el análisis use lo declarado.
 */
describeWithDb('mercado/traccionReal', () => {
  let usuarioId: string;
  let otroId: string;
  let productoId: string;
  let otroProductoId: string;

  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);

  /** Una venta cerrada del producto en la fecha dada. */
  const venta = (uid: string, pid: string, fecha: string, total: number, estado = 'completada', clienteId: string | null = null) =>
    q(
      `INSERT INTO ventas (usuario_id, producto_id, cliente_id, numero_ticket, fecha, subtotal, total, metodo_pago, estado)
       VALUES ($1, $2, $3, 'T-' || substr(md5(random()::text), 1, 10), $4, $5, $5, 'efectivo', $6)`,
      [uid, pid, clienteId, fecha, total, estado]
    );

  const crearUsuario = async (prefijo: string) => {
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Tracción', 'business') RETURNING id`,
      [`${prefijo}-${randomUUID()}@example.com`]
    );
    return u.id as string;
  };

  beforeAll(async () => {
    await initTestDb();
    usuarioId = await crearUsuario('traccion');
    otroId = await crearUsuario('traccion-otro');
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre) VALUES ($1, 'Tacos') RETURNING id`, [usuarioId]);
    productoId = p.id;
    const [p2] = await q(`INSERT INTO productos (usuario_id, nombre) VALUES ($1, 'Otro') RETURNING id`, [usuarioId]);
    otroProductoId = p2.id;
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [[usuarioId, otroId]]).catch(() => undefined);
    await closeTestDb();
  });

  beforeEach(async () => {
    await q(`DELETE FROM ventas WHERE usuario_id = ANY($1::uuid[])`, [[usuarioId, otroId]]);
    await q(`DELETE FROM clientes WHERE usuario_id = ANY($1::uuid[])`, [[usuarioId, otroId]]);
  });

  it('sin ventas devuelve null: el análisis se queda con lo declarado', async () => {
    expect(await obtenerTraccionReal(usuarioId, productoId, '2026-04-15')).toBeNull();
  });

  it('promedia los tickets de los meses completos y saca el ticket medio', async () => {
    // Febrero: 2 ventas (100 y 300). Marzo: 4 ventas de 200.
    await venta(usuarioId, productoId, '2026-02-10', 100);
    await venta(usuarioId, productoId, '2026-02-20', 300);
    for (const d of ['05', '12', '19', '26']) await venta(usuarioId, productoId, `2026-03-${d}`, 200);

    const t = await obtenerTraccionReal(usuarioId, productoId, '2026-04-15');

    expect(t).not.toBeNull();
    expect(t!.meses_analizados).toBe(2);
    expect(t!.clientes_mes).toBe(3); // (2 + 4) / 2
    expect(t!.ticket_promedio).toBe(200); // (100+300+800) / 6
    expect(t!.confianza).toBe('media'); // 2 meses
  });

  it('el mes en curso no entra en el promedio', async () => {
    await venta(usuarioId, productoId, '2026-03-10', 100);
    await venta(usuarioId, productoId, '2026-03-11', 100);
    // Abril va a medias: una sola venta no puede arrastrar el promedio hacia abajo.
    await venta(usuarioId, productoId, '2026-04-02', 100);

    const t = await obtenerTraccionReal(usuarioId, productoId, '2026-04-15');

    expect(t!.meses_analizados).toBe(1);
    expect(t!.clientes_mes).toBe(2);
  });

  it('una venta cancelada no cuenta como tracción', async () => {
    await venta(usuarioId, productoId, '2026-03-05', 100);
    await venta(usuarioId, productoId, '2026-03-06', 999, 'cancelada');

    const t = await obtenerTraccionReal(usuarioId, productoId, '2026-04-15');

    expect(t!.clientes_mes).toBe(1);
    expect(t!.ticket_promedio).toBe(100);
  });

  it('no mezcla productos ni cuentas', async () => {
    await venta(usuarioId, productoId, '2026-03-05', 100);
    await venta(usuarioId, otroProductoId, '2026-03-06', 500);
    const [pAjeno] = await q(`INSERT INTO productos (usuario_id, nombre) VALUES ($1, 'Ajeno') RETURNING id`, [otroId]);
    await venta(otroId, pAjeno.id, '2026-03-07', 900);

    const t = await obtenerTraccionReal(usuarioId, productoId, '2026-04-15');

    expect(t!.clientes_mes).toBe(1);
    expect(t!.ticket_promedio).toBe(100);
  });

  it('la repetición solo se calcula con suficientes clientes identificados', async () => {
    // 3 clientes con nombre: muy pocos para hablar de repetición.
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [c] = await q(`INSERT INTO clientes (usuario_id, nombre) VALUES ($1, $2) RETURNING id`, [usuarioId, `Cliente ${i}`]);
      ids.push(c.id);
      await venta(usuarioId, productoId, '2026-03-05', 100, 'completada', c.id);
    }
    expect((await obtenerTraccionReal(usuarioId, productoId, '2026-04-15'))!.tasa_repeticion).toBeNull();

    // Con 5 identificados y 2 que repiten: 40 %.
    for (let i = 3; i < 5; i++) {
      const [c] = await q(`INSERT INTO clientes (usuario_id, nombre) VALUES ($1, $2) RETURNING id`, [usuarioId, `Cliente ${i}`]);
      ids.push(c.id);
      await venta(usuarioId, productoId, '2026-03-06', 100, 'completada', c.id);
    }
    await venta(usuarioId, productoId, '2026-03-20', 100, 'completada', ids[0]);
    await venta(usuarioId, productoId, '2026-03-21', 100, 'completada', ids[1]);

    const t = await obtenerTraccionReal(usuarioId, productoId, '2026-04-15');
    expect(t!.tasa_repeticion).toBe(40);
  });
});
