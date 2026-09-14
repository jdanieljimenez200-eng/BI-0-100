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
export const metadata: Metadata = {
  title: 'BI 0 A 100 — Valida tu negocio en minutos',
  description:
    'Valida la viabilidad de tu negocio en 2-3 minutos. Análisis de marketing y mercado para emprendedores en México.',
  openGraph: {
    title: 'BI 0 A 100 — Valida tu negocio en minutos',
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
        { '@type': 'Offer', name: 'Freemium', price: '0', priceCurrency: 'MXN' },
        { '@type': 'Offer', name: 'Pro', price: '299', priceCurrency: 'MXN' },
        { '@type': 'Offer', name: 'Business', price: '799', priceCurrency: 'MXN' },
      ],
      inLanguage: 'es-MX',
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
          acceptedAnswer: { '@type': 'Answer', text: 'Para emprendedores y PYMEs que quieran validar productos o servicios en México.' },
        },
      ],
    },
  ],
};

const IconMercado = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M3 3v18h18" />
    <path d="M7 15l3-4 3 3 4-6" />
    <circle cx="20" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
const IconMarketing = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M14 8a4 4 0 0 1 0 8M17 5a8 8 0 0 1 0 14" />
  </svg>
);
const IconFinanzas = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9.5 9.2a2.2 2.2 0 0 1 2.5-1.7c1.2.1 2 .9 2 1.9 0 2.4-4.5 1.6-4.5 4 0 1 .9 1.8 2 1.9a2.2 2.2 0 0 0 2.5-1.7" />
  </svg>
);
const IconVentas = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M3 12h18M12 3v18M6 9l3-3 3 3 4-4 4 4" />
    <circle cx="18" cy="6" r="1.5" fill="currentColor" />
  </svg>
);

const IconLegal = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 2l-8 4 8 4 8-4-8-4z" />
    <path d="M4 10l8 4 8-4" />
    <path d="M4 6v6l8 4 8-4V6" />
    <path d="M9 18l-5 2 2-5" />
    <path d="M15 18l5 2-2-5" />
  </svg>
);

const MODULES = [
  {
    color: 'from-mercado to-mercado-dark',
    light: 'bg-mercado/20',
    text: 'text-mercado-light',
    dot: 'bg-mercado',
    icon: IconMercado,
    title: 'Mercado',
    desc: '¿Hay dinero ahí? Descúbrelo: score de viabilidad 0-100, quiénes son tus rivales reales y qué tan grande es el mercado que puedes capturar.',
    description: 'Análisis profundo del mercado objetivo y competencia. Descubre el tamaño real del mercado, identifica tendencias y encuentra oportunidades de crecimiento.',
    features: [
      'Tamaño del mercado estimado',
      'Demanda actual y proyecciones',
      'Tendencias de mercado relevantes',
      'Análisis de competencia directa e indirecta',
      'Oportunidades y riesgos identificados',
    ],
  },
  {
    color: 'from-marketing to-marketing-dark',
    light: 'bg-marketing/20',
    text: 'text-marketing-light',
    dot: 'bg-marketing',
    icon: IconMarketing,
    title: 'Marketing',
    desc: 'Tu plan de ataque listo para ejecutar: 3 ángulos de posicionamiento, publicaciones redactadas y un calendario de lanzamiento de 14 días.',
    description: 'Estrategia de marketing personalizada con canales recomendados, mensajes clave y plan de implementación paso a paso.',
    features: [
      'Canales de marketing recomendados',
      'Mensajes clave para tu audiencia',
      'Segmentación de clientes potenciales',
      'Estrategia de precios competitiva',
      'Plazo de implementación estimado',
    ],
  },
  {
    color: 'from-cyan-500 to-cyan-600',
    light: 'bg-cyan-500/20',
    text: 'text-cyan-300',
    dot: 'bg-cyan-500',
    icon: IconVentas,
    title: 'Ventas',
    desc: 'Estrategia de ventas y distribución optimizada. Canales, pricing y forecast de ingresos para los primeros 12 meses.',
    description: 'Plan de ventas completo con canales recomendados, estrategia de pricing y proyecciones de ingresos.',
    features: [
      'Canales de venta recomendados',
      'Estrategia de pricing competitiva',
      'Forecast de ingresos 12 meses',
      'Metas de venta mensuales',
      'Análisis de ciclo de venta',
    ],
  },
  {
    color: 'from-finanzas to-finanzas-dark',
    light: 'bg-finanzas/20',
    text: 'text-finanzas-light',
    dot: 'bg-finanzas',
    icon: IconFinanzas,
    title: 'Finanzas',
    desc: '¿Cuándo recuperas tu inversión? Ve la proyección a 12 meses, el punto de equilibrio exacto y juega con los números en el simulador interactivo.',
    description: 'Proyecciones financieras completas: inversión inicial, márgenes, tiempo de recuperación y rentabilidad anual esperada.',
    features: [
      'Inversión inicial estimada',
      'Margen bruto proyectado',
      'Tiempo de recuperación de inversión',
      'Rentabilidad anual esperada',
      'Punto de equilibrio financiero',
      'Riesgos financieros identificados',
    ],
  },
  {
    color: 'from-[#7C3AED] to-[#5B21B6]',
    light: 'bg-[#7C3AED]/20',
    text: 'text-[#A78BFA]',
    dot: '#7C3AED',
    icon: IconLegal,
    title: 'Legal',
    desc: 'Conoce los permisos, licencias y obligaciones fiscales que aplican exactamente a tu giro y país. Sin sorpresas legales.',
    description: 'Guía completa de requisitos legales, licencias y normativas aplicables a tu negocio en tu mercado.',
    features: [
      'Requisitos legales aplicables',
      'Licencias y permisos necesarios',
      'Normativas regulatorias del sector',
      'Riesgos legales identificados',
      'Estrategia de propiedad intelectual',
    ],
  },
];

