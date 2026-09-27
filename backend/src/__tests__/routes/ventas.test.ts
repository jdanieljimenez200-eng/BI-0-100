import * as request from 'supertest';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser } from '../helpers/authHelper';
import { crearProductoDeUsuario } from '../helpers/seedHelper';
import { AppDataSource } from '../../config/database';
import { AnalisisVentas } from '../../models/AnalisisVentas';
import { Usuario } from '../../models/Usuario';

const PERFIL_VALIDO = {
  demograficos: {
    edad_rango: '25-34',
    genero_predominante: 'mixto',
    nivel_socioeconomico: 'medio',
    ubicacion_tipica: 'zonas urbanas',
  },
  psicografia: {
    miedos_principales: ['perder tiempo', 'perder dinero'],
    deseos_clave: ['ahorrar tiempo', 'crecer su negocio'],
    objeciones_tipicas: ['es muy caro', 'no tengo tiempo de aprenderlo'],
    valores_compra: ['confianza', 'resultados rápidos'],
  },
  canales_preferidos: ['redes_sociales', 'directo'],
  disparadores_compra: ['recomendación de un colega', 'oferta por tiempo limitado'],
  frenos_compra: ['precio', 'falta de garantía'],
  lenguaje_tipico: 'quiero algo que funcione ya',
  queries_tipicas: ['mejor herramienta para X', 'cómo automatizar Y'],
  score_afinidad: 78,
  score_razon: 'Buen match entre ticket promedio y disposición de pago del segmento.',
};

describeWithDb('Ventas routes', () => {
  let token: string;
  let userId: string;
  let analisisId: string;

  beforeAll(async () => {
    await initTestDb();
    const usuario = await signupTestUser();
    token = usuario.accessToken;
    userId = usuario.userId;

    // El gate de ICP/script-scorer/competitor-intel requiere plan pago;
    // se sube directo en BD para no depender del flujo de billing en este test.
    await AppDataSource.getRepository(Usuario).update({ id: userId }, { plan: 'business' });

    const producto = await crearProductoDeUsuario(userId);

    const repo = AppDataSource.getRepository(AnalisisVentas);
    const analisis = repo.create({
      usuario_id: userId,
      producto_id: producto.id,
      estado_analisis: 'completado',
      perfil_cliente_data: PERFIL_VALIDO,
    });
    const guardado = await repo.save(analisis);
    analisisId = guardado.id;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST /api/ventas/analizar — validación de entrada', () => {
    it('un ticket fuera del rango de la columna responde 400, no 500', async () => {
      // `ticket_promedio` es decimal(10,2): 1e9 reventaba el INSERT en Postgres.
      const producto = await crearProductoDeUsuario(userId);
      const res = await request
        .default(app)
        .post('/api/ventas/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({
          producto_id: producto.id,
          tipo_venta: 'B2C_directo',
          canal_principal: 'directo',
          tamano_equipo: 'solo_tu',
          ticket_promedio: 1_000_000_000,
        });

      expect(res.status).toBe(400);
      expect(String(res.body.error)).toMatch(/ticket_promedio/);
    });

    it('un ticket válido se acepta y encola', async () => {
      const producto = await crearProductoDeUsuario(userId);
      const res = await request
        .default(app)
        .post('/api/ventas/analizar')
        .set('Authorization', `Bearer ${token}`)
        .send({
          producto_id: producto.id,
          tipo_venta: 'B2C_directo',
          canal_principal: 'directo',
          tamano_equipo: 'solo_tu',
          ticket_promedio: 450,
        });

      expect(res.status).toBe(202);
      expect(res.body.analisis_id).toBeTruthy();
    });
  });

  describe('PATCH /api/ventas/:id/perfil', () => {
    it('rechaza un patch que rompe la forma del ICP (objeciones_tipicas no es array) con 400, no 500', async () => {
      const res = await request
        .default(app)
        .patch(`/api/ventas/${analisisId}/perfil`)
        .set('Authorization', `Bearer ${token}`)
        .send({ psicografia: { objeciones_tipicas: 'ya no es un array' } });

      expect(res.status).toBe(400);
    });

    it('acepta un patch parcial válido y lo persiste mergeado', async () => {
      const res = await request
        .default(app)
        .patch(`/api/ventas/${analisisId}/perfil`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lenguaje_tipico: 'necesito resultados esta semana' });

      expect(res.status).toBe(200);
      expect(res.body.perfil_cliente_data.lenguaje_tipico).toBe('necesito resultados esta semana');
      // El resto del perfil se mantiene intacto tras el merge.
      expect(res.body.perfil_cliente_data.psicografia.objeciones_tipicas).toEqual(
        PERFIL_VALIDO.psicografia.objeciones_tipicas
      );
    });

    it('POST /:id/guion sigue funcionando después de un patch válido (regresión del crash de evaluarGuion)', async () => {
      const res = await request
        .default(app)
        .post(`/api/ventas/${analisisId}/guion`)
        .set('Authorization', `Bearer ${token}`)
        .send({ guion: 'Compra ahora y obtén 20% de descuento en tu primera compra con nosotros.' });

      expect(res.status).toBe(200);
      expect(res.body.evaluacion).toBeDefined();
    });
  });

  describe('POST /api/ventas/:id/competidores', () => {
    it('marca transcripcion_degradada=true cuando no hay transcripción ni video', async () => {
      const res = await request
        .default(app)
        .post(`/api/ventas/${analisisId}/competidores`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Competidor sin video' });

      expect(res.status).toBe(200);
      expect(res.body.competidor.transcripcion_degradada).toBe(true);
    });

    it('no marca transcripcion_degradada cuando se manda transcripción real', async () => {
      const res = await request
        .default(app)
        .post(`/api/ventas/${analisisId}/competidores`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nombre: 'Competidor con transcripción',
          transcripcion: 'En este video mostramos cómo nuestro producto resuelve el problema de X en 3 pasos simples.',
        });

      expect(res.status).toBe(200);
      expect(res.body.competidor.transcripcion_degradada).toBe(false);
    });

    it('persiste redes_sociales y pagina_web como referencia (origen texto)', async () => {
      const res = await request
        .default(app)
        .post(`/api/ventas/${analisisId}/competidores`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nombre: 'Competidor con redes',
          redes_sociales: '@marcacompetidora en Instagram y TikTok',
          pagina_web: 'https://marcacompetidora.example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.competidor.redes_sociales).toBe('@marcacompetidora en Instagram y TikTok');
      expect(res.body.competidor.pagina_web).toBe('https://marcacompetidora.example.com');
      expect(res.body.competidor.origen).toBe('texto');
    });

    it('acepta una foto (campo "foto") y marca origen=foto, degradado=false', async () => {
      const pngMinimo = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      );
      const res = await request
        .default(app)
        .post(`/api/ventas/${analisisId}/competidores`)
        .set('Authorization', `Bearer ${token}`)
        .field('nombre', 'Competidor con foto')
        .attach('foto', pngMinimo, { filename: 'anuncio.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.competidor.origen).toBe('foto');
      expect(res.body.competidor.transcripcion_degradada).toBe(false);
    });
  });
});
