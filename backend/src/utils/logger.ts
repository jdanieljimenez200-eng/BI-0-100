/**
 * Claves que nunca deben acabar en un log: Anthropic, OpenAI, Stripe (secreta,
 * restringida y de webhook) y cabeceras Bearer. Un error de un SDK o un objeto de
 * configuración volcado por descuido no puede filtrar credenciales a la consola
 * ni al agregador de logs.
 */
const PATRONES_SECRETOS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /whsec_[A-Za-z0-9]{8,}/g,
  /Bearer\s+[A-Za-z0-9._-]{16,}/g,
];

export function redactarSecretos(texto: string): string {
  return PATRONES_SECRETOS.reduce((s, patron) => s.replace(patron, '[REDACTADO]'), texto);
}

function redactarArg(arg: unknown): unknown {
  if (typeof arg === 'string') return redactarSecretos(arg);
  if (arg instanceof Error) {
    const copia = new Error(redactarSecretos(arg.message));
    copia.name = arg.name;
    copia.stack = arg.stack ? redactarSecretos(arg.stack) : undefined;
    return copia;
  }
  if (arg && typeof arg === 'object') {
    try {
      const serializado = JSON.stringify(arg);
      const limpio = redactarSecretos(serializado);
      return limpio === serializado ? arg : JSON.parse(limpio);
    } catch {
      return arg; // estructuras circulares: no se pueden serializar ni, por tanto, filtrar
    }
  }
  return arg;
}

const limpiar = (args: unknown[]) => args.map(redactarArg);

export const logger = {
  info: (message: string, ...args: unknown[]) => console.log(`[INFO] ${redactarSecretos(message)}`, ...limpiar(args)),
  error: (message: string, ...args: unknown[]) => console.error(`[ERROR] ${redactarSecretos(message)}`, ...limpiar(args)),
  warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] ${redactarSecretos(message)}`, ...limpiar(args)),
  debug: (message: string, ...args: unknown[]) => console.debug(`[DEBUG] ${redactarSecretos(message)}`, ...limpiar(args)),
};

export default logger;
