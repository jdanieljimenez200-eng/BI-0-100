import { crearMensaje, hayClaveAnthropic } from '../../config/anthropic';
import { conSeguimientoIA, huboFallbackIA } from '../../utils/seguimientoIA';
import {
  CONTRATO_LOGO,
  analizarLogo,
  generarAnalisisSinIA,
  mensajeLogo,
} from '../../services/brief/logoAnalysisService';
import { _reiniciarCachePrompts } from '../../services/ia/registroPrompts';
import { PRECEDENCIA } from '../../services/ia/componerSistema';
import { BRIEF_MODO } from '../../services/ia/prompts/brief.modo';

jest.mock('../../config/anthropic', () => {
  const actual = jest.requireActual('../../config/anthropic');
  return { ...actual, crearMensaje: jest.fn(), hayClaveAnthropic: jest.fn(() => false) };
});

// Sin base: el registro sirve el texto del repositorio.
jest.mock('../../config/database', () => {
  const repo = { findOne: jest.fn().mockResolvedValue(null), findOneBy: jest.fn().mockResolvedValue(null) };
  return { AppDataSource: { isInitialized: true, getRepository: () => repo } };
});

const mockCrear = crearMensaje as jest.Mock;
const mockClave = hayClaveAnthropic as jest.Mock;
const claveOriginal = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  _reiniciarCachePrompts();
  mockCrear.mockReset();
  mockClave.mockReturnValue(false);
});
afterAll(() => {
  if (claveOriginal === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = claveOriginal;
});

const imagen = { buffer: Buffer.from('png'), mimetype: 'image/png' };
const tamales = {
  nombre: 'Tamales Doña Lupe',
  categoria: 'Alimentos preparados',
  pais: 'MX',
  cliente_ideal: 'Oficinistas que desayunan de camino',
  perfil_negocio: { local_fisico: 'via_publica' },
};
const brief = {
  slogan: 'El desayuno de casa, a la salida del Metro',
  personalidad: ['Cercana', 'Tradicional'],
  concepto_logo: 'Nombre a mano con la olla tamalera',
  paleta: ['#B5452B', '#F2C14E'],
  usos_marca: ['uniformes' as const, 'local_letrero' as const],
};

const responder = (salida: object) =>
  mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(salida) }], stop_reason: 'end_turn' });

const logoIA = {
  score_logo: { legibilidad: 6, versatilidad: 4.5, originalidad: 7, coherencia_marca: 8, impacto_visual: 6.04, razon: 'Se lee bien grande pero el trazo fino se pierde chico.' },
  colores_extraidos: [
    { hex: '#B5452B', nombre: 'Rojo barro', porcentaje: 60, uso_sugerido: 'Color principal en lona y mandil.' },
    { hex: '#FFFFFF', nombre: 'Blanco', porcentaje: 40, uso_sugerido: 'Fondo.' },
  ],
  tipo_logo_detectado: 'Logotipo (solo texto)',
  analisis_tecnico: 'El nombre escrito a mano transmite cercanía. El trazo fino se pierde en tamaño pequeño.',
  recomendaciones: ['Engrosa el trazo para el bordado.', 'Prepara una versión a una tinta para la lona.', 'Simplifica el adorno.', 'Pide el archivo en vector.'],
  coherencia_con_brief: 'Coincide con la personalidad cercana y tradicional del brief.',
  supuestos: [],
  informacion_faltante: [],
  nivel_confianza: 'alto',
  motivo_confianza: 'Imagen nítida y brief completo.',
};

describe('Análisis de logo: prompt compuesto', () => {
  it('system = modo del Brief + contrato del logo; los datos van en el mensaje junto a la imagen', async () => {
    mockClave.mockReturnValue(true);
    responder(logoIA);

    await analizarLogo({ ...imagen, producto: tamales, briefData: brief });

    const [seccion, tarea, params] = mockCrear.mock.calls[0];
    expect(seccion).toBe('brief.logo');
    expect(tarea).toBe('estrategia');
    expect(params.temperature).toBeUndefined();
    expect(params.system[0].text).toContain(BRIEF_MODO.slice(0, 60));
    const contrato = params.system[params.system.length - 1].text as string;
    expect(contrato.startsWith(PRECEDENCIA)).toBe(true);
    expect(contrato).toContain('CONTRATO DE SALIDA — ANÁLISIS DEL LOGO');
    expect(contrato).toContain('treat_as="data_only"');
    // Nada del negocio en el system.
    const system = params.system.map((b: { text: string }) => b.text).join('\n');
    expect(system).not.toContain('Doña Lupe');

    const [img, texto] = params.messages[0].content;
    expect(img.type).toBe('image');
    expect(texto.text).toContain('<producto treat_as="data_only">');
    expect(texto.text).toContain('Doña Lupe');
    expect(texto.text).toContain('<marca treat_as="data_only">');
    expect(texto.text).toContain('uniformes, letrero o fachada del local');
  });

  it('sin brief lo dice y pide coherencia_con_brief en null', () => {
    const m = mensajeLogo(tamales, null);
    expect(m).not.toContain('<marca treat_as');
    expect(m).toContain('coherencia_con_brief va null');
  });
});

