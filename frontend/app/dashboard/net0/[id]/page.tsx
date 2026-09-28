'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  X,
  MessageCircle,
  Mail,
  Phone,
  Globe,
  Star,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { ACENTO } from '@/components/network/ExpertoCard';
import FormularioResena from '@/components/network/FormularioResena';
import {
  obtenerFicha,
  formatearTarifa,
  pesosMx,
  registrarContacto,
  NOMBRE_CATEGORIA,
  type Distribucion,
  type FichaExperto,
  type ImagenPerfil,
  type ResenaPublica,
} from '@/lib/network';
import { ENTRADA_SEGURA, MOTION_SPRINGS } from '@/lib/motion/tokens';

function Galeria({ imagenes }: { imagenes: ImagenPerfil[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    if (abierta === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(null);
      if (e.key === 'ArrowRight') setAbierta((i) => (i === null ? i : (i + 1) % imagenes.length));
      if (e.key === 'ArrowLeft') setAbierta((i) => (i === null ? i : (i - 1 + imagenes.length) % imagenes.length));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta, imagenes.length]);

  if (imagenes.length === 0) return null;
  const actual = abierta === null ? null : imagenes[abierta];

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#090E17]/85 backdrop-blur-xl p-6 shadow-sm">
      <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-400 mb-4">
        Galería de trabajos y proyectos
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {imagenes.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setAbierta(i)}
            className={`group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 cursor-pointer ${
              i === 0 && imagenes.length > 2 ? 'col-span-2 row-span-2 aspect-square sm:aspect-auto' : 'aspect-square'
            }`}
            aria-label={img.descripcion || `Ver imagen ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.descripcion}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {actual && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada"
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setAbierta(null)}
        >
          <figure className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={actual.url} alt={actual.descripcion} className="max-h-[80vh] w-auto mx-auto rounded-2xl object-contain shadow-2xl" />
            <figcaption className="flex items-center justify-between gap-3 mt-4 text-zinc-300 text-sm font-sans">
              <span className="min-w-0 truncate">{actual.descripcion}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setAbierta((i) => ((i ?? 0) - 1 + imagenes.length) % imagenes.length)}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
                  aria-label="Anterior"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="text-zinc-500 text-xs font-mono">
                  {(abierta ?? 0) + 1}/{imagenes.length}
                </span>
                <button
                  type="button"
                  onClick={() => setAbierta((i) => ((i ?? 0) + 1) % imagenes.length)}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
                  aria-label="Siguiente"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setAbierta(null)}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer ml-2"
                  aria-label="Cerrar visor"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

function Estrellas({ valor }: { valor: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${
            s <= Math.round(valor) ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'
          }`}
        />
      ))}
    </div>
  );
}

