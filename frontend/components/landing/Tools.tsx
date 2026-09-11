"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/ui";

// ─── Icons (SVG, sin emojis) ───────────────────────────────────────────────────

const IconPOS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M3 10h18M7 14h3M14 14h3M9 18v3M15 18v3M6 21h12" />
  </svg>
);
const IconInventario = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10M16.5 5.25l-9 4" />
  </svg>
);
const IconCotizaciones = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />
  </svg>
);
const IconCRM = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" transform="translate(2 0)" />
    <circle cx="11" cy="7" r="4" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconCalendario = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 10h18M8 2v4M16 2v4" />
    <circle cx="8" cy="15" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="15" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
const IconPersonal = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 21v-1.5A4.5 4.5 0 0 1 7.5 15h3A4.5 4.5 0 0 1 15 19.5V21" />
    <circle cx="17.5" cy="9.5" r="2.5" />
    <path d="M15.5 13.5h2a3.5 3.5 0 0 1 3.5 3.5V18" />
  </svg>
);

// ─── Micro Widgets for each Tool ──────────────────────────────────────────────

function ToolPOSWidget() {
  return (
    <div className="mt-2 rounded-2xl border border-white/[0.06] bg-[#060C14] p-3.5 select-none font-sans">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-[10px] text-white/40">
        <span className="font-mono font-semibold">TICKET DIGITAL #1042</span>
        <span className="text-emerald-400 font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Cobrado
        </span>
      </div>
      <div className="py-2.5 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-white">2x Venta Mostrador</div>
          <div className="text-[10px] text-white/40">Ticket digital por WhatsApp</div>
        </div>
        <div className="text-sm font-black text-emerald-300 font-mono">$380.00 MXN</div>
      </div>
      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] text-white/40">
        <span>Sincronizado a Finanzas</span>
        <span className="text-emerald-400/80 font-semibold">Flujo de caja +$380</span>
      </div>
    </div>
  );
}

function ToolInventarioWidget() {
  return (
    <div className="mt-2 rounded-2xl border border-white/[0.06] bg-[#060C14] p-3.5 select-none font-sans">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-[10px] text-white/40">
        <span className="font-semibold text-white/60">Stock en tiempo real</span>
        <span className="text-amber-300 font-bold">84 / 100 uds</span>
      </div>
      <div className="py-2">
        <div className="flex items-center justify-between text-[10px] mb-1.5">
          <span className="text-white/70 font-medium">Producto Principal</span>
          <span className="text-amber-400 text-[9px] font-bold">Alerta: &gt;15 uds</span>
        </div>
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" style={{ width: '84%' }} />
        </div>
      </div>
      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] text-white/40">
        <span>Compra a proveedor</span>
        <span className="text-amber-300/80 font-semibold">Auto-anotado como egreso</span>
      </div>
    </div>
  );
}

function ToolCotizacionesWidget() {
  return (
    <div className="mt-2 rounded-2xl border border-white/[0.06] bg-[#060C14] p-3.5 select-none font-sans">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-[10px] text-white/40">
        <span className="font-mono font-semibold">COTIZACIÓN #089</span>
        <span className="text-blue-300 font-bold px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
          PDF Listo
        </span>
      </div>
      <div className="py-2.5 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-white">Servicio Corporativo</div>
          <div className="text-[10px] text-white/40">Con tu logo y colores</div>
        </div>
        <div className="text-sm font-black text-blue-300 font-mono">$14,500 MXN</div>
      </div>
      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] text-white/40">
        <span className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Aprobación vía WhatsApp
        </span>
        <span className="text-blue-300/80 font-semibold">1-clic a venta</span>
      </div>
    </div>
  );
}

function ToolCRMWidget() {
  return (
    <div className="mt-2 rounded-2xl border border-white/[0.06] bg-[#060C14] p-3.5 select-none font-sans">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-[10px] font-bold">
            SR
          </div>
          <span className="text-xs font-bold text-white">Sofía Ramírez</span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
          Cliente VIP
        </span>
      </div>
      <div className="py-2 grid grid-cols-2 gap-2 text-[10px]">
        <div className="p-1.5 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-white/40 text-[9px]">Historial</div>
          <div className="text-white font-bold mt-0.5">4 pedidos</div>
        </div>
        <div className="p-1.5 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-white/40 text-[9px]">Ticket total</div>
          <div className="text-violet-300 font-bold mt-0.5">$3,120 MXN</div>
        </div>
      </div>
      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] text-white/40">
        <span>Seguimiento directo</span>
        <span className="text-violet-300/80 font-semibold">Abrir chat WhatsApp →</span>
      </div>
    </div>
  );
}

