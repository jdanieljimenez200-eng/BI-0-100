'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface KineticRollProps {
  text: string;
  className?: string;
  letterClassName?: string;
  stagger?: number;
  duration?: number;
  delay?: number;
}

/**
 * Replicación de la "Kinetic Rolling Typography" de Skiper UI.
 * Divide una palabra o número en columnas verticales que giran individualmente
 * con desaceleración física escalonada al entrar o cambiar.
 */
export function KineticRoll({
  text,
  className = '',
  letterClassName = '',
  stagger = 0.035,
  duration = 0.75,
  delay = 0,
}: KineticRollProps) {
  const shouldReduce = useReducedMotion();
  const characters = text.split('');

  if (shouldReduce) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={`inline-flex items-baseline overflow-hidden ${className}`}>
      {characters.map((char, index) => {
        if (char === ' ') {
          return (
            <span key={index} className="inline-block w-[0.3em]">
              &nbsp;
            </span>
          );
        }

        return (
          <span
            key={`${char}-${index}`}
            className="relative inline-block overflow-hidden"
            style={{ height: '1em', verticalAlign: 'baseline' }}
          >
            <motion.span
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              transition={{
                duration,
                ease: [0.16, 1, 0.3, 1], // Apple / Linear physical curve
                delay: delay + index * stagger,
              }}
              className={`inline-block leading-none ${letterClassName}`}
            >
              {char}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

export default KineticRoll;
