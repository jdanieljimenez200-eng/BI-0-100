'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Componente canónico de migas de pan (Breadcrumbs)
 * Basado en las guías de diseño de Apple y Linear:
 * - Separadores microscópicos y tenues
 * - Transición de color suave al hover
 * - Elemento terminal resaltado con mayor luminosidad
 * - Accesibilidad semántica con <nav> y lista ordenada
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Migas de pan" className={cn('flex items-center text-xs text-white/40 mb-5 select-none', className)}>
      <ol className="flex items-center gap-1.5 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const Icon = item.icon;

          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="w-3 h-3 text-white/20 shrink-0"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}

              {isLast || !item.href ? (
                <span
                  className={cn(
                    'flex items-center gap-1.5 font-medium truncate max-w-[220px] sm:max-w-xs',
                    isLast ? 'text-white/85 font-semibold' : 'text-white/50'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-white/60 shrink-0" />}
                  <span>{item.label}</span>
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="flex items-center gap-1.5 text-white/45 hover:text-white transition-colors duration-150 truncate max-w-[160px] sm:max-w-xs"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-white/40 group-hover:text-white shrink-0" />}
                  <span>{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
