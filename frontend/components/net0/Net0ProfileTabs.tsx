'use client';

import { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Briefcase,
  Star,
  Info,
  CheckCircle2,
  MessageCircle,
  Globe,
  Mail,
  Phone,
  ArrowLeft,
  ArrowRight,
  X,
  ExternalLink,
  MapPin,
  Play,
} from 'lucide-react';
import type {
  FichaExperto,
  Distribucion,
  ResenaPublica,
  ImagenPerfil,
  ServicioPerfil,
} from '@/lib/network';
import {
  pesosMx,
  obtenerEnlaceGoogleMaps,
  esUrlVideo,
  obtenerEmbedVideoUrl,
  obtenerMiniaturaVideo,
} from '@/lib/network';
import FormularioResena from '@/components/network/FormularioResena';

type TabTipo = 'portafolio' | 'servicios' | 'resenas' | 'info';

interface Net0ProfileTabsProps {
  ficha: FichaExperto;
  resenas: ResenaPublica[];
  distribucion: Distribucion;
  onResenaGuardada: () => void;
}

function EstrellasPequenas({ valor }: { valor: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${
            s <= Math.round(valor) ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'
          }`}
        />
      ))}
    </div>
  );
}

export default function Net0ProfileTabs({
  ficha,
  resenas,
  distribucion,
  onResenaGuardada,
}: Net0ProfileTabsProps) {
  const [tabActiva, setTabActiva] = useState<TabTipo>('portafolio');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const enlaceMaps = obtenerEnlaceGoogleMaps(ficha);

  // Navegación con teclado en Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') {
        setLightboxIndex((i) => (i === null ? null : (i + 1) % ficha.imagenes.length));
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIndex((i) =>
          i === null ? null : (i - 1 + ficha.imagenes.length) % ficha.imagenes.length
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, ficha.imagenes.length]);

  const fotoActual: ImagenPerfil | null =
    lightboxIndex !== null ? ficha.imagenes[lightboxIndex] ?? null : null;

  return (
    <div className="w-full space-y-6">
      {/* ── 1. Barra de Pestañas Estilo Instagram ── */}
      <div className="border-b border-white/[0.08] flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => setTabActiva('portafolio')}
          className={`flex items-center gap-2 py-3 px-3 sm:px-5 border-b-2 font-sans text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            tabActiva === 'portafolio'
              ? 'border-white text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
          <span>Trabajos</span>
          <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-white/[0.06] text-zinc-400">
            {ficha.imagenes.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('servicios')}
          className={`flex items-center gap-2 py-3 px-3 sm:px-5 border-b-2 font-sans text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            tabActiva === 'servicios'
              ? 'border-white text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Briefcase className="w-4 h-4" strokeWidth={1.8} />
          <span>Servicios</span>
          {ficha.servicios.length > 0 && (
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-white/[0.06] text-zinc-400">
              {ficha.servicios.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('resenas')}
          className={`flex items-center gap-2 py-3 px-3 sm:px-5 border-b-2 font-sans text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            tabActiva === 'resenas'
              ? 'border-white text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Star className="w-4 h-4" strokeWidth={1.8} />
          <span>Opiniones</span>
          {ficha.total_resenas > 0 && (
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-white/[0.06] text-zinc-400">
              {ficha.total_resenas}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('info')}
          className={`flex items-center gap-2 py-3 px-3 sm:px-5 border-b-2 font-sans text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            tabActiva === 'info'
              ? 'border-white text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Info className="w-4 h-4" strokeWidth={1.8} />
          <span>Detalles</span>
        </button>
      </div>

      {/* ── 2. Contenido de la Pestaña Activa ── */}

      {/* ── TAB 1: Portafolio (Grid 3x3 estilo Instagram) ── */}
      {tabActiva === 'portafolio' && (
        <section aria-label="Portafolio de trabajos">
          {ficha.imagenes.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {ficha.imagenes.map((img, i) => {
                const esVid = esUrlVideo(img.url, img.tipo);
                const miniaturaYt = esVid ? obtenerMiniaturaVideo(img.url) : null;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className="group relative aspect-square rounded-2xl overflow-hidden border border-white/[0.08] bg-[#141416] cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40"
                    aria-label={img.descripcion || `Ver ${esVid ? 'vídeo' : 'foto'} de trabajo ${i + 1}`}
                  >
                    {esVid ? (
                      miniaturaYt ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={miniaturaYt}
                          alt={img.descripcion}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <video
                          src={img.url + '#t=0.5'}
                          preload="metadata"
                          muted
                          playsInline
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                        />
                      )
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img.url}
                        alt={img.descripcion}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}

                    {/* Badge TikTok/Instagram para vídeos */}
                    {esVid && (
                      <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-lg pointer-events-none z-10 transition-transform group-hover:scale-110">
                        <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                      </div>
                    )}

                    {/* Overlay sutil al hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 text-left">
                      <p className="text-white text-xs font-sans font-medium line-clamp-2">
                        {img.descripcion || (esVid ? 'Reproducir vídeo' : 'Ver trabajo ampliado')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-[#141416] p-12 text-center space-y-2">
              <LayoutGrid className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-white font-sans font-semibold text-sm">Sin proyectos publicados aún</p>
              <p className="text-zinc-400 text-xs font-sans max-w-sm mx-auto">
                Este profesional todavía no ha subido fotografías a su portafolio de Net0.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── TAB 2: Menú de Servicios y Precios ── */}
      {tabActiva === 'servicios' && (
        <section aria-label="Servicios y Precios" className="space-y-3">
          {ficha.servicios.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {ficha.servicios.map((s: ServicioPerfil) => (
                <div
                  key={s.id}
                  className="p-5 rounded-2xl border border-white/[0.08] bg-[#141416] flex flex-col justify-between gap-4 transition-all hover:border-white/15"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-white font-sans font-bold text-sm sm:text-base leading-snug">
                        {s.nombre}
                      </h3>
                      {s.precio_desde !== null && s.precio_desde !== undefined && (
                        <span className="text-xs font-sans font-black text-emerald-400 whitespace-nowrap px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          {pesosMx(s.precio_desde)}
                        </span>
                      )}
                    </div>

                    {s.descripcion && (
                      <p className="text-zinc-300 text-xs sm:text-sm font-sans leading-relaxed">
                        {s.descripcion}
                      </p>
                    )}

                    {s.unidad && (
                      <span className="text-[11px] font-sans text-zinc-500 block">
                        Modalidad: {s.unidad}
                      </span>
                    )}
                  </div>

                  {ficha.whatsapp && (
                    <a
                      href={`https://wa.me/${ficha.whatsapp}?text=${encodeURIComponent(
                        `Hola ${ficha.nombre_comercial}, me interesa cotizar el servicio «${s.nombre}» que vi en tu perfil de Net0.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-sans font-semibold bg-white/[0.06] hover:bg-emerald-500/20 hover:text-emerald-400 border border-white/10 hover:border-emerald-500/30 text-white transition-all active:scale-98"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Cotizar este servicio vía WhatsApp</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-[#141416] p-12 text-center space-y-2">
              <Briefcase className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-white font-sans font-semibold text-sm">Tarifas personalizadas</p>
              <p className="text-zinc-400 text-xs font-sans max-w-sm mx-auto">
                Este profesional cotiza sus servicios a medida según los requerimientos de tu proyecto.
              </p>
              {ficha.whatsapp && (
                <div className="pt-2">
                  <a
                    href={`https://wa.me/${ficha.whatsapp}?text=${encodeURIComponent(
                      `Hola ${ficha.nombre_comercial}, me gustaría consultar sobre tus servicios y tarifas en Net0.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-[#0A0A0C] font-sans font-bold text-xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Preguntar por cotización</span>
                  </a>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── TAB 3: Reseñas & Feedback ── */}
      {tabActiva === 'resenas' && (
        <section aria-label="Reseñas y Calificaciones" className="space-y-6">
          {/* Desglose de Puntuación */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#141416] p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-sans font-black text-white">
                  {ficha.rating > 0 ? ficha.rating.toFixed(1) : '—'}
                </div>
                <div>
                  <EstrellasPequenas valor={ficha.rating} />
                  <span className="text-zinc-400 text-xs font-sans mt-0.5 block">
                    Basado en {ficha.total_resenas}{' '}
                    {ficha.total_resenas === 1 ? 'opinión verificada' : 'opiniones verificadas'}
                  </span>
                </div>
              </div>
            </div>

            {/* Barras de distribución de 5 a 1 estrella */}
            <div className="space-y-2 max-w-md">
              {[5, 4, 3, 2, 1].map((estrellas) => {
                const cantidad = distribucion[estrellas as unknown as keyof Distribucion] ?? 0;
                const porcentaje =
                  ficha.total_resenas > 0 ? Math.round((cantidad / ficha.total_resenas) * 100) : 0;

                return (
                  <div key={estrellas} className="flex items-center gap-3 text-xs font-sans">
                    <span className="w-8 text-zinc-400 font-mono text-right">{estrellas} ★</span>
                    <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                    <span className="w-8 text-zinc-500 font-mono text-[11px]">{cantidad}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Formulario para dejar reseña */}
          <FormularioResena
            expertoId={ficha.id}
            miResena={null}
            alGuardar={onResenaGuardada}
          />

          {/* Lista de testimonios */}
          {resenas.length > 0 ? (
            <div className="space-y-3">
              {resenas.map((r) => (
                <div
                  key={r.id}
                  className="p-5 rounded-2xl border border-white/[0.08] bg-[#141416] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-sans font-semibold text-sm">{r.autor}</span>
                    <EstrellasPequenas valor={r.puntuacion} />
                  </div>
                  {r.comentario && (
                    <p className="text-zinc-300 text-xs sm:text-sm font-sans leading-relaxed">
                      {r.comentario}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-[#141416] p-8 text-center text-zinc-500 text-xs font-sans">
              Todavía no hay reseñas escritas para este profesional.
            </div>
          )}
        </section>
      )}

      {/* ── TAB 4: Información & Acreditación ── */}
      {tabActiva === 'info' && (
        <section aria-label="Información del Profesional" className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#141416] p-6 space-y-6">
            {/* Bio detallada */}
            <div className="space-y-2">
              <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-400">
                Trayectoria y Presentación
              </h3>
              <p className="text-zinc-300 text-xs sm:text-sm font-sans leading-relaxed whitespace-pre-line">
                {ficha.bio_larga || ficha.bio_corta || 'No hay descripción adicional disponible.'}
              </p>
            </div>

            {/* Acreditación oficial */}
            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-400">
                Estado de Acreditación
              </h3>
              {ficha.verificado ? (
                <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-emerald-300 font-sans font-bold text-sm">
                      Profesional Verificado por BI 0 A 100
                    </h4>
                    <p className="text-emerald-400/80 text-xs font-sans mt-0.5 leading-relaxed">
                      El equipo de BI 0 A 100 comprobó la acreditación, cédula o registro profesional presentado por este experto.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-sans text-zinc-400">
                  Ficha comunitaria registrada en Net0. Los acuerdos y contrataciones se pactan de manera directa.
                </div>
              )}
            </div>

            {/* Vías de contacto directo */}
            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-400">
                Canales de Contacto Directo
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ficha.whatsapp && (
                  <a
                    href={`https://wa.me/${ficha.whatsapp}?text=${encodeURIComponent(
                      `Hola, vi tu perfil «${ficha.nombre_comercial}» en Net0 de BI 0 A 100.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-emerald-500/10 hover:border-emerald-500/30 flex items-center gap-3 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-sans font-bold uppercase text-zinc-500 block">WhatsApp</span>
                      <span className="text-white text-xs font-mono font-medium truncate block">+{ficha.whatsapp}</span>
                    </div>
                  </a>
                )}

                {ficha.email_contacto && (
                  <a
                    href={`mailto:${ficha.email_contacto}`}
                    className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] flex items-center gap-3 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-sans font-bold uppercase text-zinc-500 block">Correo</span>
                      <span className="text-white text-xs font-sans font-medium truncate block">{ficha.email_contacto}</span>
                    </div>
                  </a>
                )}

                {ficha.telefono && (
                  <a
                    href={`tel:${ficha.telefono}`}
                    className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] flex items-center gap-3 transition-colors"
                  >
                    <Phone className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-sans font-bold uppercase text-zinc-500 block">Teléfono</span>
                      <span className="text-white text-xs font-mono font-medium truncate block">{ficha.telefono}</span>
                    </div>
                  </a>
                )}

                {ficha.sitio_web && (
                  <a
                    href={ficha.sitio_web.startsWith('http') ? ficha.sitio_web : `https://${ficha.sitio_web}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] flex items-center gap-3 transition-colors"
                  >
                    <Globe className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-sans font-bold uppercase text-zinc-500 block">Sitio Web</span>
                      <span className="text-white text-xs font-sans font-medium truncate block">{ficha.sitio_web}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500 ml-auto flex-shrink-0" />
                  </a>
                )}
              </div>
            </div>

            {/* Ubicación y Conexión con Google Maps */}
            {(ficha.direccion || ficha.ciudad || ficha.google_maps_url) && (
              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-400">
                    Ubicación y Google Maps
                  </h3>
                  {enlaceMaps && (
                    <a
                      href={enlaceMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Abrir en Google Maps ↗</span>
                    </a>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      {ficha.direccion && (
                        <p className="text-white text-xs sm:text-sm font-sans font-medium">
                          {ficha.direccion}
                        </p>
                      )}
                      <p className="text-zinc-400 text-xs font-sans mt-0.5">
                        {[ficha.ciudad, ficha.pais].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>

                  {/* Mapa interactivo incrustado */}
                  <div className="w-full h-48 sm:h-64 rounded-xl overflow-hidden border border-white/10 bg-[#0A0A0C] relative">
                    <iframe
                      title={`Ubicación de ${ficha.nombre_comercial}`}
                      width="100%"
                      height="100%"
                      loading="lazy"
                      style={{ border: 0 }}
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(
                        [ficha.direccion, ficha.ciudad, ficha.pais].filter(Boolean).join(', ')
                      )}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 3. Lightbox Inmersivo para Fotografías y Vídeos del Portafolio ── */}
      {fotoActual && (() => {
        const esVidActual = esUrlVideo(fotoActual.url, fotoActual.tipo);
        const embedUrl = esVidActual ? obtenerEmbedVideoUrl(fotoActual.url) : null;
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Visor inmersivo de proyecto"
            onClick={() => setLightboxIndex(null)}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-none animate-in fade-in duration-200"
          >
            <figure
              onClick={(e) => e.stopPropagation()}
              className="max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center relative space-y-4"
            >
              {esVidActual ? (
                embedUrl ? (
                  <div className="w-full aspect-video max-h-[75vh] max-w-4xl rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black">
                    <iframe
                      src={embedUrl}
                      title={fotoActual.descripcion || 'Vídeo de portafolio'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  </div>
                ) : (
                  <video
                    src={fotoActual.url}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/10 bg-black"
                  />
                )
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotoActual.url}
                  alt={fotoActual.descripcion}
                  className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
                />
              )}

              <figcaption className="w-full flex items-center justify-between gap-4 text-zinc-300 text-xs sm:text-sm font-sans px-2">
                <span className="truncate">{fotoActual.descripcion || 'Proyecto de portafolio'}</span>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((i) =>
                        i === null ? null : (i - 1 + ficha.imagenes.length) % ficha.imagenes.length
                      )
                    }
                    aria-label="Elemento anterior"
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <span className="font-mono text-xs text-zinc-400 px-2">
                    {(lightboxIndex ?? 0) + 1} / {ficha.imagenes.length}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((i) => (i === null ? null : (i + 1) % ficha.imagenes.length))
                    }
                    aria-label="Siguiente elemento"
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setLightboxIndex(null)}
                    aria-label="Cerrar visor"
                    className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </figcaption>
            </figure>
          </div>
        );
      })()}
    </div>
  );
}
