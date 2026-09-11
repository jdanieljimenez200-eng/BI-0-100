import type { Transition, Variants } from 'framer-motion';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MOTION DESIGN SYSTEM — TOKENS (Inspirado en Animate UI, Linear, Apple y Vercel)
 * ─────────────────────────────────────────────────────────────────────────────
 * Propósito: Físicas unificadas de resorte y curvas de aceleración que garantizan
 * coherencia en todo el proyecto BI 0 A 100 sin animaciones arbitrarias.
 */

// ─── 1. Físicas de Resorte (Spring Transitions) ──────────────────────────────
export const MOTION_SPRINGS = {
  /**
   * Resorte Rápido (Snappy):
   * Micro-interacciones con feedback inmediato: botones, switches, pills, hovers.
   */
  snappy: {
    type: 'spring',
    stiffness: 450,
    damping: 32,
    mass: 0.8,
  } satisfies Transition,

  /**
   * Resorte Suave / Natural (Gentle):
   * Modales, popovers, drawers y diálogos que entran con presencia sin rebotar exageradamente.
   */
  gentle: {
    type: 'spring',
    stiffness: 300,
    damping: 28,
    mass: 1,
  } satisfies Transition,

  /**
   * Resorte de Pastilla (Pill):
   * Usado en el indicador deslizante `layoutId` de Tabs y menús activos.
   */
  pill: {
    type: 'spring',
    stiffness: 400,
    damping: 30,
    mass: 0.9,
  } satisfies Transition,

  /**
   * Resorte Elástico / Rebound (Subtle Bounce):
   * Notificaciones, tooltips y badges emergentes.
   */
  bouncy: {
    type: 'spring',
    stiffness: 500,
    damping: 25,
  } satisfies Transition,
};

// ─── 2. Curvas Bézier Clásicas (Tweens) ───────────────────────────────────────
export const MOTION_EASINGS = {
  /** Desaceleración suave (Apple / Linear style) */
  easeOutCubic: [0.215, 0.61, 0.355, 1.0] as const,
  /** Desaceleración refinada de lujo (Vercel / Stripe editorial) */
  easeOutQuart: [0.165, 0.84, 0.44, 1.0] as const,
  /** Transiciones de entrada y salida fluidas */
  easeInOutCubic: [0.645, 0.045, 0.355, 1.0] as const,
  /** Aceleración de salida (desaparición rápida para no demorar al usuario) */
  easeInCubic: [0.55, 0.055, 0.675, 0.19] as const,
};

// ─── 3. Duraciones Tokenizadas (Segundos) ─────────────────────────────────────
export const MOTION_DURATIONS = {
  instant: 0.12,   // 120ms - Micro-taps, tooltips, switches
  fast: 0.18,      // 180ms - Dropdowns, hovers, badges
  base: 0.24,      // 240ms - Modales, accordions, cambios de página
  deliberate: 0.32,// 320ms - Drawers, expansiones complejas
  slow: 0.5,       // 500ms - Staggers iniciales al cargar la vista
};

// ─── 4. Variantes Canónicas para Componentes ─────────────────────────────────

/** Entrada y salida de página (Page Transition) */
export const pageTransitionVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.base,
      ease: MOTION_EASINGS.easeOutQuart,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASINGS.easeInCubic,
    },
  },
};

/** Fondo oscurecido con desenfoque (Backdrop de Modales / Drawers) */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: MOTION_DURATIONS.fast, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    transition: { duration: MOTION_DURATIONS.instant, ease: 'easeIn' },
  },
};

/** Diálogo / Tarjeta de Modal (Animate UI Dialog) */
export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
    y: 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: MOTION_SPRINGS.gentle,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 6,
    transition: { duration: MOTION_DURATIONS.instant, ease: MOTION_EASINGS.easeInCubic },
  },
};

/** Drawer lateral (Animate UI Sheet / Drawer) */
export const drawerVariants: Variants = {
  hidden: {
    x: '-100%',
    opacity: 0.8,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: MOTION_SPRINGS.gentle,
  },
  exit: {
    x: '-100%',
    opacity: 0.8,
    transition: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASINGS.easeInCubic },
  },
};

/** Menú Desplegable / Popover (Animate UI Dropdown) */
export const dropdownVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.94,
    y: -6,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: MOTION_SPRINGS.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -4,
    transition: { duration: MOTION_DURATIONS.instant, ease: 'easeIn' },
  },
};

/** Tooltip contextual */
export const tooltipVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.92,
    y: 4,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: MOTION_SPRINGS.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 2,
    transition: { duration: MOTION_DURATIONS.instant },
  },
};

/** Contenedor escalonado (Stagger Container) */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

/** Ítem dentro de contenedor escalonado */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.deliberate,
      ease: MOTION_EASINGS.easeOutQuart,
    },
  },
};

/** Hover y Tap de Tarjetas y Botones */
export const interactiveCard = {
  whileHover: { y: -3, scale: 1.008 },
  whileTap: { scale: 0.985 },
  transition: MOTION_SPRINGS.snappy,
};

export const interactiveButton = {
  whileHover: { y: -1, scale: 1.015 },
  whileTap: { scale: 0.98 },
  transition: MOTION_SPRINGS.snappy,
};

// ─── 5. Reveal al entrar en viewport (sustituye a GSAP ScrollTrigger) ────────

/**
 * Configuración de viewport compartida para `whileInView`. `once: true` evita
 * que las secciones se re-animen al hacer scroll hacia arriba (efecto barato)
 * y el margen negativo dispara la entrada un poco antes de que el bloque toque
 * el borde inferior, para que nunca se vea "aparecer" a destiempo.
 */
export const REVEAL_VIEWPORT = { once: true, amount: 0.15, margin: '0px 0px -80px 0px' } as const;

/** Bloque que entra al hacer scroll. Sutil: 16px y un punto de opacidad. */
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.deliberate,
      ease: MOTION_EASINGS.easeOutQuart,
    },
  },
};

/** Contenedor de reveal escalonado para rejillas y listas de tarjetas. */
export const revealContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.04,
    },
  },
};

/**
 * Props listas para esparcir en un `motion.*` que debe revelarse al entrar en
 * viewport: `<motion.section {...reveal}>`. Evita repetir los cuatro atributos
 * en cada sección y garantiza que todas usen la misma física.
 */
export const reveal = {
  variants: revealVariants,
  initial: 'hidden' as const,
  whileInView: 'visible' as const,
  viewport: REVEAL_VIEWPORT,
};

/** Igual que `reveal`, pero escalonando los hijos que usen `revealVariants`. */
export const revealStagger = {
  variants: revealContainer,
  initial: 'hidden' as const,
  whileInView: 'visible' as const,
  viewport: REVEAL_VIEWPORT,
};
