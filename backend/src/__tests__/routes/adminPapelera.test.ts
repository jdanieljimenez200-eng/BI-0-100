import * as request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import {
  signupTestUser,
  hacerAdmin,
  cabeceras,
  codigoFresco,
  type TestUser,
  type AdminTestUser,
} from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { purgarPapelera, DIAS_PAPELERA } from '../../services/admin/papelera';

const PDF = Buffer.from(['%PDF-1.4', '1 0 obj<<>>endobj', 'trailer<<>>', '%%EOF', ''].join('\n'));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Papelera de cuentas.
 *
 * Lo que se vigila: que "eliminar" sea reversible de verdad durante 30 días
 * —nadie entra, nada se ve, todo vuelve—, y que pasado ese plazo el borrado sea
 * de verdad, ficheros y cédulas incluidos, sin dejar filas huérfanas.
 */
describeWithDb('Papelera de cuentas', () => {
  let superadmin: AdminTestUser;
  let dueno: TestUser;
  let trabajador: TestUser;
  let expertoId: string;
  /** Superadmins auxiliares: cada uno tiene dos códigos frescos por ventana de 30 s. */
  let actorA: AdminTestUser;
  let actorB: AdminTestUser;

  const hace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  /** Cabeceras con un código fresco: cada acción peligrosa gasta uno. */
  const conCodigo = (admin: AdminTestUser) => ({ ...cabeceras(admin), 'X-Admin-Totp': codigoFresco(admin) });

  const enviar = (admin: AdminTestUser, id: string, motivo = 'Baja solicitada por el cliente') =>
    request.default(app).post(`/api/admin/usuarios/${id}/papelera`).set(conCodigo(admin)).send({ motivo });

  const restaurar = (admin: AdminTestUser, id: string, motivo = 'Se equivocó al pedir la baja') =>
    request.default(app).post(`/api/admin/usuarios/${id}/restaurar`).set(conCodigo(admin)).send({ motivo });

  beforeAll(async () => {
    await initTestDb();
    [superadmin, dueno, trabajador] = await Promise.all([
      signupTestUser().then((u) => hacerAdmin(u, 'superadmin')),
      signupTestUser(),
      signupTestUser(),
    ]);
    await AppDataSource.query(`UPDATE usuarios SET account_role = 'trabajador', owner_id = $1 WHERE id = $2`, [
      dueno.userId,
      trabajador.userId,
    ]);

    const alta = await request
      .default(app)
      .post('/api/network/expertos')
      .set(cabeceras(dueno))
      .send({ nombre_comercial: 'En Papelera SA', nombre_display: 'En Papelera', categoria: 'ventas' });
    expertoId = alta.body.experto.id;
    await AppDataSource.query(`UPDATE expertos SET estado = 'aprobado' WHERE id = $1`, [expertoId]);
  }, 60_000);

  afterAll(async () => {
    await closeTestDb();
  });

  describe('Salvaguardas', () => {
    it('sin código fresco no se envía nada a la papelera', async () => {
      const res = await request
        .default(app)
        .post(`/api/admin/usuarios/${dueno.userId}/papelera`)
        .set(cabeceras(superadmin))
        .send({ motivo: 'Sin reconfirmar no debe pasar' });
      expect(res.status).toBe(401);
      const [{ eliminado_en }] = await AppDataSource.query(`SELECT eliminado_en FROM usuarios WHERE id = $1`, [dueno.userId]);
      expect(eliminado_en).toBeNull();
    });

    it('sin motivo, tampoco (y no se gasta el código)', async () => {
      const res = await request
        .default(app)
        .post(`/api/admin/usuarios/${dueno.userId}/papelera`)
        .set(cabeceras(superadmin))
        .send({});
      expect(res.status).toBe(400);
    });

    it('nadie envía su propia cuenta', async () => {
      const res = await request
        .default(app)
        .post(`/api/admin/usuarios/${superadmin.userId}/papelera`)
        .set(cabeceras(superadmin))
        .send({ motivo: 'Intento sobre la propia cuenta' });
      expect(res.status).toBe(400);
    });

    it('una cuenta de administración no va a la papelera sin retirarle antes el acceso', async () => {
      const otroAdmin = await hacerAdmin(await signupTestUser(), 'moderador');
      actorA = await hacerAdmin(await signupTestUser(), 'superadmin');
      const res = await enviar(actorA, otroAdmin.userId);
      expect(res.status).toBe(409);
    });
  });

  describe('Enviar a la papelera', () => {
    let tokenAntes: string;
    let res: request.Response;

    beforeAll(async () => {
      tokenAntes = dueno.accessToken;
      await AppDataSource.query(`UPDATE usuarios SET stripe_subscription_id = 'sub_test_papelera' WHERE id = $1`, [
        dueno.userId,
      ]);
      res = await enviar(superadmin, dueno.userId);
    });

    it('se aplica al dueño y a sus trabajadores', async () => {
      expect(res.status).toBe(200);
      expect(res.body.cuentas_afectadas).toBe(2);
      const filas = await AppDataSource.query(
        `SELECT id, activo, eliminado_en FROM usuarios WHERE id = ANY($1::uuid[])`,
        [[dueno.userId, trabajador.userId]]
      );
      expect(filas.every((f: { activo: boolean; eliminado_en: Date | null }) => !f.activo && f.eliminado_en)).toBe(true);
    });

    it('la sesión abierta del dueño y la del trabajador dejan de valer al momento', async () => {
      expect((await request.default(app).get('/api/network/mis-fichas').set({ Authorization: `Bearer ${tokenAntes}` })).status).toBe(401);
      expect((await request.default(app).get('/api/network/mis-fichas').set(cabeceras(trabajador))).status).toBe(401);
    });

    it('no puede volver a iniciar sesión', async () => {
      const login = await request.default(app).post('/api/auth/login').send({ email: dueno.email, password: dueno.password });
      expect(login.status).not.toBe(200);
    });

    it('su ficha desaparece del directorio público', async () => {
      const dir = await request.default(app).get('/api/network/expertos?categoria=ventas');
      expect(dir.body.expertos.some((e: { id: string }) => e.id === expertoId)).toBe(false);
      expect((await request.default(app).get(`/api/network/expertos/${expertoId}`)).status).toBe(404);
    });

    it('la suscripción que Stripe no pudo cancelar se dice, no se oculta', async () => {
      // En tests no hay Stripe: la cancelación no puede confirmarse, y la
      // respuesta tiene que avisar de que esa cuenta podría seguir cobrándose.
      expect(res.body.suscripciones_sin_cancelar).toContain('sub_test_papelera');
    });

    it('sale del listado de usuarios y aparece en la papelera con sus días', async () => {
      const lista = await request
        .default(app)
        .get(`/api/admin/usuarios?search=${encodeURIComponent(dueno.email)}`)
        .set(cabeceras(superadmin));
      expect(lista.body.usuarios).toHaveLength(0);

      const pap = await request.default(app).get('/api/admin/papelera').set(cabeceras(superadmin));
      const fila = pap.body.cuentas.find((c: { id: string }) => c.id === dueno.userId);
      expect(fila.dias_restantes).toBe(DIAS_PAPELERA);
      expect(fila.eliminado_por_email).toBe(superadmin.email);
    });

    it('queda en la auditoría con el motivo', async () => {
      const [r] = await AppDataSource.query(
        `SELECT accion, motivo FROM auditoria_admin WHERE recurso_id = $1 AND accion = 'usuario.papelera'`,
        [dueno.userId]
      );
      expect(r).toMatchObject({ accion: 'usuario.papelera', motivo: 'Baja solicitada por el cliente' });
    });

    it('enviarla dos veces no hace nada', async () => {
      expect((await enviar(actorA, dueno.userId)).status).toBe(409);
    });
  });

  describe('Restaurar', () => {
    it('un trabajador no vuelve solo mientras su dueño siga en la papelera', async () => {
      expect((await restaurar(superadmin, trabajador.userId)).status).toBe(409);
    });

    it('restaurar al dueño devuelve la cuenta, su trabajador y su ficha', async () => {
      actorB = await hacerAdmin(await signupTestUser(), 'superadmin');
      const res = await restaurar(actorB, dueno.userId);
      expect(res.status).toBe(200);
      expect(res.body.cuentas_restauradas).toBe(2);

      // El bloqueo invalida tokens anteriores, no los nuevos: tras el segundo del
      // bloqueo, puede volver a entrar.
      await new Promise((r) => setTimeout(r, 1100));
      const login = await request.default(app).post('/api/auth/login').send({ email: dueno.email, password: dueno.password });
      expect(login.status).toBe(200);

      expect((await request.default(app).get(`/api/network/expertos/${expertoId}`)).status).toBe(200);
    });

    it('pasados 30 días ya no se puede restaurar', async () => {
      const vieja = await signupTestUser();
      await AppDataSource.query(
        `UPDATE usuarios SET eliminado_en = $1, activo = false WHERE id = $2`,
        [hace(DIAS_PAPELERA + 1), vieja.userId]
      );
      expect((await restaurar(actorB, vieja.userId)).status).toBe(410);
      await AppDataSource.query(`DELETE FROM usuarios WHERE id = $1`, [vieja.userId]);
    });
  });

  describe('Purga definitiva', () => {
    it('borra la cuenta, lo que cuelga de ella y sus ficheros; lo reciente no lo toca', async () => {
      const [aPurgar, reciente] = await Promise.all([signupTestUser(), signupTestUser()]);

      // Una ficha con cédula y foto reales, y un tema sin clave foránea.
      const alta = await request
        .default(app)
        .post('/api/network/expertos')
        .set(cabeceras(aPurgar))
        .send({ nombre_comercial: 'Se Purga SA', nombre_display: 'Se Purga', categoria: 'legal' });
      const idFicha = alta.body.experto.id;
      await request
        .default(app)
        .post(`/api/network/expertos/${idFicha}/documento`)
        .set(cabeceras(aPurgar))
        .attach('documento', PDF, { filename: 'cedula.pdf', contentType: 'application/pdf' });
      const avatar = await request
        .default(app)
        .post(`/api/network/expertos/${idFicha}/avatar`)
        .set(cabeceras(aPurgar))
        .attach('avatar', PNG, { filename: 'foto.png', contentType: 'image/png' });
      await AppDataSource.query(`INSERT INTO temas_usuario (usuario_id) VALUES ($1)`, [aPurgar.userId]).catch(() => undefined);

      const [{ documento_url }] = await AppDataSource.query(`SELECT documento_url FROM expertos WHERE id = $1`, [idFicha]);
      const rutaDocumento = path.join(process.env.DOCUMENTOS_DIR || path.join(process.cwd(), 'almacen-privado'), documento_url);
      const rutaAvatar = path.join(
        process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'),
        'images',
        path.basename(avatar.body.avatar_url)
      );
      expect(fs.existsSync(rutaDocumento)).toBe(true);
      expect(fs.existsSync(rutaAvatar)).toBe(true);

      await AppDataSource.query(`UPDATE usuarios SET eliminado_en = $1, activo = false WHERE id = $2`, [
        hace(DIAS_PAPELERA + 1),
        aPurgar.userId,
      ]);
      await AppDataSource.query(`UPDATE usuarios SET eliminado_en = $1, activo = false WHERE id = $2`, [
        hace(10),
        reciente.userId,
      ]);

      const r = await purgarPapelera();
      expect(r.omitida).toBe(false);

      const cuenta = await AppDataSource.query(`SELECT id FROM usuarios WHERE id = $1`, [aPurgar.userId]);
      const ficha = await AppDataSource.query(`SELECT id FROM expertos WHERE id = $1`, [idFicha]);
      const tema = await AppDataSource.query(`SELECT 1 FROM temas_usuario WHERE usuario_id = $1`, [aPurgar.userId]);
      expect(cuenta).toHaveLength(0);
      expect(ficha).toHaveLength(0);
      expect(tema).toHaveLength(0);
      // La cédula y la foto, fuera del almacén: sin esto, "borrado definitivo"
      // dejaría el documento de identidad guardado para siempre.
      expect(fs.existsSync(rutaDocumento)).toBe(false);
      expect(fs.existsSync(rutaAvatar)).toBe(false);

      // La que lleva 10 días sigue ahí.
      expect(await AppDataSource.query(`SELECT id FROM usuarios WHERE id = $1`, [reciente.userId])).toHaveLength(1);

      // El registro de la purga no vuelve a guardar el email que se acaba de borrar.
      const [registro] = await AppDataSource.query(
        `SELECT admin_email, antes, despues FROM auditoria_admin WHERE recurso_id = $1 AND accion = 'usuario.purgado'`,
        [aPurgar.userId]
      );
      expect(registro.admin_email).toBe('sistema');
      expect(JSON.stringify(registro)).not.toContain(aPurgar.email);

      await AppDataSource.query(`DELETE FROM usuarios WHERE id = $1`, [reciente.userId]);
    });

    it('si otra instancia ya está purgando, esta no hace nada', async () => {
      const otra = AppDataSource.createQueryRunner();
      await otra.connect();
      try {
        await otra.query(`SELECT pg_advisory_lock(hashtext('purga_papelera'))`);
        const r = await purgarPapelera();
        expect(r.omitida).toBe(true);
      } finally {
        await otra.query(`SELECT pg_advisory_unlock(hashtext('purga_papelera'))`);
        await otra.release();
      }
    });
  });
});
