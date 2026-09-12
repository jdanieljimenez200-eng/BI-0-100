import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';
import { Experto } from '../../models/Experto';

/**
 * Lo que se prueba aquí no es "que la ruta responda 200": es que las tres
 * fronteras de la red aguanten.
 *
 *  - Un visitante solo ve fichas aprobadas, y nunca la cédula ni el teléfono.
 *  - Un usuario no puede tocar la ficha de otro, ni aprobarse a sí mismo, ni
 *    colar `verificado: true` en el cuerpo de la petición.
 *  - La insignia de verificado solo la concede un admin, y se cae sola si el
 *    experto cambia quién dice ser.
 */
describeWithDb('Red de expertos (/api/network)', () => {
  let dueno: TestUser;
  let ajeno: TestUser;
  let admin: TestUser;
  const creados: string[] = [];

  const alta = (token: string, body: Record<string, unknown>) =>
    request.default(app).post('/api/network/expertos').set('Authorization', `Bearer ${token}`).send(body);

  const baseLegal = {
    nombre_comercial: 'Prueba & Asociados',
    nombre_display: 'Prueba Legal',
    categoria: 'legal',
    bio_corta: 'Ficha de prueba.',
    especialidad: 'Mercantil',
    ciudad: 'CDMX',
    email_contacto: 'contacto@prueba.local',
    telefono: '+52 55 1111 2222',
    documento_url: 'https://ejemplo.local/cedula.pdf',
  };

  const aprobar = (id: string, verificado = false) =>
    request
      .default(app)
      .patch(`/api/admin/network/expertos/${id}/estado`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ estado: 'aprobado', verificado });

  beforeAll(async () => {
    await initTestDb();
    dueno = await signupTestUser();
    ajeno = await signupTestUser();
    admin = await signupTestUser();
    await AppDataSource.getRepository(Usuario).update({ id: admin.userId }, { es_admin: true });
  });

  afterAll(async () => {
    if (creados.length) {
      await AppDataSource.getRepository(Experto).delete(creados);
    }
    await closeTestDb();
  });

  /** Da de alta una ficha y la registra para la limpieza final. */
  async function crearFicha(token: string, body: Record<string, unknown> = baseLegal) {
    const res = await alta(token, body);
    if (res.body?.experto?.id) creados.push(res.body.experto.id);
    return res;
  }

  describe('Alta', () => {
    it('nace pendiente y sin verificar, ignorando lo que venga en el body', async () => {
      const res = await crearFicha(dueno.accessToken, {
        ...baseLegal,
        estado: 'aprobado',
        verificado: true,
        rating_promedio: 5,
        total_resenas: 999,
      });

      expect(res.status).toBe(201);
      expect(res.body.experto.estado).toBe('pendiente');
      expect(res.body.experto.verificado).toBe(false);
      expect(Number(res.body.experto.rating_promedio)).toBe(0);
      expect(res.body.experto.total_resenas).toBe(0);
    });

    it('rechaza una segunda ficha del mismo usuario en la misma categoría', async () => {
      const res = await alta(dueno.accessToken, baseLegal);
      expect(res.status).toBe(409);
    });

    it('rechaza una categoría que no existe', async () => {
      const res = await alta(ajeno.accessToken, { ...baseLegal, categoria: 'contabilidad' });
      expect(res.status).toBe(400);
    });

    it('rechaza una URL con esquema javascript:', async () => {
      const res = await alta(ajeno.accessToken, {
        ...baseLegal,
        categoria: 'ventas',
        sitio_web: 'javascript:alert(1)',
      });
      expect(res.status).toBe(400);
    });

    it('exige autenticación', async () => {
      const res = await request.default(app).post('/api/network/expertos').send(baseLegal);
      expect(res.status).toBe(401);
    });
  });

  describe('Directorio público', () => {
    let idPendiente: string;

    beforeAll(async () => {
      const res = await crearFicha(ajeno.accessToken, { ...baseLegal, categoria: 'marketing' });
      idPendiente = res.body.experto.id;
    });

    it('no necesita token', async () => {
      const res = await request.default(app).get('/api/network/expertos');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.expertos)).toBe(true);
    });

    it('no muestra fichas pendientes', async () => {
      const res = await request.default(app).get('/api/network/expertos?categoria=marketing');
      expect(res.body.expertos.some((e: { id: string }) => e.id === idPendiente)).toBe(false);
    });

    it('devuelve 404 en la ficha de un experto no aprobado', async () => {
      const res = await request.default(app).get(`/api/network/expertos/${idPendiente}`);
      expect(res.status).toBe(404);
    });

    it('no filtra la cédula ni el contacto de un experto aprobado', async () => {
      await aprobar(idPendiente, true);

      const dir = await request.default(app).get('/api/network/expertos?categoria=marketing');
      const enDirectorio = dir.body.expertos.find((e: { id: string }) => e.id === idPendiente);
      expect(enDirectorio).toBeDefined();
      expect(enDirectorio.documento_url).toBeUndefined();
      expect(enDirectorio.email_contacto).toBeUndefined();
      expect(enDirectorio.telefono).toBeUndefined();
      expect(enDirectorio.es_patrocinado).toBe(false);

      const ficha = await request.default(app).get(`/api/network/expertos/${idPendiente}`);
      expect(ficha.status).toBe(200);
      expect(ficha.body.experto.documento_url).toBeUndefined();
      // Sin `mostrar_contacto`, publicar su teléfono lo expondría a spam sin
      // que él lo haya pedido.
      expect(ficha.body.experto.email_contacto).toBeNull();
      expect(ficha.body.experto.telefono).toBeNull();
    });

    it('no es inyectable por el buscador', async () => {
      const res = await request
        .default(app)
        .get(`/api/network/expertos?q=${encodeURIComponent("' OR 1=1 --")}`);
      expect(res.status).toBe(200);
      expect(res.body.expertos).toHaveLength(0);
    });
  });

  describe('Aislamiento entre cuentas', () => {
    let idPropia: string;

    beforeAll(async () => {
      const res = await crearFicha(dueno.accessToken, { ...baseLegal, categoria: 'ventas' });
      idPropia = res.body.experto.id;
    });

    it('otro usuario no puede editar la ficha ajena', async () => {
      const res = await request
        .default(app)
        .patch(`/api/network/expertos/${idPropia}`)
        .set('Authorization', `Bearer ${ajeno.accessToken}`)
        .send({ bio_corta: 'Secuestrada' });
      expect(res.status).toBe(404);
    });

    it('otro usuario no puede borrar la ficha ajena', async () => {
      const res = await request
        .default(app)
        .delete(`/api/network/expertos/${idPropia}`)
        .set('Authorization', `Bearer ${ajeno.accessToken}`);
      expect(res.status).toBe(404);
    });

    it('la cola de revisión exige ser admin', async () => {
      const res = await request
        .default(app)
        .get('/api/admin/network/pendientes')
        .set('Authorization', `Bearer ${dueno.accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Revisión del admin', () => {
    let id: string;

    beforeAll(async () => {
      const res = await crearFicha(admin.accessToken, { ...baseLegal, nombre_comercial: 'Revisable SA' });
      id = res.body.experto.id;
    });

    it('la cola muestra el documento, que es justo lo que hay que revisar', async () => {
      const res = await request
        .default(app)
        .get('/api/admin/network/pendientes')
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(res.status).toBe(200);
      const ficha = res.body.fichas.find((f: { id: string }) => f.id === id);
      expect(ficha?.documento_url).toBe('https://ejemplo.local/cedula.pdf');
    });

    it('no permite rechazar sin motivo', async () => {
      const res = await request
        .default(app)
        .patch(`/api/admin/network/expertos/${id}/estado`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ estado: 'rechazado' });
      expect(res.status).toBe(400);
    });

    it('aprueba, concede la insignia y sella la fecha', async () => {
      const res = await aprobar(id, true);
      expect(res.status).toBe(200);
      expect(res.body.experto.estado).toBe('aprobado');
      expect(res.body.experto.verificado).toBe(true);
      expect(res.body.experto.fecha_aprobacion).not.toBeNull();
    });

    it('suspender retira la insignia', async () => {
      const res = await request
        .default(app)
        .patch(`/api/admin/network/expertos/${id}/estado`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ estado: 'suspendido' });
      expect(res.body.experto.verificado).toBe(false);
    });
  });

  describe('Edición del dueño', () => {
    let id: string;

    beforeAll(async () => {
      const res = await crearFicha(ajeno.accessToken, {
        ...baseLegal,
        nombre_comercial: 'Editable SA',
        nombre_display: 'Editable',
      });
      id = res.body.experto.id;
      await aprobar(id, true);
    });

    it('un cambio cosmético no saca del directorio ni retira la insignia', async () => {
      const res = await request
        .default(app)
        .patch(`/api/network/expertos/${id}`)
        .set('Authorization', `Bearer ${ajeno.accessToken}`)
        .send({ bio_corta: 'Bio nueva', tarifa_desde: 2000 });

      expect(res.status).toBe(200);
      expect(res.body.experto.estado).toBe('aprobado');
      expect(res.body.experto.verificado).toBe(true);
    });

    it('cambiar el nombre devuelve a revisión y retira la insignia', async () => {
      // El agujero que esto cierra: aprobarse como "Juan, consultor" y luego
      // renombrarse a "Despacho Verificado S.A." conservando la insignia.
      const res = await request
        .default(app)
        .patch(`/api/network/expertos/${id}`)
        .set('Authorization', `Bearer ${ajeno.accessToken}`)
        .send({ nombre_comercial: 'Despacho Verificado S.A.' });

      expect(res.body.experto.estado).toBe('pendiente');
      expect(res.body.experto.verificado).toBe(false);

      const dir = await request.default(app).get('/api/network/expertos?categoria=legal');
      expect(dir.body.expertos.some((e: { id: string }) => e.id === id)).toBe(false);
    });

    it('no acepta una petición vacía', async () => {
      const res = await request
        .default(app)
        .patch(`/api/network/expertos/${id}`)
        .set('Authorization', `Bearer ${ajeno.accessToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
