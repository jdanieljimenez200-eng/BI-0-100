// ─── Procedencia real de los datos de competencia ────────────────────────────
// El router de competenciaService puede devolver MercadoLibre, Google Maps,
// Google Shopping, el benchmark de sector o un mock determinista. Los prompts
// afirmaban una fuente fija ("Google_Shopping_verificado" / "verificados"), lo
// que hacía que el LLM calibrara mal la certeza. Derivamos la atribución de la
// fuente real de cada competidor.
//
// Módulo compartido: lo consumen reporteBiService y dafoService.

const ETIQUETA_FUENTE: Record<string, string> = {
  mercadolibre:     'MercadoLibre_verificado',
  google_shopping:  'Google_Shopping_verificado',
  google_maps:      'Google_Maps_verificado',
  // benchmark_sector son competidores sintéticos derivados de promedios de
  // categoría (googleLocalService). Nunca deben etiquetarse como verificados.
  benchmark_sector: 'estimacion_interna',
  mock:             'estimacion_interna',
};

export function describirFuenteCompetencia(competencia: {
  es_mock: boolean;
  competidores: { fuente?: string }[];
  censo_oficial?: { disponible: boolean; instituto: string };
}): string {
  // El censo oficial se atribuye APARTE y va primero: es censo, no muestra.
  // Puede coexistir con precios estimados (el DENUE no publica precios), así
  // que se concatena en vez de reemplazar — de lo contrario un análisis con
  // conteo oficial y precios mock se etiquetaría como enteramente verificado.
  const etiquetaOficial = competencia.censo_oficial?.disponible
    ? `${competencia.censo_oficial.instituto}_censo_oficial`
    : null;

  const combinar = (etiquetaWeb: string): string =>
    etiquetaOficial ? `${etiquetaOficial}+${etiquetaWeb}` : etiquetaWeb;

  if (competencia.es_mock) return combinar('estimacion_interna');

  const fuentes = Array.from(
    new Set(
      (competencia.competidores ?? [])
        .map((c) => c.fuente)
        .filter((f): f is string => typeof f === 'string' && f.length > 0),
    ),
  );

  // Sin competidores (p. ej. ML devolvió 0 resultados reales) no hay nada que
  // atribuir: se reporta como estimación para no inflar la certeza del LLM.
  if (fuentes.length === 0) return combinar('estimacion_interna');

  return combinar(fuentes.map((f) => ETIQUETA_FUENTE[f] ?? `${f}_verificado`).join('+'));
}