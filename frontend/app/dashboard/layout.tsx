import type { Metadata } from 'next';
import DashboardShell from '@/components/DashboardShell';
import { PageTransition } from '@/components/motion/PageTransition';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <PageTransition>{children}</PageTransition>
    </DashboardShell>
  );
}
