import type { Metadata } from 'next';

// La página es de cliente y no puede exportar metadata.
export const metadata: Metadata = {
  title: { default: 'Derechos ARCO', template: '%s | BI 0 A 100' },
  description: 'Solicita acceso, rectificación, cancelación u oposición sobre tus datos personales.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
