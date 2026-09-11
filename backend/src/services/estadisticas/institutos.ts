// Registro de institutos nacionales de estadística, indexado con las MISMAS
// claves ISO-2 que PAIS_LATAM en utils/latam.ts (una sola fuente de verdad
// para la lista de países).
//
// `capacidad` es deliberadamente honesta: solo México tiene hoy un directorio
// de establecimientos consultable por radio (DENUE). El resto expone series
// estadísticas o nada. Marcarlo evita que el LLM atribuya a un instituto
// cifras que nunca consultamos.

import type { InstitutoEstadistico } from './types';

export const INSTITUTOS: Record<string, InstitutoEstadistico> = {
  MX: {
    pais: 'MX', siglas: 'INEGI',
    nombre: 'Instituto Nacional de Estadística y Geografía',
    url: 'https://www.inegi.org.mx',
    capacidad: 'directorio',
    api_url: 'https://www.inegi.org.mx/app/api/denue/v1/consulta',
    requiere_token: true,
    nota: 'DENUE: censo de ~5 M de establecimientos con actividad, estrato de personal ocupado, domicilio y coordenadas. NO contiene precios, calificaciones ni reseñas.',
  },
  GT: {
    pais: 'GT', siglas: 'INE',
    nombre: 'Instituto Nacional de Estadística de Guatemala',
    url: 'https://www.ine.gob.gt',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica censos y encuestas en descarga, sin API REST pública de establecimientos.',
  },
  BZ: {
    pais: 'BZ', siglas: 'SIB',
    nombre: 'Statistical Institute of Belize',
    url: 'https://sib.org.bz',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica informes y censos en descarga, sin API REST pública.',
  },
  HN: {
    pais: 'HN', siglas: 'INE',
    nombre: 'Instituto Nacional de Estadística de Honduras',
    url: 'https://ine.gob.hn',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica encuestas de hogares en descarga, sin API REST pública.',
  },
  SV: {
    pais: 'SV', siglas: 'ONEC',
    nombre: 'Oficina Nacional de Estadística y Censos (BCR)',
    url: 'https://onec.bcr.gob.sv',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica censos y directorio de unidades económicas en descarga, sin API REST pública.',
  },
  NI: {
    pais: 'NI', siglas: 'INIDE',
    nombre: 'Instituto Nacional de Información de Desarrollo',
    url: 'https://www.inide.gob.ni',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica censos y anuarios en descarga, sin API REST pública.',
  },
  CR: {
    pais: 'CR', siglas: 'INEC',
    nombre: 'Instituto Nacional de Estadística y Censos de Costa Rica',
    url: 'https://inec.cr',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica censos y encuestas en descarga, sin API REST pública de establecimientos.',
  },
  PA: {
    pais: 'PA', siglas: 'INEC',
    nombre: 'Instituto Nacional de Estadística y Censo (Contraloría)',
    url: 'https://www.inec.gob.pa',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica censos y estadísticas económicas en descarga, sin API REST pública.',
  },
  CO: {
    pais: 'CO', siglas: 'DANE',
    nombre: 'Departamento Administrativo Nacional de Estadística',
    url: 'https://www.dane.gov.co',
    capacidad: 'solo_macro',
    api_url: 'https://www.datos.gov.co/resource',
    requiere_token: false,
    nota: 'El portal de datos abiertos expone datasets (Socrata), no un directorio de establecimientos consultable por radio. La estratificación DANE sí es referencia oficial de NSE.',
  },
  VE: {
    pais: 'VE', siglas: 'INE',
    nombre: 'Instituto Nacional de Estadística de Venezuela',
    url: 'http://www.ine.gov.ve',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publicación irregular y sin API REST pública.',
  },
  EC: {
    pais: 'EC', siglas: 'INEC',
    nombre: 'Instituto Nacional de Estadística y Censos de Ecuador',
    url: 'https://www.ecuadorencifras.gob.ec',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica el Directorio de Empresas y la clasificación NSE en descarga, sin API REST pública.',
  },
  PE: {
    pais: 'PE', siglas: 'INEI',
    nombre: 'Instituto Nacional de Estadística e Informática',
    url: 'https://www.inei.gob.pe',
    capacidad: 'solo_macro',
    api_url: 'https://www.datosabiertos.gob.pe/api/3/action',
    requiere_token: false,
    nota: 'El portal nacional expone datasets (CKAN), no un directorio de establecimientos por radio.',
  },
  BO: {
    pais: 'BO', siglas: 'INE',
    nombre: 'Instituto Nacional de Estadística de Bolivia',
    url: 'https://www.ine.gob.bo',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica censos y estadísticas en descarga, sin API REST pública.',
  },
  CL: {
    pais: 'CL', siglas: 'INE',
    nombre: 'Instituto Nacional de Estadísticas de Chile',
    url: 'https://www.ine.gob.cl',
    capacidad: 'solo_macro',
    api_url: 'https://datos.gob.cl/api/3/action',
    requiere_token: false,
    nota: 'El portal de datos abiertos expone datasets (CKAN); el directorio de empresas del SII se publica en descarga, sin API por radio.',
  },
  AR: {
    pais: 'AR', siglas: 'INDEC',
    nombre: 'Instituto Nacional de Estadística y Censos',
    url: 'https://www.indec.gob.ar',
    capacidad: 'solo_macro',
    api_url: 'https://apis.datos.gob.ar/series/api',
    requiere_token: false,
    nota: 'La API de series de tiempo del Estado da indicadores macro, no un directorio de establecimientos.',
  },
  UY: {
    pais: 'UY', siglas: 'INE',
    nombre: 'Instituto Nacional de Estadística de Uruguay',
    url: 'https://www.gub.uy/instituto-nacional-estadistica',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica censos y encuestas en descarga, sin API REST pública de establecimientos.',
  },
  PY: {
    pais: 'PY', siglas: 'INE',
    nombre: 'Instituto Nacional de Estadística de Paraguay',
    url: 'https://www.ine.gov.py',
    capacidad: 'sin_api', api_url: null, requiere_token: false,
    nota: 'Publica censos y encuestas en descarga, sin API REST pública.',
  },
  BR: {
    pais: 'BR', siglas: 'IBGE',
    nombre: 'Instituto Brasileiro de Geografia e Estatística',
    url: 'https://www.ibge.gov.br',
    capacidad: 'solo_macro',
    api_url: 'https://servicodados.ibge.gov.br/api',
    requiere_token: false,
    nota: 'API abierta de agregados y malla territorial (SIDRA); el CEMPRE da conteo de empresas por sector y municipio, pero no un directorio consultable por radio.',
  },
};

/** Fallback: si un país no está en el registro, se devuelve un instituto
 *  declarado como inexistente en vez de `undefined`, para que el consumidor
 *  nunca tenga que decidir qué hacer con un hueco. */
export function getInstituto(pais?: string | null): InstitutoEstadistico {
  const codigo = (pais ?? 'MX').trim().toUpperCase();
  return (
    INSTITUTOS[codigo] ?? {
      pais: codigo,
      siglas: 'N/D',
      nombre: 'Sin instituto de estadística registrado',
      url: '',
      capacidad: 'sin_api',
      api_url: null,
      requiere_token: false,
      nota: 'País fuera del registro LATAM: no hay fuente oficial integrada. Se usa Banco Mundial como suelo cuantitativo.',
    }
  );
}

/** `true` solo cuando el país tiene un censo de establecimientos consultable. */
export function tieneDirectorioOficial(pais?: string | null): boolean {
  return getInstituto(pais).capacidad === 'directorio';
}