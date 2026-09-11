/**
 * Punto de entrada del design system.
 *
 * Importa siempre desde aquí (`@/components/ui`) en lugar de apuntar a los
 * archivos sueltos: si un primitivo se reimplementa o se renombra, el cambio
 * queda contenido en este barril.
 */

// Primitivos
export { Button, buttonVariants, type ButtonProps } from './Button';
export { Card, CardHeader, cardVariants, type CardProps } from './Card';
export { Badge, badgeVariants, type BadgeProps } from './Badge';
export { Input, type InputProps } from './Input';
export { Skeleton, SkeletonText } from './Skeleton';
export { EmptyState } from './EmptyState';
export { Stat } from './Stat';
export { Pagination } from './Pagination';
export { Table, TableWrap, THead, TBody, TR, TH, TD } from './Table';

// Convención de iconografía
export { ICON, ICON_STROKE, type IconSize } from './icons';

// Capa de interacción animada (Framer Motion). Viven en components/motion
// porque encapsulan variantes de movimiento, pero forman parte del mismo
// sistema y se consumen desde aquí.
export {
  MotionModal,
  MotionDrawer,
  MotionDropdown,
  MotionTooltip,
  MotionTabs,
  MotionAccordion,
  PageTransition,
  Reveal,
} from '../motion';
