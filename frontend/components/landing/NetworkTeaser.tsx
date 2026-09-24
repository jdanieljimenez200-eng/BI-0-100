"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { SectionReveal, SectionRevealItem } from "@/components/motion/SectionReveal";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Plus,
  Scale,
  Briefcase,
  Calculator,
  ChevronRight,
  AlertCircle,
  FileCheck2,
} from "lucide-react";

// ─── Datos de la Sección ──────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  entidad: string;
  texto: string;
  puntos: number;
  ok: boolean;
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  {
    id: "sat",
    entidad: "SAT",
    texto: "Alta fiscal, RFC y emisión de sellos digitales (CSD)",
    puntos: 36,
    ok: true,
  },
  {
    id: "contratos",
    entidad: "STPS",
    texto: "Contratos laborales individuales conforme a la LFT",
    puntos: 36,
    ok: true,
  },
  {
    id: "impi",
    entidad: "IMPI",
    texto: "Registro de marca mixta en Clase 43 de Niza",
    puntos: 10,
    ok: false,
  },
  {
    id: "cofepris",
    entidad: "COFEPRIS",
    texto: "Aviso de funcionamiento sanitario y bitácora de higiene",
    puntos: 10,
    ok: false,
  },
  {
    id: "licencia",
    entidad: "MUNICIPIO",
    texto: "Licencia de funcionamiento y dictamen de Protección Civil",
    puntos: 8,
    ok: false,
  },
];

interface ExpertProfile {
  id: number;
  nombre: string;
  cargo: string;
  credencial: string;
  especialidad: string;
  descripcion: string;
  tags: string[];
  icon: React.ComponentType<{ className?: string }>;
  compatibilidad: string;
  tiempoRespuesta: string;
}

const PERFILES_EXPERTOS: ExpertProfile[] = [
  {
    id: 1,
    nombre: "Lic. Roberto Valenzuela S.",
    cargo: "Socio Director · Valenzuela & Asoc.",
    credencial: "Cédula Prof. 8492011",
    especialidad: "Derecho Corporativo & Societario",
    descripcion: "Estructuración de estatutos, pactos de socios, actas de asamblea y blindaje de responsabilidad comercial.",
    tags: ["Pactos de Socios", "Contratos Mercantiles", "Gobierno Corporativo"],
    icon: Scale,
    compatibilidad: "99%",
    tiempoRespuesta: "< 2 hrs",
  },
  {
    id: 2,
    nombre: "Mtra. Sofía Méndez Alcocer",
    cargo: "Perito Marcario · Propiedad Intelectual",
    credencial: "Cédula Prof. 9102482",
    especialidad: "Registro de Marcas & Patentes (IMPI)",
    descripcion: "Búsqueda fonética previa, registro de marca en Clase Niza y defensa legal ante oposiciones y litigios.",
    tags: ["Clase 43 Niza", "Protección de Marca", "Activos Intangibles"],
    icon: Briefcase,
    compatibilidad: "98%",
    tiempoRespuesta: "< 1 hr",
  },
  {
    id: 3,
    nombre: "C.P.C. Alejandro Garza Treviño",
    cargo: "Socio de Consultoría & Auditoría Tributaria",
    credencial: "Cédula Prof. 7521890 · Col. Contadores",
    especialidad: "Estrategia Fiscal, SAT & Nómina",
    descripcion: "Diagnóstico preventivo de CFDI 4.0, optimización de régimen tributario y cumplimiento de cuotas ante IMSS/SAT.",
    tags: ["Estrategia SAT", "Nómina & IMSS", "CFDI 4.0"],
    icon: Calculator,
    compatibilidad: "96%",
    tiempoRespuesta: "< 3 hrs",
  },
];

const STATS = [
  {
    valor: "+480",
    label: "Directorio Validado",
    sub: "Cédula profesional auditada directamente ante la Dirección General de Profesiones (SEP).",
  },
  {
    valor: "0%",
    label: "Sin Comisiones Ocultas",
    sub: "Contacto y cotización directa con el despacho profesional sin sobreprecio de plataforma.",
  },
  {
    valor: "< 2 hrs",
    label: "Tiempo de Asignación",
    sub: "El especialista recibe tu expediente técnico previo para iniciar la asesoría sin tiempos muertos.",
  },
];

// ─── 1. Tarjeta Sólida iPhone de Diagnóstico Regulatorio ──────────────────────

