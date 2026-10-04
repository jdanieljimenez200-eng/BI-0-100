import { crearMensaje, hayClaveAnthropic } from '../../config/anthropic';
import {
  LegalOutputSchema,
  generarAnalisisLegal,
  generarAnalisisLegalMock,
  userPromptLegal,
} from '../../services/legal/legalService';
import { resolverPais } from '../../services/legal/fichasPais';
import { CASOS_LEGAL, productoDeCaso } from '../../services/ia/casosPrueba';
import { _reiniciarCachePrompts } from '../../services/ia/registroPrompts';

jest.mock('../../config/anthropic', () => {
  const actual = jest.requireActual('../../config/anthropic');
  return { ...actual, crearMensaje: jest.fn(), hayClaveAnthropic: jest.fn(() => true) };
});

const mockCrear = crearMensaje as jest.Mock;
const mockClave = hayClaveAnthropic as jest.Mock;

const caso = (id: string) => {
  const c = CASOS_LEGAL.find((x) => x.id === id);
  if (!c) throw new Error(`caso ${id}`);
  return c;
};
const inputDe = (id: string) => ({ ...caso(id).input, productoId: 'p', usuarioId: 'u' });

const obligacion = {
  nombre: 'Declaración mensual',
  regimen_fiscal: 'Régimen general',
  periodicidad: 'Mensual',
  descripcion: 'Declarar ingresos y gastos cada mes.',
  nivel_riesgo: 'alto',
  aplica_si: 'Siempre',
};

/** Una salida válida de legal@1: sin ninguno de los campos nuevos. */
const salidaV1 = {
  giro_detectado: 'Tienda de abarrotes',
  puntaje_cumplimiento: 60,
  resumen_ejecutivo: 'El negocio opera con lo básico, pero le falta regularizar la licencia local y los comprobantes.',
  permisos_licencias: [
    {
      nombre: 'Licencia de funcionamiento',
      autoridad: 'Municipio',
      descripcion: 'Permiso para operar el local.',
      obligatorio: true,
      nivel_riesgo: 'alto',
      plazo_tramite: '10-30 días',
      costo_estimado: 'aprox. variable',
      url_tramite: 'https://www.inventado.com/tramite',
    },
  ],
  obligaciones_fiscales: [obligacion],
  alertas: [{ nivel: 'rojo', titulo: 'Sin licencia', descripcion: 'Riesgo de clausura inmediata.', accion_recomendada: 'Tramítala esta semana.' }],
  checklist: [
    { categoria: 'permiso', texto: 'Tramitar la licencia', prioridad: 'alta' },
    { categoria: 'fiscal', texto: 'Emitir comprobantes', prioridad: 'alta' },
    { categoria: 'otro', texto: 'Separar cuentas', prioridad: 'media' },
  ],
};

const responder = (salida: object) =>
  mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(salida) }], stop_reason: 'end_turn' });

beforeEach(() => {
  _reiniciarCachePrompts();
  mockCrear.mockReset();
  mockClave.mockReturnValue(true);
});

/**
 * El módulo Legal con el prompt en tres bloques. Lo que protege: que el criterio
 * experto y la ficha del país lleguen al modelo, que los datos del usuario
 * vayan como datos, y que el código —no el modelo— tenga la última palabra
 * sobre confianza, URLs y secciones.
 */
