/**
 * curvas.ts
 * Utilidades numéricas compartidas por los scorings (viabilidad, densidad de
 * zona). Extraídas de viabilidadService para no duplicar la interpolación.
 */

export function clamp(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

/**
 * Interpola linealmente sobre una curva de anclas [x, y] ordenada por x.
 * Fuera del rango la curva se aplana (no extrapola), para que un dato extremo
 * no produzca scores absurdos.
 */
export function interpolarCurva(
  x: number,
  curva: ReadonlyArray<readonly [number, number]>,
): number {
  const primera = curva[0];
  const ultima = curva[curva.length - 1];
  if (x <= primera[0]) return primera[1];
  if (x >= ultima[0]) return ultima[1];

  for (let i = 1; i < curva.length; i++) {
    const [x0, y0] = curva[i - 1];
    const [x1, y1] = curva[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return ultima[1];
}

/** Redondea a `decimales` posiciones evitando la basura binaria (0.1 + 0.2). */
export function redondearA(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}