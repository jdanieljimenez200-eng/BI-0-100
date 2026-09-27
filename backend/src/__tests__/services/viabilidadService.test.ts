import { calcularViabilidad, estimarMargen } from '../../services/mercado/viabilidadService';
import { CompetenciaResult, TendenciasResult, ViabilidadEstado } from '../../services/mercado/types';

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
    fuente_disponible: true,
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
    fuente_disponible: true,
    ...over,
  };
}

// Espejo de la escala de estados. Sirve para verificar que score y estado nunca
// se desincronicen entre sí en ninguno de los casos de prueba.
function estadoEsperado(score: number): ViabilidadEstado {
  if (score >= 80) return 'MUY_VIABLE';
  if (score >= 60) return 'VIABLE';
  if (score >= 40) return 'MODERADO';
  if (score >= 20) return 'POCO_VIABLE';
  return 'NO_RECOMENDADO';
}

describe('viabilidadService.estimarMargen', () => {
  it('usa el margen de la categoría cuando el precio está en línea con el mercado', () => {
    expect(estimarMargen('Ropa y accesorios', 100, 100)).toBe(45);
    expect(estimarMargen('Alimentos y bebidas', 100, 100)).toBe(30);
    expect(estimarMargen('Servicios profesionales', 100, 100)).toBe(65);
  });

  it('es insensible a mayúsculas, acentos y espacios en la categoría', () => {
    expect(estimarMargen('ROPA Y ACCESORIOS', 100, 100)).toBe(45);
    expect(estimarMargen('Electronicos', 100, 100)).toBe(20);
    expect(estimarMargen('  Electrónicos  ', 100, 100)).toBe(20);
  });

  it('categoría desconocida cae al 35% por defecto', () => {
    expect(estimarMargen('Criptomonedas para gatos', 100, 100)).toBe(35);
  });

  it('el precio premium sube el margen asumiendo que parte del sobreprecio es coste', () => {
    // Mascotas base 40% → coste anclado en 60 al precio de mercado. Al vender al
    // doble, el coste sube la mitad de lo que sube el precio → 55%, no 40+10.
    expect(estimarMargen('Mascotas', 200, 100)).toBe(55);
    expect(estimarMargen('Salud y belleza', 200, 100)).toBe(63);
    expect(estimarMargen('Educación y cursos', 200, 100)).toBe(78);
  });

  it('no hay saltos artificiales alrededor del antiguo umbral 1.3x', () => {
    expect(estimarMargen('Mascotas', 129, 100)).toBe(47);
    expect(estimarMargen('Mascotas', 130, 100)).toBe(47);
    expect(estimarMargen('Mascotas', 131, 100)).toBe(47);
  });

  it('el precio agresivo erosiona el margen de forma continua', () => {
    expect(estimarMargen('Mascotas', 70, 100)).toBe(27);
    expect(estimarMargen('Mascotas', 50, 100)).toBe(10);
  });

  it('un precio insostenible cae al piso (1%), que scoreMargen traduce a 0 puntos', () => {
    expect(estimarMargen('Electrónicos', 50, 100)).toBe(1);
    expect(estimarMargen('Automotriz', 50, 100)).toBe(1);

    const r = calcularViabilidad(tendencias(), competencia(), estimarMargen('Electrónicos', 50, 100));
    expect(r.factores.margen).toBe(0);
  });

  it('el margen está topado al 80%', () => {
    expect(estimarMargen('Educación y cursos', 10000, 100)).toBe(80);
  });

  it('el margen es monótono creciente respecto al precio de venta', () => {
    let anterior = -Infinity;
    for (const precioVenta of [20, 40, 60, 80, 100, 130, 160, 200, 400]) {
      const margen = estimarMargen('Mascotas', precioVenta, 100);
      expect(margen).toBeGreaterThanOrEqual(anterior);
      anterior = margen;
    }
  });

  it('sin precio de mercado o sin precio propio devuelve el margen de la categoría', () => {
    expect(estimarMargen('Mascotas', 5000, 0)).toBe(40);
    expect(estimarMargen('Mascotas', 0, 100)).toBe(40);
  });
});

