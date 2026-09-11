import { Variants } from 'framer-motion';

export const bounceIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.6,
      type: 'spring',
      stiffness: 300,
      damping: 10,
    },
  },
};