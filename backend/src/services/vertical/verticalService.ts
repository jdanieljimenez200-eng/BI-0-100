export type VerticalKey =
  | 'oftalmologo'
  | 'abogado'
  | 'medico'
  | 'quiropractico'
  | 'pyme';

export const VERTICALES_VALIDOS: readonly VerticalKey[] = [
  'oftalmologo',
  'abogado',
  'medico',
  'quiropractico',
  'pyme',
] as const;

/** ¿Es una key de vertical reconocida por el catálogo? */
export function esVerticalValido(key: string): key is VerticalKey {
  return (VERTICALES_VALIDOS as readonly string[]).includes(key);
}

export type DecisionVertical =
  | { ok: true }
  | { ok: false; motivo: 'ya_elegido' | 'invalido' };

/**
 * Decide si un usuario PUEDE fijar su vertical.
 * Elección única e irreversible: solo se permite si aún no tiene uno
 * (verticalActual === null) y la key solicitada existe en el catálogo.
 */
export function puedeElegirVertical(
  verticalActual: string | null,
  keySolicitada: string,
): DecisionVertical {
  if (verticalActual !== null) {
    return { ok: false, motivo: 'ya_elegido' };
  }
  if (!esVerticalValido(keySolicitada)) {
    return { ok: false, motivo: 'invalido' };
  }
  return { ok: true };
}