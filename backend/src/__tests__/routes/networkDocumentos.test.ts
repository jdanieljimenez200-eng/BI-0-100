import * as request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser, hacerAdmin, cabeceras, type AdminTestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';
import { Experto } from '../../models/Experto';
import { esClaveDocumento } from '../../services/network/documentosService';

// El correo se mockea: lo que importa aquí es QUE se pida el aviso, y con qué
// datos, no que un proveedor real lo entregue.
jest.mock('../../services/email/emailService', () => {
  const actual = jest.requireActual('../../services/email/emailService');
  return { ...actual, notificarRevisionFicha: jest.fn().mockResolvedValue(true) };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const emailService = require('../../services/email/emailService');

/** Un PDF mínimo válido: basta con la cabecera para que el tipo cuadre. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
/** PNG de 1x1. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Documento de acreditación y avisos de revisión.
 *
 * La propiedad que vigila este fichero: la cédula de un profesional se puede
 * subir y la puede abrir un admin, y NADIE MÁS. Ni el público, ni otro usuario,
 * ni el propio dueño a través de una URL que se pueda compartir.
 */
describeWithDb('Documentos y avisos de la red', () => {
  let dueno: TestUser;
  let ajeno: TestUser;
  let admin: AdminTestUser;
  let expertoId: string;

  const auth = cabeceras;
  const expertos = () => AppDataSource.getRepository(Experto);

  beforeAll(async () => {
    await initTestDb();
    dueno = await signupTestUser();
    ajeno = await signupTestUser();
    admin = await hacerAdmin(await signupTestUser());

    const alta = await request
      .default(app)
      .post('/api/network/expertos')
      .set(auth(dueno))
      .send({ nombre_comercial: 'Documentada SA', nombre_display: 'Documentada', categoria: 'legal' });
    expertoId = alta.body.experto.id;
  });

  afterAll(async () => {
    if (expertoId) await expertos().delete(expertoId);
    await closeTestDb();
  });

  afterEach(() => jest.clearAllMocks());

  describe('Subida del documento', () => {
    it('no se puede fijar documento_url desde el cuerpo de la ficha', async () => {
      // Si se pudiera, cualquiera apuntaría su ficha al documento de otro.
      await request
        .default(app)
        .patch(`/api/network/expertos/${expertoId}`)
        .set(auth(dueno))
        .send({ documento_url: 'documentos/de-otra-persona.pdf', bio_corta: 'x' });

      const ficha = await expertos().findOneByOrFail({ id: expertoId });
      expect(ficha.documento_url).toBeNull();
    });

    it('rechaza un fichero que no es PDF ni imagen', async () => {
      const res = await request
        .default(app)
        .post(`/api/network/expertos/${expertoId}/documento`)
        .set(auth(dueno))
        .attach('documento', Buffer.from('<script>alert(1)</script>'), {
          filename: 'cedula.html',
          contentType: 'text/html',
        });
      expect(res.status).toBe(400);
    });

    it('rechaza un ejecutable disfrazado de PDF por la extensión', async () => {
      const res = await request
        .default(app)
        .post(`/api/network/expertos/${expertoId}/documento`)
        .set(auth(dueno))
        .attach('documento', Buffer.from('MZ...'), {
          filename: 'cedula.pdf',
          contentType: 'application/x-msdownload',
        });
      expect(res.status).toBe(400);
    });

    it('otro usuario no puede subir un documento a la ficha ajena', async () => {
      const res = await request
        .default(app)
        .post(`/api/network/expertos/${expertoId}/documento`)
        .set(auth(ajeno))
        .attach('documento', PDF, { filename: 'cedula.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(404);
    });

    it('el dueño sube el PDF y en la ficha queda una clave interna, no una URL', async () => {
      const res = await request
        .default(app)
        .post(`/api/network/expertos/${expertoId}/documento`)
        .set(auth(dueno))
        .attach('documento', PDF, { filename: 'mi cedula.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(200);
      expect(res.body.tiene_documento).toBe(true);

      const ficha = await expertos().findOneByOrFail({ id: expertoId });
      expect(esClaveDocumento(ficha.documento_url)).toBe(true);
      expect(ficha.documento_url).not.toMatch(/^https?:/);
    });

    it('el fichero NO queda bajo la carpeta que se sirve como estática', async () => {
      const ficha = await expertos().findOneByOrFail({ id: expertoId });
      const nombre = path.basename(ficha.documento_url!);
      const uploads = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

      // Buscarlo en /uploads por cualquier prefijo: no puede estar en ninguno.
      for (const prefijo of ['', 'images', 'videos', 'audio', 'documentos']) {
        expect(fs.existsSync(path.join(uploads, prefijo, nombre))).toBe(false);
      }

      const estatico = await request.default(app).get(`/uploads/documentos/${nombre}`);
      expect(estatico.status).toBe(404);
    });

    it('ni el dueño recibe la clave: solo si tiene documento', async () => {
      const res = await request.default(app).get('/api/network/mis-fichas').set(auth(dueno));
      const ficha = res.body.fichas.find((f: { id: string }) => f.id === expertoId);
      expect(ficha.documento_url).toBeUndefined();
      expect(ficha.tiene_documento).toBe(true);
    });
  });

  describe('Lectura del documento', () => {
    const ruta = () => `/api/admin/network/expertos/${expertoId}/documento`;

    it('sin sesión: 401', async () => {
      const res = await request.default(app).get(ruta());
      expect(res.status).toBe(401);
    });

    it('el propio dueño tampoco lo abre por aquí: 403', async () => {
      const res = await request.default(app).get(ruta()).set(auth(dueno));
      expect(res.status).toBe(403);
    });

    it('otro usuario: 403', async () => {
      const res = await request.default(app).get(ruta()).set(auth(ajeno));
      expect(res.status).toBe(403);
    });

    it('el admin lo abre, en línea y sin caché', async () => {
      const res = await request.default(app).get(ruta()).set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^inline/);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(Buffer.from(res.body).subarray(0, 8).toString()).toContain('%PDF');
    });

    it('la cola del admin marca que hay documento sin exponer la clave', async () => {
      const res = await request.default(app).get('/api/admin/network/pendientes').set(auth(admin));
      const ficha = res.body.fichas.find((f: { id: string }) => f.id === expertoId);
      expect(ficha.tiene_documento).toBe(true);
      expect(ficha.documento_url).toBeUndefined();
    });

    it('el directorio público nunca expone nada del documento', async () => {
      await request
        .default(app)
        .patch(`/api/admin/network/expertos/${expertoId}/estado`)
        .set(auth(admin))
        .send({ estado: 'aprobado' });

      const ficha = await request.default(app).get(`/api/network/expertos/${expertoId}`);
      const cuerpo = JSON.stringify(ficha.body);
      expect(cuerpo).not.toContain('documentos/');
      expect(ficha.body.experto.documento_url).toBeUndefined();
      expect(ficha.body.experto.tiene_documento).toBeUndefined();
    });
  });

  describe('Verificación y documento', () => {
    it('no se puede verificar una ficha que no tiene documento', async () => {
      const sinDoc = await request
        .default(app)
        .post('/api/network/expertos')
        .set(auth(ajeno))
        .send({ nombre_comercial: 'Sin Documento SA', nombre_display: 'Sin Doc', categoria: 'ventas' });
      const id = sinDoc.body.experto.id;

      const res = await request
        .default(app)
        .patch(`/api/admin/network/expertos/${id}/estado`)
        .set(auth(admin))
        .send({ estado: 'aprobado', verificado: true });
      // La insignia dice "acreditación comprobada": sin documento, sería falso.
      expect(res.status).toBe(409);

      await expertos().delete(id);
    });

    it('cambiar el documento devuelve la ficha a revisión y retira la insignia', async () => {
      await request
        .default(app)
        .patch(`/api/admin/network/expertos/${expertoId}/estado`)
        .set(auth(admin))
        .send({ estado: 'aprobado', verificado: true });
      expect((await expertos().findOneByOrFail({ id: expertoId })).verificado).toBe(true);

      const claveAnterior = (await expertos().findOneByOrFail({ id: expertoId })).documento_url;

      await request
        .default(app)
        .post(`/api/network/expertos/${expertoId}/documento`)
        .set(auth(dueno))
        .attach('documento', PNG, { filename: 'cedula.png', contentType: 'image/png' });

      const ficha = await expertos().findOneByOrFail({ id: expertoId });
      expect(ficha.estado).toBe('pendiente');
      expect(ficha.verificado).toBe(false);
      expect(ficha.documento_url).not.toBe(claveAnterior);
    });
  });

  describe('Avisos por correo', () => {
    it('aprobar avisa al dueño, con la insignia si se concedió', async () => {
      await request
        .default(app)
        .patch(`/api/admin/network/expertos/${expertoId}/estado`)
        .set(auth(admin))
        .send({ estado: 'aprobado', verificado: true });

      expect(emailService.notificarRevisionFicha).toHaveBeenCalledTimes(1);
      expect(emailService.notificarRevisionFicha).toHaveBeenCalledWith(
        expect.objectContaining({ email: dueno.email, estado: 'aprobado', verificado: true })
      );
    });

    it('volver a guardar el mismo estado no reenvía el correo', async () => {
      await request
        .default(app)
        .patch(`/api/admin/network/expertos/${expertoId}/estado`)
        .set(auth(admin))
        .send({ estado: 'aprobado', verificado: true });
      expect(emailService.notificarRevisionFicha).not.toHaveBeenCalled();
    });

    it('rechazar avisa con el motivo, que es lo que el experto necesita para corregir', async () => {
      await request
        .default(app)
        .patch(`/api/admin/network/expertos/${expertoId}/estado`)
        .set(auth(admin))
        .send({ estado: 'rechazado', motivo_rechazo: 'La cédula no se lee' });

      expect(emailService.notificarRevisionFicha).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'rechazado', motivo: 'La cédula no se lee' })
      );
    });

    it('si el correo falla, el cambio de estado se aplica igual', async () => {
      (emailService.notificarRevisionFicha as jest.Mock).mockResolvedValueOnce(false);

      const res = await request
        .default(app)
        .patch(`/api/admin/network/expertos/${expertoId}/estado`)
        .set(auth(admin))
        .send({ estado: 'suspendido', motivo_rechazo: 'Suspensión de prueba automatizada' });

      expect(res.status).toBe(200);
      expect(res.body.avisado).toBe(false);
      expect((await expertos().findOneByOrFail({ id: expertoId })).estado).toBe('suspendido');
    });
  });

  describe('Baja', () => {
    it('darse de baja borra también el documento del almacén', async () => {
      const alta = await request
        .default(app)
        .post('/api/network/expertos')
        .set(auth(ajeno))
        .send({ nombre_comercial: 'Se Va SA', nombre_display: 'Se Va', categoria: 'marketing' });
      const id = alta.body.experto.id;

      await request
        .default(app)
        .post(`/api/network/expertos/${id}/documento`)
        .set(auth(ajeno))
        .attach('documento', PDF, { filename: 'cedula.pdf', contentType: 'application/pdf' });

      const clave = (await expertos().findOneByOrFail({ id })).documento_url!;
      const privado = process.env.DOCUMENTOS_DIR || path.join(process.cwd(), 'almacen-privado');
      const ruta = path.join(privado, clave);
      expect(fs.existsSync(ruta)).toBe(true);

      const baja = await request.default(app).delete(`/api/network/expertos/${id}`).set(auth(ajeno));
      expect(baja.status).toBe(200);
      // Una cédula que sobrevive a la baja es una fuga en diferido.
      expect(fs.existsSync(ruta)).toBe(false);
    });
  });
});
