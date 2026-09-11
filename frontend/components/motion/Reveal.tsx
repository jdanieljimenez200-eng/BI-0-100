'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { MOTION_DURATIONS, MOTION_EASINGS, REVEAL_VIEWPORT } from '@/lib/motion/tokens';

/**
 * Revela su contenido al entrar en viewport. Sustituye a los `ScrollTrigger`
 * de GSAP repartidos por el landing.
 *
 * El escalonado se pasa como `index` en lugar de con `staggerChildren` porque
 * las variantes de Framer Motion solo se propagan por cadenas continuas de
 * componentes `motion`, y estas rejillas intercalan elementos normales.
 *
 * `once` está activo por defecto: re-animar al volver a subir el scroll llama
 * la atención sobre la animación en vez de sobre el contenido.
 */
export function Reveal({
  children,
  index = 0,
  y = 24,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  /** Posición en la rejilla; escalona la entrada 60 ms por elemento. */
  index?: number;
  /** Desplazamiento vertical inicial en px. */
  y?: number;
  className?: string;
  as?: 'div' | 'li' | 'section' | 'article';
}) {
  const shouldReduce = useReducedMotion();
  const Componente = motion[as];

  return (
    <Componente
      className={className}
      initial={shouldReduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={REVEAL_VIEWPORT}
      transition={{
        duration: MOTION_DURATIONS.slow,
        ease: MOTION_EASINGS.easeOutQuart,
        delay: Math.min(index, 8) * 0.06,
      }}
    >
      {children}
    </Componente>
  );
}

export default Reveal;
