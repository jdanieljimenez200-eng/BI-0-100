'use client';

import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { pageTransitionVariants } from '@/lib/motion/tokens';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return <>{children}</>;
  }

  return (
    <motion.div
      key={pathname}
      variants={pageTransitionVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      // Bloque, no flex: dentro de un flex-col, una página con `max-w-* mx-auto`
      // no se estira y toma el ancho de su contenido; en pantallas medianas
      // quedaba más ancha que la ventana y se cortaba a la derecha. Con
      // movimiento reducido este envoltorio no existe, así que nadie dependía de él.
      className="w-full min-w-0 flex-1"
    >
      {children}
    </motion.div>
  );
}

export default PageTransition;
