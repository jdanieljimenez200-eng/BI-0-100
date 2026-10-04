import { crearMensaje, hayClaveAnthropic } from '../../config/anthropic';
import { AppDataSource } from '../../config/database';
import { conSeguimientoIA } from '../../utils/seguimientoIA';
import { estatusEfectivo, normalizarEstatus } from '../../utils/estatusProyecto';
import { tipoActividadDe } from '../../services/mercado/tipoActividad';
import {
  calcularPayback,
  construirPromptReporteBi,
  generarReporteBi,
  reporteBiMock,
} from '../../services/mercado/reporteBiService';
import {
  CONTRATO_MERCADO,
  construirMetaIaMercado,
  transparenciaBaseMercado,
  type DatosTransparenciaMercado,
} from '../../services/mercado/transparenciaMercado';
import { probarCasoMercado } from '../../services/mercado/pruebaMercado';
import { CASOS_MERCADO } from '../../services/ia/casosPruebaMercado';
import { _reiniciarCachePrompts, resolverPrompt } from '../../services/ia/registroPrompts';
import { PRECEDENCIA } from '../../services/ia/componerSistema';
import { MERCADO_MODO } from '../../services/ia/prompts/mercado.modo';
import { clavesDeModulo } from '../../services/ia/prompts';
import { seccionesOcultables } from '../../services/ia/seccionesCatalogo';
import type {
  CompetenciaResult,
  MercadoAnalisisInput,
  ProductoContextoMercado,
  TendenciasResult,
  ViabilidadResult,
} from '../../services/mercado/types';

jest.mock('../../config/anthropic', () => {
  const actual = jest.requireActual('../../config/anthropic');
  return { ...actual, crearMensaje: jest.fn(), hayClaveAnthropic: jest.fn(() => false) };
});

// Sin base: el registro sirve el texto del repositorio salvo que el test
// devuelva una versión publicada o anclada.
jest.mock('../../config/database', () => {
  const repo = { findOne: jest.fn(), findOneBy: jest.fn() };
  return { AppDataSource: { isInitialized: true, getRepository: () => repo, __repo: repo } };
});

const repo = (AppDataSource as unknown as { __repo: { findOne: jest.Mock; findOneBy: jest.Mock } }).__repo;
const mockCrear = crearMensaje as jest.Mock;
const mockClave = hayClaveAnthropic as jest.Mock;

const responder = (salida: object) =>
  mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(salida) }], stop_reason: 'end_turn' });

beforeEach(() => {
  _reiniciarCachePrompts();
  mockCrear.mockReset();
  mockClave.mockReturnValue(false);
  repo.findOne.mockReset().mockResolvedValue(null);
  repo.findOneBy.mockReset().mockResolvedValue(null);
});

// ─── Datos de apoyo ─────────────────────────────────────────────────────────

function tendencias(over: Partial<TendenciasResult> = {}): TendenciasResult {
  return {
    palabra_clave: 'ropa deportiva',
    ubicacion: 'Colombia',
    volumen_busquedas_mensual: 22000,
    datos_12_meses: [],
    proyeccion_6_meses: [],
    crecimiento_porcentaje: -6,
    crecimiento_descripcion: 'A la baja',
    picos_estacionales: {},
    tendencia: 'DECRECIENTE',
    es_mock: false,
    fuente_disponible: true,
    ...over,
  };
}

function competencia(over: Partial<CompetenciaResult> = {}): CompetenciaResult {
  return {
    total_competidores: 9,
    competidores: [],
    gap_detectado: 'Nadie vende tallas grandes',
    precio_mercado_promedio: 80000,
    es_mock: false,
    fuente_disponible: true,
    ...over,
  };
}

function viabilidad(over: Partial<ViabilidadResult> = {}): ViabilidadResult {
  return {
    score: 47,
    estado: 'MODERADO',
    factores: { tendencia: 30, competencia: 40, margen: 60, demanda: 70, oportunidad: 80, precio_relativo: 50 },
    factores_positivos: ['Hueco detectado: tallas grandes'],
    factores_negativos: ['Demanda a la baja (-6%)', 'Competencia media (9)'],
    confianza: 'media',
    cobertura_datos: 0.8,
    factores_no_evaluados: ['densidad'],
    ...over,
  } as ViabilidadResult;
}

const input = (over: Partial<MercadoAnalisisInput> = {}): MercadoAnalisisInput => ({
  productoId: 'p',
  usuarioId: 'u',
  pais: 'CO',
  scope: 'local',
  estado: 'Antioquia',
  ...over,
});

