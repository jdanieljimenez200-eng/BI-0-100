import { Variants } from 'framer-motion';

export const float: Variants = {
  rest: {
    y: 0,
  },
  hover: {
    y: -8,
    transition: {
      duration: 0.6,
      type: 'spring',
      stiffness: 200,
      damping: 15,
    },
  },
};