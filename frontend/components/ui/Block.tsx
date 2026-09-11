'use client';

import type { ReactNode } from 'react';

interface BlockProps {
  children: ReactNode;
  className?: string;
  /** Número opcional de paso */
  n?: number;
  title?: string;
  subtitle?: string;
  optional?: boolean;
}

export function Block({ children, className = '', n, title, subtitle, optional }: BlockProps) {
  return (
    <div className={`bg-white/5 border border-white/10 rounded-lg p-4 ${className}`}>
      {(title || n !== undefined || optional) && (
        <div className="mb-3 flex items-baseline gap-2">
          {n !== undefined && (
            <span className="text-xs font-mono text-white/40">{String(n).padStart(2, '0')}</span>
          )}
          {title && <h4 className="font-medium text-white">{title}</h4>}
          {optional && (
            <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
              opcional
            </span>
          )}
        </div>
      )}
      {subtitle && <p className="mb-3 text-sm text-white/60">{subtitle}</p>}
      {children}
    </div>
  );
}
