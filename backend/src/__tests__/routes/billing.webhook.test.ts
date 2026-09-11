import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';

// La verificación real de firma HMAC de Stripe requiere un secreto compartido
// real; para un test de integración de la ruta (no de Stripe SDK), se mockea
// solo `constructWebhookEvent` y se conservan el resto de exports reales.
jest.mock('../../services/billing/stripeService', () => {
  const actual = jest.requireActual('../../services/billing/stripeService');
  return {
    ...actual,
    constructWebhookEvent: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const stripeService = require('../../services/billing/stripeService');

describeWithDb('POST /api/billing/webhook', () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rechaza sin header stripe-signature con 400', async () => {
    const res = await request
      .default(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({ foo: 'bar' })));

    expect(res.status).toBe(400);
  });

  it('rechaza cuando la verificación de firma falla', async () => {
    (stripeService.constructWebhookEvent as jest.Mock).mockImplementation(() => {
      throw new Error('Firma inválida de prueba');
    });

    const res = await request
      .default(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'firma-de-prueba')
      .send(Buffer.from(JSON.stringify({ foo: 'bar' })));

    expect(res.status).toBe(400);
  });

  it('acepta un evento válido y responde received:true', async () => {
    const evento = {
      id: `evt_test_${Date.now()}`,
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          customer: 'cus_inexistente_test',
          status: 'active',
          items: { data: [] },
          current_period_end: Math.floor(Date.now() / 1000) + 3600,
          id: 'sub_test',
        },
      },
    };
    (stripeService.constructWebhookEvent as jest.Mock).mockReturnValue(evento);

    const res = await request
      .default(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'firma-de-prueba')
      .send(Buffer.from(JSON.stringify(evento)));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});
