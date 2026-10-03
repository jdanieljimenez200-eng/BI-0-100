import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import {
  signupTestUser,
  hacerAdmin,
  cabeceras,
  codigoFresco,
  type AdminTestUser,
} from '../helpers/authHelper';
import { AppDataSource } from '../../config/database';
import { Producto } from '../../models/Producto';
import { resolverPrompt, _reiniciarCachePrompts } from '../../services/ia/registroPrompts';

// Encolar de verdad abriría la conexión de BullMQ y Jest no saldría: aquí solo
// importa lo que hace la ruta antes de encolar (como en analisisCuotaCandado).
jest.mock('../../workers/analysisQueue', () => ({
  ...jest.requireActual('../../workers/analysisQueue'),
  analysisQueue: { add: jest.fn().mockResolvedValue({}) },
}));

const CLAVES = ['legal.modo', 'legal.pais.GT', 'mercado.modo', 'finanzas.modo', 'ventas.modo', 'marketing.modo'];

/**
 * El panel de prompts. Lo que se protege:
 *  - solo superadmin, y publicar exige un código fresco de la app;
 *  - lo publicado es inmutable (también a nivel de base) y hay un solo publicado;
 *  - revertir y volver al repositorio funcionan y quedan auditados;
 *  - lo que se publica es lo que lee el siguiente análisis.
 */