function AppleDiagnosticCard({
  checklist,
  onToggleItem,
}: {
  checklist: ChecklistItem[];
  onToggleItem: (index: number) => void;
}) {
  const currentScore = checklist.reduce((acc, item) => (item.ok ? acc + item.puntos : acc), 0);
  const pendingCount = checklist.filter((item) => !item.ok).length;

  return (
    <div className="relative rounded-[26px] bg-[#1C1C1E] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:border-white/[0.14] overflow-hidden p-6 sm:p-7 lg:p-8 flex flex-col justify-between gap-6 transition-colors duration-200">
      <div className="relative z-10">
        {/* Cabecera del Caso de Estudio */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs font-sans font-medium text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Caso Real: Cafetería & Tostaduría de Especialidad</span>
          </div>
          <span className="text-[11px] font-sans font-medium text-slate-400">
            Expediente #REG-2026
          </span>
        </div>

        {/* Métricas del Índice Regulatorio */}
        <div className="mb-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-sans font-medium text-slate-400">
              Cumplimiento Legal & Sanitario
            </span>
            <div className="flex items-baseline gap-1 font-sans">
              <span className="text-3xl sm:text-4xl font-bold tracking-tight text-white tabular-nums">
                {currentScore}
              </span>
              <span className="text-sm font-normal text-slate-400">/ 100</span>
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
            <motion.div
              className={`h-full rounded-full transition-all duration-500 ${
                currentScore >= 95
                  ? "bg-emerald-400"
                  : currentScore >= 70
                  ? "bg-gradient-to-r from-amber-400 to-emerald-400"
                  : "bg-amber-400"
              }`}
              initial={false}
              animate={{ width: `${currentScore}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Banner de Estado */}
        <div
          className={`rounded-2xl border p-4 mb-5 transition-colors duration-200 ${
            pendingCount === 0
              ? "border-emerald-500/25 bg-emerald-500/[0.08]"
              : "border-amber-500/25 bg-amber-500/[0.06]"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center mt-0.5 ${
                pendingCount === 0
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {pendingCount === 0 ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={`text-xs font-sans font-semibold ${
                    pendingCount === 0 ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {pendingCount === 0
                    ? "Expediente Blindado para Apertura"
                    : `${pendingCount} punto${pendingCount > 1 ? "s" : ""} crítico${pendingCount > 1 ? "s" : ""} detectado${pendingCount > 1 ? "s" : ""}`}
                </span>
                <span className="text-[10px] font-sans text-slate-400">
                  {pendingCount === 0 ? "100% en regla" : "Acción requerida"}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                {pendingCount === 0
                  ? "Cumplimiento total verificado en materia fiscal, sanitaria, laboral y de propiedad intelectual."
                  : "Se requieren trámites ante IMPI, COFEPRIS y municipio antes de iniciar operaciones abiertas."}
              </p>
            </div>
          </div>
        </div>

        {/* Checklist Interactivo */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-sans font-medium text-slate-400 mb-1 px-1">
            <span>Requisitos Normativos del Negocio</span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Haz clic para simular cumplimiento
            </span>
          </div>

          {checklist.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggleItem(i)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors duration-150 cursor-pointer ${
                item.ok
                  ? "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]"
                  : "bg-white/[0.04] border-white/[0.09] hover:bg-white/[0.07]"
              }`}
            >
              <div
                className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  item.ok
                    ? "bg-emerald-500/25 text-emerald-400 border border-emerald-500/40"
                    : "bg-white/[0.06] text-slate-400 border border-white/[0.12]"
                }`}
              >
                {item.ok ? (
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                ) : (
                  <X className="w-2.5 h-2.5 stroke-[2.5]" />
                )}
              </div>

              <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-bold bg-white/[0.06] text-slate-300 tracking-wider">
                {item.entidad}
              </span>

              <span
                className={`text-xs sm:text-[13px] font-sans flex-1 transition-colors ${
                  item.ok
                    ? "text-slate-400 line-through"
                    : "text-slate-200 font-medium"
                }`}
              >
                {item.texto}
              </span>

              <span
                className={`text-[10px] font-sans font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  item.ok
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                }`}
              >
                {item.ok ? "Resuelto" : "Pendiente"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Pie de Diagnóstico */}
      <div className="relative z-10 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-sans">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>3 despachos compatibles asignados al caso</span>
        </div>
        <span className="text-xs font-sans font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2.5 py-1 rounded-full">
          Afinidad 98%
        </span>
      </div>
    </div>
  );
}

// ─── 2. Tarjeta Sólida iPhone de Especialista Verificado ──────────────────────

function AppleExpertCard({
  experto,
  isSelected,
  onSelect,
}: {
  experto: ExpertProfile;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const IconComp = experto.icon;

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-[22px] p-5 transition-all duration-200 cursor-pointer border ${
        isSelected
          ? "bg-[#222329] border-cyan-400/40 shadow-[0_4px_20px_rgba(0,0,0,0.35)]"
          : "bg-[#1C1C1E] border-white/[0.08] hover:border-white/[0.14] hover:bg-[#202024]"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex-shrink-0 mt-0.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              isSelected
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
                : "bg-white/[0.05] text-slate-300 border border-white/[0.08]"
            }`}
          >
            <IconComp className="w-5 h-5" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div>
              <h4 className="text-sm sm:text-[15px] font-bold text-white leading-snug font-sans">
                {experto.especialidad}
              </h4>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                {experto.nombre} ·{" "}
                <span className="text-slate-400">{experto.credencial}</span>
              </p>
            </div>

            <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 px-2 py-0.5 rounded-full flex-shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Verificado
            </span>
          </div>

          <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed font-sans my-2.5">
            {experto.descripcion}
          </p>

          <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
            <div className="flex flex-wrap gap-1.5">
              {experto.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-[11px] font-sans font-medium bg-white/[0.04] border border-white/[0.07] text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>

            <span className="text-[11px] font-sans font-semibold text-cyan-400 inline-flex items-center gap-1">
              <span>{experto.compatibilidad} afinidad</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Tarjeta Bento de Métricas Verificadas ─────────────────────────────────

function AppleStatCard({ stat }: { stat: (typeof STATS)[number] }) {
  return (
    <div className="relative rounded-[22px] bg-[#1C1C1E] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.35)] p-5 sm:p-6 flex flex-col justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-sans font-medium text-slate-400 uppercase tracking-wider">
          {stat.label}
        </span>
        <span className="text-3xl sm:text-4xl font-bold font-sans tracking-tight text-white tabular-nums">
          {stat.valor}
        </span>
        <span className="text-xs sm:text-[13px] text-slate-300 font-sans font-normal leading-relaxed mt-0.5">
          {stat.sub}
        </span>
      </div>
    </div>
  );
}

// ─── Componente Principal NetworkTeaser ───────────────────────────────────────

export default function NetworkTeaser() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);
  const [selectedExpertId, setSelectedExpertId] = useState<number>(1);

  const toggleChecklistItem = (index: number) => {
    setChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ok: !item.ok } : item))
    );
  };

  return (
    <section className="relative py-24 md:py-32 overflow-hidden bg-transparent">
      <div ref={containerRef} className="relative z-10 max-w-[1240px] mx-auto px-4 sm:px-6">

        {/* ── Encabezado Editorial Estilo Apple / Tesla ── */}
        <SectionReveal className="max-w-2xl mb-14 md:mb-18">
          <SectionRevealItem
            as="div"
            className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-cyan-400/10 border border-cyan-400/25 text-cyan-300 text-xs font-sans font-medium mb-4"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Red de Especialistas Verificados</span>
          </SectionRevealItem>

          <SectionRevealItem
            as="h2"
            className="font-sans text-3xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.025em] text-white mb-4"
          >
            Tu análisis conecta con el profesional adecuado
          </SectionRevealItem>

          <SectionRevealItem
            as="p"
            className="font-sans text-base sm:text-lg font-normal leading-relaxed text-slate-300 max-w-xl"
          >
            Cada informe de viabilidad incluye acceso directo a abogados mercantiles, peritos del IMPI y fiscalistas colegiados para ejecutar tu proyecto sin contingencias.
          </SectionRevealItem>
        </SectionReveal>

        {/* ── Grid Demo: Caso Real vs Red de Especialistas ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 sm:gap-8 items-start">

          {/* PANEL IZQUIERDO: Tarjeta Sólida de Diagnóstico */}
          <AppleDiagnosticCard
            checklist={checklist}
            onToggleItem={toggleChecklistItem}
          />

          {/* PANEL DERECHO: Fichas Profesionales de la Red */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-xs font-sans font-semibold uppercase tracking-wider text-slate-400">
                Especialistas Asignados al Expediente
              </span>
              <span className="text-[11px] font-sans text-slate-400 bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-white/[0.06]">
                Directorio Colegiado
              </span>
            </div>

            {PERFILES_EXPERTOS.map((experto) => (
              <AppleExpertCard
                key={experto.id}
                experto={experto}
                isSelected={selectedExpertId === experto.id}
                onSelect={() => setSelectedExpertId(experto.id)}
              />
            ))}

            {/* Botón CTA a Directorio Completo Estilo Cápsula */}
            <div className="pt-2">
              <Link
                href="/network"
                className="flex items-center justify-center gap-2.5 w-full h-12 rounded-full border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/[0.22] text-white text-xs sm:text-sm font-sans font-semibold tracking-wide transition-all shadow-sm active:scale-[0.98] group cursor-pointer"
              >
                <Plus className="w-4 h-4 text-cyan-400 transition-transform duration-200 group-hover:rotate-90" />
                <span>Explorar el directorio completo de profesionales</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-white" />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Stats Bento Inferior ── */}
        <div className="mt-14 sm:mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {STATS.map((stat) => (
            <AppleStatCard key={stat.label} stat={stat} />
          ))}
        </div>

      </div>
    </section>
  );
}
