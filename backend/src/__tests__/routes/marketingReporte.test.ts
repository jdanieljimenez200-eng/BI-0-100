import * as request from 'supertest';
import * as XLSX from 'xlsx';
import { app, initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { signupTestUser } from '../helpers/authHelper';
import { crearProductoDeUsuario } from '../helpers/seedHelper';
import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';

describeWithDb('Marketing Reporte Ads route', () => {
  let tokenFreemium: string;
  let userFreemiumId: string;
  let tokenPro: string;
  let userProId: string;
  let productoId: string;

  beforeAll(async () => {
    await initTestDb();

    // 1. Usuario Freemium
    const uFree = await signupTestUser();
    tokenFreemium = uFree.accessToken;
    userFreemiumId = uFree.userId;
    await AppDataSource.getRepository(Usuario).update({ id: userFreemiumId }, { plan: 'freemium' });

    // 2. Usuario Pro
    const uPro = await signupTestUser();
    tokenPro = uPro.accessToken;
    userProId = uPro.userId;
    await AppDataSource.getRepository(Usuario).update({ id: userProId }, { plan: 'pro' });

    const prod = await crearProductoDeUsuario(userProId);
    productoId = prod.id;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST /api/marketing/metricas-pasadas/parse', () => {
    it('rechaza con 401 si no hay token de autenticación', async () => {
      const res = await request
        .default(app)
        .post('/api/marketing/metricas-pasadas/parse');

      expect(res.status).toBe(401);
    });

    it('rechaza con 403 (UPGRADE_REQUIRED) a cuentas Freemium', async () => {
      const res = await request
        .default(app)
        .post('/api/marketing/metricas-pasadas/parse')
        .set('Authorization', `Bearer ${tokenFreemium}`)
        .attach('reporte', Buffer.from('Campaña,Coste\nCamp 1,100'), 'reporte.csv');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('UPGRADE_REQUIRED');
    });

    it('rechaza con 400 a usuarios Pro si no se adjunta archivo', async () => {
      const res = await request
        .default(app)
        .post('/api/marketing/metricas-pasadas/parse')
        .set('Authorization', `Bearer ${tokenPro}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('archivo de reporte');
    });

    it('rechaza con 400 si la extensión de archivo no es permitida (.txt o .pdf)', async () => {
      const res = await request
        .default(app)
        .post('/api/marketing/metricas-pasadas/parse')
        .set('Authorization', `Bearer ${tokenPro}`)
        .attach('reporte', Buffer.from('contenido'), 'documento.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Solo se permiten archivos de reporte');
    });

    it('rechaza con 400 si el archivo está vacío o no contiene encabezados válidos', async () => {
      const res = await request
        .default(app)
        .post('/api/marketing/metricas-pasadas/parse')
        .set('Authorization', `Bearer ${tokenPro}`)
        .attach('reporte', Buffer.from('col1,col2\nval1,val2'), 'datos.csv');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('parsea exitosamente un CSV de Meta Ads y devuelve estructura completa', async () => {
      const csv =
        'Nombre de la campaña,Importe gastado (MXN),Impresiones,Clics en el enlace,Resultados,Valor de compras\n' +
        'Campaña Prospección,5000,120000,3500,75,15000\n' +
        'Campaña Retargeting,2500,40000,1500,60,18000\n' +
        'Campaña Prueba Fuga,800,15000,400,0,0\n';

      const res = await request
        .default(app)
        .post('/api/marketing/metricas-pasadas/parse')
        .set('Authorization', `Bearer ${tokenPro}`)
        .field('producto_id', productoId)
        .attach('reporte', Buffer.from(csv, 'utf-8'), 'meta_export.csv');

      expect(res.status).toBe(200);
      expect(res.body.fuente).toBe('meta');
      expect(res.body.totales.gasto_total).toBe(8300);
      expect(res.body.totales.conversiones_total).toBe(135);
      expect(res.body.totales.ingresos_total).toBe(33000);
      expect(res.body.campanas.length).toBe(3);
      expect(res.body.diagnostico_ia).toBeDefined();
      expect(res.body.diagnostico_ia.resumen_ejecutivo).toBeDefined();
      expect(res.body.diagnostico_ia.puntos_fuertes.length).toBeGreaterThan(0);
      expect(res.body.diagnostico_ia.recomendaciones_priorizadas.length).toBeGreaterThan(0);

      // Debe detectar fuga en Campaña Prueba Fuga (800 gastado, 0 conv)
      const fuga = res.body.alertas.find((a: any) => a.tipo === 'gasto_sin_conversion');
      expect(fuga).toBeDefined();
      expect(fuga.campana).toBe('Campaña Prueba Fuga');
    });

    it('parsea exitosamente un XLSX de Google Ads con filas de preámbulo', async () => {
      const data = [
        ['Informe de campañas de Google Ads'],
        ['Cuenta: 999-888-7777'],
        ['Campaña', 'Impr.', 'Clics', 'Coste', 'Todas las conv.', 'Valor de conversión de todas las conv.'],
        ['Búsqueda Alta Intención', 10000, 800, 3200, 40, 12000],
        ['Total: Cuenta', 10000, 800, 3200, 40, 12000],
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Hoja 1');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request
        .default(app)
        .post('/api/marketing/metricas-pasadas/parse')
        .set('Authorization', `Bearer ${tokenPro}`)
        .attach('reporte', buf, 'google_ads_report.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.fuente).toBe('google_ads');
      expect(res.body.campanas.length).toBe(1);
      expect(res.body.totales.gasto_total).toBe(3200);
      expect(res.body.totales.conversiones_total).toBe(40);
    });
  });
});