describe('viabilidadService.calcularViabilidad — factores individuales', () => {
  it('factor tendencia sigue la escala por % de crecimiento', () => {
    const casos: [number, number][] = [
      [25, 90], [20, 90], [15, 75], [10, 75], [7, 60], [5, 60],
      [2, 40], [0, 40], [-10, 20], [-20, 20], [-21, 10], [-80, 10],
    ];
    for (const [crecimiento, esperado] of casos) {
      const r = calcularViabilidad(tendencias({ crecimiento_porcentaje: crecimiento }), competencia(), 30);
      expect(r.factores.tendencia).toBe(esperado);
    }
  });

  it('factor competencia decrece al aumentar los competidores', () => {
    const casos: [number, number][] = [
      [0, 100], [1, 100], [2, 85], [3, 85], [5, 70], [6, 70],
      [8, 55], [10, 55], [12, 40], [15, 40], [16, 20], [50, 20],
    ];
    for (const [total, esperado] of casos) {
      const r = calcularViabilidad(tendencias(), competencia({ total_competidores: total }), 30);
      expect(r.factores.competencia).toBe(esperado);
    }
  });

  it('factor margen sigue la escala por % de margen', () => {
    const casos: [number, number][] = [
      [60, 90], [40, 90], [35, 75], [30, 75], [25, 60], [20, 60],
      [15, 40], [10, 40], [7, 20], [5, 20], [4, 0], [0, 0],
    ];
    for (const [margen, esperado] of casos) {
      const r = calcularViabilidad(tendencias(), competencia(), margen);
      expect(r.factores.margen).toBe(esperado);
    }
  });

  it('factor demanda sigue la escala por volumen de búsquedas', () => {
    const casos: [number, number][] = [
      [10000, 90], [5000, 90], [3000, 75], [2000, 75], [800, 60],
      [500, 60], [200, 40], [100, 40], [99, 20], [0, 20],
    ];
    for (const [volumen, esperado] of casos) {
      const r = calcularViabilidad(tendencias({ volumen_busquedas_mensual: volumen }), competencia(), 30);
      expect(r.factores.demanda).toBe(esperado);
    }
  });

  it('un gap detectado lleva el factor oportunidad al máximo sin importar la competencia', () => {
    const r = calcularViabilidad(
      tendencias(),
      competencia({ gap_detectado: 'Nadie ofrece envío el mismo día', total_competidores: 40 }),
      30,
    );
    expect(r.factores.oportunidad).toBe(100);
  });

  it('sin gap, el factor oportunidad depende del número de competidores', () => {
    const casos: [number, number][] = [[1, 80], [2, 80], [4, 70], [5, 70], [7, 60], [8, 60], [9, 30], [30, 30]];
    for (const [total, esperado] of casos) {
      const r = calcularViabilidad(tendencias(), competencia({ total_competidores: total, gap_detectado: null }), 30);
      expect(r.factores.oportunidad).toBe(esperado);
    }
  });

  it('factor precio relativo: valores exactos en las anclas de la curva', () => {
    const casos: [number, number][] = [
      [20, 50],   // por debajo del ancla mínima (0.4x): la curva se aplana
      [40, 50],
      [70, 78],
      [90, 88],   // óptimo comercial: ligeramente por debajo del mercado
      [100, 85],
      [115, 70],
      [130, 50],
      [160, 25],
      [200, 12],
      [400, 12],  // por encima del ancla máxima (2x): la curva se aplana
    ];
    for (const [precioUsuario, esperado] of casos) {
      const r = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, precioUsuario);
      expect(r.factores.precio_relativo).toBe(esperado);
    }
  });

  it('el factor precio relativo decrece de forma monótona por encima del mercado', () => {
    let anterior = Infinity;
    for (const precio of [100, 110, 120, 130, 145, 160, 180, 200]) {
      const actual = calcularViabilidad(
        tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, precio,
      ).factores.precio_relativo;
      expect(actual).toBeLessThanOrEqual(anterior);
      anterior = actual;
    }
  });

  it('no hay acantilados: precios contiguos no cambian el factor más de 3 puntos', () => {
    let anterior = calcularViabilidad(
      tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, 60,
    ).factores.precio_relativo;

    for (let precio = 61; precio <= 200; precio++) {
      const actual = calcularViabilidad(
        tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, precio,
      ).factores.precio_relativo;
      expect(Math.abs(actual - anterior)).toBeLessThanOrEqual(3);
      anterior = actual;
    }
  });

  it('no penaliza dos veces el precio bajo: ese coste vive en el margen', () => {
    const barato = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, 70);
    const caro = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, 140);
    expect(barato.factores.precio_relativo).toBeGreaterThan(caro.factores.precio_relativo);
  });

  it('sin precio de usuario o sin precio de mercado el factor precio es neutro (50)', () => {
    const sinPrecioUsuario = calcularViabilidad(tendencias(), competencia(), 30);
    const sinPrecioMercado = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 0 }), 30, 100);
    expect(sinPrecioUsuario.factores.precio_relativo).toBe(50);
    expect(sinPrecioMercado.factores.precio_relativo).toBe(50);
  });

  it('expone los seis factores del modelo', () => {
    const r = calcularViabilidad(tendencias(), competencia(), 30, 100);
    expect(Object.keys(r.factores).sort()).toEqual(
      ['competencia', 'demanda', 'margen', 'oportunidad', 'precio_relativo', 'tendencia'],
    );
  });
});

