/**
 * Valida y sanea un parámetro `next` para prevenir redirecciones abiertas (Open Redirect).
 * Solo acepta rutas relativas que comiencen exactamente con '/' y no con '//' ni '/\'.
 */
export function destinoSeguro(next: string | null | undefined, porDefecto: string): string {
  if (!next) return porDefecto;
  const limpio = next.trim();
  if (
    limpio.startsWith('/') &&
    !limpio.startsWith('//') &&
    !limpio.startsWith('/\\') &&
    !limpio.includes('://') &&
    !limpio.startsWith('/api')
  ) {
    return limpio;
  }
  return porDefecto;
}
