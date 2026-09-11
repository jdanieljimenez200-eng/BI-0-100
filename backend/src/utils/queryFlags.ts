/**
 * Parseo de flags booleanos que llegan por query string.
 *
 * Express entrega `req.query.x` como `string | string[] | undefined` (o un objeto
 * anidado con la sintaxis extendida de `qs`), así que comparar con `=== '1'` deja
 * fuera formas que cualquier cliente considera verdaderas: `?flag=true` en
 * mayúsculas, `?flag=yes`, `?flag=on`, o el flag presente sin valor (`?flag`,
 * que llega como cadena vacía).
 *
 * Reglas:
 * - Verdadero: 1, true, yes, y, on, si, sí (sin distinguir mayúsculas ni espacios)
 *   y el parámetro presente sin valor.
 * - Falso: 0, false, no, n, off.
 * - Cualquier otra cosa (valor desconocido, objeto, NaN) cae al valor por defecto:
 *   un parámetro basura NO debe cambiar el comportamiento del endpoint en silencio.
 * - Con `?flag=0&flag=1` manda el último valor, igual que la mayoría de frameworks.
 */

const VERDADEROS: ReadonlySet<string> = new Set(['1', 'true', 'yes', 'y', 'on', 'si', 'sí']);

const FALSOS: ReadonlySet<string> = new Set(['0', 'false', 'no', 'n', 'off']);

export function parseFlagQuery(valor: unknown, porDefecto = false): boolean {
  if (Array.isArray(valor)) {
    if (valor.length === 0) return porDefecto;
    return parseFlagQuery(valor[valor.length - 1], porDefecto);
  }

  if (valor === undefined || valor === null) return porDefecto;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor !== 0 : porDefecto;
  if (typeof valor !== 'string') return porDefecto;

  const normalizado = valor.trim().toLowerCase();

  // `?flag` sin `=` → presente, y presencia significa activado.
  if (normalizado === '') return true;
  if (VERDADEROS.has(normalizado)) return true;
  if (FALSOS.has(normalizado)) return false;

  return porDefecto;
}