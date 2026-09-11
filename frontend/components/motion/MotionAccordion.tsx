'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MOTION_EASINGS, MOTION_DURATIONS, MOTION_SPRINGS } from '@/lib/motion/tokens';

export interface MotionAccordionProps {
  isOpen: boolean;
  onToggle: () => void;
  header: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  showChevron?: boolean;
}

export function MotionAccordion({
  isOpen,
  onToggle,
  header,
  children,
  className = '',
  headerClassName = '',
  contentClassName = '',
  showChevron = true,
}: MotionAccordionProps) {
  const shouldReduce = useReducedMotion();

  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between p-4 sm:p-5 text-left transition-colors duration-200 hover:bg-white/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${headerClassName}`}
      >
        <div className="flex-1 min-w-0 pr-4">
          {typeof header === 'function' ? header(isOpen) : header}
        </div>

        {showChevron && (
          <motion.svg
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={shouldReduce ? { duration: 0 } : MOTION_SPRINGS.snappy}
            className="w-4 h-4 text-white/40 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </motion.svg>
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={shouldReduce ? { opacity: 1 } : { height: 0, opacity: 0 }}
            animate={
              shouldReduce
                ? { opacity: 1 }
                : {
                    height: 'auto',
                    opacity: 1,
                    transition: {
                      height: { duration: MOTION_DURATIONS.base, ease: MOTION_EASINGS.easeOutQuart },
                      opacity: { duration: MOTION_DURATIONS.fast, delay: 0.05 },
                    },
                  }
            }
            exit={
              shouldReduce
                ? { opacity: 0 }
                : {
                    height: 0,
                    opacity: 0,
                    transition: {
                      height: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASINGS.easeInCubic },
                      opacity: { duration: MOTION_DURATIONS.instant },
                    },
                  }
            }
            className="overflow-hidden"
          >
            <div className={`p-4 sm:p-5 pt-0 border-t border-white/5 ${contentClassName}`}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MotionAccordion;
