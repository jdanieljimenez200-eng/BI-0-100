'use client';

import React from 'react';

export interface ShinyTextProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'silver' | 'accent' | 'cyan' | 'gold';
  speed?: number; // seconds per cycle
  as?: React.ElementType;
}

/**
 * Replicación de "Shiny Text / Shimmering Headlines" de Anim Master Lib y Vengence UI.
 * Crea un barrido continuo de brillo metálico o cromático sobre el texto.
 */
export function ShinyText({
  children,
  className = '',
  variant = 'silver',
  speed = 5,
  as: Component = 'span',
}: ShinyTextProps) {
  const gradientMap = {
    silver:
      'linear-gradient(110deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,1) 45%, rgba(255,255,255,0.4) 65%)',
    accent:
      'linear-gradient(110deg, rgba(231,76,60,0.6) 0%, rgba(255,255,255,1) 50%, rgba(231,76,60,0.6) 100%)',
    cyan:
      'linear-gradient(110deg, rgba(34,211,238,0.5) 0%, rgba(255,255,255,1) 50%, rgba(34,211,238,0.5) 100%)',
    gold:
      'linear-gradient(110deg, rgba(251,191,36,0.5) 0%, rgba(255,255,255,1) 50%, rgba(251,191,36,0.5) 100%)',
  };

  return (
    <Component
      style={{
        backgroundImage: gradientMap[variant],
        backgroundSize: '200% 100%',
        animation: `shiny-text ${speed}s linear infinite`,
      }}
      className={`inline-block bg-clip-text text-transparent motion-reduce:!bg-none motion-reduce:!text-white ${className}`}
    >
      {children}
    </Component>
  );
}

export default ShinyText;
