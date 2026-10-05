import { crearMensaje, hayClaveAnthropic } from '../../config/anthropic';
import { AppDataSource } from '../../config/database';
import { conSeguimientoIA } from '../../utils/seguimientoIA';
import { contratoBrief, generarBrief, mensajeBrief, puntajePorReglas } from '../../services/brief/briefService';
import { CONTRATO_BRIEF, transparenciaBaseBrief } from '../../services/brief/transparenciaBrief';
import { obtenerPaleta } from '../../services/brief/paletasService';
import { probarCasoBrief } from '../../services/brief/pruebaBrief';
import { CASOS_BRIEF } from '../../services/ia/casosPruebaBrief';
import { _reiniciarCachePrompts } from '../../services/ia/registroPrompts';
import { PRECEDENCIA } from '../../services/ia/componerSistema';
import { BRIEF_MODO } from '../../services/ia/prompts/brief.modo';
import { clavesDeModulo } from '../../services/ia/prompts';
import { seccionesOcultables } from '../../services/ia/seccionesCatalogo';
import type { BriefAnalisisInput } from '../../services/brief/types';

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

const caso = (id: string) => {
  const c = CASOS_BRIEF.find((x) => x.id === id);
  if (!c) throw new Error(`caso ${id}`);
  return c;
};
const productoDe = (id: string) => ({ ...caso(id).producto, pais: caso(id).pais, perfil_negocio: caso(id).perfil });
const inputDe = (id: string): BriefAnalisisInput => ({ ...caso(id).input, productoId: 'p', usuarioId: 'u' });

const responder = (salida: object) =>
  mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(salida) }], stop_reason: 'end_turn' });

const briefIA = {
  brief_identidad: {
    adn: 'Café de origen tostado cada semana para quien trabaja en el barrio.',
    diferenciador_clave: 'Tuestan en el local cada semana.',
    personalidad: ['Cercana', 'Artesanal', 'Honesta'],
    voz_marca: 'Habla de tú; diría «te guardamos tu mesa», nunca «experiencia premium».',
    slogan_principal: 'Tu café de barrio, tostado aquí.',
    slogans_alternativos: ['Del grano a tu taza, en la misma calle.', 'Trabaja con buen café.'],
  },
  identidad_visual: {
    tipografias: { principal: 'Comic Sans', secundaria: 'Papyrus' },
    concepto_logo: 'La taza de barro como símbolo, con el nombre a un lado.',
    descripcion_isotipo: 'Taza de barro simplificada en un trazo.',
    estilo_grafico: 'Texturas de papel kraft y fotos reales del local.',
  },
  diagnostico_estrategico: 'La marca se sostiene en el tostado propio; el riesgo es parecer una cadena.',
  score_marca: { coherencia: 8, diferenciacion: 7, claridad: 8, impacto_visual: 7, total: 7.5, razon: 'Percepción, tono y estilo van juntos; el diferenciador es claro.' },
  instrucciones_disenador: ['Versión del logo para el letrero.', 'Etiqueta para las bolsas de café.', 'Plantilla para redes.'],
  resumen_tweet: 'Café Tlaquepaque: café de origen tostado en el local para quien trabaja en el barrio.',
  supuestos: ['Supuse que el local tiene espacio para un letrero.'],
  informacion_faltante: [],
  nivel_confianza: 'alto',
  motivo_confianza: 'Datos completos.',
  secciones_extra: [],
};

