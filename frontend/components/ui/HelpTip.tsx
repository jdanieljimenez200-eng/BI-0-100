'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { tooltipVariants } from '@/lib/motion/tokens';

/**
 * Icono "?" con explicación contextual y micro-resorte de Animate UI.
 * - Hover (desktop) y tap (móvil) abren el tooltip.
 * - Accesible: botón con aria-label, panel con role="tooltip", cierra con Escape.
 * - Interpolación suave de escala y opacidad.
 */
export function HelpTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex align-middle ml-1.5"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label ? `Ayuda: ${label}` : 'Más información'}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-white/25 text-[10px] font-bold leading-none text-white/50 transition-colors hover:border-brand-accent hover:text-brand-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60"
      >
        ?
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            id={tipId}
            role="tooltip"
            variants={shouldReduce ? undefined : tooltipVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute bottom-full left-1/2 z-40 mb-2 w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-[#0F1C2E]/95 px-3 py-2 text-[11px] font-normal leading-snug text-white/90 shadow-2xl backdrop-blur-xl pointer-events-none"
          >
            {text}
            <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-white/10 bg-[#0F1C2E]" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export default HelpTip;