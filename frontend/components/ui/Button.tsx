'use client';

import React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { MOTION_SPRINGS } from '@/lib/motion/tokens';

/**
 * Botón base del design system.
 *
 * El radio y el padding vertical salen de los tokens `--radius-control` y
 * `--control-py`, que el ThemeProvider re-tintea según el `ui_config` del
 * usuario: por eso aquí no hay ningún `rounded-xl` ni `py-3` literal.
 */
export const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center whitespace-nowrap select-none',
    'font-semibold rounded-control tracking-[-0.01em]',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-120 ease-out active:scale-[0.98]',
    'outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070E17]',
    'disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-white text-[#070E17] border border-white/40 shadow-surface hover:bg-white/95 hover:border-white/60 active:bg-white/90',
        accent:
          'bg-brand-accent text-white border border-white/15 shadow-surface hover:bg-[#d44335] active:bg-[#bf392c]',
        secondary:
          'bg-white/[0.06] text-white border border-white/10 shadow-surface hover:bg-white/[0.1] hover:border-white/20 active:bg-white/[0.04]',
        outline:
          'bg-transparent text-white/90 border border-white/15 hover:border-white/30 hover:bg-white/[0.04] active:bg-white/[0.02]',
        ghost:
          'bg-transparent text-white/70 border border-transparent hover:text-white hover:bg-white/[0.06] active:bg-white/[0.03]',
        danger:
          'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 hover:border-red-500/45 active:bg-red-500/20',
      },
      size: {
        sm: 'h-8 px-3 text-xs gap-1.5',
        md: 'h-10 px-4 text-sm gap-2',
        lg: 'h-11 px-6 text-sm gap-2.5',
        icon: 'h-9 w-9 p-0 text-sm justify-center',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  }
);

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  children?: React.ReactNode;
  className?: string;
  /** Renderiza un `next/link` en lugar de un `<button>`. */
  href?: string;
  /** Sustituye el icono por un spinner y bloquea la interacción. */
  loading?: boolean;
  /** Icono a la izquierda del texto. Usa lucide-react a 16px. */
  icon?: React.ReactNode;
  /** Icono a la derecha del texto (chevrons, flechas de "siguiente"). */
  iconRight?: React.ReactNode;
};

/**
 * Los handlers de drag y animación de React chocan con los homónimos de
 * Framer Motion (firmas distintas), así que se excluyen: en un botón no se
 * usan, y dejarlos rompería el tipado de `motion.button`.
 */
type HandlersEnConflicto =
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDrop'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onTransitionEnd';

export type ButtonProps = ButtonBaseProps &
  Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    keyof ButtonBaseProps | HandlersEnConflicto
  >;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    variant,
    size,
    block,
    href,
    loading = false,
    icon,
    iconRight,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  const shouldReduce = useReducedMotion();
  const isDisabled = Boolean(disabled) || loading;
  const classes = cn(buttonVariants({ variant, size, block }), className);

  const motionProps =
    isDisabled || shouldReduce
      ? {}
      : {
          whileHover: { y: -0.5 },
          transition: MOTION_SPRINGS.snappy,
        };

  const content = (
    <>
      {loading ? (
        <span
          aria-hidden
          className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : icon ? (
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children != null && <span>{children}</span>}
      {iconRight && !loading ? (
        <span aria-hidden className="shrink-0">
          {iconRight}
        </span>
      ) : null}
    </>
  );

  if (href && !isDisabled) {
    return (
      <motion.span {...motionProps} className={cn('inline-flex', block && 'w-full')}>
        <Link href={href} className={classes}>
          {content}
        </Link>
      </motion.span>
    );
  }

  return (
    <motion.button
      {...motionProps}
      {...rest}
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </motion.button>
  );
});

export default Button;
