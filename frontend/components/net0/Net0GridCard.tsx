'use client';

import Link from 'next/link';
import { CheckCircle2, Sparkles, Star } from 'lucide-react';
import type { ExpertoPublico } from '@/lib/network';
import { formatearTarifa, NOMBRE_CATEGORIA } from '@/lib/network';
import { ACENTO } from '@/components/network/ExpertoCard';

interface Net0GridCardProps {
  experto: ExpertoPublico;
  basePath?: string;
}

export default function Net0GridCard({
  experto,
  basePath = '/net0',
}: Net0GridCardProps) {
  const acento = ACENTO[experto.categoria] ?? ACENTO.legal;
  const tarifa = formatearTarifa(experto.tarifa_desde, experto.moneda);
  const imagenFondo = experto.portada_url || experto.avatar_url;

  return (
    <div className="relative group rounded-2xl overflow-hidden border border-white/[0.08] bg-[#141416] aspect-[4/5] flex flex-col justify-between transition-all duration-400 ease-out hover:-translate-y-1.5 hover:border-white/25 hover:shadow-[0_20px_50px_rgba(0,0,0,0.75)] cursor-pointer">
      {/* ── Imagen de fondo con zoom cinemático al hover ── */}
      {imagenFondo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagenFondo}
          alt={experto.nombre_comercial}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-108 opacity-80 group-hover:opacity-95"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-[#18181B] flex items-center justify-center">
          <span className={`text-6xl font-sans font-black ${acento.texto} opacity-20 select-none`}>
            {(experto.nombre_display || experto.nombre_comercial).charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      {/* ── Degradados superior e inferior de alto contraste ── */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/80 to-transparent pointer-events-none z-10" />

      {/* ── Badges Superiores ── */}
      <div className="relative z-20 p-3 sm:p-3.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-zinc-300 backdrop-blur-none transition-transform duration-200 group-hover:scale-105">
          {NOMBRE_CATEGORIA[experto.categoria].split(' ')[0]}
        </span>

        <div className="flex items-center gap-1">
          {experto.es_patrocinado && (
            <span className="flex items-center gap-1 text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 animate-pulse">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Destacado</span>
            </span>
          )}
          {experto.verificado && (
            <span
              title="Acreditación oficial comprobada por BI 0 A 100"
              className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 transition-transform duration-300 group-hover:scale-115"
            >
              <CheckCircle2 className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>

      {/* ── Enlace a pantalla completa transparente ── */}
      <Link
        href={`${basePath}/${experto.id}`}
        aria-label={`Ver perfil de ${experto.nombre_comercial}`}
        className="absolute inset-0 z-20 focus:outline-none focus:ring-2 focus:ring-white/40 rounded-2xl"
      />

      {/* ── Información Inferior ── */}
      <div className="relative z-30 p-3.5 sm:p-4 space-y-2 pointer-events-none">
        {/* Fila de Avatar + Nombre */}
        <div className="flex items-center gap-2.5">
          {experto.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={experto.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover border border-white/20 flex-shrink-0 bg-[#141416] transition-transform duration-300 group-hover:scale-110 group-hover:border-emerald-400/50"
            />
          ) : (
            <div
              className={`w-8 h-8 rounded-full ${acento.bg} border ${acento.borde} ${acento.texto} flex items-center justify-center font-sans font-bold text-xs flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}
            >
              {(experto.nombre_display || experto.nombre_comercial).charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="text-white font-sans font-bold text-sm truncate leading-snug group-hover:text-emerald-300 transition-colors">
              {experto.nombre_comercial}
            </h3>
            <p className="text-zinc-400 text-[11px] font-sans truncate">
              {[experto.especialidad, experto.direccion || experto.ciudad].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {/* Rating y Tarifa */}
        <div className="flex items-center justify-between gap-2 pt-0.5 text-xs font-sans">
          {experto.total_resenas > 0 ? (
            <div className="flex items-center gap-1 text-amber-400">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400 transition-transform duration-300 group-hover:scale-115" />
              <span className="font-bold text-[11px]">{experto.rating.toFixed(1)}</span>
              <span className="text-zinc-500 text-[10px]">({experto.total_resenas})</span>
            </div>
          ) : (
            <span className="text-zinc-500 text-[10px]">Nuevo en Net0</span>
          )}

          <div className="text-right">
            {tarifa ? (
              <span className="text-zinc-300 font-semibold text-[11px]">
                Desde <strong className="text-white">{tarifa}</strong>
              </span>
            ) : experto.ofrece_consulta_gratis ? (
              <span className="text-emerald-400 font-semibold text-[10px]">Consulta gratis</span>
            ) : (
              <span className="text-zinc-500 text-[10px]">Tarifa a consultar</span>
            )}
          </div>
        </div>

        {/* Acciones flotantes al hover (desktop) o siempre disponibles */}
        <div className="pt-2 flex items-center gap-2 pointer-events-auto">
          <Link
            href={`${basePath}/${experto.id}`}
            className="w-full py-2 px-3 rounded-xl text-xs font-sans font-bold text-center bg-white text-[#0A0A0C] hover:bg-zinc-100 hover:shadow-[0_0_18px_rgba(255,255,255,0.25)] active:scale-95 transition-all shadow-xs"
          >
            Ver perfil y contacto
          </Link>
        </div>
      </div>
    </div>
  );
}
