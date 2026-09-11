import {
  fusionarCompetenciaOficial,
  mismoNegocio,
  normalizarNombreComercial,
} from '../../services/estadisticas/fusionOficialService';
import type { CompetenciaResult, Competidor } from '../../services/mercado/types';
import type { CensoOficialResult, EstablecimientoOficial } from '../../services/estadisticas/types';

function competidor(over: Partial<Competidor> = {}): Competidor {
  return {
    ranking: 1,
    nombre: 'Pizzería Don Luigi',
    url: 'https://example.com/donluigi',
    ubicacion: 'Local',
    distancia_km: null,
    precio_minimo: 90,
    precio_maximo: 110,
    precio_promedio: 100,
    rating: 4.5,
    numero_resenas: 120,
    fortalezas: ['Presencia en Google Maps'],
    debilidades: [],
    tiempo_en_mercado: 'Desconocido',
    fuente: 'google_maps',
    ...over,
  };
}

function competencia(over: Partial<CompetenciaResult> = {}): CompetenciaResult {
  const competidores = over.competidores ?? [competidor()];
  return {
    total_competidores: competidores.length,
    competidores,
    gap_detectado: null,
    precio_mercado_promedio: 100,
    es_mock: false,
    ...over,
  };
}

function establecimiento(over: Partial<EstablecimientoOficial> = {}): EstablecimientoOficial {
  return {
    nombre: 'PIZZERIA DON LUIGI SA DE CV',
    razon_social: 'DON LUIGI SA DE CV',
    clase_actividad: 'Restaurantes con servicio de preparación de pizzas',
    estrato_personal: '6 a 10 personas',
    cp: '44100',
    ubicacion: 'Av. Juárez 100, Guadalajara',
    telefono: null,
    sitio_web: null,
    latitud: 20.67,
    longitud: -103.35,
    distancia_km: 1.2,
    antiguedad: '2015-11',
    ...over,
  };
}

function censo(over: Partial<CensoOficialResult> = {}): CensoOficialResult {
  const establecimientos = over.establecimientos ?? [establecimiento()];
  return {
    disponible: true,
    fuente: 'denue_inegi',
    instituto: 'INEGI',
    pais: 'MX',
    cobertura: 'radio',
    total_establecimientos: establecimientos.length,
    radio_m: 3000,
    establecimientos,
    distribucion_estrato: { '6 a 10 personas': 1 },
    nota: 'Censo DENUE.',
    consultado_en: new Date().toISOString(),
    ...over,
  };
}

describe('normalizarNombreComercial', () => {
  it('quita acentos, puntuación y sufijos legales', () => {
    expect(normalizarNombreComercial('Pizzería Don Luigi, S.A. de C.V.')).toBe('pizzeria don luigi');
  });
});

describe('mismoNegocio', () => {
  it('empareja el mismo negocio escrito en dos fuentes distintas', () => {
    expect(mismoNegocio('Pizzería Don Luigi', 'PIZZERIA DON LUIGI SA DE CV')).toBe(true);
  });

  it('no empareja negocios distintos', () => {
    expect(mismoNegocio('Pizzería Don Luigi', 'Tacos El Güero')).toBe(false);
  });

  it('no empareja por nombres demasiado cortos', () => {
    expect(mismoNegocio('Sol', 'Solaris Pizza')).toBe(false);
  });
});

describe('fusionarCompetenciaOficial', () => {
  it('devuelve la competencia intacta cuando no hubo consulta oficial', () => {
    const base = competencia();
    expect(fusionarCompetenciaOficial(base, null)).toBe(base);
  });

  it('adjunta el censo aunque no esté disponible, sin tocar el conteo web', () => {
    const base = competencia();
    const sinFuente = censo({
      disponible: false,
      total_establecimientos: null,
      establecimientos: [],
    });
    const out = fusionarCompetenciaOficial(base, sinFuente);

    expect(out.total_competidores).toBe(1);
    expect(out.total_competidores_web).toBeUndefined();
    expect(out.censo_oficial?.disponible).toBe(false);
  });

  it('el censo oficial desplaza al conteo web y lo preserva', () => {
    const establecimientos = Array.from({ length: 40 }, (_, i) =>
      establecimiento({ nombre: `NEGOCIO ${i}`, razon_social: null }),
    );
    const out = fusionarCompetenciaOficial(competencia(), censo({ establecimientos }));

    expect(out.total_competidores).toBe(40);
    expect(out.total_competidores_web).toBe(1);
  });

  it('NO inyecta establecimientos oficiales en el array de competidores', () => {
    const establecimientos = Array.from({ length: 40 }, (_, i) =>
      establecimiento({ nombre: `NEGOCIO ${i}`, razon_social: null }),
    );
    const out = fusionarCompetenciaOficial(competencia(), censo({ establecimientos }));

    // Precio y rating siguen viniendo solo de la muestra web.
    expect(out.competidores).toHaveLength(1);
    expect(out.precio_mercado_promedio).toBe(100);
    expect(out.competidores.every((c) => c.precio_promedio > 0)).toBe(true);
  });

  it('completa la antigüedad desconocida con la fecha de alta oficial', () => {
    const out = fusionarCompetenciaOficial(competencia(), censo());

    expect(out.competidores[0].tiempo_en_mercado).toBe('Registrado oficialmente desde 2015-11');
    expect(out.competidores[0].fortalezas).toContain('Registro oficial vigente (6 a 10 personas)');
    expect(out.competidores[0].distancia_km).toBe(1.2);
  });

  it('no sobreescribe una antigüedad ya conocida', () => {
    const base = competencia({ competidores: [competidor({ tiempo_en_mercado: '8 años' })] });
    const out = fusionarCompetenciaOficial(base, censo());

    expect(out.competidores[0].tiempo_en_mercado).toBe('8 años');
  });

  it('advierte cuando la muestra web es muy inferior al censo', () => {
    const establecimientos = Array.from({ length: 40 }, (_, i) =>
      establecimiento({ nombre: `NEGOCIO ${i}`, razon_social: null }),
    );
    const out = fusionarCompetenciaOficial(competencia(), censo({ establecimientos }));

    expect(out.advertencia_muestra).toContain('40 establecimientos');
  });

  it('distingue "sin presencia digital" de "mercado vacío"', () => {
    const base = competencia({ competidores: [], total_competidores: 0, precio_mercado_promedio: 0 });
    const out = fusionarCompetenciaOficial(base, censo());

    expect(out.total_competidores).toBe(1);
    expect(out.advertencia_muestra).toContain('sin presencia digital');
  });

  it('no advierte cuando muestra y censo son consistentes', () => {
    const base = competencia({
      competidores: [competidor(), competidor({ ranking: 2, nombre: 'Otra Pizza' })],
      total_competidores: 2,
    });
    const out = fusionarCompetenciaOficial(base, censo({
      establecimientos: [establecimiento(), establecimiento({ nombre: 'OTRA PIZZA', razon_social: null })],
    }));

    expect(out.advertencia_muestra).toBeUndefined();
    expect(out.total_competidores).toBe(2);
  });
});