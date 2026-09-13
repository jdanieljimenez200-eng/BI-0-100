import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser, hacerAdmin, cabeceras, type AdminTestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';
import { Experto } from '../../models/Experto';

/**
 * Reseñas de expertos.
 *
 * Lo que se prueba aquí es que el rating signifique algo: que no se pueda
 * inflar repitiendo el POST, que un experto no se pueda votar a sí mismo, y que
 * ocultar una reseña la quite también del promedio en vez de solo esconderla de
 * la vista.
 */
describeWithDb('Reseñas de expertos (/api/network)', () => {
  let autor: TestUser;
  let otroAutor: TestUser;
  let profesional: TestUser;
  let admin: AdminTestUser;
  let expertoId: string;

  const auth = cabeceras;

  const resenar = (t: TestUser, id: string, body: Record<string, unknown>) =>
    request.default(app).post(`/api/network/expertos/${id}/resenas`).set(auth(t)).send(body);

  const leerRating = async (id: string) => {
    const f = await AppDataSource.getRepository(Experto).findOneOrFail({ where: { id } });
    return { rating: Number(f.rating_promedio), total: f.total_resenas };
  };

  beforeAll(async () => {
    await initTestDb();
    autor = await signupTestUser();
    otroAutor = await signupTestUser();
    profesional = await signupTestUser();
    admin = await hacerAdmin(await signupTestUser());

    const alta = await request
      .default(app)
      .post('/api/network/expertos')
      .set(auth(profesional))
      .send({
        nombre_comercial: 'Reseñable SA',
        nombre_display: 'Reseñable',
        categoria: 'legal',
        ciudad: 'Bogotá',
      });
    expertoId = alta.body.experto.id;
    await request
      .default(app)
      .patch(`/api/admin/network/expertos/${expertoId}/estado`)
      .set(auth(admin))
      .send({ estado: 'aprobado' });
  });

  afterAll(async () => {
    if (expertoId) await AppDataSource.getRepository(Experto).delete(expertoId);
    await closeTestDb();
  });

  describe('Las tres salvaguardas', () => {
    it('una reseña válida entra y actualiza el rating', async () => {
      const res = await resenar(autor, expertoId, { puntuacion: 4, comentario: 'Muy correcto' });
      expect(res.status).toBe(201);
      expect(res.body.resena.estado).toBe('publicada');
      await expect(leerRating(expertoId)).resolves.toEqual({ rating: 4, total: 1 });
    });

    it('el mismo usuario no puede reseñar dos veces', async () => {
      const res = await resenar(autor, expertoId, { puntuacion: 5 });
      expect(res.status).toBe(409);
      // Y el rating no se mueve: es justo lo que se intentaba inflar.
      await expect(leerRating(expertoId)).resolves.toEqual({ rating: 4, total: 1 });
    });

    it('el experto no puede reseñarse a sí mismo', async () => {
      const res = await resenar(profesional, expertoId, { puntuacion: 5, comentario: 'Soy excelente' });
      expect(res.status).toBe(403);
      await expect(leerRating(expertoId)).resolves.toEqual({ rating: 4, total: 1 });
    });

    it('el admin puede ocultar una reseña, y deja de contar para el rating', async () => {
      const segunda = await resenar(otroAutor, expertoId, { puntuacion: 2, comentario: 'Regular' });
      expect(segunda.status).toBe(201);
      await expect(leerRating(expertoId)).resolves.toEqual({ rating: 3, total: 2 });

      const oculta = await request
        .default(app)
        .patch(`/api/admin/network/resenas/${segunda.body.resena.id}/estado`)
        .set(auth(admin))
        .send({ estado: 'oculta', motivo: 'Ocultada en prueba automatizada' });
      expect(oculta.status).toBe(200);
      // Esconder la reseña y dejarle la estrella puesta no arreglaría nada.
      await expect(leerRating(expertoId)).resolves.toEqual({ rating: 4, total: 1 });

      const publica = await request.default(app).get(`/api/network/expertos/${expertoId}/resenas`);
      expect(publica.body.resenas.some((r: { id: string }) => r.id === segunda.body.resena.id)).toBe(false);

      // Volver a publicarla la devuelve al promedio.
      await request
        .default(app)
        .patch(`/api/admin/network/resenas/${segunda.body.resena.id}/estado`)
        .set(auth(admin))
        .send({ estado: 'publicada' });
      await expect(leerRating(expertoId)).resolves.toEqual({ rating: 3, total: 2 });
    });

    it('moderar reseñas exige ser admin', async () => {
      const res = await request
        .default(app)
        .get('/api/admin/network/resenas')
        .set(auth(autor));
      expect(res.status).toBe(403);
    });
  });

  describe('Validación', () => {
    it('rechaza una puntuación fuera de 1..5', async () => {
      for (const puntuacion of [0, 6, -1, 2.5]) {
        const res = await resenar(admin, expertoId, { puntuacion });
        expect(res.status).toBe(400);
      }
    });

    it('exige autenticación', async () => {
      const res = await request
        .default(app)
        .post(`/api/network/expertos/${expertoId}/resenas`)
        .send({ puntuacion: 5 });
      expect(res.status).toBe(401);
    });

    it('no se puede reseñar a un experto que no está aprobado', async () => {
      const alta = await request
        .default(app)
        .post('/api/network/expertos')
        .set(auth(profesional))
        .send({ nombre_comercial: 'Pendiente SA', nombre_display: 'Pendiente', categoria: 'ventas' });
      const idPendiente = alta.body.experto.id;

      const res = await resenar(autor, idPendiente, { puntuacion: 5 });
      expect(res.status).toBe(404);

      // Ni listar sus reseñas: sería una puerta lateral a una ficha no pública.
      const listado = await request.default(app).get(`/api/network/expertos/${idPendiente}/resenas`);
      expect(listado.status).toBe(404);

      await AppDataSource.getRepository(Experto).delete(idPendiente);
    });
  });

  describe('Edición y retirada', () => {
    it('el autor puede cambiar su puntuación y el rating se recalcula', async () => {
      const mias = await request.default(app).get('/api/network/mis-resenas').set(auth(autor));
      const mia = mias.body.resenas.find((r: { experto_id: string }) => r.experto_id === expertoId);
      expect(mia).toBeDefined();

      const res = await request
        .default(app)
        .patch(`/api/network/resenas/${mia.id}`)
        .set(auth(autor))
        .send({ puntuacion: 2 });
      expect(res.status).toBe(200);
      await expect(leerRating(expertoId)).resolves.toEqual({ rating: 2, total: 2 });
    });

    it('nadie puede editar la reseña de otro', async () => {
      const mias = await request.default(app).get('/api/network/mis-resenas').set(auth(autor));
      const mia = mias.body.resenas.find((r: { experto_id: string }) => r.experto_id === expertoId);

      const res = await request
        .default(app)
        .patch(`/api/network/resenas/${mia.id}`)
        .set(auth(otroAutor))
        .send({ puntuacion: 5 });
      expect(res.status).toBe(404);
    });

    it('retirar la reseña propia la quita del promedio', async () => {
      const mias = await request.default(app).get('/api/network/mis-resenas').set(auth(autor));
      const mia = mias.body.resenas.find((r: { experto_id: string }) => r.experto_id === expertoId);

      const res = await request
        .default(app)
        .delete(`/api/network/resenas/${mia.id}`)
        .set(auth(autor));
      expect(res.status).toBe(200);
      await expect(leerRating(expertoId)).resolves.toEqual({ rating: 2, total: 1 });
    });
  });

  describe('Ficha pública', () => {
    it('trae las reseñas, el reparto de estrellas y el nombre del autor, nunca su email', async () => {
      const res = await request.default(app).get(`/api/network/expertos/${expertoId}`);
      expect(res.status).toBe(200);
      expect(res.body.resenas).toHaveLength(1);
      expect(res.body.distribucion[2]).toBe(1);

      const [resena] = res.body.resenas;
      expect(typeof resena.autor).toBe('string');
      expect(JSON.stringify(res.body)).not.toContain(otroAutor.email);
      expect(resena.usuario_id).toBeUndefined();
      // Sin token, ninguna reseña es "mía".
      expect(resena.es_mia).toBe(false);
    });

    it('con token, el autor reconoce su propia reseña', async () => {
      const res = await request
        .default(app)
        .get(`/api/network/expertos/${expertoId}`)
        .set(auth(otroAutor));
      expect(res.body.resenas[0].es_mia).toBe(true);
    });
  });
});
