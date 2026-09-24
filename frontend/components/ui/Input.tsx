'use client';

import React from 'react';

import { cn } from '@/lib/utils';

/**
 * Campo de texto del design system: etiqueta, icono, error y texto de ayuda
 * en un solo componente, con las relaciones de accesibilidad (`aria-invalid`,
 * `aria-describedby`) ya cableadas — que es donde se rompe la accesibilidad
 * cuando cada pantalla arma su propio input a mano.
 */
export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: React.ReactNode;
  /** Mensaje de error. Su presencia marca el campo como inválido. */
  error?: string | null;
  /** Texto de ayuda bajo el campo; se oculta cuando hay error. */
  hint?: React.ReactNode;
  /** Icono decorativo dentro del campo, a la izquierda. */
  icon?: React.ReactNode;
  /** Elemento interactivo a la derecha (ver contraseña, limpiar, unidad). */
  trailing?: React.ReactNode;
  containerClassName?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icon, trailing, className, containerClassName, id, ...rest },
  ref
) {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  const describedById = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65"
        >
          {label}
        </label>
      )}

      <div className="relative">
        {icon && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
          >
            {icon}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          className={cn(
            'w-full rounded-control border bg-[#0A121D] px-4 py-[var(--field-py)] text-sm text-white',
            'placeholder-white/35 transition-all duration-150 ease-out',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070E17]',
            icon && 'pl-10',
            trailing && 'pr-11',
            error
              ? 'border-red-500/40 focus:border-red-500/60 focus-visible:ring-red-500/30'
              : 'border-white/10 focus:border-white/30 focus:bg-[#0C1623] focus-visible:ring-white/20',
            className
          )}
          {...rest}
        />

        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60">{trailing}</span>
        )}
      </div>

      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-xs text-red-400 font-medium">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-2 text-xs font-normal text-white/55">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
