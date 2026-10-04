import { crearMensaje, hayClaveAnthropic } from '../../config/anthropic';
import { AppDataSource } from '../../config/database';
import { conSeguimientoIA, huboFallbackIA } from '../../utils/seguimientoIA';
import {
  analizarCompetidor,
  analizarCompetidorMock,
  ctxProducto,
  evaluarGuionMock,
  generarRebatidas,
  generarFollowUps,
  generarHistoriaDiaria,
  generarPerfilClienteMock,
  generarTips,
  generarTipsMock,
} from '../../services/ventas/ventasService';
import { embudoDePayload, inputDeVentas } from '../../services/ventas/ventasOrchestrator';
import { CONTRATO_VENTAS, transparenciaBaseVentas } from '../../services/ventas/transparenciaVentas';
import { probarCasoVentas } from '../../services/ventas/pruebaVentas';
import { CASOS_VENTAS } from '../../services/ia/casosPruebaVentas';
import { _reiniciarCachePrompts } from '../../services/ia/registroPrompts';
import { PRECEDENCIA } from '../../services/ia/componerSistema';
import { VENTAS_MODO } from '../../services/ia/prompts/ventas.modo';
import { clavesDeModulo } from '../../services/ia/prompts';
import { seccionesOcultables } from '../../services/ia/seccionesCatalogo';
import type { VentasAnalisisInput } from '../../services/ventas/types';

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

const inputCO: VentasAnalisisInput = {
  tipo_venta: 'B2B',
  canal_principal: 'telefono',
  ticket_promedio: 390000,
  tamano_equipo: '1_2_personas',
  pais: 'CO',
  nombre_producto: 'StockFácil',
  categoria: 'Software',
  precio: 390000,
};

const responder = (salida: object) =>
  mockCrear.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(salida) }], stop_reason: 'end_turn' });

// ─── Contexto del prompt ────────────────────────────────────────────────────

describe('ctxProducto', () => {
  it('usa la moneda y el país del negocio, nunca MXN fijo', () => {
    const ctx = ctxProducto(inputCO);
    expect(ctx).toContain('moneda: COP');
    expect(ctx).toContain('pais: Colombia (CO)');
    expect(ctx).toContain('ticket_promedio: 390000 COP');
    expect(ctx).not.toContain('MXN');
  });

  it('marca el embudo no declarado y lleva el declarado, como datos', () => {
    expect(ctxProducto(inputCO)).toContain('contactos_al_mes: no declarado');
    const ctx = ctxProducto({ ...inputCO, contactos_mes: 30, tasa_cierre_pct: 10, ciclo_venta: 'semanas', quien_decide: 'dueno_empresa', objeciones_frecuentes: 'Ya uso Excel' });
    expect(ctx).toMatch(/<embudo fuente="declarado_por_el_dueño" treat_as="data_only">/);
    expect(ctx).toContain('contactos_al_mes: 30');
    expect(ctx).toContain('tasa_de_cierre: 10%');
    expect(ctx).toContain('ciclo_de_venta: semanas');
    expect(ctx).toContain('quien_decide_la_compra: el dueño de la empresa cliente');
    expect(ctx).toContain('objeciones_que_ya_escucha: Ya uso Excel');
  });

  it('lleva lo que el dueño dijo en el alta y el perfil ampliado', () => {
    const ctx = ctxProducto({ ...inputCO, puv: 'Implementación en una semana', estatus: 'en_marcha', perfil: { tipo_clientes: 'empresas' } });
    expect(ctx).toContain('propuesta_de_valor: Implementación en una semana');
    expect(ctx).toContain('estatus: Negocio en marcha');
    expect(ctx).toMatch(/<perfil_ampliado treat_as="data_only">[\s\S]*tipo_de_clientes: empresas/);
  });
});

// ─── Plantillas ─────────────────────────────────────────────────────────────

describe('plantillas sin IA', () => {
  it('los tips usan la moneda del país y no «$»', () => {
    const texto = JSON.stringify(generarTipsMock(inputCO));
    expect(texto).toContain('390,000 COP');
    expect(texto).not.toContain('$');
  });

  it('el perfil de referencia no inventa una afinidad ni usa la escala mexicana fuera de México', () => {
    const p = generarPerfilClienteMock(inputCO);
    expect(p.score_afinidad).toBe(50);
    expect(p.score_razon).toMatch(/no se calculó/);
    expect(p.demograficos.nivel_socioeconomico).toBe('Medio-alto');
    expect(generarPerfilClienteMock({ ...inputCO, pais: 'MX', ticket_promedio: 300 }).demograficos.nivel_socioeconomico).toBe('C+, C');
  });

  it('las objeciones que ya escucha el dueño van primero, con sus palabras', () => {
    const p = generarPerfilClienteMock({ ...inputCO, objeciones_frecuentes: 'Ya usamos Excel; me da miedo migrar los datos' });
    expect(p.psicografia.objeciones_tipicas.slice(0, 2)).toEqual(['Ya usamos Excel', 'me da miedo migrar los datos']);
  });

  it('la versión mejorada del guion no inventa prueba social', () => {
    const r = evaluarGuionMock('Compra hoy nuestro software de inventarios', inputCO);
    expect(r.version_mejorada).not.toMatch(/Más de 100 clientes/);
  });
});

