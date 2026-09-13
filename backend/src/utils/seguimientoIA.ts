import { AsyncLocalStorage } from 'async_hooks';

/**
 * Seguimiento de las secciones que, dentro de un análisis, se entregaron con
 * plantilla porque la llamada a la IA falló.
 *
 * Los servicios de IA ya caen a una plantilla determinista cuando Claude falla,
 * y eso está bien: el usuario recibe algo en vez de un error. Lo que no estaba
 * bien es que nadie se enterara. Con esto el worker abre un contexto por trabajo,
 * cada `catch` de fallback lo anota, y el orquestador lo guarda en la fila
 * (`resultado_estimado`) para avisar en pantalla y no descontar la cuota.
 *
 * Fuera de un trabajo (endpoints on-demand) `registrarFallbackIA` no hace nada.
 */
interface Seguimiento {
  secciones: Set<string>;
}

const almacen = new AsyncLocalStorage<Seguimiento>();

export function conSeguimientoIA<T>(fn: () => Promise<T>): Promise<T> {
  return almacen.run({ secciones: new Set() }, fn);
}

/**
 * Anota que `seccion` salió de plantilla. Sin ANTHROPIC_API_KEY la plantilla es
 * el comportamiento previsto (desarrollo), no un fallo: no se anota.
 */
export function registrarFallbackIA(seccion: string): void {
  if (!process.env.ANTHROPIC_API_KEY) return;
  almacen.getStore()?.secciones.add(seccion);
}

/** Secciones de este trabajo que salieron de plantilla. */
export function seccionesEstimadas(): string[] {
  return [...(almacen.getStore()?.secciones ?? [])];
}

export function huboFallbackIA(): boolean {
  return seccionesEstimadas().length > 0;
}
