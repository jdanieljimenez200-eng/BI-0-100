import type { Metadata } from 'next';
import Net0Navbar from '@/components/net0/Net0Navbar';
import Net0Footer from '@/components/net0/Net0Footer';
import { PageTransition } from '@/components/motion/PageTransition';

export const metadata: Metadata = {
  // `absolute`: el portal no hereda la plantilla «%s | BI 0 A 100» del layout raíz.
  title: {
    template: '%s | Net0',
    absolute: 'Net0 | Red de Profesionales y Oficios',
  },
  description:
    'Directorio de abogados, contadores, albañiles, plomeros, diseñadores, técnicos, proveedores y consultores. Contacto directo por WhatsApp sin comisiones.',
  robots: {
    index: true,
    follow: true,
  },
};

export default function Net0Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0C] text-zinc-100 flex flex-col font-sans selection:bg-white/20 selection:text-white">
      <Net0Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <PageTransition>{children}</PageTransition>
      </main>
      <Net0Footer />
    </div>
  );
}
