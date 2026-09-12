'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ─── Lucide-style inline SVG icons (sin dependencia externa) ──────────────────

const IconScale = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M16 3H8M12 3v18M9 6H4l2 7c0 1.1 1.34 2 3 2s3-.9 3-2l2-7h-5ZM20 6h-5l2 7c0 1.1 1.34 2 3 2s3-.9 3-2l-3-7Z"/>
    <path d="M3 21h18"/>
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 2L4 6v6c0 5.25 3.58 10.16 8 11.36C16.42 22.16 20 17.25 20 12V6l-8-4Z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
);
const IconBriefcase = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12v2M8 12h8"/>
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
    <path d="m5 12 4 4L19 7"/>
  </svg>
);
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
    <path d="m18 6-12 12M6 6l12 12"/>
  </svg>
);
const IconStar = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/>
  </svg>
);
const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);
const IconAlertTriangle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4M12 17h.01"/>
  </svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);
const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// ─── Datos del demo ───────────────────────────────────────────────────────────

const CHECKLIST = [
  { texto: 'RFC y alta ante SAT',                 ok: true },
  { texto: 'Contrato Laboral firmado',             ok: true },
  { texto: 'Aviso de Funcionamiento COFEPRIS',     ok: false },
  { texto: 'Licencia Municipal de Alcoholes',      ok: false },
  { texto: 'Alta Patronal IMSS del personal',      ok: false },
];

/**
 * Perfiles de la ilustración de la landing.
 *
 * NO son expertos: son el TIPO de profesional que la red conecta. Por eso
 * describen una especialidad y no llevan nombre de despacho, ni rating, ni
 * número de reseñas. La versión anterior de esta sección mostraba "García &
 * Asociados, 4.9, 63 reseñas, verificado" en la página pública, y cualquiera
 * podía intentar contratar a un despacho que no existe creyendo que la
 * plataforma lo había comprobado.
 *
 * El directorio real está en /network y lo sirve el backend.
 */
