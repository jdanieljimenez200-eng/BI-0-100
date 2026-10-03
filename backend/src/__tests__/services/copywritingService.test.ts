import type {
  CopyEstrategia,
  EstrategiaMarketing,
  TipoEstrategia,
  VozMarca,
} from '../../services/marketing/types';

// `client` se resuelve al CARGAR el módulo
// (`process.env.ANTHROPIC_API_KEY ? new Anthropic() : null`), así que la clave se
// borra ANTES del require para forzar la rama mock de `generarCopies`. Con un
// `import` estático no serviría: los imports se elevan por encima de cualquier
// sentencia. El `import type` de arriba se borra al compilar, no tiene efecto.
const KEY_ORIGINAL = process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { copyMock, generarCopies } =
  require('../../services/marketing/copywritingService') as typeof import('../../services/marketing/copywritingService');

afterAll(() => {
  if (KEY_ORIGINAL !== undefined) {
    process.env.ANTHROPIC_API_KEY = KEY_ORIGINAL;
  }
});

const VOCES: VozMarca[] = ['Profesional', 'Divertido', 'Urgente', 'Empático'];
const TIPOS: TipoEstrategia[] = ['PREMIUM', 'VOLUMEN', 'ESPECIALIZADO'];

const CAMPOS_TEXTO = [
  'headline',
  'subtitulo',
  'propuesta_valor',
  'cta',
  'copy_facebook',
  'copy_instagram',
  'copy_whatsapp',
] as const;

function estrategia(
  tipo: TipoEstrategia,
  over: Partial<EstrategiaMarketing> = {}
): EstrategiaMarketing {
  return {
    tipo,
    nombre: `Estrategia ${tipo}`,
    tagline: 'Tagline de prueba',
    descripcion: 'Descripción de la estrategia de posicionamiento',
    por_que: 'Justificación narrativa',
    precio_sugerido: 1500,
    precio_rango: { min: 1200, max: 1800 },
    margen_rango: '45%-55%',
    publico_objetivo: 'Mujeres 25-40, CDMX',
    edad_rango: '25-40',
    canales_principales: ['Instagram', 'Facebook'],
    ventaja_competitiva: 'Producción artesanal en lotes cortos',
    nivel_inversion: 'MEDIO',
    presupuesto_mensual_sugerido: 8000,
    tiempo_resultados: '2-3 meses',
    riesgo: 'MEDIO',
    puntaje_fit: 72,
    roi: { alcance: '10K-20K', leads: '80-120', descripcion: 'ROI estimado' },
    recomendada: false,
    ...over,
  };
}

