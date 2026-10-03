import type { CompetenciaResult, TendenciasResult, ViabilidadResult } from './types';
import { camposSinResponder, type PerfilNegocio } from '../ia/perfilNegocio';
import type { EstatusProyecto } from '../../utils/estatusProyecto';
import {
  aplicarContratoComun,
  combinarTransparencia,
  nivelDesdeConfianzaDatos,
  type InformacionFaltante,
  type TransparenciaIA,
} from '../ia/contratoComun';
import { origenDe, type MetaIaAnalisis } from '../ia/metaAnalisis';
import type { VersionResuelta } from '../ia/registroPrompts';
import type { ResultadoReporteBi } from './reporteBiService';

/**
 * Forma del resultado de Mercado.
 *  - mercado@1: secciones sin transparencia.
 *  - mercado@2: + meta_ia (confianza, supuestos, datos faltantes, secciones extra/ocultas, versiones).
 */
export const CONTRATO_MERCADO = 'mercado@2';

/**
 * Lo que el código sabe con certeza sobre la calidad de un análisis de Mercado:
 * qué fuentes faltaron y qué datos no dio el dueño. La confianza sale de la
 * cobertura del modelo de viabilidad, no de la opinión del modelo de IA.
 */
export interface DatosTransparenciaMercado {
  viabilidad: ViabilidadResult;
  competencia: CompetenciaResult;
  tendencias: TendenciasResult;
  precioUsuario?: number;
  estatus: EstatusProyecto;
  clientesMes?: number | null;
  puv?: string | null;
  clienteIdeal?: string | null;
  competidoresConocidos?: string | null;
  perfil: PerfilNegocio;
}

export function transparenciaBaseMercado(d: DatosTransparenciaMercado): TransparenciaIA {
  const supuestos: string[] = [];
  const faltante: InformacionFaltante[] = [];

  if (!d.tendencias.fuente_disponible || d.tendencias.es_mock) {
    supuestos.push('La demanda se estimó con referencias de la categoría: no hubo datos de búsqueda verificados.');
  }
  if (!d.competencia.fuente_disponible) {
    supuestos.push('Ninguna fuente devolvió competidores: la competencia no entró en el puntaje (no significa que no exista).');
  } else if (d.competencia.es_mock) {
    supuestos.push('La competencia se estimó con referencias del sector, no con competidores encontrados.');
  }

  if (!d.precioUsuario) {
    faltante.push({
      dato: 'Tu precio de venta',
      por_que_importa: 'Sin él no se puede comparar con el mercado ni estimar el margen.',
    });
  }
  if (d.estatus === 'en_marcha' && !d.clientesMes) {
    faltante.push({
      dato: 'Cuántos clientes atiendes al mes',
      por_que_importa: 'Con la tracción real se contrasta el potencial con lo que ya vendes.',
    });
  }
  if (!d.puv?.trim()) {
    faltante.push({
      dato: 'Qué te hace distinto de la competencia',
      por_que_importa: 'Es la base para encontrar el hueco que puedes ocupar.',
    });
  }
  if (!d.clienteIdeal?.trim()) {
    faltante.push({
      dato: 'Quién es tu cliente ideal',
      por_que_importa: 'Define el segmento del mercado que de verdad puedes alcanzar.',
    });
  }
  if (!d.perfil.tipo_clientes) {
    faltante.push({
      dato: 'A quién le vendes (personas, empresas o gobierno)',
      por_que_importa: 'Cambia el tamaño del mercado, la competencia y el canal.',
    });
  }
  if (!d.competidoresConocidos?.trim()) {
    faltante.push({
      dato: 'Los competidores que ya conoces',
      por_que_importa: 'Completan lo que las fuentes automáticas no encuentran.',
    });
  }

  const cobertura = Math.round((d.viabilidad.cobertura_datos ?? 0) * 100);
  const noEvaluados = d.viabilidad.factores_no_evaluados ?? [];
  const motivo =
    `Se pudo evaluar el ${cobertura} % del modelo de viabilidad` +
    (noEvaluados.length ? `; quedaron sin datos: ${noEvaluados.join(', ')}.` : '.');

  return {
    supuestos,
    informacion_faltante: faltante.slice(0, 6),
    nivel_confianza: nivelDesdeConfianzaDatos(d.viabilidad.confianza),
    motivo_confianza: motivo,
  };
}

/**
 * `meta_ia` de un análisis de Mercado: transparencia (lo que sabe el código,
 * más lo que aporta el reporte BI, con la confianza más prudente de las dos),
 * secciones extra, secciones ocultas y versiones de prompt usadas.
 */
export function construirMetaIaMercado(p: {
  datos: DatosTransparenciaMercado;
  reporteBi: ResultadoReporteBi | null;
  modo: VersionResuelta;
  ocultas: ReadonlySet<string>;
  seccionesIA: { es_mock?: boolean }[];
  tipoActividad: string;
}): MetaIaAnalisis {
  const base = transparenciaBaseMercado(p.datos);
  const deIA = p.reporteBi?.contrato
    ? aplicarContratoComun(p.reporteBi.contrato, {
        seccionesExtra: p.reporteBi.sistema?.seccionesExtra ?? [],
        confianzaMaxima: base.nivel_confianza,
      })
    : null;
  const perfil = p.datos.perfil;
  const sinResponder = camposSinResponder(perfil);
  return {
    transparencia: combinarTransparencia(base, deIA?.transparencia),
    secciones_extra: deIA?.secciones_extra ?? [],
    secciones_ocultas: [...p.ocultas],
    meta: {
      contrato: CONTRATO_MERCADO,
      origen: origenDe(p.seccionesIA),
      versiones_prompt: p.reporteBi?.sistema?.versiones ?? {
        [p.modo.clave]: { id: p.modo.id, version: p.modo.version, origen: p.modo.origen },
      },
      contexto_usado: {
        estatus: p.datos.estatus,
        tipo_actividad: p.tipoActividad,
        cobertura_datos: p.datos.viabilidad.cobertura_datos,
        perfil_respondido: Object.keys(perfil).filter((c) => !sinResponder.includes(c as keyof PerfilNegocio)),
        perfil_sin_responder: sinResponder,
      },
    },
  };
}
