/**
 * Versión vigente de los documentos que se aceptan al crear una cuenta.
 *
 * El formulario de registro manda estas versiones y el servidor las compara con
 * las suyas antes de guardar la aceptación: si no coinciden responde 409.
 *
 * Gemelo: `backend/src/config/documentosLegales.ts` (se mueven juntos; lo vigila
 * `backend/src/__tests__/contratos/gemelosFrontend.test.ts`).
 */
export const DOCUMENTOS_LEGALES = {
  terminos: { version: '1.0', fecha: '2026-10-15', ruta: '/terminos' },
  privacidad: { version: '1.0', fecha: '2026-10-15', ruta: '/privacidad' },
} as const;

/** Campos que acompañan a la casilla de aceptación en el registro. */
export function camposAceptacion() {
  return {
    acepta_terminos: true,
    version_terminos: DOCUMENTOS_LEGALES.terminos.version,
    version_privacidad: DOCUMENTOS_LEGALES.privacidad.version,
  };
}
