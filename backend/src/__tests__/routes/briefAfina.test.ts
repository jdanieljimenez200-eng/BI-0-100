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

/** «Afina tu análisis» del Brief: referencias, lo que se conserva y los usos viajan al trabajo; el perfil va al producto. */
describeWithDb('POST /api/brief/analizar — Afina tu análisis', () => {
  let token: string;
  let usuarioId: string;

  const base = {
    percepcion: ['Cercano'],
    emocion: 'Nostalgia',
    anti_valores: ['Lujoso'],
    estilo_visual: 'Artesanal/Handmade',
    paleta_elegida: 'A',
    tipo_logo: 'Logotipo (solo texto)',
    tono_comunicacion: 'Cercano y cálido',
    posicionamiento: 'Confiable (el de siempre)',
    nivel_diferenciacion: 'Medio (algunas diferencias)',
  };

  beforeAll(async () => {
    await initTestDb();
    const u = await signupTestUser();
    token = u.accessToken;
    usuarioId = u.userId;
  });

  afterAll(closeTestDb);

  it('rechaza un uso de marca que no existe', async () => {
    const producto = await crearProductoDeUsuario(usuarioId);
    const res = await request
      .default(app)
      .post('/api/brief/analizar')
      .set('Authorization', `Bearer ${token}`)
      .send({ producto_id: producto.id, ...base, usos_marca: ['globo_aerostatico'] });
    expect(res.status).toBe(400);
  });

  it('manda referencias, lo que se conserva y los usos al trabajo, y guarda el perfil en el producto', async () => {
    const producto = await crearProductoDeUsuario(usuarioId, { pais: 'MX', perfil_negocio: { marca: 'no' } });
    const res = await request
      .default(app)
      .post('/api/brief/analizar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        producto_id: producto.id,
        ...base,
        marcas_admiradas: 'Puestos tradicionales con letrero pintado a mano',
        marcas_evitar: null,
        elementos_conservar: 'El nombre «Doña Lupe»',
        usos_marca: ['local_letrero', 'uniformes'],
        perfil_negocio: { local_fisico: 'via_publica' },
      });
    expect(res.status).toBe(202);

    const trabajo = (analysisQueue.add as jest.Mock).mock.calls.at(-1)?.[1];
    expect(trabajo.payload).toMatchObject({
      marcas_admiradas: 'Puestos tradicionales con letrero pintado a mano',
      elementos_conservar: 'El nombre «Doña Lupe»',
      usos_marca: ['local_letrero', 'uniformes'],
    });
    expect(trabajo.payload).not.toHaveProperty('perfil_negocio');
    const guardado = await AppDataSource.getRepository(Producto).findOneByOrFail({ id: producto.id });
    expect(guardado.perfil_negocio).toEqual({ marca: 'no', local_fisico: 'via_publica' });
  });
});
