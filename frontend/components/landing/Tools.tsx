"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Plus, Minus, Users, Sparkles, Bell } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { ENTRADA_SEGURA, REVEAL_VIEWPORT } from "@/lib/motion/tokens";
import { SectionReveal, SectionRevealItem } from "@/components/motion/SectionReveal";

// ─── SVG Vector Icons Minimalistas (22px, trazo fino Apple) ──────────────────

const IconPOS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M3 10h18M7 14h3M14 14h3M9 18v3M15 18v3M6 21h12" />
  </svg>
);

const IconInventario = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10M16.5 5.25l-9 4" />
  </svg>
);

const IconCotizaciones = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />
  </svg>
);

const IconCRM = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" transform="translate(2 0)" />
    <circle cx="11" cy="7" r="4" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconCalendario = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 10h18M8 2v4M16 2v4" />
    <circle cx="8" cy="15" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="15" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const IconPersonal = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 21v-1.5A4.5 4.5 0 0 1 7.5 15h3A4.5 4.5 0 0 1 15 19.5V21" />
    <circle cx="17.5" cy="9.5" r="2.5" />
    <path d="M15.5 13.5h2a3.5 3.5 0 0 1 3.5 3.5V18" />
  </svg>
);

const IconContabilidad = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <rect x="2" y="3" width="20" height="18" rx="2" />
    <line x1="2" y1="9" x2="22" y2="9" />
    <line x1="2" y1="15" x2="22" y2="15" />
    <line x1="8" y1="9" x2="8" y2="21" />
    <line x1="16" y1="9" x2="16" y2="21" />
  </svg>
);

const IconMantenimientos = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

// ─── Tarjeta iPhone Sólida (Sin animación de mouse, fondo opaco #1C1C1E) ───────

interface AppleToolCardProps {
  icon: React.ReactNode;
  iconColor: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  /** Stagger index for scroll reveal delay */
  index?: number;
}

function AppleToolCard({
  icon,
  iconColor,
  eyebrow,
  title,
  description,
  children,
  index = 0,
}: AppleToolCardProps) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      {...ENTRADA_SEGURA}
      initial={shouldReduce ? false : { opacity: 0, scale: 0.7, y: 40, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      viewport={REVEAL_VIEWPORT}
      transition={{
        duration: 0.75,
        ease: [0.22, 1, 0.36, 1],
        delay: Math.min(index, 6) * 0.1,
      }}
      className="relative rounded-[26px] bg-[#1C1C1E] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:border-white/[0.14] overflow-hidden p-6 sm:p-7 lg:p-8 flex flex-col justify-between gap-5 sm:gap-6"
    >
      {/* Header Editorial */}
      <div>
        <div
          className="mb-3.5 flex items-center"
          style={{ color: iconColor }}
        >
          {icon}
        </div>

        <p className="text-[11px] sm:text-[12px] font-medium tracking-[0.08em] uppercase mb-1.5 font-sans" style={{ color: iconColor }}>
          {eyebrow}
        </p>

        <h3 className="text-xl sm:text-2xl font-bold text-white tracking-[-0.025em] leading-tight mb-2 font-sans">
          {title}
        </h3>

        <p className="text-[13px] sm:text-sm text-slate-300 leading-relaxed font-normal font-sans">
          {description}
        </p>
      </div>

      {/* Contenido / Métrica / Interacción */}
      <div className="pt-4 border-t border-white/[0.07]">
        {children}
      </div>
    </motion.div>
  );
}

// ─── 1. POS ───────────────────────────────────────────────────────────────────

function ToolPOSWidget() {
  const [qty, setQty] = useState(2);
  const unitPrice = 190;
  const total = qty * unitPrice;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3.5">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Ticket actual
          </div>
          <div className="text-3xl sm:text-4xl font-bold tracking-tight text-emerald-400 tabular-nums font-sans">
            ${total}
          </div>
        </div>

        {/* Stepper Apple */}
        <div className="flex items-center gap-2 h-[32px] px-2 rounded-full bg-white/[0.04] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setQty(Math.max(1, qty - 1))}
            className="w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.1] active:scale-95 transition-all cursor-pointer"
            aria-label="Disminuir cantidad"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="font-sans text-xs font-semibold text-white w-5 text-center tabular-nums">{qty}</span>
          <button
            type="button"
            onClick={() => setQty(qty + 1)}
            className="w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.1] active:scale-95 transition-all cursor-pointer"
            aria-label="Aumentar cantidad"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-[12px] text-slate-400 pt-2.5 border-t border-white/[0.04] font-sans">
        <span>Flujo sincronizado</span>
        <span className="text-emerald-400 font-medium">Auto-registrado en caja</span>
      </div>
    </div>
  );
}