const ctx = (over: Partial<ProductoContextoMercado> = {}): ProductoContextoMercado => ({
  estatus_proyecto: 'en_marcha',
  tipo_actividad: 'Producto',
  puv: 'Tallas grandes con envío en 24 h',
  inversion_inicial: 20000000,
  costos_fijos: 3000000,
  precio_venta: 95000,
  ...over,
});

const producto = { nombre: 'Activa Plus', categoria: 'Ropa deportiva' };

// ─── Estatus y tipo de actividad ────────────────────────────────────────────

describe('estatus del proyecto', () => {
  it('reconoce los tres vocabularios que conviven en la base', () => {
    for (const v of ['negocio_en_marcha', 'Negocio en Marcha', 'en_operacion', 'Operando']) {
      expect(normalizarEstatus(v)).toBe('en_marcha');
    }
    for (const v of ['nueva_idea', 'Idea', 'planificacion', 'Nueva idea']) {
      expect(normalizarEstatus(v)).toBe('idea');
    }
    expect(normalizarEstatus('otra cosa')).toBeNull();
    expect(normalizarEstatus(null)).toBeNull();
  });

  it('sin estatus declarado, los clientes al mes deciden', () => {
    expect(estatusEfectivo(null, 40)).toBe('en_marcha');
    expect(estatusEfectivo(undefined, 0)).toBe('idea');
    // Lo declarado gana: una idea con clientes de prueba sigue siendo idea.
    expect(estatusEfectivo('nueva_idea', 40)).toBe('idea');
  });
});

describe('tipo de actividad', () => {
  it('manda lo declarado en el alta aunque la categoría no diga «servicio»', () => {
    expect(tipoActividadDe('servicio', 'Contabilidad')).toBe('Servicio');
    expect(tipoActividadDe('producto', 'Servicios de limpieza')).toBe('Producto');
  });

  it('sin declaración, la categoría es el respaldo', () => {
    expect(tipoActividadDe(null, 'Servicios profesionales')).toBe('Servicio');
    expect(tipoActividadDe('', 'Cafetería')).toBe('Producto');
  });
});

// ─── Payback ────────────────────────────────────────────────────────────────

describe('calcularPayback', () => {
  it('un negocio en marcha con clientes calcula la ganancia y el payback reales', () => {
    const r = calcularPayback(ctx(), input({ clientes_mes: 120 }), 30000000, 50000000, 40);
    expect(r.ganancia_mensual_real).toBe(Math.round(120 * 95000 * 0.4));
    expect(r.meses_payback_real).toBe(Math.ceil(20000000 / (120 * 95000 * 0.4 - 3000000)));
  });

  it('una idea no tiene tracción real aunque llegue un número de clientes', () => {
    const r = calcularPayback(ctx({ estatus_proyecto: 'idea' }), input({ clientes_mes: 120 }), 30000000, 50000000, 40);
    expect(r.ganancia_mensual_real).toBeUndefined();
    expect(r.meses_payback_real).toBeUndefined();
  });
});

// ─── Plantilla del reporte BI ───────────────────────────────────────────────

describe('reporteBiMock', () => {
  it('usa el score, la tendencia y el hueco reales, con la moneda del país', () => {
    const r = reporteBiMock(input(), ctx(), producto, tendencias(), competencia(), viabilidad());
    expect(r.es_mock).toBe(true);
    expect(r.score_viabilidad).toBe(47);
    expect(r.grafica_tendencias).toBe('Decreciente');
    expect(r.analisis_mercado.gap_oportunidad).toBe('Nadie vende tallas grandes');
    expect(r.analisis_mercado.validacion_precio).toContain('95000 COP');
    expect(JSON.stringify(r)).not.toContain('$');
    expect(JSON.stringify(r)).not.toContain('México');
  });

  it('sin fuente de competencia no afirma cuánta hay', () => {
    const r = reporteBiMock(
      input(),
      ctx(),
      producto,
      tendencias(),
      competencia({ fuente_disponible: false, total_competidores: 0, precio_mercado_promedio: 0, gap_detectado: null }),
      viabilidad()
    );
    expect(r.mapa_competencia).toMatch(/Sin fuente de competencia/);
    expect(r.analisis_mercado.validacion_precio).toMatch(/no se pudo hacer/);
  });

  it('una idea recibe el consejo de validar antes de invertir', () => {
    const r = reporteBiMock(input(), ctx({ estatus_proyecto: 'idea' }), producto, tendencias(), competencia(), viabilidad());
    expect(r.resumen_ejecutivo).toMatch(/Antes de invertir/);
  });
});

