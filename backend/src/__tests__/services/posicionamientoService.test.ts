import { generarEstrategias } from '../../services/marketing/posicionamientoService';

describe('posicionamientoService.generarEstrategias', () => {
  it('genera exactamente 4 estrategias (los 4 pilares de agencia)', () => {
    const estrategias = generarEstrategias('Tostadas', 'Alimentos y bebidas', 'producto', 250, 1000);
    expect(estrategias).toHaveLength(4);
  });

  it('los tipos son SEGUIDORES, RECONOCIMIENTO, VENTAS y VENTAS_PLUS', () => {
    const estrategias = generarEstrategias('Gadget X', 'Tecnología y gadgets', 'producto', 500, 1000);
    const tipos = estrategias.map((e) => e.tipo).sort();
    expect(tipos).toEqual(['RECONOCIMIENTO', 'SEGUIDORES', 'VENTAS', 'VENTAS_PLUS']);
  });

  it('exactamente una estrategia tiene recomendada=true (VENTAS_PLUS)', () => {
    const estrategias = generarEstrategias('Ropa Y', 'Ropa y moda', 'producto', 350, 1000);
    const recomendadas = estrategias.filter((e) => e.recomendada);
    expect(recomendadas).toHaveLength(1);
    expect(recomendadas[0].tipo).toBe('VENTAS_PLUS');
  });

  it('la estrategia recomendada tiene el mayor puntaje_fit', () => {
    const estrategias = generarEstrategias('Crema Z', 'Belleza y cuidado personal', 'producto', 400, 1000);
    const recomendada = estrategias.find((e) => e.recomendada)!;
    const maxScore = Math.max(...estrategias.map((e) => e.puntaje_fit));
    expect(recomendada.puntaje_fit).toBe(maxScore);
    expect(recomendada.puntaje_fit).toBe(98);
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
    expect(estrategias).toHaveLength(4);
    expect(estrategias.filter((e) => e.recomendada)).toHaveLength(1);
  });

  it('todas las estrategias tienen campos requeridos y VENTAS_PLUS tiene artefactos completos', () => {
    const estrategias = generarEstrategias('Pan', 'Alimentos y bebidas', 'producto', 299, 1000);
    for (const e of estrategias) {
      expect(e.tipo).toBeTruthy();
      expect(e.pilar).toBeTruthy();
      expect(e.nombre).toBeTruthy();
      expect(e.tagline).toBeTruthy();
      expect(Array.isArray(e.canales_principales)).toBe(true);
      expect(e.canales_principales.length).toBeGreaterThan(0);
      expect(e.nivel_inversion).toBeTruthy();
      expect(typeof e.puntaje_fit).toBe('number');
      expect(e.roi).toBeDefined();
      expect(e.roi.alcance).toBeTruthy();
      expect(e.roi.leads).toBeTruthy();
    }

    const ventasPlus = estrategias.find((e) => e.tipo === 'VENTAS_PLUS')!;
    expect(ventasPlus.unit_economics).toBeDefined();
    expect(ventasPlus.unit_economics?.presupuesto_simulado).toBe(1000);
    expect(ventasPlus.unit_economics?.roas_estimado).toBeGreaterThan(0);
    expect(ventasPlus.script_cierre).toBeDefined();
    expect(ventasPlus.script_cierre?.paso1_filtro.pregunta).toContain('Pan');
    expect(ventasPlus.secuencia_seguimiento).toBeDefined();
    // Una garantía que el dueño no dio no se promete: queda como hueco que él decide llenar.
    expect(ventasPlus.garantia_irresistible).toMatch(/^\[Solo si puedes cumplirla\]/);
    expect(ventasPlus.order_bump_sugerido).toBeTruthy();
  });

  it('con contexto de mercado: incorpora competencia en la narrativa de RECONOCIMIENTO cuando total_competidores >= 5', () => {
    const conCtx = generarEstrategias('X', 'Tecnología y gadgets', 'producto', 500, 1000, {
      viabilidad_score: 80,
      total_competidores: 6,
      precio_mercado_promedio: 500,
      tendencia: 'CRECIENTE',
      gap_detectado: null,
    });

    const reconoc = conCtx.find((e) => e.tipo === 'RECONOCIMIENTO')!;
    expect(reconoc.por_que).toContain('Con 6 competidores en el radar');
  });

  it('con PUV: incluye la propuesta de valor en las narrativas de por_que', () => {
    const estrategias = generarEstrategias(
      'SuperCafé',
      'Alimentos y bebidas',
      'producto',
      100,
      1000,
      undefined,
      'El único café orgánico tostado en leña de encino'
    );

    for (const e of estrategias) {
      if (e.tipo !== 'VENTAS_PLUS') {
        expect(e.por_que).toContain('El único café orgánico tostado en leña de encino');
      }
    }
  });

  it('con canalVenta: antepone los canales declarados por el usuario', () => {
    const estrategias = generarEstrategias(
      'Muebles Wood',
      'Hogar y decoración',
      'producto',
      2500,
      5000,
      undefined,
      undefined,
      'TikTok Shop, Instagram y showroom físico'
    );

    const seguidores = estrategias.find((e) => e.tipo === 'SEGUIDORES')!;
    expect(seguidores.canales_principales).toContain('TikTok Shop');
    expect(seguidores.canales_principales).toContain('showroom físico');
  });

  it('con reporte de ads con alto ROAS: cita métricas reales en las narrativas', () => {
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
        roas_promedio: 3.5,
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

    const reconoc = conAds.find((e) => e.tipo === 'RECONOCIMIENTO')!;
    expect(reconoc.por_que).toContain('Histórico en Meta Ads');
    expect(reconoc.por_que).toContain('ROAS 3.5x');
    expect(reconoc.por_que).toContain('CPA de $100');

    const ventas = conAds.find((e) => e.tipo === 'VENTAS')!;
    expect(ventas.por_que).toContain('Histórico en Meta Ads');
  });

  // ── Unit economics honesta ─────────────────────────────────────────────────

  it('una campaña que pierde dinero se reporta como no rentable', () => {
    // Ticket bajo y presupuesto alto: con cualquier supuesto razonable el
    // retorno queda por debajo de 1. Antes un `Math.max(1.2, …)` garantizaba que
    // la simulación nunca mostrara una campaña perdedora.
    const estrategias = generarEstrategias('Llavero', 'Alimentos y bebidas', 'producto', 20, 50_000);
    const ue = estrategias.find((e) => e.tipo === 'VENTAS_PLUS')!.unit_economics!;

    expect(ue.roas_estimado).toBeLessThan(1);
    expect(ue.rentable).toBe(false);
  });

  it('el CPC de respaldo es el del país, no un número fijo para toda LATAM', () => {
    // ctx, puv, canalVenta, buyerPersonas, reporteAds, canalCierre,
    // nivelTraccion, margenEstimado van sin declarar: el país es el último.
    const sinDeclarar = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const;
    const mx = generarEstrategias('Pan', 'Alimentos y bebidas', 'producto', 299, 1000, ...sinDeclarar, 'MX');
    const co = generarEstrategias('Pan', 'Alimentos y bebidas', 'producto', 299, 1000, ...sinDeclarar, 'CO');

    const cpcMx = mx.find((e) => e.tipo === 'VENTAS_PLUS')!.unit_economics!;
    const cpcCo = co.find((e) => e.tipo === 'VENTAS_PLUS')!.unit_economics!;

    expect(cpcMx.cpc_promedio).not.toBe(cpcCo.cpc_promedio);
    expect(cpcMx.origen_supuestos).toBe('benchmark');
  });
});
