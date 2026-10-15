/**
 * Versión vigente de cada documento que una cuenta acepta (textos en docs/legal/).
 *
 * Al cambiar un documento de forma relevante se sube aquí su versión: las
 * aceptaciones nuevas quedan registradas con ella en `aceptaciones_legales`.
 * El registro rechaza (409) un formulario que mostró otra versión, para no
 * guardar como aceptado un texto que la persona no vio.
 *
 * Gemelo: `frontend/lib/documentosLegales.ts` (se mueven juntos; lo vigila
 * `__tests__/contratos/gemelosFrontend.test.ts`).
 */
export const DOCUMENTOS_LEGALES = {
  terminos: { version: '1.0', fecha: '2026-10-15', ruta: '/terminos' },
  privacidad: { version: '1.0', fecha: '2026-10-15', ruta: '/privacidad' },
} as const;

export type DocumentoAceptable = keyof typeof DOCUMENTOS_LEGALES;
