import { describirFuenteCompetencia } from '../../services/mercado/reporteBiService';

type CompetenciaLike = {
  es_mock: boolean;
  competidores: { fuente?: string }[];
};

describe('reporteBiService.describirFuenteCompetencia', () => {
  it('devuelve estimacion_interna cuando la competencia es mock', () => {
    const competencia: CompetenciaLike = {
      es_mock: true,
      competidores: [{ fuente: 'mercadolibre' }],
    };
    expect(describirFuenteCompetencia(competencia)).toBe('estimacion_interna');
  });

  it('devuelve estimacion_interna cuando no hay competidores', () => {
    expect(describirFuenteCompetencia({ es_mock: false, competidores: [] })).toBe(
      'estimacion_interna',
    );
  });

  it('devuelve estimacion_interna cuando ningún competidor trae fuente', () => {
    const competencia: CompetenciaLike = {
      es_mock: false,
      competidores: [{}, { fuente: '' }],
    };
    expect(describirFuenteCompetencia(competencia)).toBe('estimacion_interna');
  });

  it('traduce cada fuente conocida a su etiqueta verificada', () => {
    const casos: [string, string][] = [
      ['mercadolibre', 'MercadoLibre_verificado'],
      ['google_shopping', 'Google_Shopping_verificado'],
      ['google_maps', 'Google_Maps_verificado'],
      ['benchmark_sector', 'estimacion_interna'],
      ['mock', 'estimacion_interna'],
    ];

    for (const [fuente, esperado] of casos) {
      expect(
        describirFuenteCompetencia({ es_mock: false, competidores: [{ fuente }] }),
      ).toBe(esperado);
    }
  });

  it('deduplica fuentes repetidas', () => {
    const competencia: CompetenciaLike = {
      es_mock: false,
      competidores: [
        { fuente: 'mercadolibre' },
        { fuente: 'mercadolibre' },
        { fuente: 'mercadolibre' },
      ],
    };
    expect(describirFuenteCompetencia(competencia)).toBe('MercadoLibre_verificado');
  });

  it('combina múltiples fuentes con + respetando el orden de aparición', () => {
    const competencia: CompetenciaLike = {
      es_mock: false,
      competidores: [
        { fuente: 'mercadolibre' },
        { fuente: 'google_maps' },
        { fuente: 'mercadolibre' },
      ],
    };
    expect(describirFuenteCompetencia(competencia)).toBe(
      'MercadoLibre_verificado+Google_Maps_verificado',
    );
  });

  it('para una fuente no mapeada añade el sufijo _verificado', () => {
    const competencia: CompetenciaLike = {
      es_mock: false,
      competidores: [{ fuente: 'amazon' }],
    };
    expect(describirFuenteCompetencia(competencia)).toBe('amazon_verificado');
  });

  it('ignora competidores sin fuente al construir la atribución', () => {
    const competencia: CompetenciaLike = {
      es_mock: false,
      competidores: [{}, { fuente: 'google_shopping' }, { fuente: undefined }],
    };
    expect(describirFuenteCompetencia(competencia)).toBe('Google_Shopping_verificado');
  });

  it('no falla si competidores llega como undefined', () => {
    const competencia = { es_mock: false } as unknown as CompetenciaLike;
    expect(describirFuenteCompetencia(competencia)).toBe('estimacion_interna');
  });

  it('nunca marca benchmark_sector como verificado, ni mezclado con fuentes reales', () => {
    const competencia: CompetenciaLike = {
      es_mock: false,
      competidores: [{ fuente: 'benchmark_sector' }, { fuente: 'google_maps' }],
    };
    const etiqueta = describirFuenteCompetencia(competencia);
    expect(etiqueta).toBe('estimacion_interna+Google_Maps_verificado');
    expect(etiqueta).not.toContain('benchmark_sector_verificado');
  });
});