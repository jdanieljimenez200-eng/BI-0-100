'use client';

import React from 'react';

export interface BorderBeamProps {
  size?: number;
  duration?: number;
  borderWidth?: number;
  anchor?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
  className?: string;
}

/**
 * Replicación de la animación "Border Beam" de Vengence UI.
 * Produce un haz de luz hiper-enfocado que viaja a lo largo del perímetro
 * concéntrico del contenedor padre.
 */
export function BorderBeam({
  size = 60,
  duration = 6,
  borderWidth = 1.5,
  anchor = 90,
  colorFrom = 'rgba(255, 255, 255, 0.8)',
  colorTo = 'transparent',
  delay = 0,
  className = '',
}: BorderBeamProps) {
  return (
    <div
      style={
        {
          '--size': size,
          '--duration': duration,
          '--anchor': anchor,
          '--border-width': borderWidth,
          '--color-from': colorFrom,
          '--color-to': colorTo,
          '--delay': delay,
        } as React.CSSProperties
      }
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent] [mask-clip:padding-box,border-box] [mask-composite:exclude] [mask:linear-gradient(transparent,transparent),linear-gradient(white,white)] after:absolute after:aspect-square after:w-[calc(var(--size)*1px)] after:animate-[border-beam_calc(var(--duration)*1s)_infinite_linear] after:[animation-delay:var(--delay)s] after:[background:linear-gradient(to_left,var(--color-from),var(--color-to),transparent)] after:[offset-anchor:calc(var(--anchor)*1%)_50%] after:[offset-path:rect(0_auto_auto_0_round_calc(var(--size)*1px))] motion-reduce:hidden ${className}`}
    />
  );
}

export default BorderBeam;
