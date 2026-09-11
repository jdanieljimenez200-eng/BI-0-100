/**
 * País ISO → zona horaria IANA.
 *
 * Solo se usa donde la HORA importa (el heatmap de horarios del POS, que agrupa
 * por hora del día). Las series por fecha usan `ventas.fecha`, que es un `date`
 * sin hora y por tanto inmune al desfase.
 *
 * Para los países con varias zonas se toma la del centro económico principal:
 * es la que corresponde al negocio típico de la plataforma, y una diferencia de
 * una hora en un heatmap no cambia ninguna decisión. Si algún día hace falta
 * precisión real, el dato tiene que venir del negocio, no del país.
 */
const TZ_POR_PAIS: Record<string, string> = {
  MX: 'America/Mexico_City',
  CO: 'America/Bogota',
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  PE: 'America/Lima',
  EC: 'America/Guayaquil',
  BR: 'America/Sao_Paulo',
  GT: 'America/Guatemala',
  PA: 'America/Panama',
  CR: 'America/Costa_Rica',
  HN: 'America/Tegucigalpa',
  SV: 'America/El_Salvador',
  NI: 'America/Managua',
  BZ: 'America/Belize',
  VE: 'America/Caracas',
  BO: 'America/La_Paz',
  UY: 'America/Montevideo',
  PY: 'America/Asuncion',
  ES: 'Europe/Madrid',
  US: 'America/New_York',
};

const TZ_DEFAULT = 'America/Mexico_City';

/** Zonas válidas, para no interpolar jamás texto libre dentro de un SQL. */
const TZ_VALIDAS = new Set([...Object.values(TZ_POR_PAIS), 'UTC']);

export function timezoneDePais(pais?: string | null): string {
  if (!pais) return TZ_DEFAULT;
  return TZ_POR_PAIS[pais.toUpperCase()] ?? TZ_DEFAULT;
}

/**
 * Verifica que una zona esté en la lista blanca antes de usarla en SQL.
 *
 * `AT TIME ZONE` no admite parámetro enlazado en la forma que usamos, así que
 * el valor se interpola. Este guardia es lo que impide que eso sea una
 * inyección.
 */
export function timezoneSegura(tz: string): string {
  return TZ_VALIDAS.has(tz) ? tz : TZ_DEFAULT;
}
