/**
 * Estatus del proyecto: ¿idea o negocio que ya vende?
 *
 * La misma columna (`productos.estatus_proyecto`) llegó a tener tres
 * vocabularios: el alta guarda `nueva_idea` / `negocio_en_marcha`, los seeds
 * `Idea` / `Negocio en Marcha` y el orquestador de Mercado usaba
 * `planificacion` / `en_operacion` como respaldo. Compararlo a pelo con uno de
 * ellos hacía que toda idea real se analizara como negocio activo y que el
 * payback con ventas reales no se calculara nunca. Léelo siempre con esto.
 * Gemelo: `frontend/lib/estatusProyecto.ts` (se mueven juntos).
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

/**
 * El estatus a usar en un análisis: el declarado y, si no hay, lo que dicen
 * los datos (con clientes al mes, ya vende).
 */
export function estatusEfectivo(declarado: unknown, clientesMes?: number | null): EstatusProyecto {
  return normalizarEstatus(declarado) ?? ((clientesMes ?? 0) > 0 ? 'en_marcha' : 'idea');
}

export const ETIQUETA_ESTATUS: Record<EstatusProyecto, string> = {
  idea: 'Idea nueva',
  en_marcha: 'Negocio en marcha',
};
