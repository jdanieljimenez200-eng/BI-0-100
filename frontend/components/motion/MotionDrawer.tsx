'use client';

import { useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { backdropVariants, MOTION_SPRINGS, MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motion/tokens';

export interface MotionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right';
  width?: string;
  className?: string;
}

export function MotionDrawer({
  isOpen,
  onClose,
  children,
  side = 'left',
  width = 'w-64',
  className = '',
}: MotionDrawerProps) {
  const shouldReduce = useReducedMotion();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, handleKeyDown]);

  const xOffset = side === 'left' ? '-100%' : '100%';

  const drawerVariants = {
    hidden: { x: xOffset, opacity: 0.8 },
    visible: {
      x: 0,
      opacity: 1,
      transition: MOTION_SPRINGS.gentle,
    },
    exit: {
      x: xOffset,
      opacity: 0.8,
      transition: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASINGS.easeInCubic },
    },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop blur */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            variants={shouldReduce ? undefined : drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`fixed inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} ${width} z-50 shadow-2xl ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default MotionDrawer;
