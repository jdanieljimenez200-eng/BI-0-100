import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { hoyEnZona } from '../../utils/fechaLocal';

/**
 * Herramienta Mantenimientos de punta a punta.
 *
 * Lo que se vigila:
 *  1. El intervalo sale del catálogo y se ajusta por intensidad, sin gastar créditos.
 *  2. El tope del plan gratuito cuenta equipos dados de alta.
 *  3. Registrar un mantenimiento con costo genera el egreso en Contabilidad —y sin
 *     costo no genera nada—, y mueve el semáforo.
 *  4. Nadie ve ni toca los equipos de otra cuenta.
 */
describeWithDb('Herramienta de mantenimientos', () => {
  let usuarioId: string;
  let otroUsuarioId: string;
  let token: string;
  let tokenOtro: string;

  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const tokenDe = (uid: string, email: string) =>
    jwt.sign({ userId: uid, email, role: 'owner', jti: randomUUID() }, process.env.JWT_SECRET!, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });
  const api = (t = token) => ({
    get: (ruta: string) => request.default(app).get(`/api/mantenimientos${ruta}`).set('Authorization', `Bearer ${t}`),
    post: (ruta: string, body: object = {}) =>
      request.default(app).post(`/api/mantenimientos${ruta}`).set('Authorization', `Bearer ${t}`).send(body),
    patch: (ruta: string, body: object = {}) =>
      request.default(app).patch(`/api/mantenimientos${ruta}`).set('Authorization', `Bearer ${t}`).send(body),
    delete: (ruta: string) =>
      request.default(app).delete(`/api/mantenimientos${ruta}`).set('Authorization', `Bearer ${t}`),
  });

  const crearUsuario = async (prefijo: string, plan: string) => {
    const email = `${prefijo}-${randomUUID()}@example.com`;
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre, plan) VALUES ($1, 'x', 'Mantenimientos', $2) RETURNING id`,
      [email, plan]
    );
    return { id: u.id as string, email };
  };

  beforeAll(async () => {
    await initTestDb();
    // business tiene la herramienta incluida y sin tope de movimientos.
    const dueno = await crearUsuario('mant', 'business');
    usuarioId = dueno.id;
    token = tokenDe(dueno.id, dueno.email);

    const otro = await crearUsuario('mant-otro', 'business');
    otroUsuarioId = otro.id;
    tokenOtro = tokenDe(otro.id, otro.email);
  }, 60_000);

  afterAll(async () => {
    await q(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [[usuarioId, otroUsuarioId]]).catch(() => undefined);
    await closeTestDb();
  });

  beforeEach(async () => {
    await q(`DELETE FROM equipos_mantenimiento WHERE usuario_id = $1`, [usuarioId]);
  });

  it('el catálogo llega sin tocar la base', async () => {
    const res = await api().get('/catalogo');
    expect(res.status).toBe(200);
    expect(res.body.tipos.length).toBeGreaterThan(30);
    expect(res.body.intensidades).toHaveLength(3);
    expect(res.body.tipos.some((t: { clave: string }) => t.clave === 'refrigerador')).toBe(true);
  });

  it('sugiere el intervalo del catálogo sin gastar créditos', async () => {
    const res = await api().post('/sugerencia', { texto: 'refrigerador', intensidad_uso: 'intenso' });
    expect(res.status).toBe(200);
    expect(res.body.costo_creditos).toBe(0);
    expect(res.body.sugerencia).toMatchObject({ clave: 'refrigerador', origen: 'catalogo', intervalo_dias: 125 });
  });

  it('un equipo desconocido NO gasta crédito mientras se escribe', async () => {
    // La pantalla consulta el catálogo en cada tecla: si eso llamara a la IA,
    // escribir "máquina de humo" vaciaría los créditos del mes sin pedirlo.
    const res = await api().post('/sugerencia', { texto: 'máquina de humo para eventos' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sugerencia: null, costo_creditos: 0, requiere_ia: true });
    const [{ n }] = await q(
      `SELECT count(*)::int AS n FROM creditos_consumo WHERE usuario_id = $1 AND accion = 'mantenimiento_sugerencia'`,
      [usuarioId]
    );
    expect(n).toBe(0);
  });

  it('sin clave de IA responde plantilla y tampoco cobra', async () => {
    const claveOriginal = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = '';
    try {
      const res = await api().post('/sugerencia', { texto: 'máquina de humo', permitir_ia: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ costo_creditos: 0, ia_disponible: false });
      expect(res.body.sugerencia.intervalo_dias).toBe(180);
      const [{ n }] = await q(
        `SELECT count(*)::int AS n FROM creditos_consumo WHERE usuario_id = $1 AND accion = 'mantenimiento_sugerencia'`,
        [usuarioId]
      );
      expect(n).toBe(0);
    } finally {
      process.env.ANTHROPIC_API_KEY = claveOriginal;
    }
  });

  it('da de alta un equipo resolviendo el intervalo por su nombre', async () => {
    const res = await api().post('/', { nombre: 'Refrigerador de la cocina', intensidad_uso: 'intenso' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      tipo_clave: 'refrigerador',
      intervalo_dias: 125,
      intervalo_origen: 'catalogo',
      estado: 'sin_registro',
      proximo_en: null,
    });
    expect(res.body.nota_servicio).toContain('condensador');
  });

  it('un equipo desconocido exige intervalo, y con él queda como manual', async () => {
    const sinIntervalo = await api().post('/', { nombre: 'Artefacto rarísimo' });
    expect(sinIntervalo.status).toBe(400);
    expect(sinIntervalo.body.codigo).toBe('INTERVALO_REQUERIDO');

    const conIntervalo = await api().post('/', { nombre: 'Artefacto rarísimo', intervalo_dias: 45 });
    expect(conIntervalo.status).toBe(201);
    expect(conIntervalo.body).toMatchObject({ tipo_clave: 'otro', intervalo_dias: 45, intervalo_origen: 'manual' });
  });

  it('el semáforo separa vencidos, próximos y al día', async () => {
    // El servidor mide los días desde el "hoy" local (CDMX por defecto).
    const hoy = new Date(`${hoyEnZona('America/Mexico_City')}T00:00:00Z`);
    const haceDias = (dias: number) =>
      new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - dias)).toISOString().slice(0, 10);

    await api().post('/', { nombre: 'Freidora', fecha_ultimo: haceDias(40) });      // 15 días → vencida
    await api().post('/', { nombre: 'Parrilla', fecha_ultimo: haceDias(29) });      // 30 días → próxima
    await api().post('/', { nombre: 'Extintor', fecha_ultimo: haceDias(10) });      // 365 días → al día
    await api().post('/', { nombre: 'Tijeras' });                                   // sin registro

    const res = await api().get('/');
    expect(res.status).toBe(200);
    expect(res.body.resumen).toMatchObject({ total: 4, vencidos: 1, proximos: 1, al_dia: 1, sin_registro: 1 });
  });

  it('registrar con costo crea el egreso en contabilidad y mueve el semáforo', async () => {
    const alta = await api().post('/', { nombre: 'Minisplit de la sala' });
    const equipoId = alta.body.id as string;

    const registro = await api().post(`/${equipoId}/registrar`, {
      costo: 850.5,
      responsable: 'Servicios Fríos SA',
      notas: 'Lavado de filtros y carga de gas',
    });

    expect(registro.status).toBe(201);
    expect(registro.body.movimiento_contable_id).toBeTruthy();
    expect(registro.body.equipo.estado).toBe('al_dia');
    expect(registro.body.equipo.fecha_ultimo).toBe(hoyEnZona('America/Mexico_City'));

    const [movimiento] = await q(
      `SELECT tipo, categoria, monto, fuente, referencia_tipo, referencia_id FROM movimientos_contables WHERE id = $1`,
      [registro.body.movimiento_contable_id]
    );
    expect(movimiento).toMatchObject({
      tipo: 'egreso',
      categoria: 'Mantenimiento',
      fuente: 'mantenimiento',
      referencia_tipo: 'mantenimiento',
      referencia_id: registro.body.registro.id,
    });
    expect(Number(movimiento.monto)).toBeCloseTo(850.5, 2);
  });

  it('registrar sin costo no toca contabilidad', async () => {
    const alta = await api().post('/', { nombre: 'Tijeras' });
    const antes = await q(`SELECT count(*)::int AS n FROM movimientos_contables WHERE usuario_id = $1`, [usuarioId]);

    const registro = await api().post(`/${alta.body.id}/registrar`, { notas: 'Afiladas en casa' });

    expect(registro.status).toBe(201);
    expect(registro.body.movimiento_contable_id).toBeNull();
    const despues = await q(`SELECT count(*)::int AS n FROM movimientos_contables WHERE usuario_id = $1`, [usuarioId]);
    expect(despues[0].n).toBe(antes[0].n);
  });

  it('rechaza una fecha futura', async () => {
    const alta = await api().post('/', { nombre: 'Horno' });
    const manana = new Date(Date.parse(`${hoyEnZona('America/Mexico_City')}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const res = await api().post(`/${alta.body.id}/registrar`, { fecha: manana });
    expect(res.status).toBe(400);
  });

  it('el historial acumula el gasto del equipo', async () => {
    const alta = await api().post('/', { nombre: 'Campana extractor' });
    await api().post(`/${alta.body.id}/registrar`, { costo: 300, fecha: '2026-01-10' });
    await api().post(`/${alta.body.id}/registrar`, { costo: 200.25, fecha: '2026-05-10' });

    const res = await api().get(`/${alta.body.id}/historial`);
    expect(res.status).toBe(200);
    expect(res.body.historial).toHaveLength(2);
    expect(res.body.gasto_total).toBeCloseTo(500.25, 2);
    // Más reciente primero.
    expect(res.body.historial[0].fecha).toBe('2026-05-10');
  });

  it('cambiar la intensidad recalcula el intervalo del catálogo, y uno manual no se toca', async () => {
    const alta = await api().post('/', { nombre: 'Refrigerador', intensidad_uso: 'normal' });
    expect(alta.body.intervalo_dias).toBe(180);

    const intenso = await api().patch(`/${alta.body.id}`, { intensidad_uso: 'intenso' });
    expect(intenso.body.intervalo_dias).toBe(125);

    const manual = await api().patch(`/${alta.body.id}`, { intervalo_dias: 60 });
    expect(manual.body).toMatchObject({ intervalo_dias: 60, intervalo_origen: 'manual' });

    const otraIntensidad = await api().patch(`/${alta.body.id}`, { intensidad_uso: 'bajo' });
    expect(otraIntensidad.body.intervalo_dias).toBe(60);
  });

  it('los equipos de otra cuenta no se ven ni se tocan', async () => {
    const alta = await api().post('/', { nombre: 'Boiler' });

    expect((await api(tokenOtro).get('/')).body.equipos).toHaveLength(0);
    expect((await api(tokenOtro).get(`/${alta.body.id}/historial`)).status).toBe(404);
    expect((await api(tokenOtro).post(`/${alta.body.id}/registrar`, {})).status).toBe(404);
    expect((await api(tokenOtro).delete(`/${alta.body.id}`)).status).toBe(404);
  });

  it('un id que no es UUID responde 400, no 500', async () => {
    expect((await api().get('/no-es-uuid/historial')).status).toBe(400);
  });

  describe('tope del plan gratuito', () => {
    let freemiumId: string;
    let tokenFreemium: string;

    beforeAll(async () => {
      const u = await crearUsuario('mant-free', 'freemium');
      freemiumId = u.id;
      tokenFreemium = tokenDe(u.id, u.email);
    });

    afterAll(async () => {
      await q(`DELETE FROM usuarios WHERE id = $1`, [freemiumId]).catch(() => undefined);
    });

    it('deja probar con dos equipos y pide mejorar plan en el tercero', async () => {
      const alta = (nombre: string) =>
        request.default(app)
          .post('/api/mantenimientos')
          .set('Authorization', `Bearer ${tokenFreemium}`)
          .send({ nombre });

      expect((await alta('Refrigerador')).status).toBe(201);
      expect((await alta('Freidora')).status).toBe(201);

      const tercero = await alta('Parrilla');
      expect(tercero.status).toBe(429);
      expect(tercero.body.upgrade_required).toBe(true);
    });
  });
});
