'use client';

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
      className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#141416] border border-white/[0.08] shadow-sm flex-shrink-0"
    >
      <button
        type="button"
        onClick={() => onCambiarVista('grid')}
        aria-pressed={vista === 'grid'}
        title="Vista en Mosaico (Estilo Instagram Explore)"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-all cursor-pointer ${
          vista === 'grid'
            ? 'bg-white/[0.08] text-white border border-white/10 shadow-sm font-semibold'
            : 'text-zinc-400 hover:text-white hover:bg-white/[0.02]'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.8} />
        <span className="hidden sm:inline">Mosaico</span>
      </button>

      <button
        type="button"
        onClick={() => onCambiarVista('feed')}
        aria-pressed={vista === 'feed'}
        title="Vista en Feed Inmersivo (Estilo TikTok / Reels)"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-all cursor-pointer ${
          vista === 'feed'
            ? 'bg-white/[0.08] text-white border border-white/10 shadow-sm font-semibold'
            : 'text-zinc-400 hover:text-white hover:bg-white/[0.02]'
        }`}
      >
        <Rows3 className="w-3.5 h-3.5" strokeWidth={1.8} />
        <span className="hidden sm:inline">Feed Inmersivo</span>
      </button>
    </div>
  );
}