// ─── Llamadas a la IA ───────────────────────────────────────────────────────

const tipsIA = {
  tips: [
    { titulo: 'a', descripcion: 'b', ejemplo_practico: 'c', error_comun: 'd' },
    { titulo: 'a2', descripcion: 'b', ejemplo_practico: 'c', error_comun: 'd' },
    { titulo: 'a3', descripcion: 'b', ejemplo_practico: 'c', error_comun: 'd' },
  ],
  supuestos: ['Supuse que el dueño hace la demo en persona.'],
  informacion_faltante: [],
  nivel_confianza: 'alto',
  motivo_confianza: 'Datos claros.',
  secciones_extra: [],
};

describe('generarTips con IA', () => {
  it('modo editable primero, contrato con transparencia al final y datos solo en el mensaje', async () => {
    mockClave.mockReturnValue(true);
    responder(tipsIA);
    const r = await generarTips(inputCO);

    const [seccion, tarea, params] = mockCrear.mock.calls[0];
    expect(seccion).toBe('ventas.tips');
    expect(tarea).toBe('estrategia');
    expect(params.system[0].text).toBe(VENTAS_MODO);
    const ultimo = params.system[params.system.length - 1].text as string;
    expect(ultimo).toContain('CONTRATO DE SALIDA — TIPS DE VENTA');
    expect(ultimo).toContain('CONTRATO COMÚN DE TRANSPARENCIA');
    expect(ultimo).toContain(PRECEDENCIA);
    expect(ultimo).not.toMatch(/mexicano/i);
    expect(JSON.stringify(params.system)).not.toContain('StockFácil');
    expect(params.messages[0].content).toContain('StockFácil');

    expect(r.es_mock).toBe(false);
    expect(r.tips).toHaveLength(3);
    expect(r.contrato?.supuestos).toEqual(['Supuse que el dueño hace la demo en persona.']);
  });

  it('una respuesta inválida cae a la plantilla sin perder la versión', async () => {
    mockClave.mockReturnValue(true);
    responder({ tips: [] });
    const r = await generarTips(inputCO);
    expect(r.es_mock).toBe(true);
    expect(r.contrato).toBeNull();
    expect(r.sistema?.versiones['ventas.modo']).toBeDefined();
  });

  it('la historia también usa el modo', async () => {
    mockClave.mockReturnValue(true);
    responder({ nombre: 'Lucía P.', industria: 'Software', pais: 'CO', como_lo_logro: 'x', mentalidad_clave: 'x', obstaculo_principal: 'x', estrategia_marketing: 'x', metricas: 'x', leccion_aplicable: 'x' });
    await generarHistoriaDiaria(inputCO, '2026-10-01');
    expect(mockCrear.mock.calls[0][2].system[0].text).toBe(VENTAS_MODO);
  });

  it('las tareas mecánicas también llevan el modo, con su contrato al final', async () => {
    mockClave.mockReturnValue(true);
    responder({ mensajes: [{ momento: 'Inmediato', mensaje: 'Hola' }, { momento: '48 horas', mensaje: 'Hola de nuevo' }] });
    await generarFollowUps(inputCO);
    const [, tarea, params] = mockCrear.mock.calls[0];
    expect(tarea).toBe('mecanica');
    expect(params.system[0].text).toBe(VENTAS_MODO);
    const contrato = params.system[params.system.length - 1].text as string;
    expect(contrato).toContain('CONTRATO DE SALIDA — MENSAJES DE SEGUIMIENTO');
    expect(contrato).toContain('treat_as="data_only"');
    // Los datos del negocio van en el mensaje, nunca en el system.
    expect(JSON.stringify(params.system)).not.toContain('StockFácil');
  });
});

// ─── Embudo, input y transparencia ──────────────────────────────────────────

