import { marcarCifrasSinRespaldo, numerosDe, numerosDelSistema, textosDe } from '../ia/verificadorCifras';
import type { VentasAnalisisInput } from './types';
import type { ResultadoTips } from './ventasService';
import {
  aplicarContratoComun,
  combinarTransparencia,
  type InformacionFaltante,
  type NivelConfianza,
  type TransparenciaIA,
} from '../ia/contratoComun';
import { origenDe, type MetaIaAnalisis } from '../ia/metaAnalisis';
import type { VersionResuelta } from '../ia/registroPrompts';
import { getMoneda } from '../../utils/latam';

/**
 * Forma del resultado de Ventas.
 *  - ventas@1: tips, historia y perfil sin transparencia.
 *  - ventas@2: + datos del embudo en el prompt y meta_ia.
 */
export const CONTRATO_VENTAS = 'ventas@2';

/**
 * Lo que el código sabe: qué datos del embudo no se declararon. La confianza
 * la fija esto (cuánto se sabe de cómo vende el negocio hoy), no el modelo.
 */
export function transparenciaBaseVentas(input: VentasAnalisisInput, conHistoria: boolean): TransparenciaIA {
  const supuestos: string[] = [];
  const faltante: InformacionFaltante[] = [];

  if (typeof input.contactos_mes !== 'number') {
    faltante.push({
      dato: 'Cuántas personas te preguntan o contactan al mes',
      por_que_importa: 'Dice si tu problema es atraer clientes o convertir a los que ya llegan.',
    });
  }
  if (typeof input.tasa_cierre_pct !== 'number') {
    faltante.push({
      dato: 'De cada 10 que preguntan, cuántos compran',
      por_que_importa: 'Es la métrica que más rápido mejoran los tips de cierre y seguimiento.',
    });
  }
  if (!input.ciclo_venta) {
    faltante.push({
      dato: 'Cuánto tarda un cliente desde que pregunta hasta que paga',
      por_que_importa: 'Cambia cuándo y cuántas veces conviene dar seguimiento.',
    });
  }
  if (!input.objeciones_frecuentes?.trim()) {
    faltante.push({
      dato: 'Lo que más te dicen tus clientes para no comprar',
      por_que_importa: 'Con sus palabras reales las rebatidas dejan de ser genéricas.',
    });
  }
  // Los cuatro de arriba son el embudo; lo de abajo completa el contexto.
  const embudoFaltante = faltante.length;
  if (!input.quien_decide && (input.tipo_venta === 'B2B' || input.tipo_venta === 'hibrido')) {
    faltante.push({
      dato: 'Quién decide la compra en tus clientes',
      por_que_importa: 'Si decide un comité o el dueño, el mensaje y el seguimiento cambian por completo.',
    });
  }
  if (!input.descripcion?.trim()) {
    faltante.push({
      dato: 'Una descripción de tu producto o servicio',
      por_que_importa: 'Sin ella los ejemplos no pueden usar lo que lo hace distinto.',
    });
  }

  if (embudoFaltante === 4) {
    supuestos.push('Sin datos de tu embudo, los tips parten de tu tipo de venta y tu canal, no de cómo te va hoy.');
  }
  if (conHistoria) {
    supuestos.push('La historia del día es un caso compuesto e ilustrativo: el personaje y sus cifras no son de una persona real.');
  }

  let nivel: NivelConfianza = embudoFaltante <= 2 ? 'medio' : 'bajo';
  if (embudoFaltante === 0 && input.descripcion?.trim()) nivel = 'alto';

  return {
    supuestos,
    informacion_faltante: faltante.slice(0, 6),
    nivel_confianza: nivel,
    motivo_confianza: embudoFaltante
      ? `Faltan ${embudoFaltante} de 4 datos de tu embudo de ventas; la confianza sube al completarlos.`
      : 'Están los datos de tu embudo de ventas.',
  };
}

/**
 * `meta_ia` de un análisis de Ventas: transparencia (lo del código más lo que
 * aporta la IA en los tips, con la confianza más prudente), secciones extra,
 * secciones ocultas y versiones de prompt usadas.
 */
export function construirMetaIaVentas(p: {
  input: VentasAnalisisInput;
  tips: ResultadoTips;
  modo: VersionResuelta;
  ocultas: ReadonlySet<string>;
  /** Secciones escritas por la IA o su plantilla (deciden el `origen`). */
  seccionesIA: { es_mock?: boolean }[];
  conHistoria: boolean;
}): MetaIaAnalisis {
  const base = transparenciaBaseVentas(p.input, p.conHistoria);
  // En Ventas todo lo escribe la IA: si salió de plantilla, el embudo completo
  // no lo vuelve confiable (son tips generales, no los de este negocio).
  if (p.tips.es_mock) {
    base.nivel_confianza = 'bajo';
    base.motivo_confianza = `La IA no estuvo disponible: los tips y el perfil son de una plantilla general. ${base.motivo_confianza}`;
    base.supuestos = ['Los tips y el perfil de cliente salieron de una plantilla general, no de un análisis de tu negocio.', ...base.supuestos].slice(0, 8);
  }
  const deIA = p.tips.contrato
    ? aplicarContratoComun(p.tips.contrato, {
        seccionesExtra: p.tips.sistema?.seccionesExtra ?? [],
        confianzaMaxima: base.nivel_confianza,
      })
    : null;
  // Verificador de cifras: lo que la IA calculó por su cuenta en los tips se
  // dice como estimación suya (la plantilla no se revisa: la escribe el código).
  const transparencia = combinarTransparencia(base, deIA?.transparencia);
  const cifras = p.tips.es_mock
    ? []
    : marcarCifrasSinRespaldo(
        transparencia,
        [...textosDe(p.tips.tips), ...textosDe(deIA?.secciones_extra ?? [])],
        [...numerosDe(p.input), ...numerosDelSistema(p.tips.sistema)]
      );
  return {
    transparencia,
    secciones_extra: deIA?.secciones_extra ?? [],
    secciones_ocultas: [...p.ocultas],
    meta: {
      contrato: CONTRATO_VENTAS,
      origen: origenDe(p.seccionesIA),
      versiones_prompt: p.tips.sistema?.versiones ?? {
        [p.modo.clave]: { id: p.modo.id, version: p.modo.version, origen: p.modo.origen },
      },
      contexto_usado: {
        pais: p.input.pais,
        moneda: getMoneda(p.input.pais || 'MX'),
        estatus: p.input.estatus,
        tipo_actividad: p.input.tipo_actividad,
        embudo_declarado: {
          contactos_mes: p.input.contactos_mes ?? null,
          tasa_cierre_pct: p.input.tasa_cierre_pct ?? null,
          ciclo_venta: p.input.ciclo_venta ?? null,
          quien_decide: p.input.quien_decide ?? null,
          objeciones: Boolean(p.input.objeciones_frecuentes?.trim()),
        },
        cifras_sin_respaldo: cifras,
      },
    },
  };
}
