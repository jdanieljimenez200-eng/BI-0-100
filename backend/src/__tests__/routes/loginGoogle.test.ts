import { randomUUID } from 'crypto';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';

/**
 * Entrar y registrarse con Google, de punta a punta: la ida a Google, la vuelta
 * al callback y el canje de la cookie de sesión. Google se simula interceptando
 * `fetch` al endpoint de tokens.
 */
describeWithDb('Entrar y registrarse con Google', () => {
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const CLIENTE = 'cliente-test.apps.googleusercontent.com';
  const APP = 'http://app.test';
  const emails: string[] = [];
  const envAntes = { ...process.env };

  const configurar = () => {
    process.env.GOOGLE_CLIENT_ID = CLIENTE;
    process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';
    process.env.GOOGLE_LOGIN_REDIRECT_URI = 'http://localhost:3001/api/auth/google/callback';
  };
  const desconfigurar = () => {
    delete process.env.GOOGLE_LOGIN_REDIRECT_URI;
  };

  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const idToken = (claims: Record<string, unknown>) => `${b64({ alg: 'RS256' })}.${b64(claims)}.firma`;
  const nuevoEmail = () => {
    const e = `google-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  /** Google responde al canje del código con un id_token con estos claims. */
  const googleResponde = (claims: Record<string, unknown>) =>
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'at', id_token: idToken(claims) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

  const iniciar = async (query = '') => {
    const r = await request.default(app).get(`/api/auth/google${query}`);
    expect(r.status).toBe(302);
    const url = new URL(r.headers.location);
    const galleta = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('bi_google='));
    return { url, state: url.searchParams.get('state')!, nonce: url.searchParams.get('nonce')!, galleta: galleta?.split(';')[0] ?? '' };
  };

  const volver = (state: string, galleta: string, extra = '') =>
    request.default(app).get(`/api/auth/google/callback?code=codigo&state=${encodeURIComponent(state)}${extra}`).set('Cookie', galleta);

  const claims = (nonce: string, email: string, sub = randomUUID().replace(/-/g, ''), extra: Record<string, unknown> = {}) => ({
    iss: 'https://accounts.google.com',
    aud: CLIENTE,
    exp: Math.floor(Date.now() / 1000) + 3600,
    nonce,
    sub,
    email,
    email_verified: true,
    name: 'Laura Pérez',
    ...extra,
  });

  const destino = (r: request.Response) => {
    const u = new URL(r.headers.location);
    return { ruta: u.origin + u.pathname, error: u.searchParams.get('error'), nuevo: u.searchParams.get('nuevo') };
  };

  beforeAll(async () => {
    await initTestDb();
    process.env.NEXT_PUBLIC_APP_URL = APP;
  }, 60_000);

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    process.env = envAntes;
    if (emails.length) await q(`DELETE FROM usuarios WHERE email = ANY($1::text[])`, [emails]).catch(() => undefined);
    await closeTestDb();
  });

  it('sin configurar no ofrece el botón y el enlace vuelve con un error claro', async () => {
    desconfigurar();
    expect((await request.default(app).get('/api/auth/proveedores')).body).toEqual({ google: false });
    const r = await request.default(app).get('/api/auth/google?modo=registro');
    expect(destino(r)).toMatchObject({ ruta: `${APP}/auth/signup`, error: 'google_no_disponible' });
  });

  it('la ida a Google pide solo identidad, con PKCE y cookie ligada al navegador', async () => {
    configurar();
    expect((await request.default(app).get('/api/auth/proveedores')).body).toEqual({ google: true });
    const { url, galleta } = await iniciar('?modo=login');
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENTE);
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(galleta).toMatch(/^bi_google=/);
  });

  it('registra una cuenta nueva, deja la sesión en la cookie y el refresh la canjea', async () => {
    configurar();
    const email = nuevoEmail();
    const { state, nonce, galleta } = await iniciar('?modo=registro&tipo=experto');
    googleResponde(claims(nonce, email));

    const r = await volver(state, galleta);
    expect(destino(r)).toEqual({ ruta: `${APP}/auth/google`, error: null, nuevo: '1' });
    const refresh = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('bi_refresh='));
    expect(refresh).toBeTruthy();

    const [u] = await q(`SELECT tipo_cuenta, account_role, google_sub IS NOT NULL AS con_google, nombre FROM usuarios WHERE email = $1`, [email]);
    expect(u).toEqual({ tipo_cuenta: 'experto', account_role: 'owner', con_google: true, nombre: 'Laura Pérez' });

    const canje = await request.default(app).post('/api/auth/refresh').set('Cookie', refresh!.split(';')[0]);
    expect(canje.status).toBe(200);
    expect(canje.body.accessToken).toBeTruthy();
  });

  it('la segunda vez entra en la misma cuenta, sin duplicarla', async () => {
    configurar();
    const email = nuevoEmail();
    const sub = randomUUID().replace(/-/g, '');
    for (const esperado of ['1', null]) {
      const { state, nonce, galleta } = await iniciar('?modo=login');
      googleResponde(claims(nonce, email, sub));
      expect(destino(await volver(state, galleta)).nuevo).toBe(esperado);
    }
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM usuarios WHERE email = $1`, [email]);
    expect(n).toBe(1);
  });

  it('una cuenta con contraseña del mismo email se enlaza y sigue entrando con contraseña', async () => {
    configurar();
    const email = nuevoEmail();
    const alta = await request.default(app).post('/api/auth/signup').send({ name: 'Ana', email, password: 'Segura#2026' });
    expect(alta.status).toBe(201);

    const { state, nonce, galleta } = await iniciar('?modo=login');
    googleResponde(claims(nonce, email));
    expect(destino(await volver(state, galleta))).toEqual({ ruta: `${APP}/auth/google`, error: null, nuevo: null });

    const [u] = await q(`SELECT google_sub IS NOT NULL AS con_google FROM usuarios WHERE email = $1`, [email]);
    expect(u.con_google).toBe(true);
    expect((await request.default(app).post('/api/auth/login').send({ email, password: 'Segura#2026' })).status).toBe(200);
  });

  it('rechaza email sin verificar, cuentas desactivadas y otro Google con el mismo correo', async () => {
    configurar();
    let v = await iniciar('?modo=registro');
    const sinVerificar = nuevoEmail();
    googleResponde(claims(v.nonce, sinVerificar, undefined, { email_verified: false }));
    expect(destino(await volver(v.state, v.galleta)).error).toBe('email_no_verificado');
    expect((await q(`SELECT 1 FROM usuarios WHERE email = $1`, [sinVerificar])).length).toBe(0);

    const desactivada = nuevoEmail();
    await request.default(app).post('/api/auth/signup').send({ name: 'B', email: desactivada, password: 'Segura#2026' });
    await q(`UPDATE usuarios SET activo = false WHERE email = $1`, [desactivada]);
    v = await iniciar('?modo=login');
    googleResponde(claims(v.nonce, desactivada));
    expect(destino(await volver(v.state, v.galleta)).error).toBe('cuenta_desactivada');

    const enlazada = nuevoEmail();
    v = await iniciar('?modo=login');
    googleResponde(claims(v.nonce, enlazada, 'sub-original'));
    await volver(v.state, v.galleta);
    v = await iniciar('?modo=login');
    googleResponde(claims(v.nonce, enlazada, 'sub-de-otra-cuenta'));
    expect(destino(await volver(v.state, v.galleta)).error).toBe('google_otra_cuenta');
  });

  it('sin la cookie del navegador, con el state reutilizado o alterado no entra nadie', async () => {
    configurar();
    const email = nuevoEmail();
    const v = await iniciar('?modo=login');
    expect(destino(await volver(v.state, '')).error).toBe('session_expired');
    expect(destino(await volver(v.state.slice(0, -2) + 'xx', v.galleta)).error).toBe('session_expired');

    googleResponde(claims(v.nonce, email));
    expect(destino(await volver(v.state, v.galleta)).error).toBeNull();
    expect(destino(await volver(v.state, v.galleta)).error).toBe('session_expired');
  });

  it('un id_token de otro intento o de otro cliente se rechaza', async () => {
    configurar();
    let v = await iniciar('?modo=login');
    googleResponde(claims('otro-nonce', nuevoEmail()));
    expect(destino(await volver(v.state, v.galleta)).error).toBe('google_failed');

    v = await iniciar('?modo=login');
    googleResponde(claims(v.nonce, nuevoEmail(), undefined, { aud: 'otro-cliente' }));
    expect(destino(await volver(v.state, v.galleta)).error).toBe('google_failed');
  });

  it('si el usuario cancela en Google vuelve a la pantalla de donde salió', async () => {
    configurar();
    const v = await iniciar('?modo=registro');
    const r = await volver(v.state, v.galleta, '&error=access_denied');
    expect(destino(r)).toMatchObject({ ruta: `${APP}/auth/signup`, error: 'oauth_denied' });
  });

  it('con código de invitación, el alta con Google entra como colaborador de esa cuenta', async () => {
    configurar();
    const dueno = nuevoEmail();
    const [d] = await q(`INSERT INTO usuarios (email, password_hash, nombre) VALUES ($1, 'x', 'Dueño') RETURNING id`, [dueno]);
    const codigo = `G${randomUUID().slice(0, 7).toUpperCase()}`;
    await q(`INSERT INTO invitaciones_trabajador (cuenta_id, codigo, expira_en) VALUES ($1, $2, NOW() + interval '1 day')`, [d.id, codigo]);

    const email = nuevoEmail();
    const v = await iniciar(`?modo=registro&codigo=${codigo}`);
    googleResponde(claims(v.nonce, email));
    expect(destino(await volver(v.state, v.galleta)).nuevo).toBe('1');

    const [u] = await q(`SELECT account_role, owner_id FROM usuarios WHERE email = $1`, [email]);
    expect(u).toEqual({ account_role: 'trabajador', owner_id: d.id });
    const [inv] = await q(`SELECT usado_por IS NOT NULL AS usada FROM invitaciones_trabajador WHERE codigo = $1`, [codigo]);
    expect(inv.usada).toBe(true);
  });
});
