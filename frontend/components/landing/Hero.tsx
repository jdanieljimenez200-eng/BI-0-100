"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  AnimatePresence,
  LayoutGroup,
  useReducedMotion,
} from "framer-motion";
import { ArrowLeft, ArrowRight, LayoutGrid, X } from "lucide-react";
import { MOTION_DURATIONS, MOTION_EASINGS } from "@/lib/motion/tokens";
import { Button, ICON } from "@/components/ui";

/**
 * Entrada del hero. Escalonada y corta: el contenido tiene que estar legible
 * casi de inmediato, así que la animación acompaña la lectura en vez de
 * retenerla (la versión anterior con GSAP tardaba ~2.5s y dejaba bloques en
 * opacity:0 si el timeline se interrumpía).
 *
 * El escalonado se resuelve con un `delay` por índice en lugar de con
 * `staggerChildren`: las variantes solo se propagan por cadenas continuas de
 * componentes `motion`, y este árbol alterna con elementos normales.
 */
function heroEntrada(indice: number, reducido: boolean | null) {
  return {
    initial: reducido ? false : ({ opacity: 0, y: 18 } as const),
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: MOTION_DURATIONS.slow,
      ease: MOTION_EASINGS.easeOutQuart,
      delay: 0.05 + indice * 0.08,
    },
  };
}

export interface DeliverableItem {
  title: string;
  desc: string;
  badge?: string;
}

export interface MetricItem {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}

export interface HeroModule {
  title: string;
  categoryTag?: string;
  desc?: string;
  description?: string;
  light?: string;
  text?: string;
  icon?: React.ReactNode;
  color?: string;
  dot?: string;
  tag?: string;
  features?: string[];
  sources?: string[];
  deliverables?: DeliverableItem[];
  metrics?: MetricItem[];
  previewType?: 'mercado' | 'finanzas' | 'marketing' | 'ventas' | 'legal';
}

const MORPH_SPRING = {
  type: "spring" as const,
  stiffness: 115,
  damping: 20,
  mass: 1.1,
};

const PILL_SPRING = {
  type: "spring" as const,
  stiffness: 170,
  damping: 22,
  mass: 0.95,
};

