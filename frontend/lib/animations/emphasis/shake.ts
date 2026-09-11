import { Variants } from 'framer-motion';

export const shake: Variants = {
  rest: {
    x: 0,
  },
  hover: {
    x: [0, -5, 5, -5, 0],
    transition: {
      duration: 0.5,
      repeat: 1,
    },
  },
};