function ToolCalendarioWidget() {
  return (
    <div className="mt-2 rounded-2xl border border-white/[0.06] bg-[#060C14] p-3.5 select-none font-sans">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-[10px]">
        <span className="text-white/50 font-semibold">Agenda de Hoy</span>
        <span className="text-cyan-300 font-bold">3 citas activas</span>
      </div>
      <div className="py-1.5 space-y-1.5">
        <div className="flex items-center justify-between p-1.5 rounded-lg bg-cyan-500/[0.08] border border-cyan-500/15 text-[10px]">
          <span className="text-white/80 font-medium">10:30 · Consulta General</span>
          <span className="text-cyan-300 font-bold text-[9px]">Confirmada</span>
        </div>
        <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-[10px]">
          <span className="text-white/60 font-medium">16:00 · Sesión Entrega</span>
          <span className="text-emerald-400 text-[9px] font-semibold inline-flex items-center gap-1">
            Recordatorio WA
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        </div>
      </div>
      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] text-white/40">
        <span>Cero inasistencias</span>
        <span className="text-cyan-300/80 font-semibold">Auto-recordatorios</span>
      </div>
    </div>
  );
}

function ToolPersonalWidget() {
  return (
    <div className="mt-2 rounded-2xl border border-white/[0.06] bg-[#060C14] p-3.5 select-none font-sans">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-[10px]">
        <span className="text-white/50 font-semibold">Dispersión de Nómina</span>
        <span className="text-rose-300 font-bold">Quincenal</span>
      </div>
      <div className="py-2.5 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-white">3 Colaboradores</div>
          <div className="text-[10px] text-white/40">Sueldos y comisiones</div>
        </div>
        <div className="text-sm font-black text-rose-300 font-mono">$22,400 MXN</div>
      </div>
      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] text-white/40">
        <span>Impacto inmediato</span>
        <span className="text-rose-300/80 font-semibold">Egreso registrado en Finanzas</span>
      </div>
    </div>
  );
}

// ─── Data ───────────────────────────────────────────────────────────────────────

interface Tool {
  icon: React.ReactNode;
  titulo: string;
  subtitulo: string;
  descripcion: string;
  acentoHex: string;
  acentoTw: string;
  glowTw: string;
  borderTw: string;
  tag?: string;
  visual: React.ReactNode;
}

