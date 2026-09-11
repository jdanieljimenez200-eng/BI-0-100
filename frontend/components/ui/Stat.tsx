'use client';

import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ICON } from './icons';

/**
 * Cifra destacada (KPI). Sustituye a las clases `.kpi-*` de globals.css.
 *
 * La jerarquía es deliberada: la etiqueta es pequeña y en versalitas, el valor
 * domina, y el delta es lo último que se lee. El valor va en `tabular-nums`
 * para que una rejilla de KPIs no baile cuando cambien los dígitos.
 */
export function Stat({
  label,
  value,
  sub,
  delta,
  accent,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Variación porcentual: positiva se lee como mejora. */
  delta?: number | null;
  /** Color del filete lateral, normalmente el acento del módulo. */
  accent?: string;
  className?: string;
}) {
  const tieneDelta = typeof delta === 'number' && Number.isFinite(delta);
  const positivo = tieneDelta && delta >= 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-1 border-l-2 border-white/10 py-1 pl-5 transition-colors duration-300 hover:border-white/30',
        className
      )}
      style={accent ? { borderLeftColor: `rgb(${accent} / 0.55)` } : undefined}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</p>

      <p className="text-3xl font-black tracking-tighter tabular-nums text-white">{value}</p>

      {(sub || tieneDelta) && (
        <div className="mt-1 flex items-center gap-2">
          {tieneDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
                positivo ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {positivo ? <TrendingUp {...ICON.xs} /> : <TrendingDown {...ICON.xs} />}
              {positivo ? '+' : ''}
              {delta.toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-xs font-light text-white/30">{sub}</span>}
        </div>
      )}
    </div>
  );
}

export default Stat;