describe('Legal: prompt compuesto y contrato', () => {
  it('system = modo + ficha + contrato; el mensaje lleva negocio y perfil como datos', async () => {
    responder({ ...salidaV1, nivel_confianza: 'alto', motivo_confianza: 'Ficha y perfil completos.' });
    await generarAnalisisLegal(productoDeCaso(caso('mx_taqueria')), inputDe('mx_taqueria'));

    const params = mockCrear.mock.calls[0][2];
    expect(mockCrear.mock.calls[0][0]).toBe('legal.dictamen');
    expect(params.system).toHaveLength(3);
    expect(params.system[0].text).toContain('LEGAL & FISCAL PYME LATAM CONSULTING MODE');
    expect(params.system[1].text).toContain('FICHA DE PAÍS — México (MX)');
    expect(params.system[2].text).toContain('CONTRATO DE SALIDA — MÓDULO LEGAL (legal@2)');
    expect(params.system[2].text).toContain('"informacion_faltante"');

    const mensaje: string = params.messages[0].content;
    expect(mensaje).toContain('<negocio treat_as="data_only">');
    expect(mensaje).toContain('<perfil_ampliado treat_as="data_only">');
    expect(mensaje).toContain('todavía NO está dado de alta');
    expect(mensaje).toContain('regimen_actual: no declarado');
    expect(mensaje).toContain('El dueño no respondió');
  });

  it('un país sin ficha: el modelo recibe reglas de prudencia y la confianza no pasa de «bajo»', async () => {
    responder({ ...salidaV1, nivel_confianza: 'alto', motivo_confianza: 'Seguro.' });
    const r = await generarAnalisisLegal(productoDeCaso(caso('gt_tienda')), inputDe('gt_tienda'));

    expect(mockCrear.mock.calls[0][2].system[1].text).toContain('SIN FICHA DE PAÍS — Guatemala (GT)');
    expect(r.transparencia?.nivel_confianza).toBe('bajo');
    expect(r.transparencia?.motivo_confianza).toContain('Guatemala');
    expect(r.meta?.contexto_usado.pais_con_ficha).toBe(false);
    // Sin dominios oficiales conocidos, una URL que no se puede comprobar no se muestra.
    expect(r.permisos_licencias[0].url_tramite).toBe('#no-aplica');
  });

  it('con ficha se respeta la confianza del modelo y se registra con qué se hizo', async () => {
    responder({ ...salidaV1, nivel_confianza: 'alto', motivo_confianza: 'Ficha y perfil completos.' });
    const r = await generarAnalisisLegal(productoDeCaso(caso('co_ecommerce')), inputDe('co_ecommerce'));
    expect(r.transparencia?.nivel_confianza).toBe('alto');
    expect(r.meta).toMatchObject({ contrato: 'legal@2', origen: 'ia' });
    expect(r.meta?.versiones_prompt['legal.modo']).toMatchObject({ origen: 'repositorio', version: 0 });
    expect(r.meta?.contexto_usado.perfil_respondido).toContain('regimen_actual');
  });

  it('una salida de legal@1 (sin los campos nuevos) sigue validando', () => {
    const salida = LegalOutputSchema.parse(salidaV1);
    expect(salida.supuestos).toEqual([]);
    expect(salida.secciones_extra).toEqual([]);
    expect(salida.permisos_licencias[0].naturaleza).toBeUndefined();
  });

  it('sin alertas con la sección activa, la respuesta no sirve y sale la plantilla', async () => {
    responder({ ...salidaV1, alertas: [] });
    const r = await generarAnalisisLegal(productoDeCaso(caso('co_ecommerce')), inputDe('co_ecommerce'));
    expect(r.meta?.origen).toBe('plantilla');
    expect(r.transparencia?.nivel_confianza).toBe('bajo');
  });

  it('sin clave de IA, la plantilla usa el perfil (sector sanitario) y dice qué datos faltan', async () => {
    mockClave.mockReturnValue(false);
    const producto = productoDeCaso(caso('cl_dental'));
    producto.nombre = 'Centro Norte';
    producto.categoria = 'Servicios';
    producto.descripcion = 'Atención a pacientes.';
    producto.perfil_negocio = { sectores_regulados: ['salud'] };

    // Sin palabras que delaten el giro: solo el perfil puede activar lo sanitario.
    const r = await generarAnalisisLegal(producto, { ...inputDe('cl_dental'), giro_especifico: 'Atención general' });
    expect(mockCrear).not.toHaveBeenCalled();
    expect(r.permisos_licencias.some((p) => /sanitari/i.test(p.nombre))).toBe(true);
    expect(r.transparencia?.informacion_faltante.map((f) => f.dato)).toContain('Tu régimen fiscal actual');
    expect(r.meta?.origen).toBe('plantilla');
  });

  it('la plantilla también respeta las secciones que el admin ocultó', () => {
    const sistema = {
      system: [],
      versiones: { 'legal.modo': { id: 'v4', version: 4, origen: 'anclado' as const } },
      seccionesExtra: [],
      seccionesOcultas: ['legal.checklist', 'legal.alertas'],
      ausentes: [],
    };
    const r = generarAnalisisLegalMock(productoDeCaso(caso('co_ecommerce')), inputDe('co_ecommerce'), undefined, sistema);
    expect(r.checklist).toEqual([]);
    expect(r.alertas).toEqual([]);
    expect(r.secciones_ocultas).toEqual(['legal.checklist', 'legal.alertas']);
    expect(r.meta?.versiones_prompt['legal.modo'].id).toBe('v4');
  });

  it('a un puesto en la calle le pide permiso de vía pública, no licencia de local', () => {
    const r = generarAnalisisLegalMock(productoDeCaso(caso('mx_tamales_via_publica')), inputDe('mx_tamales_via_publica'));
    const nombres = r.permisos_licencias.map((p) => p.nombre);
    expect(nombres).toContain('Permiso para vender en la vía pública');
    expect(nombres).not.toContain('Licencia de funcionamiento municipal');
    expect(JSON.stringify(r)).not.toMatch(/causa más común|causa habitual/);
  });

  it('una sección oculta se pide vacía en el prompt', () => {
    const { iso, meta } = resolverPais('CO');
    const texto = userPromptLegal(
      productoDeCaso(caso('co_ecommerce')),
      inputDe('co_ecommerce'),
      meta,
      iso,
      {},
      new Set(['legal.checklist', 'legal.regulacion_digital'])
    );
    expect(texto).toContain('- checklist: DEVUELVE ARRAY VACÍO (sección desactivada por el equipo).');
    expect(texto).toContain('- regulacion_digital: DEVUELVE ARRAY VACÍO (sección desactivada por el equipo).');
    expect(texto).toContain('- alertas: 2-4');
  });
});
