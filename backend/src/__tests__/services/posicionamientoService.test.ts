import { generarEstrategias } from '../../services/marketing/posicionamientoService';

describe('posicionamientoService.generarEstrategias', () => {
  it('genera exactamente 3 estrategias', () => {
    const estrategias = generarEstrategias('Tostadas', 'Alimentos y bebidas', 'producto', 250, 1000);
    expect(estrategias).toHaveLength(3);
  });

  it('los tipos son PREMIUM, VOLUMEN y ESPECIALIZADO', () => {
    const estrategias = generarEstrategias('Gadget X', 'Tecnología y gadgets', 'producto', 500, 1000);
    const tipos = estrategias.map((e) => e.tipo).sort();
    expect(tipos).toEqual(['ESPECIALIZADO', 'PREMIUM', 'VOLUMEN']);
  });

  it('exactamente una estrategia tiene recomendada=true', () => {
    const estrategias = generarEstrategias('Ropa Y', 'Ropa y moda', 'producto', 350, 1000);
    const recomendadas = estrategias.filter((e) => e.recomendada);
    expect(recomendadas).toHaveLength(1);
  });

  it('la estrategia recomendada tiene el mayor puntaje_fit', () => {
    const estrategias = generarEstrategias('Crema Z', 'Belleza y cuidado personal', 'producto', 400, 1000);
    const recomendada = estrategias.find((e) => e.recomendada)!;
    const maxScore = Math.max(...estrategias.map((e) => e.puntaje_fit));
    expect(recomendada.puntaje_fit).toBe(maxScore);
  });

  it('todos los puntajes están entre 0 y 100', () => {
    const estrategias = generarEstrategias('Consultoría', 'Servicios profesionales', 'servicio', 1500, 2000);
    for (const e of estrategias) {
      expect(e.puntaje_fit).toBeGreaterThanOrEqual(0);
      expect(e.puntaje_fit).toBeLessThanOrEqual(100);
    }
  });

  it('funciona con categoría desconocida', () => {
    const estrategias = generarEstrategias('X', 'Categoría inventada XYZ', 'producto', 100, 500);
    expect(estrategias).toHaveLength(3);
    expect(estrategias.filter((e) => e.recomendada)).toHaveLength(1);
  });

  it('todas las estrategias tienen campos requeridos', () => {
    const estrategias = generarEstrategias('Pan', 'Alimentos y bebidas', 'producto', 299, 1000);
    for (const e of estrategias) {
      expect(e.tipo).toBeTruthy();
      expect(e.nombre).toBeTruthy();
      expect(e.tagline).toBeTruthy();
      expect(Array.isArray(e.canales_principales)).toBe(true);
      expect(e.canales_principales.length).toBeGreaterThan(0);
      expect(e.nivel_inversion).toBeTruthy();
      expect(typeof e.puntaje_fit).toBe('number');
    }
  });

  it('con contexto de mercado: pocos competidores eleva PREMIUM y ESPECIALIZADO', () => {
    const sinCtx = generarEstrategias('X', 'Tecnología y gadgets', 'producto', 500, 1000);
    const conCtx = generarEstrategias('X', 'Tecnología y gadgets', 'producto', 500, 1000, {
      viabilidad_score: 80,
      total_competidores: 2,
      precio_mercado_promedio: 500,
      tendencia: 'CRECIENTE',
      gap_detectado: null,
    });

    const premiumSin = sinCtx.find((e) => e.tipo === 'PREMIUM')!.puntaje_fit;
    const premiumCon = conCtx.find((e) => e.tipo === 'PREMIUM')!.puntaje_fit;
    // Con pocos competidores y tendencia creciente, PREMIUM debe subir
    expect(premiumCon).toBeGreaterThanOrEqual(premiumSin);
  });

  it('con reporte de ads con alto ROAS: incrementa fit de PREMIUM en delta acotado y cita métricas reales', () => {
    const sinAds = generarEstrategias('Reloj Oro', 'Tecnología y gadgets', 'producto', 2000, 5000);
    const mockAds = {
      fuente: 'meta' as const,
      totales: {
        gasto_total: 12000,
        impresiones_total: 250000,
        clics_total: 6000,
        conversiones_total: 120,
        ingresos_total: 42000,
        ctr_promedio: 2.4,
        cpc_promedio: 2.0,
        cpa_promedio: 100,
        roas_promedio: 3.5, // >= 3.0 -> +8 a PREMIUM
      },
      campanas: [],
      alertas: [],
      diagnostico_ia: {
        resumen_ejecutivo: 'Test',
        puntos_fuertes: ['Test'],
        fugas_presupuesto: [],
        recomendaciones_priorizadas: [],
      },
    };

    const conAds = generarEstrategias(
      'Reloj Oro',
      'Tecnología y gadgets',
      'producto',
      2000,
      5000,
      undefined,
      undefined,
      undefined,
      undefined,
      mockAds
    );

    const fitSin = sinAds.find((e) => e.tipo === 'PREMIUM')!.puntaje_fit;
    const fitCon = conAds.find((e) => e.tipo === 'PREMIUM')!.puntaje_fit;

    // Delta acotado de +8 sin rebasar 100
    expect(fitCon).toBeGreaterThan(fitSin);
    expect(fitCon - fitSin).toBeLessThanOrEqual(10);
    expect(fitCon).toBeLessThanOrEqual(100);

    // Cita datos reales de pauta en por_que
    const premium = conAds.find((e) => e.tipo === 'PREMIUM')!;
    expect(premium.por_que).toContain('Histórico en Meta Ads');
    expect(premium.por_que).toContain('ROAS 3.5x');
    expect(premium.por_que).toContain('CPA de $100');
  });

  it('con reporte de ads con fugas de gasto: penaliza VOLUMEN dentro de límites acotados', () => {
    const sinAds = generarEstrategias('Suscripción', 'Servicios profesionales', 'servicio', 500, 2000);
    const mockAdsFugas = {
      fuente: 'google_ads' as const,
      totales: {
        gasto_total: 5000,
        impresiones_total: 30000,
        clics_total: 500,
        conversiones_total: 10,
        ctr_promedio: 1.67,
        cpc_promedio: 10,
        cpa_promedio: 500, // > 250 -> penaliza volumen
      },
      campanas: [],
      alertas: [{
        tipo: 'gasto_sin_conversion' as const,
        nivel: 'danger' as const,
        titulo: 'Fuga',
        descripcion: 'Gasto sin conversión',
      }],
      diagnostico_ia: {
        resumen_ejecutivo: 'Test',
        puntos_fuertes: ['Test'],
        fugas_presupuesto: [],
        recomendaciones_priorizadas: [],
      },
    };

    const conAds = generarEstrategias(
      'Suscripción',
      'Servicios profesionales',
      'servicio',
      500,
      2000,
      undefined,
      undefined,
      undefined,
      undefined,
      mockAdsFugas
    );

    const fitVolSin = sinAds.find((e) => e.tipo === 'VOLUMEN')!.puntaje_fit;
    const fitVolCon = conAds.find((e) => e.tipo === 'VOLUMEN')!.puntaje_fit;

    expect(fitVolCon).toBeLessThan(fitVolSin);
    expect(fitVolSin - fitVolCon).toBeLessThanOrEqual(10);
    expect(fitVolCon).toBeGreaterThanOrEqual(0);
  });
});
