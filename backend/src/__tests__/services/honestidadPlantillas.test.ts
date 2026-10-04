import { generarResumen } from '../../services/finanzas/resumenService';
import { generarProyeccion } from '../../services/finanzas/proyeccionService';
import { calcularBreakeven } from '../../services/finanzas/breakevenService';
import { generarEstrategias } from '../../services/marketing/posicionamientoService';
import { CASOS_FINANZAS } from '../../services/ia/casosPruebaFinanzas';
import type { FinanzasInput } from '../../services/finanzas/types';
import { generarAnalisisLegalMock } from '../../services/legal/legalService';
import { CASOS_LEGAL, productoDeCaso } from '../../services/ia/casosPrueba';
import {
  analizarCompetidorMock,
  evaluarGuionMock,
  generarPerfilClienteMock,
  generarRebatidasMock,
  generarTipsMock,
} from '../../services/ventas/ventasService';
import { CASOS_VENTAS } from '../../services/ia/casosPruebaVentas';

/**
 * Lo que arma el código (no la IA) tampoco puede decir cosas que no son.
 *
 * Regla: cada cifra o afirmación sale de lo que dijo el usuario, de un cálculo
 * de la app o de una tabla con fuente. Nada de «lo habitual en el sector»,
 * superlativos que venden en vez de informar, ni ofertas que el dueño no dio.
 * El caso de prueba es real: un puesto de tamales afuera del Metro Niños Héroes
 * salía con «Sólido: ROI anual del 2658 %» y con LinkedIn y una garantía de
 * reembolso del 100 % en su plan de marketing.
 */

/** Frases que delatan una afirmación sin respaldo. Si alguna vuelve, este test lo dice. */
const SIN_RESPALDO = [
  /Sólido/,
  /bootstrapping/i,
  /lo habitual/i,
  /la mayoría de (los )?negocios/i,
  /umbral mínimo recomendado/i,
  /20-30 ?%/,
  /±15 ?%/,
  /sin perder mercado/i,
  /reembolsamos el 100/i,
  /sin preguntas/i,
  /garantía audaz/i,
  /Auditoría Express/i,
  /Compradores calificados/i,
  /normalmente está en/i,
  /80 ?% de ventas/i,
  /25 ?% de leads/i,
  /causa más común/i,
  /causa habitual/i,
  /La mayoría de las ventas/i,
  /Muestra el producto en uso/i,
  /Alta competencia establecida/i,
  /proveedores mejor evaluados/i,
  /menos de 24 horas/i,
];

function sinRespaldo(texto: string): string[] {
  return SIN_RESPALDO.filter((re) => re.test(texto)).map(String);
}

const tamales = CASOS_FINANZAS.find((c) => c.id === 'mx_tamales_via_publica')!;
const inputTamales: FinanzasInput = { ...tamales.input, productoId: 'p', usuarioId: 'u', pais: 'MX' };

function resumir(input: FinanzasInput, volumenComprobado = false) {
  const proyeccion = generarProyeccion(input);
  const breakeven = calcularBreakeven(input, proyeccion.meses);
  return { breakeven, resumen: generarResumen(input, proyeccion, breakeven, { volumenComprobado }) };
}

describe('Finanzas: el resumen no presume ni inventa referencias', () => {
  it('con ventas declaradas, condiciona el resultado a ellas y pone el punto de equilibrio al frente', () => {
    const { resumen, breakeven } = resumir(inputTamales);
    expect(resumen.mensaje_viabilidad).toContain('Con las ventas que declaraste (2600 al mes)');
    expect(resumen.mensaje_viabilidad).toContain(`${breakeven.unidades_breakeven_mes.toLocaleString('es-MX')} ventas al mes`);
    expect(resumen.mensaje_viabilidad).toContain('recupera lo invertido en menos de un mes');
    // El ROI se sigue calculando (la pantalla lo muestra), pero el mensaje ya no lo presume.
    expect(resumen.roi_anual).toBeGreaterThan(1000);
    expect(resumen.mensaje_viabilidad).not.toMatch(/ROI/);
    expect(resumen.recomendaciones.join(' ')).toContain('comprueba durante unas semanas');
  });

  it('la merma sube el punto de equilibrio y se explica con centavos', () => {
    const sin = resumir(inputTamales);
    const con = resumir({ ...inputTamales, merma_pct: 12 });
    // 17 / 0.88 = 19.32: cada venta carga 2.32 de lo que se tira.
    expect(con.breakeven.unidades_breakeven_mes).toBeGreaterThan(sin.breakeven.unidades_breakeven_mes);
    expect(con.resumen.alertas.join(' ')).toContain('te cuesta 2.32 MXN por cada venta');
  });

  it('con ventas de la contabilidad no pide comprobarlas', () => {
    const { resumen } = resumir(inputTamales, true);
    expect(resumen.mensaje_viabilidad).toContain('Con tus ventas reales');
    expect(resumen.recomendaciones.join(' ')).not.toContain('comprueba durante unas semanas');
  });

  it('si no cubre costos, dice cuánto hay que vender o a cuánto bajar los fijos (calculado)', () => {
    const { resumen, breakeven } = resumir({ ...inputTamales, unidades_mes_inicial: 300, tasa_crecimiento_mensual: 0 });
    expect(resumen.viabilidad).toBe('baja');
    expect(resumen.mensaje_viabilidad).toContain(`vender ${breakeven.unidades_breakeven_mes.toLocaleString('es-MX')} al mes`);
    // 300 ventas × $28 de margen = $8,400 de fijos que sí se cubren.
    expect(resumen.mensaje_viabilidad).toContain('8,400');
    expect(resumen.mensaje_viabilidad).not.toMatch(/≥ ?30 ?%/);
  });

  it('el efecto de subir el precio sale del cálculo, no de «sin perder mercado»', () => {
    // Margen chico (45 − 40 = 5 por venta) y una inversión grande: retorno moderado.
    const { resumen } = resumir({ ...inputTamales, costo_variable_unitario: 40, unidades_mes_inicial: 6000, tasa_crecimiento_mensual: 0, inversion_inicial: 300000 });
    expect(resumen.viabilidad).toBe('media');
    // Con +10 % de precio el margen pasa de 5 a 9.5: equilibrio = 26 000 / 9.5 → 2 737.
    expect(resumen.mensaje_viabilidad).toContain('Si subieras el precio 10 % y vendieras lo mismo, bastarían 2,737');
  });

  it.each(CASOS_FINANZAS.map((c) => c.id))('%s: ningún texto del resumen usa frases sin respaldo', (id) => {
    const caso = CASOS_FINANZAS.find((c) => c.id === id)!;
    const { resumen } = resumir({ ...caso.input, productoId: 'p', usuarioId: 'u', pais: caso.pais });
    const texto = [resumen.mensaje_viabilidad, ...resumen.recomendaciones, ...resumen.alertas].join(' ');
    expect(sinRespaldo(texto)).toEqual([]);
  });
});

