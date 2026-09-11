'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PlatformBadge } from './MarketingSocialIcons';

export type AmbitoTendencia = 'Global' | 'Nacional' | 'Sector';

/**
 * Forma TOLERANTE de la tendencia tal y como llega en `calendario_data.tendencias`.
 *
 * Todo es opcional a propósito: los análisis generados antes de ampliar el
 * contrato (backend/src/services/marketing/types.ts) solo traen
 * `plataforma / tendencia / score / hashtags / justificacion`, y esta sección
 * debe seguir renderizándolos sin reventar.
 */
export interface TendenciaViral {
  plataforma?: string;
  plataformas?: string[];
  tendencia?: string;
  nombre?: string;
  score?: number;
  viralidad?: number;
  hashtags?: string[];
  justificacion?: string;
  descripcion?: string;
  gancho?: string;
  formato?: string;
  cta?: string;
  engagement?: string;
  views?: string;
  fecha?: string | null;
  ambito?: string;
}

/** Tendencia ya normalizada: lo que consume el render. */
interface Tendencia {
  id: string;
  nombre: string;
  fecha?: string;
  plataformas: string[];
  viralidad: number;
  engagement?: string;
  views?: string;
  descripcion: string;
  hashtags: string[];
  gancho?: string;
  formato?: string;
  cta?: string;
  ambito: AmbitoTendencia;
}

const PLATFORM_COLOR: Record<string, string> = {
  TikTok: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Instagram: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'Instagram Reels': 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  LinkedIn: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  X: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  'Google Ads': 'bg-green-500/20 text-green-300 border-green-500/30',
  Email: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'YouTube Shorts': 'bg-red-500/20 text-red-300 border-red-500/30',
  YouTube: 'bg-red-500/20 text-red-300 border-red-500/30',
  Facebook: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  WhatsApp: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Twitter: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Pinterest: 'bg-red-500/20 text-red-300 border-red-500/30',
  Threads: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  Telegram: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Snapchat: 'bg-yellow-400/20 text-yellow-200 border-yellow-400/30',
  Reddit: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

const AMBITOS: AmbitoTendencia[] = ['Global', 'Nacional', 'Sector'];

function AmbitoIcon({ ambito, className = 'w-3.5 h-3.5' }: { ambito: AmbitoTendencia; className?: string }) {
  if (ambito === 'Nacional') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    );
  }
  if (ambito === 'Sector') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

const CAT_COLOR: Record<AmbitoTendencia, { border: string; active: string; text: string; bg: string }> = {
  Global: {
    border: 'border-cyan-500/30',
    active: 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300',
    text: 'text-cyan-400',
    bg: 'bg-cyan-500/5',
  },
  Nacional: {
    border: 'border-emerald-500/30',
    active: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/5',
  },
  Sector: {
    border: 'border-purple-500/30',
    active: 'bg-purple-500/20 border-purple-400/50 text-purple-300',
    text: 'text-purple-400',
    bg: 'bg-purple-500/5',
  },
};

function limpio(v: unknown, max = 800): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, max) : undefined;
}

function textos(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, max);
}

/** Viralidad en escala 0-10. Fallback al `score` 0-100 de los análisis antiguos. */
function escalaViralidad(t: TendenciaViral): number {
  const bruto =
    typeof t.viralidad === 'number' && Number.isFinite(t.viralidad)
      ? t.viralidad
      : typeof t.score === 'number' && Number.isFinite(t.score)
        ? t.score / 10
        : 0;
  return Math.round(Math.min(10, Math.max(0, bruto)) * 10) / 10;
}

function normalizar(lista: TendenciaViral[]): Tendencia[] {
  return lista
    .filter((t): t is TendenciaViral => typeof t === 'object' && t !== null)
    .map((t, i): Tendencia => {
      const plataformas = textos(t.plataformas, 4);
      const principal = limpio(t.plataforma, 40);
      if (plataformas.length === 0 && principal) plataformas.push(principal);

      const descripcion = limpio(t.descripcion) ?? limpio(t.justificacion) ?? '';

      return {
        id: `tendencia-${i}`,
        nombre: limpio(t.nombre, 160) ?? limpio(t.tendencia, 160) ?? '',
        fecha: limpio(t.fecha ?? undefined, 20),
        plataformas: plataformas.length > 0 ? plataformas : ['Multiplataforma'],
        viralidad: escalaViralidad(t),
        engagement: limpio(t.engagement, 20),
        views: limpio(t.views, 20),
        descripcion,
        hashtags: textos(t.hashtags, 6),
        gancho: limpio(t.gancho, 400),
        formato: limpio(t.formato, 200),
        cta: limpio(t.cta, 120),
        ambito: ((): AmbitoTendencia => {
          const a = limpio(t.ambito, 20)?.toLowerCase();
          if (a?.startsWith('nac')) return 'Nacional';
          if (a?.startsWith('sec') || a?.startsWith('gir')) return 'Sector';
          return 'Global';
        })(),
      };
    })
    .filter((t) => t.nombre.length > 0);
}

