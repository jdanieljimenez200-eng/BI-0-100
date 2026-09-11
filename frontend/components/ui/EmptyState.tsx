'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { MODULE_THEME, type ModuloSlug } from '@/lib/moduleTheme';
import { MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motion/tokens';

/**
 * Estado vacío: icono en un contenedor teñido, una frase que explica por qué
 * no hay nada, y una única acción primaria. Un estado vacío con dos llamadas
 * a la acción compitiendo no ayuda a decidir, así que `action` es una sola.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  modulo,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Tiñe el icono con el acento del módulo. */
  modulo?: ModuloSlug;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();
  const rgb = modulo ? MODULE_THEME[modulo].rgb : null;

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION_DURATIONS.base, ease: MOTION_EASINGS.easeOutQuart }}
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center',
        className
      )}
    >
      {icon && (
        <div
          aria-hidden
          className="mb-6 flex h-14 w-14 items-center justify-center rounded-surface border border-white/[0.08] bg-white/[0.04] text-white/45 [&_svg]:h-6 [&_svg]:w-6"
          style={
            rgb
              ? {
                  color: `rgb(${rgb})`,
                  backgroundColor: `rgb(${rgb} / 0.1)`,
                  borderColor: `rgb(${rgb} / 0.18)`,
                }
              : undefined
          }
        >
          {icon}
        </div>
      )}

      <h3 className="text-base font-semibold tracking-tight text-white">{title}</h3>

      {description && (
        <p className="mt-2 max-w-sm text-sm font-light leading-relaxed text-white/40">
          {description}
        </p>
      )}

      {action && <div className="mt-7">{action}</div>}
    </motion.div>
  );
}

export default EmptyState;
