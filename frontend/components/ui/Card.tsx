'use client';

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Superficie base del design system: la caja sobre la que se apoya todo el
 * contenido del dashboard. Sustituye a las clases sueltas `.card` /
 * `.bento-cell` de globals.css, que se mantienen solo para las pantallas que
 * aún no han migrado.
 *
 * `elevation` mapea a la escala de sombra de 4 niveles; `tone` decide si la
 * superficie es sólida (paneles densos, tablas) o de cristal (paneles que
 * flotan sobre contenido o sobre un halo de color).
 */
export const cardVariants = cva(
  'relative overflow-hidden rounded-surface border transition-all duration-300 ease-out',
  {
    variants: {
      tone: {
        glass: 'border-white/[0.06] bg-[rgba(15,28,42,0.4)] backdrop-blur-[var(--blur-surface)]',
        solid: 'border-white/[0.05] bg-[#0A121D]',
        bare: 'border-transparent bg-transparent',
      },
      elevation: {
        none: 'shadow-none',
        surface: 'shadow-surface',
        elevated: 'shadow-elevated',
        floating: 'shadow-floating',
      },
      interactive: {
        true: 'hover:border-white/[0.14] hover:bg-white/[0.02] hover:shadow-elevated hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
        false: '',
      },
      padding: {
        none: 'p-0',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-[var(--cell-p)]',
      },
    },
    defaultVariants: {
      tone: 'glass',
      elevation: 'surface',
      interactive: false,
      padding: 'md',
    },
  }
);

type CardBaseProps = VariantProps<typeof cardVariants> & {
  children?: React.ReactNode;
  className?: string;
};

export type CardProps = CardBaseProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof CardBaseProps>;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className, tone, elevation, interactive, padding, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ tone, elevation, interactive, padding }), className)}
      {...rest}
    >
      {children}
    </div>
  );
});

/**
 * Encabezado de tarjeta: kicker en versalitas + título + acción opcional.
 * Centraliza la jerarquía tipográfica para que dos paneles cualesquiera del
 * producto se lean igual.
 */
export function CardHeader({
  kicker,
  title,
  description,
  action,
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {kicker && (
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
            {kicker}
          </p>
        )}
        <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
        {description && (
          <p className="mt-1.5 text-sm font-light leading-relaxed text-white/45">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default Card;