const TOOLS: Tool[] = [
  {
    icon: IconPOS,
    titulo: "Punto de Venta",
    subtitulo: "Cobra desde el primer día",
    descripcion: "Vende con catálogo digital, genera tickets por WhatsApp y mira cómo cada cobro entra directo a tu flujo de caja — sin tocar ni una hoja de cálculo.",
    acentoHex: "#10B981",
    acentoTw: "text-emerald-300",
    glowTw: "bg-emerald-500/12",
    borderTw: "border-emerald-500/25",
    tag: "Finanzas sync",
    visual: <ToolPOSWidget />,
  },
  {
    icon: IconInventario,
    titulo: "Inventario",
    subtitulo: "Nunca más te quedes sin stock",
    descripcion: "Controla existencias en tiempo real, recibe alertas antes de quedarte sin producto y cada compra a proveedor se anota sola como egreso.",
    acentoHex: "#F59E0B",
    acentoTw: "text-amber-300",
    glowTw: "bg-amber-500/10",
    borderTw: "border-amber-500/25",
    tag: "Finanzas sync",
    visual: <ToolInventarioWidget />,
  },
  {
    icon: IconCotizaciones,
    titulo: "Cotizaciones",
    subtitulo: "Cierra tratos más rápido",
    descripcion: "PDF con el logo y colores de tu negocio listo en segundos. Compártelo por WhatsApp y que tu cliente lo apruebe antes de que enfríe el interés.",
    acentoHex: "#3B82F6",
    acentoTw: "text-blue-300",
    glowTw: "bg-blue-500/10",
    borderTw: "border-blue-500/25",
    visual: <ToolCotizacionesWidget />,
  },
  {
    icon: IconCRM,
    titulo: "Clientes",
    subtitulo: "Relaciones que generan recompra",
    descripcion: "Guarda historial, notas y el seguimiento de cada cliente. Un solo clic abre WhatsApp con todo el contexto — sin buscar nada en tu cabeza.",
    acentoHex: "#8B5CF6",
    acentoTw: "text-violet-300",
    glowTw: "bg-violet-500/10",
    borderTw: "border-violet-500/25",
    visual: <ToolCRMWidget />,
  },
  {
    icon: IconCalendario,
    titulo: "Reservas & Citas",
    subtitulo: "Agenda que trabaja sola",
    descripcion: "Llena tu calendario con citas codificadas por color y deja que el sistema mande recordatorios por WhatsApp. Cero clientes olvidados.",
    acentoHex: "#06B6D4",
    acentoTw: "text-cyan-300",
    glowTw: "bg-cyan-500/10",
    borderTw: "border-cyan-500/25",
    visual: <ToolCalendarioWidget />,
  },
  {
    icon: IconPersonal,
    titulo: "Personal & Nómina",
    subtitulo: "Paga sin errores ni sorpresas",
    descripcion: "Registra a tu equipo, calcula salarios y procesa pagos. Cada egreso se refleja al instante en Finanzas — tus números siempre al día.",
    acentoHex: "#F43F5E",
    acentoTw: "text-rose-300",
    glowTw: "bg-rose-500/10",
    borderTw: "border-rose-500/25",
    tag: "Finanzas sync",
    visual: <ToolPersonalWidget />,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────────

export default function Tools() {
  return (
    <section className="py-24 px-6 relative z-10 bg-[#070E17] border-t border-white/[0.04]">
      <div className="max-w-[1200px] mx-auto relative z-10">

        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 text-brand-accent text-sm font-bold tracking-wide mb-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            Valida hoy. Opera mañana.
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight text-white">
            Tu negocio completo<br/>
            <span className="text-white/40">en una sola pantalla.</span>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto font-light leading-relaxed">
            Una vez que tu idea está validada, no necesitas más apps. Cobra, controla inventario, atiende clientes y paga a tu equipo — todo conectado a tus Finanzas en tiempo real, desde el día uno.
          </p>
        </div>

        {/* Interactive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOOLS.map((t, i) => (
            <Reveal
              key={t.titulo}
              index={i}
              className="relative rounded-surface bg-[#0B1320]/80 border border-white/10 hover:border-white/20 p-7 hover:bg-[#0D1726] hover:-translate-y-1.5 transition-all duration-300 group overflow-hidden shadow-floating backdrop-blur-sm flex flex-col justify-between"
            >
              {/* Top subtle gradient line */}
              <div
                className="absolute top-0 inset-x-0 h-1 opacity-40 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, ${t.acentoHex}80, ${t.acentoHex}10)` }}
              />

              {/* Dynamic hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                style={{ background: `radial-gradient(120% 120% at 80% 0%, ${t.acentoHex}14, transparent 60%)` }}
              />

              <div className="relative z-10 flex flex-col h-full gap-5">
                <div className="flex items-start justify-between">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${t.glowTw} border border-white/10 shadow-inner group-hover:scale-105 transition-transform duration-300`}>
                    <span className={`w-7 h-7 block ${t.acentoTw}`}>{t.icon}</span>
                  </div>
                  {t.tag && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {t.tag}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-xl font-bold mb-1 text-white tracking-tight">{t.titulo}</h3>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-2.5 ${t.acentoTw}`}>{t.subtitulo}</p>
                  <p className="text-sm text-white/50 leading-relaxed font-light">{t.descripcion}</p>
                </div>

                {/* Micro visual widget */}
                {t.visual}
              </div>
            </Reveal>
          ))}
        </div>

        <div className="text-center mt-14">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white font-semibold transition-colors group"
          >
            Explora todas las herramientas
            <ArrowRight size={20} strokeWidth={2} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}
