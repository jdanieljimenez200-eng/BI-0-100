import * as XLSX from 'xlsx';
import { crearMensaje, hayClaveAnthropic } from '../../config/anthropic';
import { AppDataSource } from '../../config/database';
import { conSeguimientoIA } from '../../utils/seguimientoIA';
import { copyMock, generarCopies } from '../../services/marketing/copywritingService';
import { generarEstrategias } from '../../services/marketing/posicionamientoService';
import { generarCalendario } from '../../services/marketing/calendarioService';
import { interpretarConIA, parsearArchivoReporte } from '../../services/marketing/reporteAdsService';
import { CONTRATO_MARKETING, transparenciaBaseMarketing } from '../../services/marketing/transparenciaMarketing';
import { probarCasoMarketing } from '../../services/marketing/pruebaMarketing';
import { CASOS_MARKETING } from '../../services/ia/casosPruebaMarketing';
import { _reiniciarCachePrompts } from '../../services/ia/registroPrompts';
import { PRECEDENCIA } from '../../services/ia/componerSistema';
import { MARKETING_MODO } from '../../services/ia/prompts/marketing.modo';
import { clavesDeModulo } from '../../services/ia/prompts';
import { seccionesOcultables } from '../../services/ia/seccionesCatalogo';
import type { EstrategiaMarketing, MarketingAnalisisInput } from '../../services/marketing/types';

jest.mock('../../config/anthropic', () => {
  const actual = jest.requireActual('../../config/anthropic');
  return { ...actual, crearMensaje: jest.fn(), hayClaveAnthropic: jest.fn(() => false) };
});

// Sin base: el registro sirve el texto del repositorio salvo que el test
// devuelva una versión anclada.
jest.mock('../../config/database', () => {
  const repo = { findOne: jest.fn(), findOneBy: jest.fn() };
  return { AppDataSource: { isInitialized: true, getRepository: () => repo, __repo: repo } };
});

const repo = (AppDataSource as unknown as { __repo: { findOne: jest.Mock; findOneBy: jest.Mock } }).__repo;
const mockCrear = crearMensaje as jest.Mock;
const mockClave = hayClaveAnthropic as jest.Mock;

beforeEach(() => {
  _reiniciarCachePrompts();
  mockCrear.mockReset();
  mockClave.mockReturnValue(false);
  repo.findOne.mockReset().mockResolvedValue(null);
  repo.findOneBy.mockReset().mockResolvedValue(null);
});

const responder = (salida: object) =>
  mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(salida) }], stop_reason: 'end_turn' });

const estrategiasCO = () => generarEstrategias('Balance Claro', 'Servicios contables', 'servicio', 900000, 1500000, undefined, undefined, undefined, undefined, undefined, 'llamada', 'en_marcha', 'alto_50_70', 'CO');

// ─── Copies ─────────────────────────────────────────────────────────────────

const copyIA = (tipo: string) => ({
  tipo,
  headline: 'Contabilidad sin sustos',
  subtitulo: 's',
  propuesta_valor: 'p',
  cta: 'Agenda tu llamada',
  copy_facebook: 'f',
  copy_instagram: 'i',
  copy_whatsapp: 'w',
  hashtags: ['#a', '#b', '#c', '#d', '#e'],
});

