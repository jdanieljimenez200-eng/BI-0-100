// Traductor único de errores de la API para los formularios del dashboard.
//
// ¿Por qué centralizarlo? El backend responde SIEMPRE igual cuando un gate de
// plan bloquea la acción (ver backend/src/middleware/requirePlan.ts): HTTP 403
// con `{ error, upgrade_required: true, plan_actual }`. Ese caso NO es un error
// de validación del formulario: el usuario no puede arreglarlo corrigiendo
// campos, sólo mejorando de plan. Duplicar el `if (data?.upgrade_required)` en
// cada página (hoy sólo lo hace herramientas/contabilidad) garantiza que los
// mensajes divergan, así que la interpretación vive aquí y las páginas sólo
// deciden cómo pintarlo.
//
// No importa `axios` a propósito: la comprobación es estructural, así que esto
// también sirve para un `fetch` envuelto o para un error de JS suelto.

import type { Plan } from './plans';
import { normalizarPlan } from './plans';

/** Mensaje cuando la petición no llegó a tener respuesta del servidor. */
export const MENSAJE_SIN_CONEXION =
  'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';

export interface ErrorApiInterpretado {
  /** Texto ya listo para mostrar al usuario. Nunca vacío. */
  mensaje: string;
  /** true → el 403 viene de un límite/feature de plan, no de datos inválidos. */
  upgradeRequired: boolean;
  /** Plan que reportó el backend, normalizado. null si no lo envió. */
  planActual: Plan | null;
  /** Código HTTP si hubo respuesta; null si fue fallo de red o error de JS. */
  status: number | null;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/**
 * Une los mensajes de un array de validación (`errors` de express-validator:
 * `[{ msg, param }]`) en una sola frase. Devuelve null si no hay nada usable.
 */
function leerMensajesDeValidacion(errors: unknown): string | null {
  if (!Array.isArray(errors)) return null;

  const mensajes: string[] = [];
  for (const entrada of errors) {
    if (typeof entrada === 'string') {
      const texto = entrada.trim();
      if (texto) mensajes.push(texto);
      continue;
    }
    if (!esObjeto(entrada)) continue;

    const crudo = entrada.msg ?? entrada.message;
    if (typeof crudo === 'string' && crudo.trim()) mensajes.push(crudo.trim());
  }

  return mensajes.length > 0 ? mensajes.join('. ') : null;
}

function textoNoVacio(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

/**
 * Interpreta cualquier error lanzado por el cliente de API.
 *
 * @param err      lo que llegó al `catch` (tipo `unknown`, sin castings en la página)
 * @param fallback mensaje propio del formulario cuando el servidor no manda uno
 */
export function interpretarErrorApi(err: unknown, fallback: string): ErrorApiInterpretado {
  const vacio: ErrorApiInterpretado = {
    mensaje: fallback,
    upgradeRequired: false,
    planActual: null,
    status: null,
  };

  if (!esObjeto(err)) return vacio;

  const response = esObjeto(err.response) ? err.response : null;

  // Sin `response`: no hubo respuesta HTTP (red caída, CORS, timeout) o es un
  // Error de JS normal. El `message` de axios ("Network Error") no se muestra:
  // no dice nada al usuario final.
  if (!response) {
    const esFalloDeRed =
      err.isAxiosError === true || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED';
    return { ...vacio, mensaje: esFalloDeRed ? MENSAJE_SIN_CONEXION : fallback };
  }

  const status = typeof response.status === 'number' ? response.status : null;
  const data = esObjeto(response.data) ? response.data : null;

  const mensajeServidor = data ? textoNoVacio(data.error) : null;
  // El backend envía `mensaje` amigable (español + CTA) en los 429 de cuota.
  const mensajeAmigable = data ? textoNoVacio(data.mensaje) : null;
  const mensajeValidacion = data ? leerMensajesDeValidacion(data.errors) : null;
  const planCrudo = data ? textoNoVacio(data.plan_actual) : null;

  return {
    mensaje:
      (status === 429 ? mensajeAmigable : null) ??
      mensajeServidor ??
      mensajeAmigable ??
      mensajeValidacion ??
      fallback,
    upgradeRequired: data?.upgrade_required === true || status === 429,
    planActual: planCrudo ? normalizarPlan(planCrudo) : null,
    status,
  };
}