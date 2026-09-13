import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, TestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { Usuario, type AdminRol } from '../../models/Usuario';

/**
 * Roles de administración.
 *
 * Lo que se prueba es la matriz de permisos entera, rol por rol y endpoint por
 * endpoint, más las reglas que impiden romperla desde dentro: nadie cambia su
 * propio rol y no se puede dejar la plataforma sin superadmin.
 */
describeWithDb('Roles de administración', () => {
  const cuentas: Partial<Record<AdminRol | 'normal', TestUser>> = {};
  let objetivo: TestUser;

  const auth = (t: TestUser) => ({ Authorization: `Bearer ${t.accessToken}` });
  const usuarios = () => AppDataSource.getRepository(Usuario);

  beforeAll(async () => {
    await initTestDb();
    for (const rol of ['soporte', 'moderador', 'superadmin', 'normal'] as const) {
      cuentas[rol] = await signupTestUser();
      if (rol !== 'normal') {
        await usuarios().update({ id: cuentas[rol]!.userId }, { admin_rol: rol });
      }
    }
    objetivo = await signupTestUser();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('La base mantiene es_admin y admin_rol de acuerdo', () => {
    it('asignar un rol marca es_admin', async () => {
      const u = await usuarios().findOneByOrFail({ id: cuentas.soporte!.userId });
      expect(u.admin_rol).toBe('soporte');
      expect(u.es_admin).toBe(true);
    });

    it('el UPDATE de siempre (es_admin = true) da superadmin, y false quita el rol', async () => {
      const extra = await signupTestUser();
      await usuarios().update({ id: extra.userId }, { es_admin: true });
      expect((await usuarios().findOneByOrFail({ id: extra.userId })).admin_rol).toBe('superadmin');

      await usuarios().update({ id: extra.userId }, { es_admin: false });
      const u = await usuarios().findOneByOrFail({ id: extra.userId });
      expect(u.admin_rol).toBeNull();
      expect(u.es_admin).toBe(false);
    });

    it('un rol inventado lo rechaza la propia base', async () => {
      await expect(
        AppDataSource.query(`UPDATE usuarios SET admin_rol = 'dios' WHERE id = $1`, [objetivo.userId])
      ).rejects.toThrow();
    });
  });

  describe('Matriz de permisos', () => {
    // [método, ruta, cuerpo, roles que deben pasar]
    const matriz: [string, () => string, Record<string, unknown> | undefined, (AdminRol | 'normal')[]][] = [
      ['get', () => '/api/admin/stats', undefined, ['soporte', 'moderador', 'superadmin']],
      ['get', () => '/api/admin/yo', undefined, ['soporte', 'moderador', 'superadmin']],
      [
        'patch',
        () => `/api/admin/usuarios/${objetivo.userId}/activo`,
        { activo: true },
        ['soporte', 'superadmin'],
      ],
      [
        'patch',
        () => `/api/admin/usuarios/${objetivo.userId}/plan`,
        { plan: 'freemium', motivo: 'Prueba de la matriz de permisos' },
        ['superadmin'],
      ],
      ['get', () => '/api/admin/network/pendientes', undefined, ['moderador', 'superadmin']],
      ['get', () => '/api/admin/network/resenas', undefined, ['moderador', 'superadmin']],
      ['get', () => '/api/admin/auditoria', undefined, ['superadmin']],
      ['get', () => '/api/admin/administradores', undefined, ['superadmin']],
    ];

    for (const [metodo, ruta, cuerpo, permitidos] of matriz) {
      for (const rol of ['soporte', 'moderador', 'superadmin', 'normal'] as const) {
        const debePasar = permitidos.includes(rol);
        // El título no puede llamar a ruta(): la cuenta objetivo aún no existe al
        // registrar los tests. Se saca la plantilla del propio código de la función.
        const plantilla = ruta.toString().match(/[`'](\/api\/[^`']+)[`']/)?.[1]?.replace(/\$\{[^}]+\}/, ':id');
        it(`${rol} ${debePasar ? 'SÍ' : 'NO'} puede ${metodo.toUpperCase()} ${plantilla}`, async () => {
          const peticion = (request.default(app) as unknown as Record<string, (r: string) => request.Test>)[metodo](ruta()).set(
            auth(cuentas[rol]!)
          );
          const res = await (cuerpo ? peticion.send(cuerpo) : peticion);
          if (debePasar) {
            expect(res.status).not.toBe(403);
            expect(res.status).toBeLessThan(400);
          } else {
            expect(res.status).toBe(403);
          }
        });
      }
    }

    it('/yo devuelve el rol y los permisos para que la interfaz no ofrezca lo que falla', async () => {
      const res = await request.default(app).get('/api/admin/yo').set(auth(cuentas.moderador!));
      expect(res.body.rol).toBe('moderador');
      expect(res.body.permisos).toMatchObject({ moderarRed: true, cambiarPlan: false, verAuditoria: false });
    });

    it('quitar el rol surte efecto en la siguiente petición, sin esperar a que caduque la sesión', async () => {
      const temporal = await signupTestUser();
      await usuarios().update({ id: temporal.userId }, { admin_rol: 'soporte' });
      expect((await request.default(app).get('/api/admin/stats').set(auth(temporal))).status).toBe(200);

      await usuarios().update({ id: temporal.userId }, { admin_rol: null });
      expect((await request.default(app).get('/api/admin/stats').set(auth(temporal))).status).toBe(403);
    });
  });

  describe('Gestión de roles', () => {
    const cambiarRol = (quien: TestUser, id: string, rol: AdminRol | null, motivo = 'Reorganización del equipo') =>
      request.default(app).patch(`/api/admin/usuarios/${id}/rol`).set(auth(quien)).send({ rol, motivo });

    it('el superadmin asigna un rol y queda en la auditoría', async () => {
      const res = await cambiarRol(cuentas.superadmin!, objetivo.userId, 'moderador');
      expect(res.status).toBe(200);
      expect((await usuarios().findOneByOrFail({ id: objetivo.userId })).admin_rol).toBe('moderador');

      const [registro] = await AppDataSource.query(
        `SELECT accion, antes, despues FROM auditoria_admin WHERE recurso_id = $1 ORDER BY fecha DESC LIMIT 1`,
        [objetivo.userId]
      );
      expect(registro).toMatchObject({ accion: 'rol.asignado', despues: { admin_rol: 'moderador' } });
    });

    it('un moderador no puede darse ni dar roles', async () => {
      const res = await cambiarRol(cuentas.moderador!, objetivo.userId, 'superadmin');
      expect(res.status).toBe(403);
    });

    it('nadie cambia su propio rol, ni siquiera un superadmin', async () => {
      const res = await cambiarRol(cuentas.superadmin!, cuentas.superadmin!.userId, 'soporte');
      expect(res.status).toBe(400);
    });

    it('un rol que no existe se rechaza', async () => {
      const res = await request
        .default(app)
        .patch(`/api/admin/usuarios/${objetivo.userId}/rol`)
        .set(auth(cuentas.superadmin!))
        .send({ rol: 'admin_total', motivo: 'Intento de rol inventado' });
      expect(res.status).toBe(400);
    });

    it('con dos superadmins, uno puede degradar al otro', async () => {
      const otro = await signupTestUser();
      await usuarios().update({ id: otro.userId }, { admin_rol: 'superadmin' });
      const res = await cambiarRol(cuentas.superadmin!, otro.userId, 'soporte');
      expect(res.status).toBe(200);
    });

    /**
     * El último superadmin solo se puede perder por una carrera: quien actúa ya es
     * superadmin, así que con una sola petición siempre quedan dos. El caso real
     * es A degradando a B mientras B degrada a A. Sin el bloqueo, ambos verían
     * "hay dos", ambos aplicarían, y la plataforma quedaría sin nadie que pueda
     * asignar roles.
     *
     * Necesita que A y B sean los únicos superadmins. Solo se retira el rol a
     * cuentas creadas por los tests: si la base tiene superadmins reales (una base
     * de desarrollo compartida), el test lo dice y no los toca.
     */
    it('dos superadmins degradándose a la vez no dejan la plataforma sin ninguno', async () => {
      const [{ reales }] = await AppDataSource.query(
        `SELECT count(*)::int AS reales FROM usuarios
          WHERE admin_rol = 'superadmin' AND email NOT LIKE 'test-%@example.com'`
      );
      if (reales > 0) {
        console.warn(
          `Hay ${reales} superadmin(s) que no son de test: no se retiran para probar la carrera. ` +
            'Este caso se comprueba en una base limpia (CI).'
        );
        return;
      }

      const a = cuentas.superadmin!;
      const b = await signupTestUser();
      await AppDataSource.query(
        `UPDATE usuarios SET admin_rol = NULL WHERE admin_rol = 'superadmin' AND id NOT IN ($1, $2)`,
        [a.userId, b.userId]
      );
      await usuarios().update({ id: b.userId }, { admin_rol: 'superadmin' });

      const [ra, rb] = await Promise.all([
        cambiarRol(a, b.userId, 'soporte', 'Carrera simultánea desde A'),
        cambiarRol(b, a.userId, 'soporte', 'Carrera simultánea desde B'),
      ]);

      // Gana uno; el otro choca con la regla del último superadmin.
      expect([ra.status, rb.status].sort()).toEqual([200, 409]);
      const [{ total }] = await AppDataSource.query(
        `SELECT count(*)::int AS total FROM usuarios WHERE admin_rol = 'superadmin'`
      );
      expect(total).toBe(1);

      await AppDataSource.query(`UPDATE usuarios SET admin_rol = 'superadmin' WHERE id = $1`, [a.userId]);
    });
  });
});
