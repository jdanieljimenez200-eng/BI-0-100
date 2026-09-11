import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acceso',
  description: 'Inicia sesión o crea tu cuenta gratis en BI 0 A 100.',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
