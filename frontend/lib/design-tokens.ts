/**
 * Puente TypeScript hacia los design tokens definidos en `app/globals.css`.
 *
 * No duplica valores: expone los nombres de las custom properties para poder
 * usarlas desde JS donde escribir `var(--…)` a mano sería frágil (estilos
 * inline, transforms de Framer Motion, cálculos de layout). La fuente de
 * verdad sigue siendo el bloque `:root` de globals.css, porque el
 * ThemeProvider re-tintea esas mismas variables según el `ui_config` del
 * usuario (data-radio / data-densidad) y un valor copiado aquí se quedaría
 * desincronizado en cuanto alguien cambiara su tema.
 */

/** Escala de espaciado 4/8/12/16/24/32/48/64. */
export const SPACE = {
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  7: 'var(--space-7)',
  8: 'var(--space-8)',
} as const;

/** Escala de radios. `control` y `surface` son los semánticos: úsalos. */
export const RADIUS = {
  xs: 'var(--radius-xs)',
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
  pill: 'var(--radius-pill)',
  control: 'var(--radius-control)',
  surface: 'var(--radius-surface)',
} as const;

/** Cuatro niveles de elevación. Nunca escribas una sombra literal. */
export const SHADOW = {
  surface: 'var(--shadow-surface)',
  elevated: 'var(--shadow-elevated)',
  floating: 'var(--shadow-floating)',
  modal: 'var(--shadow-modal)',
} as const;

/** Desenfoque: solo para superficies que deben leerse como cristal. */
export const BLUR = {
  surface: 'var(--blur-surface)',
  overlay: 'var(--blur-overlay)',
} as const;

export type SpaceToken = keyof typeof SPACE;
export type RadiusToken = keyof typeof RADIUS;
export type ShadowToken = keyof typeof SHADOW;