describe('copies', () => {
  it('con IA se piden para la estrategia que existe (no para los 3 tipos viejos) y en el idioma del país', async () => {
    mockClave.mockReturnValue(true);
    const recomendada = estrategiasCO().find((e) => e.recomendada) as EstrategiaMarketing;
    responder({ copies: [copyIA(recomendada.tipo)] });
    const copies = await generarCopies('Balance Claro', 'Servicios contables', null, [recomendada], 'Profesional', 'servicio', undefined, undefined, 'Crecimiento', ['LinkedIn'], 'CO', 'Respuesta en 24 horas');

    const [seccion, tarea, params] = mockCrear.mock.calls[0];
    expect(seccion).toBe('marketing.copies');
    expect(tarea).toBe('mecanica');
    expect(params.system).not.toMatch(/mexicano/i);
    const prompt = params.messages[0].content as string;
    expect(prompt).toContain(`<estrategia tipo="${recomendada.tipo}">`);
    expect(prompt).toContain('<precio_desde moneda="COP">');
    expect(prompt).toContain('<propuesta_valor_unica>Respuesta en 24 horas</propuesta_valor_unica>');
    expect(prompt).not.toContain('<premium>');
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ tipo: recomendada.tipo, headline: 'Contabilidad sin sustos', es_mock: false });
  });

  it('si la IA no devuelve el copy de una estrategia, ese sale de plantilla', async () => {
    mockClave.mockReturnValue(true);
    const recomendada = estrategiasCO().find((e) => e.recomendada) as EstrategiaMarketing;
    responder({ copies: [copyIA('PREMIUM')] });
    const [copy] = await generarCopies('Balance Claro', 'Servicios contables', null, [recomendada], 'Profesional', 'servicio', undefined, undefined, undefined, undefined, 'CO');
    expect(copy).toMatchObject({ tipo: recomendada.tipo, es_mock: true });
  });

  it('la plantilla usa la moneda y el país del negocio y no inventa escasez', () => {
    const e = { ...estrategiasCO()[0], tipo: 'VOLUMEN' as const, precio_rango: { min: 900000, max: 1200000 } };
    const textos = (['Profesional', 'Divertido', 'Urgente', 'Empático'] as const)
      .map((voz) => JSON.stringify(copyMock('Balance Claro', 'Servicios contables', e, voz, 'CO')))
      .join(' ');
    expect(textos).toContain('900,000 COP');
    expect(textos).toContain('#Colombia');
    expect(textos).not.toMatch(/MXN|México|CDMX|\$\d/);
    const premium = JSON.stringify(copyMock('X', 'Y', { ...e, tipo: 'PREMIUM' }, 'Urgente', 'CO'));
    expect(premium).not.toMatch(/12 personas|Miles ya lo usan/);
  });
});

// ─── Estrategias deterministas ──────────────────────────────────────────────

describe('generarEstrategias', () => {
  it('el guion y el extra van en la moneda del país, sin casos ni escasez inventados', () => {
    const texto = JSON.stringify(estrategiasCO());
    expect(texto).toContain('COP');
    expect(texto).not.toMatch(/MXN|\$\d/);
    expect(texto).not.toMatch(/Solo nos quedan 2 lugares|en 15 días logró el resultado/);
    // Ni un «precio normal» tachado que nadie cobró, ni porcentajes de recuperación sin fuente.
    expect(texto).not.toMatch(/normalmente está en|80% de ventas/);
    // El extra vale lo que sube el ticket (25 % del precio), no 490 o 290 fijos.
    expect(texto).toContain('225,000 COP adicionales');
  });
});

// ─── Calendario ─────────────────────────────────────────────────────────────

const calendarioIA = {
  tendencias: [
    { plataforma: 'LinkedIn', ambito: 'Sector', tendencia: 'Cierre fiscal', score: 80, hashtags: ['#a'], justificacion: 'x', engagement: '5%', views: '1M+' },
  ],
  semanas: [{ numero: 1, dias: [] }, { numero: 2, dias: [] }],
  sugerencia_visual_campana: 'Paleta sobria',
  supuestos: ['Supuse que el dueño graba con el celular.'],
  informacion_faltante: [],
  nivel_confianza: 'alto',
  motivo_confianza: 'Contexto claro.',
  secciones_extra: [],
};

