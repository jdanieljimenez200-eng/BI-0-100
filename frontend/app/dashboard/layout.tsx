import type { Metadata } from 'next';
import DashboardShell from '@/components/DashboardShell';
import { PageTransition } from '@/components/motion/PageTransition';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Con plantilla: un título de texto simple cortaba el «| BI 0 A 100» de las secciones.
  title: { default: 'Dashboard', template: '%s | BI 0 A 100' },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <PageTransition>{children}</PageTransition>
    </DashboardShell>
  );
}
