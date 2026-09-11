'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { tooltipVariants } from '@/lib/motion/tokens';

export interface MotionTooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
}

export function MotionTooltip({
  text,
  children,
  className = '',
  side = 'top',
}: MotionTooltipProps) {
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
      className={`relative inline-flex align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? tipId : undefined}
    >
      {children}

      <AnimatePresence>
        {open && (
          <motion.span
            id={tipId}
            role="tooltip"
            variants={shouldReduce ? undefined : tooltipVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 px-2.5 py-1.5 rounded-lg border border-white/10 bg-[#0F1C2E]/95 text-white/90 text-xs font-normal shadow-2xl backdrop-blur-md whitespace-nowrap ${
              side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            {text}
            <span
              className={`absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-white/10 bg-[#0F1C2E] ${
                side === 'top'
                  ? 'top-full -translate-y-1 border-b border-r'
                  : 'bottom-full translate-y-1 border-t border-l'
              }`}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export default MotionTooltip;
