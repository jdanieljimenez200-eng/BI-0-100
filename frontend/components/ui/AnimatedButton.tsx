'use client';

import React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { MOTION_SPRINGS } from '@/lib/motion/tokens';

export interface AnimatedButtonProps {
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  icon?: React.ReactNode;
}

const variantStyles = {
  primary:
    'bg-white text-[#070E17] font-bold shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] border border-white/20',
  accent:
    'bg-brand-accent text-white font-bold shadow-[0_0_24px_rgba(231,76,60,0.3)] hover:shadow-[0_0_40px_rgba(231,76,60,0.5)] border border-brand-accent/30',
  secondary:
    'bg-white/5 border border-white/10 text-white hover:border-white/25 hover:bg-white/10',
  outline:
    'border border-white/15 text-white/90 hover:border-white/40 hover:bg-white/[0.04]',
  ghost:
    'text-white/60 hover:text-white hover:bg-white/5 border border-transparent',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3.5 text-base rounded-2xl gap-2.5',
};

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  href,
  onClick,
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  icon,
}) => {
  const shouldReduce = useReducedMotion();
  const isDisabled = disabled || loading;

  const baseClasses =
    'relative font-bold transition-colors inline-flex items-center justify-center whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-white/30 select-none';
  const combinedClasses = `${baseClasses} ${variantStyles[variant]} ${sizeStyles[size]} ${
    isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
  } ${className}`;

  const motionProps =
    isDisabled || shouldReduce
      ? {}
      : {
          whileHover: { scale: 1.015, y: -1 },
          whileTap: { scale: 0.985 },
          transition: MOTION_SPRINGS.snappy,
        };

  const buttonContent = (
    <>
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </>
  );

  if (href && !isDisabled) {
    return (
      <motion.div {...motionProps} className="inline-block">
        <Link href={href} className={combinedClasses}>
          {buttonContent}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      {...motionProps}
      disabled={isDisabled}
      onClick={onClick}
      type={type}
      className={combinedClasses}
    >
      {buttonContent}
    </motion.button>
  );
};

export default AnimatedButton;