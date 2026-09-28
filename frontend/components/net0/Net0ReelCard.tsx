'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Heart,
  MessageCircle,
  Share2,
  CheckCircle2,
  Sparkles,
  MapPin,
  Star,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ExpertoPublico } from '@/lib/network';
import { formatearTarifa, NOMBRE_CATEGORIA } from '@/lib/network';
import { ACENTO } from '@/components/network/ExpertoCard';

interface Net0ReelCardProps {
  experto: ExpertoPublico;
  basePath?: string;
}

const FAVORITOS_KEY = 'net0_favoritos';

export default function Net0ReelCard({
  experto,
  basePath = '/net0',
}: Net0ReelCardProps) {
  const acento = ACENTO[experto.categoria] ?? ACENTO.legal;
  const tarifa = formatearTarifa(experto.tarifa_desde, experto.moneda);
  const imagenFondo = experto.portada_url || experto.avatar_url;

  const [esFavorito, setEsFavorito] = useState(false);
  const [likesContador, setLikesContador] = useState(
    Math.floor((experto.rating || 4.5) * 14) + (experto.total_resenas || 1) * 3
  );
  const [bioExpandida, setBioExpandida] = useState(false);

  useEffect(() => {
    try {
      const favs: string[] = JSON.parse(localStorage.getItem(FAVORITOS_KEY) || '[]');
      if (favs.includes(experto.id)) {
        setEsFavorito(true);
      }
    } catch {
      // Ignorar errores de localStorage
    }
  }, [experto.id]);

  const alternarFavorito = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const favs: string[] = JSON.parse(localStorage.getItem(FAVORITOS_KEY) || '[]');
      if (esFavorito) {
        const nuevos = favs.filter((id) => id !== experto.id);
        localStorage.setItem(FAVORITOS_KEY, JSON.stringify(nuevos));
        setEsFavorito(false);
        setLikesContador((c) => Math.max(0, c - 1));
      } else {
        favs.push(experto.id);
        localStorage.setItem(FAVORITOS_KEY, JSON.stringify(favs));
        setEsFavorito(true);
        setLikesContador((c) => c + 1);
        toast.success(`Guardaste a ${experto.nombre_comercial} en tus favoritos`);
      }
    } catch {
      // Ignorar
    }
  };

  const compartir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = typeof window !== 'undefined' ? `${window.location.origin}${basePath}/${experto.id}` : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${experto.nombre_comercial} en Net0`,
          text: `Consulta el perfil y catálogo de servicios de ${experto.nombre_comercial} en Net0`,
          url,
        });
        return;
      } catch {
        // Fallback a copiar al portapapeles
      }
    }
    if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace del perfil copiado al portapapeles');
    }
  };

  return (
    <article className="relative w-full max-w-xl mx-auto rounded-3xl overflow-hidden border border-white/[0.08] bg-[#141416] shadow-[0_20px_60px_rgba(0,0,0,0.7)] transition-all duration-300 hover:border-white/15">
      {/* ── Media Principal Visual ── */}
      <div className="relative aspect-[4/3] sm:aspect-[16/10] w-full overflow-hidden bg-[#0A0A0C]">
        {imagenFondo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagenFondo}
            alt={experto.nombre_comercial}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 ease-out hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-[#18181B] flex items-center justify-center">
            <span className={`text-8xl font-sans font-black ${acento.texto} opacity-20 select-none`}>
              {(experto.nombre_display || experto.nombre_comercial).charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Degradado oscurecedor cinemático */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141416] via-black/20 to-black/60 pointer-events-none" />

        {/* Badges Superiores */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <span className="text-[11px] font-sans font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-black/70 border border-white/10 text-white backdrop-blur-none">
            {NOMBRE_CATEGORIA[experto.categoria]}
          </span>
          {experto.es_patrocinado && (
            <span className="flex items-center gap-1 text-[10px] font-sans font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">
              <Sparkles className="w-3 h-3" />
              <span>Destacado</span>
            </span>
          )}
        </div>

        {/* ── Riel Lateral de Acciones Rápidas (Estilo TikTok / Reels) ── */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col items-center gap-3.5">
          {/* Avatar con enlace */}
          <Link
            href={`${basePath}/${experto.id}`}
            title="Ver perfil completo"
            className="relative group/avatar focus:outline-none"
          >
            <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-emerald-400 to-cyan-400 group-hover/avatar:scale-110 transition-transform shadow-lg">
              <div className="w-full h-full rounded-full bg-[#141416] overflow-hidden flex items-center justify-center">
                {experto.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={experto.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-sans font-bold text-sm">
                    {(experto.nombre_display || experto.nombre_comercial).charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            {experto.verificado && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#141416] flex items-center justify-center border border-white/15 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            )}
          </Link>

          {/* Botón de Like / Favorito */}
          <button
            type="button"
            onClick={alternarFavorito}
            aria-label={esFavorito ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            className="flex flex-col items-center gap-1 group/like cursor-pointer focus:outline-none"
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                esFavorito
                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-500 scale-110'
                  : 'bg-black/60 border border-white/15 text-white/80 hover:text-white hover:bg-black/80'
              }`}
            >
              <Heart
                className={`w-5 h-5 transition-transform ${
                  esFavorito ? 'fill-rose-500 scale-110' : 'group-hover/like:scale-110'
                }`}
              />
            </div>
            <span className="text-[10px] font-sans font-bold text-white/80">{likesContador}</span>
          </button>

          {/* Botón de Chat / Consultar */}
          <Link
            href={`${basePath}/${experto.id}`}
            title="Consultar y contactar"
            className="flex flex-col items-center gap-1 group/wa cursor-pointer focus:outline-none"
          >
            <div className="w-11 h-11 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 flex items-center justify-center transition-all group-hover/wa:scale-110">
              <MessageCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-sans font-bold text-emerald-400">Chat</span>
          </Link>

          {/* Botón de Compartir */}
          <button
            type="button"
            onClick={compartir}
            aria-label="Compartir perfil"
            className="flex flex-col items-center gap-1 group/share cursor-pointer focus:outline-none"
          >
            <div className="w-11 h-11 rounded-full bg-black/60 border border-white/15 text-white/80 hover:text-white hover:bg-black/80 flex items-center justify-center transition-all group-hover/share:scale-110">
              <Share2 className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-sans font-bold text-white/80">Compartir</span>
          </button>
        </div>
      </div>

      {/* ── Contenido Inferior de la Tarjeta ── */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Cabecera del profesional */}
        <div className="space-y-1 pr-14">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-white font-sans font-extrabold text-lg sm:text-xl tracking-tight">
              {experto.nombre_comercial}
            </h2>
            {experto.verificado && (
              <span className="inline-flex items-center gap-1 text-[11px] font-sans font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verificado</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs font-sans text-zinc-400 flex-wrap">
            <span className="text-zinc-300 font-medium">{experto.especialidad}</span>
            {(experto.direccion || experto.ciudad) && (
              <span className="inline-flex items-center gap-1 text-zinc-400">
                <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <span className="truncate max-w-[200px]">
                  {[experto.direccion, experto.ciudad].filter(Boolean).join(', ')}
                </span>
              </span>
            )}
            {experto.total_resenas > 0 && (
              <div className="flex items-center gap-1 text-amber-400">
                <Star className="w-3 h-3 fill-amber-400" />
                <span className="font-bold">{experto.rating.toFixed(1)}</span>
                <span className="text-zinc-500">({experto.total_resenas})</span>
              </div>
            )}
          </div>
        </div>

        {/* Biografía corta expandible */}
        {experto.bio_corta && (
          <div className="text-zinc-300 text-xs sm:text-sm font-sans leading-relaxed">
            <p className={bioExpandida ? '' : 'line-clamp-2'}>{experto.bio_corta}</p>
            {experto.bio_corta.length > 120 && (
              <button
                type="button"
                onClick={() => setBioExpandida(!bioExpandida)}
                className="text-white/60 hover:text-white text-xs font-semibold mt-1 cursor-pointer"
              >
                {bioExpandida ? 'Mostrar menos' : 'Leer más'}
              </button>
            )}
          </div>
        )}

        {/* Chips de Sub-especialidades */}
        {experto.sub_especialidades.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {experto.sub_especialidades.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-sans font-medium px-2.5 py-1 rounded-lg bg-white/[0.04] text-zinc-300 border border-white/[0.08]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Tarifa y Botón Principal a Pantalla Completa */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/[0.08]">
          <div>
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-zinc-500 block">
              Tarifa estimada
            </span>
            {tarifa ? (
              <span className="text-sm font-sans font-bold text-white">
                Desde {tarifa}
              </span>
            ) : experto.ofrece_consulta_gratis ? (
              <span className="text-xs font-sans font-semibold text-emerald-400">
                Consulta inicial gratis
              </span>
            ) : (
              <span className="text-xs font-sans text-zinc-400">Tarifa a convenir</span>
            )}
          </div>

          <Link
            href={`${basePath}/${experto.id}`}
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl bg-white text-[#0A0A0C] font-sans font-bold text-xs sm:text-sm hover:bg-zinc-200 active:scale-98 transition-all shadow-md"
          >
            <span>Ver perfil y catálogo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
