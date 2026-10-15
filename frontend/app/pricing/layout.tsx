import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Planes y precios',
  description:
    // Mismos precios que planService.ts y la página (MXN, IVA incluido). Antes
    // anunciaba $299 y $799, precios que ya no existen.
    'Gratis para empezar. Emprendedor $449, Negocio $599 y Empresa $1,199 MXN al mes, IVA incluido. Elige el plan que se adapte a tu negocio.',
  openGraph: {
    title: 'Planes y precios | BI 0 A 100',
    description: 'Gratis para empezar. Emprendedor $449, Negocio $599 y Empresa $1,199 MXN al mes, IVA incluido.',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
