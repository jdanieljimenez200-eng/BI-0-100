import { normalizarTendencias } from '../../services/marketing/calendarioService';

// Función PURA (sin DB ni HTTP). El módulo solo instancia el cliente de Anthropic
// cuando existe ANTHROPIC_API_KEY, así que importarlo aquí no requiere red.
//
// `CalendarioOutputSchema` valida `tendencias` como `z.array(z.any())` para no
// romper análisis antiguos, así que TODO el saneo de forma vive aquí: lo que
// entra es la salida cruda del LLM y no hay garantía de tipos.

describe('normalizarTendencias', () => {
  it('devuelve [] si la entrada no es un array', () => {
    expect(normalizarTendencias(undefined)).toEqual([]);
    expect(normalizarTendencias(null)).toEqual([]);
    expect(normalizarTendencias({ tendencias: [] })).toEqual([]);
    expect(normalizarTendencias('TikTok')).toEqual([]);
  });

  it('descarta elementos que no son objetos utilizables', () => {
    const res = normalizarTendencias([
      null,
      'texto suelto',
      42,
      [],
      { plataforma: 'Instagram', tendencia: 'Válida' },
    ]);

    expect(res).toHaveLength(1);
    expect(res[0].tendencia).toBe('Válida');
  });

  it('descarta la tendencia sin plataforma o sin nombre: la tarjeta no diría nada', () => {
    const res = normalizarTendencias([
      { tendencia: 'Sin plataforma' },
      { plataforma: 'TikTok' },
      { plataforma: '   ', tendencia: 'Plataforma en blanco' },
      { plataforma: 'Instagram', tendencia: '   ' },
      { plataforma: 'Facebook', tendencia: 'Completa' },
    ]);

    expect(res.map((t) => t.tendencia)).toEqual(['Completa']);
  });

  it('deriva plataforma de plataformas[0] y tendencia de nombre', () => {
    const res = normalizarTendencias([
      { plataformas: ['TikTok', 'YouTube Shorts'], nombre: 'Hook de 3 segundos' },
    ]);

    expect(res[0].plataforma).toBe('TikTok');
    expect(res[0].tendencia).toBe('Hook de 3 segundos');
    // `nombre` y `tendencia` se emiten siempre iguales: el front usa `nombre ?? tendencia`.
    expect(res[0].nombre).toBe('Hook de 3 segundos');
    expect(res[0].plataformas).toEqual(['TikTok', 'YouTube Shorts']);
  });

  it('rellena plataformas con la plataforma suelta cuando el array falta o es inválido', () => {
    const res = normalizarTendencias([
      { plataforma: 'LinkedIn', tendencia: 'Autoridad de marca' },
      { plataforma: 'Facebook', tendencia: 'Grupos de nicho', plataformas: 'Facebook' },
    ]);

    expect(res[0].plataformas).toEqual(['LinkedIn']);
    expect(res[1].plataformas).toEqual(['Facebook']);
  });

  it('limpia la lista de plataformas: descarta basura, recorta espacios y tope de 4', () => {
    const res = normalizarTendencias([
      {
        tendencia: 'Multiplataforma',
        plataformas: [' Instagram ', '', null, 'TikTok', 42, 'Facebook', 'YouTube', 'LinkedIn', 'X'],
      },
    ]);

    expect(res[0].plataformas).toEqual(['Instagram', 'TikTok', 'Facebook', 'YouTube']);
    expect(res[0].plataforma).toBe('Instagram');
  });

  it('normaliza score numérico y textual, y deriva viralidad en escala 0-10', () => {
    const res = normalizarTendencias([
      { plataforma: 'TikTok', tendencia: 'Con score textual', score: '87.4' },
      { plataforma: 'Instagram', tendencia: 'Con viralidad propia', score: 60, viralidad: 9.26 },
    ]);

    expect(res[0].score).toBe(87);
    expect(res[0].viralidad).toBe(8.7);
    // Una viralidad explícita no se recalcula desde el score.
    expect(res[1].score).toBe(60);
    expect(res[1].viralidad).toBe(9.3);
  });

  it('acota score a 0-100 y viralidad a 0-10', () => {
    const res = normalizarTendencias([
      { plataforma: 'TikTok', tendencia: 'Score altísimo', score: 480, viralidad: 25 },
      { plataforma: 'Instagram', tendencia: 'Score negativo', score: -30, viralidad: -4 },
    ]);

    expect(res[0].score).toBe(100);
    expect(res[0].viralidad).toBe(10);
    expect(res[1].score).toBe(0);
    expect(res[1].viralidad).toBe(0);
  });

  it('usa 0 cuando score y viralidad no son numéricos', () => {
    const res = normalizarTendencias([
      { plataforma: 'Facebook', tendencia: 'Sin métricas', score: 'muy alto' },
    ]);

    expect(res[0].score).toBe(0);
    expect(res[0].viralidad).toBe(0);
  });

  it('resuelve ámbito a Global, Nacional y Sector, mapeando Internacional a Global', () => {
    const res = normalizarTendencias([
      { plataforma: 'TikTok', tendencia: 'A', ambito: 'Internacional' },
      { plataforma: 'TikTok', tendencia: 'B', ambito: '  INTERNACIONAL ' },
      { plataforma: 'TikTok', tendencia: 'C', ambito: 'Nacional' },
      { plataforma: 'TikTok', tendencia: 'D', ambito: 'Sector' },
      { plataforma: 'TikTok', tendencia: 'E', ambito: 'Giro' },
      { plataforma: 'TikTok', tendencia: 'F', ambito: 'Global' },
      { plataforma: 'TikTok', tendencia: 'G' },
    ]);

    const porTendencia = new Map(res.map((t) => [t.tendencia, t.ambito]));
    expect(porTendencia.get('A')).toBe('Global');
    expect(porTendencia.get('B')).toBe('Global');
    expect(porTendencia.get('C')).toBe('Nacional');
    expect(porTendencia.get('D')).toBe('Sector');
    expect(porTendencia.get('E')).toBe('Sector');
    expect(porTendencia.get('F')).toBe('Global');
    expect(porTendencia.get('G')).toBe('Global');
  });

  it('hace fallback entre descripcion y justificacion en ambos sentidos', () => {
    const res = normalizarTendencias([
      { plataforma: 'TikTok', tendencia: 'Solo descripcion', descripcion: 'Qué está pasando' },
      { plataforma: 'TikTok', tendencia: 'Solo justificacion', justificacion: 'Por qué sirve' },
      { plataforma: 'TikTok', tendencia: 'Ninguna de las dos' },
    ]);

    expect(res[0].justificacion).toBe('Qué está pasando');
    expect(res[0].descripcion).toBe('Qué está pasando');
    expect(res[1].justificacion).toBe('Por qué sirve');
    expect(res[1].descripcion).toBe('Por qué sirve');
    expect(res[2].justificacion).toBe('');
    expect(res[2].descripcion).toBe('');
  });

  it('limpia hashtags: descarta no-textos y vacíos, recorta espacios y tope de 6', () => {
    const res = normalizarTendencias([
      {
        plataforma: 'Instagram',
        tendencia: 'Con hashtags sucios',
        hashtags: [' #uno ', '', null, '#dos', 3, '#tres', '#cuatro', '#cinco', '#seis', '#siete'],
      },
      { plataforma: 'Instagram', tendencia: 'Sin hashtags', hashtags: null },
    ]);

    expect(res[0].hashtags).toEqual(['#uno', '#dos', '#tres', '#cuatro', '#cinco', '#seis']);
    expect(res[1].hashtags).toEqual([]);
  });

  it('deja en undefined los campos opcionales que no son texto válido', () => {
    const res = normalizarTendencias([
      {
        plataforma: 'TikTok',
        tendencia: 'Campos opcionales inválidos',
        gancho: '   ',
        formato: 12,
        cta: null,
        engagement: {},
        views: [],
      },
    ]);

    expect(res[0].gancho).toBeUndefined();
    expect(res[0].formato).toBeUndefined();
    expect(res[0].cta).toBeUndefined();
    expect(res[0].engagement).toBeUndefined();
    expect(res[0].views).toBeUndefined();
  });

  it('normaliza fecha a null cuando no es texto utilizable', () => {
    const res = normalizarTendencias([
      { plataforma: 'TikTok', tendencia: 'Con fecha', fecha: '2026-05-10' },
      { plataforma: 'TikTok', tendencia: 'Sin fecha' },
      { plataforma: 'TikTok', tendencia: 'Fecha numérica', fecha: 20260510 },
    ]);

    expect(res[0].fecha).toBe('2026-05-10');
    expect(res[1].fecha).toBeNull();
    expect(res[2].fecha).toBeNull();
  });

  it('recorta los textos largos a su longitud máxima', () => {
    const res = normalizarTendencias([
      {
        plataforma: 'x'.repeat(60),
        tendencia: 't'.repeat(300),
        descripcion: 'd'.repeat(900),
        gancho: 'g'.repeat(600),
        formato: 'f'.repeat(400),
        cta: 'c'.repeat(300),
        engagement: 'e'.repeat(50),
        views: 'v'.repeat(50),
      },
    ]);

    expect(res[0].plataforma).toHaveLength(40);
    expect(res[0].tendencia).toHaveLength(160);
    expect(res[0].descripcion).toHaveLength(700);
    expect(res[0].gancho).toHaveLength(400);
    expect(res[0].formato).toHaveLength(200);
    expect(res[0].cta).toHaveLength(120);
    expect(res[0].engagement).toHaveLength(20);
    expect(res[0].views).toHaveLength(20);
  });

  it('agrupa por ámbito, ordena de mayor a menor score dentro de cada uno y corta a 5 por ámbito (hasta 15 total)', () => {
    const crear = (ambito: string, scores: number[]) =>
      scores.map((score, i) => ({
        plataforma: 'Instagram',
        tendencia: `${ambito} ${i}`,
        ambito,
        score,
      }));

    const crudas = [
      ...crear('Global', [10, 90, 30, 80, 50, 70, 20]),
      ...crear('Nacional', [15, 95, 35, 85, 55, 75]),
      ...crear('Sector', [12, 92, 32, 82, 52, 72, 2]),
    ];

    const res = normalizarTendencias(crudas);

    expect(res).toHaveLength(15);
    const globales = res.filter((t) => t.ambito === 'Global');
    const nacionales = res.filter((t) => t.ambito === 'Nacional');
    const sectoriales = res.filter((t) => t.ambito === 'Sector');

    expect(globales).toHaveLength(5);
    expect(nacionales).toHaveLength(5);
    expect(sectoriales).toHaveLength(5);

    expect(globales.map((t) => t.score)).toEqual([90, 80, 70, 50, 30]);
    expect(nacionales.map((t) => t.score)).toEqual([95, 85, 75, 55, 35]);
    expect(sectoriales.map((t) => t.score)).toEqual([92, 82, 72, 52, 32]);
  });

  it('ordena tras normalizar: las tendencias sin score válido caen al final de su ámbito', () => {
    const res = normalizarTendencias([
      { plataforma: 'TikTok', tendencia: 'Sin score', ambito: 'Global' },
      { plataforma: 'TikTok', tendencia: 'Con score', score: 50, ambito: 'Global' },
    ]);

    expect(res.map((t) => t.tendencia)).toEqual(['Con score', 'Sin score']);
  });

  // ── Reparto 5/5/5 ────────────────────────────────────────────────────────

  const gen = (ambito: string, n: number, scoreBase = 50) =>
    Array.from({ length: n }, (_, i) => ({
      plataforma: 'Instagram',
      tendencia: `${ambito}-${i}`,
      ambito,
      score: scoreBase + i,
      hashtags: ['#x'],
      justificacion: 'test',
    }));

  it('reparte 5 por ámbito cuando el generador entrega 5/5/5', () => {
    const res = normalizarTendencias([...gen('Global', 5), ...gen('Nacional', 5), ...gen('Sector', 5)]);
    expect(res).toHaveLength(15);
    const cuenta = res.reduce<Record<string, number>>((a, t) => {
      a[t.ambito!] = (a[t.ambito!] ?? 0) + 1;
      return a;
    }, {});
    expect(cuenta).toEqual({ Global: 5, Nacional: 5, Sector: 5 });
  });

  it('recorta a 5 el ámbito que se pasa', () => {
    const res = normalizarTendencias([...gen('Global', 9), ...gen('Nacional', 5), ...gen('Sector', 5)]);
    const globales = res.filter((t) => t.ambito === 'Global');
    expect(globales.length).toBeGreaterThanOrEqual(5);
    expect(res.filter((t) => t.ambito === 'Nacional')).toHaveLength(5);
  });

  it('compensa el desbalance en vez de devolver menos de 15', () => {
    // 8 globales + 2 nacionales + 5 sector = 15 generadas. Cortando a 5 por
    // ámbito sin compensar quedarían 12 y se tirarían 3 globales válidas.
    const res = normalizarTendencias([...gen('Global', 8), ...gen('Nacional', 2), ...gen('Sector', 5)]);
    expect(res).toHaveLength(15);
    expect(res.filter((t) => t.ambito === 'Nacional')).toHaveLength(2);
  });

  it('no inventa tendencias cuando el generador entrega menos', () => {
    const res = normalizarTendencias([...gen('Global', 3), ...gen('Sector', 2)]);
    expect(res).toHaveLength(5);
  });

  it('sin país, un reparto de 5 Global + 5 Sector se respeta', () => {
    const res = normalizarTendencias([...gen('Global', 5), ...gen('Sector', 5)]);
    expect(res).toHaveLength(10);
    expect(res.filter((t) => t.ambito === 'Nacional')).toHaveLength(0);
  });
});
