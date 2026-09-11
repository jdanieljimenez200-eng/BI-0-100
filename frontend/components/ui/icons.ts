/**
 * Convención única de iconografía.
 *
 * Toda la interfaz usa `lucide-react` como familia de iconos: un solo grosor
 * de trazo y tres tamaños. Nada de SVG dibujados a mano para chevrons, checks,
 * flechas o avisos — la única excepción son las marcas de módulo de
 * `ModuleIcons.tsx`, que son identidad de marca, no iconografía de interfaz.
 *
 * Uso: `<Check {...ICON.sm} />`. El grosor 2 es el que mantiene los iconos
 * legibles sobre el lienzo oscuro sin verse pesados a tamaño pequeño.
 */
export const ICON_STROKE = 2;

export const ICON = {
  /** 14px — dentro de badges y texto en línea. */
  xs: { size: 14, strokeWidth: ICON_STROKE },
  /** 16px — tamaño por defecto: botones, filas de tabla, campos. */
  sm: { size: 16, strokeWidth: ICON_STROKE },
  /** 20px — navegación, cabeceras de tarjeta. */
  md: { size: 20, strokeWidth: ICON_STROKE },
  /** 24px — estados vacíos y encabezados de sección. */
  lg: { size: 24, strokeWidth: ICON_STROKE },
} as const;

export type IconSize = keyof typeof ICON;
