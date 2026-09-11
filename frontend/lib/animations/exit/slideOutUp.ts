import { Variants } from 'framer-motion';

export const slideOutUp: Variants = {
  visible: {
    opacity: 1,
    y: 0,
  },
  hidden: {
    opacity: 0,
    y: -100,
    transition: {
      duration: 0.6,
      ease: 'easeIn',
    },
  },
};