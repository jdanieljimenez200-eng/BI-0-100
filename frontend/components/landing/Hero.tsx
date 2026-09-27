"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { ENTRADA_SEGURA, MOTION_DURATIONS, MOTION_EASINGS } from "@/lib/motion/tokens";

function heroEntrada(indice: number, reducido: boolean | null) {
  return {
    ...ENTRADA_SEGURA,
    initial: reducido ? false : ({ opacity: 0, y: 16 } as const),
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: MOTION_DURATIONS.slow,
      ease: MOTION_EASINGS.easeOutQuart,
      delay: 0.04 + indice * 0.08,
    },
  };
}

export default function Hero() {
  const shouldReduce = useReducedMotion();

  return (
    <section className="relative min-h-[85vh] flex items-center pt-32 sm:pt-40 pb-20 px-4 sm:px-6 overflow-hidden">
      <div className="max-w-[1360px] w-full mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[52%_48%] gap-12 lg:gap-12 items-center">

          {/* COLUMNA IZQUIERDA: Propuesta de Valor Directa */}
          <div className="flex flex-col items-start text-left">

            {/* Headline Editorial de Máxima Autoridad Estilo Tesla */}
            <motion.h1
              {...heroEntrada(0, shouldReduce)}
              className="font-sans text-4xl sm:text-6xl lg:text-[4.75rem] font-bold mb-6 tracking-[-0.025em] leading-[1.05] text-white"
            >
              Valida tu negocio con datos duros antes de arriesgar capital.
            </motion.h1>

            <motion.p
              {...heroEntrada(1, shouldReduce)}
              className="text-base sm:text-lg lg:text-xl max-w-xl mb-10 font-normal leading-relaxed text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400"
            >
              Mapea competidores locales en Google Maps, calcula tu{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-300 font-medium">
                punto de equilibrio financiero
              </span>{" "}
              y verifica normativas legales y fiscales en menos de 3 minutos.
            </motion.p>

            {/* CTAs */}
            <motion.div
              {...heroEntrada(2, shouldReduce)}
              className="flex flex-col sm:flex-row gap-3.5 mb-10 w-full sm:w-auto items-stretch sm:items-center"
            >
              <Link
                href="/auth/signup"
                className="relative inline-flex items-center justify-center gap-2.5 h-12 sm:h-[50px] px-8 rounded-full text-sm sm:text-[15px] font-sans font-semibold text-white bg-gradient-to-b from-[#EF4444] via-[#DC2626] to-[#B91C1C] hover:brightness-110 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_24px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.35)] border border-white/20 overflow-hidden group cursor-pointer"
              >
                <span>Comenzar validación gratis</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center gap-2 h-12 sm:h-[50px] px-7 rounded-full text-sm sm:text-[15px] font-sans font-medium text-slate-200 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] hover:border-white/[0.22] shadow-[0_2px_12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all duration-200 backdrop-blur-xl cursor-pointer"
              >
                Ver cómo funciona
              </a>
            </motion.div>

          </div>

          {/* COLUMNA DERECHA: Mockup de Estudio Flotante en Diagonal */}
          <div className="relative w-full flex justify-center lg:justify-end [perspective:1400px]">
            {/* Halo ambiental difuso sutil */}
            <div className="absolute -inset-4 bg-white/[0.02] blur-3xl rounded-3xl pointer-events-none" />
            
            {/* Sombra de levitación diagonal sincronizada */}
            <motion.div
              animate={
                shouldReduce
                  ? {}
                  : {
                      x: [0, 10, 0],
                      scale: [1, 0.88, 1],
                      opacity: [0.65, 0.35, 0.65],
                    }
              }
              transition={
                shouldReduce
                  ? { duration: 0 }
                  : {
                      duration: 6,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
              }
              className="absolute -bottom-10 inset-x-12 h-12 bg-black/80 blur-2xl rounded-full pointer-events-none -z-10"
            />

            {/* Contenedor con animación de entrada */}
            <motion.div
              {...ENTRADA_SEGURA}
              initial={shouldReduce ? false : { opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                duration: 0.8,
                ease: MOTION_EASINGS.easeOutQuart,
                delay: 0.15,
              }}
              className="relative w-full max-w-[760px] z-20 group"
            >
              {/* Tarjeta con efecto de flotación diagonal continua y perspectiva 3D */}
              <motion.div
                animate={
                  shouldReduce
                    ? { rotateX: 5, rotateY: -9, rotateZ: 2 }
                    : {
                        x: [0, 14, 0],
                        y: [0, -18, 0],
                        rotateX: [6, 3.5, 6],
                        rotateY: [-10, -6, -10],
                        rotateZ: [2, 3.2, 2],
                      }
                }
                transition={
                  shouldReduce
                    ? { duration: 0 }
                    : {
                        duration: 6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }
                }
                style={{ transformStyle: "preserve-3d" }}
                className="relative rounded-2xl border border-white/[0.12] bg-[#0A101C] p-2 sm:p-2.5 shadow-[0_32px_72px_rgba(0,0,0,0.85)] border-t-white/25 overflow-hidden transition-colors duration-300 group-hover:border-white/20 will-change-transform"
              >

                {/* Barra de ventana sobria */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-[#070D18]/80 mb-2 rounded-t-xl">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                  </div>
                  <span className="text-[11px] font-sans font-medium text-slate-400 tracking-tight flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                    app.bi0a100.com/estudio
                  </span>
                  <div className="w-12" />
                </div>

                {/* Imagen del Dashboard */}
                <div className="relative rounded-xl overflow-hidden bg-[#070E17] border border-white/[0.04]">
                  <Image
                    src="/hero_dashboard.png"
                    alt="Panel de Control BI 0 A 100"
                    width={1920}
                    height={1080}
                    className="w-full h-auto object-cover block"
                    priority
                  />
                </div>
              </motion.div>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
