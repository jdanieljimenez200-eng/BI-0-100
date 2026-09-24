'use client';
import { useMemo, useState } from 'react';
import { Flame, Calendar, Zap, Video } from 'lucide-react';
import type { TendenciaViral } from './TendenciasSection';
import { PlatformBadge } from './MarketingSocialIcons';

/**
 * Espejo TOLERANTE de `RecomendacionPlataforma`
 * (backend/src/services/marketing/types.ts).
 *
 * Todo opcional a propósito: el campo `calendario_data.recomendacion_plataforma`
 * es DERIVADO y solo existe en análisis generados después de la alineación por
 * plataformas activas (calendarioService.ts → alinearConPlataformasActivas).
 * Los anteriores no lo traen y la sección debe desaparecer sin romper nada.
 */
export interface RecomendacionPlataformaViral {
  plataforma?: string;
  score?: number;
  motivo?: string;
  tendencias?: TendenciaViral[];
}

/**
 * Tendencia ya normalizada. Tipo con NOMBRE (no inline) a propósito: el
 * predicado del `.filter` de abajo necesita referirse a él, y una forma inline
 * con propiedades opcionales no es asignable al literal que devuelve el `.map`
 * (TS la infiere con las claves presentes y valor `string | undefined`).
 */
interface TendenciaNormalizada {
  id: string;
  nombre: string;
  viralidad: number;
  hashtags: string[];
  gancho?: string;
  formato?: string;
  fecha?: string;
}

/** Recomendación ya normalizada: lo que consume el render. */
interface Recomendacion {
  id: string;
  plataforma: string;
  score: number;
  motivo: string;
  tendencias: TendenciaNormalizada[];
}

