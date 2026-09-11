import {
  agruparPorProducto,
  extraerAlertas,
  extraerFinanzas,
  extraerLegal,
  extraerMercado,
  resumirNiveles,
} from '../../services/alertas/extractorAnalisis';

const PROD_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROD_B = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('extractorAnalisis — mercado', () => {
  it('normaliza { nivel, tipo, mensaje } y mapea el título por tipo', () => {
    const alertas = extraerMercado([
      {
        id: 'm1',
        producto_id: PROD_A,
        alertas: [
          { nivel: 'rojo', tipo: 'densidad', mensaje: '18 competidores en 1 km².' },
          { nivel: 'amarillo', tipo: 'viabilidad', mensaje: 'Margen por debajo del sector.' },
        ],
      },
    ]);

    expect(alertas).toHaveLength(2);
    expect(alertas[0]).toEqual({
      modulo: 'mercado',
      analisis_id: 'm1',
      producto_id: PROD_A,
      nivel: 'rojo',
      tipo: 'densidad',
      titulo: 'Competencia saturada en la zona',
      mensaje: '18 competidores en 1 km².',
      accion: null,
    });
    expect(alertas[1].titulo).toBe('Viabilidad en riesgo');
  });

  it('capitaliza tipos desconocidos y asume amarillo si el nivel es inválido', () => {
    const [alerta] = extraerMercado([
      {
        id: 'm2',
        producto_id: PROD_A,
        alertas: [{ nivel: 'naranja', tipo: 'logistica', mensaje: 'Proveedor único.' }],
      },
    ]);

    expect(alerta.nivel).toBe('amarillo');
    expect(alerta.titulo).toBe('Logistica');
  });

  it('tolera jsonb corrupto, nulo o sin mensaje sin lanzar', () => {
    expect(extraerMercado(null)).toEqual([]);
    expect(extraerMercado(undefined)).toEqual([]);
    expect(
      extraerMercado([
        { id: 'm3', producto_id: PROD_A, alertas: 'no soy un array' },
        { id: 'm4', producto_id: PROD_A, alertas: [null, 42, { nivel: 'rojo' }, { mensaje: '   ' }] },
        { id: '', producto_id: PROD_A, alertas: [{ mensaje: 'sin id' }] },
      ])
    ).toEqual([]);
  });
});

describe('extractorAnalisis — finanzas', () => {
  it('hereda el nivel de la viabilidad y usa el texto antes de ":" como título', () => {
    const alertas = extraerFinanzas([
      {
        id: 'f1',
        producto_id: PROD_A,
        resumen_data: {
          viabilidad: 'media',
          mensaje_viabilidad: 'Rentable pero ajustado.',
          alertas: ['Margen de contribución crítico: 18% (umbral mínimo recomendado: 30%).'],
        },
      },
    ]);

    expect(alertas).toHaveLength(1);
    expect(alertas[0].nivel).toBe('amarillo');
    expect(alertas[0].tipo).toBe('rentabilidad');
    expect(alertas[0].titulo).toBe('Margen de contribución crítico');
  });

  it('añade el veredicto rojo cuando la viabilidad es baja', () => {
    const alertas = extraerFinanzas([
      {
        id: 'f2',
        producto_id: PROD_A,
        resumen_data: {
          viabilidad: 'baja',
          mensaje_viabilidad: 'No alcanza el punto de equilibrio en 12 meses.',
          alertas: ['Los costos fijos son demasiado altos para el volumen proyectado.'],
        },
      },
    ]);

    expect(alertas).toHaveLength(2);
    expect(alertas[0]).toMatchObject({
      nivel: 'rojo',
      tipo: 'viabilidad',
      titulo: 'Viabilidad financiera baja',
      mensaje: 'No alcanza el punto de equilibrio en 12 meses.',
    });
    expect(alertas[1].nivel).toBe('rojo');
  });

  it('ignora análisis sin resumen_data', () => {
    expect(extraerFinanzas([{ id: 'f3', producto_id: PROD_A, resumen_data: null }])).toEqual([]);
  });
});

