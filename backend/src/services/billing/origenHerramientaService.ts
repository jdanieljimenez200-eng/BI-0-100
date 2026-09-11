/**
 * Servicio puro para determinar el origen de una herramienta.
 * Punto único de verdad para la lógica de origen.
 */

export type HerramientaOrigen = 'incluida' | 'pago';

/**
 * Calcula el origen de una herramienta en base a si aparece en la lista
 * de herramientas activadas por el usuario (seleccionadas).
 *
 * @param herramientaKey - Clave de la herramienta
 * @param seleccionadasPorUsuario - Array de herramientas_key que el usuario ha activado
 * @returns 'pago' si está seleccionada por el usuario, 'incluida' si no
 */
export function computeOrigenHerramienta(
  herramientaKey: string,
  seleccionadasPorUsuario: string[],
): HerramientaOrigen {
  return seleccionadasPorUsuario.includes(herramientaKey) ? 'pago' : 'incluida';
}