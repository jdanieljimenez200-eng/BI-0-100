"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Plus,
  Minus,
  Users,
  Sparkles,
  Bell,
  LayoutList,
  LayoutGrid,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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

// ─── 4. Contabilidad & P&L ───────────────────────────────────────────────────

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

// ─── 6. Mantenimientos Preventivos ───────────────────────────────────────────

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

// ─── 7. CRM ───────────────────────────────────────────────────────────────────

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

// ─── 8. Personal & Nómina ─────────────────────────────────────────────────────

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

// ─── Definición Maestra de las 8 Herramientas ─────────────────────────────────

interface ToolItem {
  id: string;
  name: string;
  eyebrow: string;
  icon: React.ReactNode;
  color: string;
  tag: string;
  shortDesc: string;
  fullDesc: string;
  benefits: string[];
  widget: React.ReactNode;
}

const TOOLS_DATA: ToolItem[] = [
  {
    id: "pos",
    name: "Punto de Venta",
    eyebrow: "Operación en Mostrador",
    icon: IconPOS,
    color: "#34D399",
    tag: "Tickets & Cobros",
    shortDesc: "Vende con catálogo digital, emite tickets con folio por WhatsApp y sincroniza cada cobro con tu balance.",
    fullDesc: "Agiliza la atención en mostrador con un catálogo digital instantáneo. Genera y envía tickets con folio oficial vía WhatsApp, recibe pagos combinados y realiza cortes de caja Z sin desajustes.",
    benefits: [
      "Tickets digitales oficiales vía WhatsApp con folio único",
      "Corte de caja Z automático y balance en tiempo real",
      "Soporta lector de código de barras y cobros mixtos",
      "Sincronización multi-caja y multi-usuario instantánea",
    ],
    widget: <ToolPOSWidget />,
  },
  {
    id: "inventario",
    name: "Inventario & Insumos",
    eyebrow: "Control de Existencias",
    icon: IconInventario,
    color: "#F59E0B",
    tag: "Stock en Vivo",
    shortDesc: "Supervisa existencias en vivo, deduce mermas, recibe alertas de stock crítico y protege pedidos con bloqueo pesimista.",
    fullDesc: "Control estricto de mercancía e insumos. Cada venta descuenta piezas o recetas en tiempo real, bloqueando pedidos simultáneos con bloqueo pesimista y alertando antes de que se agote cualquier producto.",
    benefits: [
      "Bloqueo pesimista para evitar sobreventas concurrentes",
      "Alertas automáticas de reposición configurables por producto",
      "Deducción inteligente de insumos y recetas por venta",
      "Historial de mermas y auditoría de entradas de almacén",
    ],
    widget: <ToolInventarioWidget />,
  },
  {
    id: "cotizaciones",
    name: "Cotizaciones Oficiales",
    eyebrow: "Presupuestos & Cierres",
    icon: IconCotizaciones,
    color: "#60A5FA",
    tag: "PDF & WhatsApp",
    shortDesc: "Genera presupuestos ejecutivos con tu logotipo en segundos. Envíalas por enlace o PDF con conversión directa a venta.",
    fullDesc: "Emite cotizaciones profesionales con la identidad gráfica de tu marca. Conmutación instantánea entre monedas (MXN/USD) y un botón de aprobación directa que convierte la cotización en venta cobrada en 1 clic.",
    benefits: [
      "Presupuestos en PDF y enlace compartible por WhatsApp",
      "Multimoneda en tiempo real (pesos mexicanos y dólares)",
      "Conversión directa de presupuesto a venta en un solo clic",
      "Personalización completa con tu logo y datos fiscales",
    ],
    widget: <ToolCotizacionesWidget />,
  },
  {
    id: "contabilidad",
    name: "Contabilidad Bancaria & P&L",
    eyebrow: "Conciliación en SQL",
    icon: IconContabilidad,
    color: "#10B981",
    tag: "P&L en Tiempo Real",
    shortDesc: "Importa estados de cuenta en CSV, concilia movimientos y obtén tu Estado de Resultados (P&L) en tiempo real en SQL.",
    fullDesc: "Olvídate de las hojas de cálculo desactualizadas. Importa extractos bancarios en CSV, concilia ingresos contra egresos automáticamente y visualiza tu Estado de Resultados (P&L) con margen neto en tiempo real.",
    benefits: [
      "Importación masiva de estados de cuenta bancarios en CSV",
      "Estado de Resultados (P&L) y margen neto recalculado al segundo",
      "Cálculo automático de punto de equilibrio y costos fijos",
      "Conciliación bancaria sin fricción en base de datos SQL",
    ],
    widget: <ToolContabilidadWidget />,
  },
  {
    id: "citas",
    name: "Citas & Fila Virtual",
    eyebrow: "Google Sync & Walk-in",
    icon: IconCalendario,
    color: "#22D3EE",
    tag: "Google Sync & WA",
    shortDesc: "Sincroniza tus citas con Google Calendar, asigna sillones o mesas y gestiona la fila del día sin cita con aviso por WhatsApp.",
    fullDesc: "Diseñado para barberías, spas, consultorios, restaurantes y servicios. Conecta tu agenda con Google Calendar en tiempo real y gestiona a clientes espontáneos en una fila virtual que les avisa a su WhatsApp cuando su turno está listo.",
    benefits: [
      "Sincronización bidireccional inmediata con Google Calendar",
      "Fila virtual del día: tus clientes esperan sin hacer fila física",
      "Notificación automática al WhatsApp del cliente al llegar su turno",
      "Asignación de sillones, cabinas, mesas y recursos por horario",
    ],
    widget: <ToolCalendarioWidget />,
  },
  {
    id: "mantenimientos",
    name: "Mantenimiento Preventivo",
    eyebrow: "Salud de Equipos",
    icon: IconMantenimientos,
    color: "#FBBF24",
    tag: "Semáforo IA",
    shortDesc: "Semáforo preventivo para maquinaria, vehículos e instalaciones con catálogo de frecuencias de uso y sugerencias con IA.",
    fullDesc: "Evita pérdidas por paros operativos imprevistos. Monitorea el estado de hornos, cafeteras, vehículos e infraestructura con un semáforo predictivo apoyado por IA Haiku que anticipa revisiones según uso real.",
    benefits: [
      "Semáforo predictivo de maquinaria y equipos en tiempo real",
      "Fichas técnicas y calendarios sugeridos con IA Haiku",
      "Registro de costos de mantenimiento e historial por máquina",
      "Alertas antes de fallas críticas para cero tiempos muertos",
    ],
    widget: <ToolMantenimientosWidget />,
  },
  {
    id: "crm",
    name: "Clientes & CRM",
    eyebrow: "Historial & Fidelización",
    icon: IconCRM,
    color: "#A78BFA",
    tag: "Clientes VIP",
    shortDesc: "Consulta compras previas, notas de servicio y preferencias de cada cliente para reactivar ventas por WhatsApp.",
    fullDesc: "Convierte compradores de una sola vez en clientes habituales. Conoce el ticket acumulado, frecuencia de visita y preferencias particulares de cada persona para lanzar campañas de reactivación directa por WhatsApp.",
    benefits: [
      "Perfil comercial con compras acumuladas y frecuencia de visita",
      "Identificación automática de clientes VIP y compradores en riesgo",
      "Notas privadas de servicio y preferencias por cliente",
      "Envío de promociones y seguimiento directo por WhatsApp",
    ],
    widget: <ToolCRMWidget />,
  },
  {
    id: "nomina",
    name: "Personal & Nómina",
    eyebrow: "Sueldos & Comisiones",
    icon: IconPersonal,
    color: "#FB7185",
    tag: "Nómina & Roles",
    shortDesc: "Administra colaboradores, calcula salarios base y comisiones por venta. Cada dispersión impacta tus finanzas.",
    fullDesc: "Gestiona tu equipo de trabajo con claridad absoluta. Asigna comisiones automáticas sobre ventas realizadas, calcula la dispersión quincenal de sueldos y descuenta los pagos automáticamente del flujo de caja.",
    benefits: [
      "Cálculo automatizado de comisiones por cajero o especialista",
      "Dispersión quincenal ligada al Estado de Resultados contable",
      "Control de permisos por colaborador (cajero, estilista, gerente)",
      "Historial de pagos, bonos y retenciones de nómina",
    ],
    widget: <ToolPersonalWidget />,
  },
];

