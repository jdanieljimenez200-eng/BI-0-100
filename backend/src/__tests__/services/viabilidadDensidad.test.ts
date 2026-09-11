import { calcularViabilidad } from '../../services/mercado/viabilidadService';
import {
  CompetenciaResult,
  DensidadZonaResult,
  TendenciasResult,
} from '../../services/mercado/types';

function tendencias(over: Partial<TendenciasResult> = {}): TendenciasResult {
  return {
    palabra_clave: 'tostadas artesanales',
    ubicacion: 'Jalisco, México',
    volumen_busquedas_mensual: 2500,
    datos_12_meses: [],
    proyeccion_6_meses: [],
    crecimiento_porcentaje: 12,
    crecimiento_descripcion: 'Crecimiento sostenido',
    picos_estacionales: {},
    tendencia: 'CRECIENTE',
    es_mock: false,
    ...over,
  };
}

function competencia(over: Partial<CompetenciaResult> = {}): CompetenciaResult {
  return {
    total_competidores: 4,
    competidores: [],
    gap_detectado: null,
    precio_mercado_promedio: 100,
    es_mock: false,
    ...over,
  };
}

function densidad(over: Partial<DensidadZonaResult> = {}): DensidadZonaResult {
  return {
    es_evaluable: true,
    score: 75,
    competidores_km2: 1,
    area_km2: 10,
    origen_area: 'area_declarada',
    distancia_media_km: null,
    interpretacion: 'normal',
    mensaje: '10 competidores en 10 km² (1 por km²)',
    confianza: 'alta',
    ...over,
  };
}

/** Caso óptimo de la suite base: score 93 sin densidad. */
function optimo(dens?: DensidadZonaResult | null) {
  return calcularViabilidad(
    tendencias({ crecimiento_porcentaje: 25, volumen_busquedas_mensual: 6000 }),
    competencia({ total_competidores: 1, gap_detectado: 'Nicho sin cubrir', precio_mercado_promedio: 100 }),
    50,
    100,
    dens,
  );
}

describe('calcularViabilidad — densidad de zona', () => {
  it('sin densidad el score y los factores no cambian respecto al modelo de seis factores', () => {
    expect(optimo().score).toBe(93);
    expect(optimo(null).score).toBe(93);
    expect(optimo(undefined).score).toBe(93);
    expect(Object.keys(optimo().factores).sort()).toEqual(
      ['competencia', 'demanda', 'margen', 'oportunidad', 'precio_relativo', 'tendencia'],
    );
  });

  it('una densidad no evaluable no entra en el score ni aparece como factor', () => {
    const r = optimo(densidad({ es_evaluable: false, score: null, competidores_km2: null, interpretacion: 'no_evaluable' }));
    expect(r.score).toBe(93);
    expect(r.factores.densidad).toBeUndefined();
  });

  it('una zona saturada baja el score con peso 0.10 renormalizado', () => {
    // (93 + 20×0.10) / 1.10 = 86.36 → 86
    const r = optimo(densidad({ score: 20, competidores_km2: 9, interpretacion: 'saturada', confianza: 'alta' }));
    expect(r.score).toBe(86);
    expect(r.factores.densidad).toBe(20);
    expect(r.estado).toBe('MUY_VIABLE');
  });

  it('una zona con hueco geográfico se reporta como factor positivo', () => {
    const r = optimo(densidad({ score: 90, competidores_km2: 0.15, interpretacion: 'virgen' }));
    expect(r.factores_positivos).toContain('Zona con hueco geográfico (0.15 competidores/km²)');
  });

  it('una zona saturada se reporta como negativo, apuntando a la ubicación', () => {
    const r = optimo(densidad({ score: 28, competidores_km2: 8, interpretacion: 'saturada' }));
    expect(r.factores_negativos).toContain(
      'Zona saturada (8 competidores/km²) — la ubicación exacta pesa más que el producto',
    );
  });

  it('la zona intermedia no genera mensaje de densidad', () => {
    const r = optimo(densidad({ score: 62, competidores_km2: 2, interpretacion: 'normal' }));
    const todos = [...r.factores_positivos, ...r.factores_negativos].join(' | ');
    expect(todos).not.toContain('competidores/km²');
  });

  it('la confianza de la densidad limita la confianza global solo si entró en el score', () => {
    const conDensidadDebil = optimo(densidad({ confianza: 'baja' }));
    expect(conDensidadDebil.confianza).toBe('baja');

    const noEvaluableDebil = optimo(densidad({ es_evaluable: false, score: null, confianza: 'baja' }));
    expect(noEvaluableDebil.confianza).toBe('alta');
  });

  it('el score sigue acotado y sincronizado con el estado en los extremos', () => {
    const peor = calcularViabilidad(
      tendencias({ crecimiento_porcentaje: -50, volumen_busquedas_mensual: 10, tendencia: 'DECRECIENTE' }),
      competencia({ total_competidores: 30 }),
      0,
      undefined,
      densidad({ score: 0, competidores_km2: 40, interpretacion: 'saturada' }),
    );
    expect(peor.score).toBeGreaterThanOrEqual(0);
    expect(peor.score).toBeLessThan(20);
    expect(peor.estado).toBe('NO_RECOMENDADO');

    const mejor = calcularViabilidad(
      tendencias({ crecimiento_porcentaje: 40, volumen_busquedas_mensual: 20_000 }),
      competencia({ total_competidores: 0, gap_detectado: 'gap' }),
      60,
      90,
      densidad({ score: 100, competidores_km2: 0, interpretacion: 'virgen' }),
    );
    expect(mejor.score).toBeLessThanOrEqual(100);
    expect(mejor.estado).toBe('MUY_VIABLE');
  });
});