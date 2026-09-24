'use client';

import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  shortcutKey?: string;
  onClear?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Campo de búsqueda ejecutivo (SearchInput)
 * Inspirado en Linear y Vercel:
 * - Icono de lupa alineado ópticamente
 * - Botón de limpieza rápida instantáneo al tener texto
 * - Tecla de atajo visual opcional (KBD)
 * - Foco con specular highlight sin saltos de layout
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  className,
  containerClassName,
  shortcutKey,
  onClear,
  autoFocus,
  disabled,
  size = 'md',
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Atajo de teclado global opcional
  useEffect(() => {
    if (!shortcutKey) return;
    const lowerKey = shortcutKey.toLowerCase();
    const isSlash = shortcutKey === '/';

    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.key.toLowerCase() === lowerKey || (isSlash && e.key === '/')) &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcutKey]);

  const handleClear = () => {
    onChange('');
    onClear?.();
    inputRef.current?.focus();
  };

  const sizeClasses = {
    sm: 'py-1.5 pl-8 pr-7 text-xs',
    md: 'py-2 pl-9 pr-8 text-xs',
    lg: 'py-2.5 pl-10 pr-9 text-sm',
  }[size];

  const iconSizes = {
    sm: 'w-3 h-3 left-2.5',
    md: 'w-3.5 h-3.5 left-3',
    lg: 'w-4 h-4 left-3.5',
  }[size];

  return (
    <div className={cn('relative w-full', containerClassName)}>
      <Search
        className={cn(
          'absolute top-1/2 -translate-y-1/2 text-white/35 pointer-events-none shrink-0 transition-colors',
          iconSizes
        )}
        strokeWidth={1.8}
        aria-hidden="true"
      />

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={cn(
          'w-full bg-[#0A121D] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30',
          'outline-none transition-all duration-200 ease-out',
          'focus:border-white/25 focus:bg-[#0E1726] focus:ring-1 focus:ring-white/20',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          sizeClasses,
          className
        )}
      />

      {value ? (
        <button
          type="button"
          onClick={handleClear}
          title="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-white/35 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      ) : shortcutKey ? (
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-semibold text-white/30 border border-white/10 rounded bg-white/[0.03]">
          {shortcutKey.toUpperCase()}
        </kbd>
      ) : null}
    </div>
  );
}

export default SearchInput;