// ─── Tarjeta Bento para Cuadrícula Jerárquica ─────────────────────────────────

interface AppleBentoCardProps {
  tool: ToolItem;
  isWide?: boolean;
  index?: number;
}

function AppleBentoCard({ tool, isWide = false, index = 0 }: AppleBentoCardProps) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      {...ENTRADA_SEGURA}
      initial={shouldReduce ? false : { opacity: 0, scale: 0.9, y: 30, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      viewport={REVEAL_VIEWPORT}
      transition={{
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
        delay: Math.min(index, 6) * 0.08,
      }}
      className={`relative rounded-[26px] bg-[#1C1C1E] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:border-white/[0.14] overflow-hidden p-6 sm:p-7 flex flex-col justify-between gap-5 transition-colors duration-200 ${
        isWide ? "md:col-span-2" : "col-span-1"
      }`}
    >
      {isWide ? (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center h-full">
          <div className="sm:col-span-6 flex flex-col justify-between">
            <div>
              <div className="mb-3 flex items-center" style={{ color: tool.color }}>
                {tool.icon}
              </div>
              <p className="text-[11px] sm:text-[12px] font-medium tracking-[0.08em] uppercase mb-1.5 font-sans" style={{ color: tool.color }}>
                {tool.eyebrow}
              </p>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-[-0.025em] leading-tight mb-2 font-sans">
                {tool.name}
              </h3>
              <p className="text-[13px] sm:text-sm text-slate-300 leading-relaxed font-normal font-sans mb-4 sm:mb-0">
                {tool.shortDesc}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 mt-4 text-[11px] font-sans text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tool.color }} />
              <span>{tool.tag}</span>
            </div>
          </div>
          <div className="sm:col-span-6 sm:border-l sm:border-white/[0.07] sm:pl-5 pt-4 sm:pt-0 border-t border-white/[0.07] sm:border-t-0">
            {tool.widget}
          </div>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-3.5 flex items-center" style={{ color: tool.color }}>
              {tool.icon}
            </div>
            <p className="text-[11px] sm:text-[12px] font-medium tracking-[0.08em] uppercase mb-1.5 font-sans" style={{ color: tool.color }}>
              {tool.eyebrow}
            </p>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-[-0.025em] leading-tight mb-2 font-sans">
              {tool.name}
            </h3>
            <p className="text-[13px] sm:text-sm text-slate-300 leading-relaxed font-normal font-sans">
              {tool.shortDesc}
            </p>
          </div>
          <div className="pt-4 border-t border-white/[0.07]">
            {tool.widget}
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── Componente Principal Tools ───────────────────────────────────────────────

export default function Tools() {
  const [viewMode, setViewMode] = useState<"list" | "bento">("list");
  const [activeToolId, setActiveToolId] = useState<number>(0);
  const currentTool = TOOLS_DATA[activeToolId] ?? TOOLS_DATA[0];

  return (
    <section id="herramientas" className="py-24 md:py-32 px-4 sm:px-6 relative z-10 bg-transparent">
      <div className="max-w-[1240px] mx-auto relative z-10">

        {/* Encabezado Editorial Estilo Tesla */}
        <SectionReveal className="text-center mb-10 lg:mb-14">
          <SectionRevealItem as="h2" className="font-sans text-3xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-[-0.025em] text-white">
            Tu negocio completo en una sola pantalla
          </SectionRevealItem>
          <SectionRevealItem as="p" className="font-sans text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            Una vez validada tu idea, activa de inmediato tu terminal de cobro, almacén de insumos, citas con Google Calendar, mantenimiento de equipos y contabilidad en tiempo real.
          </SectionRevealItem>
        </SectionReveal>

        {/* Conmutador de Vistas: Lista Interactiva / Cuadrícula Bento */}
        <div className="flex items-center justify-center mb-10">
          <div className="flex items-center p-1 rounded-full bg-[#1C1C1E] border border-white/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.3)]">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-sans font-medium transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-[#070E17] font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Lista Interactiva</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("bento")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-sans font-medium transition-all cursor-pointer ${
                viewMode === "bento"
                  ? "bg-white text-[#070E17] font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cuadrícula Bento</span>
            </button>
          </div>
        </div>

        {/* ── MODO 1: LISTA INTERACTIVA CON CONSOLA EN VIVO ── */}
        {viewMode === "list" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Columna Izquierda: Lista interactiva de las 8 herramientas */}
            <div className="lg:col-span-5 flex flex-col gap-2.5">
              {TOOLS_DATA.map((tool, idx) => {
                const isActive = activeToolId === idx;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setActiveToolId(idx)}
                    className={`w-full text-left p-3.5 sm:p-4 rounded-2xl transition-all duration-200 flex items-center justify-between gap-3 border cursor-pointer ${
                      isActive
                        ? "bg-[#222329] border-cyan-400/40 shadow-[0_4px_20px_rgba(0,0,0,0.35)] ring-1 ring-cyan-400/20"
                        : "bg-[#1C1C1E] border-white/[0.06] hover:bg-[#202024] hover:border-white/[0.12]"
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform"
                        style={{
                          backgroundColor: `${tool.color}15`,
                          color: tool.color,
                          border: `1px solid ${tool.color}30`,
                        }}
                      >
                        {tool.icon}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[11px] font-sans font-medium uppercase tracking-wider"
                            style={{ color: tool.color }}
                          >
                            {tool.eyebrow}
                          </span>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                          )}
                        </div>
                        <h4 className="text-sm sm:text-[15px] font-bold text-white font-sans truncate">
                          {tool.name}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:inline-block text-[11px] text-slate-400 font-sans px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
                        {tool.tag}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 transition-transform duration-150 ${
                          isActive ? "text-cyan-400 translate-x-0.5" : "text-slate-500"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Columna Derecha: Consola Operativa en Vivo de la Herramienta Seleccionada */}
            <div className="lg:col-span-7">
              <div className="relative rounded-[28px] bg-[#1C1C1E] border border-white/[0.1] p-6 sm:p-8 lg:p-9 shadow-[0_8px_32px_rgba(0,0,0,0.45)] flex flex-col justify-between h-full min-h-[540px] overflow-hidden">
                {/* Glow ambiental con color dinámico */}
                <div
                  className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-[110px] opacity-20 pointer-events-none transition-colors duration-500"
                  style={{ backgroundColor: currentTool.color }}
                />

                <div className="relative z-10">
                  {/* Encabezado Superior */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: `${currentTool.color}18`,
                          color: currentTool.color,
                          border: `1px solid ${currentTool.color}35`,
                        }}
                      >
                        {currentTool.icon}
                      </div>
                      <div>
                        <span
                          className="text-xs font-semibold uppercase tracking-wider block font-sans"
                          style={{ color: currentTool.color }}
                        >
                          {currentTool.eyebrow}
                        </span>
                        <span className="text-[11px] text-slate-400 font-sans">
                          Herramienta Operativa #{activeToolId + 1} de 8
                        </span>
                      </div>
                    </div>

                    <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Operacional en vivo</span>
                    </span>
                  </div>

                  <h3 className="text-2xl sm:text-3xl font-bold text-white font-sans tracking-tight mb-3">
                    {currentTool.name}
                  </h3>

                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-sans mb-6">
                    {currentTool.fullDesc}
                  </p>

                  {/* Widget Interactivo en primer plano */}
                  <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm mb-6 shadow-inner">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentTool.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        {currentTool.widget}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Ventajas operativas integradas */}
                  <div className="space-y-2 mb-6 pt-4 border-t border-white/[0.06]">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 font-sans">
                      Capacidades Clave
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {currentTool.benefits.map((b) => (
                        <div key={b} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-200 font-sans">
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{
                              backgroundColor: `${currentTool.color}20`,
                              color: currentTool.color,
                              border: `1px solid ${currentTool.color}40`,
                            }}
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                          <span className="leading-tight">{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer de la tarjeta con CTA rápido */}
                <div className="relative z-10 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-slate-400 font-sans">
                    Incluida a prueba en el plan Freemium ($0) y completa en planes de pago.
                  </span>
                  <Link
                    href="/auth/signup"
                    className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-full text-xs font-sans font-semibold text-white bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.14] transition-all cursor-pointer group/link self-start sm:self-auto"
                  >
                    <span>Probar en mi negocio</span>
                    <ArrowRight className="w-3 h-3 transition-transform group-hover/link:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODO 2: CUADRÍCULA BENTO ASIMÉTRICA CON TAMAÑOS JERÁRQUICOS ── */}
        {viewMode === "bento" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 items-stretch">
            {/* Fila 1: POS (2 cols panorámica) + Inventario (1 col) + Cotizaciones (1 col) */}
            <AppleBentoCard tool={TOOLS_DATA[0]} isWide={true} index={0} />
            <AppleBentoCard tool={TOOLS_DATA[1]} isWide={false} index={1} />
            <AppleBentoCard tool={TOOLS_DATA[2]} isWide={false} index={2} />

            {/* Fila 2: Contabilidad P&L (2 cols panorámica) + Citas & Fila (2 cols panorámica) */}
            <AppleBentoCard tool={TOOLS_DATA[3]} isWide={true} index={3} />
            <AppleBentoCard tool={TOOLS_DATA[4]} isWide={true} index={4} />

            {/* Fila 3: Mantenimiento (1 col) + Clientes CRM (1 col) + Nómina (2 cols panorámica) */}
            <AppleBentoCard tool={TOOLS_DATA[5]} isWide={false} index={5} />
            <AppleBentoCard tool={TOOLS_DATA[6]} isWide={false} index={6} />
            <AppleBentoCard tool={TOOLS_DATA[7]} isWide={true} index={7} />
          </div>
        )}

        {/* ── CINTILLO DE INFRAESTRUCTURA Y CAPACIDADES EMPRESARIALES ── */}
        <div className="mt-10 rounded-[24px] border border-white/[0.08] bg-[#141416]/80 backdrop-blur-md p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
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
