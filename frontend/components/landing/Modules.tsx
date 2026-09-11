"use client";
import { type ReactElement } from "react";
import { Reveal } from "@/components/ui";

// ─── Mercado: Mini Street Map ─────────────────────────────────────────────────

function MercadoMap() {
  return (
    <div className="relative h-48 sm:h-56 rounded-2xl overflow-hidden border border-white/[0.08] bg-[#050B13] select-none shadow-inner group/map">
      {/* Street grid SVG */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 300 160"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* City blocks */}
        <rect x="0"   y="0"   width="92"  height="62" fill="#0A121D" />
        <rect x="100" y="0"   width="100" height="62" fill="#0A121D" />
        <rect x="208" y="0"   width="92"  height="62" fill="#0A121D" />
        <rect x="0"   y="70"  width="92"  height="90" fill="#0A121D" />
        <rect x="208" y="70"  width="92"  height="90" fill="#0A121D" />
        <rect x="100" y="70"  width="100" height="40" fill="#0A121D" />
        <rect x="100" y="118" width="100" height="42" fill="#0A121D" />
        {/* Streets */}
        <rect x="0"   y="62"  width="300" height="8"   fill="#0d2232" />
        <rect x="0"   y="110" width="300" height="8"   fill="#0d2232" />
        <rect x="92"  y="0"   width="8"   height="160" fill="#0d2232" />
        <rect x="200" y="0"   width="8"   height="160" fill="#0d2232" />
        {/* Building details */}
        <rect x="6"   y="6"   width="32"  height="24" fill="#0C1927" rx="3" />
        <rect x="6"   y="34"  width="52"  height="22" fill="#0C1927" rx="3" />
        <rect x="108" y="6"   width="44"  height="46" fill="#0C1927" rx="3" />
        <rect x="160" y="6"   width="28"  height="24" fill="#0C1927" rx="3" />
        <rect x="214" y="8"   width="62"  height="46" fill="#0C1927" rx="3" />
        <rect x="6"   y="78"  width="56"  height="66" fill="#0C1927" rx="3" />
        <rect x="68"  y="78"  width="18"  height="36" fill="#0C1927" rx="3" />
        <rect x="214" y="78"  width="70"  height="42" fill="#0C1927" rx="3" />
        <rect x="214" y="126" width="46"  height="28" fill="#0C1927" rx="3" />
      </svg>

      {/* Radar pulse circles around central location */}
      <div
        className="absolute pointer-events-none"
        style={{ left: "50%", top: "48%", transform: "translate(-50%,-50%)" }}
      >
        <div className="w-28 h-28 rounded-full border border-green-500/20 animate-ping" style={{ animationDuration: '3s' }} />
      </div>

      {/* Our location — center */}
      <div
        className="absolute z-10"
        style={{ left: "50%", top: "48%", transform: "translate(-50%,-50%)" }}
      >
        <div className="flex flex-col items-center gap-0.5">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-7 h-7 rounded-full bg-green-400/25 animate-pulse" />
            <div className="relative z-10 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-[#050B13] shadow-[0_0_12px_#4ade80]" />
          </div>
          <span className="text-[8px] font-black tracking-wider text-green-300 bg-green-400/15 border border-green-400/30 px-2 py-0.5 rounded-full shadow-sm">
            TU LOCAL
          </span>
        </div>
      </div>

      {/* Competitor pins */}
      <div className="absolute flex flex-col items-center" style={{ left: "14%", top: "12%" }}>
        <div className="w-2.5 h-2.5 rounded-full bg-red-400 shadow-[0_0_8px_#f87171]" />
        <p className="text-[7px] text-red-300 font-semibold mt-0.5 whitespace-nowrap bg-[#050B13]/80 px-1 rounded">Local A</p>
      </div>
      <div className="absolute flex flex-col items-center" style={{ right: "12%", top: "14%" }}>
        <div className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-[0_0_8px_#fb923c]" />
        <p className="text-[7px] text-orange-300 font-semibold mt-0.5 whitespace-nowrap bg-[#050B13]/80 px-1 rounded">Local B</p>
      </div>
      <div className="absolute flex flex-col items-center" style={{ left: "12%", bottom: "28%" }}>
        <div className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-[0_0_8px_#fb7185]" />
        <p className="text-[7px] text-rose-300 font-semibold mt-0.5 whitespace-nowrap bg-[#050B13]/80 px-1 rounded">Franquicia</p>
      </div>
      <div className="absolute flex flex-col items-center" style={{ right: "16%", bottom: "30%" }}>
        <div className="w-2 h-2 rounded-full bg-red-500/80" />
        <p className="text-[7px] text-red-300/80 font-semibold mt-0.5 whitespace-nowrap bg-[#050B13]/80 px-1 rounded">Local C</p>
      </div>

      {/* Top badges */}
      <div className="absolute top-2.5 left-2.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Score Viabilidad: 86/100
      </div>

      <div className="absolute top-2.5 right-2.5 text-[9px] font-bold text-white/60 bg-white/[0.06] border border-white/10 px-2.5 py-0.5 rounded-full backdrop-blur-sm">
        4 competidores en 1.5 km
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-0 inset-x-0 bg-[#050B13]/90 backdrop-blur-md border-t border-white/[0.06] px-3 py-1.5 flex items-center justify-between text-[8px] text-white/50">
        <span>Densidad: <strong className="text-emerald-400 font-bold">Baja / Oportunidad Alta</strong></span>
        <span>Google Maps Real-Time</span>
      </div>
    </div>
  );
}

// ─── Marketing: Mini Content Calendar ────────────────────────────────────────

type CType = "post" | "reel" | "story" | "promo" | "";

const CAL_DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const CAL_WEEKS: CType[][] = [
  ["post", "", "reel", "story", "post", "promo", ""],
  ["", "story", "post", "", "reel", "", "promo"],
];
const CAL_STYLE: Record<CType, string> = {
  post:  "bg-blue-500/80",
  reel:  "bg-violet-500/80",
  story: "bg-pink-500/80",
  promo: "bg-amber-400/80",
  "":    "bg-white/[0.04]",
};
const CAL_GLYPH: Record<CType, string> = {
  post: "P", reel: "R", story: "S", promo: "PR", "": "",
};
const CAL_LEGEND: CType[] = ["post", "reel", "story", "promo"];

function MarketingCalendar() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#050B13] p-4 select-none">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.06]">
        <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider">Plan de Lanzamiento</span>
        <span className="text-[10px] font-bold text-white/60 bg-pink-500/10 border border-pink-500/20 px-2.5 py-0.5 rounded-full">
          14 días listos
        </span>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {CAL_DAYS.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-bold text-white/30 uppercase">
            {d}
          </div>
        ))}
      </div>
      {/* Week rows */}
      {CAL_WEEKS.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1.5 mb-1.5">
          {week.map((type, di) => (
            <div
              key={di}
              className={`h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white/90 shadow-sm transition-transform hover:scale-105 ${CAL_STYLE[type]}`}
            >
              {CAL_GLYPH[type]}
            </div>
          ))}
        </div>
      ))}
      {/* Legend */}
      <div className="flex flex-wrap gap-2.5 mt-3 pt-2.5 border-t border-white/[0.04] justify-center">
        {CAL_LEGEND.map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-sm ${CAL_STYLE[t]}`} />
            <span className="text-[9px] text-white/50 font-medium capitalize">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ventas: Sales Strategy Tips & Insights ────────────────────────────────────────

const VENTAS_TIPS = [
  {
    Icon: (props: { className?: string }) => (
      <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    title: 'Segmentación',
    desc: '3 perfiles identificados',
  },
  {
    Icon: (props: { className?: string }) => (
      <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14a9 3 0 0 0 18 0V5" />
        <path d="M3 12a9 3 0 0 0 18 0" />
      </svg>
    ),
    title: 'Precios Dinámicos',
    desc: '+35% margen en picos',
  },
  {
    Icon: (props: { className?: string }) => (
      <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    title: 'Escalamiento',
    desc: 'Forecast mes a mes',
  },
  {
    Icon: (props: { className?: string }) => (
      <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Canales Cruzados',
    desc: 'Web, ML & B2B',
  },
];

function VentasList() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#050B13] p-4 space-y-3 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Estrategia Comercial</span>
        <span className="text-[10px] font-bold text-white/60 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
          4 Canales
        </span>
      </div>
      
      {/* Tips 2x2 grid */}
      <div className="grid grid-cols-2 gap-2">
        {VENTAS_TIPS.map((tip, idx) => (
          <div key={idx} className="p-2 rounded-xl bg-cyan-500/[0.05] border border-cyan-500/15 hover:border-cyan-500/30 transition-all">
            <div className="flex items-center gap-1.5">
              <tip.Icon className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
              <span className="text-[10px] font-bold text-cyan-300 truncate">{tip.title}</span>
            </div>
            <div className="text-[8px] text-white/40 mt-1 truncate">{tip.desc}</div>
          </div>
        ))}
      </div>
      
      {/* Revenue projection snippet */}
      <div className="pt-2 border-t border-white/[0.04]">
        <div className="flex items-center justify-between text-[9px] text-white/40 mb-1.5">
          <span>Proyección 6 Meses</span>
          <span className="text-cyan-400 font-bold">+525% crecimiento</span>
        </div>
        <div className="flex gap-1.5 items-end h-8">
          {[14, 22, 35, 52, 70, 95].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-cyan-500 to-cyan-400 rounded-t opacity-75 hover:opacity-100 transition-opacity"
              style={{ height: `${(h / 95) * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Finanzas: 12-month Projection Table ─────────────────────────────────────

const PROJ_ROWS = [
  { label: "Ingresos", values: ["$18k", "$32k", "$61k", "$128k"], cls: "text-white/70" },
  { label: "Costos",   values: ["$14k", "$22k", "$38k",  "$74k"], cls: "text-white/35" },
  { label: "Utilidad", values: ["$4k",  "$10k", "$23k",  "$54k"], cls: "text-emerald-400 font-bold" },
];

function FinanzasTable() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#050B13] overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.01]">
        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Flujo de Caja</span>
        <span className="text-[10px] font-bold text-white/60 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
          12 Meses
        </span>
      </div>

      {/* Column headers */}
      <div className="flex border-b border-white/[0.04] bg-white/[0.02]">
        <div className="w-[4.5rem] shrink-0 px-3 py-2" />
        {["Mes 1", "Mes 3", "Mes 6", "Mes 12"].map((h) => (
          <div
            key={h}
            className="flex-1 py-2 text-center text-[9px] font-bold text-white/30 uppercase tracking-wide"
          >
            {h}
          </div>
        ))}
      </div>
      {/* Data rows */}
      {PROJ_ROWS.map((row, i) => (
        <div
          key={i}
          className={`flex border-b border-white/[0.03] last:border-b-0 ${
            i === 2 ? "bg-emerald-500/[0.06]" : ""
          }`}
        >
          <div className="w-[4.5rem] shrink-0 px-3 py-2 text-[10px] text-white/40 font-medium">
            {row.label}
          </div>
          {row.values.map((v, vi) => (
            <div key={vi} className={`flex-1 py-2 text-center text-[10px] ${row.cls}`}>
              {v}
            </div>
          ))}
        </div>
      ))}
      {/* Trend footer */}
      <div className="px-4 py-2 flex items-center justify-between border-t border-white/[0.04] bg-white/[0.01]">
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3 h-3 text-emerald-400 shrink-0"
            fill="none"
            viewBox="0 0 16 16"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2,12 6,7 9,10 14,3" />
          </svg>
          <span className="text-[9px] text-emerald-400 font-semibold">
            Payback estimado: Mes 4
          </span>
        </div>
        <span className="text-[9px] text-white/40">+310% neto</span>
      </div>
    </div>
  );
}

