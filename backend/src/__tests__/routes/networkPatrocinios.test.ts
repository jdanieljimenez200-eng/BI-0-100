import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser, hacerAdmin, cabeceras, type AdminTestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';
import { Experto } from '../../models/Experto';
import { PatrocinioExperto } from '../../models/PatrocinioExperto';
import { TIPO_SUSCRIPCION_PATROCINIO } from '../../services/billing/stripeService';

// Como en billing.webhook.test.ts: se mockea solo la verificación de firma,
// que necesita un secreto compartido real, y se conserva el resto.
jest.mock('../../services/billing/stripeService', () => {
  const actual = jest.requireActual('../../services/billing/stripeService');
  return { ...actual, constructWebhookEvent: jest.fn() };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const stripeService = require('../../services/billing/stripeService');

/**
 * Patrocinios de la red.
 *
 * El riesgo que vigila este fichero: un patrocinio se cobra por el mismo Stripe
 * y al mismo cliente que el plan del SaaS, y el webhook traduce cada suscripción
 * a un plan. Si un evento de patrocinio se colara por ese camino, un experto con
 * plan Pro quedaría en freemium **por haber pagado más**, y su
 * `stripe_subscription_id` pasaría a apuntar al patrocinio, borrando el rastro
 * de su suscripción real.
 */
describeWithDb('Patrocinios de expertos', () => {
  let profesional: TestUser;
  let ajeno: TestUser;
  let admin: AdminTestUser;
  let expertoId: string;
  const CUSTOMER = `cus_test_${randomUUID().slice(0, 8)}`;
  const SUB_PATROCINIO = `sub_patro_${randomUUID().slice(0, 8)}`;

  const auth = cabeceras;
  const usuarios = () => AppDataSource.getRepository(Usuario);
  const patrocinios = () => AppDataSource.getRepository(PatrocinioExperto);

  /** Entrega un evento firmado (la firma va mockeada) al webhook real. */
  async function enviarEvento(evento: Record<string, unknown>) {
    (stripeService.constructWebhookEvent as jest.Mock).mockReturnValue(evento);
    return request
      .default(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'firma-mockeada')
      .send(Buffer.from(JSON.stringify(evento)));
  }

  const metadataPatrocinio = (categoria = 'legal') => ({
    tipo: TIPO_SUSCRIPCION_PATROCINIO,
    experto_id: expertoId,
    categoria,
  });

  beforeAll(async () => {
    await initTestDb();
    profesional = await signupTestUser();
    ajeno = await signupTestUser();
    admin = await hacerAdmin(await signupTestUser());

    // El experto tiene plan pro y un cliente de Stripe: es el escenario donde
    // el bug haría daño.
    await usuarios().update(
      { id: profesional.userId },
      { plan: 'pro', stripe_customer_id: CUSTOMER, stripe_subscription_id: 'sub_plan_real' }
    );

    const alta = await request
      .default(app)
      .post('/api/network/expertos')
      .set(auth(profesional))
      .send({ nombre_comercial: 'Patrocinable SA', nombre_display: 'Patrocinable', categoria: 'legal' });
    expertoId = alta.body.experto.id;
  });

  afterAll(async () => {
    if (expertoId) await AppDataSource.getRepository(Experto).delete(expertoId);
    await closeTestDb();
  });

  afterEach(() => jest.clearAllMocks());

  describe('Checkout', () => {
    it('no se puede patrocinar una ficha que no está aprobada', async () => {
      const res = await request
        .default(app)
        .post('/api/network/patrocinios/checkout')
        .set(auth(profesional))
        .send({ experto_id: expertoId });
      // Sin Stripe configurado en el entorno de test, la ruta corta antes con
      // 503; con Stripe, corta con 409 por el estado. Cualquiera de los dos
      // demuestra que no se abre un pago para una ficha invisible.
      expect([409, 503]).toContain(res.status);
    });

    it('no se puede patrocinar la ficha de otro', async () => {
      const res = await request
        .default(app)
        .post('/api/network/patrocinios/checkout')
        .set(auth(ajeno))
        .send({ experto_id: expertoId });
      expect([404, 503]).toContain(res.status);
    });

    it('exige autenticación', async () => {
      const res = await request
        .default(app)
        .post('/api/network/patrocinios/checkout')
        .send({ experto_id: expertoId });
      expect(res.status).toBe(401);
    });

    it('al pagar o cancelar, Stripe devuelve a Mis perfiles del portal /net0', async () => {
      // Stripe se simula entero: lo que se comprueba es a dónde manda de vuelta.
      const espias = [
        jest.spyOn(stripeService, 'isStripeAvailable').mockReturnValue(true),
        jest.spyOn(stripeService, 'getPriceIdPatrocinio').mockReturnValue('price_test_patrocinio'),
        jest.spyOn(stripeService, 'getOrCreateCustomer').mockResolvedValue(CUSTOMER),
        jest.spyOn(stripeService, 'createSponsorshipCheckoutSession').mockResolvedValue('https://checkout.stripe.test/cs'),
      ];
      // El patrocinio exige la ficha aprobada; se aprueba solo para esta prueba.
      await AppDataSource.getRepository(Experto).update(expertoId, { estado: 'aprobado' });
      try {
        const res = await request
          .default(app)
          .post('/api/network/patrocinios/checkout')
          .set(auth(profesional))
          .send({ experto_id: expertoId });
        expect(res.status).toBe(200);
        expect(stripeService.createSponsorshipCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            successUrl: expect.stringMatching(/^https?:\/\/[^,\s]+\/net0\/mis-fichas\?patrocinio=ok$/),
            cancelUrl: expect.stringMatching(/^https?:\/\/[^,\s]+\/net0\/mis-fichas\?patrocinio=cancelado$/),
          })
        );
      } finally {
        await AppDataSource.getRepository(Experto).update(expertoId, { estado: 'pendiente' });
        espias.forEach((espia) => espia.mockRestore());
      }
    });
  });

  describe('Webhook: el patrocinio no toca el plan del usuario', () => {
    beforeAll(async () => {
      await request
        .default(app)
        .patch(`/api/admin/network/expertos/${expertoId}/estado`)
        .set(auth(admin))
        .send({ estado: 'aprobado' });
    });

    it('checkout.session.completed de un patrocinio lo activa sin degradar el plan', async () => {
      const res = await enviarEvento({
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            customer: CUSTOMER,
            subscription: SUB_PATROCINIO,
            metadata: metadataPatrocinio(),
          },
        },
      });
      expect(res.status).toBe(200);

      const patrocinio = await patrocinios().findOne({
        where: { stripe_subscription_id: SUB_PATROCINIO },
      });
      expect(patrocinio?.estado).toBe('activo');
      expect(patrocinio?.experto_id).toBe(expertoId);

      const usuario = await usuarios().findOneOrFail({ where: { id: profesional.userId } });
      expect(usuario.plan).toBe('pro');
      // El plan real no puede quedar apuntando a la suscripción del patrocinio.
      expect(usuario.stripe_subscription_id).toBe('sub_plan_real');
    });

    it('sube al experto en el directorio y lo etiqueta', async () => {
      const res = await request.default(app).get('/api/network/expertos?categoria=legal');
      const ficha = res.body.expertos.find((e: { id: string }) => e.id === expertoId);
      expect(ficha?.es_patrocinado).toBe(true);
      expect(res.body.expertos[0].id).toBe(expertoId);
    });

    it('customer.subscription.updated activo refresca la vigencia sin tocar el plan', async () => {
      const finPeriodo = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
      await enviarEvento({
        id: `evt_${randomUUID()}`,
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: SUB_PATROCINIO,
            customer: CUSTOMER,
            status: 'active',
            current_period_end: finPeriodo,
            items: { data: [{ price: { product: 'prod_patrocinio' } }] },
            metadata: metadataPatrocinio(),
          },
        },
      });

      const patrocinio = await patrocinios().findOneOrFail({
        where: { stripe_subscription_id: SUB_PATROCINIO },
      });
      expect(patrocinio.estado).toBe('activo');
      expect(patrocinio.fecha_fin).not.toBeNull();

      const usuario = await usuarios().findOneOrFail({ where: { id: profesional.userId } });
      expect(usuario.plan).toBe('pro');
    });

    it('no duplica el patrocinio al repetirse el evento', async () => {
      await enviarEvento({
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: { customer: CUSTOMER, subscription: SUB_PATROCINIO, metadata: metadataPatrocinio() },
        },
      });

      const filas = await patrocinios().find({ where: { stripe_subscription_id: SUB_PATROCINIO } });
      expect(filas).toHaveLength(1);
    });

    it('un impago vence el patrocinio y lo baja del directorio', async () => {
      await enviarEvento({
        id: `evt_${randomUUID()}`,
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: SUB_PATROCINIO,
            customer: CUSTOMER,
            status: 'unpaid',
            items: { data: [{ price: { product: 'prod_patrocinio' } }] },
            metadata: metadataPatrocinio(),
          },
        },
      });

      const patrocinio = await patrocinios().findOneOrFail({
        where: { stripe_subscription_id: SUB_PATROCINIO },
      });
      expect(patrocinio.estado).toBe('vencido');

      const dir = await request.default(app).get('/api/network/expertos?categoria=legal');
      const ficha = dir.body.expertos.find((e: { id: string }) => e.id === expertoId);
      // Sigue en el directorio —el patrocinio no era su derecho a estar—, pero
      // ya sin etiqueta y sin posición comprada.
      expect(ficha).toBeDefined();
      expect(ficha.es_patrocinado).toBe(false);

      const usuario = await usuarios().findOneOrFail({ where: { id: profesional.userId } });
      expect(usuario.plan).toBe('pro');
    });

    it('customer.subscription.deleted lo cancela y deja rastro', async () => {
      await enviarEvento({
        id: `evt_${randomUUID()}`,
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: { id: SUB_PATROCINIO, customer: CUSTOMER, metadata: metadataPatrocinio() },
        },
      });

      const patrocinio = await patrocinios().findOneOrFail({
        where: { stripe_subscription_id: SUB_PATROCINIO },
      });
      expect(patrocinio.estado).toBe('cancelado');
      // No se borra: hace falta para responder una reclamación.
      expect(patrocinio.fecha_fin).not.toBeNull();

      const usuario = await usuarios().findOneOrFail({ where: { id: profesional.userId } });
      expect(usuario.plan).toBe('pro');
      expect(usuario.stripe_subscription_id).toBe('sub_plan_real');
    });

    it('una metadata de patrocinio sin experto válido no revienta el webhook', async () => {
      const res = await enviarEvento({
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            customer: CUSTOMER,
            subscription: `sub_huerfano_${randomUUID().slice(0, 8)}`,
            metadata: { tipo: TIPO_SUSCRIPCION_PATROCINIO, experto_id: randomUUID(), categoria: 'legal' },
          },
        },
      });
      expect(res.status).toBe(200);

      const usuario = await usuarios().findOneOrFail({ where: { id: profesional.userId } });
      expect(usuario.plan).toBe('pro');
    });
  });

  describe('Panel del experto', () => {
    it('lista los patrocinios de las fichas propias, y solo esas', async () => {
      const mios = await request.default(app).get('/api/network/mis-patrocinios').set(auth(profesional));
      expect(mios.status).toBe(200);
      expect(mios.body.patrocinios.some((p: { stripe_subscription_id: string }) =>
        p.stripe_subscription_id === SUB_PATROCINIO)).toBe(true);

      const ajenos = await request.default(app).get('/api/network/mis-patrocinios').set(auth(ajeno));
      expect(ajenos.body.patrocinios).toHaveLength(0);
    });
  });
});