describe('Brief: prompt compuesto', () => {
  it('system = modo + contrato; los datos del negocio van en el mensaje, marcados como datos', async () => {
    mockClave.mockReturnValue(true);
    responder(briefIA);
    await generarBrief(productoDe('mx_cafeteria_conserva_logo'), inputDe('mx_cafeteria_conserva_logo'));

    const [seccion, tarea, params] = mockCrear.mock.calls[0];
    expect(seccion).toBe('brief.identidad');
    expect(tarea).toBe('estrategia');
    expect(params.system[0].text).toBe(BRIEF_MODO);
    const contrato = params.system[params.system.length - 1].text as string;
    expect(contrato.startsWith(PRECEDENCIA)).toBe(true);
    expect(contrato).toContain('CONTRATO DE SALIDA — BRIEF DE IDENTIDAD DE MARCA');
    // El ejemplo ya no trae puntajes que el modelo pueda copiar.
    expect(contrato).not.toMatch(/8\.5|9\.0/);
    expect(JSON.stringify(params.system)).not.toContain('Café Tlaquepaque');

    const mensaje = params.messages[0].content as string;
    expect(mensaje).toContain('<producto treat_as="data_only">');
    expect(mensaje).toContain('<propuesta_valor_unica>Café de un solo origen tostado en el local cada semana</propuesta_valor_unica>');
    expect(mensaje).toContain('<elementos_a_conservar>El nombre y la taza de barro del logo actual</elementos_a_conservar>');
    expect(mensaje).toContain('letrero o fachada del local, empaque o etiquetas, redes sociales y WhatsApp');
    expect(mensaje).toContain('<pais>México</pais>');
  });

  it('lo no declarado se dice «no declarado», no se omite', () => {
    const mensaje = mensajeBrief(productoDe('cl_panaderia_sin_datos'), inputDe('cl_panaderia_sin_datos'), obtenerPaleta('Minimalista', 'A'), new Set());
    expect(mensaje).toContain('<propuesta_valor_unica>no declarado</propuesta_valor_unica>');
    expect(mensaje).toContain('<marcas_que_admira>no declarado</marcas_que_admira>');
    expect(mensaje).toContain('<usos_de_la_marca>no declarado</usos_de_la_marca>');
  });

  it('con IA: el puntaje viene explicado y la paleta y las tipografías las pone el sistema', async () => {
    mockClave.mockReturnValue(true);
    responder(briefIA);
    const r = await generarBrief(productoDe('mx_cafeteria_conserva_logo'), inputDe('mx_cafeteria_conserva_logo'));
    expect(r.resultado.es_mock).toBe(false);
    expect(r.resultado.score_marca).toMatchObject({ origen: 'ia', total: 7.5, razon: expect.stringContaining('Percepción') });
    expect(r.resultado.identidad_visual.tipografias).toEqual({ principal: 'Cormorant Garamond', secundaria: 'Montserrat' });
    expect(r.contrato?.nivel_confianza).toBe('alto');
  });
});

describe('Brief: plantilla sin IA', () => {
  it('el puntaje sale de reglas sobre lo declarado, explicado y sin evaluar lo visual', async () => {
    const r = await generarBrief(productoDe('pe_consultora_b2b'), inputDe('pe_consultora_b2b'));
    const s = r.resultado.score_marca;
    expect(r.resultado.es_mock).toBe(true);
    expect(s.origen).toBe('reglas');
    expect(s.impacto_visual).toBeNull();
    // «Bajo (similar a competencia)» = 4; sin choques = 7; resultado + cliente ideal = 8.
    expect([s.diferenciacion, s.coherencia, s.claridad]).toEqual([4, 7, 8]);
    expect(s.total).toBe(6.3);
    expect(s.razon).toMatch(/^Puntaje por reglas, sin IA/);
    expect(JSON.stringify(r.resultado)).not.toMatch(/8\.5|Elevando el estándar|posicionamiento sólido|Calidad que se siente/);
  });

  it('un choque entre lo que quiere transmitir y lo que quiere evitar baja la coherencia', () => {
    const input = { ...inputDe('co_ropa_marca_nueva'), percepcion: ['Atrevido'], anti_valores: ['atrevido'] };
    expect(puntajePorReglas(input, productoDe('co_ropa_marca_nueva')).coherencia).toBe(5);
  });

  it('respeta lo que se conserva y prepara una versión por cada uso', async () => {
    const r = await generarBrief(productoDe('mx_tamales_via_publica'), inputDe('mx_tamales_via_publica'));
    const instrucciones = r.resultado.instrucciones_disenador.join(' ');
    expect(instrucciones).toContain('Conservar: El nombre «Doña Lupe»');
    // Un puesto en la calle no tiene fachada: su letrero es una lona o una manta.
    expect(instrucciones).toContain('lona o manta del puesto');
    expect(instrucciones).not.toContain('fachada del local');
    expect(instrucciones).toContain('uniformes');
  });

  it('con local, el letrero sigue siendo el del local', async () => {
    const r = await generarBrief(productoDe('mx_cafeteria_conserva_logo'), inputDe('mx_cafeteria_conserva_logo'));
    expect(r.resultado.instrucciones_disenador.join(' ')).toContain('letrero o fachada del local');
  });
});