export default function FichaNet0DetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const shouldReduce = useReducedMotion();

  const [ficha, setFicha] = useState<FichaExperto | null>(null);
  const [resenas, setResenas] = useState<ResenaPublica[]>([]);
  const [distribucion, setDistribucion] = useState<Distribucion>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-existe' | 'error'>('cargando');

  const cargar = useCallback(async () => {
    if (!id) return;
    setEstado('cargando');
    try {
      const res = await obtenerFicha(id);
      setFicha(res.experto);
      setResenas(res.resenas);
      setDistribucion(res.distribucion);
      setEstado('ok');
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setEstado(status === 404 ? 'no-existe' : 'error');
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (estado === 'cargando') {
    return (
      <div className="w-full py-28 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
        <span className="text-xs font-sans">Cargando perfil Net0…</span>
      </div>
    );
  }

  if (estado !== 'ok' || !ficha) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <h2 className="text-xl font-sans font-bold text-white">
          {estado === 'no-existe' ? 'Ficha no disponible' : 'Error al cargar'}
        </h2>
        <p className="text-zinc-400 text-xs sm:text-sm font-sans leading-relaxed">
          {estado === 'no-existe'
            ? 'Puede que el perfil haya sido pausado, retirado o esté en proceso de revisión.'
            : 'Ocurrió un problema de conexión. Intenta nuevamente en unos instantes.'}
        </p>
        <Link
          href="/dashboard/net0"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-sans font-bold text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Directorio Net0</span>
        </Link>
      </div>
    );
  }

  const acento = ACENTO[ficha.categoria] ?? ACENTO.legal;
  const tarifa = formatearTarifa(ficha.tarifa_desde, ficha.moneda);
  const hayContacto = Boolean(ficha.whatsapp || ficha.email_contacto || ficha.telefono || ficha.sitio_web);

  const enlaceWhatsapp = ficha.whatsapp
    ? `https://wa.me/${ficha.whatsapp}?text=${encodeURIComponent(
        `Hola, vi tu perfil «${ficha.nombre_comercial}» en Net0 de BI 0 A 100 y me gustaría consultar sobre tus servicios.`
      )}`
    : null;

  return (
    <motion.div
      {...ENTRADA_SEGURA}
      initial={shouldReduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_SPRINGS.gentle}
      className="w-full max-w-5xl mx-auto space-y-6 pb-16"
    >
      {/* ── Regreso y Categoría ── */}
      <div>
        <Link
          href={`/dashboard/net0?categoria=${ficha.categoria}`}
          className="inline-flex items-center gap-2 text-xs font-sans font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a {NOMBRE_CATEGORIA[ficha.categoria]} en Net0</span>
        </Link>
      </div>

      {/* ── Portada y Cabecera de Ficha ── */}
      <div className="relative rounded-2xl border border-white/[0.08] bg-[#090E17]/85 backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        {ficha.portada_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ficha.portada_url}
            alt=""
            className="w-full h-44 sm:h-60 object-cover border-b border-white/10"
          />
        )}

        <div className={`p-6 sm:p-8 flex flex-col sm:flex-row items-start gap-5 ${ficha.portada_url ? '-mt-12 sm:-mt-16' : ''}`}>
          {ficha.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ficha.avatar_url}
              alt=""
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-[#090E17] shadow-xl bg-[#090E17] flex-shrink-0"
            />
          ) : (
            <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl ${acento.bg} border ${acento.borde} ${acento.texto} flex items-center justify-center text-3xl font-sans font-extrabold flex-shrink-0 shadow-lg`}>
              {(ficha.nombre_display || ficha.nombre_comercial).charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-sans font-extrabold tracking-tight text-white">
                {ficha.nombre_comercial}
              </h1>
              {ficha.verificado && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-sans font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Acreditación verificada</span>
                </span>
              )}
              {ficha.es_patrocinado && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  <span>Destacado</span>
                </span>
              )}
            </div>

            <p className="text-zinc-400 text-xs sm:text-sm font-sans">
              {[ficha.especialidad, ficha.ciudad, ficha.pais].filter(Boolean).join(' · ')}
            </p>

            <div className="flex items-center gap-2 pt-1">
              {ficha.total_resenas > 0 ? (
                <>
                  <Estrellas valor={ficha.rating} />
                  <span className="text-amber-400 text-xs font-bold font-sans">{ficha.rating.toFixed(1)}</span>
                  <span className="text-zinc-500 text-xs font-sans">
                    ({ficha.total_resenas} {ficha.total_resenas === 1 ? 'reseña' : 'reseñas'})
                  </span>
                </>
              ) : (
                <span className="text-zinc-500 text-xs font-sans">Sin reseñas todavía</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Cuerpo: Detalle + Panel de Contacto Directo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Columna Principal */}
        <div className="space-y-6">
          {/* Biografía */}
          {(ficha.bio_larga || ficha.bio_corta) && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#090E17]/85 backdrop-blur-xl p-6 shadow-sm space-y-3">
              <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-400">
                Sobre {ficha.nombre_display || ficha.nombre_comercial}
              </h2>
              <p className="text-zinc-300 text-xs sm:text-sm font-sans leading-relaxed whitespace-pre-line">
                {ficha.bio_larga || ficha.bio_corta}
              </p>

              {ficha.sub_especialidades.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-3">
                  {ficha.sub_especialidades.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] font-sans font-medium px-2.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-400 border border-white/[0.08]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Galería de Trabajos */}
          <Galeria imagenes={ficha.imagenes} />

          {/* Servicios y Tarifas */}
          {ficha.servicios.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#090E17]/85 backdrop-blur-xl p-6 shadow-sm space-y-4">
              <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-400">
                Servicios y Cotizaciones
              </h2>
              <div className="divide-y divide-white/[0.06]">
                {ficha.servicios.map((s) => (
                  <div key={s.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-white text-xs sm:text-sm font-sans font-semibold">{s.titulo}</h3>
                      {s.descripcion && (
                        <p className="text-zinc-400 text-xs font-sans mt-0.5 leading-relaxed">{s.descripcion}</p>
                      )}
                    </div>
                    {s.precio && (
                      <span className="text-xs font-sans font-bold text-white whitespace-nowrap bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.08]">
                        {pesosMx(s.precio)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reseñas y Formulario */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#090E17]/85 backdrop-blur-xl p-6 shadow-sm space-y-5">
            <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-400">
              Reseñas de Clientes ({ficha.total_resenas})
            </h2>

            {resenas.length > 0 ? (
              <div className="space-y-4 divide-y divide-white/[0.06]">
                {resenas.map((r) => (
                  <div key={r.id} className="pt-3.5 first:pt-0 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white font-sans font-semibold">{r.autor_nombre}</span>
                      <Estrellas valor={r.rating} />
                    </div>
                    <p className="text-zinc-300 text-xs sm:text-sm font-sans leading-relaxed">{r.comentario}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-xs font-sans">Todavía no hay reseñas públicas para este perfil.</p>
            )}

            <div className="pt-4 border-t border-white/[0.06]">
              <FormularioResena expertoId={ficha.id} alPublicar={cargar} />
            </div>
          </div>
        </div>

        {/* Columna Lateral de Contacto Directo */}
        <div className="space-y-4 sticky top-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#090E17]/90 backdrop-blur-xl p-5 shadow-lg space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400">
                Tarifa referencial
              </span>
              <p className="text-xl font-sans font-extrabold text-white">
                {tarifa ? `Desde ${tarifa}` : 'A consultar'}
              </p>
              {ficha.ofrece_consulta_gratis && (
                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-sans font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Primera consulta / diagnóstico gratis</span>
                </span>
              )}
            </div>

            {/* Botón WhatsApp Directo */}
            {enlaceWhatsapp && (
              <a
                href={enlaceWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => registrarContacto(ficha.id, 'whatsapp')}
                className="flex items-center justify-center gap-2 w-full h-11 rounded-xl text-xs sm:text-sm font-sans font-bold text-white bg-[#25D366] hover:brightness-110 active:scale-95 transition-all shadow-[0_2px_12px_rgba(37,211,102,0.3)] cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-white text-transparent" />
                <span>Contactar por WhatsApp</span>
              </a>
            )}

            {/* Datos de contacto secundarios */}
            {hayContacto && (
              <div className="pt-3 border-t border-white/[0.08] space-y-2.5 text-xs font-sans">
                {ficha.email_contacto && (
                  <a
                    href={`mailto:${ficha.email_contacto}`}
                    onClick={() => registrarContacto(ficha.id, 'email')}
                    className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="truncate">{ficha.email_contacto}</span>
                  </a>
                )}
                {ficha.telefono && (
                  <a
                    href={`tel:${ficha.telefono}`}
                    onClick={() => registrarContacto(ficha.id, 'telefono')}
                    className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{ficha.telefono}</span>
                  </a>
                )}
                {ficha.sitio_web && (
                  <a
                    href={ficha.sitio_web}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => registrarContacto(ficha.id, 'web')}
                    className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="truncate">Sitio web oficial</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
