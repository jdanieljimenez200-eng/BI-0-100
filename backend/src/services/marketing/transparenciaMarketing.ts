import { marcarCifrasSinRespaldo, numerosDe, numerosDelSistema, textosDe } from '../ia/verificadorCifras';
import type { MarketingAnalisisInput } from './types';
import type { ResultadoCalendario } from './calendarioService';
import {
  aplicarContratoComun,
  combinarTransparencia,
  type InformacionFaltante,
  type NivelConfianza,
  type TransparenciaIA,
} from '../ia/contratoComun';
import { origenDe, type MetaIaAnalisis } from '../ia/metaAnalisis';
import type { VersionResuelta } from '../ia/registroPrompts';

/**
 * Forma del resultado de Marketing.
 *  - marketing@1: estrategias, copies y calendario sin transparencia.
 *  - marketing@2: + «Afina tu análisis» (lo ya probado, activos, zona) y meta_ia.
 */
export const CONTRATO_MARKETING = 'marketing@2';

export interface DatosTransparenciaMarketing {
  input: MarketingAnalisisInput;
  /** Hubo un análisis de Mercado del producto para usar como contexto. */
  conMercado: boolean;
  /** De dónde salió el cliente ideal: el ICP de Ventas, el texto del formulario o ninguno. */
  clienteIdeal: 'ventas' | 'formulario' | null;
  conBrief: boolean;
  /** El calendario salió de plantilla (sin IA). */
  calendarioDePlantilla: boolean;
}

/**
 * Lo que el código sabe con certeza: qué contexto faltó. La confianza la fija
 * esto (y el que el calendario sea de plantilla), no el modelo.
 */
export function transparenciaBaseMarketing(d: DatosTransparenciaMarketing): TransparenciaIA {
  const supuestos: string[] = [];
  const faltante: InformacionFaltante[] = [];

  if (!d.conMercado) {
    faltante.push({
      dato: 'Un análisis de Mercado de este producto',
      por_que_importa: 'Aporta el hueco del mercado y la competencia con los que el calendario te diferencia.',
    });
  }
  if (!d.clienteIdeal) {
    faltante.push({
      dato: 'Quién es tu cliente ideal (o un análisis de Ventas con su perfil)',
      por_que_importa: 'Sin él, los mensajes le hablan a todos y no convencen a nadie.',
    });
  }
  if (!d.input.yaProbado?.trim()) {
    faltante.push({
      dato: 'Qué ya probaste en redes o anuncios que no funcionó',
      por_que_importa: 'Evita que el plan te recomiende lo mismo que ya no te dio resultado.',
    });
  }
  if (!d.input.activos?.length) {
    faltante.push({
      dato: 'Con qué cuentas para producir contenido (fotos, videos, testimonios, seguidores…)',
      por_que_importa: 'El plan solo sirve si puedes producirlo con lo que ya tienes.',
    });
  }
  // Los cuatro de arriba fijan la confianza; lo de abajo la completa.
  const claves = faltante.length;
  if (!d.input.zonaClientes?.trim()) {
    faltante.push({
      dato: 'Dónde están tus clientes (zona, ciudad o país)',
      por_que_importa: 'Cambia la segmentación de los anuncios y las fechas que conviene aprovechar.',
    });
  }
  if (!d.input.reporteAds) {
    supuestos.push('La simulación de Ventas+ usa un costo por clic de referencia del país, no el de tu cuenta de anuncios.');
  }
  if (!d.calendarioDePlantilla) {
    supuestos.push('Las cifras de alcance, engagement y vistas de las tendencias son estimaciones de la IA, no datos medidos.');
  }
  if (d.clienteIdeal === 'ventas') {
    supuestos.push('El cliente ideal se tomó del perfil de tu análisis de Ventas, no del texto de este formulario.');
  }

  let nivel: NivelConfianza = claves <= 2 ? 'medio' : 'bajo';
  if (claves === 0 && d.input.reporteAds) nivel = 'alto';
  let motivo = claves
    ? `Falta ${claves === 1 ? '1 dato' : `${claves} datos`} de contexto de 4 (mercado, cliente ideal, lo que ya probaste y tus activos).`
    : d.input.reporteAds
      ? 'Están el contexto del negocio y los resultados reales de tus anuncios.'
      : 'Está el contexto del negocio; con un reporte de tus anuncios la confianza sube.';

  if (d.calendarioDePlantilla) {
    nivel = 'bajo';
    motivo = `La IA no estuvo disponible: el calendario es una plantilla general. ${motivo}`;
    supuestos.unshift('El calendario salió de una plantilla general, no de un análisis de tu negocio.');
  }

  return {
    supuestos: supuestos.slice(0, 8),
    informacion_faltante: faltante.slice(0, 6),
    nivel_confianza: nivel,
    motivo_confianza: motivo,
  };
}

/**
 * `meta_ia` de un análisis de Marketing: transparencia (lo del código más lo
 * que aporta la IA del calendario, con la confianza más prudente), secciones
 * extra, secciones ocultas y versiones de prompt usadas.
 */
export function construirMetaIaMarketing(p: {
  datos: DatosTransparenciaMarketing;
  calendario: ResultadoCalendario;
  modo: VersionResuelta;
  ocultas: ReadonlySet<string>;
  /** Partes escritas por la IA o su plantilla (calendario y copies). */
  seccionesIA: { es_mock?: boolean }[];
  contexto: Record<string, unknown>;
  /** Números del caso (estrategias calculadas, precio) contra los que se revisan las cifras de la IA. */
  cifrasConocidas?: unknown[];
}): MetaIaAnalisis {
  const base = transparenciaBaseMarketing(p.datos);
  const deIA = p.calendario.contrato
    ? aplicarContratoComun(p.calendario.contrato, {
        seccionesExtra: p.calendario.sistema?.seccionesExtra ?? [],
        confianzaMaxima: base.nivel_confianza,
      })
    : null;
  // Verificador de cifras sobre las publicaciones del calendario (precios,
  // descuentos, plazos). Las tendencias ya se rotulan «Estimado» en pantalla.
  const transparencia = combinarTransparencia(base, deIA?.transparencia);
  const cifras = p.calendario.es_mock
    ? []
    : marcarCifrasSinRespaldo(
        transparencia,
        [...textosDe(p.calendario.calendario.semanas), ...textosDe(deIA?.secciones_extra ?? [])],
        [...numerosDe(p.datos.input, p.contexto, ...(p.cifrasConocidas ?? [])), ...numerosDelSistema(p.calendario.sistema)]
      );
  return {
    transparencia,
    secciones_extra: deIA?.secciones_extra ?? [],
    secciones_ocultas: [...p.ocultas],
    meta: {
      contrato: CONTRATO_MARKETING,
      origen: origenDe(p.seccionesIA),
      versiones_prompt: p.calendario.sistema?.versiones ?? {
        [p.modo.clave]: { id: p.modo.id, version: p.modo.version, origen: p.modo.origen },
      },
      contexto_usado: { ...p.contexto, cifras_sin_respaldo: cifras },
    },
  };
}
