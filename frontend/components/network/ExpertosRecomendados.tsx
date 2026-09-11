'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NETWORK_ENABLED, PUEDE_USAR_EJEMPLOS } from '@/lib/networkFlag';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type CategoriaExperto = 'legal' | 'marketing' | 'ventas';

interface Experto {
  id: string;
  nombre_comercial: string;
  nombre_display: string;
  avatar_icon?: string;
  avatar_emoji?: string;
  bio_corta: string;
  ciudad: string;
  especialidad: string;
  sub_especialidades: string[];
  rating: number;
  total_resenas: number;
  tarifa_desde: number;
  video_disponible: boolean;
  verificado: boolean;
  es_patrocinado: boolean;
  ofrece_consulta_gratis: boolean;
}

function ExpertoAvatarIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'scale':
      return (
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
        </svg>
      );
    case 'user':
      return (
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'building':
      return (
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case 'rocket':
      return (
        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case 'chart':
      return (
        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    case 'palette':
      return (
        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4 5 5 0 015-5h4a2 2 0 002-2V6a4 4 0 014-4 4 4 0 014 4v1a6 6 0 01-6 6h-2a2 2 0 00-2 2v1a4 4 0 01-4 4z" />
        </svg>
      );
    case 'box':
      return (
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    case 'factory':
      return (
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case 'leaf':
      return (
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
  }
}

// ─── Datos mock por categoría ─────────────────────────────────────────────────
// Estos serán reemplazados por la API real (/network/expertos?categoria=legal)
// una vez que la Fase 1 de la Red esté implementada.

const EXPERTOS_MOCK: Record<CategoriaExperto, Experto[]> = {
  legal: [
    {
      id: '1', nombre_comercial: 'García & Asociados', nombre_display: 'García & Asoc.',
      avatar_icon: 'scale', bio_corta: 'Especialistas en Derecho Corporativo, SAT y Contratos PROFECO.',
      ciudad: 'CDMX', especialidad: 'Derecho Corporativo',
      sub_especialidades: ['SAT', 'PROFECO', 'Contratos', 'Startups'],
      rating: 4.9, total_resenas: 63, tarifa_desde: 1200,
      video_disponible: true, verificado: true, es_patrocinado: true, ofrece_consulta_gratis: true,
    },
    {
      id: '2', nombre_comercial: 'Lic. Ana Morales', nombre_display: 'Ana Morales',
      avatar_icon: 'user', bio_corta: 'Abogada laboral y fiscal con 12 años de experiencia en PyMEs.',
      ciudad: 'Guadalajara', especialidad: 'Derecho Laboral & Fiscal',
      sub_especialidades: ['IMSS', 'Nómina', 'Auditorías SAT'],
      rating: 4.8, total_resenas: 41, tarifa_desde: 800,
      video_disponible: false, verificado: true, es_patrocinado: false, ofrece_consulta_gratis: false,
    },
    {
      id: '3', nombre_comercial: 'Despacho Lex Norte', nombre_display: 'Lex Norte',
      avatar_icon: 'building', bio_corta: 'Protección de marcas, registro IMPI y propiedad intelectual.',
      ciudad: 'Monterrey', especialidad: 'Propiedad Intelectual',
      sub_especialidades: ['IMPI', 'Marcas', 'Patentes', 'E-commerce'],
      rating: 4.7, total_resenas: 29, tarifa_desde: 950,
      video_disponible: true, verificado: false, es_patrocinado: false, ofrece_consulta_gratis: true,
    },
  ],
  marketing: [
    {
      id: '4', nombre_comercial: 'Agencia Pulso Digital', nombre_display: 'Pulso Digital',
      avatar_icon: 'rocket', bio_corta: 'Agencia performance especializada en Meta Ads y Google con ROAS garantizado.',
      ciudad: 'CDMX', especialidad: 'Performance Marketing',
      sub_especialidades: ['Meta Ads', 'Google Ads', 'TikTok', 'E-commerce'],
      rating: 4.9, total_resenas: 87, tarifa_desde: 8000,
      video_disponible: true, verificado: true, es_patrocinado: true, ofrece_consulta_gratis: true,
    },
    {
      id: '5', nombre_comercial: 'Carlos Reyes — Growth', nombre_display: 'Carlos Reyes',
      avatar_icon: 'chart', bio_corta: 'Consultor de Growth Hacking y estrategia de contenidos para startups.',
      ciudad: 'Monterrey', especialidad: 'Growth & Contenidos',
      sub_especialidades: ['SEO', 'Content Marketing', 'Embudos de Venta'],
      rating: 4.8, total_resenas: 55, tarifa_desde: 5000,
      video_disponible: true, verificado: true, es_patrocinado: false, ofrece_consulta_gratis: false,
    },
    {
      id: '6', nombre_comercial: 'Studio Tierra', nombre_display: 'Studio Tierra',
      avatar_icon: 'palette', bio_corta: 'Diseño de marca, identidad visual y campañas 360° para PyMEs.',
      ciudad: 'Guadalajara', especialidad: 'Branding & Diseño',
      sub_especialidades: ['Identidad Visual', 'Redes Sociales', 'Packaging'],
      rating: 4.6, total_resenas: 33, tarifa_desde: 3500,
      video_disponible: false, verificado: false, es_patrocinado: false, ofrece_consulta_gratis: true,
    },
  ],
  ventas: [
    {
      id: '7', nombre_comercial: 'Grupo Suministros MX', nombre_display: 'Suministros MX',
      avatar_icon: 'box', bio_corta: 'Distribuidor mayorista nacional con más de 3,000 SKUs y envíos en 24h.',
      ciudad: 'CDMX', especialidad: 'Mayoreo Nacional',
      sub_especialidades: ['Logística', 'B2B', 'Almacenaje', 'Envíos 24h'],
      rating: 4.8, total_resenas: 110, tarifa_desde: 500,
      video_disponible: true, verificado: true, es_patrocinado: true, ofrece_consulta_gratis: false,
    },
    {
      id: '8', nombre_comercial: 'FabriConnect', nombre_display: 'FabriConnect',
      avatar_icon: 'factory', bio_corta: 'Conectamos fabricantes nacionales con emprendedores. MOQ bajo.',
      ciudad: 'Estado de México', especialidad: 'Manufactura & Maquilado',
      sub_especialidades: ['Maquila', 'Textil', 'Plásticos', 'MOQ bajo'],
      rating: 4.7, total_resenas: 68, tarifa_desde: 200,
      video_disponible: false, verificado: true, es_patrocinado: false, ofrece_consulta_gratis: true,
    },
    {
      id: '9', nombre_comercial: 'EcoPack Solutions', nombre_display: 'EcoPack',
      avatar_icon: 'leaf', bio_corta: 'Empaques sostenibles, biodegradables y compostables. Certificación FSC.',
      ciudad: 'Guadalajara', especialidad: 'Empaques Sostenibles',
      sub_especialidades: ['Compostable', 'Biodegradable', 'Impresión', 'Personalizado'],
      rating: 4.5, total_resenas: 24, tarifa_desde: 1500,
      video_disponible: true, verificado: false, es_patrocinado: false, ofrece_consulta_gratis: true,
    },
  ],
};

const CONFIG: Record<CategoriaExperto, { titulo: string; subtitulo: string; color: string; accentBg: string; accentBorder: string; accentText: string; accentShadow: string }> = {
  legal: {
    titulo: 'Expertos Legales para tu Negocio',
    subtitulo: 'Abogados y despachos especializados en resolver exactamente los puntos detectados en tu análisis.',
    color: '#7C3AED', accentBg: 'bg-[#7C3AED]/10', accentBorder: 'border-[#7C3AED]/30',
    accentText: 'text-[#A78BFA]', accentShadow: 'shadow-[0_0_20px_rgba(124,58,237,0.25)]',
  },
  marketing: {
    titulo: 'Agencias y Consultores de Marketing',
    subtitulo: 'Especialistas en ejecutar las estrategias detectadas en tu análisis, con resultados medibles.',
    color: '#3B82F6', accentBg: 'bg-blue-500/10', accentBorder: 'border-blue-500/30',
    accentText: 'text-blue-400', accentShadow: 'shadow-[0_0_20px_rgba(59,130,246,0.25)]',
  },
  ventas: {
    titulo: 'Canales de Venta Verificados para tu Industria',
    subtitulo: 'Distribuidores, fabricantes y maquiladores listos para cotizarte según tu rubro.',
    color: '#10B981', accentBg: 'bg-emerald-500/10', accentBorder: 'border-emerald-500/30',
    accentText: 'text-emerald-400', accentShadow: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
  },
};

// ─── Componente de Tarjeta Individual ─────────────────────────────────────────

function ExpertoCard({ experto, cfg }: { experto: Experto; cfg: typeof CONFIG['legal'] }) {
  const [contactado, setContactado] = useState(false);

  return (
    <div
      className={`relative group flex flex-col rounded-2xl border bg-white/[0.03] backdrop-blur-sm p-5 transition-all duration-300 hover:-translate-y-1 ${cfg.accentBorder} hover:bg-white/[0.05] hover:${cfg.accentShadow}`}
    >
      {/* Patrocinado badge */}
      {experto.es_patrocinado && (
        <div className="absolute -top-2.5 left-4 flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Patrocinado
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar */}
        <div className={`w-12 h-12 rounded-xl ${cfg.accentBg} border ${cfg.accentBorder} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300`}>
          <ExpertoAvatarIcon icon={experto.avatar_icon || experto.avatar_emoji || ''} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-white font-bold text-sm truncate">{experto.nombre_comercial}</h4>
            {experto.verificado && (
              <span title="Verificado por 0 a 100" className={`flex-shrink-0 ${cfg.accentText}`}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </div>
          <p className="text-white/40 text-[11px] mt-0.5 flex items-center gap-1">
            <svg className="w-3 h-3 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{experto.ciudad} · {experto.especialidad}</span>
          </p>
          {/* Rating */}
          <div className="flex items-center gap-1 mt-1">
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(s => (
                <svg key={s} className={`w-3 h-3 ${s <= Math.round(experto.rating) ? 'text-amber-400' : 'text-white/15'}`} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-amber-400 text-[11px] font-bold">{experto.rating}</span>
            <span className="text-white/30 text-[10px]">({experto.total_resenas} reseñas)</span>
          </div>
        </div>
      </div>

      {/* Bio */}
      <p className="text-white/50 text-xs leading-relaxed mb-3 line-clamp-2">{experto.bio_corta}</p>

      {/* Tags especialidades */}
      <div className="flex flex-wrap gap-1 mb-4">
        {experto.sub_especialidades.slice(0, 3).map(tag => (
          <span key={tag} className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${cfg.accentBg} ${cfg.accentText} border ${cfg.accentBorder}`}>
            {tag}
          </span>
        ))}
        {experto.sub_especialidades.length > 3 && (
          <span className="text-[9px] text-white/30 px-1 py-0.5">+{experto.sub_especialidades.length - 3}</span>
        )}
      </div>

      {/* Footer: tarifa + CTAs */}
      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between text-xs text-white/30">
          <span>Desde <span className="text-white/60 font-bold">${experto.tarifa_desde.toLocaleString('es-MX')} MXN</span></span>
          {experto.ofrece_consulta_gratis && (
            <span className="inline-flex items-center gap-1 text-emerald-400/70 text-[10px] font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Consulta gratis</span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {experto.video_disponible && (
            <button
              title="Ver video de presentación"
              className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setContactado(true)}
            disabled={contactado}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
              contactado
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 cursor-default'
                : `${cfg.accentBg} border ${cfg.accentBorder} ${cfg.accentText} hover:brightness-110`
            }`}
          >
            {contactado ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Solicitud enviada</span>
              </span>
            ) : (
              'Solicitar cotización'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

interface ExpertosRecomendadosProps {
  categoria: CategoriaExperto;
}

export default function ExpertosRecomendados({ categoria }: ExpertosRecomendadosProps) {
  const [tab, setTab] = useState<'patrocinados' | 'top'>('patrocinados');
  const cfg = CONFIG[categoria];

  // La red de expertos aún no existe: no hay backend ni un solo experto real.
  // Hasta que lo haya, esta sección no se pinta. Lo que se mostraba eran
  // despachos inventados con insignia de verificado y reseñas fabricadas, sin
  // aviso de que fueran ejemplos. Ver lib/networkFlag.ts.
  const todos = PUEDE_USAR_EJEMPLOS ? (EXPERTOS_MOCK[categoria] ?? []) : [];

  const patrocinados = todos.filter(e => e.es_patrocinado);
  const organicos    = todos.filter(e => !e.es_patrocinado).sort((a, b) => b.rating - a.rating);
  const visibles     = tab === 'patrocinados' ? patrocinados : organicos;

  // Sin red activa o sin expertos que mostrar, la sección desaparece. Un
  // apartado vacío de "expertos recomendados" promete algo que no hay.
  if (!NETWORK_ENABLED || todos.length === 0) return null;

  return (
    <section className="mt-10 no-print">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          {/* Divider decorativo */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent`} />
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${cfg.accentBg} border ${cfg.accentBorder}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${cfg.accentText} bg-current animate-pulse`} />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${cfg.accentText}`}>0 a 100 Network</span>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
          <h3 className="text-white font-extrabold text-xl leading-tight mb-1">{cfg.titulo}</h3>
          <p className="text-white/40 text-sm max-w-xl">{cfg.subtitulo}</p>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => setTab('patrocinados')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
            tab === 'patrocinados'
              ? `${cfg.accentBg} border ${cfg.accentBorder} ${cfg.accentText}`
              : 'text-white/40 hover:text-white/60 border border-transparent'
          }`}
        >
          <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Destacados ({patrocinados.length})
        </button>
        <button
          onClick={() => setTab('top')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
            tab === 'top'
              ? `${cfg.accentBg} border ${cfg.accentBorder} ${cfg.accentText}`
              : 'text-white/40 hover:text-white/60 border border-transparent'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Top por Reseñas ({organicos.length})
        </button>
      </div>

      {/* ── Grid de Tarjetas ────────────────────────────────────────────────── */}
      {visibles.length === 0 ? (
        <div className={`rounded-2xl border ${cfg.accentBorder} ${cfg.accentBg} p-8 text-center`}>
          <p className={`${cfg.accentText} font-bold mb-1`}>¡Sé el primero!</p>
          <p className="text-white/40 text-sm">Aún no hay expertos destacados en esta categoría.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map(experto => (
            <ExpertoCard key={experto.id} experto={experto} cfg={cfg} />
          ))}
        </div>
      )}

      {/* ── CTA Proveedor ─────────────────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-white/70 font-semibold text-sm">¿Eres experto en este rubro?</p>
          <p className="text-white/30 text-xs mt-0.5">Postúlate y llega a miles de emprendedores que necesitan tus servicios.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
        </div>
      </div>
    </section>
  );
}
