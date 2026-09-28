'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  MessageCircle,
  Share2,
  CheckCircle2,
  Sparkles,
  MapPin,
  Star,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import Net0ProfileTabs from '@/components/net0/Net0ProfileTabs';
import {
  obtenerFicha,
  obtenerEnlaceGoogleMaps,
  formatearTarifa,
  registrarContacto,
  NOMBRE_CATEGORIA,
  type Distribucion,
  type FichaExperto,
  type ResenaPublica,
} from '@/lib/network';
import { ENTRADA_SEGURA, MOTION_SPRINGS } from '@/lib/motion/tokens';
import { ACENTO } from '@/components/network/ExpertoCard';

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

  const compartir = async () => {
    if (!ficha) return;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${ficha.nombre_comercial} en Net0`,
          text: `Consulta el portafolio y servicios de ${ficha.nombre_comercial} en Net0`,
          url,
        });
        return;
      } catch {
        // Fallback
      }
    }
    if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace del perfil copiado al portapapeles');
    }
  };

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
          href="/net0"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#0A0A0C] font-sans font-bold text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Directorio Net0</span>
        </Link>
      </div>
    );
  }

  const acento = ACENTO[ficha.categoria] ?? ACENTO.legal;
  const tarifa = formatearTarifa(ficha.tarifa_desde, ficha.moneda);
  const enlaceWhatsapp = ficha.whatsapp
    ? `https://wa.me/${ficha.whatsapp}?text=${encodeURIComponent(
        `Hola, vi tu perfil «${ficha.nombre_comercial}» en Net0 de BI 0 A 100 y me gustaría consultar sobre tus servicios.`
      )}`
    : null;
  const enlaceMaps = obtenerEnlaceGoogleMaps(ficha);

  return (
    <motion.div
      {...ENTRADA_SEGURA}
      initial={shouldReduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_SPRINGS.gentle}
      className="w-full max-w-4xl mx-auto space-y-6 pb-20"
    >
      {/* ── Regreso a Directorio ── */}
      <div>
        <Link
          href={`/net0?categoria=${ficha.categoria}`}
          className="inline-flex items-center gap-2 text-xs font-sans font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a {NOMBRE_CATEGORIA[ficha.categoria]} en Net0</span>
        </Link>
      </div>

      {/* ── Cabecera de Creador Estilo Instagram ── */}
      <div className="rounded-3xl border border-white/[0.08] bg-[#141416] overflow-hidden shadow-lg">
        {/* Banner de Portada */}
        <div className="relative w-full h-44 sm:h-56 bg-[#0A0A0C]">
          {ficha.portada_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ficha.portada_url}
              alt={ficha.nombre_comercial}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[#18181B] flex items-center justify-center">
              <span className={`text-9xl font-sans font-black ${acento.texto} opacity-10 select-none`}>
                {(ficha.nombre_display || ficha.nombre_comercial).charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#141416] via-transparent to-black/30 pointer-events-none" />
        </div>

        {/* Información Principal del Creador */}
        <div className="p-6 sm:p-8 relative -mt-16 sm:-mt-20 space-y-5">
          {/* Avatar Circular y Botones de Acción */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            {/* Avatar con aro de verificación */}
            <div className="relative">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full p-[3px] bg-[#141416] shadow-2xl">
                <div className="w-full h-full rounded-full overflow-hidden bg-[#18181B] flex items-center justify-center border-2 border-white/10">
                  {ficha.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ficha.avatar_url}
                      alt={ficha.nombre_comercial}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-3xl font-sans font-black">
                      {(ficha.nombre_display || ficha.nombre_comercial).charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {ficha.verificado && (
                <span
                  title="Acreditación profesional verificada"
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-[#141416] flex items-center justify-center border border-white/20 text-emerald-400"
                >
                  <CheckCircle2 className="w-4 h-4 fill-emerald-400 text-[#141416]" />
                </span>
              )}
            </div>

            {/* Fila de Estadísticas estilo Instagram */}
            <div className="flex items-center gap-6 sm:gap-8 py-2">
              <div className="text-center">
                <span className="text-base sm:text-lg font-sans font-black text-white block">
                  {ficha.imagenes.length}
                </span>
                <span className="text-[11px] font-sans text-zinc-400">Proyectos</span>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-base sm:text-lg font-sans font-black text-white">
                    {ficha.rating > 0 ? ficha.rating.toFixed(1) : '—'}
                  </span>
                </div>
                <span className="text-[11px] font-sans text-zinc-400">Calificación</span>
              </div>

              <div className="text-center">
                <span className="text-base sm:text-lg font-sans font-black text-white block">
                  {ficha.total_resenas}
                </span>
                <span className="text-[11px] font-sans text-zinc-400">Opiniones</span>
              </div>

              {ficha.servicios.length > 0 && (
                <div className="text-center">
                  <span className="text-base sm:text-lg font-sans font-black text-white block">
                    {ficha.servicios.length}
                  </span>
                  <span className="text-[11px] font-sans text-zinc-400">Servicios</span>
                </div>
              )}
            </div>
          </div>

          {/* Nombre y Bio */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-sans font-black tracking-tight text-white">
                {ficha.nombre_comercial}
              </h1>
              {ficha.es_patrocinado && (
                <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">
                  <Sparkles className="w-3 h-3" />
                  <span>Destacado</span>
                </span>
              )}
            </div>

            <p className="text-sm font-sans font-medium text-zinc-300">
              {ficha.especialidad}
            </p>

            <div className="flex items-center gap-3 text-xs font-sans text-zinc-400 flex-wrap pt-0.5">
              {(ficha.direccion || ficha.ciudad) && (
                <span className="inline-flex items-center gap-1.5 text-zinc-300">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>{[ficha.direccion, ficha.ciudad, ficha.pais].filter(Boolean).join(' · ')}</span>
                </span>
              )}

              {tarifa && (
                <span className="text-zinc-300 font-semibold">
                  Tarifa: <strong className="text-white">Desde {tarifa}</strong>
                </span>
              )}

              {ficha.ofrece_consulta_gratis && (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Consulta gratis</span>
                </span>
              )}
            </div>

            {/* Biografía */}
            {ficha.bio_corta && (
              <p className="text-zinc-300 text-xs sm:text-sm font-sans leading-relaxed pt-1 whitespace-pre-line max-w-2xl">
                {ficha.bio_corta}
              </p>
            )}

            {/* Chips de Sub-especialidades */}
            {ficha.sub_especialidades.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {ficha.sub_especialidades.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-sans font-medium px-2.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-300 border border-white/[0.08]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Barra de Acciones del Perfil */}
          <div className="pt-2 flex flex-wrap items-center gap-2.5 border-t border-white/[0.08]">
            {enlaceWhatsapp && (
              <a
                href={enlaceWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => registrarContacto(ficha.id, 'whatsapp')}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[#25D366] hover:brightness-110 active:scale-98 text-white font-sans font-bold text-xs sm:text-sm transition-all shadow-md"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>Contactar por WhatsApp</span>
              </a>
            )}

            {enlaceMaps && (
              <a
                href={enlaceMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10 active:scale-98 font-sans font-semibold text-xs sm:text-sm transition-all"
                title="Ver ubicación en Google Maps"
              >
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>Cómo llegar</span>
              </a>
            )}

            {ficha.sitio_web && (
              <a
                href={ficha.sitio_web.startsWith('http') ? ficha.sitio_web : `https://${ficha.sitio_web}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => registrarContacto(ficha.id, 'web')}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10 active:scale-98 font-sans font-semibold text-xs sm:text-sm transition-all"
              >
                <Globe className="w-4 h-4 text-cyan-400" />
                <span>Sitio web</span>
              </a>
            )}

            <button
              type="button"
              onClick={compartir}
              title="Compartir perfil"
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10 active:scale-98 transition-all cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Pestañas de Contenido estilo Instagram (Trabajos, Servicios, Reseñas, Info) ── */}
      <Net0ProfileTabs
        ficha={ficha}
        resenas={resenas}
        distribucion={distribucion}
        onResenaGuardada={cargar}
      />
    </motion.div>
  );
}
