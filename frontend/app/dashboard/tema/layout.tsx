import type { Metadata } from 'next';

// Título de la pestaña (plantilla «%s | BI 0 A 100» en app/layout.tsx). Las
// páginas de esta sección son de cliente y no pueden exportar metadata.
export const metadata: Metadata = { title: { default: 'Tema', template: '%s | BI 0 A 100' } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
