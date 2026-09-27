"use client";

import { useRef, useState } from "react";
import { motion, useScroll, useSpring, useTransform, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { SectionReveal, SectionRevealItem } from "@/components/motion/SectionReveal";
import { Upload, Sliders, Cpu, FileCheck2, ArrowRight, CheckCircle2 } from "lucide-react";

export interface HowItWorksStep {
  n: string | number;
  title: string;
  desc: string;
  badge?: string;
  icon?: any;
  detail?: string;
  color?: string;
}

const DEFAULT_STEPS: HowItWorksStep[] = [
  {
    n: "01",
    title: "Sube tu producto o idea",
    desc: "Ingresa el nombre, giro comercial o sube una fotografía. En 30 segundos el sistema clasifica tu oferta y prepara la matriz de análisis.",
    badge: "30 segundos",
    icon: Upload,
    detail: "Clasificación automática",
    color: "#F97316",
  },
  {
    n: "02",
    title: "Define tu contexto territorial",
    desc: "Indica tu ubicación objetivo, presupuesto de arranque y canales previstos. El sistema calibra la auditoría para tu mercado real.",
    badge: "1 minuto",
    icon: Sliders,
    detail: "Georreferenciación local",
    color: "#60A5FA",
  },
  {
    n: "03",
    title: "Auditoría algorítmica 360°",
    desc: "Cruce simultáneo de Google Maps, Marketplaces, normativas fiscales y proyecciones de flujo de caja en paralelo.",
    badge: "Procesamiento",
    icon: Cpu,
    detail: "Saturación & equilibrio",
    color: "#A78BFA",
  },
  {
    n: "04",
    title: "Expediente ejecutivo y activación en 1 clic",
    desc: "Genera tu informe oficial en PDF para bancos e inversionistas, y activa de inmediato tu catálogo en las 8 herramientas operativas (POS, Inventario, Contabilidad, Citas y más).",
    badge: "Listo en <3 min",
    icon: FileCheck2,
    detail: "Operación & PDF",
    color: "#34D399",
  },
];

// ─── Tarjeta iPhone Sólida (Sin animación de mouse, fondo opaco #1C1C1E) ───────

interface AppleStepCardProps {
  step: HowItWorksStep;
  isCurrent: boolean;
  isPassed: boolean;
  onClick: () => void;
}

function AppleStepCard({ step, isCurrent, isPassed, onClick }: AppleStepCardProps) {
  const Icon = step.icon || Upload;
  const accentColor = step.color || "#22D3EE";

  return (
    <div
      onClick={onClick}
      className={`relative rounded-[26px] p-6 sm:p-7 flex flex-col justify-between overflow-hidden cursor-pointer transition-colors duration-200 ${
        isCurrent
          ? "bg-[#181D27] border border-orange-500/40 border-t-orange-400/60 shadow-[0_10px_30px_rgba(249,115,22,0.15)]"
          : "bg-[#1C1C1E] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:border-white/[0.14]"
      }`}
    >
      {/* Contenido Editorial */}
      <div>
        {/* Fila Superior: Icono Minimalista + Badges iPhone */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0"
              style={{ color: accentColor }}
            >
              <Icon className="w-5 h-5 stroke-[1.75]" />
            </div>

            <span
              className="h-[28px] px-3 rounded-full text-xs font-sans font-semibold flex items-center tracking-normal"
              style={{
                backgroundColor: `${accentColor}18`,
                color: accentColor,
                border: `1px solid ${accentColor}35`,
              }}
            >
              {step.badge}
            </span>
          </div>

          <span className="text-xs font-sans font-medium text-slate-400 hidden sm:inline-block">
            {step.detail}
          </span>
        </div>

        {/* Título & Descripción */}
        <h3
          className={`font-sans text-xl sm:text-2xl font-bold mb-2 tracking-[-0.025em] transition-colors ${
            isCurrent ? "text-white" : "text-slate-100"
          }`}
        >
          {step.title}
        </h3>

        <p className="text-sm text-slate-300 leading-relaxed font-normal max-w-2xl font-sans">
          {step.desc}
        </p>
      </div>

      {/* Footer Estilo iOS */}
      <div className="mt-5 pt-3.5 border-t border-white/[0.07] flex items-center justify-between text-xs text-slate-400 font-sans">
        <span className="flex items-center gap-2">
          <CheckCircle2
            className={`w-4 h-4 ${
              isCurrent
                ? "text-orange-400"
                : isPassed
                ? "text-orange-400"
                : "text-slate-500"
            }`}
          />
          <span className="text-slate-300 font-sans text-xs">
            Etapa <span className="font-bold text-white font-sans">{step.n}</span> de 04
          </span>
        </span>

        <ArrowRight
          className={`w-4 h-4 ${
            isCurrent ? "text-orange-400" : "text-slate-500"
          }`}
        />
      </div>
    </div>
  );
}

// ─── Componente Principal HowItWorks ──────────────────────────────────────────

export default function HowItWorks({ steps = DEFAULT_STEPS }: { steps?: HowItWorksStep[] }) {
  const [activeStep, setActiveStep] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const shouldReduce = useReducedMotion();

  const displaySteps = steps.length > 0 ? steps : DEFAULT_STEPS;

  // Seguimiento continuo del scroll dentro de la sección
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 65%", "end 45%"],
  });

  // Física de resorte suave para el avance vertical
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 28,
    restDelta: 0.001,
  });

  // Progreso individual para cada uno de los 3 segmentos entre los 4 nodos
  const seg0 = useTransform(smoothProgress, [0.04, 0.35], [0, 1]);
  const seg1 = useTransform(smoothProgress, [0.35, 0.68], [0, 1]);
  const seg2 = useTransform(smoothProgress, [0.68, 0.96], [0, 1]);
  const segmentScales = [seg0, seg1, seg2];

  // Sincronización del paso activo según la posición de la línea
  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.28) {
      setActiveStep(0);
    } else if (latest < 0.58) {
      setActiveStep(1);
    } else if (latest < 0.84) {
      setActiveStep(2);
    } else {
      setActiveStep(3);
    }
  });

  return (
    <section
      ref={sectionRef}
      id="como-funciona"
      className="py-24 md:py-32 px-4 sm:px-6 bg-transparent relative overflow-hidden"
    >
      <div className="max-w-[940px] mx-auto relative z-10">

        {/* Encabezado Editorial Estilo Tesla */}
        <SectionReveal className="text-center mb-14 lg:mb-18">
          <SectionRevealItem
            as="h2"
            className="font-sans text-3xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-[-0.025em] text-white"
          >
            De idea a certeza en menos de 3 minutos
          </SectionRevealItem>
          <SectionRevealItem
            as="p"
            className="font-sans text-base sm:text-lg max-w-xl mx-auto font-normal leading-relaxed text-slate-300"
          >
            Automatizamos lo que las consultoras tardan semanas en estructurar. Sin juntas, sin estimaciones al aire y con datos duros de tu mercado local.
          </SectionRevealItem>
        </SectionReveal>

        {/* ── PIPELINE VERTICAL ESTILO IPHONE (FONDO SÓLIDO, TIPOGRAFÍA GEOMÉTRICA) ── */}
        <div className="relative flex flex-col">
          {displaySteps.map((step, idx) => {
            const isLast = idx === displaySteps.length - 1;
            const isCurrent = activeStep === idx;
            const isPassed = activeStep >= idx;

            // Enriquecer step con defaults si viene de prop externa
            const fullStep: HowItWorksStep = {
              ...DEFAULT_STEPS[idx % DEFAULT_STEPS.length],
              ...step,
            };

            return (
              <div
                key={fullStep.n}
                className="flex items-start gap-4 sm:gap-6 relative group"
              >
                {/* ── COLUMNA IZQUIERDA: Nodo Circular iPhone & Línea Conectora ── */}
                <div className="flex flex-col items-center flex-shrink-0 relative self-stretch">

                  {/* Nodo Numérico Circular iPhone (Tipografía Sans Geométrica, Cero Monospace) */}
                  <div className="relative z-10">
                    <button
                      type="button"
                      onClick={() => setActiveStep(idx)}
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-sans text-sm sm:text-base font-bold tabular-nums transition-all duration-200 cursor-pointer ${
                        isCurrent
                          ? "bg-orange-500 text-white shadow-[0_0_24px_rgba(249,115,22,0.55)] ring-4 ring-orange-500/25 scale-105"
                          : isPassed
                          ? "bg-orange-500 text-white shadow-[0_0_14px_rgba(249,115,22,0.3)] border border-orange-400/40"
                          : "bg-[#1C1C1E] border border-white/[0.08] text-slate-400 hover:text-orange-300 hover:border-orange-500/30"
                      }`}
                      aria-label={`Paso ${fullStep.n}: ${fullStep.title}`}
                    >
                      {fullStep.n}
                    </button>
                  </div>

                  {/* LÍNEA CONECTORA ENTRE NODOS */}
                  {!isLast && (
                    <div className="w-[2px] flex-1 bg-white/[0.08] my-2 relative overflow-hidden rounded-full min-h-[64px]">
                      <motion.div
                        className="w-full bg-gradient-to-b from-orange-400 via-amber-400 to-orange-500 origin-top shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                        style={{
                          scaleY: shouldReduce ? (isPassed ? 1 : 0) : segmentScales[idx],
                          height: "100%",
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* ── COLUMNA DERECHA: Tarjeta Sólida iPhone (Sin animación de mouse) ── */}
                <div className={`flex-1 ${isLast ? "pb-0" : "pb-5 sm:pb-6"} pt-0.5`}>
                  <AppleStepCard
                    step={fullStep}
                    isCurrent={isCurrent}
                    isPassed={isPassed}
                    onClick={() => setActiveStep(idx)}
                  />
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