describeWithDb('Prompts de IA (/api/admin/prompts)', () => {
  let admin: AdminTestUser;
  let admin2: AdminTestUser;
  // Cada admin tiene 3 códigos válidos (ventana de 30 s ±1) y uno se gasta al
  // enrolarse. El tercero es el de la ventana anterior y caduca si la petición
  // cruza el cambio de ventana: ningún admin de este test usa más de dos.
  let admin3: AdminTestUser;
  let admin4: AdminTestUser;
  let soporte: AdminTestUser;
  const api = () => request.default(app);
  const conCodigo = (a: AdminTestUser) => ({ ...cabeceras(a), 'X-Admin-Totp': codigoFresco(a) });
  const limpiar = () =>
    AppDataSource.query(`DELETE FROM prompts_ia WHERE clave = ANY($1::text[])`, [CLAVES]);

  beforeAll(async () => {
    await initTestDb();
    await limpiar();
    admin = await hacerAdmin(await signupTestUser());
    admin2 = await hacerAdmin(await signupTestUser());
    admin3 = await hacerAdmin(await signupTestUser());
    admin4 = await hacerAdmin(await signupTestUser());
    soporte = await hacerAdmin(await signupTestUser(), 'soporte');
    _reiniciarCachePrompts();
  });

  afterAll(async () => {
    await limpiar();
    await closeTestDb();
  });

  const contenido = (n: number) => `Modo de prueba versión ${n}. `.repeat(20);

  it('solo superadmin entra', async () => {
    expect((await api().get('/api/admin/prompts').set(cabeceras(soporte))).status).toBe(403);
    const r = await api().get('/api/admin/prompts').set(cabeceras(admin));
    expect(r.status).toBe(200);
    const modo = r.body.claves.find((c: { clave: string }) => c.clave === 'legal.modo');
    expect(modo).toMatchObject({ tipo: 'modo', en_uso: 'repositorio', publicada: null, borrador: null });
    // Las fichas cubren LATAM completa, no solo los países con ficha en el código.
    expect(r.body.claves.some((c: { clave: string }) => c.clave === 'legal.pais.GT')).toBe(true);
  });

  let v1: string;
  let v2: string;

  it('borrador → edición → prueba → publicación', async () => {
    const crear = await api().post('/api/admin/prompts/claves/legal.modo/borradores').set(cabeceras(admin)).send({});
    expect(crear.status).toBe(201);
    expect(crear.body.version).toBe(1);
    v1 = crear.body.id;

    const repetido = await api().post('/api/admin/prompts/claves/legal.modo/borradores').set(cabeceras(admin)).send({});
    expect(repetido.status).toBe(409);
    expect(repetido.body.id).toBe(v1);

    const corto = await api().patch(`/api/admin/prompts/versiones/${v1}`).set(cabeceras(admin)).send({ contenido: 'corto' });
    expect(corto.status).toBe(400);
    const noOcultable = await api()
      .patch(`/api/admin/prompts/versiones/${v1}`)
      .set(cabeceras(admin))
      .send({ secciones_ocultas: ['legal.resumen_ejecutivo'] });
    expect(noOcultable.status).toBe(400);

    const editar = await api()
      .patch(`/api/admin/prompts/versiones/${v1}`)
      .set(cabeceras(admin))
      .send({
        contenido: contenido(1),
        secciones_ocultas: ['legal.checklist'],
        secciones_extra: [{ slug: 'riesgos_temporada', titulo: 'Riesgos de temporada', instrucciones: 'Analiza la estacionalidad del giro.' }],
      });
    expect(editar.status).toBe(200);

    // Sin clave de IA en tests, «probar» devuelve la plantilla, pero recorre el flujo entero.
    const probar = await api()
      .post(`/api/admin/prompts/versiones/${v1}/probar`)
      .set(cabeceras(admin))
      .send({ caso: 'co_ecommerce' });
    expect(probar.status).toBe(200);
    expect(probar.body.caso.pais).toBe('CO');
    expect(probar.body.resultado.meta.contrato).toBe('legal@2');

    const sinCodigo = await api().post(`/api/admin/prompts/versiones/${v1}/publicar`).set(cabeceras(admin)).send({ notas: 'Primera versión experta' });
    expect(sinCodigo.status).toBe(401);
    const sinNotas = await api().post(`/api/admin/prompts/versiones/${v1}/publicar`).set(cabeceras(admin)).send({});
    expect(sinNotas.status).toBe(400);

    const publicar = await api().post(`/api/admin/prompts/versiones/${v1}/publicar`).set(conCodigo(admin)).send({ notas: 'Primera versión experta' });
    expect(publicar.status).toBe(200);

    // Lo que se publica es lo que lee el siguiente análisis (caché invalidada).
    const enUso = await resolverPrompt('legal.modo');
    expect(enUso).toMatchObject({ origen: 'publicado', id: v1, secciones_ocultas: ['legal.checklist'] });
  });

  it('lo publicado no se edita, ni por la API ni directo en la base', async () => {
    const r = await api().patch(`/api/admin/prompts/versiones/${v1}`).set(cabeceras(admin)).send({ contenido: contenido(9) });
    expect(r.status).toBe(409);
    await expect(
      AppDataSource.query(`UPDATE prompts_ia SET contenido = 'hackeado' WHERE id = $1`, [v1])
    ).rejects.toThrow(/no se puede editar/);
    expect((await api().delete(`/api/admin/prompts/versiones/${v1}`).set(cabeceras(admin))).status).toBe(409);
  });

  it('publicar otra versión archiva la anterior; revertir la recupera con sus notas', async () => {
    const crear = await api().post('/api/admin/prompts/claves/legal.modo/borradores').set(cabeceras(admin)).send({});
    expect(crear.body.version).toBe(2);
    v2 = crear.body.id;
    await api().patch(`/api/admin/prompts/versiones/${v2}`).set(cabeceras(admin)).send({ contenido: contenido(2) });
    expect((await api().post(`/api/admin/prompts/versiones/${v2}/publicar`).set(conCodigo(admin3)).send({ notas: 'Segunda versión' })).status).toBe(200);

    const estados = async () =>
      Object.fromEntries(
        (await AppDataSource.query(`SELECT id, estado, notas FROM prompts_ia WHERE clave = 'legal.modo'`)).map(
          (f: { id: string; estado: string; notas: string }) => [f.id, f]
        )
      );
    let e = await estados();
    expect(e[v1].estado).toBe('archivado');
    expect(e[v2].estado).toBe('publicado');

    // Restaura otro admin (ver la nota de admin3/admin4 arriba).
    const revertir = await api().post(`/api/admin/prompts/versiones/${v1}/publicar`).set(conCodigo(admin2)).send({ notas: 'La v2 salió peor en Perú' });
    expect(revertir.status).toBe(200);
    e = await estados();
    expect(e[v1]).toMatchObject({ estado: 'publicado', notas: 'Primera versión experta' });
    expect(e[v2].estado).toBe('archivado');
    expect((await resolverPrompt('legal.modo')).id).toBe(v1);
  });

  it('volver al repositorio deja de usar versiones de la base', async () => {
    const r = await api().post('/api/admin/prompts/claves/legal.modo/usar-repositorio').set(conCodigo(admin4)).send({ notas: 'Volvemos al texto revisado del código' });
    expect(r.status).toBe(200);
    expect((await resolverPrompt('legal.modo')).origen).toBe('repositorio');
    const publicadas = await AppDataSource.query(`SELECT count(*)::int AS n FROM prompts_ia WHERE clave = 'legal.modo' AND estado = 'publicado'`);
    expect(publicadas[0].n).toBe(0);
  });

  it('una ficha nueva con campos por completar no se publica', async () => {
    const crear = await api().post('/api/admin/prompts/claves/legal.pais.GT/borradores').set(cabeceras(admin2)).send({});
    expect(crear.status).toBe(201);
    const detalle = await api().get('/api/admin/prompts/claves/legal.pais.GT').set(cabeceras(admin2));
    expect(detalle.body.versiones[0].contenido).toContain('[completar]');
    const r = await api().post(`/api/admin/prompts/versiones/${crear.body.id}/publicar`).set(cabeceras(admin2)).send({ notas: 'Ficha de Guatemala' });
    expect(r.status).toBe(400);
    const extra = await api()
      .patch(`/api/admin/prompts/versiones/${crear.body.id}`)
      .set(cabeceras(admin2))
      .send({ secciones_ocultas: ['legal.checklist'] });
    expect(extra.status).toBe(400);
    expect((await api().delete(`/api/admin/prompts/versiones/${crear.body.id}`).set(cabeceras(admin2))).status).toBe(200);
  });

  it('Mercado: sus propios casos, solo oculta lo que escribe la IA y «probar» respeta lo oculto', async () => {
    const detalle = await api().get('/api/admin/prompts/claves/mercado.modo').set(cabeceras(admin2));
    expect(detalle.status).toBe(200);
    expect(detalle.body.casos.map((c: { id: string }) => c.id)).toContain('co_ropa_en_marcha');
    expect(detalle.body.casos.map((c: { id: string }) => c.id)).not.toContain('co_ecommerce');

    const crear = await api().post('/api/admin/prompts/claves/mercado.modo/borradores').set(cabeceras(admin2)).send({});
    expect(crear.status).toBe(201);
    const id = crear.body.id;

    const evidencia = await api().patch(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2)).send({ secciones_ocultas: ['mercado.competencia'] });
    expect(evidencia.status).toBe(400);
    const ocultar = await api().patch(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2)).send({ secciones_ocultas: ['mercado.dafo'] });
    expect(ocultar.status).toBe(200);

    const casoDeOtroModulo = await api().post(`/api/admin/prompts/versiones/${id}/probar`).set(cabeceras(admin2)).send({ caso: 'co_ecommerce' });
    expect(casoDeOtroModulo.status).toBe(404);

    const probar = await api().post(`/api/admin/prompts/versiones/${id}/probar`).set(cabeceras(admin2)).send({ caso: 'co_ropa_en_marcha' });
    expect(probar.status).toBe(200);
    expect(probar.body.caso.pais).toBe('CO');
    expect(probar.body.resultado.dafo).toBeNull();
    expect(probar.body.resultado.meta_ia.secciones_ocultas).toEqual(['mercado.dafo']);
    expect(probar.body.resultado.meta_ia.meta).toMatchObject({ contrato: 'mercado@2', versiones_prompt: { 'mercado.modo': { id, version: 1 } } });

    expect((await api().delete(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2))).status).toBe(200);
  });

  it('Finanzas: prueba un caso con el cálculo completo y solo deja ocultar los riesgos', async () => {
    const detalle = await api().get('/api/admin/prompts/claves/finanzas.modo').set(cabeceras(admin2));
    expect(detalle.status).toBe(200);
    expect(detalle.body.casos.map((c: { id: string }) => c.id)).toContain('pe_tienda_online_deuda');

    const crear = await api().post('/api/admin/prompts/claves/finanzas.modo/borradores').set(cabeceras(admin2)).send({});
    expect(crear.status).toBe(201);
    const id = crear.body.id;
    const calculo = await api().patch(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2)).send({ secciones_ocultas: ['finanzas.proyeccion_12m'] });
    expect(calculo.status).toBe(400);

    const probar = await api().post(`/api/admin/prompts/versiones/${id}/probar`).set(cabeceras(admin2)).send({ caso: 'pe_tienda_online_deuda' });
    expect(probar.status).toBe(200);
    expect(probar.body.caso.pais).toBe('PE');
    expect(probar.body.resultado.proyeccion.cobertura_deuda).not.toBeNull();
    expect(probar.body.resultado.meta_ia.meta).toMatchObject({ contrato: 'finanzas@2', versiones_prompt: { 'finanzas.modo': { id, version: 1 } } });

    expect((await api().delete(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2))).status).toBe(200);
  });

  it('Ventas: prueba un caso B2B y solo deja ocultar la historia del día', async () => {
    const detalle = await api().get('/api/admin/prompts/claves/ventas.modo').set(cabeceras(admin2));
    expect(detalle.status).toBe(200);
    expect(detalle.body.casos.map((c: { id: string }) => c.id)).toContain('co_software_b2b');

    const crear = await api().post('/api/admin/prompts/claves/ventas.modo/borradores').set(cabeceras(admin2)).send({});
    expect(crear.status).toBe(201);
    const id = crear.body.id;
    const tips = await api().patch(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2)).send({ secciones_ocultas: ['ventas.tips'] });
    expect(tips.status).toBe(400);
    const historia = await api().patch(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2)).send({ secciones_ocultas: ['ventas.historia'] });
    expect(historia.status).toBe(200);

    const probar = await api().post(`/api/admin/prompts/versiones/${id}/probar`).set(cabeceras(admin2)).send({ caso: 'co_software_b2b' });
    expect(probar.status).toBe(200);
    expect(probar.body.resultado.historia).toBeNull();
    expect(probar.body.resultado.meta_ia.meta).toMatchObject({ contrato: 'ventas@2', versiones_prompt: { 'ventas.modo': { id, version: 1 } } });

    expect((await api().delete(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2))).status).toBe(200);
  });

  it('Marketing: prueba un caso con el calendario completo y solo deja ocultar los copies', async () => {
    const detalle = await api().get('/api/admin/prompts/claves/marketing.modo').set(cabeceras(admin2));
    expect(detalle.status).toBe(200);
    expect(detalle.body.casos.map((c: { id: string }) => c.id)).toContain('pe_gimnasio_crecimiento');

    const crear = await api().post('/api/admin/prompts/claves/marketing.modo/borradores').set(cabeceras(admin2)).send({});
    expect(crear.status).toBe(201);
    const id = crear.body.id;
    const calendario = await api().patch(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2)).send({ secciones_ocultas: ['marketing.calendario'] });
    expect(calendario.status).toBe(400);
    const copies = await api().patch(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2)).send({ secciones_ocultas: ['marketing.copies'] });
    expect(copies.status).toBe(200);

    const probar = await api().post(`/api/admin/prompts/versiones/${id}/probar`).set(cabeceras(admin2)).send({ caso: 'pe_gimnasio_crecimiento' });
    expect(probar.status).toBe(200);
    expect(probar.body.resultado.copies).toBeNull();
    expect(probar.body.resultado.estrategias).toHaveLength(4);
    expect(probar.body.resultado.meta_ia.meta).toMatchObject({ contrato: 'marketing@2', versiones_prompt: { 'marketing.modo': { id, version: 1 } } });

    expect((await api().delete(`/api/admin/prompts/versiones/${id}`).set(cabeceras(admin2))).status).toBe(200);
  });

  it('cada cambio queda en la auditoría', async () => {
    const filas = await AppDataSource.query(
      `SELECT accion FROM auditoria_admin WHERE recurso_tipo = 'prompt_ia' AND admin_id = ANY($1::uuid[])`,
      [[admin.userId, admin2.userId, admin3.userId, admin4.userId]]
    );
    const acciones = filas.map((f: { accion: string }) => f.accion);
    expect(acciones).toEqual(
      expect.arrayContaining([
        'prompt.borrador_creado',
        'prompt.publicado',
        'prompt.restaurado',
        'prompt.repositorio_restablecido',
        'prompt.borrador_eliminado',
      ])
    );
  });
});

