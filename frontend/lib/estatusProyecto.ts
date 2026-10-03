/**
 * Estatus del proyecto: ¿idea o negocio que ya vende?
 *
 * Gemelo de `backend/src/utils/estatusProyecto.ts` (se mueven juntos). La
 * columna tiene varios vocabularios (`negocio_en_marcha` del alta,
 * `Negocio en Marcha` de los seeds…): nunca la compares a pelo.
 */

export type EstatusProyecto = 'idea' | 'en_marcha';

const EN_MARCHA = new Set(['negocio_en_marcha', 'negocio en marcha', 'en_marcha', 'en_operacion', 'en operacion', 'operando']);
const IDEA = new Set(['nueva_idea', 'nueva idea', 'idea', 'planificacion', 'en_planificacion']);

export function normalizarEstatus(valor: unknown): EstatusProyecto | null {
  if (typeof valor !== 'string') return null;
  const v = valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  if (EN_MARCHA.has(v)) return 'en_marcha';
  if (IDEA.has(v)) return 'idea';
  return null;
}

export const esNegocioEnMarcha = (valor: unknown) => normalizarEstatus(valor) === 'en_marcha';

export const ETIQUETA_ESTATUS: Record<EstatusProyecto, string> = {
  idea: 'Idea nueva',
  en_marcha: 'Negocio en marcha',
};

/** Texto para mostrar: la etiqueta conocida o el valor tal cual. */
export function etiquetaEstatus(valor: unknown): string {
  const e = normalizarEstatus(valor);
  return e ? ETIQUETA_ESTATUS[e] : typeof valor === 'string' ? valor : '';
}
