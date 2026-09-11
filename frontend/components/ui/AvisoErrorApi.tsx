'use client';

/**
 * Aviso de error para los formularios que lanzan análisis (mercado, marketing,
 * finanzas, legal, ventas) y para las herramientas con gate de plan.
 *
 * Dos variantes en un solo componente porque los dos casos NO son el mismo
 * problema para quien lo lee:
 *  - `upgradeRequired` → el 403 viene de un límite/feature de plan
 *    (`upgrade_required` en la respuesta; ver lib/apiError.ts). El formulario
 *    está bien: no hay nada que corregir, solo mejorar de plan. Aviso ámbar con
 *    salida directa a /dashboard/billing.
 *  - resto → error recuperable corrigiendo datos o reintentando. Conserva el
 *    estilo rojo (`brand-accent`) que ya tenían las páginas, para no cambiar el
 *    lenguaje visual de los errores de validación.
 *
 * Se anima con la utilidad `animate-fade-in` de tailwind.config.js y no con
 * framer-motion: ventas y finanzas no importan framer-motion hoy y no
 * merece la pena añadirles la dependencia por un aviso de tres líneas.
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

export interface AvisoErrorApiProps {
  /** Mensaje ya interpretado (`interpretarErrorApi().mensaje`). Vacío/null → no renderiza nada. */
  mensaje?: string | null;
  /** `interpretarErrorApi().upgradeRequired`. Activa la variante ámbar. */
  upgradeRequired?: boolean;
  /** Encabezado de la variante ámbar. */
  titulo?: string;
  ctaHref?: string;
  ctaLabel?: string;
  /** Clases extra del contenedor, para los márgenes propios de cada página. */
  className?: string;
}

export default function AvisoErrorApi({
  mensaje,
  upgradeRequired = false,
  titulo = 'Límite de tu plan alcanzado',
  ctaHref = '/dashboard/billing',
  ctaLabel = 'Ver planes',
  className = '',
}: AvisoErrorApiProps) {
  const shouldReduce = useReducedMotion();
  const texto = typeof mensaje === 'string' ? mensaje.trim() : '';
  if (!texto) return null;

  if (!upgradeRequired) {
    return (
      <motion.p
        role="alert"
        aria-live="polite"
        initial={shouldReduce ? false : { opacity: 0, y: 6, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 450, damping: 30 }}
        className={`break-words rounded-xl border border-brand-accent/20 bg-brand-accent/10 px-4 py-3 text-center text-sm font-semibold text-brand-accent shadow-[0_0_15px_rgba(231,76,60,0.08)] ${className}`}
      >
        {texto}
      </motion.p>
    );
  }

  return (
    <motion.div
      role="alert"
      aria-live="polite"
      initial={shouldReduce ? false : { opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
      className={`flex flex-col gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 sm:flex-row sm:items-center shadow-[0_0_15px_rgba(251,191,36,0.08)] ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-amber-200">{titulo}</p>
        <p className="mt-0.5 break-words text-[12.5px] leading-relaxed text-amber-200/70">{texto}</p>
      </div>

      <Link
        href={ctaHref}
        className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-[12.5px] font-bold text-amber-200 transition-colors hover:bg-amber-400/20 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
      >
        {ctaLabel}
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </motion.div>
  );
}