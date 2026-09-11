import * as XLSX from 'xlsx';
import {
  parsearNumero,
  localizarFilaCabecera,
  detectarFuente,
  mapearColumnas,
  generarAlertasDeterministas,
  parsearArchivoReporte,
  mockReporteAds,
  ReporteAdsError,
  ReporteAdsOutputSchema,
} from '../../services/marketing/reporteAdsService';
import { CampanaAgregada, TotalesReporteAds } from '../../services/marketing/types';

describe('reporteAdsService', () => {
  describe('parsearNumero', () => {
    // Regresión: un solo grupo de miles ("320.100") caía a parseFloat y se leía
    // como 320,1 — dividía impresiones y clics entre mil y producía CTR del 90%.
    it('lee un solo grupo de miles con punto como separador', () => {
      expect(parsearNumero('320.100')).toBe(320100);
      expect(parsearNumero('4.210')).toBe(4210);
      expect(parsearNumero('1.020')).toBe(1020);
    });

    it('sigue leyendo varios grupos de miles', () => {
      expect(parsearNumero('1.000.000')).toBe(1000000);
      expect(parsearNumero('12.345.678')).toBe(12345678);
    });

    it('no confunde el formato europeo con el anglosajón', () => {
      expect(parsearNumero('12.450,50')).toBe(12450.5);
      expect(parsearNumero('0,05')).toBe(0.05);
      expect(parsearNumero('1,234.56')).toBe(1234.56);
    });

    it('debe manejar números nativos', () => {
      expect(parsearNumero(42)).toBe(42);
      expect(parsearNumero(3.1416)).toBe(3.1416);
      expect(parsearNumero(0)).toBe(0);
      expect(parsearNumero(NaN)).toBe(0);
    });

    it('debe limpiar divisas en formato anglosajón ($1,234.56)', () => {
      expect(parsearNumero('$1,234.56')).toBe(1234.56);
      expect(parsearNumero('1,234.56 USD')).toBe(1234.56);
      expect(parsearNumero('USD 500')).toBe(500);
    });

    it('debe limpiar divisas en formato europeo/latino (1.234,56 € o MXN)', () => {
      expect(parsearNumero('1.234,56 €')).toBe(1234.56);
      expect(parsearNumero('12,50')).toBe(12.5);
      expect(parsearNumero('0,05')).toBe(0.05);
      expect(parsearNumero('1250,75 MXN')).toBe(1250.75);
    });

    it('debe interpretar separadores de miles puros sin decimal (1,000)', () => {
      expect(parsearNumero('1,000')).toBe(1000);
      expect(parsearNumero('25,000')).toBe(25000);
      expect(parsearNumero('1,000,000')).toBe(1000000);
    });

    it('debe parsear porcentajes', () => {
      expect(parsearNumero('2.45%')).toBe(2.45);
      expect(parsearNumero('15%')).toBe(15);
      expect(parsearNumero('3,8%')).toBe(3.8);
    });

    it('debe devolver 0 en valores vacíos, nulos o marcadores como -- o N/A', () => {
      expect(parsearNumero('--')).toBe(0);
      expect(parsearNumero('-')).toBe(0);
      expect(parsearNumero('N/A')).toBe(0);
      expect(parsearNumero('n/a')).toBe(0);
      expect(parsearNumero('')).toBe(0);
      expect(parsearNumero(null)).toBe(0);
      expect(parsearNumero(undefined)).toBe(0);
    });
  });

  describe('localizarFilaCabecera', () => {
    it('debe encontrar cabecera en fila 0 si los datos inician de inmediato', () => {
      const rows = [
        ['Campaña', 'Coste', 'Clics', 'Impresiones', 'Conversiones'],
        ['Campaña 1', '100', '50', '2000', '5'],
      ];
      const res = localizarFilaCabecera(rows);
      expect(res.filaCabecera).toBe(0);
      expect(res.columnas[0]).toBe('Campaña');
    });

    it('debe saltar preámbulo de Google Ads (metadatos en primeras filas)', () => {
      const rows = [
        ['Informe de rendimiento de campañas', ''],
        ['1 de enero de 2026 - 31 de enero de 2026', ''],
        ['ID de cuenta: 123-456-7890', ''],
        ['Campaña', 'Tipo de estrategia de puja', 'Impr.', 'Clics', 'Coste', 'Todas las conv.'],
        ['Ventas Search MX', 'Maximizar conversiones', '12500', '840', '4200.50', '48'],
        ['Total: Cuenta', '--', '12500', '840', '4200.50', '48'],
      ];
      const res = localizarFilaCabecera(rows);
      expect(res.filaCabecera).toBe(3);
      expect(res.columnas[0]).toBe('Campaña');
      expect(res.columnas[2]).toBe('Impr.');
    });

    it('debe lanzar ReporteAdsError si la tabla está vacía', () => {
      expect(() => localizarFilaCabecera([])).toThrow(ReporteAdsError);
    });

    it('debe lanzar ReporteAdsError si no se identifican columnas de publicidad', () => {
      const rows = [
        ['ID', 'Nombre', 'Email', 'Ciudad'],
        ['1', 'Juan', 'juan@test.com', 'CDMX'],
      ];
      expect(() => localizarFilaCabecera(rows)).toThrow(ReporteAdsError);
    });
  });

  describe('detectarFuente', () => {
    it('debe detectar Google Ads por columnas o preámbulo', () => {
      const cols = ['Campaña', 'Impr.', 'Coste', 'Clics', 'Todas las conv.'];
      expect(detectarFuente(cols, 'google_ads_export.csv')).toBe('google_ads');
    });

    it('debe detectar Meta Ads por columnas específicas', () => {
      const cols = ['Nombre de la campaña', 'Identificador de la campaña', 'Importe gastado (MXN)', 'Resultados', 'Alcance'];
      expect(detectarFuente(cols, 'facebook_ads.xlsx')).toBe('meta');
    });

    it('debe detectar TikTok Ads', () => {
      const cols = ['Campaign name', 'Cost per result', 'Cost', 'Impressions', 'Clicks'];
      expect(detectarFuente(cols, 'tiktok_campaigns.csv')).toBe('tiktok');
    });

    it('debe detectar LinkedIn Ads', () => {
      const cols = ['Campaign Name', 'Campaign Group', 'Total Spent', 'Clicks', 'Impressions'];
      expect(detectarFuente(cols, 'linkedin_report.csv')).toBe('linkedin');
    });

    it('debe recurrir a generico cuando las columnas son estándar pero sin marca específica', () => {
      const cols = ['Campaña', 'Gasto', 'Clics', 'Impresiones', 'Conversiones'];
      expect(detectarFuente(cols, 'datos_anuncios.csv')).toBe('generico');
    });
  });

  describe('mapearColumnas', () => {
    it('debe mapear correctamente columnas en español', () => {
      const cols = ['Nombre de la campaña', 'Importe gastado', 'Impresiones', 'Clics', 'Resultados', 'Valor de conversión'];
      const map = mapearColumnas(cols);
      expect(map.campana).toBe(0);
      expect(map.gasto).toBe(1);
      expect(map.impresiones).toBe(2);
      expect(map.clics).toBe(3);
      expect(map.conversiones).toBe(4);
      expect(map.ingresos).toBe(5);
    });

    it('debe lanzar error si no se encuentra columna de campaña', () => {
      const cols = ['Importe gastado', 'Impresiones', 'Clics', 'Resultados'];
      expect(() => mapearColumnas(cols)).toThrow(ReporteAdsError);
    });
  });

  describe('generarAlertasDeterministas', () => {
    it('debe alertar gasto sin conversiones cuando el gasto es relevante', () => {
      const campanas: CampanaAgregada[] = [
        {
          nombre: 'Campaña Tráfico Frío',
          gasto: 500,
          impresiones: 8000,
          clics: 200,
          conversiones: 0,
          ctr: 2.5,
          cpc: 2.5,
          cpa: 0,
        },
        {
          nombre: 'Campaña Retargeting',
          gasto: 1500,
          impresiones: 12000,
          clics: 600,
          conversiones: 30,
          ctr: 5.0,
          cpc: 2.5,
          cpa: 50,
        },
      ];
      const totales: TotalesReporteAds = {
        gasto_total: 2000,
        impresiones_total: 20000,
        clics_total: 800,
        conversiones_total: 30,
        ctr_promedio: 4.0,
        cpc_promedio: 2.5,
        cpa_promedio: 66.67,
      };

      const alertas = generarAlertasDeterministas(campanas, totales);
      const alertaSinConv = alertas.find((a) => a.tipo === 'gasto_sin_conversion');
      expect(alertaSinConv).toBeDefined();
      expect(alertaSinConv?.campana).toBe('Campaña Tráfico Frío');
    });

    it('debe alertar concentración de gasto > 60%', () => {
      const campanas: CampanaAgregada[] = [
        {
          nombre: 'Campaña Monolito',
          gasto: 8000,
          impresiones: 50000,
          clics: 2000,
          conversiones: 80,
          ctr: 4.0,
          cpc: 4.0,
          cpa: 100,
        },
        {
          nombre: 'Campaña Test 1',
          gasto: 2000,
          impresiones: 10000,
          clics: 400,
          conversiones: 15,
          ctr: 4.0,
          cpc: 5.0,
          cpa: 133.33,
        },
      ];
      const totales: TotalesReporteAds = {
        gasto_total: 10000,
        impresiones_total: 60000,
        clics_total: 2400,
        conversiones_total: 95,
        ctr_promedio: 4.0,
        cpc_promedio: 4.17,
        cpa_promedio: 105.26,
      };

      const alertas = generarAlertasDeterministas(campanas, totales);
      const alertaConcentracion = alertas.find((a) => a.tipo === 'concentracion_gasto');
      expect(alertaConcentracion).toBeDefined();
    });
  });

  describe('parsearArchivoReporte con Buffer real', () => {
    it('debe parsear y agregar un libro XLSX con totales recalculados correctamente', () => {
      // Crear libro en memoria con SheetJS
      const data = [
        ['Google Ads Reporte'],
        ['Rango: Últimos 30 días'],
        ['Campaña', 'Impr.', 'Clics', 'Coste', 'Todas las conv.', 'Valor de conversión de todas las conv.'],
        ['Search - Marca', 5000, 500, 2500, 50, 10000],
        ['Search - Genérico', 15000, 600, 3000, 20, 4000],
        ['Display Remarketing', 20000, 200, 500, 0, 0],
        ['Total: Cuenta', 40000, 1300, 6000, 70, 14000], // Debe descartarse
      ];

      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Datos');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = parsearArchivoReporte(buffer, 'google_ads.xlsx');

      expect(res.fuente).toBe('google_ads');
      expect(res.campanas.length).toBe(3); // 3 campañas (sin fila Total)
      expect(res.totales.gasto_total).toBe(6000);
      expect(res.totales.impresiones_total).toBe(40000);
      expect(res.totales.clics_total).toBe(1300);
      expect(res.totales.conversiones_total).toBe(70);
      expect(res.totales.ingresos_total).toBe(14000);

      // Verificación de recálculo matemático de KPIs
      // CTR: (1300 / 40000) * 100 = 3.25%
      expect(res.totales.ctr_promedio).toBe(3.25);
      // CPC: 6000 / 1300 = 4.62
      expect(res.totales.cpc_promedio).toBe(4.62);
      // CPA: 6000 / 70 = 85.71
      expect(res.totales.cpa_promedio).toBe(85.71);
      // ROAS: 14000 / 6000 = 2.33
      expect(res.totales.roas_promedio).toBe(2.33);

      // Alerta de fuga en Display Remarketing (500 gastado, 0 conversiones)
      const alertaFuga = res.alertas.find((a) => a.tipo === 'gasto_sin_conversion');
      expect(alertaFuga).toBeDefined();
      expect(alertaFuga?.campana).toBe('Display Remarketing');
    });

    it('debe procesar CSV con comas decimales y símbolos en español', () => {
      const csvContent =
        'Nombre de la campaña,Importe gastado,Impresiones,Clics en el enlace,Resultados\n' +
        'Campaña Black Friday,"$1.500,50",10000,450,25\n' +
        'Campaña Siempre Activa,"$3.200,00",25000,800,40\n' +
        'Total,4700.50,35000,1250,65\n';

      const buffer = Buffer.from(csvContent, 'utf-8');
      const res = parsearArchivoReporte(buffer, 'meta_report.csv');

      expect(res.fuente).toBe('meta');
      expect(res.campanas.length).toBe(2);
      expect(res.totales.gasto_total).toBe(4700.5);
      expect(res.totales.conversiones_total).toBe(65);
    });

    it('debe lanzar ReporteAdsError 400 con archivo dañado o vacío', () => {
      const buffer = Buffer.from('');
      expect(() => parsearArchivoReporte(buffer)).toThrow(ReporteAdsError);
    });
  });

  describe('mockReporteAds', () => {
    it('debe producir un resultado conforme con ReporteAdsOutputSchema', () => {
      const agregado = {
        fuente: 'meta' as const,
        totales: {
          gasto_total: 5000,
          impresiones_total: 100000,
          clics_total: 3000,
          conversiones_total: 120,
          ingresos_total: 15000,
          ctr_promedio: 3.0,
          cpc_promedio: 1.67,
          cpa_promedio: 41.67,
          roas_promedio: 3.0,
        },
        campanas: [
          {
            nombre: 'Adset Ganador',
            gasto: 3500,
            impresiones: 70000,
            clics: 2100,
            conversiones: 95,
            ingresos: 12000,
            ctr: 3.0,
            cpc: 1.67,
            cpa: 36.84,
            roas: 3.43,
          },
          {
            nombre: 'Adset Experimental',
            gasto: 1500,
            impresiones: 30000,
            clics: 900,
            conversiones: 25,
            ingresos: 3000,
            ctr: 3.0,
            cpc: 1.67,
            cpa: 60.0,
            roas: 2.0,
          },
        ],
        alertas: [],
      };

      const procesado = mockReporteAds(agregado, {
        nombre: 'Curso de Finanzas',
        categoria: 'Educación',
        precio: 99,
      });


      // Valida contra schema Zod
      const parsed = ReporteAdsOutputSchema.safeParse(procesado);
      expect(parsed.success).toBe(true);
      expect(procesado.diagnostico_ia.resumen_ejecutivo).toContain('Meta Ads');
      expect(procesado.diagnostico_ia.puntos_fuertes.length).toBeGreaterThan(0);
      expect(procesado.diagnostico_ia.recomendaciones_priorizadas.length).toBeGreaterThan(0);
    });
  });
});
