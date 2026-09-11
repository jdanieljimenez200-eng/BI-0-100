'use client';

import React from 'react';

import { cn } from '@/lib/utils';

/**
 * Tabla de datos densa pero legible: hairlines en vez de bordes marcados,
 * cabecera en versalitas y cifras en tabular-nums para que las columnas
 * numéricas queden alineadas verticalmente aunque cambien los dígitos.
 *
 * `TableWrap` es obligatorio: da el scroll horizontal propio de la tabla, de
 * modo que una tabla ancha nunca provoque scroll horizontal en la página.
 */
export function TableWrap({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-surface border border-white/[0.06]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Table({
  children,
  className,
  ...rest
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn('w-full border-collapse text-sm', className)} {...rest}>
      {children}
    </table>
  );
}

export function THead({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <thead className={cn('bg-white/[0.025]', className)}>
      {children}
    </thead>
  );
}

export function TBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tbody className={cn('divide-y divide-white/[0.05]', className)}>{children}</tbody>;
}

export function TR({
  children,
  className,
  interactive = false,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'transition-colors duration-150',
        interactive && 'cursor-pointer hover:bg-white/[0.03]',
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
  numeric = false,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-white/[0.07] px-4 py-3 text-left',
        'text-[10px] font-bold uppercase tracking-[0.16em] text-white/40',
        numeric && 'text-right',
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  numeric = false,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'px-4 py-3.5 align-middle text-white/80',
        numeric && 'text-right font-medium tabular-nums',
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
