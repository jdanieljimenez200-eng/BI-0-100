'use client';

import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import MotionAccordion from '@/components/motion/MotionAccordion';

gsap.registerPlugin(useGSAP);

const PLANES = [
  {
    key: 'freemium',
    nombre: 'Freemium',
    precio: 'Gratis',
    periodo: 'siempre',
    descripcion: 'Para explorar y validar tu primera idea',
    color: 'border-white/10 bg-white/5',
    badge: '',
    cta: 'Empezar gratis',
    ctaHref: '/auth/signup',
    ctaStyle: 'border border-white/20 text-white hover:bg-white/10 mt-6',
    features: [
      '1 producto activo',
      '1 análisis por módulo',
      'Análisis de Mercado',
      'Estrategia de Marketing',
      'Estrategia de Ventas',
      'Proyección Financiera',
    ],
    limitaciones: ['Sin copy con IA', 'Sin re-análisis'],
  },
  {
    key: 'pro',
    nombre: 'Pro',
    precio: '$199',
    periodo: 'mes',
    descripcion: 'Para emprendedores que van en serio',
    color: 'border-brand-accent ring-1 ring-brand-accent shadow-[0_0_30px_rgba(231,76,60,0.15)] bg-gradient-to-b from-brand-accent/10 to-white/5',
    badge: 'Más popular',
    cta: 'Empezar Pro',
    ctaHref: '/auth/signup?plan=pro',
    ctaStyle: 'bg-brand-accent text-white hover:opacity-90 shadow-[0_0_20px_rgba(231,76,60,0.3)] mt-6',
    features: [
      'Hasta 5 productos activos',
      'Re-análisis ilimitados',
      'Elige 1 herramienta del sistema',
      'Movimientos ilimitados',
      'Copy generado con IA',
      'Importación CSV en Contabilidad',
      'Análisis Legal-Fiscal',
      'Hasta 2 trabajadores',
      'Soporte por email',
    ],
    limitaciones: [],
  },
  {
    key: 'pro_plus',
    nombre: 'Pro Plus',
    precio: '$349',
    periodo: 'mes',
    descripcion: 'Para negocios que operan con varias herramientas',
    color: 'border-emerald-500/50 ring-1 ring-emerald-500/40 bg-gradient-to-b from-emerald-500/10 to-white/5',
    badge: 'Mejor valor',
    cta: 'Empezar Pro Plus',
    ctaHref: '/auth/signup?plan=pro_plus',
    ctaStyle: 'bg-emerald-600/80 text-white hover:bg-emerald-600 mt-6 border border-emerald-500/50',
    features: [
      'Hasta 10 productos activos',
      'Todo lo del plan Pro',
      'Elige 4 herramientas del sistema',
      'Alertas automáticas WhatsApp/email',
      'Hasta 5 trabajadores',
      'Comisión POS reducida (1.2%)',
    ],
    limitaciones: [],
  },
  {
    key: 'business',
    nombre: 'Business',
    precio: '$499',
    periodo: 'mes',
    descripcion: 'Para equipos y agencias',
    color: 'border-purple-500/50 bg-white/5',
    badge: '',
    cta: 'Empezar Business',
    ctaHref: '/auth/signup?plan=business',
    ctaStyle: 'bg-purple-600/80 text-white hover:bg-purple-600 mt-6 border border-purple-500/50',
    features: [
      'Productos ilimitados',
      'Todo lo del plan Pro Plus',
      'Las 7 herramientas incluidas',
      'White-label en POS y tickets',
      'Hasta 10 trabajadores',
      'Soporte prioritario',
    ],
    limitaciones: [],
  },
  {
    key: 'enterprise',
    nombre: 'Enterprise',
    precio: 'A medida',
    periodo: '',
    descripcion: 'Para grandes empresas y franquicias',
    color: 'border-yellow-500/50 bg-white/5',
    badge: '',
    cta: 'Contactar ventas',
    ctaHref: 'mailto:hola@bi0a100.mx',
    ctaStyle: 'bg-yellow-500/80 text-white hover:bg-yellow-500 mt-6 border border-yellow-500/50',
    features: [
      'Productos ilimitados',
      'Todo lo del plan Business',
      'Onboarding personalizado',
      'SLA garantizado',
      'Integración con CRM',
    ],
    limitaciones: [],
  },
];

