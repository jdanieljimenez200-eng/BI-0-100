"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ENTRADA_SEGURA, REVEAL_VIEWPORT } from "@/lib/motion/tokens";
import { SectionReveal, SectionRevealItem } from "@/components/motion/SectionReveal";
import { ArrowRight, Check, Copy } from "lucide-react";

// ─── SVG Vector Icons Minimalistas (20px, trazo fino Apple) ──────────────────

const IconMercado = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M3 3v18h18" />
    <path d="M7 15l3-4 3 3 4-6" />
    <circle cx="20" cy="8" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const IconFinanzas = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9.5 9.2a2.2 2.2 0 0 1 2.5-1.7c1.2.1 2 .9 2 1.9 0 2.4-4.5 1.6-4.5 4 0 1 .9 1.8 2 1.9a2.2 2.2 0 0 0 2.5-1.7" />
  </svg>
);

const IconMarketing = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M14 8a4 4 0 0 1 0 8M17 5a8 8 0 0 1 0 14" />
  </svg>
);

const IconVentas = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M3 12h18M12 3v18M6 9l3-3 3 3 4-4 4 4" />
    <circle cx="18" cy="6" r="1.5" fill="currentColor" />
  </svg>
);

const IconLegal = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M12 2l-8 4 8 4 8-4-8-4z" />
    <path d="M4 10l8 4 8-4" />
    <path d="M4 6v6l8 4 8-4V6" />
    <path d="M9 18l-5 2 2-5" />
    <path d="M15 18l5 2-2-5" />
  </svg>
);

const Icon360 = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

// ─── Tarjeta iPhone Sólida (#1C1C1E, Sin Efecto Mouse) ────────────────────────

interface AppleCardProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
  /** Direction the card slides in from on scroll: 'left' → enters from left, 'right' → enters from right, 'none' → vertical only */
  slideFrom?: "left" | "right" | "none";
}

