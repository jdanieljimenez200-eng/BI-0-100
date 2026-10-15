/**
 * Redondeo y formato de dinero en el navegador. Gemelo de
 * `backend/src/utils/dinero.ts`: lo que la pantalla muestra antes de guardar
 * tiene que coincidir al centavo con lo que calcula el servidor.
 */

/**
 * Redondea a `decimales` sin el error de coma flotante: con
 * `Math.round(v * 100) / 100`, 1.005 da 1.00 porque 1.005 * 100 = 100.49999…
 */
function redondear(valor: number, decimales: number): number {
  if (!Number.isFinite(valor)) return 0;
  const factor = 10 ** decimales;
  return Math.round(Number((valor * factor).toPrecision(12))) / factor;
}

export const r2 = (valor: number) => redondear(valor, 2);
export const r3 = (valor: number) => redondear(valor, 3);

/**
 * Importe con el símbolo y los separadores del país: «$1,234.50» en México,
 * «$ 1.234,50» en Colombia, «S/ 1,234.50» en Perú. Con un código de moneda que
 * el navegador no conoce, cae a «XXX 1234.50» en vez de romper la pantalla.
 */
export function formatoDinero(valor: number, moneda: string, locale = 'es-MX'): string {
  const v = Number(valor) || 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: moneda }).format(v);
  } catch {
    return `${moneda} ${v.toFixed(2)}`;
  }
}

/** Porcentaje sin decimales de más: 16 → «16 %», 12.5 → «12.5 %». */
export function formatoPct(valor: number, locale = 'es-MX'): string {
  return `${(Number(valor) || 0).toLocaleString(locale, { maximumFractionDigits: 2 })} %`;
}
