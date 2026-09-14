'use client';

import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import MotionAccordion from '@/components/motion/MotionAccordion';

gsap.registerPlugin(useGSAP);

/** Catálogo que publica el backend (GET /api/billing/planes): la única fuente de precios. */
interface PlanCatalogo {
  nombre: string;
  precio_mxn: number;
  precio_mxn_anual: number;
  creditos_ia_mes: number;
}
interface Catalogo {
  planes: Record<string, PlanCatalogo>;
  costo_creditos: Record<string, number>;
}

const pesos = (v: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(v);

/** Nombre legible de cada acción con IA, para la tabla de créditos. */
const ACCIONES_CREDITOS: { clave: string; texto: string }[] = [
  { clave: 'mercado', texto: 'Análisis de mercado' },
  { clave: 'finanzas', texto: 'Proyección financiera' },
  { clave: 'brief', texto: 'Brief de marca' },
  { clave: 'marketing', texto: 'Estrategia de marketing con calendario' },
  { clave: 'ventas', texto: 'Estrategia de ventas' },
  { clave: 'legal', texto: 'Dictamen legal-fiscal' },
  { clave: 'ventas_guion', texto: 'Evaluar un guion o video de venta' },
  { clave: 'ventas_competidor', texto: 'Analizar un competidor' },
  { clave: 'marketing_reporte_ads', texto: 'Diagnóstico de un reporte de anuncios' },
  { clave: 'marca_logo', texto: 'Análisis de logo' },
];

const PLANES = [
  {
    key: 'freemium',
    nombre: 'Gratis',
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
      '5 créditos de IA al mes',
      'Análisis de Mercado',
      'Estrategia de Marketing',
      'Estrategia de Ventas',
      'Proyección Financiera',
    ],
    limitaciones: ['Sin copy con IA', 'Sin análisis legal'],
  },
  {
    key: 'pro',
    nombre: 'Emprendedor',
    precio: '$449',
    periodo: 'mes',
    descripcion: 'Para arrancar con una sola herramienta',
    color: 'border-white/10 bg-white/5',
    badge: '',
    cta: 'Empezar Emprendedor',
    ctaHref: '/auth/signup?plan=pro',
    ctaStyle: 'border border-white/20 text-white hover:bg-white/10 mt-6',
    features: [
      'Hasta 3 productos activos',
      '20 créditos de IA al mes',
      'Elige 1 herramienta del sistema',
      'Movimientos ilimitados',
      'Copy y calendario con IA',
      'Importación CSV en Contabilidad',
      '1 trabajador',
      'Soporte por email',
    ],
    limitaciones: ['Sin análisis Legal-Fiscal', 'Sin evaluador de guiones ni competidores'],
  },
  {
    key: 'pro_plus',
    nombre: 'Negocio',
    precio: '$599',
    periodo: 'mes',
    descripcion: 'Para negocios que operan con varias herramientas',
    color: 'border-brand-accent ring-1 ring-brand-accent shadow-[0_0_30px_rgba(231,76,60,0.15)] bg-gradient-to-b from-brand-accent/10 to-white/5',
    badge: 'Más elegido',
    cta: 'Empezar Negocio',
    ctaHref: '/auth/signup?plan=pro_plus',
    ctaStyle: 'bg-brand-accent text-white hover:opacity-90 shadow-[0_0_20px_rgba(231,76,60,0.3)] mt-6',
    features: [
      'Hasta 10 productos activos',
      '60 créditos de IA al mes (3× Emprendedor)',
      'Elige 4 herramientas del sistema',
      'Análisis Legal-Fiscal',
      'Evaluador de guiones y competidores',
      'Resumen con IA de las alertas del negocio',
      'Hasta 5 trabajadores',
      'Todo lo del plan Emprendedor',
    ],
    limitaciones: [],
  },
  {
    key: 'business',
    nombre: 'Empresa',
    precio: '$1,199',
    periodo: 'mes',
    descripcion: 'Para equipos y agencias',
    color: 'border-purple-500/50 bg-white/5',
    badge: '',
    cta: 'Empezar Empresa',
    ctaHref: '/auth/signup?plan=business',
    ctaStyle: 'bg-purple-600/80 text-white hover:bg-purple-600 mt-6 border border-purple-500/50',
    features: [
      'Productos ilimitados',
      '120 créditos de IA al mes',
      'Todo lo del plan Negocio',
      'Las 7 herramientas incluidas',
      'Tu marca en POS, tickets y cotizaciones',
      'Hasta 10 trabajadores',
      'Soporte prioritario',
    ],
    limitaciones: [],
  },
  {
    key: 'enterprise',
    nombre: 'Enterprise',
    precio: 'Desde $4,999',
    periodo: 'mes',
    descripcion: 'Para grandes empresas y franquicias',
    color: 'border-yellow-500/50 bg-white/5',
    badge: '',
    cta: 'Contactar ventas',
    ctaHref: 'mailto:hola@bi0a100.mx',
    ctaStyle: 'bg-yellow-500/80 text-white hover:bg-yellow-500 mt-6 border border-yellow-500/50',
    features: [
      '600 créditos de IA al mes, ampliables',
      'Todo lo del plan Empresa',
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
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);

  // Precios, nombres y créditos salen del backend; lo escrito arriba solo se ve
  // mientras carga (y coincide con planService.ts).
  useEffect(() => {
    api
      .get<Catalogo>('/billing/planes')
      .then(({ data }) => setCatalogo(data))
      .catch(() => setCatalogo(null));
  }, []);

  const planes = PLANES.map((plan) => {
    const c = catalogo?.planes[plan.key];
    if (!c) return plan;
    const precio =
      c.precio_mxn === 0 ? 'Gratis' : plan.key === 'enterprise' ? `Desde $${pesos(c.precio_mxn)}` : `$${pesos(c.precio_mxn)}`;
    return { ...plan, nombre: c.nombre, precio };
  });

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
          {planes.map((plan) => (
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

        {/* Créditos */}
        <div className="max-w-3xl mx-auto relative z-10 mb-20">
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 text-center mb-3">
            ¿Qué es un crédito de IA?
          </h2>
          <p className="text-white/50 text-center text-sm mb-8 max-w-xl mx-auto">
            Cada acción con inteligencia artificial usa créditos según lo que cuesta generarla. Se renuevan el día 1 de
            cada mes, y si un análisis falla, el crédito se te devuelve. Precios en pesos mexicanos con IVA incluido.
          </p>
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {ACCIONES_CREDITOS.map((a) => (
                  <tr key={a.clave} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-3 text-white/75">{a.texto}</td>
                    <td className="px-5 py-3 text-right font-bold text-white tabular-nums">
                      {catalogo?.costo_creditos[a.clave] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                q: '¿Qué pasa si se me acaban los créditos?',
                a: 'Tus herramientas (punto de venta, inventario, reportes…) siguen funcionando sin límite. Solo las acciones con IA esperan al día 1, o puedes subir de plan en ese momento.',
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
