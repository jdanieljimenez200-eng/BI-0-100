'use client';

import Link from 'next/link';
import type { CategoriaExperto, ExpertoPublico } from '@/lib/network';
import { formatearTarifa } from '@/lib/network';

/** Paleta por categoría. Se conserva la del diseño original. */
export const ACENTO: Record<
  CategoriaExperto,
  { bg: string; borde: string; texto: string; sombra: string }
> = {
  legal: {
    bg: 'bg-[#7C3AED]/10',
    borde: 'border-[#7C3AED]/30',
    texto: 'text-[#A78BFA]',
    sombra: 'shadow-[0_0_20px_rgba(124,58,237,0.25)]',
  },
  marketing: {
    bg: 'bg-blue-500/10',
    borde: 'border-blue-500/30',
    texto: 'text-blue-400',
    sombra: 'shadow-[0_0_20px_rgba(59,130,246,0.25)]',
  },
  ventas: {
    bg: 'bg-emerald-500/10',
    borde: 'border-emerald-500/30',
    texto: 'text-emerald-400',
    sombra: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
  },
  contabilidad: {
    bg: 'bg-teal-500/10',
    borde: 'border-teal-500/30',
    texto: 'text-teal-300',
    sombra: 'shadow-[0_0_20px_rgba(20,184,166,0.25)]',
  },
  diseno: {
    bg: 'bg-pink-500/10',
    borde: 'border-pink-500/30',
    texto: 'text-pink-300',
    sombra: 'shadow-[0_0_20px_rgba(236,72,153,0.25)]',
  },
  proveedores: {
    bg: 'bg-orange-500/10',
    borde: 'border-orange-500/30',
    texto: 'text-orange-300',
    sombra: 'shadow-[0_0_20px_rgba(249,115,22,0.25)]',
  },
  tecnologia: {
    bg: 'bg-cyan-500/10',
    borde: 'border-cyan-500/30',
    texto: 'text-cyan-300',
    sombra: 'shadow-[0_0_20px_rgba(6,182,212,0.25)]',
  },
};

function Estrellas({ valor, total }: { valor: number; total: number }) {
  // Sin reseñas no se pintan cinco estrellas apagadas, que se leen como "malo":
  // se dice que todavía no hay opiniones.
  if (total === 0) {
    return <span className="text-white/30 text-[10px]">Sin reseñas todavía</span>;
  }
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <svg
            key={s}
            className={`w-3 h-3 ${s <= Math.round(valor) ? 'text-amber-400' : 'text-white/15'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-amber-400 text-[11px] font-bold">{valor.toFixed(1)}</span>
      <span className="text-white/30 text-[10px]">
        ({total} {total === 1 ? 'reseña' : 'reseñas'})
      </span>
    </div>
  );
}

function Avatar({ experto, acento }: { experto: ExpertoPublico; acento: (typeof ACENTO)['legal'] }) {
  if (experto.avatar_url) {
    return (
      // Imagen de un tercero, servida desde su propio dominio: <img> en vez de
      // next/image para no exigir una lista blanca de hosts remotos.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={experto.avatar_url}
        alt=""
        className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-white/10"
      />
    );
  }
  const inicial = (experto.nombre_display || experto.nombre_comercial).trim().charAt(0).toUpperCase();
  return (
    <div
      className={`w-12 h-12 rounded-xl ${acento.bg} border ${acento.borde} flex items-center justify-center flex-shrink-0 ${acento.texto} font-extrabold text-lg`}
      aria-hidden="true"
    >
      {inicial || '·'}
    </div>
  );
}

export default function ExpertoCard({
  experto,
  basePath = '/net0',
}: {
  experto: ExpertoPublico;
  basePath?: string;
}) {
  const acento = ACENTO[experto.categoria] ?? ACENTO.legal;
  const tarifa = formatearTarifa(experto.tarifa_desde, experto.moneda);

  return (
    <div
      className={`relative group flex flex-col rounded-2xl border bg-white/[0.03] backdrop-blur-sm p-5 transition-all duration-300 hover:-translate-y-1 ${acento.borde} hover:bg-white/[0.05]`}
    >
      {/* Un anuncio tiene que decir que lo es, siempre y de forma visible. */}
      {experto.es_patrocinado && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full backdrop-blur">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Promocionado
        </div>
      )}

      {experto.portada_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={experto.portada_url}
          alt=""
          className="-mx-5 -mt-5 mb-4 h-28 w-[calc(100%+2.5rem)] max-w-none rounded-t-2xl object-cover"
        />
      )}

      <div className="flex items-start gap-3 mb-3">
        <Avatar experto={experto} acento={acento} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-white font-bold text-sm truncate">{experto.nombre_comercial}</h4>
            {experto.verificado && (
              <span
                title="0 a 100 comprobó su acreditación"
                className={`flex-shrink-0 ${acento.texto}`}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="sr-only">Acreditación comprobada</span>
              </span>
            )}
          </div>
          {(experto.ciudad || experto.especialidad) && (
            <p className="text-white/40 text-[11px] mt-0.5">
              {[experto.ciudad, experto.especialidad].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="mt-1">
            <Estrellas valor={experto.rating} total={experto.total_resenas} />
          </div>
        </div>
      </div>

      {experto.bio_corta && (
        <p className="text-white/50 text-xs leading-relaxed mb-3 line-clamp-2">{experto.bio_corta}</p>
      )}

      {experto.sub_especialidades.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {experto.sub_especialidades.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${acento.bg} ${acento.texto} border ${acento.borde}`}
            >
              {tag}
            </span>
          ))}
          {experto.sub_especialidades.length > 3 && (
            <span className="text-[9px] text-white/30 px-1 py-0.5">
              +{experto.sub_especialidades.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between text-xs text-white/30 gap-2">
          {/* Sin tarifa no se inventa un número ni se sugiere que sea gratis. */}
          <span className="truncate">
            {tarifa ? (
              <>
                Desde <span className="text-white/60 font-bold">{tarifa}</span>
              </>
            ) : (
              'Tarifa a consultar'
            )}
          </span>
          {experto.ofrece_consulta_gratis && (
            <span className="inline-flex items-center gap-1 text-emerald-400/70 text-[10px] font-medium flex-shrink-0">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Consulta gratis
            </span>
          )}
        </div>

        {/*
          Un enlace a la ficha, no un botón de "Solicitar cotización".
          El diseño original tenía un botón que solo cambiaba su propio texto a
          "Solicitud enviada" sin enviar nada: le decía al usuario que había
          contactado a alguien que ni se había enterado.
        */}
        <Link
          href={`${basePath}/${experto.id}`}
          className={`block w-full text-center py-2 rounded-lg text-xs font-bold transition-all duration-200 ${acento.bg} border ${acento.borde} ${acento.texto} hover:brightness-125`}
        >
          Ver perfil y contacto
        </Link>
      </div>
    </div>
  );
}
