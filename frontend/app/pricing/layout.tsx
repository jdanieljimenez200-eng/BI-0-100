import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Planes y precios',
  description:
    'Freemium gratis, Pro $299 MXN/mes, Business $799 MXN/mes. Elige el plan que se adapte a tu negocio.',
  openGraph: {
    title: 'Planes y precios | BI 0 A 100',
    description: 'Freemium gratis, Pro $299 MXN/mes, Business $799 MXN/mes.',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
