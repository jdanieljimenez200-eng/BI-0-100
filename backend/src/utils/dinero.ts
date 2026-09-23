/**
 * Redondeo de dinero y cantidades, en un solo sitio.
 *
 * `Math.round(v * 100) / 100` parece correcto y falla en los casos de siempre:
 * `1.005 * 100` vale 100.49999999999999 en coma flotante, así que 1.005 se
 * redondeaba a 1.00 en vez de a 1.01. Con céntimos sueltos por aquí y por allá
 * (comisiones, IVA, márgenes), esas diferencias acaban descuadrando un ticket
 * contra su asiento.
 *
 * `toPrecision(12)` quita el ruido de representación antes de redondear, sin
 * tocar dígitos significativos de verdad: a partir de ahí, 1.005 → 1.01.
 *
 * Nota: sigue siendo coma flotante, no aritmética decimal exacta. Para el rango
 * en el que trabaja la aplicación (importes de negocio, no de banca) es
 * suficiente; la fuente de verdad son las columnas `numeric` de Postgres.
 */
function redondear(valor: number, decimales: number): number {
  if (!Number.isFinite(valor)) return valor; // NaN/Infinity se propagan: mejor que inventar un 0
  const factor = 10 ** decimales;
  return Math.round(Number((valor * factor).toPrecision(12))) / factor;
}

/** Dinero: 2 decimales. */
export const r2 = (valor: number): number => redondear(valor, 2);

/** Cantidades de almacén: 3 decimales (0,125 kg). */
export const r3 = (valor: number): number => redondear(valor, 3);

/** Costos unitarios: 4 decimales, para no perder el costo de un ingrediente barato. */
export const r4 = (valor: number): number => redondear(valor, 4);