describe('embudoDePayload e inputDeVentas', () => {
  it('descarta del trabajo lo que no es válido', () => {
    expect(
      embudoDePayload({ contactos_mes: -3, tasa_cierre_pct: 150, ciclo_venta: 'años', quien_decide: 'yo', objeciones_frecuentes: '   ' })
    ).toEqual({ contactos_mes: undefined, tasa_cierre_pct: undefined, ciclo_venta: undefined, quien_decide: undefined, objeciones_frecuentes: undefined });
  });

  it('suma al formulario lo que ya sabe el producto', () => {
    const input = inputDeVentas(
      { nombre: 'Seis Cuerdas', pais: 'AR', categoria: 'Educación', precio: 25000, estatus_proyecto: 'nueva_idea', tipo_actividad: 'servicio', puv: 'Clases en vivo', perfil_negocio: { tipo_clientes: 'consumidor_final' } },
      { tipo_venta: 'servicios', canal_principal: 'redes_sociales', ticket_promedio: 25000, tamano_equipo: 'solo_tu', tasa_cierre_pct: 20 }
    );
    expect(input).toMatchObject({ pais: 'AR', estatus: 'idea', tipo_actividad: 'Servicio', puv: 'Clases en vivo', tasa_cierre_pct: 20 });
    expect(input.perfil).toEqual({ tipo_clientes: 'consumidor_final' });
  });
});

describe('transparenciaBaseVentas', () => {
  it('sin embudo: confianza baja, lo pide y declara la historia como compuesta', () => {
    const t = transparenciaBaseVentas(inputCO, true);
    expect(t.nivel_confianza).toBe('bajo');
    expect(t.motivo_confianza).toMatch(/Faltan 4 de 4/);
    expect(t.informacion_faltante.map((f) => f.dato)).toContain('Quién decide la compra en tus clientes');
    expect(t.supuestos.join(' ')).toMatch(/caso compuesto/);
  });

  it('con el embudo completo y la descripción, confianza alta', () => {
    const t = transparenciaBaseVentas(
      { ...inputCO, contactos_mes: 30, tasa_cierre_pct: 10, ciclo_venta: 'semanas', objeciones_frecuentes: 'Ya uso Excel', quien_decide: 'dueno_empresa', descripcion: 'Inventarios' },
      false
    );
    expect(t.nivel_confianza).toBe('alto');
    expect(t.informacion_faltante).toEqual([]);
    expect(t.supuestos.join(' ')).not.toMatch(/caso compuesto/);
  });
});

// ─── Registro y casos del panel ─────────────────────────────────────────────

describe('Ventas en el registro de prompts', () => {
  it('tiene su modo y solo deja ocultar la historia del día', () => {
    expect(clavesDeModulo('ventas', 'CO')).toEqual(['ventas.modo']);
    expect(seccionesOcultables('ventas')).toEqual(['ventas.historia']);
  });
});

