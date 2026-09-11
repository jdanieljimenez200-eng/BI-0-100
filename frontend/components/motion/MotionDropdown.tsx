'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { dropdownVariants } from '@/lib/motion/tokens';

export interface MotionDropdownProps {
  isOpen: boolean;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function MotionDropdown({
  isOpen,
  children,
  align = 'left',
  className = '',
}: MotionDropdownProps) {
  const shouldReduce = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={shouldReduce ? undefined : dropdownVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ transformOrigin: `top ${align}` }}
          className={`absolute z-50 top-full mt-1.5 ${align === 'left' ? 'left-0' : 'right-0'} ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default MotionDropdown;
