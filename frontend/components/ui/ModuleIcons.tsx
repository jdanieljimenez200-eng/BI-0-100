'use client';

import type { ReactElement } from 'react';

export type IconProps = { className?: string };

export function IconMercado({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v15a3 3 0 0 0 3 3h15" />
      <path d="M7 14.5l3.5-3.5 2.5 2.5L19 7" />
      <path d="M15.5 7H19v3.5" />
    </svg>
  );
}

export function IconMarketing({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

export function IconVentas({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
      <path d="M7 18h.01M12 18h.01M17 18h.01" />
    </svg>
  );
}

export function IconFinanzas({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.71 13.88.7.71-2.82 2.82" />
    </svg>
  );
}

export function IconLegal({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l-8 4 8 4 8-4-8-4z" />
      <path d="M4 10l8 4 8-4" />
      <path d="M4 6v6l8 4 8-4V6" />
      <path d="M9 18l-5 2 2-5" />
      <path d="M15 18l5 2-2-5" />
    </svg>
  );
}

/* ─── Iconos de pasos (loaders) ──────────────────────────────────────────────
   Sustituyen a los emojis en los pasos de AnalysisLoader. Mismo trazo (1.7) y
   `currentColor` que los iconos de módulo, para heredar el color de acento. */

/** Posicionamiento / objetivo. */
export function IconObjetivo({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </svg>
  );
}

/** Redacción / copywriting. */
export function IconRedaccion({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

/** Calendario de contenido. */
export function IconCalendario({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
      <path d="M8 15h.01M12 15h.01M16 15h.01" />
    </svg>
  );
}

/** Vídeo / scripts audiovisuales. */
export function IconVideo({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4V8z" />
    </svg>
  );
}

/** Métricas / ROI. */
export function IconMetricas({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M8 17v-5M12.5 17V8M17 17v-7" />
    </svg>
  );
}

/** Check de paso completado. */
export function IconCheck({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}