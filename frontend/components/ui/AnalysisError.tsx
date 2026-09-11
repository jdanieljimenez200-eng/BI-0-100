'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

interface AnalysisErrorProps {
  modulo?: string;
  title?: string;
  message?: string | null;
  /** Ruta para reintentar el análisis (botón "Intentar de nuevo") */
  retryHref?: string;
  retryLabel?: string;
  /** Alternativa a retryHref: callback de reintento */
  onRetry?: () => void;
}

export function AnalysisError({ modulo, title, message, retryHref, retryLabel, onRetry }: AnalysisErrorProps) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
      className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 backdrop-blur-md shadow-[0_0_20px_rgba(239,68,68,0.06)]"
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-8-4a1 1 0 00-1 1v3a1 1 0 002 0V7a1 1 0 00-1-1zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div className="min-w-0">
          {title && <p className="font-medium text-red-300">{title}</p>}
          <p className="text-red-400">{message || 'No se pudo cargar el análisis'}</p>
          {retryHref && (
            <Link
              href={retryHref}
              className="mt-4 inline-block rounded-lg border border-red-400/30 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/10"
            >
              {retryLabel || 'Intentar de nuevo'}
            </Link>
          )}
          {!retryHref && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-block rounded-lg border border-red-400/30 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/10"
            >
              {retryLabel || 'Intentar de nuevo'}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default AnalysisError;