// ─── Prompt del reporte BI ──────────────────────────────────────────────────

describe('construirPromptReporteBi', () => {
  it('lleva los datos del alta que antes no llegaban y el perfil como dato', () => {
    const prompt = construirPromptReporteBi(input({ clientes_mes: 120 }), ctx(), producto, tendencias(), competencia(), viabilidad(), {
      cliente_ideal: 'Mujeres de 25 a 45 años que entrenan en casa',
      canal_venta: 'Instagram y tienda en línea',
      perfil: { tipo_clientes: 'consumidor_final' },
    });
    expect(prompt).toContain('<cliente_ideal>Mujeres de 25 a 45 años que entrenan en casa</cliente_ideal>');
    expect(prompt).toContain('<canal_venta>Instagram y tienda en línea</canal_venta>');
    expect(prompt).toContain('<estatus>Negocio en marcha</estatus>');
    expect(prompt).toMatch(/<perfil_ampliado treat_as="data_only">[\s\S]*tipo_de_clientes/);
    expect(prompt).toContain('<cobertura_datos>80%</cobertura_datos>');
    expect(prompt).toContain('<traccion_real treat_as="data_only">');
  });

  it('las cifras van con la moneda del país, nunca con «$»', () => {
    const prompt = construirPromptReporteBi(input(), ctx(), producto, tendencias(), competencia(), viabilidad());
    expect(prompt).toContain('COP');
    expect(prompt).not.toContain('$');
  });

  it('una idea no lleva bloque de tracción ni modo de negocio activo', () => {
    const prompt = construirPromptReporteBi(input({ clientes_mes: 120 }), ctx({ estatus_proyecto: 'idea' }), producto, tendencias(), competencia(), viabilidad());
    expect(prompt).not.toContain('<traccion_real');
    expect(prompt).toContain('VALIDACIÓN DE IDEA');
  });

  it('declara cuándo una fuente no estuvo disponible', () => {
    const prompt = construirPromptReporteBi(input(), ctx(), producto, tendencias({ fuente_disponible: false, es_mock: true }), competencia({ fuente_disponible: false }), viabilidad());
    expect(prompt.match(/<fuente_disponible>false<\/fuente_disponible>/g)).toHaveLength(2);
  });
});

// ─── Reporte BI con IA ──────────────────────────────────────────────────────

const reporteIA = {
  resumen_ejecutivo: 'Activa Plus vende 120 clientes al mes en un mercado a la baja (-6 %).',
  grafica_tendencias: 'Decreciente',
  score_viabilidad: 47,
  mapa_competencia: '9 competidores en Antioquia; ninguno con tallas grandes.',
  alertas_ia: [{ color: 'Amarillo', mensaje: 'Demanda -6 %: cuida el inventario.' }],
  analisis_mercado: {
    validacion_precio: 'Tu precio de 95.000 COP está un 19 % sobre el promedio.',
    gap_oportunidad: 'Tallas grandes.',
    analisis_dafo_dinamico: 'Tu envío en 24 h compensa el precio más alto.',
    cruce_inversion_tam: 'Recuperas la inversión en unos 5 meses con tu tracción actual.',
    proximos_pasos: ['Esta semana: …', 'Este mes: …', 'En 90 días: …'],
  },
  supuestos: ['Supuse que el margen es del 40 %.'],
  informacion_faltante: [{ dato: 'Costo por talla', por_que_importa: 'Cambia el margen real.' }],
  nivel_confianza: 'alto',
  motivo_confianza: 'Hay ventas reales y fuentes verificadas.',
  secciones_extra: [
    { slug: 'temporada', titulo: 'Otro título', resumen: 'Diciembre concentra la demanda.', puntos: ['Sube inventario en noviembre'] },
    { slug: 'inventada', resumen: 'Sección que nadie pidió.', puntos: [] },
  ],
};

