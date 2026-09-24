'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MOTION_EASINGS, REVEAL_VIEWPORT } from '@/lib/motion/tokens';

/**
 * SectionReveal — Anima la entrada del encabezado de una sección (h2 + subtítulo)
 * con un efecto de revelación vertical elegante al entrar en viewport.
 *
 * A diferencia de `Reveal` (para cards individuales), este componente usa una
 * transición más deliberada (0.7s) con stagger interno para que el título entre
 * primero y el subtítulo aparezca 150ms después.
 */

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.05,
    },
  },
};

const childVariants = {
  hidden: {
    opacity: 0,
    y: 32,
    filter: 'blur(4px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.7,
      ease: MOTION_EASINGS.easeOutQuart,
    },
  },
};

export function SectionReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: "some" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * SectionReveal.Item — Envuelve cada hijo individual (h2, p, etc.)
 * para recibir las variantes de stagger del contenedor padre.
 */
export function SectionRevealItem({
  children,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'h2' | 'h3' | 'p' | 'span';
}) {
  const Tag = motion[as];

  return (
    <Tag className={className} variants={childVariants}>
      {children}
    </Tag>
  );
}

export default SectionReveal;
