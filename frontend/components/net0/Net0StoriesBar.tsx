'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Compass,
  Scale,
  Calculator,
  TrendingUp,
  Palette,
  ShoppingBag,
  Package,
  Code2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import {
  CATEGORIAS,
  NOMBRE_CATEGORIA,
  type CategoriaExperto,
  type ExpertoPublico,
} from '@/lib/network';

const ICONO_CATEGORIA: Record<CategoriaExperto, React.ElementType> = {
  legal: Scale,
  contabilidad: Calculator,
  marketing: TrendingUp,
  diseno: Palette,
  ventas: ShoppingBag,
  proveedores: Package,
  tecnologia: Code2,
};

interface Net0StoriesBarProps {
  categoriaSeleccionada: CategoriaExperto | '';
  onSeleccionarCategoria: (cat: CategoriaExperto | '') => void;
  destacados?: ExpertoPublico[];
}

export default function Net0StoriesBar({
  categoriaSeleccionada,
  onSeleccionarCategoria,
  destacados = [],
}: Net0StoriesBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full relative group/bar">
      {/* Contenedor con scroll horizontal táctil y snap */}
      <div
        ref={scrollRef}
        className="flex items-center gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1 px-1 scrollbar-none snap-x scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* ── 1. Burbuja "Todos" ── */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onSeleccionarCategoria('')}
          className="flex flex-col items-center gap-1.5 flex-shrink-0 group cursor-pointer snap-start focus:outline-none"
        >
          <div
            className={`w-16 h-16 rounded-full p-[2.5px] transition-all duration-300 ${
              categoriaSeleccionada === ''
                ? 'bg-gradient-to-tr from-emerald-400 via-teal-300 to-cyan-400 scale-105 shadow-[0_0_18px_rgba(16,185,129,0.4)] animate-net0-pulse-glow'
                : 'border border-white/10 group-hover:border-white/25 bg-white/[0.02]'
            }`}
          >
            <div className="w-full h-full rounded-full bg-[#141416] flex items-center justify-center transition-colors group-hover:bg-[#1C1C1E]">
              <Compass
                className={`w-6 h-6 transition-all duration-300 group-hover:rotate-45 group-hover:scale-110 ${
                  categoriaSeleccionada === '' ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-white'
                }`}
                strokeWidth={categoriaSeleccionada === '' ? 2.2 : 1.8}
              />
            </div>
          </div>
          <span
            className={`text-[11px] font-sans font-medium tracking-tight text-center max-w-[70px] truncate transition-colors ${
              categoriaSeleccionada === '' ? 'text-emerald-400 font-bold' : 'text-zinc-400 group-hover:text-zinc-200'
            }`}
          >
            Explorar
          </span>
        </motion.button>

        {/* ── 2. Burbujas de Categorías (Stories) ── */}
        {CATEGORIAS.map((cat) => {
          const Icon = ICONO_CATEGORIA[cat];
          const activa = categoriaSeleccionada === cat;

          return (
            <motion.button
              key={cat}
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => onSeleccionarCategoria(activa ? '' : cat)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0 group cursor-pointer snap-start focus:outline-none"
            >
              <div
                className={`w-16 h-16 rounded-full p-[2.5px] transition-all duration-300 ${
                  activa
                    ? 'bg-gradient-to-tr from-emerald-400 via-teal-300 to-cyan-400 scale-105 shadow-[0_0_18px_rgba(16,185,129,0.4)] animate-net0-pulse-glow'
                    : 'border border-white/10 group-hover:border-white/25 bg-white/[0.02]'
                }`}
              >
                <div className="w-full h-full rounded-full bg-[#141416] flex items-center justify-center transition-colors group-hover:bg-[#1C1C1E]">
                  <Icon
                    className={`w-5 h-5 transition-transform duration-300 group-hover:scale-115 group-hover:-translate-y-0.5 ${
                      activa ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-white'
                    }`}
                    strokeWidth={activa ? 2.2 : 1.8}
                  />
                </div>
              </div>
              <span
                className={`text-[11px] font-sans font-medium tracking-tight text-center max-w-[74px] truncate transition-colors ${
                  activa ? 'text-emerald-400 font-bold' : 'text-zinc-400 group-hover:text-zinc-200'
                }`}
              >
                {NOMBRE_CATEGORIA[cat].split(' ')[0]}
              </span>
            </motion.button>
          );
        })}

        {/* Separador vertical si hay destacados */}
        {destacados.length > 0 && (
          <div className="h-12 w-[1px] bg-white/[0.08] flex-shrink-0 mx-1" />
        )}

        {/* ── 3. Burbujas de Creadores Destacados (Historias Activas) ── */}
        {destacados.slice(0, 6).map((experto) => {
          return (
            <Link
              key={experto.id}
              href={`/net0/${experto.id}`}
              className="flex flex-col items-center gap-1.5 flex-shrink-0 group snap-start focus:outline-none active:scale-92 transition-transform"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600 shadow-[0_0_14px_rgba(245,158,11,0.35)] group-hover:scale-108 transition-all duration-300">
                  <div className="w-full h-full rounded-full bg-[#141416] overflow-hidden flex items-center justify-center">
                    {experto.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={experto.avatar_url}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                    ) : (
                      <span className="text-white font-sans font-bold text-sm">
                        {(experto.nombre_display || experto.nombre_comercial).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Badge Sparkles de patrocinado */}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 border-2 border-[#141416] flex items-center justify-center shadow-xs transition-transform group-hover:rotate-12 group-hover:scale-110">
                  <Sparkles className="w-3 h-3 text-black fill-black" />
                </div>
              </div>

              <span className="text-[11px] font-sans font-medium tracking-tight text-zinc-300 group-hover:text-white max-w-[70px] truncate text-center transition-colors">
                {experto.nombre_comercial.split(' ')[0]}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
