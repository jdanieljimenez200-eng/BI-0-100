/**
 * Opciones comunes para todos los clientes de Anthropic.
 *
 * Sin esto el SDK espera hasta 10 minutos por respuesta y reintenta 2 veces por
 * su cuenta: una llamada colgada puede dejar el análisis en "procesando" hasta
 * que el limpiador de 15 minutos lo cierre. Con 60 s y un reintento, el peor
 * caso de una llamada son 2 minutos y después entra la plantilla de respaldo.
 */
export const OPCIONES_ANTHROPIC = {
  timeout: 60_000,
  maxRetries: 1,
} as const;
