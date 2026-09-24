import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser } from '../helpers/authHelper';
import { crearProductoDeUsuario } from '../helpers/seedHelper';

describeWithDb('Finanzas routes', () => {
  let token: string;
  let usuarioId: string;

  const payloadValido = {
    precio_venta: 299,
    costo_variable_unitario: 120,
    costos_fijos_mensuales: 15000,
    unidades_mes_inicial: 50,
    tasa_crecimiento_mensual: 10,
  };

  // Cada caso usa su propio producto: `requireAnalisisLock('finanzas')` aplica
  // un cooldown de 30s por producto+módulo, y correría antes de la validación
  // si se reusara el mismo producto entre pruebas.
  async function nuevoProductoId(): Promise<string> {
    const producto = await crearProductoDeUsuario(usuarioId);
    return producto.id;
  }

  beforeAll(async () => {
    await initTestDb();
    const usuario = await signupTestUser();
    token = usuario.accessToken;
    usuarioId = usuario.userId;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST /api/finanzas/analizar', () => {
    it('rechaza costos_fijos_mensuales no numérico con 400 (antes se guardaba como NaN)', async () => {
      const res = await request
        .default(app)
        .post('/api/finanzas/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({ producto_id: await nuevoProductoId(), ...payloadValido, costos_fijos_mensuales: 'no-es-numero' });

      expect(res.status).toBe(400);
    });

    it('rechaza un número negativo con 400', async () => {
      const res = await request
        .default(app)
        .post('/api/finanzas/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({ producto_id: await nuevoProductoId(), ...payloadValido, unidades_mes_inicial: -5 });

      expect(res.status).toBe(400);
    });

    it('rechaza precio_venta <= costo_variable_unitario con 400', async () => {
      const res = await request
        .default(app)
        .post('/api/finanzas/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({ producto_id: await nuevoProductoId(), ...payloadValido, precio_venta: 100, costo_variable_unitario: 120 });

      expect(res.status).toBe(400);
    });

    it('rechaza un crecimiento mensual imposible (>50%) con 400', async () => {
      // Un 60% mensual proyecta ×100 en un año: no es una proyección.
      const res = await request
        .default(app)
        .post('/api/finanzas/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({ producto_id: await nuevoProductoId(), ...payloadValido, tasa_crecimiento_mensual: 60 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/finanzas/calibracion/:productoId', () => {
    it('sin historial contable devuelve ceros, no un invento', async () => {
      const res = await request
        .default(app)
        .get(`/api/finanzas/calibracion/${await nuevoProductoId()}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.meses_analizados).toBe(0);
    });

    it('rechaza un id que no es UUID y un producto ajeno', async () => {
      const malFormado = await request
        .default(app)
        .get('/api/finanzas/calibracion/no-es-uuid')
        .set('Authorization', `Bearer ${token}`);
      expect(malFormado.status).toBe(400);

      const otro = await signupTestUser();
      const ajeno = await crearProductoDeUsuario(otro.userId);
      const res = await request
        .default(app)
        .get(`/api/finanzas/calibracion/${ajeno.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('sin sesión no se llega', async () => {
      const res = await request.default(app).get(`/api/finanzas/calibracion/${await nuevoProductoId()}`);
      expect(res.status).toBe(401);
    });
  });
});
