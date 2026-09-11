"use client";
import { motion, useReducedMotion } from "framer-motion";

import { Reveal } from "@/components/ui";
import { MOTION_EASINGS, REVEAL_VIEWPORT } from "@/lib/motion/tokens";

export interface HowItWorksStep {
  n: string | number;
  title: string;
  desc: string;
}

export default function HowItWorks({ steps = [] }: { steps?: HowItWorksStep[] }) {
  const shouldReduce = useReducedMotion();

  return (
    <section className="py-32 px-6 bg-[#070E17] relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent pointer-events-none" />
      
      <div className="max-w-[1000px] mx-auto relative z-10 flex flex-col items-center">
        
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight text-white">
            De idea a decisión<br/><span className="text-white/40">en menos de 3 minutos.</span>
          </h2>
          <p className="text-lg text-white/50 max-w-xl mx-auto font-light leading-relaxed">
            Automatizamos lo que las consultoras tradicionales tardan semanas en hacer. Sin juntas, sin esperas, sin facturas de miles de pesos.
          </p>
        </div>

        {/* Elegant Timeline */}
        <div className="relative w-full max-w-2xl">
          <div className="flex flex-col">
            {steps.map((s, i) => (
              <div key={s.n} className="flex gap-8 items-stretch relative group">
                
                {/* Visual Line Col */}
                <div className="flex flex-col items-center w-12 flex-shrink-0 relative">
                  <div className="w-10 h-10 bg-[#0A121D] border border-white/10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] mt-1 group-hover:border-[#E74C3C] group-hover:text-[#E74C3C] group-hover:shadow-[0_0_20px_rgba(231,76,60,0.2)] transition-all duration-500 z-10">
                    {s.n}
                  </div>
                  
                  {i !== steps.length - 1 && (
                    <div className="w-[2px] bg-white/[0.05] flex-1 relative my-2">
                      {/* La línea se llena al entrar el paso en pantalla: marca
                          el avance del recorrido sin depender del scroll exacto. */}
                      <motion.div
                        initial={shouldReduce ? false : { height: 0 }}
                        whileInView={{ height: '100%' }}
                        viewport={REVEAL_VIEWPORT}
                        transition={{ duration: 0.7, ease: MOTION_EASINGS.easeOutCubic }}
                        className="absolute top-0 left-0 w-full bg-gradient-to-b from-[#E74C3C] to-[#E74C3C]/50 rounded-full"
                      />
                    </div>
                  )}
                </div>

                {/* Text Col */}
                <Reveal index={0} className="pt-2 pb-16">
                  <h4 className="text-2xl font-bold text-white mb-3 tracking-tight group-hover:text-brand-accent transition-colors duration-300">{s.title}</h4>
                  <p className="text-base text-white/50 font-light leading-relaxed">{s.desc}</p>
                </Reveal>
              </div>
            ))}
          </div>
        </div>
        
      </div>
    </section>
  );
}
