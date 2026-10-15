import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, hacerAdmin, cabeceras, type TestUser, type AdminTestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import * as impulsos from '../../services/network/impulsosService';
import { TIPO_PAGO_IMPULSO } from '../../services/billing/stripeService';
import { MAX_MULTIMEDIA } from '../../routes/network';

jest.mock('../../services/billing/stripeService', () => {
  const actual = jest.requireActual('../../services/billing/stripeService');
  return { ...actual, constructWebhookEvent: jest.fn() };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const stripeService = require('../../services/billing/stripeService');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Perfiles de la red con contenido e impulsos pagados.
 *
 *  1. Al registrarse se elige negocio o experto.
 *  2. Galería y servicios: solo el dueño los toca, con límite y sin carreras.
 *  3. El perfil público trae galería, servicios y WhatsApp, pero no el dueño.
 *  4. Los clics de contacto cuentan una vez por visitante y nunca los del dueño.
 *  5. Impulsos: precio del servidor, cupo por lugar, uno por ficha y lugar, se
 *     activan solo con el pago confirmado y no tocan el plan.
 */
describeWithDb('Red: perfiles e impulsos', () => {
  let experto: TestUser;
  let ajeno: TestUser;
  let admin: AdminTestUser;
  let fichaId: string;
  const ciudad = `Ciudad-${randomUUID().slice(0, 8)}`;
  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const api = () => request.default(app);

  async function enviarEvento(evento: Record<string, unknown>) {
    (stripeService.constructWebhookEvent as jest.Mock).mockReturnValue(evento);
    return api()
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'firma-mockeada')
      .send(Buffer.from(JSON.stringify(evento)));
  }

  beforeAll(async () => {
    await initTestDb();
    [experto, ajeno, admin] = await Promise.all([
      signupTestUser(),
      signupTestUser(),
      signupTestUser().then((u) => hacerAdmin(u)),
    ]);
    const alta = await api()
      .post('/api/network/expertos')
      .set(cabeceras(experto))
      .send({
        nombre_comercial: 'Estudio Diseño Prueba',
        nombre_display: 'Estudio',
        categoria: 'diseno',
        ciudad,
        whatsapp: '+52 1 (33) 1234-5678',
      });
    expect(alta.status).toBe(201);
    fichaId = alta.body.experto.id;
    await api()
      .patch(`/api/admin/network/expertos/${fichaId}/estado`)
      .set(cabeceras(admin))
      .send({ estado: 'aprobado' });
  });

  afterAll(async () => {
    await q(`DELETE FROM expertos WHERE id = $1`, [fichaId]).catch(() => undefined);
    await closeTestDb();
  });

  describe('Registro', () => {
    it('guarda el tipo de cuenta elegido y lo devuelve en /me', async () => {
      const email = `experto-${randomUUID()}@example.com`;
      const alta = await api()
        .post('/api/auth/signup')
        .send({ email, password: 'Testpassword123!', name: 'Experta', tipo_cuenta: 'experto', acepta_terminos: true });
      expect(alta.status).toBe(201);
      expect(alta.body.user.tipo_cuenta).toBe('experto');

      const token = { Authorization: `Bearer ${alta.body.accessToken}` };
      expect((await api().get('/api/auth/me').set(token)).body.tipo_cuenta).toBe('experto');

      const cambio = await api().patch('/api/auth/tipo-cuenta').set(token).send({ tipo_cuenta: 'negocio' });
      expect(cambio.body.tipo_cuenta).toBe('negocio');
      expect((await api().patch('/api/auth/tipo-cuenta').set(token).send({ tipo_cuenta: 'admin' })).status).toBe(400);
    });

    it('sin elegir, la cuenta es de negocio', async () => {
      const u = await signupTestUser();
      const [fila] = await q(`SELECT tipo_cuenta FROM usuarios WHERE id = $1`, [u.userId]);
      expect(fila.tipo_cuenta).toBe('negocio');
    });

    it('normaliza el WhatsApp y rechaza números imposibles', async () => {
      const [fila] = await q(`SELECT whatsapp FROM expertos WHERE id = $1`, [fichaId]);
      expect(fila.whatsapp).toBe('5213312345678');
      const mal = await api().patch(`/api/network/expertos/${fichaId}`).set(cabeceras(experto)).send({ whatsapp: '123' });
      expect(mal.status).toBe(400);
    });
  });

  describe('Galería y servicios', () => {
    it('el dueño sube imágenes; otro usuario no puede', async () => {
      const ok = await api()
        .post(`/api/network/expertos/${fichaId}/imagenes`)
        .set(cabeceras(experto))
        .field('descripcion', 'Logotipo para cafetería')
        .attach('imagen', PNG, { filename: 'trabajo.png', contentType: 'image/png' });
      expect(ok.status).toBe(201);
      expect(ok.body.imagen.descripcion).toBe('Logotipo para cafetería');

      const ajena = await api()
        .post(`/api/network/expertos/${fichaId}/imagenes`)
        .set(cabeceras(ajeno))
        .attach('imagen', PNG, { filename: 'x.png', contentType: 'image/png' });
      expect(ajena.status).toBe(404);
    });

    it('rechaza lo que no es imagen', async () => {
      const res = await api()
        .post(`/api/network/expertos/${fichaId}/imagenes`)
        .set(cabeceras(experto))
        .attach('imagen', Buffer.from('<svg onload=alert(1)>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
      expect(res.status).toBe(400);
    });

    it('no pasa del límite de la galería', async () => {
      const [{ total }] = await q(`SELECT count(*)::int AS total FROM experto_imagenes WHERE experto_id = $1`, [fichaId]);
      for (let i = total; i < MAX_MULTIMEDIA; i++) {
        await q(`INSERT INTO experto_imagenes (experto_id, url, orden) VALUES ($1, $2, $3)`, [fichaId, `/uploads/images/r${i}.png`, i]);
      }
      const res = await api()
        .post(`/api/network/expertos/${fichaId}/imagenes`)
        .set(cabeceras(experto))
        .attach('imagen', PNG, { filename: 'extra.png', contentType: 'image/png' });
      expect(res.status).toBe(409);
    });

    it('crea, edita y borra servicios solo en la ficha propia', async () => {
      const alta = await api()
        .post(`/api/network/expertos/${fichaId}/servicios`)
        .set(cabeceras(experto))
        .send({ nombre: 'Identidad de marca', descripcion: 'Logo, paleta y manual', precio_desde: 4500, unidad: 'proyecto' });
      expect(alta.status).toBe(201);
      const id = alta.body.servicio.id;

      const edicion = await api()
        .patch(`/api/network/expertos/${fichaId}/servicios/${id}`)
        .set(cabeceras(experto))
        .send({ precio_desde: 5000 });
      expect(edicion.body.servicio).toMatchObject({ nombre: 'Identidad de marca', precio_desde: 5000 });

      const ajena = await api()
        .patch(`/api/network/expertos/${fichaId}/servicios/${id}`)
        .set(cabeceras(ajeno))
        .send({ nombre: 'Robado' });
      expect(ajena.status).toBe(404);

      const extra = await api().post(`/api/network/expertos/${fichaId}/servicios`).set(cabeceras(experto)).send({ nombre: 'Temporal' });
      expect((await api().delete(`/api/network/expertos/${fichaId}/servicios/${extra.body.servicio.id}`).set(cabeceras(experto))).status).toBe(200);
    });

    it('el perfil público trae galería, servicios y WhatsApp, sin el id del dueño', async () => {
      const res = await api().get(`/api/network/expertos/${fichaId}`);
      expect(res.status).toBe(200);
      // La galería quedó llena en «no pasa del límite»: el perfil la trae entera.
      expect(res.body.experto.imagenes.length).toBe(MAX_MULTIMEDIA);
      expect(res.body.experto.servicios).toEqual([
        expect.objectContaining({ nombre: 'Identidad de marca', precio_desde: 5000 }),
      ]);
      expect(res.body.experto.whatsapp).toBe('5213312345678');
      expect(res.body.experto).not.toHaveProperty('usuario_id');
      expect(res.body.experto.es_mia).toBe(false);
    });
  });

  describe('Métricas de contacto', () => {
    it('cuenta un clic por visitante y día, e ignora al dueño', async () => {
      const clic = () =>
        api().post(`/api/network/expertos/${fichaId}/contacto`).set('User-Agent', `visitante-${fichaId}`).send({ canal: 'whatsapp' });
      expect((await clic()).status).toBe(204);
      await clic();
      await api().post(`/api/network/expertos/${fichaId}/contacto`).set(cabeceras(experto)).send({ canal: 'whatsapp' });

      const m = await api().get(`/api/network/expertos/${fichaId}/metricas`).set(cabeceras(experto));
      expect(m.status).toBe(200);
      expect(m.body.totales.clics_whatsapp).toBe(1);

      expect((await api().get(`/api/network/expertos/${fichaId}/metricas`).set(cabeceras(ajeno))).status).toBe(404);
      expect((await api().post(`/api/network/expertos/${fichaId}/contacto`).send({ canal: 'fax' })).status).toBe(400);
    });
  });

  describe('Impulsos', () => {
    it('cotiza en el servidor y exige ciudad si el alcance es de ciudad', async () => {
      const ok = await api()
        .get('/api/network/impulsos/cotizacion')
        .query({ experto_id: fichaId, alcance: 'ciudad', ciudad, dias: 7 })
        .set(cabeceras(experto));
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ monto_mxn: impulsos.TARIFA_DIA_MXN.ciudad * 7, disponible: true });

      const sinCiudad = await api()
        .get('/api/network/impulsos/cotizacion')
        .query({ experto_id: fichaId, alcance: 'ciudad', dias: 7 })
        .set(cabeceras(experto));
      expect(sinCiudad.status).toBe(400);

      const muyLargo = await api()
        .get('/api/network/impulsos/cotizacion')
        .query({ experto_id: fichaId, alcance: 'nacional', dias: 365 })
        .set(cabeceras(experto));
      expect(muyLargo.status).toBe(400);
    });

    it('no deja reservar dos veces el mismo lugar ni pasar del cupo', async () => {
      const primera = await impulsos.reservar({ expertoId: fichaId, categoria: 'diseno', alcance: 'ciudad', ciudad, dias: 5 });
      expect(primera.ok).toBe(true);
      const repetida = await impulsos.reservar({ expertoId: fichaId, categoria: 'diseno', alcance: 'ciudad', ciudad: ciudad.toUpperCase(), dias: 5 });
      expect(repetida).toMatchObject({ ok: false, motivo: 'ya_tiene' });

      // Llena el cupo con fichas falsas en la misma ciudad y categoría.
      const relleno: string[] = [];
      for (let i = 1; i < impulsos.CUPO; i++) {
        const [{ id }] = await q(
          `INSERT INTO expertos (nombre_comercial, nombre_display, categoria, estado, ciudad) VALUES ($1, $1, 'diseno', 'aprobado', $2) RETURNING id`,
          [`Relleno ${i}`, ciudad]
        );
        relleno.push(id);
        const r = await impulsos.reservar({ expertoId: id, categoria: 'diseno', alcance: 'ciudad', ciudad, dias: 3 });
        expect(r.ok).toBe(true);
      }
      const [{ id: otro }] = await q(
        `INSERT INTO expertos (nombre_comercial, nombre_display, categoria, estado, ciudad) VALUES ('Sin hueco', 'Sin hueco', 'diseno', 'aprobado', $1) RETURNING id`,
        [ciudad]
      );
      relleno.push(otro);
      expect(await impulsos.reservar({ expertoId: otro, categoria: 'diseno', alcance: 'ciudad', ciudad, dias: 3 })).toMatchObject({
        ok: false,
        motivo: 'sin_cupo',
      });
      // El alcance nacional tiene su propio cupo.
      const nacional = await impulsos.reservar({ expertoId: otro, categoria: 'diseno', alcance: 'nacional', ciudad: null, dias: 3 });
      expect(nacional.ok).toBe(true);

      await q(`DELETE FROM expertos WHERE id = ANY($1::uuid[])`, [relleno]);
      if (primera.ok) (globalThis as Record<string, unknown>).__impulsoId = primera.impulsoId;
    });

    it('antes del pago no promociona; el webhook lo activa sin tocar el plan', async () => {
      const impulsoId = (globalThis as Record<string, unknown>).__impulsoId as string;
      let dir = await api().get('/api/network/expertos').query({ categoria: 'diseno', ciudad });
      expect(dir.body.promocionados.map((e: { id: string }) => e.id)).not.toContain(fichaId);

      // Un completed sin pagar (OXXO pendiente) todavía no activa nada.
      await enviarEvento({
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'cs_test_1', payment_status: 'unpaid', metadata: { tipo: TIPO_PAGO_IMPULSO, impulso_id: impulsoId } } },
      });
      expect((await q(`SELECT estado FROM impulsos_experto WHERE id = $1`, [impulsoId]))[0].estado).toBe('pendiente_pago');

      const evento = {
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.async_payment_succeeded',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'cs_test_1', payment_intent: 'pi_test_1', metadata: { tipo: TIPO_PAGO_IMPULSO, impulso_id: impulsoId } } },
      };
      expect((await enviarEvento(evento)).status).toBe(200);
      const [activo] = await q(`SELECT estado, fecha_fin - fecha_inicio AS duracion FROM impulsos_experto WHERE id = $1`, [impulsoId]);
      expect(activo.estado).toBe('activo');
      expect(activo.duracion.days).toBe(5);

      const [usuario] = await q(`SELECT plan FROM usuarios WHERE id = $1`, [experto.userId]);
      expect(usuario.plan).toBe('freemium');

      dir = await api().get('/api/network/expertos').query({ categoria: 'diseno', ciudad });
      const promo = dir.body.promocionados.find((e: { id: string }) => e.id === fichaId);
      expect(promo?.es_patrocinado).toBe(true);
      // En otra ciudad un impulso de ciudad no aparece.
      const fuera = await api().get('/api/network/expertos').query({ categoria: 'diseno', ciudad: 'Otra-ciudad' });
      expect(fuera.body.promocionados.map((e: { id: string }) => e.id)).not.toContain(fichaId);
    });

    it('el experto ve su campaña; moderación puede cortarla con motivo', async () => {
      const impulsoId = (globalThis as Record<string, unknown>).__impulsoId as string;
      const mios = await api().get('/api/network/mis-impulsos').set(cabeceras(experto));
      expect(mios.body.impulsos.find((i: { id: string }) => i.id === impulsoId)).toMatchObject({ estado: 'activo', dias: 5 });
      expect((await api().get('/api/network/mis-impulsos').set(cabeceras(ajeno))).body.impulsos).toEqual([]);

      expect((await api().patch(`/api/admin/network/impulsos/${impulsoId}/cancelar`).set(cabeceras(admin)).send({})).status).toBe(400);
      const corte = await api()
        .patch(`/api/admin/network/impulsos/${impulsoId}/cancelar`)
        .set(cabeceras(admin))
        .send({ motivo: 'Perfil con imágenes que no son suyas' });
      expect(corte.status).toBe(200);

      const dir = await api().get('/api/network/expertos').query({ categoria: 'diseno', ciudad });
      expect(dir.body.promocionados.map((e: { id: string }) => e.id)).not.toContain(fichaId);
    });

    it('el checkout exige sesión y perfil propio', async () => {
      expect((await api().post('/api/network/impulsos/checkout').send({ experto_id: fichaId, alcance: 'nacional', dias: 3 })).status).toBe(401);
      const res = await api()
        .post('/api/network/impulsos/checkout')
        .set(cabeceras(ajeno))
        .send({ experto_id: fichaId, alcance: 'nacional', dias: 3 });
      // Sin Stripe en tests corta con 503 antes; con Stripe, 404 por no ser suya.
      expect([404, 503]).toContain(res.status);
    });

    it('al pagar o cancelar, Stripe devuelve a Mis perfiles del portal /net0', async () => {
      // Stripe se simula entero: lo que se comprueba es a dónde manda de vuelta.
      const espias = [
        jest.spyOn(stripeService, 'isStripeAvailable').mockReturnValue(true),
        jest.spyOn(stripeService, 'getOrCreateCustomer').mockResolvedValue(`cus_test_${randomUUID().slice(0, 8)}`),
        jest
          .spyOn(stripeService, 'createImpulsoCheckoutSession')
          .mockResolvedValue({ id: `cs_test_${randomUUID().slice(0, 8)}`, url: 'https://checkout.stripe.test/cs' }),
      ];
      let impulsoId: string | undefined;
      try {
        const res = await api()
          .post('/api/network/impulsos/checkout')
          .set(cabeceras(experto))
          .send({ experto_id: fichaId, alcance: 'nacional', dias: 3 });
        expect(res.status).toBe(200);
        impulsoId = res.body.impulso_id;
        expect(stripeService.createImpulsoCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            successUrl: expect.stringMatching(/^https?:\/\/[^,\s]+\/net0\/mis-fichas\?impulso=ok$/),
            cancelUrl: expect.stringMatching(/^https?:\/\/[^,\s]+\/net0\/mis-fichas\?impulso=cancelado$/),
          })
        );
      } finally {
        if (impulsoId) await q(`DELETE FROM impulsos_experto WHERE id = $1`, [impulsoId]);
        espias.forEach((espia) => espia.mockRestore());
      }
    });
  });
});
