import { getPaisInfo } from '../../utils/latam';

/**
 * Supuestos de medios de pago por país, en MONEDA LOCAL.
 *
 * Antes había un solo número en el código (`cpcPromedio = 2.6`) que se aplicaba
 * igual a pesos mexicanos, pesos colombianos, soles o reales: un CPC de 2,6 COP
 * no existe, y la simulación de Ventas+ salía con cifras imposibles fuera de
 * México.
 *
 * Son ÓRDENES DE MAGNITUD para redes sociales y búsqueda en PYMEs, no datos de
 * plataforma: sirven solo cuando el usuario todavía no ha subido su reporte de
 * ads real. En cuanto lo sube, mandan sus propios números (`origen: 'tus_datos'`).
 * Quien los actualice debería anotar de dónde los sacó y cuándo.
 */
export interface SupuestosMedios {
  /** Costo por clic típico en moneda local. */
  cpc: number;
  moneda: string;
}

// Revisión: 2026-09. Rango PYME, campañas de tráfico/mensajes.
const CPC_POR_PAIS: Record<string, number> = {
  MX: 2.6,
  CO: 450,
  AR: 250,
  CL: 180,
  PE: 0.9,
  BR: 1.1,
  UY: 11,
  PY: 1_800,
  BO: 1.8,
  VE: 0.25,
  // Países con dólar: el clic ronda el cuarto de dólar.
  EC: 0.25,
  PA: 0.25,
  SV: 0.25,
  GT: 2,
  HN: 6,
  NI: 9,
  CR: 130,
  BZ: 0.5,
};

/** CPC de respaldo del país, en su moneda. */
export function cpcDeReferencia(pais?: string | null): SupuestosMedios {
  const iso = (pais || 'MX').trim().toUpperCase();
  const info = getPaisInfo(iso);
  return { cpc: CPC_POR_PAIS[iso] ?? CPC_POR_PAIS.MX, moneda: info.moneda };
}