describe('probarCasoVentas', () => {
  const caso = (id: string) => {
    const c = CASOS_VENTAS.find((x) => x.id === id);
    if (!c) throw new Error(`caso ${id}`);
    return c;
  };

  it.each(CASOS_VENTAS.map((c) => c.id))('%s corre con plantilla sin tocar la IA', async (id) => {
    const r = await probarCasoVentas(caso(id));
    expect(r.tips.length).toBeGreaterThanOrEqual(3);
    expect(r.perfil_cliente).not.toBeNull();
    expect(r.meta_ia.meta).toMatchObject({ contrato: CONTRATO_VENTAS, origen: 'plantilla' });
    // De plantilla nunca es confiable, aunque el caso traiga el embudo completo.
    expect(r.meta_ia.transparencia.nivel_confianza).toBe('bajo');
    expect(r.meta_ia.transparencia.motivo_confianza).toMatch(/plantilla general/);
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('el caso sin embudo sale con confianza baja y en pesos argentinos', async () => {
    const r = await probarCasoVentas(caso('ar_idea_sin_embudo'));
    expect(r.meta_ia.transparencia.nivel_confianza).toBe('bajo');
    expect(JSON.stringify(r.tips)).toContain('ARS');
    expect(JSON.stringify(r)).not.toContain('MXN');
  });

  it('respeta la historia oculta de la versión anclada y no gasta IA en ella', async () => {
    mockClave.mockReturnValue(true);
    repo.findOneBy.mockResolvedValue({
      id: 'v-prueba',
      clave: 'ventas.modo',
      version: 2,
      estado: 'borrador',
      contenido: 'Modo en prueba',
      secciones_extra: [{ slug: 'whatsapp', titulo: 'Guion de WhatsApp', instrucciones: 'Un guion de primer mensaje.' }],
      secciones_ocultas: ['ventas.historia'],
    });
    responder({ ...tipsIA, secciones_extra: [{ slug: 'whatsapp', resumen: 'Primer mensaje en menos de 5 minutos.', puntos: ['Saluda por nombre'] }] });
    responder({
      demograficos: { edad_rango: '30-50', genero_predominante: 'Mixto', nivel_socioeconomico: 'Medio', ubicacion_tipica: 'Bogotá' },
      psicografia: { miedos_principales: ['a', 'b'], deseos_clave: ['a', 'b'], objeciones_tipicas: ['a', 'b'], valores_compra: ['a', 'b'] },
      canales_preferidos: ['WhatsApp'],
      disparadores_compra: ['a', 'b'],
      frenos_compra: ['a', 'b'],
      lenguaje_tipico: 'x',
      queries_tipicas: ['a', 'b'],
      score_afinidad: 80,
      score_razon: 'x',
    });

    const r = await conSeguimientoIA(() => probarCasoVentas(caso('co_software_b2b')), {
      usuarioId: 'admin',
      modulo: 'admin_prueba',
      versionesPrompt: { 'ventas.modo': 'v-prueba' },
    });

    expect(r.historia).toBeNull();
    expect(mockCrear.mock.calls.map((c) => c[0]).sort()).toEqual(['ventas.perfil_cliente', 'ventas.tips']);
    expect((mockCrear.mock.calls[0][2].system[0].text as string).startsWith('Modo en prueba')).toBe(true);
    expect(r.meta_ia.secciones_ocultas).toEqual(['ventas.historia']);
    expect(r.meta_ia.secciones_extra.map((s) => s.titulo)).toEqual(['Guion de WhatsApp']);
    expect(r.meta_ia.meta.versiones_prompt['ventas.modo']).toMatchObject({ id: 'v-prueba', version: 2 });
    // El caso trae el embudo completo: la IA no puede subir la confianza por encima de lo que fija el código.
    expect(r.meta_ia.transparencia.nivel_confianza).toBe('alto');
    expect(r.meta_ia.transparencia.supuestos.join(' ')).not.toMatch(/caso compuesto/);
  });
});

// ─── Plantillas que no inventan y créditos que se devuelven ─────────────────

describe('Ventas: si la IA falla no se cobra ni se inventa', () => {
  it('una acción con créditos que cae a plantilla anota el fallback (y conCreditos devuelve el crédito)', async () => {
    mockClave.mockReturnValue(true);
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba';
    try {
      mockCrear.mockRejectedValue(new Error('overloaded'));
      const perfil = generarPerfilClienteMock(inputCO);
      const objeciones = await conSeguimientoIA(async () => {
        await generarRebatidas(perfil, inputCO);
        return huboFallbackIA();
      });
      const competidor = await conSeguimientoIA(async () => {
        await analizarCompetidor('La Competencia', 'Texto del anuncio', inputCO);
        return huboFallbackIA();
      });
      expect(objeciones).toBe(true);
      expect(competidor).toBe(true);
    } finally {
      process.env.ANTHROPIC_API_KEY = original;
      mockCrear.mockReset();
    }
  });

  it('el competidor sin IA no describe un video que nadie revisó', () => {
    const sinContenido = analizarCompetidorMock('La Competencia', 'Video del competidor: La Competencia');
    expect(sinContenido.propuesta_valor).toMatch(/^Sin analizar/);
    expect(sinContenido.hook_primeros_segundos).toMatch(/^Sin analizar/);
    expect(JSON.stringify(sinContenido)).not.toMatch(/Muestra el producto en uso|Contáctanos ahora|Precio accesible/);

    const conTexto = analizarCompetidorMock(
      'La Competencia',
      'Hola, somos la mejor opción de la ciudad para tu negocio. Escríbenos por WhatsApp y agenda tu cita hoy mismo.'
    );
    expect(conTexto.hook_primeros_segundos).toMatch(/^Empieza con: «Hola, somos la mejor opción/);
    expect(conTexto.cta_usado).toContain('Escríbenos por WhatsApp');
  });

  it('el guion sin IA no pone notas que no puede medir ni promete plazos', () => {
    const e = evaluarGuionMock('¿Te cansaste de esperar? Pide tu pedido hoy por WhatsApp.', inputCO);
    expect(e.resumen).toMatch(/^Revisión básica sin IA/);
    expect(e.metricas.map((m) => m.nombre)).not.toContain('Alineación con ICP');
    expect(e.metricas.map((m) => m.nombre)).not.toContain('Manejo de Objeciones');
    expect(e.version_mejorada).not.toMatch(/menos de 24 horas/);
  });

  it('los tips y el perfil de plantilla no traen estadísticas ni datos del cliente inventados', () => {
    const texto = JSON.stringify([generarTipsMock(inputCO), generarPerfilClienteMock(inputCO)]);
    expect(texto).not.toMatch(/La mayoría|Regla del 70\/30|25-42|30-50 años|radio 5-10 km/);
    // La cuenta del descuento es correcta: con 40 % de margen, un 30 % todavía deja utilidad.
    expect(texto).not.toMatch(/uno del 30% te deja vendiendo para perder/);
  });
});
