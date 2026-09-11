'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { esPlanDePago } from '../../lib/plans';

/**
 * Tapa una sección cuyo contenido NO se generó por ser de plan de pago.
 *
 * Decisiones deliberadas:
 * - El contenido bloqueado no viaja del backend (no se genera para ahorrar
 *   coste de IA), así que el blur se aplica sobre un PLACEHOLDER decorativo
 *   —normalmente <SkeletonBloque/>— y nunca sobre datos reales del usuario.
 * - El placeholder es aria-hidden y pointer-events-none: un lector de pantalla
 *   solo anuncia el mensaje de desbloqueo, y no hay foco atrapado en relleno.
 * - data-print="hide": globals.css ya oculta estos nodos en @media print, así
 *   que la sección bloqueada no ensucia el PDF de las páginas de resultado.
 * - Si el plan es de pago devuelve los children tal cual (sin wrapper), para
 *   no alterar el layout de quien ya paga.
 */

export interface LockedSectionProps {
  /** Plan de la cuenta tal cual llega de /auth/me o localStorage. */
  plan: string | null | undefined;
  /** Contenido real (plan de pago) o placeholder borroso (plan gratuito). */
  children: ReactNode;
  /** Título del candado. */
  titulo?: string;
  /** Detalle corto de qué se desbloquea. */
  detalle?: string;
  /** Texto del botón. */
  cta?: string;
  /** Altura mínima del área tapada. Útil cuando el placeholder es pequeño. */
  minHeight?: number;
  className?: string;
}

export default function LockedSection({
  plan,
  children,
  titulo = 'Desbloquea con Premium',
  detalle,
  cta = 'Mejorar plan',
  minHeight,
  className = '',
}: LockedSectionProps) {
  if (esPlanDePago(plan)) return <>{children}</>;

  return (
    <div
      data-print="hide"
      className={`relative isolate overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.015] ${className}`}
      style={minHeight ? { minHeight } : undefined}
    >
      {/* Relleno decorativo: no es dato real y no debe ser navegable. */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none blur-[6px] opacity-40 saturate-50"
      >
        {children}
      </div>

      {/* Capa del candado. */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 px-5 py-6 text-center bg-gradient-to-b from-[#0B0F17]/70 via-[#0B0F17]/85 to-[#0B0F17]/95">
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-400"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <p className="text-[13.5px] sm:text-[14px] font-bold text-white/85 tracking-tight leading-snug break-words max-w-[36ch]">
          {titulo}
        </p>
        {detalle && (
          <p className="text-[11.5px] sm:text-[12px] text-white/40 leading-relaxed break-words max-w-[46ch]">
            {detalle}
          </p>
        )}
        <Link
          href="/dashboard/billing"
          className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold text-amber-300 border border-amber-400/30 bg-amber-500/10 transition-all duration-200 hover:bg-amber-500/20 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          {cta}
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

/**
 * Placeholder genérico para meter dentro de <LockedSection>. No representa
 * ningún dato del usuario: son barras de distintos anchos para que el bloque
 * tapado tenga la misma silueta que tendría con contenido.
 */
export function SkeletonBloque({
  filas = 4,
  className = '',
}: {
  filas?: number;
  className?: string;
}) {
  // Anchos fijos (no aleatorios) para que el render del servidor y el del
  // cliente coincidan y no haya desajuste de hidratación.
  const anchos = ['92%', '78%', '85%', '64%', '88%', '71%'];

  return (
    <div aria-hidden="true" className={`p-4 sm:p-5 space-y-2.5 ${className}`}>
      {Array.from({ length: Math.max(1, filas) }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded-full bg-white/[.08]"
          style={{ width: anchos[i % anchos.length] }}
        />
      ))}
    </div>
  );
}

/** Placeholder en forma de tarjetas, para rejillas (publicaciones). */
export function SkeletonTarjetas({
  cantidad = 3,
  className = '',
}: {
  cantidad?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 sm:p-5 ${className}`}
    >
      {Array.from({ length: Math.max(1, cantidad) }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[.06] bg-white/[.02] p-3.5 space-y-2.5">
          <div className="h-3 w-3/4 rounded-full bg-white/[.09]" />
          <div className="h-2.5 w-1/2 rounded-full bg-white/[.06]" />
          <div className="h-2.5 w-2/3 rounded-full bg-white/[.06]" />
        </div>
      ))}
    </div>
  );
}