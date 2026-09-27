import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser } from '../helpers/authHelper';

describeWithDb('Cotizaciones routes', () => {
  let token: string;
  let primerNumero: string;

  const itemBase = { descripcion: 'Servicio de diseño', cantidad: 1, precio_unitario: 500 };

  beforeAll(async () => {
    await initTestDb();
    const usuario = await signupTestUser();
    token = usuario.accessToken;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST /api/cotizaciones', () => {
    // Se valida primero el caso de error para no consumir el tope freemium
    // (2 movimientos) antes de las 2 creaciones exitosas de más abajo.
    it('rechaza sin cliente_nombre con 400', async () => {
      const res = await request
        .default(app)
        .post('/api/cotizaciones')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [itemBase] });

      expect(res.status).toBe(400);
    });

    // Valores que no caben en su columna: antes pasaban la validación y el
    // INSERT (o la conversión en venta) respondía 500.
    it.each([
      ['impuesto_tasa por encima de 100 (numeric(5,2))', { impuesto_tasa: 1000 }],
      ['moneda de más de 3 letras (ventas.moneda es varchar(3))', { moneda: 'PESOS' }],
      ['cliente_telefono de más de 30 caracteres', { cliente_telefono: '5'.repeat(31) }],
      ['precio_unitario que no cabe en venta_items', { items: [{ ...itemBase, precio_unitario: 1e12 }] }],
      ['descripción de item de más de 255 caracteres', { items: [{ ...itemBase, descripcion: 'x'.repeat(256) }] }],
    ])('rechaza con 400: %s', async (_caso, extra) => {
      const res = await request
        .default(app)
        .post('/api/cotizaciones')
        .set('Authorization', `Bearer ${token}`)
        .send({ cliente_nombre: 'Cliente', items: [itemBase], ...extra });

      expect(res.status).toBe(400);
    });

    it('crea una cotización con folio autogenerado (COT-######)', async () => {
      const res = await request
        .default(app)
        .post('/api/cotizaciones')
        .set('Authorization', `Bearer ${token}`)
        .send({ cliente_nombre: 'Cliente de prueba', items: [itemBase] });

      expect(res.status).toBe(201);
      expect(res.body.numero).toMatch(/^COT-\d{6}$/);
      // Columna `decimal` de Postgres: TypeORM la devuelve como string.
      expect(Number(res.body.total)).toBe(500);
      primerNumero = res.body.numero;
    });

    it('genera folios secuenciales en creaciones consecutivas', async () => {
      const res = await request
        .default(app)
        .post('/api/cotizaciones')
        .set('Authorization', `Bearer ${token}`)
        .send({ cliente_nombre: 'Otro cliente', items: [itemBase] });

      expect(res.status).toBe(201);
      const anterior = parseInt(primerNumero.replace(/\D/g, ''), 10);
      const actual = parseInt(res.body.numero.replace(/\D/g, ''), 10);
      expect(actual).toBe(anterior + 1);
    });

    it('rechaza sin autenticación con 401', async () => {
      const res = await request
        .default(app)
        .post('/api/cotizaciones')
        .send({ cliente_nombre: 'Sin token', items: [itemBase] });

      expect(res.status).toBe(401);
    });
  });
});