describe('generarReporteBi', () => {
  it('compone el system con el modo editable primero y el contrato del código al final', async () => {
    mockClave.mockReturnValue(true);
    responder(reporteIA);
    const r = await generarReporteBi(input({ clientes_mes: 120 }), ctx(), producto, tendencias(), competencia(), viabilidad());

    const { system, messages } = mockCrear.mock.calls[0][2];
    expect(mockCrear.mock.calls[0][0]).toBe('mercado.reporte_bi');
    expect(system[0].text).toBe(MERCADO_MODO);
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
    const ultimo = system[system.length - 1].text as string;
    expect(ultimo).toContain('CONTRATO DE SALIDA — REPORTE BI DE MERCADO');
    expect(ultimo).toContain(PRECEDENCIA);
    // Ningún dato del negocio en el system.
    expect(JSON.stringify(system)).not.toContain('Activa Plus');
    expect(messages[0].content).toContain('Activa Plus');

    expect(r.reporte.es_mock).toBe(false);
    expect(r.contrato?.nivel_confianza).toBe('alto');
    // Los campos del contrato no se quedan dentro del reporte.
    expect(r.reporte).not.toHaveProperty('supuestos');
    expect(r.reporte).not.toHaveProperty('secciones_extra');
    expect(r.sistema?.versiones['mercado.modo']).toMatchObject({ origen: 'repositorio' });
  });

  it('una respuesta inválida cae a la plantilla sin perder la versión de prompt', async () => {
    mockClave.mockReturnValue(true);
    mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: 'no es JSON' }], stop_reason: 'end_turn' });
    const r = await generarReporteBi(input(), ctx(), producto, tendencias(), competencia(), viabilidad());
    expect(r.reporte.es_mock).toBe(true);
    expect(r.contrato).toBeNull();
    expect(r.sistema?.versiones['mercado.modo']).toBeDefined();
  });

  it('sin clave usa la plantilla y no llama a la IA', async () => {
    const r = await generarReporteBi(input(), ctx(), producto, tendencias(), competencia(), viabilidad());
    expect(r.reporte.es_mock).toBe(true);
    expect(mockCrear).not.toHaveBeenCalled();
  });
});

// ─── Transparencia y meta_ia ────────────────────────────────────────────────

function datos(over: Partial<DatosTransparenciaMercado> = {}): DatosTransparenciaMercado {
  return {
    viabilidad: viabilidad(),
    competencia: competencia(),
    tendencias: tendencias(),
    precioUsuario: 95000,
    estatus: 'en_marcha',
    clientesMes: 120,
    puv: 'Tallas grandes',
    clienteIdeal: 'Mujeres que entrenan en casa',
    competidoresConocidos: 'Marca X',
    perfil: { tipo_clientes: 'consumidor_final' },
    ...over,
  };
}

describe('transparenciaBaseMercado', () => {
  it('con todo declarado y fuentes reales no pide datos ni declara supuestos', () => {
    const t = transparenciaBaseMercado(datos());
    expect(t.informacion_faltante).toEqual([]);
    expect(t.supuestos).toEqual([]);
    expect(t.nivel_confianza).toBe('medio');
    expect(t.motivo_confianza).toContain('80 %');
    expect(t.motivo_confianza).toContain('densidad');
  });

  it('pide lo que falta, y los clientes al mes solo a un negocio en marcha', () => {
    const vacio = { precioUsuario: undefined, clientesMes: null, puv: null, clienteIdeal: '  ', competidoresConocidos: null, perfil: {} };
    const enMarcha = transparenciaBaseMercado(datos(vacio)).informacion_faltante.map((f) => f.dato);
    expect(enMarcha).toEqual(
      expect.arrayContaining(['Tu precio de venta', 'Cuántos clientes atiendes al mes', 'Quién es tu cliente ideal'])
    );
    expect(enMarcha.length).toBeLessThanOrEqual(6);

    const idea = transparenciaBaseMercado(datos({ ...vacio, estatus: 'idea' })).informacion_faltante.map((f) => f.dato);
    expect(idea).not.toContain('Cuántos clientes atiendes al mes');
  });

  it('sin fuentes lo declara como supuesto y no como «cero competencia»', () => {
    const t = transparenciaBaseMercado(
      datos({
        tendencias: tendencias({ fuente_disponible: false, es_mock: true }),
        competencia: competencia({ fuente_disponible: false }),
        viabilidad: viabilidad({ confianza: 'baja' }),
      })
    );
    expect(t.supuestos.join(' ')).toMatch(/no significa que no exista/);
    expect(t.nivel_confianza).toBe('bajo');
  });
});

