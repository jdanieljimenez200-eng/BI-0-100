/**
 * Resuelve la URL base pública del frontend para correos, redirecciones y webhooks.
 * Soporta listas separadas por coma en FRONTEND_URL (e.g. 'https://app.bi0a100.com, https://bi0a100.com')
 * tomando siempre el primer origen canónico.
 */
export function urlApp(ruta?: string, params: Record<string, string> = {}): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000')
    .trim()
    .replace(/\/+$/, '');
  if (!ruta) return base;
  const path = ruta.startsWith('/') ? ruta : `/${ruta}`;
  const qs = new URLSearchParams(params).toString();
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}
