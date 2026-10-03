import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser } from '../helpers/authHelper';
import { crearProductoDeUsuario } from '../helpers/seedHelper';
import { AppDataSource } from '../../config/database';
import { Producto } from '../../models/Producto';
import { AnalisisFinanzas } from '../../models/AnalisisFinanzas';
import { analysisQueue } from '../../workers/analysisQueue';

// Encolar de verdad abriría la conexión de BullMQ y Jest no saldría: aquí solo
// importa lo que hace la ruta antes de encolar.
jest.mock('../../workers/analysisQueue', () => ({
  ...jest.requireActual('../../workers/analysisQueue'),
  analysisQueue: { add: jest.fn().mockResolvedValue({}) },
}));

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

    it('rechaza una comisión imposible en «Afina tu análisis»', async () => {
      const res = await request
        .default(app)
        .post('/api/finanzas/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({ producto_id: await nuevoProductoId(), ...payloadValido, perfil_negocio: { comision_venta_pct: 150 } });

      expect(res.status).toBe(400);
    });

    it('guarda el perfil, usa el país del producto y manda cobro y pago al cálculo', async () => {
      const producto = await crearProductoDeUsuario(usuarioId, {
        pais: 'CO',
        perfil_negocio: { tipo_clientes: 'empresas', dias_cobro: 30 },
      });
      const res = await request
        .default(app)
        .post('/api/finanzas/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({
          producto_id: producto.id,
          ...payloadValido,
          sueldo_dueno_mensual: 2000000,
          origen_datos: 'declarado',
          perfil_negocio: { precio_incluye_impuesto: true, comision_venta_pct: 5, dias_cobro: 60 },
        });
      expect(res.status).toBe(202);

      // Lo nuevo se fusiona con lo que ya había en el producto.
      const guardado = await AppDataSource.getRepository(Producto).findOneByOrFail({ id: producto.id });
      expect(guardado.perfil_negocio).toEqual({
        tipo_clientes: 'empresas',
        dias_cobro: 60,
        precio_incluye_impuesto: true,
        comision_venta_pct: 5,
      });
      // Antes la fila quedaba siempre en 'MX'.
      const analisis = await AppDataSource.getRepository(AnalisisFinanzas).findOneByOrFail({ id: res.body.analisis_id });
      expect(analisis.pais).toBe('CO');

      const trabajo = (analysisQueue.add as jest.Mock).mock.calls.at(-1)?.[1];
      expect(trabajo.payload).toMatchObject({
        precio_incluye_impuesto: true,
        comision_venta_pct: 5,
        dias_cobro: 60,
        dias_pago: null,
        pago_deuda_mensual: null,
        sueldo_dueno_mensual: 2000000,
        origen_datos: 'declarado',
      });
      expect(trabajo.payload).not.toHaveProperty('perfil_negocio');
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