const PERFILES_ILUSTRATIVOS = [
  {
    id: 1,
    iniciales: 'DC',
    rol: 'Derecho corporativo',
    descripcion: 'Altas fiscales, contratos y cumplimiento con el consumidor',
    tags: ['SAT', 'PROFECO', 'Contratos'],
    destacado: true,
    icon: IconScale,
  },
  {
    id: 2,
    iniciales: 'LF',
    rol: 'Laboral y fiscal',
    descripcion: 'Alta patronal, nómina y auditorías',
    tags: ['IMSS', 'Nómina', 'Auditorías'],
    destacado: false,
    icon: IconShield,
  },
  {
    id: 3,
    iniciales: 'PI',
    rol: 'Propiedad intelectual',
    descripcion: 'Registro de marca y protección en comercio electrónico',
    tags: ['IMPI', 'Marcas', 'E-commerce'],
    destacado: false,
    icon: IconBriefcase,
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NetworkTeaser() {
  const [step, setStep] = useState<'analisis' | 'conectando' | 'expertos'>('analisis');
  const [expertosCount, setExpertosCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t0 = setTimeout(() => setMounted(true), 100);
    const t1 = setTimeout(() => setStep('conectando'), 2600);
    const t2 = setTimeout(() => setStep('expertos'), 3800);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (step !== 'expertos') return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setExpertosCount(i);
      if (i >= PERFILES_ILUSTRATIVOS.length) clearInterval(id);
    }, 320);
    return () => clearInterval(id);
  }, [step]);

  return (
    <section className="relative py-24 md:py-32 overflow-hidden border-t border-white/[0.05]">

      {/* ── Radial glow background (estilo 21st) ────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2"
          style={{
            width: '160vw', height: '160vh',
            background: 'radial-gradient(50% 50% at 50% 50%, oklch(0.45 0.18 270 / 0.18), transparent 70%), radial-gradient(35% 45% at 65% 50%, oklch(0.6 0.14 240 / 0.12), transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6">

        {/* ── Header (inspirado en tipografía 21st) ──────────────────────── */}
        <div className="max-w-2xl mb-14 md:mb-20">
          <div className="inline-flex items-center gap-2 mb-6 text-[13px] font-medium text-white/40 tracking-wide">
            <span className="w-4 h-px bg-violet-400/60" />
            0 a 100 Network — Nuevo
          </div>
          <h2
            className="text-[clamp(32px,4.5vw,52px)] font-medium leading-[1.08] tracking-[-0.022em] text-white mb-5"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            Tu análisis conecta{' '}
            <em className="not-italic text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">
              automáticamente
            </em>{' '}
            con el experto correcto.
          </h2>
          <p className="text-[17px] font-medium leading-[1.6] tracking-[-0.01em] text-white/40 max-w-[44ch]">
            Cada resultado de análisis incluye una red curada de abogados, agencias y proveedores —
            filtrados para tu industria, ordenados por reseñas reales.
          </p>
        </div>

        {/* ── Layout demo ─────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[1fr_1fr] gap-6 items-start max-w-5xl">

          {/* PANEL IZQUIERDO — Informe IA */}
          <div
            className="transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(12px)' }}
          >
            <div className="rounded-2xl bg-[#0d1821] border border-white/[0.07] overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_32px_80px_-16px_rgba(0,0,0,0.6)]">

              {/* Barra superior estilo OS */}
              <div className="flex items-center gap-2 px-4 h-10 border-b border-white/[0.05] bg-white/[0.015]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10 ring-1 ring-white/5" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10 ring-1 ring-white/5" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10 ring-1 ring-white/5" />
                </div>
                <span className="ml-3 text-[11px] font-medium text-white/25 font-mono">
                  Análisis Legal — Cafetería de Especialidad
                </span>
              </div>

              <div className="p-5 space-y-5">
                {/* Score */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
                      Cumplimiento Legal
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-amber-400">72 / 100</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-1000"
                      style={{ width: mounted ? '72%' : '0%' }}
                    />
                  </div>
                </div>

                {/* Alerta */}
                <div className="rounded-xl border border-red-500/[0.15] bg-red-500/[0.06] p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 flex-shrink-0 rounded-lg bg-red-500/15 border border-red-500/20 flex items-center justify-center text-red-400 mt-0.5">
                      <IconAlertTriangle />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-1">Acción requerida</p>
                      <p className="text-[13px] leading-relaxed text-white/55">
                        3 obligaciones críticas sin resolver: Aviso COFEPRIS, Licencia de Alcoholes e inscripción al IMSS.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Checklist */}
                <div className="space-y-2.5">
                  {CHECKLIST.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 ${
                        item.ok
                          ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/10 border border-red-500/20 text-red-400'
                      }`}>
                        {item.ok ? <IconCheck /> : <IconX />}
                      </div>
                      <span className={`text-[13px] leading-none ${item.ok ? 'text-white/30 line-through' : 'text-white/65'}`}>
                        {item.texto}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Divider animado */}
                <div className={`transition-all duration-500 pt-2 ${step !== 'analisis' ? 'opacity-100' : 'opacity-0'}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-semibold tracking-wider uppercase transition-all duration-500 ${
                      step === 'conectando'
                        ? 'border-violet-500/30 bg-violet-500/10 text-violet-300'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${step === 'conectando' ? 'bg-violet-400 animate-ping' : 'bg-emerald-400'}`} />
                      {step === 'conectando' ? 'Buscando expertos...' : `${PERFILES_ILUSTRATIVOS.length} expertos encontrados`}
                    </div>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PANEL DERECHO — Expertos */}
          <div className="space-y-3">

            {/* Label encabezado */}
            <div className={`flex flex-wrap items-center gap-2 mb-5 transition-all duration-500 ${step === 'expertos' ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-px h-5 bg-violet-500/40" />
              <p className="text-[13px] font-medium text-white/35">
                Especialidades que te conecta la red
              </p>
              {/* Dicho donde se ve, no en una nota al pie: esta columna es una
                  ilustración de cómo funciona, no gente contratable. */}
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 border border-white/10 rounded-full px-2 py-0.5">
                Ejemplo
              </span>
            </div>

            {PERFILES_ILUSTRATIVOS.map((experto, i) => {
              return (
                <div
                  key={experto.id}
                  className="transition-all duration-500"
                  style={{
                    opacity: expertosCount > i ? 1 : 0,
                    transform: expertosCount > i ? 'none' : 'translateX(16px)',
                  }}
                >
                  <div className={`group relative rounded-xl border bg-white/[0.025] p-4 hover:bg-white/[0.04] transition-all duration-200 hover:-translate-y-px ${
                    experto.destacado
                      ? 'border-amber-500/20 shadow-[0_0_0_1px_rgba(245,158,11,0.08)]'
                      : 'border-white/[0.06]'
                  }`}>

                    {/* Patrocinado tag */}
                    {experto.destacado && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        <IconStar />
                        Destacado
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      {/* Avatar con iniciales */}
                      <div className="flex-shrink-0">
                        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/15 border border-violet-500/20 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-violet-300">{experto.iniciales}</span>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 pr-8">
                        {/* Especialidad. Sin nombre de despacho y sin insignia de
                            verificado: aquí no hay nadie a quien verificar. */}
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[14px] font-semibold text-white leading-none">{experto.rol}</span>
                        </div>

                        <p className="text-[12px] text-white/35 mb-2.5">{experto.descripcion}</p>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {experto.tags.map(tag => (
                            <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.07] text-white/40">
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* Ni estrellas ni "(63)": un rating de adorno es el dato
                            que mas empuja a contratar, y aqui seria inventado. */}
                        <p className="text-[11px] text-white/25">
                          Perfil de ejemplo · el directorio real se llena con quienes pasan la revisión
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Más expertos */}
            <div
              className="transition-all duration-500"
              style={{
                opacity: expertosCount >= PERFILES_ILUSTRATIVOS.length ? 1 : 0,
                transform: expertosCount >= PERFILES_ILUSTRATIVOS.length ? 'none' : 'translateY(8px)',
              }}
            >
              {/* Antes decía "Ver 28 expertos más en tu área". No había 28, ni
                  uno. Ahora lleva al directorio, que enseña los que hay. */}
              <Link
                href="/network"
                className="group flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-white/[0.08] text-white/30 text-[13px] font-medium hover:border-violet-500/30 hover:text-violet-400 hover:bg-violet-500/[0.04] transition-all duration-200"
              >
                <IconPlus />
                Ver el directorio de expertos
              </Link>
            </div>
          </div>
        </div>

        {/* ── Stats + dual CTA ────────────────────────────────────────────── */}
        <div className="mt-20 md:mt-24 flex flex-col items-start gap-10">

          {/* Stats horizontales */}
          <div className="flex flex-wrap gap-10">
            {/*
              Aquí decía "150+ expertos verificados" cuando no había ninguno.
              Lo que queda son afirmaciones que se sostienen: las categorías
              existen, el alta es gratis, y toda ficha pasa por revisión manual.
            */}
            {[
              { valor: '3', label: 'Categorías', sub: 'legal, marketing y ventas' },
              { valor: 'Gratis', label: 'Presentar tu ficha', sub: 'sin tarjeta de crédito' },
              { valor: 'Manual', label: 'Revisión de cada ficha', sub: 'antes de publicarse' },
            ].map(stat => (
              <div key={stat.label} className="flex flex-col gap-1">
                <span className="text-[clamp(24px,3vw,36px)] font-semibold tracking-[-0.02em] text-white">
                  {stat.valor}
                </span>
                <span className="text-[14px] font-medium text-white/60 tracking-tight">{stat.label}</span>
                <span className="text-[12px] text-white/25">{stat.sub}</span>
              </div>
            ))}
          </div>

          {/* Dos CTAs en línea */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/network"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[14px] bg-white text-[#070E17] hover:bg-white/90 transition-all duration-200 shadow-[0_0_40px_rgba(255,255,255,0.08)] hover:shadow-[0_0_60px_rgba(255,255,255,0.15)]"
            >
              <IconUsers />
              Ver el directorio
              <IconArrowRight />
            </Link>
            <Link
              href="/network/registro"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[14px] border border-white/15 text-white/70 hover:bg-white/5 transition-all duration-200"
            >
              Soy experto, quiero presentarme
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
