// Cliente HTTP mínimo compartido por los clientes de datos oficiales.
// Usa el `fetch` global (Node 18+), igual que tendenciasService,
// googleLocalService, competenciaService y mercadolibreService.

const TIMEOUT_DEFAULT_MS = 12_000;

/** GET JSON con timeout duro. Lanza en !res.ok o al abortar: los clientes que
 *  la consumen capturan y degradan, nunca propagan al análisis. */
export async function fetchJsonConTimeout<T>(
  url: string,
  timeoutMs: number = TIMEOUT_DEFAULT_MS,
): Promise<T> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controlador.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(temporizador);
  }
}

/** Deja un término apto para ir en el PATH de una URL (el DENUE recibe la
 *  condición como segmento de ruta, no como query string). */
export function sanitizarSegmentoRuta(termino: string, maxLen = 80): string {
  return termino
    .normalize('NFC')
    .replace(/[/\\?#%&+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}