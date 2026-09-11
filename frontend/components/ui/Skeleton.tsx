'use client';

import React from 'react';

import { cn } from '@/lib/utils';
import { MODULE_THEME, type ModuloSlug } from '@/lib/moduleTheme';

/**
 * Placeholder de carga con shimmer. Generaliza las clases `.pd-skeleton` /
 * `.mod-skeleton` de globals.css (que respetan `prefers-reduced-motion`
 * deteniendo el barrido) y permite teñirlo con el acento del módulo para que
 * la espera ya anticipe el color de la pantalla que está por llegar.
 */
export function Skeleton({
  className,
  modulo,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { modulo?: ModuloSlug }) {
  return (
    <div
      aria-hidden
      className={cn('pd-skeleton rounded-control', modulo && 'mod-skeleton', className)}
      style={
        modulo
          ? ({ '--mod-rgb': MODULE_THEME[modulo].rgb, ...style } as React.CSSProperties)
          : style
      }
      {...rest}
    />
  );
}

/** Bloque de líneas de texto de ancho decreciente, para párrafos en carga. */
export function SkeletonText({
  lines = 3,
  className,
  modulo,
}: {
  lines?: number;
  className?: string;
  modulo?: ModuloSlug;
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          modulo={modulo}
          className="h-3 rounded-sm"
          style={{ width: i === lines - 1 ? '62%' : '100%' }}
        />
      ))}
    </div>
  );
}

export default Skeleton;