describe('extractorAnalisis — legal', () => {
  it('mapea titulo/descripcion/accion_recomendada', () => {
    const [alerta] = extraerLegal([
      {
        id: 'l1',
        producto_id: PROD_A,
        cumplimiento_global: 'rojo',
        resultado_data: {
          alertas: [
            {
              nivel: 'rojo',
              titulo: 'Operas sin RFC',
              descripcion: 'Facturar sin alta en el RFC genera multas.',
              accion_recomendada: 'Darse de alta en el SAT en los próximos 30 días.',
            },
          ],
        },
      },
    ]);

    expect(alerta).toEqual({
      modulo: 'legal',
      analisis_id: 'l1',
      producto_id: PROD_A,
      nivel: 'rojo',
      tipo: 'cumplimiento',
      titulo: 'Operas sin RFC',
      mensaje: 'Facturar sin alta en el RFC genera multas.',
      accion: 'Darse de alta en el SAT en los próximos 30 días.',
    });
  });

  it('cae al cumplimiento_global cuando la alerta no trae nivel válido', () => {
    const [alerta] = extraerLegal([
      {
        id: 'l2',
        producto_id: PROD_A,
        cumplimiento_global: 'rojo',
        resultado_data: { alertas: [{ titulo: 'Falta aviso de privacidad' }] },
      },
    ]);

    expect(alerta.nivel).toBe('rojo');
    // Sin descripción, el mensaje reutiliza el título en lugar de quedar vacío.
    expect(alerta.mensaje).toBe('Falta aviso de privacidad');
    expect(alerta.accion).toBeNull();
  });
});

describe('extractorAnalisis — extraerAlertas', () => {
  const entrada = {
    mercado: [
      {
        id: 'm1',
        producto_id: PROD_A,
        alertas: [
          { nivel: 'verde', tipo: 'tendencia', mensaje: 'Demanda creciente.' },
          { nivel: 'amarillo', tipo: 'densidad', mensaje: 'Zona con competencia media.' },
          { nivel: 'amarillo', tipo: 'densidad', mensaje: 'Zona con competencia media.' },
        ],
      },
      { id: 'm2', producto_id: PROD_B, alertas: [{ nivel: 'rojo', tipo: 'viabilidad', mensaje: 'Score 21/100.' }] },
    ],
    finanzas: [
      {
        id: 'f1',
        producto_id: PROD_A,
        resumen_data: { viabilidad: 'baja', mensaje_viabilidad: 'ROI negativo.', alertas: [] },
      },
    ],
    legal: [
      {
        id: 'l1',
        producto_id: PROD_A,
        cumplimiento_global: 'amarillo',
        resultado_data: {
          alertas: [{ nivel: 'rojo', titulo: 'Sin permiso sanitario', descripcion: 'Requiere COFEPRIS.' }],
        },
      },
    ],
  };

  it('ordena por gravedad y luego por módulo, y deduplica mensajes repetidos', () => {
    const alertas = extraerAlertas(entrada);

    expect(alertas.map((a) => `${a.nivel}/${a.modulo}`)).toEqual([
      'rojo/mercado',
      'rojo/finanzas',
      'rojo/legal',
      'amarillo/mercado',
      'verde/mercado',
    ]);
  });

  it('soloAccionables descarta las verdes', () => {
    const alertas = extraerAlertas({ ...entrada, soloAccionables: true });
    expect(alertas.some((a) => a.nivel === 'verde')).toBe(false);
    expect(alertas).toHaveLength(4);
  });

  it('maxPorProducto recorta por producto conservando las más graves', () => {
    const alertas = extraerAlertas({ ...entrada, maxPorProducto: 1 });

    const porProducto = agruparPorProducto(alertas);
    expect(porProducto[PROD_A]).toHaveLength(1);
    expect(porProducto[PROD_B]).toHaveLength(1);
    expect(porProducto[PROD_A][0].nivel).toBe('rojo');
  });

  it('resumirNiveles cuenta por nivel', () => {
    expect(resumirNiveles(extraerAlertas(entrada))).toEqual({
      rojo: 3,
      amarillo: 1,
      verde: 1,
      total: 5,
    });
  });

  it('devuelve [] cuando no hay ninguna fuente', () => {
    expect(extraerAlertas({})).toEqual([]);
  });
});