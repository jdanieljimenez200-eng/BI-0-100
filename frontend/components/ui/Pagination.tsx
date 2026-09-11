'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Paginación compacta con elipsis. Muestra siempre la primera y la última
 * página más una ventana alrededor de la actual, para que el ancho del control
 * no crezca con el número de páginas.
 */
function construirRango(actual: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const ventana = new Set<number>([1, total, actual, actual - 1, actual + 1]);
  if (actual <= 3) [2, 3, 4].forEach((p) => ventana.add(p));
  if (actual >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => ventana.add(p));

  const paginas = Array.from(ventana)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  return paginas.reduce<(number | 'gap')[]>((acc, pagina, i) => {
    if (i > 0 && pagina - paginas[i - 1] > 1) acc.push('gap');
    acc.push(pagina);
    return acc;
  }, []);
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  /** Página actual, 1-indexada. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const rango = construirRango(page, totalPages);
  const btn =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-control px-2.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-30 disabled:pointer-events-none';

  return (
    <nav aria-label="Paginación" className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={cn(btn, 'text-white/50 hover:bg-white/[0.06] hover:text-white')}
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>

      {rango.map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} aria-hidden className="px-1.5 text-sm text-white/25">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
            className={cn(
              btn,
              item === page
                ? 'bg-white/[0.1] font-semibold text-white'
                : 'text-white/50 hover:bg-white/[0.06] hover:text-white'
            )}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        aria-label="Página siguiente"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={cn(btn, 'text-white/50 hover:bg-white/[0.06] hover:text-white')}
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </nav>
  );
}

export default Pagination;