// ─── 2. Inventario ────────────────────────────────────────────────────────────

function ToolInventarioWidget() {
  const [stock, setStock] = useState(84);
  const maxStock = 100;
  const pct = Math.round((stock / maxStock) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Stock disponible
          </div>
          <div className="text-3xl sm:text-4xl font-bold tracking-tight text-amber-400 tabular-nums font-sans">
            {stock} <span className="text-xs sm:text-sm font-normal text-slate-400">/ {maxStock} uds</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setStock(Math.min(100, stock + 5))}
          className="h-[30px] px-3 rounded-full text-[11px] font-medium text-amber-300 bg-amber-500/10 border border-amber-400/25 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer font-sans"
        >
          +5 Reabastecer
        </button>
      </div>

      <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden my-2.5">
        <div
          className="h-full bg-amber-400 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-[12px] text-slate-400 pt-2 border-t border-white/[0.04] font-sans">
        <span>Alerta de reposición</span>
        <span className="text-amber-300/90 font-medium">&gt;15 uds restante</span>
      </div>
    </div>
  );
}

// ─── 3. Cotizaciones ──────────────────────────────────────────────────────────

function ToolCotizacionesWidget() {
  const [currency, setCurrency] = useState<"MXN" | "USD">("MXN");

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3.5">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Presupuesto generado
          </div>
          <div className="text-3xl sm:text-4xl font-bold tracking-tight text-blue-400 tabular-nums font-sans">
            {currency === "MXN" ? "$14,500" : "$850"}
          </div>
        </div>

        {/* Currency Switch Apple Chips */}
        <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setCurrency("MXN")}
            className={`h-6 px-2.5 rounded-full text-[10px] font-medium transition-all cursor-pointer font-sans ${
              currency === "MXN" ? "bg-white text-[#070E17] font-semibold shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            MXN
          </button>
          <button
            type="button"
            onClick={() => setCurrency("USD")}
            className={`h-6 px-2.5 rounded-full text-[10px] font-medium transition-all cursor-pointer font-sans ${
              currency === "USD" ? "bg-white text-[#070E17] font-semibold shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            USD
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-[12px] text-slate-400 pt-2.5 border-t border-white/[0.04] font-sans">
        <span>Aprobación por WhatsApp</span>
        <span className="text-blue-300 font-medium">1-clic a venta</span>
      </div>
    </div>
  );
}

// ─── 4. CRM ───────────────────────────────────────────────────────────────────

function ToolCRMWidget() {
  return (
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Cliente recurrente
          </div>
          <div className="text-lg sm:text-xl font-semibold text-white tracking-tight font-sans">
            Sofía Ramírez
          </div>
        </div>

        <span className="h-[28px] px-2.5 rounded-full text-[11px] font-medium text-purple-300 bg-purple-500/10 border border-purple-400/25 flex items-center font-sans">
          Cliente VIP
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 py-1 text-[12px] sm:text-[13px] font-sans">
        <div>
          <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Historial</span>
          <span className="text-white font-medium">4 pedidos</span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Ticket acumulado</span>
          <span className="text-purple-300 font-bold font-sans tabular-nums">$3,120</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-[12px] text-slate-400 pt-2.5 border-t border-white/[0.04] font-sans">
        <span>Canal predilecto</span>
        <span className="text-purple-300 font-medium">WhatsApp directo</span>
      </div>
    </div>
  );
}

// ─── 5. Calendario, Google Sync & Fila Virtual ─────────────────────────────────

function ToolCalendarioWidget() {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3.5">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Agenda & Fila del Día
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-cyan-400 tabular-nums font-sans">
            3 <span className="text-xs sm:text-sm font-normal text-slate-400">citas</span> · 2 <span className="text-xs sm:text-sm font-normal text-slate-400">en fila</span>
          </div>
        </div>

        <span className="h-[28px] px-2.5 rounded-full text-[11px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-400/25 flex items-center font-sans">
          Google Sync
        </span>
      </div>

      <div className="space-y-1 py-1 text-[12px] sm:text-[13px] font-sans">
        <div className="flex items-center justify-between text-slate-300">
          <span>Sillón 1 · Cita 10:30</span>
          <span className="text-cyan-400 text-[11px] font-medium">Sincronizada</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Turno #04 · Sin cita</span>
          <span className="text-emerald-400 text-[11px] font-medium flex items-center gap-1">
            Llamado por WA
            <Check className="w-3 h-3" />
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-[12px] text-slate-400 pt-2.5 border-t border-white/[0.04] font-sans">
        <span>Gestión de lugares & walk-in</span>
        <span className="text-cyan-300 font-medium">Avisos por WhatsApp</span>
      </div>
    </div>
  );
}

