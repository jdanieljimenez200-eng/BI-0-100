// ─── Fusión censo oficial × competencia web (servicio PURO) ───────────────────
// Sin DB ni HTTP: es lo que cubren los unit tests, según la convención del
// proyecto (solo los servicios puros están testeados).
//
// Reglas de fusión, deliberadamente conservadoras:
//
//  • `total_competidores` pasa a ser el conteo del censo oficial cuando existe.
//    Un censo real desplaza a una muestra de buscador. El valor web se preserva
//    en `total_competidores_web` para no perder trazabilidad.
//  • El array `competidores` NO se rellena con establecimientos oficiales. El
//    censo no trae precio ni rating, y meter filas con precio 0 y rating 0
//    contaminaría `precio_mercado_promedio` y cualquier promedio de rating.
//    Los establecimientos viven en `censo_oficial.establecimientos`.
//  • Sí se enriquece cada competidor web que aparezca en el censo: se le
//    completa `tiempo_en_mercado` cuando era desconocido, usando la fecha de
//    alta oficial. Nunca se sobreescribe un dato que ya existía.
//  • Si la muestra web es mucho menor que el censo, se emite
//    `advertencia_muestra`: evita que "solo 3 resultados" se interprete como
//    "mercado vacío" cuando el censo registra cientos de establecimientos.

import type { CompetenciaResult, Competidor } from '../mercado/types';
import type { CensoOficialResult, EstablecimientoOficial } from './types';

/** Factor a partir del cual la muestra web se considera no representativa. */
const FACTOR_MUESTRA_SOSPECHOSA = 3;

const SUFIJOS_LEGALES = [
  'sa de cv', 's a de c v', 'sapi de cv', 'srl de cv', 's de rl de cv',
  's de rl', 'srl', 'sas', 'sa', 'sc', 'ac', 'cv', 'ltda', 'inc', 'llc',
];

/** Normaliza un nombre comercial para comparar entre fuentes distintas. */
export function normalizarNombreComercial(nombre: string): string {
  let base = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const sufijo of SUFIJOS_LEGALES) {
    if (base.endsWith(` ${sufijo}`)) {
      base = base.slice(0, base.length - sufijo.length - 1).trim();
    }
  }
  return base;
}

/** Coincidencia por inclusión bidireccional, con mínimo de 4 caracteres para
 *  no emparejar por casualidad nombres cortos como "hi" o "sol". */
export function mismoNegocio(nombreA: string, nombreB: string): boolean {
  const a = normalizarNombreComercial(nombreA);
  const b = normalizarNombreComercial(nombreB);
  if (a.length < 4 || b.length < 4) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function buscarEnCenso(
  competidor: Competidor,
  establecimientos: EstablecimientoOficial[],
): EstablecimientoOficial | undefined {
  return establecimientos.find(
    (e) =>
      mismoNegocio(competidor.nombre, e.nombre) ||
      (e.razon_social != null && mismoNegocio(competidor.nombre, e.razon_social)),
  );
}

function enriquecer(
  competidor: Competidor,
  establecimientos: EstablecimientoOficial[],
): Competidor {
  const oficial = buscarEnCenso(competidor, establecimientos);
  if (!oficial) return competidor;

  const antiguedadDesconocida =
    !competidor.tiempo_en_mercado ||
    competidor.tiempo_en_mercado.trim().length === 0 ||
    /desconocid/i.test(competidor.tiempo_en_mercado);

  const tiempoEnMercado =
    antiguedadDesconocida && oficial.antiguedad
      ? `Registrado oficialmente desde ${oficial.antiguedad}`
      : competidor.tiempo_en_mercado;

  const fortalezaOficial = oficial.estrato_personal
    ? `Registro oficial vigente (${oficial.estrato_personal})`
    : 'Registro oficial vigente';

  return {
    ...competidor,
    tiempo_en_mercado: tiempoEnMercado,
    distancia_km: competidor.distancia_km ?? oficial.distancia_km,
    fortalezas: competidor.fortalezas.includes(fortalezaOficial)
      ? competidor.fortalezas
      : [...competidor.fortalezas, fortalezaOficial],
  };
}

export function fusionarCompetenciaOficial(
  competencia: CompetenciaResult,
  censo: CensoOficialResult | null,
): CompetenciaResult {
  if (!censo) return competencia;

  // Fuente oficial inexistente o sin conteo: se adjunta igual, porque la
  // AUSENCIA declarada también es información para el prompt y para la UI.
  if (!censo.disponible || censo.total_establecimientos === null) {
    return { ...competencia, censo_oficial: censo };
  }

  const totalOficial = censo.total_establecimientos;
  const totalWeb = competencia.total_competidores;
  const competidores = competencia.competidores.map((c) => enriquecer(c, censo.establecimientos));

  let advertencia: string | undefined;
  if (totalWeb === 0 && totalOficial > 0) {
    advertencia =
      `Las fuentes web no devolvieron competidores, pero el censo de ${censo.instituto} registra ` +
      `${totalOficial} establecimientos en el ámbito analizado. No es un mercado vacío: es un mercado sin presencia digital.`;
  } else if (totalWeb > 0 && totalOficial > totalWeb * FACTOR_MUESTRA_SOSPECHOSA) {
    advertencia =
      `Muestra web de ${totalWeb} competidores frente a ${totalOficial} establecimientos en el censo de ` +
      `${censo.instituto}. Los precios provienen de la muestra web; el conteo y la densidad, del censo oficial.`;
  }

  return {
    ...competencia,
    total_competidores: totalOficial,
    total_competidores_web: totalWeb,
    competidores,
    censo_oficial: censo,
    ...(advertencia ? { advertencia_muestra: advertencia } : {}),
  };
}