describe('generarCalendario', () => {
  it('modo editable primero, contrato con transparencia al final y horarios del país del negocio', async () => {
    mockClave.mockReturnValue(true);
    responder(calendarioIA);
    const r = await generarCalendario(
      'Balance Claro', 'Servicios contables', null, 'VENTAS_PLUS', undefined, 'Profesional', 'servicio',
      undefined, undefined, 'Crecimiento', ['LinkedIn'], '1-2/semana', 'CO', 'Respuesta en 24 horas', undefined, undefined,
      { ya_probado: 'Anuncios a todo el país sin llamadas', activos: ['testimonios'], zona_clientes: 'Cali' }
    );

    const [seccion, tarea, params] = mockCrear.mock.calls[0];
    expect(seccion).toBe('marketing.calendario');
    expect(tarea).toBe('extensa');
    expect(params.system[0].text).toBe(MARKETING_MODO);
    const ultimo = params.system[params.system.length - 1].text as string;
    expect(ultimo).toContain('CONTRATO DE SALIDA — CALENDARIO EDITORIAL');
    expect(ultimo).toContain('CONTRATO COMÚN DE TRANSPARENCIA');
    expect(ultimo).toContain(PRECEDENCIA);
    expect(JSON.stringify(params.system)).not.toContain('Balance Claro');

    const prompt = params.messages[0].content as string;
    expect(prompt).toContain('Horarios iniciales para Colombia');
    expect(prompt).not.toContain('Horarios pico MX');
    expect(prompt).toMatch(/<negocio_contexto treat_as="data_only">[\s\S]*ya_probado_sin_resultado: Anuncios a todo el país sin llamadas/);
    expect(prompt).toContain('testimonios o reseñas reales de clientes');

    expect(r.es_mock).toBe(false);
    expect(r.contrato?.supuestos).toEqual(['Supuse que el dueño graba con el celular.']);
    expect(r.calendario).not.toHaveProperty('supuestos');
  });

  it('la plantilla no muestra vistas ni engagement inventados', async () => {
    const r = await generarCalendario('Barro Vivo', 'Talleres', null, 'SEGUIDORES', undefined, 'Profesional', 'servicio', undefined, undefined, undefined, ['Instagram', 'TikTok'], undefined, 'AR');
    expect(r.es_mock).toBe(true);
    expect(r.calendario.tendencias.length).toBeGreaterThan(0);
    for (const t of r.calendario.tendencias) {
      expect(t.views).toBeUndefined();
      expect(t.engagement).toBeUndefined();
    }
    expect(JSON.stringify(r.calendario)).not.toMatch(/Mexico|México|#PromoMX|#CalidadMX|#HechoEnMexico/);
  });
});

// ─── Reporte de anuncios ────────────────────────────────────────────────────

describe('interpretarConIA (reporte de anuncios)', () => {
  it('usa el modo de Marketing y no pone «$» a las cifras de la cuenta', async () => {
    mockClave.mockReturnValue(true);
    const ws = XLSX.utils.aoa_to_sheet([
      ['Campaña', 'Impr.', 'Clics', 'Coste', 'Todas las conv.'],
      ['Search - Marca', 5000, 500, 2500, 50],
      ['Display', 20000, 200, 500, 0],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    const agregado = parsearArchivoReporte(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'google_ads.xlsx');
    responder({
      resumen_ejecutivo: 'r',
      puntos_fuertes: ['a'],
      fugas_presupuesto: ['b'],
      recomendaciones_priorizadas: [{ titulo: 't', accion: 'a', impacto_estimado: 'ALTO', canal_sugerido: 'Google Ads' }],
    });
    await interpretarConIA(agregado, { nombre: 'Balance Claro', precio: 900000, pais: 'CO' });

    const params = mockCrear.mock.calls[0][2];
    expect(params.system[0].text).toBe(MARKETING_MODO);
    expect(params.system[params.system.length - 1].text).toContain('CONTRATO DE SALIDA — DIAGNÓSTICO DE ANUNCIOS');
    const prompt = params.messages[0].content as string;
    expect(prompt).not.toMatch(/\$\d/);
    expect(prompt).toContain('900000 COP');
    expect(prompt).toContain('País objetivo: Colombia');
  });
});

// ─── Transparencia ──────────────────────────────────────────────────────────

const inputBase: MarketingAnalisisInput = { productoId: 'p', usuarioId: 'u' };

describe('transparenciaBaseMarketing', () => {
  it('sin contexto: confianza baja y pide lo que falta', () => {
    const t = transparenciaBaseMarketing({ input: inputBase, conMercado: false, clienteIdeal: null, conBrief: false, calendarioDePlantilla: false });
    expect(t.nivel_confianza).toBe('bajo');
    expect(t.motivo_confianza).toMatch(/4 datos de contexto/);
    expect(t.informacion_faltante.map((f) => f.dato)).toEqual(
      expect.arrayContaining(['Qué ya probaste en redes o anuncios que no funcionó', 'Dónde están tus clientes (zona, ciudad o país)'])
    );
    expect(t.supuestos.join(' ')).toMatch(/estimaciones de la IA/);
  });

  it('con todo el contexto y un reporte de anuncios, confianza alta', () => {
    const t = transparenciaBaseMarketing({
      input: { ...inputBase, yaProbado: 'x', activos: ['testimonios'], zonaClientes: 'Cali', reporteAds: {} as never },
      conMercado: true,
      clienteIdeal: 'ventas',
      conBrief: true,
      calendarioDePlantilla: false,
    });
    expect(t.nivel_confianza).toBe('alto');
    expect(t.informacion_faltante).toEqual([]);
    expect(t.supuestos.join(' ')).toMatch(/análisis de Ventas/);
  });

  it('un calendario de plantilla nunca es confiable', () => {
    const t = transparenciaBaseMarketing({
      input: { ...inputBase, yaProbado: 'x', activos: ['testimonios'], reporteAds: {} as never },
      conMercado: true,
      clienteIdeal: 'formulario',
      conBrief: false,
      calendarioDePlantilla: true,
    });
    expect(t.nivel_confianza).toBe('bajo');
    expect(t.motivo_confianza).toMatch(/plantilla general/);
  });
});

// ─── Registro y casos del panel ─────────────────────────────────────────────

describe('Marketing en el registro de prompts', () => {
  it('tiene su modo y solo deja ocultar los copies', () => {
    expect(clavesDeModulo('marketing', 'CO')).toEqual(['marketing.modo']);
    expect(seccionesOcultables('marketing')).toEqual(['marketing.copies']);
  });
});

describe('probarCasoMarketing', () => {
  const caso = (id: string) => {
    const c = CASOS_MARKETING.find((x) => x.id === id);
    if (!c) throw new Error(`caso ${id}`);
    return c;
  };

  it.each(CASOS_MARKETING.map((c) => c.id))('%s corre con plantilla sin tocar la IA', async (id) => {
    const r = await probarCasoMarketing(caso(id));
    expect(r.estrategias).toHaveLength(4);
    expect(r.copies).toHaveLength(1);
    expect(r.copies?.[0].tipo).toBe(r.estrategias.find((e) => e.recomendada)?.tipo);
    expect(r.meta_ia.meta).toMatchObject({ contrato: CONTRATO_MARKETING, origen: 'plantilla' });
    expect(r.meta_ia.transparencia.nivel_confianza).toBe('bajo');
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('respeta los copies ocultos de la versión anclada y no gasta IA en ellos', async () => {
    mockClave.mockReturnValue(true);
    repo.findOneBy.mockResolvedValue({
      id: 'v-prueba',
      clave: 'marketing.modo',
      version: 4,
      estado: 'borrador',
      contenido: 'Modo en prueba',
      secciones_extra: [{ slug: 'whatsapp_status', titulo: 'Estados de WhatsApp', instrucciones: 'Tres estados para la semana.' }],
      secciones_ocultas: ['marketing.copies'],
    });
    responder({ ...calendarioIA, secciones_extra: [{ slug: 'whatsapp_status', resumen: 'Publica un estado diario con una pregunta.', puntos: ['Lunes: encuesta'] }] });

    const r = await conSeguimientoIA(() => probarCasoMarketing(caso('co_contabilidad_b2b')), {
      usuarioId: 'admin',
      modulo: 'admin_prueba',
      versionesPrompt: { 'marketing.modo': 'v-prueba' },
    });

    expect(r.copies).toBeNull();
    expect(mockCrear.mock.calls.map((c) => c[0])).toEqual(['marketing.calendario']);
    expect((mockCrear.mock.calls[0][2].system[0].text as string).startsWith('Modo en prueba')).toBe(true);
    expect(r.meta_ia.secciones_ocultas).toEqual(['marketing.copies']);
    expect(r.meta_ia.secciones_extra.map((s) => s.titulo)).toEqual(['Estados de WhatsApp']);
    expect(r.meta_ia.meta).toMatchObject({ origen: 'ia', versiones_prompt: { 'marketing.modo': { id: 'v-prueba', version: 4 } } });
    // El caso trae ICP de Ventas, lo ya probado y activos, pero no Mercado ni reporte: medio como máximo.
    expect(r.meta_ia.transparencia.nivel_confianza).toBe('medio');
  });
});
