"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, ShieldCheck } from "lucide-react";
import { SectionReveal, SectionRevealItem } from "@/components/motion/SectionReveal";

export interface PricingPlan {
  name: string;
  price: string;
  period?: string;
  desc: string;
  highlight?: boolean;
  features: string[];
  cta: string;
  href: string;
  stripePlan?: string;
}

interface PricingCardProps {
  plan: PricingPlan;
  annualBilling: boolean;
}

function PricingCard({ plan, annualBilling }: PricingCardProps) {
  const displayPrice =
    annualBilling && plan.price !== "$0"
      ? plan.name === "Negocio"
        ? "$479"
        : "$959"
      : plan.price;

  return (
    <div
      className={`relative rounded-[26px] p-6 sm:p-7 lg:p-8 flex flex-col justify-between overflow-hidden transition-colors duration-200 ${
        plan.highlight
          ? "bg-[#222329] border border-cyan-400/40 shadow-[0_8px_32px_rgba(0,0,0,0.45)] z-10"
          : "bg-[#1C1C1E] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:border-white/[0.14]"
      }`}
    >
      {/* Contenido */}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-sans font-semibold uppercase tracking-wider text-slate-300">
            {plan.name}
          </span>
          {plan.highlight && (
            <span className="inline-flex items-center gap-1 bg-cyan-500/10 border border-cyan-400/25 text-cyan-300 text-[11px] font-sans font-semibold px-2.5 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Más Recomendado
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-white font-sans tracking-tight tabular-nums">
            {displayPrice}
          </span>
          {plan.period && (
            <span className="text-sm font-sans font-normal text-slate-400">
              {plan.period}
            </span>
          )}
        </div>

        <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed font-sans font-normal min-h-[40px] mb-6">
          {plan.desc}
        </p>

        {/* Lista de Features */}
        <ul className="space-y-3 mb-7 pt-5 border-t border-white/[0.06]">
          {plan.features.map((f: string) => (
            <li key={f} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-200 font-sans">
              <div className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 mt-0.5 text-emerald-400">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span className="leading-tight">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Botón CTA Apple Pill */}
      <div className="relative z-10 pt-2">
        <Link
          href={plan.href}
          className={`flex items-center justify-center gap-2 h-11 px-5 rounded-full font-sans font-semibold text-xs sm:text-[13px] transition-all duration-200 active:scale-[0.98] group/btn cursor-pointer ${
            plan.highlight
              ? "bg-gradient-to-b from-[#EF4444] via-[#DC2626] to-[#B91C1C] text-white hover:brightness-110 shadow-[0_4px_18px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.3)] border border-white/20"
              : "bg-white/[0.06] text-slate-200 hover:text-white hover:bg-white/[0.12] border border-white/[0.12] hover:border-white/[0.22]"
          }`}
        >
          <span>{plan.cta}</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/btn:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}

export default function Pricing({ plans = [] }: { plans?: PricingPlan[] }) {
  const [annualBilling, setAnnualBilling] = useState(false);

  return (
    <section id="precios" className="py-24 px-4 sm:px-6 bg-transparent relative overflow-hidden">
      <div className="max-w-[1240px] mx-auto relative z-10">

        {/* Encabezado Editorial Estilo Apple / Tesla */}
        <SectionReveal className="text-center mb-12 lg:mb-16">
          <SectionRevealItem
            as="h2"
            className="font-sans text-3xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-[-0.025em] text-white"
          >
            El costo de no validar a tiempo
          </SectionRevealItem>
          <SectionRevealItem
            as="p"
            className="font-sans text-base sm:text-lg max-w-xl mx-auto font-normal leading-relaxed text-slate-300"
          >
            Un error de validación cuesta meses de capital y desgaste. Empieza gratis sin tarjeta de crédito y escala a herramientas operativas cuando lo requieras.
          </SectionRevealItem>
        </SectionReveal>

        {/* Selector de Facturación (Mensual / Anual) */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <div className="flex items-center p-1 rounded-full bg-[#1C1C1E] border border-white/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.3)]">
            <button
              type="button"
              onClick={() => setAnnualBilling(false)}
              className={`px-4 py-1.5 rounded-full text-xs font-sans font-medium transition-all cursor-pointer ${
                !annualBilling
                  ? "bg-white text-[#070E17] font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Facturación Mensual
            </button>
            <button
              type="button"
              onClick={() => setAnnualBilling(true)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-sans font-medium transition-all cursor-pointer ${
                annualBilling
                  ? "bg-white text-[#070E17] font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Pago Anual</span>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 rounded-full">
                -20%
              </span>
            </button>
          </div>
        </div>

        {/* Rejilla de 3 Planes de Precios */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-stretch">
          {plans.map((p) => (
            <PricingCard key={p.name} plan={p} annualBilling={annualBilling} />
          ))}
        </div>

      </div>
    </section>
  );
}
