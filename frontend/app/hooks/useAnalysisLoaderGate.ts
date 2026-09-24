import { useEffect, useState } from 'react';
import { MIN_LOADING_MS, useMinLoadingTime } from './useMinLoadingTime';

/** Tiempo que el loader se queda en pantalla ya al 100 % antes de ceder el paso. */
export const LOADER_HANDOFF_MS = 900;

export interface AnalysisLoaderGate {
  /** true mientras haya que renderizar <AnalysisLoader />. */
  showLoader: boolean;
  /** true cuando el loader debe cerrar la barra en 100 % (pásalo como `done`). */
  loaderDone: boolean;
}

/**
 * Coordina el relevo entre la pantalla de carga y el informe:
 *
 * 1. El loader vive un mínimo de `minMs` (5 s) aunque el análisis ya esté listo.
 * 2. Cuando el análisis está listo Y se cumplió el mínimo, `loaderDone` pasa a
 *    true: el loader anima el porcentaje hasta 100 %.
 * 3. Tras `handoffMs` el loader se desmonta y la página pinta el resultado.
 *
 * De este modo el usuario nunca ve el salto de "87 %" a informe: la carga
 * siempre termina en 100 %.
 *
 * @param ready análisis cargado y en estado distinto de 'procesando'.
 */
export function useAnalysisLoaderGate(
  ready: boolean,
  minMs: number = MIN_LOADING_MS,
  handoffMs: number = LOADER_HANDOFF_MS,
): AnalysisLoaderGate {
  const minDone = useMinLoadingTime(minMs);
  const loaderDone = ready && minDone;

  const [handoffDone, setHandoffDone] = useState(minMs <= 0 && handoffMs <= 0);

  useEffect(() => {
    if (!loaderDone) return;
    if (handoffMs <= 0) {
      setHandoffDone(true);
      return;
    }
    const timer = setTimeout(() => setHandoffDone(true), handoffMs);
    return () => clearTimeout(timer);
  }, [loaderDone, handoffMs]);

  if (minMs <= 0 && handoffMs <= 0 && ready) {
    return { showLoader: false, loaderDone: true };
  }

  return { showLoader: !(loaderDone && handoffDone), loaderDone };
}