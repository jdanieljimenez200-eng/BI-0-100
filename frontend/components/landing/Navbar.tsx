"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Menu, X, ArrowRight } from "lucide-react";
import { ENTRADA_SEGURA, MOTION_SPRINGS } from "@/lib/motion/tokens";

const NAV_LINKS = [
  { href: "#modulos", label: "Módulos" },
  { href: "#herramientas", label: "Herramientas" },
  { href: "/network", label: "Profesiones & Oficios" },
  { href: "#como-funciona", label: "Cómo Funciona" },
  { href: "#precios", label: "Precios" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Cerrar menú móvil al cambiar tamaño de ventana a desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <header className="fixed top-0 inset-x-0 z-50 px-3 sm:px-6 pt-3 sm:pt-4 pointer-events-none">
      <nav
        className={`pointer-events-auto max-w-5xl mx-auto rounded-full border transition-all duration-300 px-4 sm:px-5 h-13 sm:h-14 flex items-center justify-between gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.55)] ${
          scrolled
            ? "bg-[#070E17]/92 backdrop-blur-xl border-white/[0.14] border-t-white/25"
            : "bg-[#090E17]/80 backdrop-blur-md border-white/[0.10] border-t-white/15"
        }`}
        aria-label="Navegación principal"
      >
        {/* 1. Izquierda: Marca / Logo (Ancho fijo proporcional para centrado perfecto) */}
        <div className="flex items-center flex-shrink-0 w-auto lg:w-[170px] justify-start">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-full py-1 pr-2"
            aria-label="BI 0 A 100 Inicio"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-b from-white to-slate-200 flex items-center justify-center shadow-[0_2px_8px_rgba(255,255,255,0.25)] transition-transform duration-200 active:scale-95 flex-shrink-0">
              <span className="text-[11px] text-[#070E17] font-black leading-none tracking-tight font-sans select-none">
                BI
              </span>
            </div>
            <span className="text-white font-bold text-sm sm:text-base tracking-tight font-sans whitespace-nowrap leading-none">
              0 A 100
            </span>
          </Link>
        </div>

        {/* 2. Centro: Los 5 enlaces unificados en cápsula horizontal (Una sola línea garantizada) */}
        <div className="hidden lg:flex items-center justify-center flex-1">
          <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.07]">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="h-7.5 px-3 rounded-full text-xs font-sans font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all whitespace-nowrap flex items-center leading-none"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 3. Derecha: Acciones (Ancho fijo proporcional para centrado perfecto) */}
        <div className="flex items-center justify-end gap-2 sm:gap-2.5 flex-shrink-0 w-auto lg:w-[170px]">
          <Link
            href="/auth/login"
            className="hidden xl:inline-flex items-center h-8 px-2.5 rounded-full text-xs font-sans font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap leading-none"
          >
            Iniciar sesión
          </Link>

          <Link
            href="/auth/signup"
            className="relative inline-flex items-center justify-center h-8 px-3.5 sm:px-4 rounded-full text-xs font-sans font-semibold text-white bg-gradient-to-b from-[#EF4444] via-[#DC2626] to-[#B91C1C] hover:brightness-110 active:scale-[0.98] transition-all duration-200 shadow-[0_2px_14px_rgba(239,68,68,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] border border-white/20 overflow-hidden group cursor-pointer whitespace-nowrap leading-none"
          >
            <span className="relative z-10 flex items-center gap-1.5">
              <span>Comenzar gratis</span>
              <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5 flex-shrink-0" />
            </span>
          </Link>

          {/* Botón de Menú Móvil / Tablet (< 1024px) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.1] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer flex-shrink-0"
            aria-expanded={mobileMenuOpen}
            aria-label="Abrir menú de navegación"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* Menú Desplegable Móvil / Tablet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            {...ENTRADA_SEGURA}
            initial={shouldReduce ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduce ? undefined : { opacity: 0, y: -8 }}
            transition={MOTION_SPRINGS.snappy}
            className="pointer-events-auto lg:hidden max-w-5xl mx-auto mt-2 rounded-2xl bg-[#070E17]/95 backdrop-blur-2xl border border-white/[0.12] p-4 shadow-2xl flex flex-col gap-1.5"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-200 hover:text-white hover:bg-white/[0.06] transition-colors font-sans whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}

            <div className="h-px bg-white/[0.08] my-1" />

            <Link
              href="/auth/login"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors font-sans whitespace-nowrap"
            >
              Iniciar sesión
            </Link>

            <Link
              href="/auth/signup"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 h-11 px-5 rounded-full text-xs sm:text-sm font-sans font-semibold text-white bg-gradient-to-b from-[#EF4444] via-[#DC2626] to-[#B91C1C] border border-white/20 shadow-[0_2px_14px_rgba(239,68,68,0.38)] active:scale-[0.98] transition-all mt-2 whitespace-nowrap"
            >
              <span>Comenzar validación gratis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