describe('viabilidadService.calcularViabilidad — score y estado', () => {
  it('pondera los factores 25/20/15/15/15/10 (caso óptimo = 93)', () => {
    const r = calcularViabilidad(
      tendencias({ crecimiento_porcentaje: 25, volumen_busquedas_mensual: 6000 }),
      competencia({ total_competidores: 1, gap_detectado: 'Nicho sin cubrir', precio_mercado_promedio: 100 }),
      50,
      100,
    );
    // 90*.25 + 100*.20 + 90*.15 + 90*.15 + 100*.15 + 85*.10 = 93
    expect(r.score).toBe(93);
    expect(r.estado).toBe('MUY_VIABLE');
  });

  it('cuando el precio no es evaluable su peso se reparte entre los otros cinco factores', () => {
    const r = calcularViabilidad(
      tendencias({ crecimiento_porcentaje: 25, volumen_busquedas_mensual: 6000 }),
      competencia({ total_competidores: 1, gap_detectado: 'Nicho sin cubrir' }),
      50,
    );
    // 84.5 de peso 0.90 → 94. Un 50 neutro lo habría hundido a 90 por un dato
    // que el usuario nunca aportó.
    expect(r.score).toBe(94);
    expect(r.estado).toBe('MUY_VIABLE');
  });

  it('caso base equilibrado sin precio declarado da 73 → VIABLE', () => {
    const r = calcularViabilidad(tendencias(), competencia(), 30);
    expect(r.score).toBe(73);
    expect(r.estado).toBe('VIABLE');
  });

  it('caso mediocre da 43 → MODERADO', () => {
    const r = calcularViabilidad(
      tendencias({ crecimiento_porcentaje: 2, volumen_busquedas_mensual: 150 }),
      competencia({ total_competidores: 12, precio_mercado_promedio: 100 }),
      12,
      100,
    );
    expect(r.score).toBe(43);
    expect(r.estado).toBe('MODERADO');
  });

  it('caso malo da 21 → POCO_VIABLE', () => {
    const r = calcularViabilidad(
      tendencias({ crecimiento_porcentaje: -10, volumen_busquedas_mensual: 50 }),
      competencia({ total_competidores: 20, precio_mercado_promedio: 100 }),
      6,
      300,
    );
    expect(r.score).toBe(21);
    expect(r.estado).toBe('POCO_VIABLE');
  });

  it('caso peor da 16 → NO_RECOMENDADO', () => {
    const r = calcularViabilidad(
      tendencias({ crecimiento_porcentaje: -50, volumen_busquedas_mensual: 10, tendencia: 'DECRECIENTE' }),
      competencia({ total_competidores: 30, precio_mercado_promedio: 100 }),
      0,
    );
    expect(r.score).toBe(16);
    expect(r.estado).toBe('NO_RECOMENDADO');
  });

  it('el score siempre queda entre 0 y 100 y el estado nunca se desincroniza', () => {
    const escenarios = [
      calcularViabilidad(tendencias(), competencia(), 30),
      calcularViabilidad(tendencias({ crecimiento_porcentaje: 40 }), competencia({ total_competidores: 0, gap_detectado: 'gap' }), 60, 90),
      calcularViabilidad(tendencias({ crecimiento_porcentaje: -90, volumen_busquedas_mensual: 0 }), competencia({ total_competidores: 99 }), 0, 900),
      calcularViabilidad(tendencias({ crecimiento_porcentaje: 0 }), competencia({ total_competidores: 7 }), 20, 100),
      calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 0 }), 30, 0),
    ];

    for (const r of escenarios) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.estado).toBe(estadoEsperado(r.score));
    }
  });
});

