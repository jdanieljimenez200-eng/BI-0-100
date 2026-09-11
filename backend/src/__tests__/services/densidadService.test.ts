import { calcularDensidadZona } from '../../services/mercado/densidadService';
import { CompetenciaResult, Competidor } from '../../services/mercado/types';

function competidor(over: Partial<Competidor> = {}): Competidor {
  return {
    ranking: 1,
    nombre: 'Competidor',
    url: '',
    ubicacion: 'Jalisco',
    distancia_km: null,
    precio_minimo: 90,
    precio_maximo: 110,
    precio_promedio: 100,
    rating: 4.2,
    numero_resenas: 30,
    fortalezas: [],
    debilidades: [],
    tiempo_en_mercado: '3 años',
    fuente: 'google_maps',
    ...over,
  };
}

function competencia(over: Partial<CompetenciaResult> = {}): CompetenciaResult {
  return {
    total_competidores: 10,
    competidores: [],
    gap_detectado: null,
    precio_mercado_promedio: 100,
    es_mock: false,
    ...over,
  };
}

describe('densidadService.calcularDensidadZona', () => {
  it('sin radio ni área no es evaluable y no asume un área por defecto', () => {
    const r = calcularDensidadZona(competencia(), {});
    expect(r.es_evaluable).toBe(false);
    expect(r.score).toBeNull();
    expect(r.competidores_km2).toBeNull();
    expect(r.area_km2).toBeNull();
    expect(r.interpretacion).toBe('no_evaluable');
    expect(r.confianza).toBe('baja');
  });

  it('a escala nacional exige área explícita: el radio no describe el mercado', () => {
    const conRadio = calcularDensidadZona(competencia(), { radio_km: 20, scope: 'nacional' });
    expect(conRadio.es_evaluable).toBe(false);
    expect(conRadio.mensaje).toContain('nacional');

    const conArea = calcularDensidadZona(competencia(), { area_km2: 1_000, scope: 'nacional' });
    expect(conArea.es_evaluable).toBe(true);
  });

  it('deriva el área del radio como un círculo', () => {
    const r = calcularDensidadZona(competencia({ total_competidores: 4 }), { radio_km: 3, scope: 'local' });
    expect(r.area_km2).toBe(28.27);
    expect(r.origen_area).toBe('radio');
    expect(r.es_evaluable).toBe(true);
  });

  it('un competidor por km² da 75 puntos y lectura normal', () => {
    const r = calcularDensidadZona(competencia({ total_competidores: 10 }), { area_km2: 10 });
    expect(r.competidores_km2).toBe(1);
    expect(r.score).toBe(75);
    expect(r.interpretacion).toBe('normal');
    expect(r.origen_area).toBe('area_declarada');
    expect(r.confianza).toBe('alta');
  });

  it('distingue zona virgen de zona saturada con el mismo número de competidores', () => {
    const amplia = calcularDensidadZona(competencia({ total_competidores: 8 }), { area_km2: 300 });
    const estrecha = calcularDensidadZona(competencia({ total_competidores: 8 }), { area_km2: 2 });

    expect(amplia.interpretacion).toBe('virgen');
    expect(estrecha.interpretacion).toBe('disputada');
    expect(amplia.score as number).toBeGreaterThan(estrecha.score as number);
  });

  it('el score decrece de forma monótona al aumentar la densidad', () => {
    let anterior = Infinity;
    for (const total of [1, 5, 10, 20, 40, 80, 200, 600]) {
      const actual = calcularDensidadZona(competencia({ total_competidores: total }), { area_km2: 20 }).score as number;
      expect(actual).toBeLessThanOrEqual(anterior);
      anterior = actual;
    }
  });

  it('penaliza si los competidores están encima y premia si están lejos', () => {
    const base = calcularDensidadZona(competencia({ total_competidores: 10 }), { area_km2: 10 });

    const cerca = calcularDensidadZona(
      competencia({
        total_competidores: 10,
        competidores: [competidor({ distancia_km: 0.5 }), competidor({ distancia_km: 1 })],
      }),
      { area_km2: 10 },
    );

    const lejos = calcularDensidadZona(
      competencia({
        total_competidores: 10,
        competidores: [competidor({ distancia_km: 6 }), competidor({ distancia_km: 8 })],
      }),
      { area_km2: 10 },
    );

    expect(base.score).toBe(75);
    expect(cerca.score).toBe(70);
    expect(cerca.distancia_media_km).toBe(0.75);
    expect(lejos.score).toBe(80);
    expect(lejos.distancia_media_km).toBe(7);
  });

  it('el score siempre queda entre 0 y 100 y es entero', () => {
    const casos = [
      calcularDensidadZona(competencia({ total_competidores: 0 }), { area_km2: 0.01 }),
      calcularDensidadZona(competencia({ total_competidores: 5000 }), { radio_km: 0.1, scope: 'local' }),
      calcularDensidadZona(competencia({ total_competidores: 1 }), { area_km2: 25_000_000 }),
    ];
    for (const r of casos) {
      expect(r.score).not.toBeNull();
      expect(r.score as number).toBeGreaterThanOrEqual(0);
      expect(r.score as number).toBeLessThanOrEqual(100);
      expect(Number.isInteger(r.score as number)).toBe(true);
    }
  });

  it('un conteo de competidores estimado arrastra la confianza a baja', () => {
    const r = calcularDensidadZona(competencia({ es_mock: true }), { area_km2: 10 });
    expect(r.es_evaluable).toBe(true);
    expect(r.confianza).toBe('baja');
  });

  it('el área derivada del radio no puede dar confianza alta', () => {
    const r = calcularDensidadZona(competencia({ es_mock: false }), { radio_km: 5, scope: 'local' });
    expect(r.confianza).toBe('media');
  });

  it('el mensaje incluye las cifras que lo sustentan', () => {
    const r = calcularDensidadZona(competencia({ total_competidores: 10 }), { area_km2: 10 });
    expect(r.mensaje).toContain('10 competidores');
    expect(r.mensaje).toContain('10 km²');
  });
});