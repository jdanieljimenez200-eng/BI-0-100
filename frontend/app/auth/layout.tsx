import type { Metadata } from 'next';

export const metadata: Metadata = {
  // Con plantilla: un título de texto simple cortaba el «| BI 0 A 100» de las páginas hijas.
  title: { default: 'Acceso', template: '%s | BI 0 A 100' },
  description: 'Inicia sesión o crea tu cuenta gratis en BI 0 A 100.',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
