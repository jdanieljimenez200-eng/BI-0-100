import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { UnrecoverableError } from 'bullmq';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { cifrarToken } from '../../services/google/cifradoTokens';
import { firmarState, olvidarAccessToken } from '../../services/google/oauthGoogle';
import { procesarTrabajoCalendario, idEventoDeCita, TrabajoCalendario } from '../../services/google/calendarSync';
import { getCola } from '../../workers/calendarQueue';

/**
 * Agenda (Citas) y su copia en Google Calendar.
 *
 *  1. CRUD con validación: fechas y horas reales, fin después del inicio.
 *  2. Aislamiento: ni citas, ni clientes, ni productos de otra cuenta.
 *  3. Con Google conectado, cada alta/cambio/baja encola un trabajo y el
 *     worker lo refleja en Google (simulado con `fetch`) con la zona horaria
 *     del navegador del usuario.
 *  4. Enlace OAuth: el callback exige un state firmado y guarda el token cifrado.
 */
describeWithDb('Agenda y Google Calendar', () => {
  let usuarioId: string;
  let otroId: string;
  let token: string;
  let tokenOtro: string;
  let fetchSpy: jest.SpyInstance;
  const entornoOriginal = { ...process.env };

  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const tokenDe = (uid: string, email: string) =>
    jwt.sign({ userId: uid, email, role: 'owner', jti: randomUUID() }, process.env.JWT_SECRET!, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });
  const conAuth = (r: request.Test, t: string) => r.set('Authorization', `Bearer ${t}`);
  const cal = (t = token) => ({
    get: (ruta = '') => conAuth(request.default(app).get(`/api/calendario${ruta}`), t),
    post: (body: object) => conAuth(request.default(app).post('/api/calendario'), t).send(body),
    patch: (id: string, body: object) => conAuth(request.default(app).patch(`/api/calendario/${id}`), t).send(body),
    delete: (id: string) => conAuth(request.default(app).delete(`/api/calendario/${id}`), t),
  });
  const gcal = (t = token) => ({
    get: (ruta: string) => conAuth(request.default(app).get(`/api/integraciones/google-calendar${ruta}`), t),
    post: (ruta: string) => conAuth(request.default(app).post(`/api/integraciones/google-calendar${ruta}`), t),
    delete: () => conAuth(request.default(app).delete('/api/integraciones/google-calendar'), t),
  });

  const crearUsuario = async (prefijo: string) => {
    const email = `${prefijo}-${randomUUID()}@example.com`;
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Agenda', 'business') RETURNING id`,
      [email]
    );
    return { id: u.id as string, email };
  };

  const citaBase = (extra: object = {}) => ({
    titulo: 'Corte de cabello',
    fecha: '2026-11-20',
    hora_inicio: '10:00',
    hora_fin: '10:45',
    cliente_nombre: 'Ana López',
    cliente_telefono: '5512345678',
    ...extra,
  });

  const conectarGoogle = async (email = 'dueno@gmail.com') => {
    const [c] = await q(
      `INSERT INTO conexiones_google_calendar (usuario_id, cuenta_id, email_google, refresh_token_cifrado)
       VALUES ($1, $1, $2, $3) RETURNING id`,
      [usuarioId, email, cifrarToken('refresh-de-prueba')]
    );
    return c.id as string;
  };

  const trabajosEnCola = async () => {
    const jobs = await getCola().getJobs(['waiting', 'delayed', 'paused', 'prioritized']);
    return jobs.map((j) => j.data as TrabajoCalendario);
  };

  // ── Google simulado ────────────────────────────────────────────────────────
  type Llamada = { url: string; metodo: string; cuerpo: Record<string, unknown> | null };
  let llamadas: Llamada[];
  let responder: (l: Llamada) => { status: number; body?: object };

  const json = (status: number, body: object = {}) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  beforeAll(async () => {
    await initTestDb();
    process.env.GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/integraciones/google-calendar/callback';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    const dueno = await crearUsuario('agenda');
    usuarioId = dueno.id;
    token = tokenDe(dueno.id, dueno.email);
    const otro = await crearUsuario('agenda-otro');
    otroId = otro.id;
    tokenOtro = tokenDe(otro.id, otro.email);
  }, 60_000);

  afterAll(async () => {
    process.env = { ...entornoOriginal };
    await getCola().obliterate({ force: true }).catch(() => undefined);
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [[usuarioId, otroId]]).catch(() => undefined);
    await closeTestDb();
  });

  beforeEach(async () => {
    const previas = await q(`SELECT id FROM conexiones_google_calendar WHERE cuenta_id = $1`, [usuarioId]);
    for (const p of previas) await olvidarAccessToken(p.id);
    await q(`DELETE FROM conexiones_google_calendar WHERE cuenta_id = ANY($1::uuid[])`, [[usuarioId, otroId]]);
    await q(`DELETE FROM citas WHERE usuario_id = ANY($1::uuid[])`, [[usuarioId, otroId]]);
    await q(`DELETE FROM clientes WHERE usuario_id = ANY($1::uuid[])`, [[usuarioId, otroId]]);
    await q(`UPDATE usuarios SET zona_horaria = NULL WHERE id = $1`, [usuarioId]);
    await getCola().obliterate({ force: true }).catch(() => undefined);

    llamadas = [];
    responder = (l) => {
      if (l.url.includes('oauth2.googleapis.com/token')) return { status: 200, body: { access_token: 'at-1', expires_in: 3600 } };
      if (l.metodo === 'POST') return { status: 200, body: { id: l.cuerpo?.id } };
      return { status: 200, body: {} };
    };
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (entrada, init) => {
      const l: Llamada = {
        url: String(entrada),
        metodo: init?.method ?? 'GET',
        cuerpo: typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null,
      };
      llamadas.push(l);
      const r = responder(l);
      return json(r.status, r.body);
    });
  });

  afterEach(() => fetchSpy.mockRestore());

  // ── CRUD y validación ───────────────────────────────────────────────────────

  it('crea, lista por mes, edita y borra una cita', async () => {
    const creada = await cal().post(citaBase());
    expect(creada.status).toBe(201);
    expect(creada.body).toMatchObject({ titulo: 'Corte de cabello', estado: 'pendiente', google_sync_estado: null });

    const mes = await cal().get('?year=2026&month=11');
    expect(mes.status).toBe(200);
    expect(mes.body.map((c: { id: string }) => c.id)).toEqual([creada.body.id]);
    expect((await cal().get('?year=2026&month=10')).body).toEqual([]);

    const editada = await cal().patch(creada.body.id, { estado: 'confirmada', hora_fin: '11:30' });
    expect(editada.status).toBe(200);
    expect(editada.body).toMatchObject({ estado: 'confirmada', hora_inicio: '10:00:00', hora_fin: '11:30:00' });

    expect((await cal().delete(creada.body.id)).status).toBe(200);
    expect((await cal().get(`/${creada.body.id}`)).status).toBe(404);
    // Sin Google conectado no se toca la red ni la cola.
    expect(llamadas).toEqual([]);
    expect(await trabajosEnCola()).toEqual([]);
  });

  it('rechaza fechas y horas imposibles con 400, no con 500', async () => {
    for (const extra of [
      { fecha: '2026-02-30' },
      { hora_inicio: '25:00' },
      { hora_fin: '09:00' },
      { titulo: '  ' },
      { estado: 'borrada' },
      { cliente_email: 'no-es-email' },
    ]) {
      const r = await cal().post(citaBase(extra));
      expect({ extra, status: r.status }).toEqual({ extra, status: 400 });
    }
    const creada = await cal().post(citaBase());
    expect((await cal().patch(creada.body.id, { hora_fin: '09:30' })).status).toBe(400);
    expect((await cal().patch(creada.body.id, { fecha: '2026-13-01' })).status).toBe(400);
    expect((await cal().get('?year=2026&month=11&producto_id=abc')).status).toBe(400);
  });

  it('la cita crea el cliente en el CRM y enlaza uno existente', async () => {
    const r = await cal().post(citaBase({ crear_cliente: { nombre: 'Luis Pérez', telefono: '5588887777' } }));
    expect(r.status).toBe(201);
    expect(r.body.cliente_id).toBeTruthy();
    expect(r.body.cliente_nombre).toBe('Luis Pérez');

    const otra = await cal().post(citaBase({ cliente_id: r.body.cliente_id, cliente_nombre: undefined }));
    expect(otra.status).toBe(201);
    expect(otra.body.cliente_id).toBe(r.body.cliente_id);

    // Editar para dar de alta un cliente nuevo también funciona.
    const suelta = await cal().post(citaBase());
    const ed = await cal().patch(suelta.body.id, { crear_cliente: { nombre: 'Marta Ruiz' } });
    expect(ed.status).toBe(200);
    expect(ed.body.cliente_nombre).toBe('Marta Ruiz');
    expect(ed.body.cliente_id).toBeTruthy();
  });

  it('no deja ver, tocar ni enlazar datos de otra cuenta', async () => {
    const mia = await cal().post(citaBase());
    expect((await cal(tokenOtro).get(`/${mia.body.id}`)).status).toBe(404);
    expect((await cal(tokenOtro).patch(mia.body.id, { titulo: 'x' })).status).toBe(404);
    expect((await cal(tokenOtro).delete(mia.body.id)).status).toBe(404);
    expect((await cal(tokenOtro).get('?year=2026&month=11')).body).toEqual([]);

    // Cliente y producto de otra cuenta: antes el PATCH aceptaba cualquier cliente_id.
    const [clienteAjeno] = await q(
      `INSERT INTO clientes (usuario_id, nombre) VALUES ($1, 'Ajeno') RETURNING id`,
      [otroId]
    );
    expect((await cal().patch(mia.body.id, { cliente_id: clienteAjeno.id })).status).toBe(404);
    expect((await cal().post(citaBase({ cliente_id: clienteAjeno.id }))).status).toBe(404);
    const [productoAjeno] = await q(
      `INSERT INTO productos (usuario_id, nombre, descripcion, categoria) VALUES ($1, 'P', 'd', 'c') RETURNING id`,
      [otroId]
    );
    expect((await cal().post(citaBase({ producto_id: productoAjeno.id }))).status).toBe(404);
    const [cita] = await q(`SELECT cliente_id FROM citas WHERE id = $1`, [mia.body.id]);
    expect(cita.cliente_id).toBeNull();
  });

  // ── Zona horaria ────────────────────────────────────────────────────────────

  it('guarda la zona horaria que manda el navegador e ignora valores inválidos', async () => {
    const esperarZona = async (esperada: string | null) => {
      for (let i = 0; i < 40; i++) {
        const [u] = await q(`SELECT zona_horaria FROM usuarios WHERE id = $1`, [usuarioId]);
        if (u.zona_horaria === esperada) return u.zona_horaria;
        await new Promise((r) => setTimeout(r, 50));
      }
      const [u] = await q(`SELECT zona_horaria FROM usuarios WHERE id = $1`, [usuarioId]);
      return u.zona_horaria;
    };

    await cal().get('?year=2026&month=11').set('X-Zona-Horaria', 'Marte/Olympus');
    await new Promise((r) => setTimeout(r, 150));
    expect(await esperarZona(null)).toBeNull();

    await cal().get('?year=2026&month=11').set('X-Zona-Horaria', 'America/Tijuana');
    expect(await esperarZona('America/Tijuana')).toBe('America/Tijuana');
  });

  it('el navegador puede mandar X-Zona-Horaria (preflight CORS)', async () => {
    // El frontend la envía en TODAS las peticiones: si CORS no la permite, se cae la app entera.
    const res = await request
      .default(app)
      .options('/api/calendario')
      .set('Origin', process.env.FRONTEND_URL || 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-zona-horaria');
    expect(String(res.headers['access-control-allow-headers'] ?? '').toLowerCase()).toContain('x-zona-horaria');
  });

  // ── Google Calendar: sincronización ────────────────────────────────────────

  it('con Google conectado, el alta se encola y el worker crea el evento en la zona del usuario', async () => {
    await conectarGoogle();
    await q(`UPDATE usuarios SET zona_horaria = 'America/Monterrey' WHERE id = $1`, [usuarioId]);

    const creada = await cal().post(citaBase());
    expect(creada.status).toBe(201);
    expect(creada.body.google_sync_estado).toBe('pendiente');
    expect(await trabajosEnCola()).toEqual([{ tipo: 'guardar', citaId: creada.body.id }]);
    // La respuesta no esperó a Google.
    expect(llamadas).toEqual([]);

    await expect(procesarTrabajoCalendario({ tipo: 'guardar', citaId: creada.body.id })).resolves.toBe('sincronizada');

    const alta = llamadas.find((l) => l.metodo === 'POST' && l.url.includes('/calendars/primary/events'));
    expect(alta?.cuerpo).toMatchObject({
      id: idEventoDeCita(creada.body.id),
      summary: 'Corte de cabello',
      status: 'tentative',
      start: { dateTime: '2026-11-20T10:00:00', timeZone: 'America/Monterrey' },
      end: { dateTime: '2026-11-20T10:45:00', timeZone: 'America/Monterrey' },
    });
    const [cita] = await q(`SELECT google_event_id, google_sync_estado FROM citas WHERE id = $1`, [creada.body.id]);
    expect(cita).toEqual({ google_event_id: idEventoDeCita(creada.body.id), google_sync_estado: 'sincronizada' });

    // Cancelar → PATCH del mismo evento con status cancelled; el token sale de la caché.
    llamadas = [];
    await cal().patch(creada.body.id, { estado: 'cancelada' });
    await procesarTrabajoCalendario({ tipo: 'guardar', citaId: creada.body.id });
    expect(llamadas.map((l) => l.metodo)).toEqual(['PATCH']);
    expect(llamadas[0].url).toContain(`/events/${idEventoDeCita(creada.body.id)}`);
    expect(llamadas[0].cuerpo).toMatchObject({ status: 'cancelled' });

    // Borrar → trabajo de borrado con el id del evento.
    await getCola().obliterate({ force: true });
    await cal().delete(creada.body.id);
    const trabajos = await trabajosEnCola();
    expect(trabajos).toEqual([{ tipo: 'borrar', cuentaId: usuarioId, eventId: idEventoDeCita(creada.body.id) }]);
    llamadas = [];
    await expect(procesarTrabajoCalendario(trabajos[0])).resolves.toBe('borrada');
    expect(llamadas.map((l) => l.metodo)).toEqual(['DELETE']);
  });

  it('un reintento no duplica el evento: si Google ya lo tiene (409), lo actualiza', async () => {
    await conectarGoogle();
    const creada = await cal().post(citaBase());
    responder = (l) => {
      if (l.url.includes('/token')) return { status: 200, body: { access_token: 'at', expires_in: 3600 } };
      if (l.metodo === 'POST') return { status: 409, body: { error: { message: 'The requested identifier already exists.' } } };
      return { status: 200, body: { id: idEventoDeCita(creada.body.id) } };
    };
    await expect(procesarTrabajoCalendario({ tipo: 'guardar', citaId: creada.body.id })).resolves.toBe('sincronizada');
    expect(llamadas.filter((l) => !l.url.includes('/token')).map((l) => l.metodo)).toEqual(['POST', 'PATCH']);
  });

  it('si el evento se borró en Google, lo vuelve a crear', async () => {
    await conectarGoogle();
    const creada = await cal().post(citaBase());
    await q(`UPDATE citas SET google_event_id = 'viejo123' WHERE id = $1`, [creada.body.id]);
    responder = (l) => {
      if (l.url.includes('/token')) return { status: 200, body: { access_token: 'at', expires_in: 3600 } };
      if (l.metodo === 'PATCH') return { status: 404, body: { error: { message: 'Not Found' } } };
      return { status: 200, body: { id: l.cuerpo?.id } };
    };
    await procesarTrabajoCalendario({ tipo: 'guardar', citaId: creada.body.id });
    const [cita] = await q(`SELECT google_event_id FROM citas WHERE id = $1`, [creada.body.id]);
    expect(cita.google_event_id).toBe(idEventoDeCita(creada.body.id));
  });

  it('un fallo transitorio se relanza para reintentar; uno de datos se descarta', async () => {
    await conectarGoogle();
    const creada = await cal().post(citaBase());

    responder = (l) =>
      l.url.includes('/token') ? { status: 200, body: { access_token: 'at', expires_in: 3600 } } : { status: 503, body: {} };
    const transitorio = await procesarTrabajoCalendario({ tipo: 'guardar', citaId: creada.body.id }).catch((e: unknown) => e);
    expect(transitorio).not.toBeInstanceOf(UnrecoverableError);

    responder = (l) =>
      l.url.includes('/token')
        ? { status: 200, body: { access_token: 'at', expires_in: 3600 } }
        : { status: 400, body: { error: { message: 'Invalid start time.' } } };
    const definitivo = await procesarTrabajoCalendario({ tipo: 'guardar', citaId: creada.body.id }).catch((e: unknown) => e);
    expect(definitivo).toBeInstanceOf(UnrecoverableError);
    const [cita] = await q(`SELECT google_sync_estado, google_sync_error FROM citas WHERE id = $1`, [creada.body.id]);
    expect(cita).toEqual({ google_sync_estado: 'error', google_sync_error: 'Invalid start time.' });
  });

  it('si el usuario revocó el acceso en Google, la conexión queda pendiente de reconectar', async () => {
    await conectarGoogle();
    const creada = await cal().post(citaBase());
    responder = () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } });

    await expect(procesarTrabajoCalendario({ tipo: 'guardar', citaId: creada.body.id })).rejects.toBeInstanceOf(
      UnrecoverableError
    );
    const estado = await gcal().get('/estado');
    expect(estado.body).toMatchObject({ conectado: false, requiere_reconectar: true, email: 'dueno@gmail.com' });
    expect(estado.body.ultimo_error).toMatch(/Vuelve a conectar/);

    // Con la conexión inactiva, las citas nuevas ya no se encolan.
    await getCola().obliterate({ force: true });
    await cal().post(citaBase());
    expect(await trabajosEnCola()).toEqual([]);
  });

  // ── Google Calendar: enlace y estado ───────────────────────────────────────

  it('estado, conectar, sincronizar y desconectar', async () => {
    let estado = await gcal().get('/estado');
    expect(estado.status).toBe(200);
    expect(estado.body).toMatchObject({ disponible: true, conectado: false, requiere_reconectar: false });
    expect((await gcal().post('/sincronizar')).status).toBe(409);

    const conectar = await gcal().post('/conectar');
    expect(conectar.status).toBe(200);
    expect(conectar.body.url).toMatch(/^https:\/\/accounts\.google\.com\//);

    // Citas creadas antes de conectar: «Sincronizar ahora» las sube.
    const c1 = await cal().post(citaBase());
    await cal().post(citaBase({ estado: 'cancelada' })); // cancelada y nunca subida: se omite
    await cal().post(citaBase({ fecha: '2020-01-01' })); // muy antigua: se omite
    await conectarGoogle();
    const sync = await gcal().post('/sincronizar');
    expect(sync.body).toEqual({ encoladas: 1 });
    expect(await trabajosEnCola()).toEqual([{ tipo: 'guardar', citaId: c1.body.id }]);

    estado = await gcal().get('/estado');
    expect(estado.body).toMatchObject({ conectado: true, email: 'dueno@gmail.com', conectado_por_mi: true, citas_pendientes: 1 });
    expect(JSON.stringify(estado.body)).not.toContain('refresh');

    const fuera = await gcal().delete();
    expect(fuera.body).toEqual({ ok: true, revocado: true });
    const revocacion = llamadas.find((l) => l.url.includes('/revoke'));
    expect(revocacion).toBeDefined();
    expect((await gcal().get('/estado')).body.conectado).toBe(false);
    const [cita] = await q(`SELECT google_sync_estado FROM citas WHERE id = $1`, [c1.body.id]);
    expect(cita.google_sync_estado).toBeNull();
  });

  it('el callback exige un state válido y de un solo uso', async () => {
    const cb = (query: string) => request.default(app).get(`/api/integraciones/google-calendar/callback?${query}`);
    expect((await cb('code=x')).status).toBe(400);
    expect((await cb('code=x&state=falso.firma')).status).toBe(400);

    const idToken = `x.${Buffer.from(JSON.stringify({ email: 'nuevo@gmail.com' })).toString('base64url')}.y`;
    responder = (l) =>
      l.url.includes('/token')
        ? {
            status: 200,
            body: {
              access_token: 'at',
              refresh_token: 'rt-secreto',
              expires_in: 3600,
              scope: 'openid email https://www.googleapis.com/auth/calendar.events',
              id_token: idToken,
            },
          }
        : { status: 200, body: {} };

    const state = firmarState({ usuarioId, cuentaId: usuarioId });
    const ok = await cb(`code=codigo&state=${encodeURIComponent(state)}`);
    expect(ok.status).toBe(302);
    expect(ok.headers.location).toBe('http://localhost:3000/dashboard/herramientas/calendario?google=conectado');

    const [conexion] = await q(
      `SELECT email_google, refresh_token_cifrado, activa FROM conexiones_google_calendar WHERE cuenta_id = $1`,
      [usuarioId]
    );
    expect(conexion.email_google).toBe('nuevo@gmail.com');
    expect(conexion.activa).toBe(true);
    expect(conexion.refresh_token_cifrado).not.toContain('rt-secreto');

    // El mismo state no se puede canjear dos veces.
    expect((await cb(`code=codigo&state=${encodeURIComponent(state)}`)).status).toBe(400);

    // Si el usuario cancela en Google, vuelve a la agenda sin romper nada.
    const cancelado = await cb(`error=access_denied&state=${encodeURIComponent(firmarState({ usuarioId, cuentaId: usuarioId }))}`);
    expect(cancelado.status).toBe(302);
    expect(cancelado.headers.location).toContain('google=cancelado');
  });

  it('sin credenciales de Google, conectar responde 503 y el estado lo indica', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      expect((await gcal().post('/conectar')).status).toBe(503);
      expect((await gcal().get('/estado')).body.disponible).toBe(false);
    } finally {
      process.env.GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
    }
  });
});