function ViralityBar({ score }: { score: number }) {
  const color =
    score >= 9
      ? 'from-rose-500 to-amber-400'
      : score >= 8
        ? 'from-amber-500 to-yellow-300'
        : 'from-blue-500 to-cyan-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-1000`}
          style={{ width: `${(Math.min(10, Math.max(0, score)) / 10) * 100}%` }}
        />
      </div>
      <span
        className={`text-[11px] font-black tabular-nums ${score >= 9 ? 'text-rose-400' : score >= 8 ? 'text-amber-400' : 'text-blue-400'}`}
      >
        {score}/10
      </span>
    </div>
  );
}

interface TendenciasSectionProps {
  /** `calendario_data.tendencias` del análisis. Si viene vacío no se renderiza nada. */
  tendencias: TendenciaViral[];
  pais?: string;
  giro?: string;
}

export default function TendenciasSection({ tendencias, pais, giro }: TendenciasSectionProps) {
  const items = useMemo(() => normalizar(Array.isArray(tendencias) ? tendencias : []), [tendencias]);
  const disponibles = useMemo(
    () => AMBITOS.filter((a) => items.some((t) => t.ambito === a)),
    [items]
  );
  const [tabElegida, setTabElegida] = useState<AmbitoTendencia | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Los análisis en formato anterior pueden no traer tendencias: la sección
  // entera desaparece en lugar de mostrar una tarjeta vacía.
  if (items.length === 0) return null;

  // No se guarda el ámbito activo en el estado directamente: si el análisis solo
  // trae tendencias de un ámbito, la pestaña elegida podría no existir.
  const activeTab: AmbitoTendencia =
    tabElegida && disponibles.includes(tabElegida) ? tabElegida : disponibles[0];
  const filtered = items.filter((t) => t.ambito === activeTab);
  const c = CAT_COLOR[activeTab];

  const handleCopy = (id: string, text: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(() => {
        /* Portapapeles no disponible (contexto no seguro o permiso denegado). */
      });
  };

  const getTabLabel = (cat: AmbitoTendencia) => {
    if (cat === 'Nacional') return pais ? `Nacional · ${pais}` : 'Nacional';
    if (cat === 'Sector') return giro ? `Sector · ${giro}` : 'Sector';
    return 'Global';
  };

  const resumenAmbitos = disponibles
    .map((a) => {
      const count = items.filter((t) => t.ambito === a).length;
      const plural = a === 'Global' ? 'globales' : a === 'Nacional' ? 'nacionales' : 'sectoriales';
      return `${count} ${plural}`;
    })
    .join(' · ');

  return (
    <section
      className="gsap-fade-up relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0F17]"
    >
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <span className="w-1 h-5 rounded-full bg-marketing block" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                Tendencias de Mercado y Viralidad
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40 bg-white/[0.04] border border-white/[0.08] px-2.5 py-0.5 rounded-md">
                Detección IA
              </span>
            </div>
            <p className="text-[13px] text-white/45 ml-4">
              {items.length} {items.length === 1 ? 'tendencia analizada' : 'tendencias analizadas'} para tu categoría
              {resumenAmbitos ? ` · ${resumenAmbitos}` : ''}
            </p>
          </div>
          <div className="text-[11px] font-mono text-white/40 bg-white/[0.03] border border-white/[0.06] px-3 py-1 rounded-lg whitespace-nowrap">
            {items.length} identificadas
          </div>
        </div>

        {/* Tabs de ámbito — solo si hay más de uno */}
        {disponibles.length > 1 && (
          <div className="inline-flex gap-1 mb-6 p-1 rounded-xl border border-white/[0.08] bg-white/[0.02]" data-print="hide">
            {disponibles.map((cat) => {
              const active = activeTab === cat;
              const count = items.filter((t) => t.ambito === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTabElegida(cat)}
                  className={`relative z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all outline-none ${
                    active ? 'bg-white/[0.08] text-white border border-white/10 shadow-sm' : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  <AmbitoIcon ambito={cat} className="w-3.5 h-3.5" />
                  <span>{getTabLabel(cat)}</span>
                  <span className="text-[10px] font-mono opacity-50">
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Trend Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-white/[0.07] bg-[#0D131F] p-5 flex flex-col gap-3.5 transition-all duration-200 hover:border-white/15"
            >
              {/* Plataformas + fecha */}
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex flex-wrap gap-1.5">
                  {t.plataformas.map((p) => (
                    <PlatformBadge key={p} plataforma={p} size="xs" />
                  ))}
                </div>
                {t.fecha && (
                  <span className="text-[10px] font-mono text-white/30 whitespace-nowrap flex-shrink-0">
                    {t.fecha}
                  </span>
                )}
              </div>

              {/* Nombre */}
              <div>
                <p className="text-[13.5px] font-bold text-white leading-snug break-words">{t.nombre}</p>
              </div>

              {/* Índice de viralidad */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap text-[10px]">
                  <span className="font-semibold text-white/40 uppercase tracking-wider">
                    Score de Viralidad
                  </span>
                  <div className="flex items-center gap-2 text-white/50 font-mono">
                    {t.views && <span>{t.views} views</span>}
                    {t.engagement && <span>· {t.engagement} eng.</span>}
                  </div>
                </div>
                <ViralityBar score={t.viralidad} />
              </div>

              {/* Descripción */}
              {t.descripcion && (
                <p className="text-[12px] text-white/55 leading-relaxed">{t.descripcion}</p>
              )}

              {/* Gancho */}
              {t.gancho && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-1">
                    Gancho Publicitario
                  </p>
                  <p className="text-[12px] text-white/80 leading-relaxed italic break-words">"{t.gancho}"</p>
                </div>
              )}

              {/* Hashtags */}
              {t.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.hashtags.map((h) => (
                    <span
                      key={h}
                      className="text-[10px] font-mono text-white/45 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded"
                    >
                      {h.startsWith('#') ? h : `#${h}`}
                    </span>
                  ))}
                </div>
              )}

              {/* Formato */}
              {t.formato && (
                <div className="flex items-start gap-1.5 text-[11px] text-white/40">
                  <span className="font-semibold uppercase tracking-wider text-[9px] flex-shrink-0 mt-0.5">Formato:</span>
                  <span className="text-white/60 leading-relaxed">{t.formato}</span>
                </div>
              )}

              {/* CTA + copiar */}
              <div className="flex items-center gap-2 pt-2 mt-auto border-t border-white/[0.06]">
                <div className="flex-1 text-[11px] text-white/50 truncate">
                  {t.cta ? <span className="italic">CTA: {t.cta}</span> : null}
                </div>
                <button
                  type="button"
                  data-print="hide"
                  onClick={() =>
                    handleCopy(
                      t.id,
                      [
                        t.nombre,
                        t.gancho ? `\n${t.gancho}` : '',
                        t.hashtags.length > 0 ? `\n${t.hashtags.join(' ')}` : '',
                        t.formato ? `\nFormato: ${t.formato}` : '',
                        t.cta ? `CTA: ${t.cta}` : '',
                      ]
                        .filter(Boolean)
                        .join('\n')
                    )
                  }
                  className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border transition-all ${copiedId === t.id ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-white/[0.03] border-white/[0.08] text-white/50 hover:text-white hover:border-white/20'}`}
                >
                  {copiedId === t.id ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-5 border-t border-white/5 flex flex-wrap items-center gap-4 justify-between">
          <p className="text-[11px] text-white/25">
            * Tendencias, ganchos y cifras de alcance son estimaciones generadas por IA a partir de tu producto, categoría y
            país. Valídalas antes de comprometer presupuesto.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {disponibles.map((cat) => (
              <div key={cat} className="flex items-center gap-1.5">
                <AmbitoIcon ambito={cat} className="w-3 h-3 text-white/40" />
                <span className="text-[10px] text-white/30">
                  {items.filter((t) => t.ambito === cat).length} {cat.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}