describe('copywritingService.copyMock', () => {
  it('respeta el tipo de la estrategia y marca es_mock en las 12 combinaciones tipo × voz', () => {
    for (const tipo of TIPOS) {
      for (const voz of VOCES) {
        const copy = copyMock('Tostadas Doña Lupe', 'Alimentos y bebidas', estrategia(tipo), voz);
        expect(copy.tipo).toBe(tipo);
        expect(copy.es_mock).toBe(true);
      }
    }
  });

  it('no deja ningún campo de texto vacío en ninguna combinación', () => {
    for (const tipo of TIPOS) {
      for (const voz of VOCES) {
        const copy = copyMock('Gadget X', 'Tecnología y gadgets', estrategia(tipo), voz);
        for (const campo of CAMPOS_TEXTO) {
          expect(typeof copy[campo]).toBe('string');
          expect(copy[campo].trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('devuelve siempre 5 hashtags, con "#" y sin espacios', () => {
    for (const tipo of TIPOS) {
      for (const voz of VOCES) {
        const copy = copyMock('Crema Facial Z', 'Belleza y cuidado personal', estrategia(tipo), voz);
        expect(copy.hashtags).toHaveLength(5);
        for (const h of copy.hashtags) {
          expect(h.startsWith('#')).toBe(true);
          expect(h).not.toMatch(/\s/);
        }
      }
    }
  });

  it('el primer hashtag es el nombre del producto sin espacios', () => {
    for (const tipo of TIPOS) {
      const copy = copyMock('Tostadas Doña Lupe', 'Alimentos y bebidas', estrategia(tipo), 'Profesional');
      expect(copy.hashtags[0]).toBe('#TostadasDoñaLupe');
    }
  });

  it('menciona el nombre del producto en headline y en el copy de WhatsApp', () => {
    const nombre = 'Reloj Solar Z';
    for (const tipo of TIPOS) {
      for (const voz of VOCES) {
        const copy = copyMock(nombre, 'Accesorios', estrategia(tipo), voz);
        expect(copy.headline).toContain(nombre);
        expect(copy.copy_whatsapp).toContain(nombre);
      }
    }
  });

  it('el subtítulo usa la categoría en minúsculas', () => {
    const copy = copyMock('Crema Z', 'Belleza Y Cuidado Personal', estrategia('PREMIUM'), 'Profesional');
    expect(copy.subtitulo).toContain('belleza y cuidado personal');
  });

  it('PREMIUM y VOLUMEN dan un headline distinto por cada una de las 4 voces', () => {
    for (const tipo of ['PREMIUM', 'VOLUMEN'] as const) {
      const headlines = VOCES.map((voz) => copyMock('Pan Artesanal', 'Alimentos y bebidas', estrategia(tipo), voz).headline);
      expect(new Set(headlines).size).toBe(4);
    }
  });

  it('ESPECIALIZADO solo diferencia Empático y Urgente: Profesional y Divertido comparten headline', () => {
    const porVoz = new Map(
      VOCES.map((voz) => [voz, copyMock('Pan Artesanal', 'Alimentos y bebidas', estrategia('ESPECIALIZADO'), voz).headline])
    );

    expect(new Set(porVoz.values()).size).toBe(3);
    expect(porVoz.get('Profesional')).toBe(porVoz.get('Divertido'));
    expect(porVoz.get('Empático')).not.toBe(porVoz.get('Profesional'));
    expect(porVoz.get('Urgente')).not.toBe(porVoz.get('Profesional'));
  });

  it('VOLUMEN incluye el precio mínimo formateado en Facebook e Instagram, con cualquier voz', () => {
    const e = estrategia('VOLUMEN', { precio_rango: { min: 1200, max: 1800 } });
    // En la moneda del país del negocio (México por defecto), nunca «$» suelto.
    const esperado = `${(1200).toLocaleString('es-MX')} MXN`;

    for (const voz of VOCES) {
      const copy = copyMock('Gadget X', 'Tecnología y gadgets', e, voz);
      expect(copy.copy_facebook).toContain(esperado);
      expect(copy.copy_instagram).toContain(esperado);
    }
  });

  it('usa solo el primer segmento de publico_objetivo', () => {
    const e = estrategia('ESPECIALIZADO', { publico_objetivo: 'Hombres 30-45, alto ingreso, Monterrey' });
    const copy = copyMock('Reloj Z', 'Accesorios', e, 'Profesional');

    expect(copy.copy_facebook).toContain('Hombres 30-45');
    expect(copy.copy_facebook).not.toContain('Monterrey');
  });

  it('no lanza con publico_objetivo vacío ni con precio mínimo 0', () => {
    const e = estrategia('PREMIUM', { publico_objetivo: '', precio_rango: { min: 0, max: 0 } });
    let copy!: CopyEstrategia;

    expect(() => {
      copy = copyMock('Pan Artesanal', 'Alimentos y bebidas', e, 'Profesional');
    }).not.toThrow();

    // Comportamiento actual: la línea del público queda solo con el emoji.
    expect(copy.copy_facebook).toContain('🎯');
    expect(copy.copy_facebook).toContain('0 MXN');
  });
});

describe('copywritingService.generarCopies (sin ANTHROPIC_API_KEY)', () => {
  it('devuelve un mock por estrategia, en el mismo orden recibido', async () => {
    const estrategias = TIPOS.map((t) => estrategia(t));
    const copies = await generarCopies('Tostadas', 'Alimentos y bebidas', null, estrategias, 'Divertido');

    expect(copies).toHaveLength(3);
    expect(copies.map((c) => c.tipo)).toEqual(TIPOS);
    expect(copies.every((c) => c.es_mock)).toBe(true);
  });

  it('devuelve [] cuando no hay estrategias', async () => {
    await expect(generarCopies('X', 'Alimentos y bebidas', null, [])).resolves.toEqual([]);
  });

  it('usa la voz Profesional por defecto', async () => {
    const [copy] = await generarCopies('Tostadas', 'Alimentos y bebidas', null, [estrategia('PREMIUM')]);
    const esperado = copyMock('Tostadas', 'Alimentos y bebidas', estrategia('PREMIUM'), 'Profesional');

    expect(copy.headline).toBe(esperado.headline);
    expect(copy.copy_facebook).toBe(esperado.copy_facebook);
  });
});