function AppleCard({
  children,
  className = "",
  index = 0,
  slideFrom = "none",
}: AppleCardProps) {
  const shouldReduce = useReducedMotion();

  // Horizontal offset based on slide direction
  const xOffset = slideFrom === "left" ? -80 : slideFrom === "right" ? 80 : 0;

  return (
    <motion.div
      {...ENTRADA_SEGURA}
      initial={shouldReduce ? false : { opacity: 0, y: 28, x: xOffset }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={REVEAL_VIEWPORT}
      transition={{
        duration: 0.7,
        ease: [0.22, 1, 0.36, 1],
        delay: Math.min(index, 6) * 0.08,
      }}
      className={`relative rounded-[26px] bg-[#1C1C1E] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:border-white/[0.14] overflow-hidden p-6 sm:p-7 lg:p-8 flex flex-col justify-between gap-5 sm:gap-6 ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ─── 1. Módulo Mercado (Apple Editorial: Números Protagonistas) ───────────────

const MERCADO_ZONAS = [
  { id: "centro", label: "Zona Centro", densidad: "Holgada (1.8/km²)", score: 86, competidores: 14, optimo: "$349", prom: "$420", oportunidad: "Oportunidad Alta" },
  { id: "norte", label: "Corredor Norte", densidad: "Disputada (4.2/km²)", score: 64, competidores: 28, optimo: "$299", prom: "$390", oportunidad: "Competencia Media" },
  { id: "poniente", label: "Área Poniente", densidad: "Virgen (0.6/km²)", score: 94, competidores: 5, optimo: "$395", prom: "$460", oportunidad: "Mercado Virgen" },
];

function CardMercado() {
  const [selectedZona, setSelectedZona] = useState(MERCADO_ZONAS[0]);

  return (
    <AppleCard index={0} className="lg:col-span-2" slideFrom="left">
      {/* Header Editorial */}
      <div>
        <div className="text-cyan-400 mb-3.5 flex items-center">
          {IconMercado}
        </div>

        <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-cyan-400/90 mb-1 font-sans">
          Radar de Demanda & Competencia
        </p>

        <h3 className="text-2xl sm:text-[28px] font-bold text-white tracking-[-0.03em] leading-tight mb-2 font-sans">
          Mercado
        </h3>

        <p className="text-[14px] sm:text-[15px] text-slate-300 leading-relaxed max-w-2xl font-normal mb-5 font-sans">
          Rastreo algorítmico en Google Maps y marketplaces. Identifica si tu zona está saturada o virgen antes de comprometer capital.
        </p>

        {/* Chips Apple */}
        <div className="flex flex-wrap items-center gap-2">
          {MERCADO_ZONAS.map((z) => {
            const active = selectedZona.id === z.id;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => setSelectedZona(z)}
                className={`h-[32px] px-3.5 rounded-full text-[12px] font-medium tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-2 active:scale-95 font-sans ${
                  active
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 shadow-xs"
                    : "bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-white hover:bg-white/[0.08]"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-cyan-400" : "bg-slate-500"}`} />
                <span>{z.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Métricas Protagonistas (Sin Cajas Dentro de Cajas) */}
      <div className="pt-5 border-t border-white/[0.06]">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6 mb-5">
          <div>
            <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
              Viabilidad
            </div>
            <div className="text-4xl sm:text-[48px] font-bold tracking-tight text-cyan-400 tabular-nums font-sans">
              {selectedZona.score}
            </div>
            <div className="text-[12px] text-slate-300 font-normal mt-1 font-sans">
              {selectedZona.oportunidad}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
              Competidores
            </div>
            <div className="text-4xl sm:text-[48px] font-bold tracking-tight text-white tabular-nums font-sans">
              {selectedZona.competidores}
            </div>
            <div className="text-[12px] text-slate-300 font-normal mt-1 font-sans">
              Mapeados en Google Maps
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
              Precio óptimo
            </div>
            <div className="text-4xl sm:text-[48px] font-bold tracking-tight text-white tabular-nums font-sans">
              {selectedZona.optimo}
            </div>
            <div className="text-[12px] text-slate-300 font-normal mt-1 font-sans">
              vs {selectedZona.prom} promedio mercado
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[12px] text-slate-400 gap-2 pt-3 border-t border-white/[0.04] font-sans">
          <span>
            Densidad: <strong className="text-white font-medium">{selectedZona.densidad}</strong>
          </span>
          <span className="text-cyan-300/90 font-medium">
            Gap de oportunidad: entrega en 24h captura +18% de margen
          </span>
        </div>
      </div>
    </AppleCard>
  );
}

// ─── 2. Módulo Finanzas (Simulador & Métrica Enorme) ─────────────────────────

function CardFinanzas() {
  const [unidades, setUnidades] = useState(160);
  const breakEven = 142;
  const margenUnitario = 180;

  const utilidadMensual = Math.round((unidades - breakEven) * margenUnitario);
  const paybackMeses = unidades > breakEven ? Math.max(1.8, (120000 / (utilidadMensual + 22000))).toFixed(1) : "—";

  return (
    <AppleCard index={1} className="lg:col-span-1" slideFrom="right">
      <div>
        <div className="text-emerald-400 mb-3.5 flex items-center">
          {IconFinanzas}
        </div>

        <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-emerald-400/90 mb-1 font-sans">
          Simulador Financiero
        </p>

        <h3 className="text-2xl sm:text-[28px] font-bold text-white tracking-[-0.03em] leading-tight mb-2 font-sans">
          Finanzas
        </h3>

        <p className="text-[14px] sm:text-[15px] text-slate-300 leading-relaxed font-normal mb-5 font-sans">
          Punto de equilibrio exacto y meses de recuperación a 12 meses.
        </p>

        {/* Hero Metric */}
        <div className="mb-4">
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Punto de equilibrio
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-[48px] font-bold tracking-tight text-emerald-400 tabular-nums font-sans">
              {breakEven}
            </span>
            <span className="text-sm text-slate-400 font-normal font-sans">uds / mes</span>
          </div>
          <div className="text-[12px] text-slate-300 font-normal mt-0.5 font-sans">
            Volumen mínimo para costo cero
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/[0.06] space-y-4">
        <div>
          <div className="flex items-center justify-between text-[12px] mb-1.5 font-sans">
            <span className="text-slate-400">Proyección de ventas:</span>
            <span className="text-white font-semibold tabular-nums">{unidades} uds/mes</span>
          </div>
          
          <input
            type="range"
            min="100"
            max="240"
            step="5"
            value={unidades}
            aria-label="Volumen de unidades mensuales"
            onChange={(e) => setUnidades(Number(e.target.value))}
            className="w-full cursor-pointer h-1.5 bg-white/[0.1] rounded-full appearance-none accent-emerald-400 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-0.5 font-sans">
          <div>
            <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5">
              Utilidad neta
            </div>
            <div className="text-lg sm:text-xl font-bold text-white tabular-nums">
              {utilidadMensual >= 0 ? `+$${utilidadMensual.toLocaleString("en-US")}` : "-"}
            </div>
            <div className="text-[11px] text-slate-400">mensual estimada</div>
          </div>

          <div>
            <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5">
              Payback
            </div>
            <div className="text-lg sm:text-xl font-bold text-white tabular-nums">
              {paybackMeses} {paybackMeses !== "—" ? "meses" : ""}
            </div>
            <div className="text-[11px] text-slate-400">retorno inversión</div>
          </div>
        </div>
      </div>
    </AppleCard>
  );
}

// ─── 3. Módulo Marketing (Chips Apple & Métrica CPL Limpia) ──────────────────

const MARKETING_CANALES = [
  { id: "meta", label: "Meta Ads", cpl: "$18", ajuste: "94%", copy: "Solución diseñada con precisión para quienes buscan resultados medibles desde el primer mes." },
  { id: "tiktok", label: "TikTok", cpl: "$12", ajuste: "91%", copy: "El error que comete el 90% antes de validar su negocio (y cómo evitarlo en 3 minutos)." },
  { id: "wa", label: "WhatsApp", cpl: "Orgánico", ajuste: "96%", copy: "Revisé tu perfil comercial y preparé el diagnóstico de tu zona. ¿Te lo comparto por aquí?" },
];

function CardMarketing() {
  const [activeCanal, setActiveCanal] = useState(MARKETING_CANALES[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(activeCanal.copy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AppleCard index={2} className="lg:col-span-1" slideFrom="left">
      <div>
        <div className="text-pink-400 mb-3.5 flex items-center">
          {IconMarketing}
        </div>

        <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-pink-400/90 mb-1 font-sans">
          Adquisición & Estrategia
        </p>

        <h3 className="text-2xl sm:text-[28px] font-bold text-white tracking-[-0.03em] leading-tight mb-2 font-sans">
          Marketing
        </h3>

        <p className="text-[14px] sm:text-[15px] text-slate-300 leading-relaxed font-normal mb-4 font-sans">
          Canales de adquisición con menor costo por cliente y copys probados.
        </p>

        {/* Chips Apple */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {MARKETING_CANALES.map((c) => {
            const active = activeCanal.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCanal(c)}
                className={`h-[30px] px-3 rounded-full text-[12px] font-medium tracking-wide transition-all duration-200 cursor-pointer active:scale-95 font-sans ${
                  active
                    ? "bg-pink-500/15 text-pink-300 border border-pink-400/30"
                    : "bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-white"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Hero Metric */}
        <div className="mb-4">
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Costo por Lead (CPL)
          </div>
          <div className="text-4xl sm:text-[48px] font-bold tracking-tight text-pink-400 tabular-nums font-sans">
            {activeCanal.cpl}
          </div>
          <div className="text-[12px] text-slate-300 font-normal mt-0.5 font-sans">
            Ajuste de audiencia: {activeCanal.ajuste}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/[0.06]">
        <p className="text-[12px] text-slate-300 leading-relaxed font-normal italic mb-2.5 line-clamp-2 font-sans">
          &ldquo;{activeCanal.copy}&rdquo;
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-pink-400 hover:text-pink-300 transition-colors cursor-pointer font-sans"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copiado" : "Copiar mensaje"}</span>
        </button>
      </div>
    </AppleCard>
  );
}

// ─── 4. Módulo Ventas (Objeciones & Cierre Comercial) ─────────────────────────

const OBJECIONES = [
  { id: "caro", label: "Está caro", score: "9.2/10", boost: "+14.8%", guion: "Entiendo el precio. Justo por eso incluimos garantía de cambio en 24h y soporte local, evitando que pierdas hasta 3 días hábiles si falla." },
  { id: "pensar", label: "Lo pensaré", score: "8.9/10", boost: "+12.4%", guion: "Totalmente. Para ayudarte a evaluar: ¿tu duda principal es el tiempo de entrega o el retorno de inversión?" },
  { id: "proveedor", label: "Tengo proveedor", score: "9.4/10", boost: "+16.2%", guion: "Excelente. Varios clientes venían de ahí por el tiempo de respuesta. ¿En cuánto tiempo te resuelven actualmente?" },
];

function CardVentas() {
  const [selectedObj, setSelectedObj] = useState(OBJECIONES[0]);

  return (
    <AppleCard index={3} className="lg:col-span-1">
      <div>
        <div className="text-orange-400 mb-3.5 flex items-center">
          {IconVentas}
        </div>

        <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-orange-400/90 mb-1 font-sans">
          Negociación & Cierre
        </p>

        <h3 className="text-2xl sm:text-[28px] font-bold text-white tracking-[-0.03em] leading-tight mb-2 font-sans">
          Ventas
        </h3>

        <p className="text-[14px] sm:text-[15px] text-slate-300 leading-relaxed font-normal mb-4 font-sans">
          Respuestas probadas para neutralizar objeciones y cerrar más ventas.
        </p>

        {/* Chips Apple */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {OBJECIONES.map((obj) => {
            const active = selectedObj.id === obj.id;
            return (
              <button
                key={obj.id}
                type="button"
                onClick={() => setSelectedObj(obj)}
                className={`h-[30px] px-3 rounded-full text-[12px] font-medium tracking-wide transition-all duration-200 cursor-pointer active:scale-95 font-sans ${
                  active
                    ? "bg-orange-500/15 text-orange-300 border border-orange-400/30"
                    : "bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-white"
                }`}
              >
                &ldquo;{obj.label}&rdquo;
              </button>
            );
          })}
        </div>

        {/* Hero Metric */}
        <div className="mb-4">
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Impacto en conversión
          </div>
          <div className="text-4xl sm:text-[48px] font-bold tracking-tight text-orange-400 tabular-nums font-sans">
            {selectedObj.boost}
          </div>
          <div className="text-[12px] text-slate-300 font-normal mt-0.5 font-sans">
            Efectividad del argumento: {selectedObj.score}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/[0.06]">
        <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-1 font-sans">
          Respuesta sugerida
        </div>
        <p className="text-[12px] text-slate-300 leading-relaxed font-normal italic line-clamp-2 font-sans">
          &ldquo;{selectedObj.guion}&rdquo;
        </p>
      </div>
    </AppleCard>
  );
}

// ─── 5. Módulo Legal (Checklist Minimalista Apple) ────────────────────────────

function CardLegal() {
  const [checks, setChecks] = useState([true, true, true, false]);
  const totalChecked = checks.filter(Boolean).length;
  const scoreLegal = Math.round((totalChecked / checks.length) * 100);

  const toggleCheck = (index: number) => {
    setChecks((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const items = [
    "Constitución & registro fiscal SAT",
    "Licencia comercial de operación",
    "Políticas de privacidad y datos",
    "Registro de marca y contratos",
  ];

  return (
    <AppleCard index={4} className="lg:col-span-1" slideFrom="right">
      <div>
        <div className="text-purple-400 mb-3.5 flex items-center">
          {IconLegal}
        </div>

        <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-purple-400/90 mb-1 font-sans">
          Cumplimiento & Fiscal SAT
        </p>

        <h3 className="text-2xl sm:text-[28px] font-bold text-white tracking-[-0.03em] leading-tight mb-2 font-sans">
          Legal
        </h3>

        <p className="text-[14px] sm:text-[15px] text-slate-300 leading-relaxed font-normal mb-5 font-sans">
          Estructura societaria, licencias y régimen tributario óptimo.
        </p>

        {/* Hero Metric */}
        <div className="mb-4">
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
            Cumplimiento regulatorio
          </div>
          <div className="text-4xl sm:text-[48px] font-bold tracking-tight text-purple-400 tabular-nums font-sans">
            {scoreLegal}%
          </div>
          <div className="text-[12px] text-slate-300 font-normal mt-0.5 font-sans">
            Régimen recomendado: RESICO
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/[0.06] space-y-2">
        {items.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => toggleCheck(idx)}
            className="w-full flex items-center justify-between py-1 text-left group/item cursor-pointer"
          >
            <span className={`text-[12px] font-normal transition-colors font-sans ${checks[idx] ? "text-slate-200" : "text-slate-400"}`}>
              {item}
            </span>
            <div
              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all ${
                checks[idx]
                  ? "bg-purple-500 text-[#070E17]"
                  : "border border-white/20 group-hover/item:border-white/40"
              }`}
            >
              {checks[idx] && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
          </button>
        ))}
      </div>
    </AppleCard>
  );
}

// ─── 6. Diagnóstico 360° (Tarjeta Panorámica Consolidada, 3 Cols) ─────────────

function Card360() {
  const scores = [
    { label: "Mercado", val: 86, color: "#22D3EE" },
    { label: "Finanzas", val: 92, color: "#34D399" },
    { label: "Marketing", val: 94, color: "#F472B6" },
    { label: "Ventas", val: 90, color: "#FB923C" },
    { label: "Legal", val: 88, color: "#A78BFA" },
  ];

  return (
    <AppleCard index={5} className="lg:col-span-3">
      <div className="grid grid-cols-1 lg:grid-cols-[42%_58%] gap-6 lg:gap-10 items-center">
        <div>
          <div className="text-amber-400 mb-3.5 flex items-center">
            {Icon360}
          </div>

          <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-amber-400/90 mb-1 font-sans">
            Expediente Consolidado
          </p>

          <h3 className="text-2xl sm:text-[32px] font-bold text-white tracking-[-0.03em] leading-tight mb-2 font-sans">
            Diagnóstico 360°
          </h3>

          <p className="text-[14px] sm:text-[15px] text-slate-300 leading-relaxed font-normal mb-5 font-sans">
            Cruce integral de los 5 pilares en un solo reporte de alta dirección exportable a PDF oficial A4 para socios o inversionistas.
          </p>

          {/* Hero Metric */}
          <div>
            <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-0.5 font-sans">
              Score Global de Viabilidad
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl sm:text-[56px] font-bold tracking-tight text-white tabular-nums font-sans">
                90
              </span>
              <span className="text-lg text-slate-400 font-normal font-sans">/ 100</span>
            </div>
            <div className="text-[12px] text-slate-300 font-normal mt-0.5 font-sans">
              Validación completa generada en menos de 3 minutos
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-6 pt-5 lg:pt-0 lg:border-l lg:border-white/[0.08] lg:pl-10">
          <div className="grid grid-cols-5 gap-2 sm:gap-4 text-center">
            {scores.map((s) => (
              <div key={s.label}>
                <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400 mb-1 font-sans">
                  {s.label}
                </div>
                <div className="text-xl sm:text-2xl font-bold tabular-nums mb-1.5 font-sans" style={{ color: s.color }}>
                  {s.val}
                </div>
                <div className="h-1 w-full bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${s.val}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-sans">
            <span className="text-[12px] text-slate-400">
              Formato oficial A4 para socios y bancos
            </span>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-[12px] font-semibold tracking-wide text-[#070E17] bg-white hover:bg-slate-100 active:scale-95 transition-all duration-200 cursor-pointer shadow-sm font-sans"
            >
              <span>Generar expediente</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </AppleCard>
  );
}

// ─── Componente Principal Modules ─────────────────────────────────────────────

export default function Modules() {
  return (
    <section id="modulos" className="py-20 md:py-28 px-4 sm:px-6 relative z-10 bg-transparent overflow-x-clip">
      <div className="max-w-[1240px] mx-auto relative z-10">

        {/* Encabezado Editorial */}
        <SectionReveal className="text-center mb-12 lg:mb-16">
          <SectionRevealItem as="h2" className="font-sans text-3xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-[-0.025em] text-white">
            Los 5 pilares de tu validación comercial
          </SectionRevealItem>
          <SectionRevealItem as="p" className="font-sans text-base sm:text-lg max-w-xl mx-auto font-normal leading-relaxed text-transparent bg-clip-text bg-gradient-to-r from-slate-200 via-cyan-200/95 to-emerald-300/85">
            Auditoría integral en 3 minutos: demanda territorial, competencia mapeada, márgenes financieros y normatividad legal.
          </SectionRevealItem>
        </SectionReveal>

        {/* Bento Grid con Espaciado Ajustado y Elevación Fluida */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          <CardMercado />
          <CardFinanzas />
          <CardMarketing />
          <CardVentas />
          <CardLegal />
          <Card360 />
        </div>

      </div>
    </section>
  );
}
