import {
  alinearConPlataformasActivas,
} from '../../services/marketing/calendarioService';
import {
  CalendarioSemanalMarketing,
  DiaCalendario,
  PublicacionDiaria,
  SemanaCalendario,
  TendenciaSocial,
  TipoEstrategia,
} from '../../services/marketing/types';

// Función PURA (sin DB ni HTTP). El módulo solo instancia el cliente de Anthropic
// cuando existe ANTHROPIC_API_KEY, así que importarlo aquí no requiere red.

function publicacion(plataforma: string): PublicacionDiaria {
  return {
    hora: '19:00',
    plataforma,
    tipo_contenido: 'Reel',
    idea: `Idea para ${plataforma}`,
    copy: 'Copy de prueba',
    hashtags: ['#test'],
    prompt_visual: 'Foto de producto sobre fondo claro',
  };
}

function dia(plataformas: string[]): DiaCalendario {
  return {
    dia: 'lunes',
    publicaciones: plataformas.map(publicacion),
    sugerencia_engagement: 'Comentar en cuentas del nicho',
  };
}

function tendencia(
  plataforma: string,
  score: number,
  extra: Partial<TendenciaSocial> = {}
): TendenciaSocial {
  return {
    plataforma,
    tendencia: `Tendencia de ${plataforma} (${score})`,
    score,
    hashtags: ['#trend'],
    justificacion: 'Aplica al producto',
    ...extra,
  };
}

function calendario(
  tendencias: TendenciaSocial[],
  semanas: SemanaCalendario[] = []
): CalendarioSemanalMarketing {
  return {
    estrategia_tipo: 'PREMIUM' as TipoEstrategia,
    tendencias,
    semanas,
  };
}

describe('alinearConPlataformasActivas', () => {
  it('devuelve el calendario intacto si no hay plataformas activas', () => {
    const cal = calendario([tendencia('TikTok', 90)], [{ numero: 1, dias: [dia(['TikTok'])] }]);

    const res = alinearConPlataformasActivas(cal, []);

    expect(res).toBe(cal);
    expect(res.recomendacion_plataforma).toBeUndefined();
  });

  it('descarta publicaciones de plataformas no activas y conserva las activas', () => {
    const cal = calendario(
      [tendencia('Instagram', 80)],
      [{ numero: 1, dias: [dia(['Instagram', 'LinkedIn', 'TikTok'])] }]
    );

    const res = alinearConPlataformasActivas(cal, ['Instagram', 'Facebook']);

    const plataformas = res.semanas[0].dias[0].publicaciones.map((p) => p.plataforma);
    expect(plataformas).toEqual(['Instagram']);
  });

  it('no vacía el calendario por completo: si ninguna publicación encaja, lo deja como estaba', () => {
    const original = [{ numero: 1 as const, dias: [dia(['Instagram', 'Facebook'])] }];
    const cal = calendario([tendencia('LinkedIn', 70)], original);

    const res = alinearConPlataformasActivas(cal, ['LinkedIn']);

    expect(res.semanas[0].dias[0].publicaciones).toHaveLength(2);
  });

  it('reconoce alias y variantes de la misma red (Instagram Reels, IG, YouTube Shorts)', () => {
    const cal = calendario(
      [
        tendencia('Instagram Reels', 88, { plataformas: ['Instagram Reels'] }),
        tendencia('YouTube Shorts', 75, { plataformas: ['YouTube Shorts'] }),
      ],
      [{ numero: 1, dias: [dia(['IG', 'Instagram Reels', 'YouTube Shorts'])] }]
    );

    const res = alinearConPlataformasActivas(cal, ['Instagram', 'YouTube']);

    expect(res.tendencias).toHaveLength(2);
    expect(res.recomendacion_plataforma).toEqual([]);
    expect(res.semanas[0].dias[0].publicaciones).toHaveLength(3);
  });

  it('mantiene ejecutable la tendencia que toca al menos una plataforma activa', () => {
    const cal = calendario([
      tendencia('TikTok', 92, { plataformas: ['TikTok', 'Instagram'] }),
    ]);

    const res = alinearConPlataformasActivas(cal, ['Instagram']);

    expect(res.tendencias).toHaveLength(1);
    expect(res.recomendacion_plataforma).toEqual([]);
  });

  it('reubica en recomendacion_plataforma las tendencias que solo viven en redes ajenas', () => {
    const cal = calendario([
      tendencia('Instagram', 90),
      tendencia('TikTok', 85),
      tendencia('TikTok', 70),
      tendencia('LinkedIn', 60),
    ]);

    const res = alinearConPlataformasActivas(cal, ['Instagram']);

    expect(res.tendencias.map((t) => t.plataforma)).toEqual(['Instagram']);

    const rec = res.recomendacion_plataforma ?? [];
    // Ordenadas por el score de su tendencia más fuerte: TikTok (85) antes de LinkedIn (60).
    expect(rec.map((r) => r.plataforma)).toEqual(['TikTok', 'LinkedIn']);
    expect(rec[0].score).toBe(85);
    expect(rec[0].tendencias.map((t) => t.score)).toEqual([85, 70]);
    expect(rec[0].motivo).toContain('TikTok');
    expect(rec[1].tendencias).toHaveLength(1);
  });

  it('no pierde la tendencia cuyas plataformas ajenas son varias: aparece en cada una', () => {
    const cal = calendario([
      tendencia('TikTok', 80, { plataformas: ['TikTok', 'LinkedIn'] }),
    ]);

    const res = alinearConPlataformasActivas(cal, ['Facebook']);

    const rec = res.recomendacion_plataforma ?? [];
    expect(rec).toHaveLength(2);
    expect(rec.every((r) => r.tendencias.length === 1)).toBe(true);
    expect(res.tendencias).toEqual([]);
  });

  it('deja visible la tendencia sin plataforma legible en lugar de descartarla', () => {
    const cal = calendario([
      { plataforma: '', tendencia: 'Sin red', score: 50, hashtags: [], justificacion: '' },
    ]);

    const res = alinearConPlataformasActivas(cal, ['Instagram']);

    expect(res.tendencias).toHaveLength(1);
    expect(res.recomendacion_plataforma).toEqual([]);
  });

  it('tolera semanas y publicaciones ausentes o mal formadas', () => {
    const cal = {
      estrategia_tipo: 'PREMIUM' as TipoEstrategia,
      tendencias: [tendencia('TikTok', 65)],
      semanas: undefined as unknown as SemanaCalendario[],
    } as CalendarioSemanalMarketing;

    expect(() => alinearConPlataformasActivas(cal, ['Instagram'])).not.toThrow();
    const res = alinearConPlataformasActivas(cal, ['Instagram']);
    expect(res.semanas).toEqual([]);
    expect(res.recomendacion_plataforma).toHaveLength(1);
  });

  it('limita las recomendaciones de plataforma ajena a un máximo de 4', () => {
    const cal = calendario([
      tendencia('TikTok', 90),
      tendencia('LinkedIn', 85),
      tendencia('YouTube', 80),
      tendencia('Pinterest', 75),
      tendencia('Twitter', 70),
      tendencia('Reddit', 65),
    ]);

    const res = alinearConPlataformasActivas(cal, ['Facebook']);
    expect(res.recomendacion_plataforma).toHaveLength(4);
    expect(res.recomendacion_plataforma?.map((r) => r.plataforma)).toEqual([
      'TikTok',
      'LinkedIn',
      'YouTube',
      'Pinterest',
    ]);
  });
});