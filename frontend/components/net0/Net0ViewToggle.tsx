'use client';

import { motion } from 'framer-motion';
import { LayoutGrid, Rows3 } from 'lucide-react';

interface Net0ViewToggleProps {
  vista: 'grid' | 'feed';
  onCambiarVista: (vista: 'grid' | 'feed') => void;
}

export default function Net0ViewToggle({
  vista,
  onCambiarVista,
}: Net0ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Selector de visualización del directorio"
      className="relative inline-flex items-center gap-1 p-1 rounded-xl bg-[#141416] border border-white/[0.08] shadow-sm flex-shrink-0"
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={() => onCambiarVista('grid')}
        aria-pressed={vista === 'grid'}
        title="Vista en Mosaico (Estilo Instagram Explore)"
        className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors cursor-pointer ${
          vista === 'grid'
            ? 'text-white font-semibold'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        {vista === 'grid' && (
          <motion.div
            layoutId="viewToggleHighlight"
            className="absolute inset-0 rounded-lg bg-white/[0.08] border border-white/10 shadow-xs"
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
          />
        )}
        <LayoutGrid
          className={`w-3.5 h-3.5 relative z-10 transition-transform duration-200 ${
            vista === 'grid' ? 'scale-110 text-emerald-400' : 'text-zinc-400'
          }`}
          strokeWidth={vista === 'grid' ? 2.2 : 1.8}
        />
        <span className="relative z-10 hidden sm:inline">Mosaico</span>
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={() => onCambiarVista('feed')}
        aria-pressed={vista === 'feed'}
        title="Vista en Feed Inmersivo (Estilo TikTok / Reels)"
        className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors cursor-pointer ${
          vista === 'feed'
            ? 'text-white font-semibold'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        {vista === 'feed' && (
          <motion.div
            layoutId="viewToggleHighlight"
            className="absolute inset-0 rounded-lg bg-white/[0.08] border border-white/10 shadow-xs"
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
          />
        )}
        <Rows3
          className={`w-3.5 h-3.5 relative z-10 transition-transform duration-200 ${
            vista === 'feed' ? 'scale-110 text-emerald-400' : 'text-zinc-400'
          }`}
          strokeWidth={vista === 'feed' ? 2.2 : 1.8}
        />
        <span className="relative z-10 hidden sm:inline">Feed Inmersivo</span>
      </motion.button>
    </div>
  );
}

