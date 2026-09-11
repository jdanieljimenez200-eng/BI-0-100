/**
 * confianza.ts
 * Nivel de confianza compartido entre módulos. Cuando un cálculo combina varias
 * fuentes, la confianza del resultado es la de la PEOR fuente: un dato derivado
 * no puede ser más fiable que el input más débil que lo alimenta.
 */

export type NivelConfianza = 'alta' | 'media' | 'baja';

const RANGO: Record<NivelConfianza, number> = { baja: 1, media: 2, alta: 3 };

/** Devuelve el nivel más bajo de los recibidos. Sin argumentos → 'baja'. */
export function combinarConfianza(...niveles: NivelConfianza[]): NivelConfianza {
  if (niveles.length === 0) return 'baja';
  let peor: NivelConfianza = niveles[0];
  for (const nivel of niveles) {
    if (RANGO[nivel] < RANGO[peor]) peor = nivel;
  }
  return peor;
}

/** `true` si `nivel` es al menos tan fiable como `minimo`. */
export function esAlMenos(nivel: NivelConfianza, minimo: NivelConfianza): boolean {
  return RANGO[nivel] >= RANGO[minimo];
}