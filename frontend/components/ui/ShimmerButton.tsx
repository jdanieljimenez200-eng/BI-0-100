'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

export interface ShimmerButtonProps {
  children?: React.ReactNode;
  rotatingTexts?: string[];
  href?: string;
  onClick?: () => void;
  variant?: 'accent' | 'primary' | 'ghost' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: React.ReactNode;
  intervalMs?: number;
}

/**
 * Replicación de "Shimmer Button & Rotating CTA" de Anim Master Lib y Vengence UI.
 * Combina un destello de luz diagonal continuo, micro-borde iluminado y texto
 * de proposición de valor rotativo opcional ("Validar Gratis | Sin Tarjeta | En 3 Minutos").
 */
export function ShimmerButton({
  children,
  rotatingTexts,
  href,
  onClick,
  variant = 'accent',
  size = 'md',
  className = '',
  icon,
  intervalMs = 3200,
}: ShimmerButtonProps) {
  const shouldReduce = useReducedMotion();
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    if (!rotatingTexts || rotatingTexts.length <= 1 || shouldReduce) return;
    const interval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % rotatingTexts.length);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [rotatingTexts, intervalMs, shouldReduce]);

  const sizeClasses = {
    sm: 'h-9 px-4 text-xs',
    md: 'h-11 px-6 text-sm',
    lg: 'h-13 px-8 text-base',
  }[size];

  const variantStyles = {
    accent:
      'bg-[#E74C3C] text-white border border-[#E74C3C]/50 shadow-[0_0_24px_rgba(231,76,60,0.35)] hover:shadow-[0_0_36px_rgba(231,76,60,0.55)]',
    primary:
      'bg-white text-[#070E17] border border-white/40 shadow-[0_0_24px_rgba(255,255,255,0.2)] hover:shadow-[0_0_36px_rgba(255,255,255,0.35)]',
    ghost:
      'bg-white/[0.04] text-white border border-white/10 hover:bg-white/[0.08] hover:border-white/20',
    dark:
      'bg-[#0A121D] text-white border border-white/15 hover:border-white/30 shadow-surface',
  }[variant];

  const innerContent = (
    <span className="relative z-10 flex items-center justify-center gap-2 font-bold tracking-tight">
      {rotatingTexts && rotatingTexts.length > 0 ? (
        <span className="relative inline-block overflow-hidden h-[1.3em]">
          <AnimatePresence mode="wait">
            <motion.span
              key={textIndex}
              initial={shouldReduce ? undefined : { y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={shouldReduce ? undefined : { y: -16, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="inline-block"
            >
              {rotatingTexts[textIndex]}
            </motion.span>
          </AnimatePresence>
        </span>
      ) : (
        children
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
    </span>
  );

  const baseClasses = `group relative inline-flex items-center justify-center overflow-hidden rounded-xl font-bold transition-all duration-200 active:scale-[0.98] select-none ${sizeClasses} ${variantStyles} ${className}`;

  const shimmerSweep = !shouldReduce && (
    <span
      className="pointer-events-none absolute inset-0 -translate-x-full animate-[button-shimmer_3.5s_infinite_ease-in-out] bg-gradient-to-r from-transparent via-white/30 to-transparent"
      aria-hidden="true"
    />
  );

  if (href) {
    return (
      <Link href={href} className={baseClasses}>
        {shimmerSweep}
        {innerContent}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={baseClasses}>
      {shimmerSweep}
      {innerContent}
    </button>
  );
}

export default ShimmerButton;
