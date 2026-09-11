import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser } from '../helpers/authHelper';
import { crearProductoDeUsuario } from '../helpers/seedHelper';

describeWithDb('POS routes', () => {
  let token: string;
  let productoId: string;
  let otroToken: string;
  let primerFolio: string;

  const lineaBase = { nombre: 'Café', precio_unitario: 50, cantidad: 2 };

  beforeAll(async () => {
    await initTestDb();

    const usuario = await signupTestUser();
    token = usuario.accessToken;
    const producto = await crearProductoDeUsuario(usuario.userId);
    productoId = producto.id;

    // Usuario aparte, sin producto propio — para el caso 404.
    const otro = await signupTestUser();
    otroToken = otro.accessToken;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST /api/pos/ventas', () => {
    // El plan freemium tope 2 movimientos por herramienta: estas 2 creaciones
    // agotan exactamente ese límite para el usuario `token`.
    it('crea una venta con folio autogenerado', async () => {
      const res = await request
        .default(app)
        .post('/api/pos/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({ producto_id: productoId, lineas: [lineaBase] });

      expect(res.status).toBe(201);
      expect(res.body.venta.numero_ticket).toBeDefined();
      primerFolio = res.body.venta.numero_ticket;
    });

    it('genera folios secuenciales en creaciones consecutivas', async () => {
      const res = await request
        .default(app)
        .post('/api/pos/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({ producto_id: productoId, lineas: [lineaBase] });

      expect(res.status).toBe(201);
      const anterior = parseInt(primerFolio.replace(/\D/g, ''), 10);
      const actual = parseInt(res.body.venta.numero_ticket.replace(/\D/g, ''), 10);
      expect(actual).toBe(anterior + 1);
    });

    it('rechaza con 404 cuando el producto no pertenece al usuario autenticado', async () => {
      const res = await request
        .default(app)
        .post('/api/pos/ventas')
        .set('Authorization', `Bearer ${otroToken}`)
        .send({ producto_id: productoId, lineas: [lineaBase] });

      expect(res.status).toBe(404);
    });

    it('rechaza sin autenticación con 401', async () => {
      const res = await request
        .default(app)
        .post('/api/pos/ventas')
        .send({ producto_id: productoId, lineas: [lineaBase] });

      expect(res.status).toBe(401);
    });
  });
});
