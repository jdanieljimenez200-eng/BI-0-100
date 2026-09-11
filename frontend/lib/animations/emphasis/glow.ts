import { Variants } from 'framer-motion';

export const glow: Variants = {
  rest: {
    boxShadow: '0 0 0px rgba(255, 255, 255, 0)',
  },
  hover: {
    boxShadow: '0 0 20px rgba(231, 76, 60, 0.6)',
    transition: {
      duration: 0.3,
      ease: 'easeInOut',
    },
  },
};