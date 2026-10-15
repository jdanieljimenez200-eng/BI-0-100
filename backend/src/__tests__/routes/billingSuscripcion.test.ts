import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, cabeceras, TestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';

// Stripe se simula: se conserva todo salvo la firma del webhook.
jest.mock('../../services/billing/stripeService', () => {
  const actual = jest.requireActual('../../services/billing/stripeService');
  return { ...actual, constructWebhookEvent: jest.fn() };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const stripeService = require('../../services/billing/stripeService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const emailService = require('../../services/email/emailService');

/**
 * Cargos recurrentes conforme al art. 76 Bis de la LFPC: autorización expresa
 * antes de pagar (fr. VIII), aviso de renovación y cancelación inmediata (fr. IX).
 */
describeWithDb('Suscripciones: autorización, aviso de renovación y cancelación', () => {
  let usuario: TestUser;
  const CUSTOMER = `cus_test_${randomUUID().slice(0, 8)}`;
  const SUB = `sub_test_${randomUUID().slice(0, 8)}`;
  const PRECIO = { priceId: 'price_test_pro', montoMinimo: 44900, moneda: 'MXN', intervalo: 'month', intervaloCantidad: 1 };

  beforeAll(async () => {
    await initTestDb();
    usuario = await signupTestUser();
    await AppDataSource.query(`UPDATE usuarios SET stripe_customer_id = $1 WHERE id = $2`, [CUSTOMER, usuario.userId]);
  }, 60_000);

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await closeTestDb();
  });

  it('no abre el pago sin la autorización expresa y la registra con el importe de Stripe', async () => {
    jest.spyOn(stripeService, 'isStripeAvailable').mockReturnValue(true);
    jest.spyOn(stripeService, 'getPriceId').mockReturnValue('price_test_pro');
    jest.spyOn(stripeService, 'describirPrecio').mockResolvedValue(PRECIO);
    jest.spyOn(stripeService, 'getOrCreateCustomer').mockResolvedValue(CUSTOMER);
    const checkout = jest.spyOn(stripeService, 'createCheckoutSession').mockResolvedValue('https://checkout.stripe.test/cs');

    const sin = await request.default(app).post('/api/billing/checkout').set(cabeceras(usuario)).send({ plan: 'pro' });
    expect(sin.status).toBe(400);
    expect(sin.body.codigo).toBe('autorizacion_requerida');
    expect(checkout).not.toHaveBeenCalled();

    const con = await request
      .default(app)
      .post('/api/billing/checkout')
      .set(cabeceras(usuario))
      .send({ plan: 'pro', autoriza_cargo_recurrente: true });
    expect(con.status).toBe(200);
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ textoAutorizacion: expect.stringContaining('$449.00 MXN cada mes') }));

    const [fila] = await AppDataSource.query(
      `SELECT metodo, detalle FROM aceptaciones_legales
        WHERE usuario_id = $1 AND documento = 'cargo_recurrente' ORDER BY aceptado_en DESC LIMIT 1`,
      [usuario.userId]
    );
    expect(fila).toEqual({
      metodo: 'checkout',
      detalle: { concepto: 'plan:pro:monthly', price_id: 'price_test_pro', monto: 44900, moneda: 'MXN', intervalo: 'month', intervalo_cantidad: 1 },
    });
  });

  it('cancelar es inmediato desde la app y se puede deshacer; sin suscripción responde 400', async () => {
    jest.spyOn(stripeService, 'isStripeAvailable').mockReturnValue(true);
    const fin = new Date(Date.now() + 20 * 86_400_000);
    const cancelar = jest
      .spyOn(stripeService, 'programarCancelacion')
      .mockResolvedValue({ estado: 'active', cancelacionProgramada: true, finPeriodo: fin });
    const reanudar = jest
      .spyOn(stripeService, 'reanudarSuscripcion')
      .mockResolvedValue({ estado: 'active', cancelacionProgramada: false, finPeriodo: fin });

    expect((await request.default(app).post('/api/billing/cancelar').set(cabeceras(usuario))).status).toBe(400);

    await AppDataSource.query(`UPDATE usuarios SET stripe_subscription_id = $1 WHERE id = $2`, [SUB, usuario.userId]);
    const r = await request.default(app).post('/api/billing/cancelar').set(cabeceras(usuario));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cancelacion_programada: true, fin_periodo: fin.toISOString() });
    expect(cancelar).toHaveBeenCalledWith(SUB);

    const d = await request.default(app).post('/api/billing/reanudar').set(cabeceras(usuario));
    expect(d.status).toBe(200);
    expect(d.body.cancelacion_programada).toBe(false);
    expect(reanudar).toHaveBeenCalledWith(SUB);

    expect((await request.default(app).post('/api/billing/cancelar')).status).toBe(401);
  });

  it('invoice.upcoming manda el aviso de renovación una sola vez, con importe, fecha y conceptos', async () => {
    const enviar = jest.spyOn(emailService, 'enviarAvisoRenovacion').mockResolvedValue(true);
    const cuando = Math.floor(Date.now() / 1000) + 7 * 86_400;
    const evento = {
      id: `evt_upcoming_${randomUUID().slice(0, 8)}`,
      type: 'invoice.upcoming',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          customer: CUSTOMER,
          amount_due: 44900,
          currency: 'mxn',
          next_payment_attempt: cuando,
          lines: { data: [{ description: '1 × Emprendedor (at $449.00 / month)', period: { start: cuando } }] },
        },
      },
    };
    (stripeService.constructWebhookEvent as jest.Mock).mockReturnValue(evento);
    const mandar = () =>
      request
        .default(app)
        .post('/api/billing/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'firma-de-prueba')
        .send(Buffer.from(JSON.stringify(evento)));

    expect((await mandar()).status).toBe(200);
    expect((await mandar()).status).toBe(200); // reintento de Stripe: no se repite el correo
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith({
      email: usuario.email,
      nombre: expect.any(String),
      conceptos: ['1 × Emprendedor (at $449.00 / month)'],
      importe: '$449.00 MXN',
      fechaCargo: new Date(cuando * 1000),
    });

    // El plan no cambia por un aviso.
    const [u] = await AppDataSource.query(`SELECT plan FROM usuarios WHERE id = $1`, [usuario.userId]);
    expect(u.plan).toBe('freemium');
  });

  it('una renovación sin cargo (importe cero) no manda aviso', async () => {
    const enviar = jest.spyOn(emailService, 'enviarAvisoRenovacion').mockResolvedValue(true);
    const evento = {
      id: `evt_upcoming_${randomUUID().slice(0, 8)}`,
      type: 'invoice.upcoming',
      created: Math.floor(Date.now() / 1000),
      data: { object: { customer: CUSTOMER, amount_due: 0, currency: 'mxn', next_payment_attempt: Math.floor(Date.now() / 1000) + 7 * 86_400, lines: { data: [] } } },
    };
    (stripeService.constructWebhookEvent as jest.Mock).mockReturnValue(evento);
    const r = await request
      .default(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'firma-de-prueba')
      .send(Buffer.from(JSON.stringify(evento)));
    expect(r.status).toBe(200);
    expect(enviar).not.toHaveBeenCalled();
  });
});
