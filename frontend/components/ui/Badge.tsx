'use client';

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { MODULE_THEME, type ModuloSlug } from '@/lib/moduleTheme';

/**
 * Etiqueta corta de estado o categoría.
 *
 * Para el color de módulo NO hay una variante por módulo: se pasa `modulo` y el
 * tinte sale de `lib/moduleTheme`, la fuente canónica. Así añadir o recolorear
 * un módulo es un cambio en un solo sitio y Tailwind no tiene que purgar
 * clases construidas dinámicamente.
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 border font-bold uppercase tracking-[0.14em] rounded-pill whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-white/10 bg-white/[0.06] text-white/70',
        success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
        warning: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
        danger: 'border-red-400/25 bg-red-400/10 text-red-300',
        info: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
        /** El color lo inyecta `modulo` vía estilo inline. */
        modulo: '',
      },
      size: {
        sm: 'px-2 py-0.5 text-[9px]',
        md: 'px-3 py-1.5 text-[10px]',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      size: 'md',
    },
  }
);

type BadgeBaseProps = VariantProps<typeof badgeVariants> & {
  children?: React.ReactNode;
  className?: string;
  /** Tiñe la etiqueta con el acento del módulo indicado. */
  modulo?: ModuloSlug;
  /** Punto de color a la izquierda, para estados en listas y tablas. */
  dot?: boolean;
};

export type BadgeProps = BadgeBaseProps &
  Omit<React.HTMLAttributes<HTMLSpanElement>, keyof BadgeBaseProps>;

export function Badge({
  children,
  className,
  tone,
  size,
  modulo,
  dot = false,
  style,
  ...rest
}: BadgeProps) {
  const rgb = modulo ? MODULE_THEME[modulo].rgb : null;

  return (
    <span
      className={cn(badgeVariants({ tone: modulo ? 'modulo' : tone, size }), className)}
      style={
        rgb
          ? {
              color: `rgb(${rgb})`,
              backgroundColor: `rgb(${rgb} / 0.1)`,
              borderColor: `rgb(${rgb} / 0.22)`,
              ...style,
            }
          : style
      }
      {...rest}
    >
      {dot && (
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
      )}
      {children}
    </span>
  );
}

export default Badge;
