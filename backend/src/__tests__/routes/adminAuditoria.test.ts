import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';
import { Experto } from '../../models/Experto';
import { AuditoriaAdmin } from '../../models/AuditoriaAdmin';
import * as auditoria from '../../services/admin/auditoria';

/**
 * Auditoría de acciones de administración.
 *
 * Tres garantías, cada una con su test:
 *
 *  1. Toda acción de admin deja rastro: quién, qué cambió, de qué a qué y por qué.
 *  2. El rastro no se puede reescribir: la base rechaza UPDATE, DELETE y TRUNCATE.
 *  3. Si el rastro no se puede escribir, el cambio no se aplica.
 */
describeWithDb('Auditoría de admin', () => {
  let admin: TestUser;
  let usuario: TestUser;
  let dueno: TestUser;

  const auth = (t: TestUser) => ({ Authorization: `Bearer ${t.accessToken}` });
  const registros = () => AppDataSource.getRepository(AuditoriaAdmin);
  const ultimoSobre = (recursoId: string) =>
    registros().findOne({ where: { recurso_id: recursoId }, order: { fecha: 'DESC' } });

  beforeAll(async () => {
    await initTestDb();
    admin = await signupTestUser();
    usuario = await signupTestUser();
    dueno = await signupTestUser();
    await AppDataSource.getRepository(Usuario).update({ id: admin.userId }, { es_admin: true });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('Toda acción deja rastro', () => {
    it('desactivar registra quién, el antes y el después, y el motivo', async () => {
      const res = await request
        .default(app)
        .patch(`/api/admin/usuarios/${usuario.userId}/activo`)
        .set(auth(admin))
        .send({ activo: false, motivo: 'Uso fraudulento detectado en pagos' });
      expect(res.status).toBe(200);

      const r = await ultimoSobre(usuario.userId);
      expect(r).toMatchObject({
        admin_id: admin.userId,
        admin_email: admin.email,
        accion: 'usuario.desactivado',
        recurso_tipo: 'usuario',
        antes: { activo: true },
        despues: { activo: false },
        motivo: 'Uso fraudulento detectado en pagos',
      });
      expect(r!.admin_rol).toBeTruthy();

      await request
        .default(app)
        .patch(`/api/admin/usuarios/${usuario.userId}/activo`)
        .set(auth(admin))
        .send({ activo: true });
    });

    it('cambiar el plan registra el plan anterior y el nuevo', async () => {
      await request
        .default(app)
        .patch(`/api/admin/usuarios/${usuario.userId}/plan`)
        .set(auth(admin))
        .send({ plan: 'business', motivo: 'Cortesía por incidencia del servicio' });

      const r = await ultimoSobre(usuario.userId);
      expect(r).toMatchObject({
        accion: 'usuario.plan_cambiado',
        antes: { plan: 'freemium' },
        despues: { plan: 'business' },
      });
    });

    it('sin motivo, una acción destructiva se rechaza y no cambia nada', async () => {
      const antes = await registros().count();
      const res = await request
        .default(app)
        .patch(`/api/admin/usuarios/${usuario.userId}/plan`)
        .set(auth(admin))
        .send({ plan: 'pro', motivo: 'ok' });
      expect(res.status).toBe(400);

      expect((await AppDataSource.getRepository(Usuario).findOneByOrFail({ id: usuario.userId })).plan).toBe(
        'business'
      );
      expect(await registros().count()).toBe(antes);
    });

    it('suspender una ficha y ocultar una reseña también quedan registrados', async () => {
      const alta = await request
        .default(app)
        .post('/api/network/expertos')
        .set(auth(dueno))
        .send({ nombre_comercial: 'Auditada SA', nombre_display: 'Auditada', categoria: 'legal' });
      const id = alta.body.experto.id;

      await request
        .default(app)
        .patch(`/api/admin/network/expertos/${id}/estado`)
        .set(auth(admin))
        .send({ estado: 'aprobado' });
      const resena = await request
        .default(app)
        .post(`/api/network/expertos/${id}/resenas`)
        .set(auth(usuario))
        .send({ puntuacion: 1, comentario: 'Pésimo' });

      await request
        .default(app)
        .patch(`/api/admin/network/resenas/${resena.body.resena.id}/estado`)
        .set(auth(admin))
        .send({ estado: 'oculta', motivo: 'Insulto sin contenido sobre el servicio' });
      expect(await ultimoSobre(resena.body.resena.id)).toMatchObject({
        accion: 'resena.ocultada',
        motivo: 'Insulto sin contenido sobre el servicio',
      });

      await request
        .default(app)
        .patch(`/api/admin/network/expertos/${id}/estado`)
        .set(auth(admin))
        .send({ estado: 'suspendido', motivo_rechazo: 'Reclamaciones reiteradas de clientes' });
      expect(await ultimoSobre(id)).toMatchObject({
        accion: 'experto.suspendido',
        antes: { estado: 'aprobado' },
        despues: { estado: 'suspendido', verificado: false },
      });

      await AppDataSource.getRepository(Experto).delete(id);
    });

    it('el registro sobrevive al borrado de la cuenta afectada', async () => {
      const efimero = await signupTestUser();
      await request
        .default(app)
        .patch(`/api/admin/usuarios/${efimero.userId}/activo`)
        .set(auth(admin))
        .send({ activo: false, motivo: 'Cuenta de prueba que se va a borrar' });

      await AppDataSource.getRepository(Usuario).delete(efimero.userId);
      // Sin FK: borrar a alguien no puede borrar la prueba de lo que se le hizo.
      expect(await ultimoSobre(efimero.userId)).not.toBeNull();
    });
  });

  describe('El rastro no se puede reescribir', () => {
    it('la base rechaza UPDATE', async () => {
      const r = await ultimoSobre(usuario.userId);
      await expect(
        AppDataSource.query(`UPDATE auditoria_admin SET motivo = 'maquillado' WHERE id = $1`, [r!.id])
      ).rejects.toThrow(/solo inserción/);
      expect((await registros().findOneByOrFail({ id: r!.id })).motivo).not.toBe('maquillado');
    });

    it('la base rechaza DELETE', async () => {
      const r = await ultimoSobre(usuario.userId);
      await expect(
        AppDataSource.query(`DELETE FROM auditoria_admin WHERE id = $1`, [r!.id])
      ).rejects.toThrow(/solo inserción/);
      expect(await registros().findOneBy({ id: r!.id })).not.toBeNull();
    });

    it('la base rechaza TRUNCATE', async () => {
      const total = await registros().count();
      await expect(AppDataSource.query(`TRUNCATE auditoria_admin`)).rejects.toThrow(/solo inserción/);
      expect(await registros().count()).toBe(total);
    });
  });

  describe('Sin rastro no hay cambio', () => {
    it('si el registro falla, el cambio de plan se revierte', async () => {
      jest.spyOn(auditoria, 'registrarAccionAdmin').mockRejectedValueOnce(new Error('disco lleno'));

      const res = await request
        .default(app)
        .patch(`/api/admin/usuarios/${usuario.userId}/plan`)
        .set(auth(admin))
        .send({ plan: 'enterprise', motivo: 'Este cambio no debe aplicarse' });
      expect(res.status).toBe(500);

      const u = await AppDataSource.getRepository(Usuario).findOneByOrFail({ id: usuario.userId });
      expect(u.plan).toBe('business');
    });

    it('si el registro falla, no se entrega la cédula', async () => {
      const alta = await request
        .default(app)
        .post('/api/network/expertos')
        .set(auth(dueno))
        .send({ nombre_comercial: 'Con Cédula SA', nombre_display: 'Con Cédula', categoria: 'ventas' });
      const id = alta.body.experto.id;
      await request
        .default(app)
        .post(`/api/network/expertos/${id}/documento`)
        .set(auth(dueno))
        .attach('documento', Buffer.from('%PDF-1.4\n%%EOF\n'), {
          filename: 'cedula.pdf',
          contentType: 'application/pdf',
        });

      jest.spyOn(auditoria, 'registrarAccionAdmin').mockRejectedValueOnce(new Error('disco lleno'));
      const res = await request
        .default(app)
        .get(`/api/admin/network/expertos/${id}/documento`)
        .set(auth(admin));
      // Un acceso a un documento de identidad sin rastro no puede ocurrir.
      expect(res.status).not.toBe(200);
      expect(res.headers['content-type'] ?? '').not.toContain('application/pdf');

      jest.restoreAllMocks();
      const ok = await request
        .default(app)
        .get(`/api/admin/network/expertos/${id}/documento`)
        .set(auth(admin));
      expect(ok.status).toBe(200);
      expect(await ultimoSobre(id)).toMatchObject({ accion: 'documento.abierto', admin_id: admin.userId });

      await request.default(app).delete(`/api/network/expertos/${id}`).set(auth(dueno));
    });
  });

  describe('Consulta', () => {
    it('filtra por recurso y por prefijo de acción', async () => {
      const res = await request
        .default(app)
        .get(`/api/admin/auditoria?recurso_id=${usuario.userId}&accion=usuario.`)
        .set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.registros.length).toBeGreaterThan(0);
      expect(res.body.registros.every((r: AuditoriaAdmin) => r.recurso_id === usuario.userId)).toBe(true);
      expect(res.body.registros.every((r: AuditoriaAdmin) => r.accion.startsWith('usuario.'))).toBe(true);
    });

    it('un usuario normal no puede leer la auditoría', async () => {
      const res = await request.default(app).get('/api/admin/auditoria').set(auth(usuario));
      expect(res.status).toBe(403);
    });
  });
});
