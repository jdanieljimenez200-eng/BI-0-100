'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BackButtonProps {
  /**
   * Ruta de destino jerárquico fijo o fallback seguro (ej: '/dashboard/herramientas').
   * Si no se especifica, por defecto es '/dashboard'.
   */
  href?: string;
  /**
   * Etiqueta de texto opcional (ej: 'Volver', 'Herramientas', 'Mis productos').
   */
  label?: string;
  /**
   * Variante visual: 'pill' (con o sin texto) o 'icon' (squircle compacto de 32x32px).
   */
  variant?: 'pill' | 'icon';
  /**
   * Tamaño del botón. Por defecto 'sm'.
   */
  size?: 'sm' | 'md';
  /**
   * Si es true, intenta retroceder con router.back() cuando existe historial interno.
   * Por defecto false para garantizar navegación determinista al padre jerárquico.
   */
  useHistory?: boolean;
  /**
   * Clases adicionales de Tailwind.
   */
  className?: string;
  /**
   * Callback opcional al hacer clic antes de navegar.
   */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Componente canónico de retroceso (Back Navigation Button).
 * Basado en las directrices de Quiet Luxury y Apple Human Interface:
 * - Icono ArrowLeft con micro-desplazamiento en hover (-translate-x-0.5)
 * - Bordes sutiles con translucidez y respuesta háptica al tap (active:scale-95)
 * - Navegación instantánea mediante Next.js Link
 */
export function BackButton({
  href = '/dashboard',
  label,
  variant = 'pill',
  size = 'sm',
  useHistory = false,
  className,
  onClick,
}: BackButtonProps) {
  const router = useRouter();
  const ariaLabel = label || 'Volver a la vista anterior';

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
    }
    if (useHistory && typeof window !== 'undefined' && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  };

  const isIconOnly = variant === 'icon' || !label;

  const content = (
    <>
      <ArrowLeft
        className={cn(
          'shrink-0 text-white/50 transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:text-white',
          size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
        )}
        strokeWidth={2}
        aria-hidden="true"
      />
      {label && variant !== 'icon' && (
        <span className="truncate tracking-tight font-medium text-white/70 group-hover:text-white transition-colors duration-150">
          {label}
        </span>
      )}
    </>
  );

  const baseStyles = cn(
    'group inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md select-none transition-all duration-150',
    'hover:bg-white/[0.08] hover:border-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 cursor-pointer',
    isIconOnly
      ? size === 'sm'
        ? 'w-8 h-8 justify-center p-0 shrink-0'
        : 'w-9 h-9 justify-center p-0 shrink-0'
      : size === 'sm'
        ? 'h-8 px-2.5 gap-2 text-xs'
        : 'h-9 px-3 gap-2.5 text-sm',
    className
  );

  if (useHistory && !href) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={baseStyles}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={baseStyles}
    >
      {content}
    </Link>
  );
}

export default BackButton;