describe('viabilidadService.calcularViabilidad — narrativa y confianza', () => {
  it('reporta como positivos los factores fuertes con su dato numérico', () => {
    const r = calcularViabilidad(tendencias(), competencia(), 30);
    expect(r.factores_positivos).toContain('Mercado en crecimiento (+12%)');
    expect(r.factores_positivos).toContain('Margen potencial excelente (30%)');
    expect(r.factores_positivos.some((p) => p.startsWith('Alta demanda'))).toBe(true);
  });

  it('reporta como negativos los factores débiles con su dato numérico', () => {
    const r = calcularViabilidad(
      tendencias({ crecimiento_porcentaje: -15, volumen_busquedas_mensual: 40 }),
      competencia({ total_competidores: 18 }),
      8,
    );
    expect(r.factores_negativos).toContain('Tendencia débil o decreciente (-15%)');
    expect(r.factores_negativos).toContain('Alta competencia (18 competidores)');
    expect(r.factores_negativos).toContain('Margen ajustado (8%), vigilar costos');
    expect(r.factores_negativos).toContain('Demanda baja — evaluar canales de venta alternativos');
  });

  it('un factor en zona intermedia no genera mensaje en ninguna lista', () => {
    const r = calcularViabilidad(tendencias(), competencia({ total_competidores: 5 }), 30);
    const todos = [...r.factores_positivos, ...r.factores_negativos].join(' | ');
    expect(todos).not.toContain('competidores)');
    expect(todos).not.toContain('Poca competencia directa');
  });

  it('usa el texto del gap como factor positivo cuando existe', () => {
    const r = calcularViabilidad(
      tendencias(),
      competencia({ gap_detectado: 'Ningún competidor vende por suscripción' }),
      30,
    );
    expect(r.factores_positivos).toContain('Ningún competidor vende por suscripción');
  });

  it('sin gap avisa que el mercado es genérico', () => {
    const r = calcularViabilidad(tendencias(), competencia({ total_competidores: 20 }), 30);
    expect(r.factores_negativos).toContain('Mercado genérico, requiere diferenciación clara');
  });

  it('menciona el precio competitivo cuando está en banda óptima', () => {
    const enMercado = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, 100);
    expect(enMercado.factores_positivos).toContain('Precio competitivo (0% vs mercado)');

    const algoDebajo = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, 90);
    expect(algoDebajo.factores_positivos).toContain('Precio competitivo (-10% vs mercado)');
  });

  it('advierte del sobreprecio con el porcentaje exacto', () => {
    const r = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, 200);
    expect(r.factores_negativos).toContain('Precio 100% sobre el mercado, requiere diferenciación premium');
  });

  it('advierte del infraprecio, cuya acción correctiva es la opuesta', () => {
    const r = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, 40);
    expect(r.factores_negativos).toContain(
      'Precio 60% por debajo del mercado — riesgo de percepción de baja calidad y guerra de precios',
    );
    expect(r.factores_negativos.some((n) => n.includes('sobre el mercado'))).toBe(false);
  });

  it('no inventa mensajes de precio cuando el usuario no declaró precio', () => {
    const r = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30);
    const todos = [...r.factores_positivos, ...r.factores_negativos].join(' | ');
    expect(todos).not.toContain('vs mercado');
    expect(todos).not.toContain('sobre el mercado');
    expect(todos).not.toContain('por debajo del mercado');
  });

  it('no emite mensaje de precio en la zona intermedia (fpr 57)', () => {
    const r = calcularViabilidad(tendencias(), competencia({ precio_mercado_promedio: 100 }), 30, 125);
    expect(r.factores.precio_relativo).toBe(57);
    const todos = [...r.factores_positivos, ...r.factores_negativos].join(' | ');
    expect(todos).not.toContain('Precio competitivo');
    expect(todos).not.toContain('sobre el mercado');
  });

  it('confianza alta solo si ambas fuentes son reales', () => {
    const r = calcularViabilidad(tendencias({ es_mock: false }), competencia({ es_mock: false }), 30);
    expect(r.confianza).toBe('alta');
  });

  it('confianza media si falta una de las dos fuentes', () => {
    expect(
      calcularViabilidad(tendencias({ fuente_disponible: false }), competencia(), 30).confianza
    ).toBe('media');
    expect(
      calcularViabilidad(tendencias(), competencia({ fuente_disponible: false }), 30).confianza
    ).toBe('media');
  });

  it('confianza baja si no hubo ninguna fuente', () => {
    const r = calcularViabilidad(
      tendencias({ fuente_disponible: false }),
      competencia({ fuente_disponible: false }),
      30
    );
    expect(r.confianza).toBe('baja');
  });

  it('sin competencia rastreada NO se premia como mercado libre', () => {
    // scoreCompetencia(0) valía 100: un mercado que nadie pudo rastrear salía
    // como el mejor hueco posible. Ahora ese factor simplemente no puntúa.
    const conFuente = calcularViabilidad(tendencias(), competencia({ total_competidores: 12 }), 30);
    const sinFuente = calcularViabilidad(
      tendencias(),
      competencia({ fuente_disponible: false, total_competidores: 0, precio_mercado_promedio: 0 }),
      30
    );

    expect(sinFuente.factores.competencia).toBe(0);
    expect(sinFuente.cobertura_datos).toBeLessThan(conFuente.cobertura_datos);
    expect(sinFuente.factores_negativos.join(' ')).toMatch(/[Ss]in datos de competencia/);
  });

  it('la cobertura de datos baja cuando falta una fuente', () => {
    const completo = calcularViabilidad(tendencias(), competencia(), 30);
    const sinTendencias = calcularViabilidad(tendencias({ fuente_disponible: false }), competencia(), 30);

    expect(completo.cobertura_datos).toBeGreaterThan(sinTendencias.cobertura_datos);
    expect(sinTendencias.cobertura_datos).toBeGreaterThan(0);
  });
});
describe('viabilidadService.calcularViabilidad — qué no se pudo medir', () => {
  it('nombra en factores_no_evaluados los factores sin fuente', () => {
    const r = calcularViabilidad(
      tendencias({ fuente_disponible: false }),
      competencia({ fuente_disponible: false, precio_mercado_promedio: 0 }),
      60,
      100,
    );

    // En `factores` van en 0 por compatibilidad; la lista es la que permite a la
    // pantalla escribir «sin datos» en vez de pintar un 0 que se lee como
    // «lo medimos y salió malísimo».
    expect(r.factores_no_evaluados).toEqual(
      expect.arrayContaining(['tendencia', 'competencia', 'demanda', 'oportunidad', 'precio_relativo']),
    );
    expect(r.factores_no_evaluados).not.toContain('margen');
    expect(r.cobertura_datos).toBeLessThan(1);
  });

  it('con las dos fuentes disponibles no marca ningún factor de mercado como no evaluado', () => {
    const r = calcularViabilidad(tendencias(), competencia(), 60, 100);

    expect(r.factores_no_evaluados).not.toContain('tendencia');
    expect(r.factores_no_evaluados).not.toContain('competencia');
    expect(r.factores_no_evaluados).not.toContain('demanda');
    expect(r.factores_no_evaluados).not.toContain('oportunidad');
    expect(r.cobertura_datos).toBe(1);
  });
});
