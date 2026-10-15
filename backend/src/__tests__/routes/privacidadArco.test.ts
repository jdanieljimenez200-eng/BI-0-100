import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser, hacerAdmin, cabeceras, TestUser, AdminTestUser } from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';

/**
 * Canal de derechos ARCO: el formulario público registra la solicitud con folio
 * y plazos; solo el superadmin la ve y la atiende, con auditoría.
 */
describeWithDb('Solicitudes ARCO', () => {
  let titular: TestUser;
  let superadmin: AdminTestUser;
  let soporte: AdminTestUser;
  const folios: string[] = [];

  const enviar = (cuerpo: Record<string, unknown>) =>
    request.default(app).post('/api/privacidad/arco').send(cuerpo);

  beforeAll(async () => {
    await initTestDb();
    titular = await signupTestUser();
    superadmin = await hacerAdmin(await signupTestUser(), 'superadmin');
    soporte = await hacerAdmin(await signupTestUser(), 'soporte');
  }, 60_000);

  afterAll(async () => {
    if (folios.length) await AppDataSource.query(`DELETE FROM solicitudes_arco WHERE folio = ANY($1::text[])`, [folios]);
    await closeTestDb();
  });

  it('sin sesión registra la solicitud, da folio y fecha límite a 20 días, y la liga a la cuenta del correo', async () => {
    const antes = Date.now();
    const res = await enviar({
      nombre: 'Titular de Prueba',
      email: titular.email.toUpperCase(),
      tipo: 'acceso',
      descripcion: 'Quiero saber qué datos míos tienen y para qué los usan.',
    });
    expect(res.status).toBe(201);
    expect(res.body.folio).toMatch(/^ARCO-\d{4}-\d{4,}$/);
    folios.push(res.body.folio);

    const limite = new Date(res.body.fecha_limite_respuesta).getTime();
    expect(limite - antes).toBeGreaterThanOrEqual(20 * 86_400_000 - 60_000);
    expect(limite - antes).toBeLessThanOrEqual(20 * 86_400_000 + 60_000);

    const [fila] = await AppDataSource.query(`SELECT usuario_id, email, estado FROM solicitudes_arco WHERE folio = $1`, [res.body.folio]);
    expect(fila).toEqual({ usuario_id: titular.userId, email: titular.email.toLowerCase(), estado: 'recibida' });
  });

  it('rechaza solicitudes incompletas sin guardar nada', async () => {
    const res = await enviar({ nombre: 'X', email: 'no-es-correo', tipo: 'acceso', descripcion: 'corta' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('solo el superadmin ve y atiende la bandeja; responder corre el plazo de ejecución y queda auditado', async () => {
    const alta = await enviar({
      nombre: 'Otra Persona',
      email: `arco-${randomUUID()}@example.com`,
      tipo: 'cancelacion',
      descripcion: 'Borren todos mis datos, por favor.',
    });
    expect(alta.status).toBe(201);
    folios.push(alta.body.folio);

    expect((await request.default(app).get('/api/admin/arco').set(cabeceras(titular))).status).toBe(403);
    expect((await request.default(app).get('/api/admin/arco').set(cabeceras(soporte))).status).toBe(403);

    const bandeja = await request.default(app).get('/api/admin/arco').set(cabeceras(superadmin));
    expect(bandeja.status).toBe(200);
    const solicitud = bandeja.body.solicitudes.find((s: { folio: string }) => s.folio === alta.body.folio);
    expect(solicitud).toMatchObject({ estado: 'recibida', tipo: 'cancelacion' });

    const cambio = await request
      .default(app)
      .patch(`/api/admin/arco/${solicitud.id}`)
      .set(cabeceras(superadmin))
      .send({ estado: 'respondida', respuesta: 'Procede: borraremos tu cuenta.', notas_internas: 'Identidad verificada por correo' });
    expect(cambio.status).toBe(200);
    expect(cambio.body.solicitud.fecha_respuesta).toBeTruthy();
    expect(cambio.body.solicitud.fecha_limite_ejecucion).toBeTruthy();
    expect(cambio.body.respuesta_enviada).toBe(false);

    const [auditoria] = await AppDataSource.query(
      `SELECT accion, admin_id FROM auditoria_admin WHERE recurso_tipo = 'solicitud_arco' AND recurso_id = $1`,
      [solicitud.id]
    );
    expect(auditoria).toEqual({ accion: 'arco.actualizada', admin_id: superadmin.userId });

    const sinTexto = await request
      .default(app)
      .patch(`/api/admin/arco/${solicitud.id}`)
      .set(cabeceras(superadmin))
      .send({ respuesta: null, enviar_respuesta: true });
    expect(sinTexto.status).toBe(400);
  });

  it('la solicitud sobrevive al borrado de la cuenta del titular', async () => {
    const u = await signupTestUser();
    const alta = await enviar({ nombre: 'Se Va', email: u.email, tipo: 'cancelacion', descripcion: 'Borren mi cuenta y mis datos.' });
    folios.push(alta.body.folio);
    await AppDataSource.query(`DELETE FROM usuarios WHERE id = $1`, [u.userId]);
    const [fila] = await AppDataSource.query(`SELECT usuario_id, email FROM solicitudes_arco WHERE folio = $1`, [alta.body.folio]);
    expect(fila).toEqual({ usuario_id: null, email: u.email.toLowerCase() });
  });
});