const PLATFORM_COLOR: Record<string, string> = {
  TikTok: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Instagram: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'Instagram Reels': 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  LinkedIn: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  X: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  YouTube: 'bg-red-500/20 text-red-300 border-red-500/30',
  'YouTube Shorts': 'bg-red-500/20 text-red-300 border-red-500/30',
  Facebook: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  WhatsApp: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Pinterest: 'bg-red-500/20 text-red-300 border-red-500/30',
  Threads: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  Telegram: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Snapchat: 'bg-yellow-400/20 text-yellow-200 border-yellow-400/30',
  Reddit: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

function limpio(v: unknown, max = 700): string | undefined {
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

function numero(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

function normalizar(raw: RecomendacionPlataformaViral[]): Recomendacion[] {
  return raw
    .map((r, i): Recomendacion | null => {
      if (typeof r !== 'object' || r === null) return null;
      const plataforma = limpio(r.plataforma, 40);
      // Sin nombre de plataforma la tarjeta no dice nada: se descarta.
      if (!plataforma) return null;

      const tendencias = (Array.isArray(r.tendencias) ? r.tendencias : [])
        .map((t, j): TendenciaNormalizada | null => {
          const nombre = limpio(t?.tendencia, 160) ?? limpio(t?.nombre, 160);
          if (!nombre) return null;
          const score = numero(t?.score, 0, 100);
          return {
            id: `${i}-${j}-${nombre.slice(0, 24)}`,
            nombre,
            viralidad:
              numero(t?.viralidad, 0, 10) ?? (score !== undefined ? Math.round(score) / 10 : 0),
            hashtags: textos(t?.hashtags, 5),
            gancho: limpio(t?.gancho, 400),
            formato: limpio(t?.formato, 200),
            fecha: limpio(t?.fecha, 20),
          };
        })
        .filter((t): t is TendenciaNormalizada => t !== null);

      if (tendencias.length === 0) return null;

      return {
        id: `${i}-${plataforma}`,
        plataforma,
        score: Math.round(numero(r.score, 0, 100) ?? 0),
        motivo:
          limpio(r.motivo, 500) ??
          `Detectamos señal relevante en ${plataforma}, una plataforma que no seleccionaste.`,
        tendencias,
      };
    })
    .filter((r): r is Recomendacion => r !== null)
    .sort((a, b) => b.score - a.score);
}

interface RecomendacionPlataformaSectionProps {
  /**
   * `calendario_data.recomendacion_plataforma` del análisis.
   * Si viene vacío o no existe, la sección entera no se renderiza.
   */
  recomendaciones?: RecomendacionPlataformaViral[];
}

export default function RecomendacionPlataformaSection({
  recomendaciones,
}: RecomendacionPlataformaSectionProps) {
  const items = useMemo(
    () => normalizar(Array.isArray(recomendaciones) ? recomendaciones : []),
    [recomendaciones]
  );
  const [abierta, setAbierta] = useState<string | null>(null);

  if (items.length === 0) return null;

  const totalTendencias = items.reduce((acc, r) => acc + r.tendencias.length, 0);

  return (
    <section
      className="gsap-fade-up relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0F17]"
    >
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <span className="w-1 h-5 rounded-full bg-amber-500/80 block" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                Oportunidades en Canales Adicionales
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-300/70 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-md">
                Canales no activos
              </span>
            </div>
            <p className="text-[13px] text-white/45 ml-4">
              {totalTendencias} {totalTendencias === 1 ? 'tendencia detectada' : 'tendencias detectadas'} en{' '}
              {items.length} {items.length === 1 ? 'canal alternativo' : 'canales alternativos'}
            </p>
          </div>
          <div className="text-[11px] font-mono text-white/40 bg-white/[0.03] border border-white/[0.06] px-3 py-1 rounded-lg">
            Expansión estratégica
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((r) => {
            const abiertaEsta = abierta === r.id;
            const panelId = `recomendacion-panel-${r.id}`;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-white/[0.07] bg-[#0D131F] p-5 flex flex-col gap-3.5 transition-all duration-200 hover:border-white/15"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <PlatformBadge plataforma={r.plataforma} size="sm" />
                  <span className="text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-md whitespace-nowrap">
                    Potencial: {r.score}/100
                  </span>
                </div>

                <p className="text-[12px] text-white/60 leading-relaxed break-words">{r.motivo}</p>

                <button
                  type="button"
                  data-print="hide"
                  aria-expanded={abiertaEsta}
                  aria-controls={panelId}
                  onClick={() => setAbierta(abiertaEsta ? null : r.id)}
                  className="self-start text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border bg-white/[0.03] border-white/[0.08] text-white/60 hover:border-white/20 hover:text-white transition-all focus:outline-none"
                >
                  {abiertaEsta ? 'Ocultar tendencias' : `Ver ${r.tendencias.length} tendencia${r.tendencias.length === 1 ? '' : 's'}`}
                </button>

                {/* En impresión se muestran siempre: el PDF no tiene interacción. */}
                <ul
                  id={panelId}
                  className={`flex flex-col gap-2.5 ${abiertaEsta ? 'flex' : 'hidden print:flex'}`}
                >
                  {r.tendencias.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-white/8 bg-black/25 p-3.5 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] font-black text-white leading-snug break-words">{t.nombre}</p>
                        <span className="text-[10px] font-black tabular-nums text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-rose-400" />
                          <span>{t.viralidad.toFixed(1)}/10</span>
                        </span>
                      </div>
                      {t.fecha && (
                        <span className="text-[10px] font-black text-white/40 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-white/40" /> {t.fecha}
                        </span>
                      )}
                      {t.gancho && (
                        <p className="text-[11px] text-amber-100/80 leading-relaxed italic break-words flex items-baseline gap-1.5">
                          <span className="text-amber-400 font-bold not-italic text-[10px] uppercase tracking-wider flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-400" /> Gancho:
                          </span>
                          <span>"{t.gancho}"</span>
                        </p>
                      )}
                      {t.formato && (
                        <p className="text-[11px] text-white/40 leading-relaxed break-words flex items-center gap-1">
                          <Video className="w-3 h-3 text-white/40" /> Formato: {t.formato}
                        </p>
                      )}
                      {t.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {t.hashtags.map((h) => (
                            <span
                              key={h}
                              className="text-[10px] font-bold text-marketing/80 bg-marketing/10 border border-marketing/20 px-2 py-0.5 rounded-md break-all"
                            >
                              {h.startsWith('#') ? h : `#${h}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-6 pt-5 border-t border-white/5 text-[11px] text-white/25">
          * Estas tendencias viven en redes que no marcaste como activas, por eso no se programó contenido para ellas en
          el calendario. Si decides abrir una de estas plataformas, vuelve a ejecutar el análisis incluyéndola para
          recibir publicaciones y copies específicos.
        </p>
      </div>
    </section>
  );
}