describeWithDb('Legal guarda el perfil ampliado en el producto', () => {
  beforeAll(initTestDb);
  afterAll(closeTestDb);

  it('fusiona lo nuevo con lo que ya había, sin borrarlo', async () => {
    const dueno = await signupTestUser();
    await AppDataSource.query(`UPDATE usuarios SET plan = 'enterprise' WHERE id = $1`, [dueno.userId]);
    const repo = AppDataSource.getRepository(Producto);
    const producto = await repo.save(
      repo.create({
        usuario_id: dueno.userId,
        nombre: 'Clínica Test',
        status: 'activo',
        pais: 'CL',
        perfil_negocio: { marca: 'registrada', tipo_clientes: 'consumidor_final' },
      })
    );

    const base = {
      producto_id: producto.id,
      forma_juridica: 'SpA',
      tiene_empleados: false,
      vende_en_linea: false,
      exporta_importa: false,
      anios_operando: '1-2',
    };
    // Primero el inválido: un 400 libera el candado de «análisis en curso».
    const invalido = await request
      .default(app)
      .post('/api/legal/analizar')
      .set(cabeceras(dueno))
      .send({ ...base, perfil_negocio: { campo_inventado: 1 } });
    expect(invalido.status).toBe(400);

    const r = await request
      .default(app)
      .post('/api/legal/analizar')
      .set(cabeceras(dueno))
      .send({ ...base, perfil_negocio: { sectores_regulados: ['salud'], datos_sensibles: true } });
    expect(r.status).toBe(202);

    const guardado = await repo.findOneByOrFail({ id: producto.id });
    expect(guardado.perfil_negocio).toEqual({
      marca: 'registrada',
      tipo_clientes: 'consumidor_final',
      sectores_regulados: ['salud'],
      datos_sensibles: true,
    });

    // Mercado escribe en el mismo perfil: lo que se contesta en un módulo sirve a todos.
    const mercado = await request
      .default(app)
      .post('/api/mercado/analizar')
      .set(cabeceras(dueno))
      .send({
        producto_id: producto.id,
        pais: 'CL',
        scope: 'nacional',
        forma_cobro: 'Pago Único',
        nse_target: 'C2',
        perfil_negocio: { tipo_clientes: 'empresas', marca: null },
      });
    expect(mercado.status).toBe(202);
    const trasMercado = await repo.findOneByOrFail({ id: producto.id });
    // `null` queda como «sin responder»: el usuario vació la respuesta.
    expect(trasMercado.perfil_negocio).toEqual({
      tipo_clientes: 'empresas',
      marca: null,
      sectores_regulados: ['salud'],
      datos_sensibles: true,
    });
  });
});