export default function PricingPage() {
  const container = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 0.8 } });
    tl.fromTo(".pricing-header h1", { y: -20, opacity: 0 }, { y: 0, opacity: 1, delay: 0.2 })
      .fromTo(".pricing-header p", { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, "-=0.6")
      .fromTo(".pricing-card", { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.15 }, "-=0.4")
      .fromTo(".faq-item", { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.1 }, "-=0.2");
  }, { scope: container });

  return (
    <main className="min-h-screen bg-[#070E17] text-white font-sans selection:bg-brand-accent/30 selection:text-white flex flex-col">
      <Navbar />

      <div ref={container} className="max-w-7xl mx-auto px-6 py-32 relative z-10 flex-1 w-full">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-accent/10 blur-[150px] rounded-full pointer-events-none" />

        {/* Back Button */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-medium hover:-translate-x-1 duration-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver al inicio
          </Link>
        </div>

        {/* Header */}
        <div className="pricing-header text-center mb-16 relative">
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
            Precios simples y <span className="text-brand-accent text-transparent bg-clip-text bg-gradient-to-r from-brand-accent to-red-400 drop-shadow-sm">transparentes</span>
          </h1>
          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 font-light leading-relaxed">
            Valida tu negocio desde la opción gratuita. Escala cuando estés listo para crecer y acelerar tus resultados con inteligencia artificial.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-24 relative z-10">
          {PLANES.map((plan) => (
            <div
              key={plan.key}
              className={`pricing-card backdrop-blur-md rounded-2xl p-8 flex flex-col relative border transition-all duration-300 hover:scale-[1.02] ${plan.color}`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand-accent to-red-500 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap shadow-[0_0_15px_rgba(231,76,60,0.5)] border border-white/20">
                  {plan.badge}
                </div>
              )}

              <div className="mb-6">
                <h2 className="font-bold text-white text-xl tracking-tight mb-2">{plan.nombre}</h2>
                <p className="text-sm text-white/50 leading-relaxed h-10">{plan.descripcion}</p>
              </div>

              <div className="mb-8 border-b border-white/10 pb-8">
                <span className="text-4xl font-extrabold text-white tracking-tight">{plan.precio}</span>
                {plan.periodo && (
                  <span className="text-white/40 text-sm ml-1">MXN/{plan.periodo}</span>
                )}
              </div>

              <ul className="space-y-4 mb-4 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3 text-sm text-white/80 items-start">
                    <span className="text-emerald-400 flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span className="leading-snug">{f}</span>
                  </li>
                ))}
                {plan.limitaciones.map((l) => (
                  <li key={l} className="flex gap-3 text-sm text-white/30 items-start">
                    <span className="text-white/30 flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </span>
                    <span className="leading-snug">{l}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`block text-center py-3.5 rounded-xl text-sm font-bold transition-all w-full tracking-wide ${plan.ctaStyle}`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto relative z-10 faq-container mb-12">
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 text-center mb-10">Preguntas frecuentes</h2>
          <div className="space-y-3.5">
            {[
              {
                q: '¿Puedo cancelar en cualquier momento?',
                a: 'Sí. Tu suscripción se cancela al final del período facturado y no hay penalidades ocultas. Tu control, tu decisión.',
              },
              {
                q: '¿Qué métodos de pago aceptan?',
                a: 'Aceptamos de forma segura tarjetas de crédito y débito (Visa, Mastercard, American Express) procesadas a través de Stripe.',
              },
              {
                q: '¿Puedo cambiar de plan?',
                a: 'Por supuesto, puedes subir o bajar de plan en cualquier momento desde tu panel de facturación. Los cambios se aplican al instante.',
              },
              {
                q: '¿Los análisis se guardan si bajo de plan?',
                a: 'Sí, todos tus análisis anteriores se conservan en nuestra nube privada. Solo se limita la creación de nuevos análisis según tu plan actual.',
              },
            ].map((item, idx) => (
              <div key={item.q} className="faq-item">
                <MotionAccordion
                  isOpen={openFaq === idx}
                  onToggle={() => setOpenFaq(openFaq === idx ? null : idx)}
                  header={<span className="font-bold text-white text-base sm:text-lg">{item.q}</span>}
                  className="bg-white/5 backdrop-blur-md hover:bg-white/[0.08] border-white/10 transition-colors"
                >
                  <p className="text-white/60 text-sm leading-relaxed pt-2">{item.a}</p>
                </MotionAccordion>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <Footer />
    </main>
  );
}