describe('construirMetaIaMercado', () => {
  const modo = { clave: 'mercado.modo', id: null, version: 0, origen: 'repositorio' as const, contenido: MERCADO_MODO, secciones_extra: [], secciones_ocultas: [] };
  const seccionesAdmin = [{ slug: 'temporada', titulo: 'Temporadas de venta', instrucciones: 'Analiza la estacionalidad.' }];

  const conIA = (nivel: string) => ({
    reporte: reporteBiMock(input(), ctx(), producto, tendencias(), competencia(), viabilidad()),
    contrato: { ...reporteIA, nivel_confianza: nivel } as never,
    sistema: { system: [], versiones: { 'mercado.modo': { id: 'v1', version: 4, origen: 'publicado' } }, seccionesExtra: seccionesAdmin, seccionesOcultas: [], ausentes: [] } as never,
  });

  it('las cifras del reporte que no salen de los datos se dicen como estimación de la IA', () => {
    const reporte = {
      resumen_ejecutivo: 'El 73 % de los negocios así cierra antes de 2 años.',
      grafica_tendencias: 'Estable',
      score_viabilidad: 50,
      mapa_competencia: 'Hay competencia cercana.',
      alertas_ia: [],
      analisis_mercado: { validacion_precio: 'x', gap_oportunidad: 'x', analisis_dafo_dinamico: 'x', cruce_inversion_tam: 'x', proximos_pasos: ['En 90 días: repite el análisis.'] },
      es_mock: false,
    };
    // «90 días» lo pide el contrato: es una cifra con respaldo.
    const sistema = { system: [{ type: 'text', text: 'proximos_pasos con horizonte (esta semana / este mes / en 90 días)' }] };
    const m = construirMetaIaMercado({
      datos: datos(),
      reporteBi: { reporte, contrato: null, sistema } as never,
      modo,
      ocultas: new Set(),
      seccionesIA: [],
      tipoActividad: 'Producto',
    });
    expect(m.transparencia.supuestos[0]).toMatch(/^Cifras que la IA calculó o estimó por su cuenta.*73 %/);
    expect(m.meta.contexto_usado).toMatchObject({ cifras_sin_respaldo: ['73 %'] });
    // La plantilla la escribe el código: no se revisa.
    const plantilla = construirMetaIaMercado({ datos: datos(), reporteBi: conIA('medio'), modo, ocultas: new Set(), seccionesIA: [], tipoActividad: 'Producto' });
    expect(plantilla.meta.contexto_usado).toMatchObject({ cifras_sin_respaldo: [] });
  });

  it('la IA puede bajar la confianza, nunca subirla por encima de los datos', () => {
    const baja = datos({ viabilidad: viabilidad({ confianza: 'baja' }) });
    const subir = construirMetaIaMercado({ datos: baja, reporteBi: conIA('alto'), modo, ocultas: new Set(), seccionesIA: [], tipoActividad: 'Producto' });
    expect(subir.transparencia.nivel_confianza).toBe('bajo');

    const bajar = construirMetaIaMercado({ datos: datos(), reporteBi: conIA('bajo'), modo, ocultas: new Set(), seccionesIA: [], tipoActividad: 'Producto' });
    expect(bajar.transparencia.nivel_confianza).toBe('bajo');
  });

  it('solo guarda las secciones extra del admin, con su título', () => {
    const m = construirMetaIaMercado({ datos: datos(), reporteBi: conIA('medio'), modo, ocultas: new Set(), seccionesIA: [], tipoActividad: 'Producto' });
    expect(m.secciones_extra).toEqual([
      expect.objectContaining({ slug: 'temporada', titulo: 'Temporadas de venta' }),
    ]);
  });

  it('une supuestos y datos faltantes del código y de la IA sin repetirlos', () => {
    const m = construirMetaIaMercado({
      datos: datos({ puv: null }),
      reporteBi: conIA('medio'),
      modo,
      ocultas: new Set(['mercado.dafo']),
      seccionesIA: [{ es_mock: false }, { es_mock: true }],
      tipoActividad: 'Producto',
    });
    const datosFaltantes = m.transparencia.informacion_faltante.map((f) => f.dato);
    expect(datosFaltantes).toEqual(expect.arrayContaining(['Qué te hace distinto de la competencia', 'Costo por talla']));
    expect(m.transparencia.supuestos).toContain('Supuse que el margen es del 40 %.');
    expect(m.secciones_ocultas).toEqual(['mercado.dafo']);
    expect(m.meta).toMatchObject({ contrato: CONTRATO_MERCADO, origen: 'mixto', versiones_prompt: { 'mercado.modo': { id: 'v1', version: 4 } } });
    expect(m.meta.contexto_usado).toMatchObject({ estatus: 'en_marcha', tipo_actividad: 'Producto', cobertura_datos: 0.8 });
  });

  it('sin reporte BI de IA guarda la versión del modo y origen plantilla', () => {
    const m = construirMetaIaMercado({ datos: datos(), reporteBi: null, modo, ocultas: new Set(), seccionesIA: [{ es_mock: true }], tipoActividad: 'Servicio' });
    expect(m.meta.origen).toBe('plantilla');
    expect(m.meta.versiones_prompt).toEqual({ 'mercado.modo': { id: null, version: 0, origen: 'repositorio' } });
    expect(m.secciones_extra).toEqual([]);
  });
});

