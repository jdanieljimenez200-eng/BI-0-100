import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { API_ORIGIN } from '@/lib/config';

/**
 * Combina clases condicionales y resuelve conflictos de Tailwind, de modo que
 * la clase pasada por `className` siempre gane sobre la variante por defecto
 * del componente (`cn('px-4', props.className)` con `px-8` deja `px-8`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Normaliza una imagen_url almacenada en la DB al backend actual.
 * Extrae el pathname (/uploads/file.jpg) y lo concatena con el origen configurado.
 */
export function getImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { pathname } = new URL(url);
    return `${API_ORIGIN}${pathname}`;
  } catch {
    return url;
  }
}
