/** Origen ficticio para resolver `next` sin depender de `window`. */
const ORIGEN_INTERNO = 'https://interno.invalid';

/**
 * Valida y sanea un parámetro `next` para prevenir redirecciones abiertas (Open Redirect).
 *
 * No basta con mirar el texto: el navegador quita tabuladores y saltos de línea al
 * leer una URL, así que `/\t/evil.com` (llega de `?next=/%09/evil.com`) se lee como
 * `//evil.com`, que es otro dominio. Por eso se rechazan los caracteres de control y
 * se resuelve con el mismo analizador que usará el router: si el resultado no sigue
 * en nuestro origen, no es una ruta interna.
 */
export function destinoSeguro(next: string | null | undefined, porDefecto: string): string {
  if (!next) return porDefecto;
  const limpio = next.trim();
  if (!limpio.startsWith('/') || /[\u0000-\u001F\u007F]/.test(limpio)) return porDefecto;

  let url: URL;
  try {
    url = new URL(limpio, ORIGEN_INTERNO);
  } catch {
    return porDefecto;
  }
  if (url.origin !== ORIGEN_INTERNO || /^\/api(?:\/|$)/i.test(url.pathname)) return porDefecto;
  return `${url.pathname}${url.search}${url.hash}`;
}
