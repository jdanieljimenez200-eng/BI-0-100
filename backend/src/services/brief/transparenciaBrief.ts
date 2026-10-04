import type { BriefAnalisisInput, BriefResultado, UsoMarca } from './types';
import {
  aplicarContratoComun,
  combinarTransparencia,
  type InformacionFaltante,
  type NivelConfianza,
  type SalidaContratoComun,
  type TransparenciaIA,
} from '../ia/contratoComun';
import { origenDe, type MetaIaAnalisis } from '../ia/metaAnalisis';
import type { SistemaCompuesto } from '../ia/componerSistema';
import type { VersionResuelta } from '../ia/registroPrompts';
import { marcarCifrasSinRespaldo, numerosDe, numerosDelSistema, textosDe } from '../ia/verificadorCifras';

/**
 * Forma del resultado del Brief.
 *  - brief@1: identidad, visual, diagnóstico y puntaje sin transparencia (el
 *    puntaje de la plantilla era un 8.5 fijo).
 *  - brief@2: + modo editable, «Afina tu análisis», puntaje explicado (de la IA
 *    o por reglas) y meta_ia.
 */
export const CONTRATO_BRIEF = 'brief@2';

export const ETIQUETA_USO: Record<UsoMarca, string> = {
  empaque: 'empaque o etiquetas',
  local_letrero: 'letrero o fachada del local',
  uniformes: 'uniformes',
  redes_sociales: 'redes sociales y WhatsApp',
  vehiculo: 'vehículo rotulado',
  sitio_web: 'sitio web o tienda en línea',
  impresos: 'impresos (tarjetas, volantes, menús)',
};

/** Lo del producto que usa el Brief (el real o el de un caso de prueba del panel). */
export interface ProductoBrief {
  nombre: string;
  categoria?: string | null;
  descripcion?: string | null;
  puv?: string | null;
  cliente_ideal?: string | null;
  pais?: string | null;
}

/**
 * Lo que el código sabe: qué datos que cambian el brief no se declararon. La
 * confianza la fija esto (cuánto se sabe del negocio y de lo que ya tiene), no
 * el modelo.
 */
export function transparenciaBaseBrief(input: BriefAnalisisInput, producto: ProductoBrief, esPlantilla: boolean): TransparenciaIA {
  const supuestos: string[] = [];
  const faltante: InformacionFaltante[] = [];

  if (!producto.cliente_ideal?.trim()) {
    faltante.push({
      dato: 'Quién es tu cliente ideal',
      por_que_importa: 'La voz, los slogans y el estilo cambian si le hablas a oficinistas, a mamás o a empresas.',
    });
  }
  if (!producto.puv?.trim()) {
    faltante.push({
      dato: 'Qué te hace distinto de quien vende lo mismo cerca (tu propuesta de valor)',
      por_que_importa: 'Sin ella el diferenciador de la marca es una suposición.',
    });
  }
  // Los dos de arriba son la base; lo de abajo afina la identidad.
  const base = faltante.length;
  if (!input.marcas_admiradas?.trim() && !input.marcas_evitar?.trim()) {
    faltante.push({
      dato: 'Marcas que te gustan y marcas a las que no te quieres parecer',
      por_que_importa: 'Son la referencia de estilo más rápida para el diseñador.',
    });
  }
  if (!input.elementos_conservar?.trim()) {
    supuestos.push('Se asumió que no hay nombre, logo, colores ni frases que conservar.');
    faltante.push({
      dato: 'Qué ya tienes y quieres conservar (logo, colores, frase)',
      por_que_importa: 'Si tus clientes ya te reconocen por algo, cambiarlo cuesta.',
    });
  }
  if (!input.usos_marca?.length) {
    supuestos.push('Se asumió un uso general de la marca: redes sociales y piezas impresas.');
    faltante.push({
      dato: 'Dónde vas a usar la marca (empaque, letrero, uniformes, vehículo…)',
      por_que_importa: 'Cada uso exige algo distinto del logo y los colores.',
    });
  }

  let nivel: NivelConfianza = base === 0 ? 'medio' : base === 1 ? 'medio' : 'bajo';
  if (base === 0 && faltante.length <= 1) nivel = 'alto';
  let motivo = base
    ? `Falta${base === 1 ? '' : 'n'} ${base} de 2 datos base del negocio (cliente ideal y propuesta de valor).`
    : 'Están el cliente ideal y la propuesta de valor del negocio.';

  if (esPlantilla) {
    nivel = 'bajo';
    motivo = `La IA no estuvo disponible: el brief es una plantilla general. ${motivo}`;
    supuestos.unshift('El brief salió de una plantilla general, no de un análisis de tu marca; el puntaje se calculó por reglas con lo que declaraste.');
  }

  return {
    supuestos: supuestos.slice(0, 8),
    informacion_faltante: faltante.slice(0, 6),
    nivel_confianza: nivel,
    motivo_confianza: motivo,
  };
}

/**
 * `meta_ia` de un Brief: transparencia (lo del código más lo que aporta la IA,
 * con la confianza más prudente), secciones extra, secciones ocultas, versiones
 * de prompt y el verificador de cifras sobre lo que escribió la IA.
 */
export function construirMetaIaBrief(p: {
  input: BriefAnalisisInput;
  producto: ProductoBrief;
  resultado: BriefResultado;
  contrato: SalidaContratoComun | null;
  sistema: SistemaCompuesto | null;
  modo: VersionResuelta;
  ocultas: ReadonlySet<string>;
}): MetaIaAnalisis {
  const base = transparenciaBaseBrief(p.input, p.producto, p.resultado.es_mock);
  const deIA = p.contrato
    ? aplicarContratoComun(p.contrato, {
        seccionesExtra: p.sistema?.seccionesExtra ?? [],
        confianzaMaxima: base.nivel_confianza,
      })
    : null;
  const transparencia = combinarTransparencia(base, deIA?.transparencia);
  // La paleta y las tipografías las pone el código: solo se revisa la prosa de la IA.
  const { identidad_visual, score_marca, ...prosa } = p.resultado;
  const cifras = p.resultado.es_mock
    ? []
    : marcarCifrasSinRespaldo(
        transparencia,
        [...textosDe(prosa), ...textosDe(identidad_visual.concepto_logo), ...textosDe(identidad_visual.descripcion_isotipo), ...textosDe(identidad_visual.estilo_grafico), ...textosDe(deIA?.secciones_extra ?? [])],
        [...numerosDe(p.input, p.producto, score_marca), ...numerosDelSistema(p.sistema)]
      );

  return {
    transparencia,
    secciones_extra: deIA?.secciones_extra ?? [],
    secciones_ocultas: [...p.ocultas],
    meta: {
      contrato: CONTRATO_BRIEF,
      origen: origenDe([{ es_mock: p.resultado.es_mock }]),
      versiones_prompt: p.sistema?.versiones ?? {
        [p.modo.clave]: { id: p.modo.id, version: p.modo.version, origen: p.modo.origen },
      },
      contexto_usado: {
        pais: p.producto.pais ?? 'MX',
        con_cliente_ideal: Boolean(p.producto.cliente_ideal?.trim()),
        con_puv: Boolean(p.producto.puv?.trim()),
        marcas_referencia: Boolean(p.input.marcas_admiradas?.trim() || p.input.marcas_evitar?.trim()),
        elementos_conservar: Boolean(p.input.elementos_conservar?.trim()),
        usos_marca: p.input.usos_marca ?? [],
        origen_puntaje: p.resultado.score_marca.origen ?? 'ia',
        cifras_sin_respaldo: cifras,
      },
    },
  };
}