const STEPS = [
  { n: '1', title: 'Sube tu producto', desc: 'Una foto, un nombre y su categoría. Eso es todo. En 30 segundos ya tu idea está dentro del sistema, lista para ser diseccionada.' },
  { n: '2', title: 'Dinos tu contexto', desc: 'Tu precio objetivo, tu presupuesto de arranque y dónde quieres vender. Con esos tres datos la IA calibra el análisis para tu realidad, no para la de otro.' },
  { n: '3', title: 'Los modelos trabajan', desc: 'Tres agentes de IA se lanzan en paralelo: uno rastrea el mercado, otro diseña tu estrategia, el tercero proyecta tus números. Todo a la vez, sin pausas.' },
  { n: '4', title: 'Toma decisiones reales', desc: 'En menos de 3 minutos tienes un panel completo: exporta a PDF, compártelo con socios o inversionistas y empieza a ejecutar con datos duros en la mano.' },
];

const PLANS = [
  {
    name: 'Freemium',
    price: '$0',
    period: '',
    desc: 'Prueba el sistema sin tarjeta. Valida tu primera idea y ve si esto es para ti — sin arriesgar un peso.',
    features: ['1 producto', '1 análisis por módulo (Legal desde Negocio)', 'Todas las herramientas a prueba', 'Sin tarjeta de crédito'],
    cta: 'Empezar gratis ahora',
    href: '/auth/signup',
    highlight: false,
  },
  {
    name: 'Negocio',
    price: '$599',
    period: ' MXN/mes',
    desc: 'Para quien no puede darse el lujo de equivocarse. 4 herramientas, análisis legal y 60 créditos de IA al mes.',
    features: ['10 productos', '60 créditos de IA al mes', 'Análisis Legal-Fiscal', 'Evaluador de guiones y competidores'],
    cta: 'Quiero el plan Negocio',
    href: '/pricing',
    highlight: true,
  },
  {
    name: 'Empresa',
    price: '$1,199',
    period: ' MXN/mes',
    desc: 'Para equipos: todas las herramientas, productos ilimitados y tu marca en tickets y cotizaciones.',
    features: ['Productos ilimitados', 'Las 7 herramientas', '120 créditos de IA al mes', 'Hasta 10 trabajadores'],
    cta: 'Ver planes',
    href: '/pricing',
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#070E17] text-white font-sans selection:bg-[#E74C3C]/30 selection:text-white overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <Hero modules={MODULES} />
      <Modules modules={MODULES} />
      <Tools />
      <HowItWorks steps={STEPS} />
      <NetworkTeaser />
      <Pricing plans={PLANS} />
      
      {/* FINAL CTA - Elegant & Seamless */}
      <section className="relative py-40 px-6 text-center border-t border-white/[0.05] overflow-hidden bg-[#070E17]">
        {/* Soft elegant glows */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <div className="w-[60vw] h-[60vw] bg-brand-accent/5 rounded-full blur-[150px]" />
           <div className="absolute w-[40vw] h-[40vw] bg-blue-600/5 rounded-full blur-[100px]" />
        </div>
        
        <div className="relative z-10 max-w-[800px] mx-auto">
          <h2 className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 text-white/50 text-sm font-semibold tracking-wide mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
            Empieza hoy mismo
          </h2>
          <h3 className="text-5xl md:text-7xl font-extrabold text-white mb-8 tracking-tight leading-[1.05]">
            Deja de adivinar.<br/>
            <span className="text-white/40">Empieza a ejecutar.</span>
          </h3>
          <p className="text-white/50 text-lg md:text-xl mb-12 font-light leading-relaxed max-w-2xl mx-auto">
            Cada día que operas sin datos es dinero que regresará como pérdida. La validación que antes tomaba meses hoy tarda 3 minutos. El riesgo ya no tiene excusa.
          </p>
          <Link
            href="/auth/signup"
            className="btn-accent text-lg px-12 py-5 shadow-[0_0_40px_rgba(231,76,60,0.3)] hover:shadow-[0_0_60px_rgba(231,76,60,0.5)] scale-100 hover:scale-105 transition-transform block mx-auto w-fit"
          >
            Comenzar Validación Ahora
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