describe('Marketing: la plantilla no rellena con canales ni ofertas que el negocio no tiene', () => {
  const estrategias = (opciones: Parameters<typeof generarEstrategias>[14] = {}, canales = 'Instagram, Facebook') =>
    generarEstrategias(
      'Tamales Doña Lupe', 'Alimentos preparados', 'producto', 25, 800,
      undefined, undefined, canales, undefined, undefined,
      'tienda_fisica', 'desde_cero', 'alto_50_70', 'MX', opciones
    );

  it('usa los canales del negocio y sugiere uno más como mucho; nunca LinkedIn a quien vende a consumidores', () => {
    for (const e of estrategias()) {
      expect(e.canales_principales.slice(0, 2)).toEqual(['Instagram', 'Facebook']);
      expect(e.canales_principales.length).toBeLessThanOrEqual(3);
      expect(e.canales_principales.map((c) => c.toLowerCase())).not.toContain('linkedin');
    }
  });

  it('a quien vende a empresas sí le puede sugerir LinkedIn', () => {
    const conEmpresa = estrategias({ clientesEmpresa: true }, 'WhatsApp');
    expect(conEmpresa.some((e) => e.canales_principales.includes('LinkedIn'))).toBe(true);
  });

  it('el público es el cliente ideal declarado, no un arquetipo de relleno', () => {
    const cliente = 'Oficinistas y gente que va a los juzgados de la colonia Doctores';
    for (const e of estrategias({ clienteIdeal: cliente })) expect(e.publico_objetivo).toBe(cliente);
    for (const e of estrategias()) expect(e.publico_objetivo).toContain('describe a tu cliente ideal');
  });

  it('garantía y extra son huecos para llenar con lo que el dueño sí puede cumplir', () => {
    const ventasPlus = estrategias().find((e) => e.tipo === 'VENTAS_PLUS')!;
    expect(ventasPlus.garantia_irresistible).toMatch(/^\[Solo si puedes cumplirla\]/);
    expect(ventasPlus.order_bump_sugerido).toMatch(/^\[Un complemento de tu catálogo/);
  });

  it('ningún texto de las estrategias usa frases sin respaldo', () => {
    const texto = JSON.stringify([...estrategias(), ...generarEstrategias('Taller El Rayo', 'Servicios', 'servicio', 450, 6000)]);
    expect(sinRespaldo(texto)).toEqual([]);
  });
});

describe('Legal y Ventas: las plantillas tampoco usan frases sin respaldo', () => {
  it.each(CASOS_LEGAL.map((c) => c.id))('Legal %s', (id) => {
    const caso = CASOS_LEGAL.find((c) => c.id === id)!;
    const r = generarAnalisisLegalMock(productoDeCaso(caso), { ...caso.input, productoId: 'p', usuarioId: 'u' });
    expect(sinRespaldo(JSON.stringify(r))).toEqual([]);
  });

  it.each(CASOS_VENTAS.map((c) => c.id))('Ventas %s', (id) => {
    const caso = CASOS_VENTAS.find((c) => c.id === id)!;
    const input = { ...caso.input, pais: caso.pais } as Parameters<typeof generarTipsMock>[0];
    const perfil = generarPerfilClienteMock(input);
    const texto = JSON.stringify([
      generarTipsMock(input),
      perfil,
      generarRebatidasMock(perfil),
      evaluarGuionMock('Hola, te ofrezco nuestro servicio. Escríbenos.', input),
      analizarCompetidorMock('La Competencia', 'Video del competidor: La Competencia'),
    ]);
    expect(sinRespaldo(texto)).toEqual([]);
  });
});