// ─── 6. Contabilidad & P&L ───────────────────────────────────────────────────

function ToolContabilidadWidget() {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3.5">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Utilidad Neta (P&L)
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-400 tabular-nums font-sans">
            +48.2%
          </div>
        </div>
        <span className="h-[28px] px-2.5 rounded-full text-[11px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 flex items-center font-sans">
          Conciliación CSV
        </span>
      </div>

      <div className="space-y-1.5 py-1 text-[12px] sm:text-[13px] font-sans">
        <div className="flex items-center justify-between text-slate-300">
          <span>Ingresos verificados</span>
          <span className="text-white font-medium tabular-nums">$148,200 MXN</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Egresos & Costos fijos</span>
          <span className="text-slate-300 font-medium tabular-nums">$76,800 MXN</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-[12px] text-slate-400 pt-2.5 border-t border-white/[0.04] font-sans">
        <span>Estado de Resultados</span>
        <span className="text-emerald-300 font-medium">En tiempo real en SQL</span>
      </div>
    </div>
  );
}

// ─── 7. Mantenimientos Preventivos ───────────────────────────────────────────

function ToolMantenimientosWidget() {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3.5">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Salud de Equipos
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-400 tabular-nums font-sans">
            96% <span className="text-xs sm:text-sm font-normal text-slate-400">operativo</span>
          </div>
        </div>
        <span className="h-[28px] px-2.5 rounded-full text-[11px] font-medium text-amber-300 bg-amber-500/10 border border-amber-400/25 flex items-center font-sans">
          Semáforo Preventivo
        </span>
      </div>

      <div className="space-y-1.5 py-1 text-[12px] sm:text-[13px] font-sans">
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Horno industrial / Clima
          </span>
          <span className="text-slate-400 text-[11px]">Al día</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Vehículo de entrega
          </span>
          <span className="text-amber-400 text-[11px]">Toca en 6 días</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-[12px] text-slate-400 pt-2.5 border-t border-white/[0.04] font-sans">
        <span>Catálogo + IA Haiku</span>
        <span className="text-amber-300 font-medium">Cero paros imprevistos</span>
      </div>
    </div>
  );
}

// ─── 6. Personal & Nómina ─────────────────────────────────────────────────────

function ToolPersonalWidget() {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3.5">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Dispersión quincenal
          </div>
          <div className="text-3xl sm:text-4xl font-bold tracking-tight text-rose-400 tabular-nums font-sans">
            $22,400
          </div>
        </div>

        <span className="h-[28px] px-2.5 rounded-full text-[11px] font-medium text-rose-300 bg-rose-500/10 border border-rose-400/25 flex items-center font-sans">
          3 Colaboradores
        </span>
      </div>

      <div className="py-1 text-[12px] sm:text-[13px] text-slate-300 leading-snug font-sans">
        Sueldos base, comisiones por venta y retenciones de ley calculadas.
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-[12px] text-slate-400 pt-2.5 border-t border-white/[0.04] font-sans">
        <span>Impacto inmediato</span>
        <span className="text-rose-300 font-medium">Auto-anotado en Finanzas</span>
      </div>
    </div>
  );
}

// ─── Componente Principal Tools ───────────────────────────────────────────────