export const DEFAULT_MODULES: HeroModule[] = [
  {
    title: 'Mercado',
    categoryTag: 'Radar de Demanda & Competencia',
    desc: 'Score de viabilidad 0-100, competidores de Google Maps/ML y tamaño de mercado.',
    description: 'Rastrea y cruza en tiempo real competidores locales y nacionales en Google Maps, MercadoLibre y Google Shopping para calcular la saturación de tu zona y medir si el mercado está virgen o saturado.',
    color: 'from-mercado to-mercado-dark',
    light: 'bg-mercado/20',
    text: 'text-mercado-light',
    dot: 'bg-mercado',
    sources: ['Google Maps Local API', 'MercadoLibre México', 'Google Shopping Real-Time', 'Volumen de Búsqueda'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <path d="M3 3v18h18" />
        <path d="M7 15l3-4 3 3 4-6" />
        <circle cx="20" cy="8" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
    deliverables: [
      {
        title: 'Score de Viabilidad (0 a 100)',
        desc: 'Calculado a partir de 5 factores: Tendencia, Competencia, Margen, Demanda y Oportunidad real.',
        badge: 'Algorítmico',
      },
      {
        title: 'Directorio de Competencia Real',
        desc: 'Mapeo de nombres, precios promedio, ratings y debilidades operativas detectadas que puedes atacar.',
        badge: 'Datos Reales',
      },
      {
        title: 'Cálculo TAM / SAM / SOM',
        desc: 'Medición del mercado total disponible en tu país o radio local y unidades/mes capturables.',
        badge: 'Proyección',
      },
      {
        title: 'Semáforo de Densidad Territorial',
        desc: 'Diagnóstico de tu zona por km² (Virgen, Equilibrada, Disputada o Saturada) con alertas de riesgo.',
        badge: 'Geolocalizado',
      },
    ],
    metrics: [
      { label: 'Score Viabilidad', value: '86/100', hint: 'Zona de alta oportunidad', accent: 'text-emerald-400' },
      { label: 'Competidores', value: '14 locales', hint: 'Google Maps + ML auditados', accent: 'text-white' },
      { label: 'Precio Sugerido', value: '$349 MXN', hint: 'vs $420 prom. mercado', accent: 'text-mercado-light' },
      { label: 'Saturación', value: 'Holgada', hint: '1.8 competidores/km²', accent: 'text-green-300' },
    ],
    previewType: 'mercado',
  },
  {
    title: 'Finanzas',
    categoryTag: 'Simulador Financiero & Cash Flow',
    desc: 'Punto de equilibrio exacto, tiempo de retorno (payback) y flujo a 12 meses.',
    description: 'Estructura tus costos fijos, insumos variables unitarios y proyección de flujo de efectivo mes a mes. Conoce las unidades exactas que necesitas vender para no perder dinero y cuándo recuperas tu inversión.',
    color: 'from-finanzas to-finanzas-dark',
    light: 'bg-finanzas/20',
    text: 'text-finanzas-light',
    dot: 'bg-finanzas',
    sources: ['Simulador Unitario', 'Estructura de Costos Fijos', 'Régimen SAT México', 'Matriz de Escenarios'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M9.5 9.2a2.2 2.2 0 0 1 2.5-1.7c1.2.1 2 .9 2 1.9 0 2.4-4.5 1.6-4.5 4 0 1 .9 1.8 2 1.9a2.2 2.2 0 0 0 2.5-1.7" />
      </svg>
    ),
    deliverables: [
      {
        title: 'Punto de Equilibrio (Break-Even)',
        desc: 'Unidades exactas y facturación mensual mínima para operar con utilidad cero sin pérdidas.',
        badge: 'Financiero',
      },
      {
        title: 'Periodo de Retorno de Inversión',
        desc: 'Mes calendario en el que recuperas el 100% de tu capital inicial invertido (Payback).',
        badge: 'Payback',
      },
      {
        title: 'Flujo de Caja a 12 Meses',
        desc: 'Proyección mes a mes de ingresos, costos variables, fijos y utilidad neta acumulada.',
        badge: '12 Meses',
      },
      {
        title: 'Simulador de Sensibilidad',
        desc: 'Ajusta tu precio o costos y observa el impacto inmediato en tu margen de ganancia neta.',
        badge: 'Interactivo',
      },
    ],
    metrics: [
      { label: 'Punto Equilibrio', value: '142 uds/mes', hint: '$49,700 MXN mensuales', accent: 'text-finanzas-light' },
      { label: 'Retorno Inversión', value: '4.2 meses', hint: 'Capital $120,000 MXN', accent: 'text-emerald-400' },
      { label: 'Margen Neto', value: '41.6%', hint: 'Promedio proyectado', accent: 'text-white' },
      { label: 'Crecimiento', value: '+310%', hint: 'Proyectado al mes 12', accent: 'text-emerald-300' },
    ],
    previewType: 'finanzas',
  },
  {
    title: 'Marketing',
    categoryTag: 'Estrategia de Adquisición & Copys',
    desc: '3 ángulos de posicionamiento, 14 días de calendario y copys para publicar.',
    description: 'Genera tu estrategia publicitaria completa con 3 rutas (Premium, Volumen y Nicho), un calendario de contenidos con horarios de mayor impacto y copys listos para Meta Ads, WhatsApp y TikTok.',
    color: 'from-marketing to-marketing-dark',
    light: 'bg-marketing/20',
    text: 'text-marketing-light',
    dot: 'bg-marketing',
    sources: ['Algoritmos Meta & TikTok', 'Psicología del Consumidor', 'Benchmark de CPC México', 'Formatos Virales'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z" />
        <path d="M14 8a4 4 0 0 1 0 8M17 5a8 8 0 0 1 0 14" />
      </svg>
    ),
    deliverables: [
      {
        title: '3 Estrategias de Posicionamiento',
        desc: 'Premium, Volumen y Especializado con evaluación de Fit de mercado según tu presupuesto.',
        badge: 'Estratégico',
      },
      {
        title: 'Calendario Editorial de 14 Días',
        desc: 'Ideas diarias estructuradas con formato recomendado (Reels, Carrusel), temáticas y mejores horas.',
        badge: '14 Días',
      },
      {
        title: 'Copys y Guiones de Video Listos',
        desc: 'Textos de alta conversión para Meta Ads, mensajes para WhatsApp y guiones con Hook + Retención + CTA.',
        badge: 'Listo para Usar',
      },
      {
        title: 'Presupuesto de Pauta y ROI Estimado',
        desc: 'Distribución recomendada de presupuesto publicitario y cálculo de prospectos calificados esperados.',
        badge: 'Estimación ROI',
      },
    ],
    metrics: [
      { label: 'Estrategia Fit', value: 'Nicho (94%)', hint: 'Mayor rentabilidad para ti', accent: 'text-marketing-light' },
      { label: 'Contenidos', value: '14 días', hint: 'Reels + Carruseles listos', accent: 'text-white' },
      { label: 'Costo por Lead', value: '$18 - $24', hint: 'Estimado en Meta Ads MX', accent: 'text-emerald-400' },
      { label: 'Retorno Pauta', value: '3.8x ROI', hint: 'Proyección conservadora', accent: 'text-pink-300' },
    ],
    previewType: 'marketing',
  },
  {
    title: 'Ventas',
    categoryTag: 'Negociación, ICP & Manejo de Objeciones',
    desc: 'Perfil de cliente ideal (ICP), Script Scorer y análisis de por qué fallan.',
    description: 'Optimiza tu proceso comercial: define el perfil psicológico de tu comprador ideal, califica tus argumentos de venta con Script Scorer y aprende cómo sortear objeciones como "está muy caro" o "lo voy a pensar".',
    color: 'from-cyan-500 to-cyan-600',
    light: 'bg-cyan-500/20',
    text: 'text-cyan-300',
    dot: 'bg-cyan-500',
    sources: ['Psicología de Cierre', 'Base de Datos Post-Mortem PYME', 'Script Scorer AI', 'Ciclos de Venta B2B/B2C'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <path d="M3 12h18M12 3v18M6 9l3-3 3 3 4-4 4 4" />
        <circle cx="18" cy="6" r="1.5" fill="currentColor" />
      </svg>
    ),
    deliverables: [
      {
        title: 'Perfil de Cliente Ideal (ICP Ultra-detallado)',
        desc: 'Dolores profundos, frenos de compra, disparadores emocionales y poder adquisitivo estimado.',
        badge: 'Perfil ICP',
      },
      {
        title: 'Script Scorer & Manejo de Objeciones',
        desc: 'Guiones probados para cerrar cuando te dicen "está caro" o "lo pienso", calificados con IA.',
        badge: 'Persuasión',
      },
      {
        title: 'Reporte Post-Mortem "Por Qué Fallan"',
        desc: 'Auditoría de los errores fatales más comunes que cometieron otros negocios en tu giro para no repetirlos.',
        badge: 'Prevención',
      },
      {
        title: 'Tácticas de Negociación Práctica',
        desc: 'Ejemplos reales y errores letales al fijar precios, plazos o condiciones comerciales.',
        badge: 'Tácticas',
      },
    ],
    metrics: [
      { label: 'Script Scorer', value: '9.2 / 10', hint: 'Efectividad de cierre alta', accent: 'text-cyan-300' },
      { label: 'Objeciones', value: '5 neutralizadas', hint: 'Precio, tiempo, confianza', accent: 'text-white' },
      { label: 'Conversión WA', value: '+14.8%', hint: 'Tasa estimada con guión', accent: 'text-emerald-400' },
      { label: 'Errores Detectados', value: '3 trampas', hint: 'Mapeadas antes de arrancar', accent: 'text-amber-300' },
    ],
    previewType: 'ventas',
  },
  {
    title: 'Legal',
    categoryTag: 'Cumplimiento Normativo & SAT',
    desc: 'Permisos obligatorios con costos en $MXN, licencias y régimen fiscal óptimo.',
    description: 'Diagnostica tu negocio frente a las leyes mexicanas: permisos municipales, licencias sanitarias (COFEPRIS), obligaciones de facturación CFDI 4.0 ante el SAT y contratos indispensables sin sorpresas.',
    color: 'from-[#7C3AED] to-[#5B21B6]',
    light: 'bg-[#7C3AED]/20',
    text: 'text-[#A78BFA]',
    dot: '#7C3AED',
    sources: ['Normativa SAT México', 'Regulaciones COFEPRIS', 'Ley Protección Datos (INAI)', 'Licencias Municipales'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <path d="M12 2l-8 4 8 4 8-4-8-4z" />
        <path d="M4 10l8 4 8-4" />
        <path d="M4 6v6l8 4 8-4V6" />
        <path d="M9 18l-5 2 2-5" />
        <path d="M15 18l5 2-2-5" />
      </svg>
    ),
    deliverables: [
      {
        title: 'Semáforo Global de Cumplimiento',
        desc: 'Clasificación visual (Verde / Amarillo / Rojo) de tu nivel de exposición a multas o clausuras.',
        badge: 'Semáforo',
      },
      {
        title: 'Catálogo de Permisos y Licencias',
        desc: 'Costos estimados oficiales en $MXN, tiempos de espera y enlaces directos a los trámites oficiales.',
        badge: 'Costos MXN',
      },
      {
        title: 'Estrategia Fiscal Óptima (SAT)',
        desc: 'Evaluación de conveniencia entre RESICO vs Actividad Empresarial para pagar el menor impuesto legal.',
        badge: 'Fiscal',
      },
      {
        title: 'Checklist Regulatorio & Laboral',
        desc: 'Aviso de privacidad obligatorio según INAI, términos de venta digital y contratos de personal.',
        badge: 'Checklist',
      },
    ],
    metrics: [
      { label: 'Semáforo Legal', value: 'Verde (Bajo)', hint: 'Riesgo normativo controlado', accent: 'text-emerald-400' },
      { label: 'Permisos Clave', value: '3 trámites', hint: 'Licencia, RFC, Aviso INAI', accent: 'text-white' },
      { label: 'Costo Trámites', value: '$2,400 MXN', hint: 'Total estimado oficial', accent: 'text-[#A78BFA]' },
      { label: 'Régimen Sugerido', value: 'RESICO', hint: 'Tasa fija ISR 1.5%', accent: 'text-green-300' },
    ],
    previewType: 'legal',
  },
];

/* ── Interactive Live Preview Widgets ────────────────────────────────────────── */

function MercadoPreview() {
  return (
    <div className="rounded-2xl bg-black/40 border border-white/10 p-4 sm:p-5 font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white/90">Simulación: Análisis de Mercado en Vivo</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mercado/20 text-mercado-light border border-mercado/30">
          Radio: 5 km (CDMX)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-semibold">Viabilidad Detectada</div>
          <div className="text-2xl font-black text-emerald-400 mt-0.5">86 <span className="text-xs text-white/40">/100</span></div>
          <div className="text-[10px] text-emerald-400/80 font-medium mt-1">Oportunidad Alta</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-semibold">Competidores Directos</div>
          <div className="text-2xl font-black text-white mt-0.5">14 <span className="text-xs text-white/40">locales</span></div>
          <div className="text-[10px] text-white/50 mt-1">Google Maps + MercadoLibre</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-semibold">Precio Óptimo</div>
          <div className="text-2xl font-black text-mercado-light mt-0.5">$349 <span className="text-xs text-white/40">MXN</span></div>
          <div className="text-[10px] text-white/50 mt-1">Promedio rivales: $420 MXN</div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-mercado/[0.08] border border-mercado/20 flex items-start gap-2.5">
        <svg className="w-4 h-4 text-mercado-light shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </svg>
        <div className="text-xs text-white/80 leading-relaxed">
          <strong className="text-mercado-light">Gap de oportunidad detectado:</strong> 9 de los 14 competidores tardan más de 48 horas en despachar. Si ofreces entrega en 24h, capturas una prima de margen de hasta +18%.
        </div>
      </div>
    </div>
  );
}

function FinanzasPreview() {
  return (
    <div className="rounded-2xl bg-black/40 border border-white/10 p-4 sm:p-5 font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white/90">Simulación: Proyección Cash Flow & Break-Even</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-finanzas/20 text-finanzas-light border border-finanzas/30">
          Inversión Inicial: $120,000 MXN
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[9px] text-white/40 uppercase font-bold">Punto Equilibrio</div>
          <div className="text-lg font-black text-finanzas-light mt-0.5">142 uds</div>
          <div className="text-[9px] text-white/40">$49,700/mes</div>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[9px] text-white/40 uppercase font-bold">Recuperación (Payback)</div>
          <div className="text-lg font-black text-emerald-400 mt-0.5">4.2 meses</div>
          <div className="text-[9px] text-emerald-400/70">100% del capital</div>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[9px] text-white/40 uppercase font-bold">Margen Bruto</div>
          <div className="text-lg font-black text-white mt-0.5">64.5%</div>
          <div className="text-[9px] text-white/40">Unitario</div>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[9px] text-white/40 uppercase font-bold">Margen Neto</div>
          <div className="text-lg font-black text-emerald-300 mt-0.5">41.6%</div>
          <div className="text-[9px] text-white/40">Post-impuestos</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] text-white/50 mb-1.5">
          <span>Proyección Flujo de Efectivo (Mes 1 al 12)</span>
          <span className="text-emerald-400 font-semibold">+310% de crecimiento</span>
        </div>
        <div className="flex items-end gap-1.5 h-14 p-2 bg-white/[0.02] border border-white/5 rounded-xl">
          {[
            { h: 18, pos: false, label: 'M1' },
            { h: 26, pos: false, label: 'M2' },
            { h: 36, pos: false, label: 'M3' },
            { h: 50, pos: true, label: 'M4' },
            { h: 62, pos: true, label: 'M5' },
            { h: 74, pos: true, label: 'M6' },
            { h: 84, pos: true, label: 'M7' },
            { h: 92, pos: true, label: 'M8' },
            { h: 100, pos: true, label: 'M12' },
          ].map((bar, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div
                className={`w-full rounded-sm transition-all duration-500 ${
                  bar.pos ? 'bg-gradient-to-t from-emerald-500 to-emerald-400' : 'bg-white/20'
                }`}
                style={{ height: `${bar.h}%` }}
              />
              <span className="text-[7px] text-white/30 font-mono">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketingPreview() {
  const [copied, setCopied] = useState(false);
  const sampleCopy = "¿Cansado de productos genéricos que prometen y no rinden? Descubre la fórmula diseñada con precisión para quienes buscan resultados medibles desde el primer mes. Envíos gratis a todo México.";

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(sampleCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-2xl bg-black/40 border border-white/10 p-4 sm:p-5 font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
          <span className="text-xs font-bold text-white/90">Estrategia Ganadora Recomendada: Especialización</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-marketing/20 text-marketing-light border border-marketing/30">
          Fit de Mercado: 94%
        </span>
      </div>

      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-marketing-light uppercase tracking-wider">
            Copy listo para Anuncios / WhatsApp
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md border border-white/10 transition-all cursor-pointer"
          >
            {copied ? (
              <span className="text-emerald-400 font-bold inline-flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Copiado al portapapeles
              </span>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copiar copy
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-white/80 italic leading-relaxed">
          &ldquo;{sampleCopy}&rdquo;
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 text-center">
          <div className="text-[9px] text-white/40">Canal Principal</div>
          <div className="text-xs font-bold text-white mt-0.5">Instagram Reels</div>
        </div>
        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 text-center">
          <div className="text-[9px] text-white/40">Horario Pico</div>
          <div className="text-xs font-bold text-white mt-0.5">20:00 hrs CDMX</div>
        </div>
        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 text-center">
          <div className="text-[9px] text-white/40">Pauta Sugerida</div>
          <div className="text-xs font-bold text-emerald-400 mt-0.5">$65 MXN/día</div>
        </div>
      </div>
    </div>
  );
}

function VentasPreview() {
  return (
    <div className="rounded-2xl bg-black/40 border border-white/10 p-4 sm:p-5 font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-bold text-white/90">Script Scorer & Manejo de Objeción Principal</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
          Score: 9.2 / 10
        </span>
      </div>

      <div className="space-y-3">
        <div className="p-3 rounded-xl bg-red-500/[0.08] border border-red-500/20">
          <div className="text-[10px] font-bold text-red-400 uppercase tracking-wide flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Objeción del Cliente:
          </div>
          <div className="text-xs text-white/90 font-medium mt-1">
            &ldquo;Tu producto se ve bien, pero lo encuentro 15% más barato con otro proveedor.&rdquo;
          </div>
        </div>

        <div className="p-3 rounded-xl bg-cyan-500/[0.08] border border-cyan-500/20">
          <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wide flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            Respuesta Probada (Guión de Cierre):
          </div>
          <div className="text-xs text-white/85 mt-1 leading-relaxed">
            &ldquo;Entiendo el punto del precio. Justo por eso nosotros incluimos garantía de cambio inmediato en 24h y soporte local, lo que evita que pierdas hasta 3 días hábiles si llega dañado. ¿Prefieres asegurar tu operación o arriesgar tiempo de entrega?&rdquo;
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-white/50">
        <span>Cliente Ideal (ICP): Dueño de PYME / Profesionista independiente</span>
        <span className="text-emerald-400 font-semibold">+14.8% conversión estimada</span>
      </div>
    </div>
  );
}

function LegalPreview() {
  return (
    <div className="rounded-2xl bg-black/40 border border-white/10 p-4 sm:p-5 font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white/90">Diagnóstico Normativo & Trámites Clave</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          Semáforo: Riesgo Controlado (Verde)
        </span>
      </div>

      <div className="space-y-2 mb-3">
        {[
          {
            nombre: 'Licencia de Funcionamiento Municipal',
            costo: '$1,200 MXN',
            tiempo: '10-15 días',
            estado: 'Obligatorio',
            statusCls: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
          },
          {
            nombre: 'Inscripción SAT bajo RESICO Persona Física',
            costo: 'Gratuito',
            tiempo: 'Inmediato',
            estado: 'Recomendado (1.5% ISR)',
            statusCls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
          },
          {
            nombre: 'Aviso de Privacidad Integral (INAI)',
            costo: 'Gratuito (Generado)',
            tiempo: 'Inmediato',
            estado: 'Cumplido',
            statusCls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
          },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.025] border border-white/5 text-xs">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span className="text-white/85 font-medium">{item.nombre}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-[11px]">{item.costo} · {item.tiempo}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.statusCls}`}>
                {item.estado}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="p-2.5 rounded-xl bg-[#7C3AED]/[0.08] border border-[#7C3AED]/20 text-xs text-white/80">
        <strong className="text-[#A78BFA]">Ahorro fiscal proyectado:</strong> Al tributar bajo RESICO con margen del 40%, tu tasa efectiva de ISR se reduce al 1.5%, ahorrándote hasta $18,400 MXN en impuestos durante el primer año.
      </div>
    </div>
  );
}

export default function Hero({ modules = [] }: { modules?: HeroModule[] }) {
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'deliverables' | 'preview'>('deliverables');
  const shouldReduce = useReducedMotion();

  const effectiveModules = (modules && modules.length > 0 ? modules : DEFAULT_MODULES).map((m) => {
    const fallback = DEFAULT_MODULES.find((d) => d.title.toLowerCase() === (m.title || '').toLowerCase()) || DEFAULT_MODULES[0];
    return {
      title: m.title || fallback.title,
      categoryTag: m.categoryTag || fallback.categoryTag,
      desc: m.desc || fallback.desc,
      description: m.description || fallback.description,
      light: m.light || fallback.light,
      text: m.text || fallback.text,
      icon: m.icon || fallback.icon,
      color: m.color || fallback.color,
      dot: m.dot || fallback.dot,
      tag: m.tag || fallback.tag || '',
      features: m.features || fallback.features || [],
      sources: m.sources || fallback.sources,
      deliverables: m.deliverables || fallback.deliverables,
      metrics: m.metrics || fallback.metrics,
      previewType: m.previewType || fallback.previewType,
    };
  });
  const currentIndex = effectiveModules.findIndex((m) => m.title === expandedModule);
  const currentModule = currentIndex >= 0 ? effectiveModules[currentIndex] : null;

  const handlePrevModule = () => {
    if (currentIndex <= 0) {
      setExpandedModule(effectiveModules[effectiveModules.length - 1].title);
    } else {
      setExpandedModule(effectiveModules[currentIndex - 1].title);
    }
  };

  const handleNextModule = () => {
    if (currentIndex >= effectiveModules.length - 1) {
      setExpandedModule(effectiveModules[0].title);
    } else {
      setExpandedModule(effectiveModules[currentIndex + 1].title);
    }
  };

  return (
    <section className="relative min-h-screen flex items-center pt-32 pb-24 px-6 overflow-visible">
      {/* Seamless Ambient Background Flows */}
      <div className="absolute top-0 left-0 right-0 h-full pointer-events-none opacity-60 z-0 overflow-hidden">
        <div className="absolute top-[0%] left-[0%] w-[50vw] h-[50vw] rounded-full bg-brand-primary/10 blur-[150px]" />
        <div className="absolute top-[20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-brand-accent/10 blur-[150px]" />
      </div>

      <div className="max-w-[1400px] w-full mx-auto relative z-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 lg:gap-8 items-center">

          {/* LEFT SIDE: Text and CTA */}
          <div className="flex flex-col items-start text-left">
            {/* Subtle, elegant badge */}
            <motion.div
              {...heroEntrada(0, shouldReduce)}
              className="inline-flex items-center gap-2.5 bg-white/[0.03] border border-white/10 px-4 py-2 rounded-pill text-[13px] font-semibold text-white/70 mb-8 backdrop-blur-md shadow-elevated hover:bg-white/[0.05] transition-colors"
            >
              <span className="w-2 h-2 bg-green-400 rounded-full shadow-[0_0_10px_rgba(74,222,128,0.6)] animate-pulse" />
              Validando ideas en tiempo real — ahora mismo
            </motion.div>

            {/* Premium SaaS Headline */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold mb-8 tracking-tight leading-[1.05] text-white">
              <motion.span {...heroEntrada(1, shouldReduce)} className="block">Valida cualquier</motion.span>
              <motion.span {...heroEntrada(2, shouldReduce)} className="block">idea de negocio</motion.span>
              <motion.span {...heroEntrada(3, shouldReduce)} className="block">
                en <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-accent to-red-400">minutos.</span>
              </motion.span>
            </h1>

            <motion.p
              {...heroEntrada(4, shouldReduce)}
              className="text-lg md:text-xl text-white/50 max-w-xl mb-12 font-light leading-relaxed"
            >
              Sube cualquier producto o servicio y recibe en minutos un análisis brutal: quién compite contigo, cómo posicionarte, dónde surtirte más barato y cuándo recuperas tu inversión.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              {...heroEntrada(5, shouldReduce)}
              className="flex flex-col sm:flex-row gap-4 mb-16 w-full sm:w-auto"
            >
              <Button
                href="/auth/signup"
                variant="accent"
                size="lg"
                iconRight={<ArrowRight {...ICON.sm} />}
              >
                Comenzar validación gratis
              </Button>
              <Button href="/auth/login" variant="outline" size="lg">
                Ver caso de estudio
              </Button>
            </motion.div>
          </div>

          {/* RIGHT SIDE: Floating Mockup */}
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: MOTION_EASINGS.easeOutQuart, delay: 0.15 }}
            className="relative w-full flex justify-center lg:justify-end"
            style={{ perspective: "1000px" }}
          >
            {/* Flotación continua: amplitud mínima, ciclo largo — presencia sin
                llamar la atención. Se desactiva con prefers-reduced-motion. */}
            <motion.div
              animate={shouldReduce ? undefined : { y: [0, -14, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
              className="relative w-full max-w-[800px] z-20"
              style={{ transformStyle: 'preserve-3d', transform: 'rotateY(-8deg) rotateX(4deg)' }}
            >
              <div className="relative rounded-[24px] border border-white/10 bg-white/[0.02] p-2 backdrop-blur-2xl shadow-[0_40px_100px_rgba(0,0,0,0.8),0_0_40px_rgba(231,76,60,0.15)] overflow-hidden">
                <div className="relative rounded-[16px] overflow-hidden bg-[#070E17]">
                   <div className="absolute inset-0 z-20 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />
                   <Image
                      src="/hero_dashboard.png"
                      alt="Panel de Control BI 0 A 100"
                      width={1920}
                      height={1080}
                      className="w-full h-auto object-cover block"
                      priority
                   />
                </div>
              </div>
              
              {/* Floor Shadow beneath mockup */}
              <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-[90%] h-16 bg-black/60 blur-[40px] rounded-[100%] pointer-events-none z-0" />
            </motion.div>
          </motion.div>

        </div>

        {/* ── CINEMATIC 5 ARTIFICIAL BRAINS SECTION ── */}
        <motion.div
          initial={shouldReduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: MOTION_DURATIONS.slow, ease: MOTION_EASINGS.easeOutQuart }}
          className="mt-24 pt-12 border-t border-white/[0.06] w-full"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold text-white/60 uppercase tracking-widest mb-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-ping" />
                Arquitectura Multi-Agente
              </div>
              <p className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                Cinco cerebros artificiales,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/60">
                  analizando tu negocio al mismo tiempo:
                </span>
              </p>
              <p className="text-xs sm:text-sm text-white/50 mt-1 max-w-2xl">
                {expandedModule
                  ? 'Explora las fuentes de datos reales, entregables y simulación de resultados de este módulo.'
                  : 'Haz clic en cualquier cerebro para ver exactamente qué analiza, qué resultados te entrega y una simulación real.'}
              </p>
            </div>

            {expandedModule && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.92, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 4 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setExpandedModule(null)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-control bg-white/[0.06] hover:bg-white/12 border border-white/15 text-xs font-bold text-white transition-all cursor-pointer shadow-elevated hover:border-white/30"
              >
                <LayoutGrid {...ICON.xs} /> Vista en cuadrícula
              </motion.button>
            )}
          </div>

          <div className="w-full max-w-[1400px] mx-auto">
            <LayoutGroup id="hero-modules-morph">
              <motion.div layout transition={MORPH_SPRING} className="w-full">
                {!expandedModule ? (
                  /* ── GRID VIEW (5 Symmetrical Columns) ── */
                  <motion.div
                    key="hero-modules-grid"
                    initial={shouldReduce ? undefined : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduce ? undefined : { opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full"
                  >
                    {effectiveModules.map((m) => (
                      <motion.button
                        key={m.title}
                        layoutId={`module-card-${m.title}`}
                        transition={MORPH_SPRING}
                        onClick={() => {
                          setExpandedModule(m.title);
                          setActiveTab('deliverables');
                        }}
                        whileHover={{ y: -5, scale: 1.015 }}
                        whileTap={{ scale: 0.985 }}
                        className="group relative flex flex-col items-start p-6 rounded-2xl bg-white/[0.025] hover:bg-white/[0.055] border border-white/10 hover:border-white/20 transition-colors duration-200 cursor-pointer text-left overflow-hidden shadow-xl"
                      >
                        {/* Glowing ambient background on hover */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        
                        {/* Top subtle colored edge */}
                        <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${m.color || 'from-white/20 to-white/5'} opacity-40 group-hover:opacity-100 transition-opacity duration-300`} />

                        {/* Top Category Badge */}
                        <div className="w-full flex items-center justify-between mb-4">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 group-hover:text-white/70 transition-colors truncate">
                            {m.categoryTag}
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                        </div>

                        {/* Icon */}
                        <motion.div
                          layoutId={`module-icon-${m.title}`}
                          transition={MORPH_SPRING}
                          className={`w-14 h-14 rounded-2xl ${m.light} flex items-center justify-center ring-1 ring-white/10 mb-4 shadow-[0_0_25px_rgba(255,255,255,0.06)] group-hover:shadow-[0_0_35px_rgba(255,255,255,0.18)] transition-all flex-shrink-0`}
                        >
                          <span className={`w-7 h-7 block ${m.text}`}>{m.icon}</span>
                        </motion.div>

                        {/* Title */}
                        <motion.span
                          layoutId={`module-title-${m.title}`}
                          transition={MORPH_SPRING}
                          className="text-xl font-extrabold text-white tracking-tight leading-tight"
                        >
                          {m.title}
                        </motion.span>

                        {/* Subtitle / Desc */}
                        <motion.p
                          layoutId={`module-sub-${m.title}`}
                          transition={MORPH_SPRING}
                          className="text-xs text-white/50 group-hover:text-white/80 transition-colors mt-2 leading-relaxed line-clamp-2"
                        >
                          {m.desc}
                        </motion.p>

                        {/* Bottom Metric Pill */}
                        <div className="mt-5 pt-3 border-t border-white/5 w-full flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-400">
                            {m.metrics?.[0]?.value || 'Análisis listo'}
                          </span>
                          <span className="text-xs text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all inline-flex items-center gap-1.5 font-semibold">
                            Ver qué entrega <ArrowRight {...ICON.xs} />
                          </span>
                        </div>
                      </motion.button>
                    ))}
                  </motion.div>
                ) : (
                  /* ── EXPANDED VIEW: Morph into Sidebar + Detail Panel ── */
                  <motion.div
                    key="hero-modules-expanded"
                    initial={shouldReduce ? undefined : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={shouldReduce ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-6 lg:gap-8 items-start w-full"
                  >
                    {/* LEFT SIDEBAR: Morphing Module Cards */}
                    <div className="space-y-2.5 w-full flex flex-col">
                      <div className="flex items-center justify-between pb-1 px-1">
                        <button
                          type="button"
                          onClick={() => setExpandedModule(null)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-white/60 hover:text-white transition-colors cursor-pointer"
                        >
                          <ArrowLeft {...ICON.xs} /> Volver a cuadrícula
                        </button>
                        <span className="text-[11px] font-mono font-bold text-white/40">
                          {currentIndex + 1} de {effectiveModules.length} cerebros
                        </span>
                      </div>

                      {/* Desktop vertical list / Mobile horizontal scroll */}
                      <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 w-full no-scrollbar">
                        {effectiveModules.map((m) => {
                          const isSelected = expandedModule === m.title;
                          return (
                            <motion.button
                              key={m.title}
                              layoutId={`module-card-${m.title}`}
                              transition={MORPH_SPRING}
                              onClick={() => {
                                setExpandedModule(m.title);
                                setActiveTab('deliverables');
                              }}
                              className={`group relative flex-shrink-0 lg:flex-shrink w-auto lg:w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border text-left transition-colors duration-200 cursor-pointer overflow-hidden ${
                                isSelected
                                  ? 'bg-white/[0.09] border-white/25 shadow-[0_0_30px_rgba(255,255,255,0.07)]'
                                  : 'bg-white/[0.025] border-white/5 hover:border-white/15 hover:bg-white/[0.05]'
                              }`}
                              whileHover={{ x: 2, transition: { duration: 0.15 } }}
                              whileTap={{ scale: 0.985 }}
                            >
                              {isSelected && (
                                <motion.div
                                  layoutId="hero-sidebar-active-indicator"
                                  transition={PILL_SPRING}
                                  className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${m.color || 'from-brand-accent to-red-400'}`}
                                />
                              )}

                              {/* Icon */}
                              <motion.div
                                layoutId={`module-icon-${m.title}`}
                                transition={MORPH_SPRING}
                                className={`w-9 h-9 rounded-xl ${m.light} flex items-center justify-center ring-1 ring-white/10 flex-shrink-0`}
                              >
                                <span className={`w-4 h-4 block ${m.text}`}>{m.icon}</span>
                              </motion.div>

                              {/* Text info */}
                              <div className="min-w-0 flex-1 pr-1">
                                <div className="flex items-center gap-2">
                                  <motion.span
                                    layoutId={`module-title-${m.title}`}
                                    transition={MORPH_SPRING}
                                    className={`block text-sm font-extrabold truncate leading-tight ${
                                      isSelected ? 'text-white' : 'text-white/70 group-hover:text-white'
                                    }`}
                                  >
                                    {m.title}
                                  </motion.span>
                                </div>
                                <motion.span
                                  layoutId={`module-sub-${m.title}`}
                                  transition={MORPH_SPRING}
                                  className="text-[11px] text-white/40 block truncate mt-0.5 font-medium"
                                >
                                  {m.categoryTag}
                                </motion.span>
                              </div>

                              <span className={`hidden lg:inline transition-transform ${isSelected ? 'text-white translate-x-0' : 'text-white/20 -translate-x-1 group-hover:translate-x-0'}`}>
                                <ArrowRight {...ICON.xs} />
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* RIGHT DETAIL CONTENT PANEL */}
                    <div className="w-full min-w-0">
                      <AnimatePresence mode="wait">
                        {currentModule && (
                          <motion.div
                            key={currentModule.title}
                            initial={shouldReduce ? undefined : { opacity: 0, y: 24, scale: 0.98, filter: 'blur(8px)' }}
                            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                            exit={shouldReduce ? undefined : { opacity: 0, y: -16, scale: 0.98, filter: 'blur(6px)' }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                            className="rounded-3xl border border-white/12 bg-gradient-to-b from-[#0B1320]/90 to-[#070E17]/95 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden"
                          >
                            {/* Accent Glow */}
                            <div className={`absolute -right-24 -top-24 w-80 h-80 rounded-full ${currentModule.light} blur-[130px] pointer-events-none opacity-40`} />

                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10 relative z-10">
                              <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl ${currentModule.light} flex items-center justify-center ring-1 ring-white/20 shadow-2xl flex-shrink-0`}>
                                  <span className={`w-7 h-7 block ${currentModule.text}`}>{currentModule.icon}</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/10 text-white/80">
                                      Cerebro {currentIndex + 1} de {effectiveModules.length}
                                    </span>
                                    <span className="text-xs text-white/30">·</span>
                                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      {currentModule.categoryTag}
                                    </span>
                                  </div>
                                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                                    Módulo de {currentModule.title}
                                  </h3>
                                </div>
                              </div>

                              {/* Navigation and Actions */}
                              <div className="flex items-center gap-2 self-start sm:self-auto">
                                <button
                                  type="button"
                                  onClick={handlePrevModule}
                                  className="w-9 h-9 rounded-control bg-white/5 hover:bg-white/12 border border-white/10 text-white/70 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                                  aria-label="Cerebro anterior"
                                >
                                  <ArrowLeft {...ICON.sm} />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleNextModule}
                                  className="w-9 h-9 rounded-control bg-white/5 hover:bg-white/12 border border-white/10 text-white/70 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                                  aria-label="Cerebro siguiente"
                                >
                                  <ArrowRight {...ICON.sm} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedModule(null)}
                                  className="h-9 w-9 flex items-center justify-center rounded-control bg-white/5 hover:bg-white/12 border border-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
                                  aria-label="Cerrar detalle del módulo"
                                >
                                  <X {...ICON.sm} />
                                </button>
                              </div>
                            </div>

                            {/* Value Proposition Description */}
                            <p className="text-base sm:text-lg text-white/85 leading-relaxed mb-6 relative z-10 font-normal">
                              {currentModule.description}
                            </p>

                            {/* Real Data Sources Badges */}
                            <div className="mb-6 relative z-10 flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider mr-1">
                                Fuentes & APIs que cruza:
                              </span>
                              {(currentModule.sources || []).map((src, i) => (
                                <span
                                  key={i}
                                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-white/75"
                                >
                                  {src}
                                </span>
                              ))}
                            </div>

                            {/* Tab Switcher: Entregables vs Simulación en Vivo */}
                            <div className="mb-6 relative z-10 flex items-center gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/10 w-fit">
                              <button
                                type="button"
                                onClick={() => setActiveTab('deliverables')}
                                className={`relative px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                  activeTab === 'deliverables'
                                    ? 'text-white'
                                    : 'text-white/50 hover:text-white/80'
                                }`}
                              >
                                {activeTab === 'deliverables' && (
                                  <motion.div
                                    layoutId="hero-detail-tab-pill"
                                    transition={PILL_SPRING}
                                    className="absolute inset-0 bg-white/15 rounded-lg shadow-sm"
                                  />
                                )}
                                <span className="relative z-10">Entregables que recibes (4)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTab('preview')}
                                className={`relative px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                                  activeTab === 'preview'
                                    ? 'text-white'
                                    : 'text-white/50 hover:text-white/80'
                                }`}
                              >
                                {activeTab === 'preview' && (
                                  <motion.div
                                    layoutId="hero-detail-tab-pill"
                                    transition={PILL_SPRING}
                                    className="absolute inset-0 bg-white/15 rounded-lg shadow-sm"
                                  />
                                )}
                                <span className="relative z-10 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                  Vista previa de resultado real
                                </span>
                              </button>
                            </div>

                            {/* Active Tab View */}
                            <div className="mb-8 relative z-10">
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={activeTab}
                                  initial={shouldReduce ? undefined : { opacity: 0, y: 14, filter: 'blur(4px)' }}
                                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                  exit={shouldReduce ? undefined : { opacity: 0, y: -10, filter: 'blur(4px)' }}
                                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                >
                                  {activeTab === 'deliverables' ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                       {(currentModule.deliverables || []).map((item, i) => (
                                        <div
                                          key={i}
                                          className="p-4 rounded-2xl bg-white/[0.025] hover:bg-white/[0.045] border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between"
                                        >
                                          <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                              <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                                                <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                                                  <path d="M20 6 9 17l-5-5" />
                                                </svg>
                                                {item.title}
                                              </h4>
                                              {item.badge && (
                                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white/10 text-white/70">
                                                  {item.badge}
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-xs text-white/60 leading-relaxed pl-5">
                                              {item.desc}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div>
                                      {currentModule.previewType === 'mercado' && <MercadoPreview />}
                                      {currentModule.previewType === 'finanzas' && <FinanzasPreview />}
                                      {currentModule.previewType === 'marketing' && <MarketingPreview />}
                                      {currentModule.previewType === 'ventas' && <VentasPreview />}
                                      {currentModule.previewType === 'legal' && <LegalPreview />}
                                    </div>
                                  )}
                                </motion.div>
                              </AnimatePresence>
                            </div>

                            {/* Bottom Real Metrics Row */}
                            <div className="mb-8 p-4 rounded-2xl bg-white/[0.02] border border-white/8 grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
                              {(currentModule.metrics || []).map((met, i) => (
                                <div key={i} className="text-center sm:text-left">
                                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                                    {met.label}
                                  </div>
                                  <div className={`text-lg font-black mt-0.5 ${met.accent || 'text-white'}`}>
                                    {met.value}
                                  </div>
                                  {met.hint && (
                                    <div className="text-[10px] text-white/45 mt-0.5 truncate">
                                      {met.hint}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Bottom CTA Bar */}
                            <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
                              <span className="text-xs text-white/50 text-center sm:text-left">
                                Valida tu producto con este cerebro en menos de 3 minutos · Sin tarjeta de crédito
                              </span>
                              <div className="flex items-center gap-3 w-full sm:w-auto">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setExpandedModule(null)}
                                  className="flex-1 sm:flex-none"
                                >
                                  Ver todos los cerebros
                                </Button>
                                <Button
                                  href="/auth/signup"
                                  variant="accent"
                                  size="sm"
                                  className="flex-1 sm:flex-none"
                                  iconRight={<ArrowRight {...ICON.xs} />}
                                >
                                  Probar análisis gratis
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </LayoutGroup>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
