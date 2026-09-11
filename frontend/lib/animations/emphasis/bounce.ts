import { Variants } from 'framer-motion';

export const bounce: Variants = {
  rest: {
    y: 0,
  },
  hover: {
    y: -5,
    transition: {
      duration: 0.4,
      type: 'spring',
      stiffness: 400,
      damping: 10,
    },
  },
};