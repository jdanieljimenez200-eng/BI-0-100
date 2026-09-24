'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOTION_SPRINGS } from '@/lib/motion/tokens';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastProps {
  msg?: string;
  message?: string;
  title?: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
  className?: string;
}

const TOAST_ICONS: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_COLORS: Record<ToastType, { icon: string; border: string; glow: string }> = {
  success: {
    icon: 'text-emerald-400',
    border: 'border-emerald-500/30',
    glow: 'shadow-[0_4px_24px_rgba(16,185,129,0.18)]',
  },
  error: {
    icon: 'text-red-400',
    border: 'border-red-500/30',
    glow: 'shadow-[0_4px_24px_rgba(239,68,68,0.18)]',
  },
  warning: {
    icon: 'text-amber-400',
    border: 'border-amber-500/30',
    glow: 'shadow-[0_4px_24px_rgba(245,158,11,0.18)]',
  },
  info: {
    icon: 'text-blue-400',
    border: 'border-blue-500/30',
    glow: 'shadow-[0_4px_24px_rgba(59,130,246,0.18)]',
  },
};

/**
 * Notificación Toast ejecutiva con Framer Motion (estilo Linear / Sonner)
 * - Auto-cierre con timer limpio
 * - Soporte para título y mensaje (vía `message` o `msg`)
 * - Micro-borde especular calibrado por tipo
 * - Entrada con resorte y salida desvanecida
 */
export function Toast({
  msg,
  message,
  title,
  type = 'success',
  onClose,
  duration = 3200,
  className,
}: ToastProps) {
  const content = message ?? msg ?? '';
  useEffect(() => {
    if (!duration || duration <= 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const Icon = TOAST_ICONS[type];
  const colors = TOAST_COLORS[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.15 } }}
      transition={MOTION_SPRINGS.snappy}
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-2xl p-4 min-w-[280px] max-w-md',
        'bg-[#0F1C2A]/95 backdrop-blur-xl border select-none',
        colors.border,
        colors.glow,
        className
      )}
    >
      <div className="shrink-0 pt-0.5">
        <Icon className={cn('w-4 h-4', colors.icon)} />
      </div>

      <div className="flex-1 min-w-0 pr-2">
        {title && <p className="text-xs font-semibold text-white tracking-tight leading-snug">{title}</p>}
        <p className={cn('text-xs text-white/80 leading-relaxed', title && 'mt-0.5 text-white/60')}>
          {content}
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        title="Cerrar notificación"
        className="shrink-0 p-1 rounded-lg text-white/35 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export default Toast;
