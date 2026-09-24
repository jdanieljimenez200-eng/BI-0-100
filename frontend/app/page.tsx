import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import Modules from '@/components/landing/Modules';
import Tools from '@/components/landing/Tools';
import HowItWorks from '@/components/landing/HowItWorks';
import NetworkTeaser from '@/components/landing/NetworkTeaser';
import Pricing from '@/components/landing/Pricing';
import Footer from '@/components/landing/Footer';
import FinalCTA from '@/components/landing/FinalCTA';
import AmbientBackground from '@/components/landing/AmbientBackground';
export const metadata: Metadata = {
  title: 'BI 0 A 100: Valida tu negocio en minutos',
  description:
    'Valida la viabilidad de tu negocio en 2-3 minutos. Análisis de marketing, finanzas y mercado para emprendedores en cualquier país.',
  openGraph: {
    title: 'BI 0 A 100: Valida tu negocio en minutos',
    description:
      'Sube tu producto y obtén un análisis completo de marketing y mercado en minutos.',
    url: '/',
  },
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bi0a100.com';

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'BI 0 A 100',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: APP_URL,
      description: 'Valida la viabilidad de tu negocio en 2-3 minutos.',
      offers: [
        { '@type': 'Offer', name: 'Freemium', price: '0', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Pro', price: '299', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Business', price: '799', priceCurrency: 'USD' },
      ],
      inLanguage: 'es',
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '¿Cuánto tiempo tarda el análisis?',
          acceptedAnswer: { '@type': 'Answer', text: 'Entre 2 y 3 minutos para los 5 módulos de análisis per-producto.' },
        },
        {
          '@type': 'Question',
          name: '¿Es gratis?',
          acceptedAnswer: { '@type': 'Answer', text: 'Sí. El plan Freemium es gratuito, sin tarjeta de crédito.' },
        },
        {
          '@type': 'Question',
          name: '¿Para qué tipo de negocios sirve?',
          acceptedAnswer: { '@type': 'Answer', text: 'Para emprendedores y empresas que quieran validar productos o servicios en cualquier mercado o país.' },
        },
      ],
    },
  ],
};

const STEPS = [
  { n: '01', title: 'Sube tu producto o idea', desc: 'Ingresa el nombre, giro comercial o sube una fotografía. En 30 segundos el sistema clasifica tu oferta y prepara la matriz de análisis.', badge: '30 segundos' },
  { n: '02', title: 'Define tu contexto territorial', desc: 'Indica tu ubicación objetivo, presupuesto de arranque y canales previstos. El sistema calibra la auditoría para tu mercado real.', badge: '1 minuto' },
  { n: '03', title: 'Auditoría algorítmica 360°', desc: 'Cruce simultáneo de Google Maps, Marketplaces, normativas fiscales y proyecciones de flujo de caja en paralelo.', badge: 'Procesamiento' },
  { n: '04', title: 'Expediente ejecutivo de decisión', desc: 'Recibe tu panel de control completo con informe descargable en PDF oficial A4, listo para socios, bancos e inversionistas.', badge: 'Listo en <3 min' },
];

const PLANS = [
  {
    name: 'Freemium',
    price: '$0',
    period: '',
    desc: 'Prueba el sistema sin tarjeta. Valida tu primera idea sin arriesgar un solo peso.',
    features: ['1 producto', '1 análisis por módulo (Legal desde Negocio)', 'Todas las herramientas a prueba', 'Sin tarjeta de crédito'],
    cta: 'Empezar gratis ahora',
    href: '/auth/signup',
    highlight: false,
  },
  {
    name: 'Negocio',
    price: '$599',
    period: ' / mes',
    desc: 'Para proyectos en marcha. 4 herramientas operativas, análisis legal y 60 créditos de IA al mes.',
    features: ['10 productos', '60 créditos de IA al mes', 'Análisis Legal-Fiscal', 'Evaluador de guiones y competidores'],
    cta: 'Quiero el plan Negocio',
    href: '/pricing',
    highlight: true,
  },
  {
    name: 'Empresa',
    price: '$1,199',
    period: ' / mes',
    desc: 'Para equipos: todas las herramientas, productos ilimitados y tu marca en tickets y cotizaciones.',
    features: ['Productos ilimitados', 'Las 7 herramientas', '120 créditos de IA al mes', 'Hasta 10 trabajadores'],
    cta: 'Ver planes',
    href: '/pricing',
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#070E17] text-white font-sans selection:bg-[#E74C3C]/30 selection:text-white relative">
      <AmbientBackground />
      <div className="relative z-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Navbar />
        <Hero />
        <Modules />
        <Tools />
        <HowItWorks steps={STEPS} />
        <NetworkTeaser />
        <Pricing plans={PLANS} />
        <FinalCTA />
        <Footer />
      </div>
    </main>
  );
}