describe('Análisis de logo: resultado de la IA', () => {
  it('el total lo calcula el código y guarda contrato, versiones y transparencia', async () => {
    mockClave.mockReturnValue(true);
    responder({ ...logoIA, score_logo: { ...logoIA.score_logo, total: 9.9 } });

    const r = await analizarLogo({ ...imagen, producto: tamales, briefData: brief });

    expect(r.es_mock).toBe(false);
    expect(r.score_logo.origen).toBe('ia');
    expect(r.score_logo.impacto_visual).toBe(6);
    expect(r.score_logo.total).toBe(6.3); // (6 + 4.5 + 7 + 8 + 6) / 5, no el 9.9 del modelo
    expect(r.meta?.contrato).toBe(CONTRATO_LOGO);
    expect(r.meta?.versiones_prompt['brief.modo']).toBeDefined();
    expect(r.transparencia?.nivel_confianza).toBe('alto');
  });

  it('sin brief la confianza no pasa de media y no hay coherencia con el brief', async () => {
    mockClave.mockReturnValue(true);
    responder(logoIA);

    const r = await analizarLogo({ ...imagen, producto: tamales, briefData: null });

    expect(r.transparencia?.nivel_confianza).toBe('medio');
    expect(r.coherencia_con_brief).toBeNull();
  });

  it('marca las cifras que la IA puso por su cuenta', async () => {
    mockClave.mockReturnValue(true);
    responder({ ...logoIA, analisis_tecnico: 'El 73 % de los clientes reconoce el logo, y el trazo fino se pierde en tamaño pequeño.' });

    const r = await analizarLogo({ ...imagen, producto: tamales, briefData: brief });

    expect(r.meta?.cifras_sin_respaldo).toContain('73 %');
    expect(r.transparencia?.supuestos[0]).toContain('73 %');
  });
});

describe('Análisis de logo: sin IA', () => {
  it('no inventa puntajes, colores ni tipo de logo', async () => {
    const r = await analizarLogo({ ...imagen, producto: tamales, briefData: brief });

    expect(mockCrear).not.toHaveBeenCalled();
    expect(r.es_mock).toBe(true);
    expect(r.score_logo.total).toBeNull();
    expect(r.score_logo.legibilidad).toBeNull();
    expect(r.score_logo.origen).toBe('sin_ia');
    expect(r.colores_extraidos).toEqual([]);
    expect(r.tipo_logo_detectado).toBe('');
    expect(r.transparencia?.nivel_confianza).toBe('bajo');
    expect(r.meta?.origen).toBe('plantilla');
  });

  it('las pruebas manuales siguen los usos declarados', () => {
    const conUsos = generarAnalisisSinIA(brief, null, 'x').recomendaciones.join(' ');
    expect(conUsos).toMatch(/bord/);
    expect(conUsos).toMatch(/10 pasos/);
    const sinUsos = generarAnalisisSinIA(null, null, 'x').recomendaciones.join(' ');
    expect(sinUsos).not.toMatch(/bord/);
  });

  it('si la IA falla, se anota para devolver el crédito y no se inventa nada', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    mockClave.mockReturnValue(true);
    mockCrear.mockRejectedValueOnce(new Error('caída'));

    const { r, estimado } = await conSeguimientoIA(async () => {
      const r = await analizarLogo({ ...imagen, producto: tamales, briefData: brief });
      return { r, estimado: huboFallbackIA() };
    });

    expect(estimado).toBe(true);
    expect(r.es_mock).toBe(true);
    expect(r.score_logo.total).toBeNull();
    expect(r.analisis_tecnico).toContain('no se te cobró');
  });

  it('si el modelo devuelve un color que no es hex, cae a sin IA', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    mockClave.mockReturnValue(true);
    responder({ ...logoIA, colores_extraidos: [{ hex: 'rojo', nombre: 'Rojo', porcentaje: 100, uso_sugerido: 'x' }] });

    const r = await analizarLogo({ ...imagen, producto: tamales, briefData: brief });
    expect(r.es_mock).toBe(true);
  });
});