// ─── Registro y casos de prueba del panel ───────────────────────────────────

describe('Mercado en el registro de prompts', () => {
  it('tiene una sola clave editable y solo oculta lo que escribe la IA', () => {
    expect(clavesDeModulo('mercado', 'CO')).toEqual(['mercado.modo']);
    expect(seccionesOcultables('mercado').sort()).toEqual(['mercado.dafo', 'mercado.reporte_bi']);
  });

  it('el modo del repositorio es el respaldo', async () => {
    const v = await resolverPrompt('mercado.modo');
    expect(v).toMatchObject({ origen: 'repositorio', contenido: MERCADO_MODO });
  });
});

describe('probarCasoMercado', () => {
  const caso = (id: string) => {
    const c = CASOS_MERCADO.find((x) => x.id === id);
    if (!c) throw new Error(`caso ${id}`);
    return c;
  };

  it('hay casos de idea y en marcha, producto y servicio, y uno sin fuentes', () => {
    const estatus = new Set(CASOS_MERCADO.map((c) => c.producto.estatus_proyecto));
    const tipos = new Set(CASOS_MERCADO.map((c) => c.producto.tipo_actividad));
    expect(estatus).toEqual(new Set(['nueva_idea', 'negocio_en_marcha']));
    expect(tipos).toEqual(new Set(['producto', 'servicio']));
    expect(CASOS_MERCADO.some((c) => c.tendencia === null && c.competencia.fuente === null)).toBe(true);
    expect(new Set(CASOS_MERCADO.map((c) => c.id)).size).toBe(CASOS_MERCADO.length);
  });

  it.each(CASOS_MERCADO.map((c) => c.id))('%s corre con plantilla sin tocar la IA', async (id) => {
    const r = await probarCasoMercado(caso(id));
    expect(r.dafo?.es_mock).toBe(true);
    expect(r.reporte_bi?.es_mock).toBe(true);
    expect(r.meta_ia.meta.origen).toBe('plantilla');
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('el caso sin fuentes sale con confianza baja y sin competencia inventada', async () => {
    const r = await probarCasoMercado(caso('ar_sin_fuentes'));
    expect(r.meta_ia.transparencia.nivel_confianza).toBe('bajo');
    expect(r.reporte_bi?.mapa_competencia).toMatch(/Sin fuente de competencia/);
    expect(JSON.stringify(r)).not.toContain('México');
  });

  it('respeta las secciones que oculta la versión anclada y no gasta IA en ellas', async () => {
    mockClave.mockReturnValue(true);
    repo.findOneBy.mockResolvedValue({
      id: 'v-prueba',
      clave: 'mercado.modo',
      version: 2,
      estado: 'borrador',
      contenido: 'Modo en prueba',
      secciones_extra: [{ slug: 'temporada', titulo: 'Temporadas de venta', instrucciones: 'Analiza la estacionalidad.' }],
      secciones_ocultas: ['mercado.dafo'],
    });
    responder(reporteIA);

    const r = await conSeguimientoIA(() => probarCasoMercado(caso('co_ropa_en_marcha')), {
      usuarioId: 'admin',
      modulo: 'admin_prueba',
      versionesPrompt: { 'mercado.modo': 'v-prueba' },
    });

    expect(r.dafo).toBeNull();
    expect(mockCrear).toHaveBeenCalledTimes(1);
    expect(mockCrear.mock.calls[0][0]).toBe('mercado.reporte_bi');
    const modoEnviado = mockCrear.mock.calls[0][2].system[0].text as string;
    expect(modoEnviado.startsWith('Modo en prueba')).toBe(true);
    expect(modoEnviado).toContain('[temporada] Temporadas de venta');
    expect(r.meta_ia.secciones_ocultas).toEqual(['mercado.dafo']);
    expect(r.meta_ia.secciones_extra.map((s) => s.titulo)).toEqual(['Temporadas de venta']);
    expect(r.meta_ia.meta.versiones_prompt['mercado.modo']).toMatchObject({ id: 'v-prueba', version: 2 });
    expect(r.meta_ia.meta.origen).toBe('ia');
  });
});
