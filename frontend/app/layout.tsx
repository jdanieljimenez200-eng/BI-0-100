import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, DM_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bi0a100.com';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'BI 0 A 100 — Valida tu negocio en minutos',
    template: '%s | BI 0 A 100',
  },
  description:
    'Valida la viabilidad de tu negocio en 2-3 minutos. Análisis de marketing y mercado para emprendedores en México.',
  keywords: ['validar negocio', 'análisis de mercado', 'plan de marketing', 'proyección financiera', 'emprendedores México'],
  authors: [{ name: 'BI 0 A 100' }],
  creator: 'BI 0 A 100',
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    url: APP_URL,
    siteName: 'BI 0 A 100',
    title: 'BI 0 A 100 — Valida tu negocio en minutos',
    description:
      'Valida la viabilidad de tu negocio en 2-3 minutos. Análisis de marketing y mercado en un solo lugar.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BI 0 A 100 — Valida tu negocio en minutos',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BI 0 A 100 — Valida tu negocio en minutos',
    description:
      'Valida la viabilidad de tu negocio en 2-3 minutos. Análisis de marketing y mercado.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className={`${jakarta.variable} ${dmMono.variable} font-sans antialiased`}>
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          richColors
          toastOptions={{
            style: {
              background: '#0F1C2A',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              color: '#FFFFFF',
            },
          }}
        />
      </body>
    </html>
  );
}