export default function Tools() {
  return (
    <section id="herramientas" className="py-24 md:py-32 px-4 sm:px-6 relative z-10 bg-transparent">
      <div className="max-w-[1240px] mx-auto relative z-10">

        {/* Encabezado Editorial Estilo Tesla */}
        <SectionReveal className="text-center mb-14 lg:mb-20">
          <SectionRevealItem as="h2" className="font-sans text-3xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-[-0.025em] text-white">
            Tu negocio completo en una sola pantalla
          </SectionRevealItem>
          <SectionRevealItem as="p" className="font-sans text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            Una vez validada tu idea, activa de inmediato tu terminal de cobro, almacén de insumos, citas con Google Calendar, mantenimiento de equipos y contabilidad en tiempo real.
          </SectionRevealItem>
        </SectionReveal>

        {/* ── BENTO REBALANCEADO DE 8 HERRAMIENTAS OPERATIVAS (Radius 26px, Sólido iPhone) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          <AppleToolCard
            index={0}
            icon={IconPOS}
            iconColor="#34D399"
            eyebrow="Operación en Mostrador"
            title="Punto de Venta"
            description="Vende con catálogo digital, emite tickets con folio oficial por WhatsApp y sincroniza cada cobro con tu balance."
          >
            <ToolPOSWidget />
          </AppleToolCard>

          <AppleToolCard
            index={1}
            icon={IconInventario}
            iconColor="#F59E0B"
            eyebrow="Control de Existencias"
            title="Inventario & Insumos"
            description="Supervisa existencias en vivo, deduce mermas, recibe alertas de stock crítico y protege pedidos con bloqueo pesimista."
          >
            <ToolInventarioWidget />
          </AppleToolCard>

          <AppleToolCard
            index={2}
            icon={IconCotizaciones}
            iconColor="#60A5FA"
            eyebrow="Presupuestos Oficiales"
            title="Cotizaciones"
            description="Genera cotizaciones ejecutivas con tu logotipo en segundos. Envíalas por enlace o PDF con conversión directa a venta."
          >
            <ToolCotizacionesWidget />
          </AppleToolCard>

          <AppleToolCard
            index={3}
            icon={IconContabilidad}
            iconColor="#10B981"
            eyebrow="Conciliación & P&L"
            title="Contabilidad Bancaria"
            description="Importa estados de cuenta en CSV, concilia movimientos y obtén tu Estado de Resultados (P&L) en tiempo real en SQL."
          >
            <ToolContabilidadWidget />
          </AppleToolCard>

          <AppleToolCard
            index={4}
            icon={IconCalendario}
            iconColor="#22D3EE"
            eyebrow="Google Sync & Walk-in"
            title="Citas & Fila Virtual"
            description="Sincroniza tus citas con Google Calendar, asigna sillones o mesas y gestiona la fila del día sin cita con aviso por WhatsApp."
          >
            <ToolCalendarioWidget />
          </AppleToolCard>

          <AppleToolCard
            index={5}
            icon={IconMantenimientos}
            iconColor="#FBBF24"
            eyebrow="Salud de Equipos"
            title="Mantenimiento"
            description="Semáforo preventivo para maquinaria, vehículos e instalaciones con catálogo de frecuencias de uso y sugerencias con IA."
          >
            <ToolMantenimientosWidget />
          </AppleToolCard>

          <AppleToolCard
            index={6}
            icon={IconCRM}
            iconColor="#A78BFA"
            eyebrow="Historial & Fidelización"
            title="Clientes & CRM"
            description="Consulta compras previas, notas de servicio y preferencias de cada cliente para reactivar ventas por WhatsApp."
          >
            <ToolCRMWidget />
          </AppleToolCard>

          <AppleToolCard
            index={7}
            icon={IconPersonal}
            iconColor="#FB7185"
            eyebrow="Sueldos & Comisiones"
            title="Personal & Nómina"
            description="Administra colaboradores, calcula salarios base y comisiones por venta. Cada dispersión impacta tus finanzas."
          >
            <ToolPersonalWidget />
          </AppleToolCard>
        </div>

        {/* ── CINTILLO DE INFRAESTRUCTURA Y CAPACIDADES EMPRESARIALES ── */}
        <div className="mt-8 rounded-[24px] border border-white/[0.08] bg-[#141416]/80 backdrop-blur-md p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white font-sans mb-1">Multi-Usuario & Roles</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Invita cajeros, recepcionistas, estilistas, almacenistas y gerentes con permisos granulares por producto y herramienta.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white font-sans mb-1">Marca Corporativa (White-Label)</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Tu logotipo, colores y datos fiscales oficiales impresos en tickets de venta POS, cotizaciones y reportes ejecutivos.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 text-emerald-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white font-sans mb-1">Centro de Alertas Inteligentes</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Alertas automáticas por stock bajo, cuentas por cobrar vencidas, mantenimientos preventivos y metas comerciales.
              </p>
            </div>
          </div>
        </div>

        {/* Enlace Explorador */}
        <div className="text-center mt-12 sm:mt-16">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full text-[13px] font-semibold tracking-wide text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-all cursor-pointer shadow-sm group"
          >
            <span>Explora las 8 herramientas operativas</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-1" />
          </Link>
        </div>

      </div>
    </section>
  );
}
