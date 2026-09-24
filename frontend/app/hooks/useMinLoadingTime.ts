import { useEffect, useState } from 'react';

/**
 * Mínimo de tiempo que una pantalla de carga permanece visible.
 * 5 s por defecto: evita el parpadeo cuando el análisis ya estaba completado
 * al montar y da margen a que la barra del loader llegue al 100 %.
 */
export const MIN_LOADING_MS = 5000;

export const useMinLoadingTime = (minTime = MIN_LOADING_MS) => {
  const [isReady, setIsReady] = useState(minTime <= 0);

  useEffect(() => {
    if (minTime <= 0) {
      setIsReady(true);
      return;
    }
    const timer = setTimeout(() => setIsReady(true), minTime);
    return () => clearTimeout(timer);
  }, [minTime]);

  return isReady;
};