import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser } from '../helpers/authHelper';
import { crearProductoDeUsuario } from '../helpers/seedHelper';
import { AppDataSource } from '../../config/database';
import { Producto } from '../../models/Producto';
import { analysisQueue } from '../../workers/analysisQueue';

// Encolar de verdad abriría la conexión de BullMQ y Jest no saldría: aquí solo
// importa lo que hace la ruta antes de encolar.
jest.mock('../../workers/analysisQueue', () => ({
  ...jest.requireActual('../../workers/analysisQueue'),
  analysisQueue: { add: jest.fn().mockResolvedValue({}) },
}));

/** «Afina tu análisis» de Marketing: lo ya probado, activos y zona viajan al trabajo; el perfil va al producto. */
describeWithDb('POST /api/marketing/analizar — Afina tu análisis', () => {
  let token: string;
  let usuarioId: string;

  const base = {
    voz_marca: 'Profesional',
    presupuesto_mensual: 3000,
    capacidad_contenido: '3-4/semana',
    plataformas: ['Instagram', 'WhatsApp'],
  };

  beforeAll(async () => {
    await initTestDb();
    const u = await signupTestUser();
    token = u.accessToken;
    usuarioId = u.userId;
  });

  afterAll(closeTestDb);

  it('rechaza un activo que no existe', async () => {
    const producto = await crearProductoDeUsuario(usuarioId);
    const res = await request
      .default(app)
      .post('/api/marketing/analizar')
      .set('Authorization', `Bearer ${token}`)
      .send({ producto_id: producto.id, ...base, activos: ['dron_propio'] });
    expect(res.status).toBe(400);
  });

  it('manda lo ya probado, los activos y la zona al trabajo, y guarda el perfil en el producto', async () => {
    const producto = await crearProductoDeUsuario(usuarioId, { pais: 'PE', perfil_negocio: { marca: 'registrada' } });
    const res = await request
      .default(app)
      .post('/api/marketing/analizar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        producto_id: producto.id,
        ...base,
        ya_probado: 'Sorteos en Instagram: muchos seguidores, cero ventas',
        activos: ['fotos_propias', 'testimonios'],
        zona_clientes: 'Miraflores',
        perfil_negocio: { tipo_clientes: 'consumidor_final' },
      });
    expect(res.status).toBe(202);

    const trabajo = (analysisQueue.add as jest.Mock).mock.calls.at(-1)?.[1];
    expect(trabajo.payload).toMatchObject({
      yaProbado: 'Sorteos en Instagram: muchos seguidores, cero ventas',
      activos: ['fotos_propias', 'testimonios'],
      zonaClientes: 'Miraflores',
    });
    const guardado = await AppDataSource.getRepository(Producto).findOneByOrFail({ id: producto.id });
    expect(guardado.perfil_negocio).toEqual({ marca: 'registrada', tipo_clientes: 'consumidor_final' });
  });
});
