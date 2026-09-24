/**
 * Hasta dónde llegan de verdad nuestras tablas por país.
 *
 * El análisis se vende para 18 países de LATAM, pero varias tablas del código
 * son mexicanas: la clasificación socioeconómica AMAI y el calendario comercial
 * (Buen Fin, fiestas patrias, cuesta de enero). Aplicarlas en Colombia o Brasil
 * producía recortes de población y curvas de temporada sin respaldo.
 *
 * En vez de inventar equivalentes, se declara qué país tiene tabla y el análisis
 * dice cuando no aplica algo. Añadir un país aquí significa añadir de verdad sus
 * datos, no copiar los de México.
 */

/** Países con tabla de nivel socioeconómico propia (NSE_PCT en utils/latam.ts). */
const CON_TABLA_NSE = new Set(['MX']);

/** Países cuyo calendario comercial conocemos (ESTACIONALIDAD en tamService). */
const CON_CALENDARIO_COMERCIAL = new Set(['MX']);

const iso = (pais?: string | null) => (pais || 'MX').trim().toUpperCase();

export function paisTieneTablaNse(pais?: string | null): boolean {
  return CON_TABLA_NSE.has(iso(pais));
}

export function paisTieneCalendarioComercial(pais?: string | null): boolean {
  return CON_CALENDARIO_COMERCIAL.has(iso(pais));
}
