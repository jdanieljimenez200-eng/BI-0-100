"use client";

import Link from "next/link";
import { SectionReveal, SectionRevealItem } from "@/components/motion/SectionReveal";
import { ArrowRight } from "lucide-react";

export default function FinalCTA() {
  return (
    <section className="relative py-24 md:py-32 px-4 sm:px-6 text-center overflow-hidden bg-transparent">
      <div className="relative z-10 max-w-[800px] mx-auto">
        <SectionReveal className="mb-10">
          <SectionRevealItem
            as="h2"
            className="font-sans text-4xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-[-0.025em] leading-[1.05]"
          >
            Deja de suponer. Empieza con certeza comercial.
          </SectionRevealItem>

          <SectionRevealItem
            as="p"
            className="font-sans text-base sm:text-lg lg:text-xl font-normal leading-relaxed max-w-xl mx-auto text-slate-300"
          >
            Cada día que operas sin datos duros es capital en riesgo. Obtén tu diagnóstico 360° en menos de 3 minutos y toma decisiones fundamentadas.
          </SectionRevealItem>
        </SectionReveal>

        {/* CTA Principal Estilo Apple / Linear */}
        <div className="flex justify-center">
          <Link
            href="/auth/signup"
            className="relative inline-flex items-center justify-center gap-2.5 h-12 sm:h-[50px] px-8 rounded-full text-sm sm:text-[15px] font-sans font-semibold text-white bg-gradient-to-b from-[#EF4444] via-[#DC2626] to-[#B91C1C] hover:brightness-110 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_24px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.35)] border border-white/20 overflow-hidden group cursor-pointer"
          >
            <span>Validar mi negocio gratis</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
