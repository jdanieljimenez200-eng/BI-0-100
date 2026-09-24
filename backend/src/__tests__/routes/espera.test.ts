import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * Fila de espera del día y catálogo de lugares (herramienta de Citas).
 *
 *  1. Alta, listado del día y orden por llegada.
 *  2. Flujo completo: llamar → atender en un lugar → liberar, con las
 *     transiciones imposibles rechazadas.
 *  3. Ocupación: dos grupos no caben en el mismo lugar a la vez.
 *  4. Aislamiento entre cuentas, también al asignar un lugar ajeno.
 *  5. Un lugar con historial se archiva, no se borra.
 *  6. Tope de movimientos del plan gratuito.
 */
describeWithDb('Fila de espera y lugares', () => {
  let usuarioId: string;
  let otroId: string;
  let freemiumId: string;
  let token: string;
  let tokenOtro: string;
  let tokenFreemium: string;

  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const tokenDe = (uid: string, email: string) =>
    jwt.sign({ userId: uid, email, role: 'owner', jti: randomUUID() }, process.env.JWT_SECRET!, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });
  const conAuth = (r: request.Test, t: string) => r.set('Authorization', `Bearer ${t}`);

  const espera = (t = token) => ({
    get: (ruta = '') => conAuth(request.default(app).get(`/api/calendario/espera${ruta}`), t),
    post: (body: object) => conAuth(request.default(app).post('/api/calendario/espera'), t).send(body),
    patch: (id: string, body: object) =>
      conAuth(request.default(app).patch(`/api/calendario/espera/${id}`), t).send(body),
    llamar: (id: string) => conAuth(request.default(app).post(`/api/calendario/espera/${id}/llamar`), t),
    estado: (id: string, body: object) =>
      conAuth(request.default(app).post(`/api/calendario/espera/${id}/estado`), t).send(body),
    delete: (id: string) => conAuth(request.default(app).delete(`/api/calendario/espera/${id}`), t),
  });
  const lugares = (t = token) => ({
    get: (ruta = '') => conAuth(request.default(app).get(`/api/calendario/lugares${ruta}`), t),
    post: (body: object) => conAuth(request.default(app).post('/api/calendario/lugares'), t).send(body),
    patch: (id: string, body: object) =>
      conAuth(request.default(app).patch(`/api/calendario/lugares/${id}`), t).send(body),
    delete: (id: string) => conAuth(request.default(app).delete(`/api/calendario/lugares/${id}`), t),
  });

  const crearUsuario = async (prefijo: string, plan = 'business') => {
    const email = `${prefijo}-${randomUUID()}@example.com`;
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Fila', $2) RETURNING id`,
      [email, plan]
    );
    return { id: u.id as string, email };
  };

  /** Crea un lugar y devuelve su id. */
  const nuevoLugar = async (nombre: string, t = token) => {
    const r = await lugares(t).post({ nombre });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };

  beforeAll(async () => {
    await initTestDb();
    const dueno = await crearUsuario('fila');
    usuarioId = dueno.id;
    token = tokenDe(dueno.id, dueno.email);
    const otro = await crearUsuario('fila-otro');
    otroId = otro.id;
    tokenOtro = tokenDe(otro.id, otro.email);
    const gratis = await crearUsuario('fila-free', 'freemium');
    freemiumId = gratis.id;
    tokenFreemium = tokenDe(gratis.id, gratis.email);
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [[usuarioId, otroId, freemiumId]]).catch(() => undefined);
    await closeTestDb();
  });

  beforeEach(async () => {
    const ids = [[usuarioId, otroId, freemiumId]];
    await q(`DELETE FROM turnos_espera WHERE usuario_id = ANY($1::uuid[])`, ids);
    await q(`DELETE FROM lugares_atencion WHERE usuario_id = ANY($1::uuid[])`, ids);
    await q(`DELETE FROM clientes WHERE usuario_id = ANY($1::uuid[])`, ids);
  });

  // ── Alta y listado ──────────────────────────────────────────────────────────

  it('anota gente en la fila y la lista del día en orden de llegada', async () => {
    const primero = await espera().post({ cliente_nombre: 'Ana López', cliente_telefono: '5512345678', personas: 2 });
    expect(primero.status).toBe(201);
    expect(primero.body).toMatchObject({ estado: 'esperando', personas: 2, cliente_nombre: 'Ana López' });
    expect(primero.body.hora_llegada).toBeTruthy();
    // Sin pedirlo, la fila no toca el CRM: es gente de paso.
    expect(primero.body.cliente_id).toBeNull();

    const segundo = await espera().post({ cliente_nombre: 'Beto' });
    expect(segundo.status).toBe(201);
    expect(segundo.body.personas).toBe(1);

    const lista = await espera().get();
    expect(lista.status).toBe(200);
    expect(lista.body.turnos.map((t: { cliente_nombre: string }) => t.cliente_nombre)).toEqual(['Ana López', 'Beto']);
    // El día se calcula en el backend, no lo manda el navegador.
    expect(lista.body.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lista.body.turnos[0].fecha).toBe(lista.body.fecha);
  });

  it('exige nombre y rechaza una fecha imposible en el listado', async () => {
    expect((await espera().post({ cliente_nombre: '  ' })).status).toBe(400);
    expect((await espera().post({ cliente_nombre: 'Ana', personas: 0 })).status).toBe(400);
    expect((await espera().get('?fecha=20-11-2026')).status).toBe(400);
  });

  it('enlaza el CRM solo si se pide, y entonces guarda el cliente', async () => {
    const r = await espera().post({
      cliente_nombre: 'Carla Ruiz',
      crear_cliente: { nombre: 'Carla Ruiz', telefono: '5598765432' },
    });
    expect(r.status).toBe(201);
    expect(r.body.cliente_id).toBeTruthy();

    const [cliente] = await q(`SELECT nombre FROM clientes WHERE id = $1`, [r.body.cliente_id]);
    expect(cliente.nombre).toBe('Carla Ruiz');
  });

  // ── Flujo de la fila ────────────────────────────────────────────────────────

  it('llama, sienta y libera: el lugar vuelve a quedar libre', async () => {
    const mesa = await nuevoLugar('Mesa 4');
    const turno = (await espera().post({ cliente_nombre: 'Ana López', cliente_telefono: '55 1234 5678' })).body;

    const llamada = await espera().llamar(turno.id);
    expect(llamada.status).toBe(200);
    expect(llamada.body.turno.estado).toBe('llamado');
    expect(llamada.body.turno.hora_llamado).toBeTruthy();
    // El mensaje va listo para enviar; la app nunca lo manda sola.
    expect(llamada.body.whatsapp_url).toContain('https://wa.me/5512345678?text=');
    expect(decodeURIComponent(llamada.body.whatsapp_url)).toContain('Ana');

    const sentada = await espera().estado(turno.id, { estado: 'atendido', lugar_id: mesa });
    expect(sentada.status).toBe(200);
    expect(sentada.body).toMatchObject({ estado: 'atendido', lugar_id: mesa });
    expect(sentada.body.hora_atendido).toBeTruthy();

    const ocupados = await lugares().get();
    expect(ocupados.body[0].ocupado_por).toMatchObject({ cliente_nombre: 'Ana López', turno_id: turno.id });

    const liberada = await espera().estado(turno.id, { estado: 'liberado' });
    expect(liberada.status).toBe(200);
    expect(liberada.body.hora_liberado).toBeTruthy();

    const libres = await lugares().get();
    expect(libres.body[0].ocupado_por).toBeNull();
  });

  it('sin teléfono se puede llamar igual: queda marcado en pantalla', async () => {
    const turno = (await espera().post({ cliente_nombre: 'Sin Teléfono' })).body;
    const llamada = await espera().llamar(turno.id);
    expect(llamada.status).toBe(200);
    expect(llamada.body.turno.estado).toBe('llamado');
    expect(llamada.body.whatsapp_url).toBeNull();
  });

  it('rechaza las transiciones imposibles', async () => {
    const mesa = await nuevoLugar('Mesa 1');
    const turno = (await espera().post({ cliente_nombre: 'Ana' })).body;

    // Liberar algo que nunca se atendió.
    const pronto = await espera().estado(turno.id, { estado: 'liberado' });
    expect(pronto.status).toBe(400);

    // Atender sin decir dónde.
    expect((await espera().estado(turno.id, { estado: 'atendido' })).status).toBe(400);

    await espera().estado(turno.id, { estado: 'atendido', lugar_id: mesa });
    // Ya sentado, no se le vuelve a llamar a la fila.
    expect((await espera().llamar(turno.id)).status).toBe(400);
    expect((await espera().estado(turno.id, { estado: 'no_llego' })).status).toBe(400);
  });

  it('no sienta a dos grupos en el mismo lugar', async () => {
    const mesa = await nuevoLugar('Mesa 7');
    const ana = (await espera().post({ cliente_nombre: 'Ana' })).body;
    const beto = (await espera().post({ cliente_nombre: 'Beto' })).body;

    expect((await espera().estado(ana.id, { estado: 'atendido', lugar_id: mesa })).status).toBe(200);
    const choque = await espera().estado(beto.id, { estado: 'atendido', lugar_id: mesa });
    expect(choque.status).toBe(409);
    expect(choque.body.error).toContain('Ana');

    // Liberada la mesa, el siguiente ya puede sentarse.
    await espera().estado(ana.id, { estado: 'liberado' });
    expect((await espera().estado(beto.id, { estado: 'atendido', lugar_id: mesa })).status).toBe(200);
  });

  // ── Lugares ─────────────────────────────────────────────────────────────────

  it('no permite dos lugares activos con el mismo nombre, pero sí reusar el de uno archivado', async () => {
    await nuevoLugar('Mesa 2');
    const repetido = await lugares().post({ nombre: 'mesa 2' });
    expect(repetido.status).toBe(409);

    const otra = await lugares().post({ nombre: 'Mesa 3', capacidad: 4 });
    expect(otra.body.capacidad).toBe(4);
    await lugares().delete(otra.body.id);
    expect((await lugares().post({ nombre: 'Mesa 3' })).status).toBe(201);
  });

  it('el lugar que ya se usó en la fila se archiva, no se borra', async () => {
    const mesa = await nuevoLugar('Mesa 9');
    const turno = (await espera().post({ cliente_nombre: 'Ana' })).body;
    await espera().estado(turno.id, { estado: 'atendido', lugar_id: mesa });
    await espera().estado(turno.id, { estado: 'liberado' });

    const borrado = await lugares().delete(mesa);
    expect(borrado.body).toMatchObject({ ok: true, archivado: true });

    // Sigue en la base y el turno conserva a qué lugar fue.
    const [fila] = await q(`SELECT activo FROM lugares_atencion WHERE id = $1`, [mesa]);
    expect(fila.activo).toBe(false);
    const [t] = await q(`SELECT lugar_id FROM turnos_espera WHERE id = $1`, [turno.id]);
    expect(t.lugar_id).toBe(mesa);

    // Y deja de ofrecerse para sentar a gente nueva.
    expect((await lugares().get()).body).toHaveLength(0);
    expect((await lugares().get('?incluir_inactivos=true')).body).toHaveLength(1);
  });

  // ── Aislamiento entre cuentas ───────────────────────────────────────────────

  it('no deja ver ni tocar la fila ni los lugares de otra cuenta', async () => {
    const mesaAjena = await nuevoLugar('Mesa ajena', tokenOtro);
    const turnoAjeno = (await espera(tokenOtro).post({ cliente_nombre: 'De otra cuenta' })).body;

    expect((await espera().get()).body.turnos).toHaveLength(0);
    expect((await lugares().get()).body).toHaveLength(0);

    expect((await espera().patch(turnoAjeno.id, { personas: 5 })).status).toBe(404);
    expect((await espera().llamar(turnoAjeno.id)).status).toBe(404);
    expect((await espera().delete(turnoAjeno.id)).status).toBe(404);
    expect((await lugares().patch(mesaAjena, { nombre: 'Mía' })).status).toBe(404);
    expect((await lugares().delete(mesaAjena)).status).toBe(404);

    // Ni sentar a alguien propio en un lugar ajeno.
    const propio = (await espera().post({ cliente_nombre: 'Ana' })).body;
    expect((await espera().post({ cliente_nombre: 'Ana', lugar_id: mesaAjena })).status).toBe(404);
    expect((await espera().estado(propio.id, { estado: 'atendido', lugar_id: mesaAjena })).status).toBe(404);
  });

  it('sin token no se llega a la fila', async () => {
    expect((await request.default(app).get('/api/calendario/espera')).status).toBe(401);
    expect((await request.default(app).get('/api/calendario/lugares')).status).toBe(401);
  });

  // ── Tope del plan ───────────────────────────────────────────────────────────

  it('el plan gratuito topa los turnos y ofrece mejorar', async () => {
    for (let i = 0; i < 2; i++) {
      const r = await espera(tokenFreemium).post({ cliente_nombre: `Turno ${i}` });
      expect(r.status).toBe(201);
    }
    const tope = await espera(tokenFreemium).post({ cliente_nombre: 'Uno de más' });
    expect(tope.status).toBe(429);
    expect(tope.body).toMatchObject({ upgrade_required: true });

    // El tope de la fila no bloquea leerla.
    expect((await espera(tokenFreemium).get()).status).toBe(200);
  });
});