// ─── Legal: Semáforo de cumplimiento ──────────────────────────────────────────

const LEGAL_ITEMS = [
  { label: 'Licencia municipal', nivel: 'rojo', pct: 0 },
  { label: 'RFC / Inscripción fiscal', nivel: 'rojo', pct: 0 },
  { label: 'IMSS como patrón', nivel: 'amarillo', pct: 40 },
  { label: 'Aviso de Privacidad', nivel: 'verde', pct: 100 },
  { label: 'Contrato de trabajo', nivel: 'amarillo', pct: 60 },
];

const NIVEL_DOT: Record<string, string> = {
  rojo: 'bg-red-400 shadow-[0_0_6px_#f87171]',
  amarillo: 'bg-amber-400 shadow-[0_0_6px_#fbbf24]',
  verde: 'bg-emerald-400 shadow-[0_0_6px_#34d399]',
};
const NIVEL_BAR: Record<string, string> = {
  rojo: 'bg-red-400',
  amarillo: 'bg-amber-400',
  verde: 'bg-emerald-400',
};

function LegalSemaforo() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#050B13] p-4 space-y-2.5 select-none">
      {/* Mini semáforo global */}
      <div className="flex items-center gap-2 pb-2.5 border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          {['rojo', 'amarillo', 'verde'].map((n) => (
            <div
              key={n}
              className={`w-2 h-2 rounded-full ${NIVEL_DOT[n]} ${
                n === 'amarillo' ? 'scale-110 ring-2 ring-amber-400/20' : 'opacity-40'
              }`}
            />
          ))}
        </div>
        <span className="text-[10px] font-bold text-amber-300/80 uppercase tracking-wider">Cumplimiento Inicial</span>
        <span className="ml-auto text-[10px] font-bold text-white/60 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full">
          52%
        </span>
      </div>
      {/* Checklist items */}
      <div className="space-y-1.5">
        {LEGAL_ITEMS.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${NIVEL_DOT[item.nivel]}`} />
              <span className="text-[9px] text-white/60 flex-1 truncate">{item.label}</span>
              <span className={`text-[9px] font-bold ${
                item.nivel === 'rojo' ? 'text-red-400' : item.nivel === 'amarillo' ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {item.pct}%
              </span>
            </div>
            <div className="ml-3.5 h-1 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${NIVEL_BAR[item.nivel]}`}
                style={{ width: `${item.pct || 4}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Visual lookup map ────────────────────────────────────────────────────────

const MODULE_VISUALS: { [key: string]: ReactElement } = {
  Mercado:   <MercadoMap />,
  Marketing: <MarketingCalendar />,
  Ventas:    <VentasList />,
  Finanzas:  <FinanzasTable />,
  Legal:     <LegalSemaforo />,
};

import { DEFAULT_MODULES, type HeroModule } from "./Hero";

const MODULE_ACCENTS: Record<string, { hex: string; gradient: string; glow: string; badge: string }> = {
  Mercado: {
    hex: "#3B82F6",
    gradient: "from-blue-500/20 via-cyan-500/10 to-transparent",
    glow: "rgba(59, 130, 246, 0.15)",
    badge: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  Marketing: {
    hex: "#EC4899",
    gradient: "from-pink-500/20 via-rose-500/10 to-transparent",
    glow: "rgba(236, 72, 153, 0.15)",
    badge: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  },
  Ventas: {
    hex: "#06B6D4",
    gradient: "from-cyan-500/20 via-blue-500/10 to-transparent",
    glow: "rgba(6, 182, 212, 0.15)",
    badge: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  },
  Finanzas: {
    hex: "#10B981",
    gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
    glow: "rgba(16, 185, 129, 0.15)",
    badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  Legal: {
    hex: "#8B5CF6",
    gradient: "from-purple-500/20 via-indigo-500/10 to-transparent",
    glow: "rgba(139, 92, 246, 0.15)",
    badge: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Modules({ modules: initialModules = [] }: { modules?: HeroModule[] }) {
  // Guarantee 5 modules
  const allModules = initialModules && initialModules.length >= 5 ? initialModules : DEFAULT_MODULES;
  const heroModule = allModules.find((m) => m.title === "Mercado") || allModules[0];
  const gridModules = allModules.filter((m) => m !== heroModule);

  return (
    <section className="py-24 px-6 relative z-10 bg-[#070E17]">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-[1200px] mx-auto relative z-10">

        {/* Section Header */}
        <div className="text-center mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/10 text-brand-accent text-sm font-bold tracking-wide mb-6 shadow-sm">
            <svg className="w-4 h-4 text-brand-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
            </svg>
            Radiografía completa de tu idea
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight text-white">
            Todo lo que necesitas saber<br />
            <span className="text-white/40">antes de invertir un peso.</span>
          </h2>
          <p className="text-base md:text-lg text-white/50 max-w-2xl mx-auto font-light leading-relaxed">
            Cinco modelos de IA corren en paralelo y te entregan en minutos lo que una consultora
            tardaría semanas. Sin suposiciones. Con datos del mercado real.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          
          {/* ── 1. Hero Bento Card (Mercado - Full Width) ── */}
          {heroModule && (
            <Reveal className="md:col-span-2 relative rounded-surface bg-[#09111D]/90 border border-white/[0.08] p-7 sm:p-9 lg:p-10 hover:border-white/15 transition-all duration-500 group overflow-hidden shadow-floating backdrop-blur-md">
              {/* Accent top line */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
              
              {/* Hover radial glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                style={{
                  background: "radial-gradient(120% 120% at 50% 0%, rgba(59, 130, 246, 0.12), transparent 70%)",
                }}
              />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Left side info */}
                <div className="lg:col-span-6 xl:col-span-7 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-500/20 border border-white/10 shadow-inner group-hover:scale-105 transition-transform duration-300">
                        <span className="w-6 h-6 block text-blue-400">{heroModule.icon}</span>
                      </div>
                      <span className="text-[11px] font-bold tracking-wider uppercase px-3 py-1 rounded-full text-blue-400 bg-blue-500/10 border border-blue-500/20">
                        Módulo Principal • Radar de Demanda
                      </span>
                    </div>

                    <div>
                      <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                        {heroModule.title}
                      </h3>
                      <p className="text-sm sm:text-base text-white/60 leading-relaxed font-light mt-2 max-w-xl">
                        {heroModule.desc}
                      </p>
                    </div>
                  </div>

                  {/* Feature Pills */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                      <span className="text-xs text-white/70 font-medium">Score predictivo 0-100</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_#60a5fa]" />
                      <span className="text-xs text-white/70 font-medium">Competencia Google Maps</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                      <span className="text-xs text-white/70 font-medium">Cálculo TAM / SAM / SOM</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_#c084fc]" />
                      <span className="text-xs text-white/70 font-medium">Semáforo territorial</span>
                    </div>
                  </div>
                </div>

                {/* Right side visual: Map */}
                <div className="lg:col-span-6 xl:col-span-5">
                  {MODULE_VISUALS[heroModule.title] ?? <MercadoMap />}
                </div>
              </div>
            </Reveal>
          )}

          {/* ── 2. Grid Cards (2x2: Marketing, Ventas, Finanzas, Legal) ── */}
          {gridModules.map((m, i) => {
            const accent = MODULE_ACCENTS[m.title] || {
              hex: "#3B82F6",
              gradient: "from-white/10 to-transparent",
              glow: "rgba(255,255,255,0.05)",
              badge: "text-white/60 bg-white/5 border-white/10",
            };

            return (
              <Reveal
                key={m.title}
                index={i + 1}
                className="md:col-span-1 relative rounded-surface bg-[#09111D]/90 border border-white/[0.08] p-7 sm:p-8 hover:border-white/15 transition-all duration-500 group overflow-hidden shadow-floating backdrop-blur-md flex flex-col justify-between"
              >
                {/* Accent top line */}
                <div
                  className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  style={{
                    backgroundImage: `linear-gradient(to right, transparent, ${accent.hex}60, transparent)`,
                  }}
                />

                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                  style={{
                    background: `radial-gradient(100% 100% at 80% 0%, ${accent.glow}, transparent 70%)`,
                  }}
                />

                <div className="relative z-10 flex flex-col h-full justify-between gap-6">
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center ${m.light || 'bg-white/5'} border border-white/10 shadow-inner group-hover:scale-105 transition-transform duration-300`}
                      >
                        <span className={`w-6 h-6 block ${m.text || 'text-white'}`}>{m.icon}</span>
                      </div>
                      <span className={`text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full ${accent.badge}`}>
                        {m.title === 'Marketing' && 'Estrategia 14 días'}
                        {m.title === 'Ventas' && 'Forecast & Canales'}
                        {m.title === 'Finanzas' && 'Punto de Equilibrio'}
                        {m.title === 'Legal' && 'Cumplimiento Normativo'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{m.title}</h3>
                      <p className="text-sm text-white/50 leading-relaxed font-light mt-1.5 line-clamp-3">
                        {m.desc}
                      </p>
                    </div>
                  </div>

                  {/* Module-specific visual */}
                  <div className="pt-2">
                    {MODULE_VISUALS[m.title] ?? null}
                  </div>
                </div>
              </Reveal>
            );
          })}

        </div>
      </div>
    </section>
  );
}
