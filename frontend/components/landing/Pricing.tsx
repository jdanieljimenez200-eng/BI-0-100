"use client";
import Link from "next/link";
import { Reveal } from "@/components/ui";

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

export default function Pricing({ plans = [] }: { plans?: PricingPlan[] }) {
  return (
    <section className="py-32 px-6 bg-[#070E17] relative">
      <div className="max-w-[1200px] mx-auto text-center mb-20">
         <h2 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight text-white">
           El costo de NO saber.
         </h2>
         <p className="text-lg text-white/50 font-light leading-relaxed max-w-2xl mx-auto">
           Un error de validación puede costarte todo tu capital. Un análisis de BI 0 A 100 vale lo que te podría ahorrar. Empieza gratis y sube cuando quieras.
         </p>
      </div>

      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((p, i) => (
          <Reveal
            key={p.name}
            index={i}
            className={`relative rounded-surface p-8 lg:p-10 flex flex-col justify-between transition-all duration-500 overflow-hidden group ${
              p.highlight
                ? 'bg-gradient-to-b from-[#0A121D] to-[#070E17] border border-[#E74C3C]/40 shadow-[0_40px_80px_rgba(231,76,60,0.15)] z-10 scale-100 md:scale-105'
                : 'bg-[#0A121D] border border-white/5 hover:bg-[#0C1623] hover:border-white/10'
            }`}
          >
            {p.highlight && (
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#E74C3C] to-transparent opacity-80" />
            )}

            <div>
              {p.highlight && (
                <span className="inline-block bg-[#E74C3C] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-6 shadow-[0_0_15px_rgba(231,76,60,0.4)]">
                  Más Popular
                </span>
              )}
              {!p.highlight && (
                <p className="text-sm font-bold uppercase tracking-widest mb-6 text-white/40">
                  {p.name}
                </p>
              )}
              {p.highlight && (
                <p className="text-sm font-bold uppercase tracking-widest mb-2 text-[#E74C3C]">
                  {p.name}
                </p>
              )}

              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-5xl font-extrabold text-white tracking-tighter">{p.price}</span>
                {p.period && <span className="text-sm font-medium text-white/40 uppercase tracking-widest">{p.period}</span>}
              </div>
              <p className="text-sm mb-10 text-white/50 font-light min-h-[50px] leading-relaxed">{p.desc}</p>

              <ul className="space-y-5 mb-10">
                {p.features.map((f: string) => (
                  <li key={f} className="flex items-start gap-4 text-sm text-white/70">
                    <svg className={`w-5 h-5 flex-shrink-0 ${p.highlight ? 'text-[#E74C3C]' : 'text-white/30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href={p.href}
              className={`block text-center py-4 rounded-control font-bold text-sm transition-all duration-300 ${
                p.highlight
                  ? 'bg-brand-accent text-white hover:bg-[#c0392b] hover:shadow-[0_0_30px_rgba(231,76,60,0.5)]'
                  : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
              }`}
            >
              {p.cta}
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
