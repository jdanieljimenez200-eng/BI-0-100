import type { VersionUsada } from './componerSistema';
import type { SeccionExtraResultado, TransparenciaIA } from './contratoComun';

/**
 * Lo que se guarda de la IA junto a un análisis: qué tan confiable es, qué
 * secciones añadió u ocultó el admin y con qué versión de prompt se hizo.
 * Legal lo lleva dentro de `resultado_data`; los módulos con una columna por
 * sección lo llevan en `meta_ia`.
 */
export interface MetaIA {
  /** Forma del resultado, p. ej. `mercado@2`. */
  contrato: string;
  /** `mixto`: unas secciones salieron de la IA y otras de plantilla. */
  origen: 'ia' | 'plantilla' | 'mixto';
  versiones_prompt: Record<string, VersionUsada>;
  contexto_usado?: Record<string, unknown>;
}

export interface MetaIaAnalisis {
  transparencia: TransparenciaIA;
  secciones_extra: SeccionExtraResultado[];
  secciones_ocultas: string[];
  meta: MetaIA;
}

export function origenDe(secciones: { es_mock?: boolean }[]): MetaIA['origen'] {
  if (!secciones.length) return 'plantilla';
  const ia = secciones.filter((s) => s.es_mock === false).length;
  return ia === secciones.length ? 'ia' : ia === 0 ? 'plantilla' : 'mixto';
}