describe('Brief: transparencia', () => {
  it('sin cliente ideal ni propuesta de valor, confianza baja y los pide', () => {
    const t = transparenciaBaseBrief(inputDe('cl_panaderia_sin_datos'), productoDe('cl_panaderia_sin_datos'), false);
    expect(t.nivel_confianza).toBe('bajo');
    expect(t.informacion_faltante.map((f) => f.dato)).toEqual(
      expect.arrayContaining(['Quién es tu cliente ideal', 'Qué te hace distinto de quien vende lo mismo cerca (tu propuesta de valor)'])
    );
  });

  it('con todo declarado, confianza alta; de plantilla, siempre baja', () => {
    expect(transparenciaBaseBrief(inputDe('mx_cafeteria_conserva_logo'), productoDe('mx_cafeteria_conserva_logo'), false).nivel_confianza).toBe('alto');
    const plantilla = transparenciaBaseBrief(inputDe('mx_cafeteria_conserva_logo'), productoDe('mx_cafeteria_conserva_logo'), true);
    expect(plantilla.nivel_confianza).toBe('bajo');
    expect(plantilla.supuestos[0]).toMatch(/plantilla general/);
  });
});

describe('Brief en el registro de prompts y «Probar»', () => {
  it('tiene su modo y solo deja ocultar el diagnóstico y las instrucciones', () => {
    expect(clavesDeModulo('brief', 'MX')).toEqual(['brief.modo']);
    expect(seccionesOcultables('brief')).toEqual(['brief.diagnostico_estrategico', 'brief.instrucciones_disenador']);
  });

  it.each(CASOS_BRIEF.map((c) => c.id))('%s corre con plantilla sin tocar la IA', async (id) => {
    const r = await probarCasoBrief(caso(id));
    expect(r.resultado.score_marca.origen).toBe('reglas');
    expect(r.meta_ia.meta).toMatchObject({ contrato: CONTRATO_BRIEF, origen: 'plantilla' });
    expect(r.meta_ia.transparencia.nivel_confianza).toBe('bajo');
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('respeta lo oculto en la versión anclada, devuelve las secciones extra y revisa las cifras', async () => {
    mockClave.mockReturnValue(true);
    repo.findOneBy.mockResolvedValue({
      id: 'v-prueba',
      clave: 'brief.modo',
      version: 2,
      estado: 'borrador',
      contenido: 'Modo en prueba',
      secciones_extra: [{ slug: 'naming', titulo: 'Nombres alternativos', instrucciones: 'Tres nombres posibles.' }],
      secciones_ocultas: ['brief.diagnostico_estrategico'],
    });
    responder({
      ...briefIA,
      brief_identidad: { ...briefIA.brief_identidad, adn: 'Con más de 20 años de experiencia, el café de origen del barrio.' },
      secciones_extra: [{ slug: 'naming', resumen: 'Tres nombres que conservan la taza.', puntos: ['Taza de Barro'] }],
    });

    const r = await conSeguimientoIA(() => probarCasoBrief(caso('mx_cafeteria_conserva_logo')), {
      usuarioId: 'admin',
      modulo: 'admin_prueba',
      versionesPrompt: { 'brief.modo': 'v-prueba' },
    });

    expect(r.resultado.diagnostico_estrategico).toBe('');
    expect((mockCrear.mock.calls[0][2].messages[0].content as string)).toContain('Secciones ocultas (devuélvelas vacías): diagnostico_estrategico');
    expect(r.meta_ia.secciones_ocultas).toEqual(['brief.diagnostico_estrategico']);
    expect(r.meta_ia.secciones_extra.map((s) => s.titulo)).toEqual(['Nombres alternativos']);
    // Los «20 años» no salen de ningún dato: se dicen como estimación de la IA.
    expect(r.meta_ia.meta.contexto_usado).toMatchObject({ cifras_sin_respaldo: ['20'] });
  });
});
