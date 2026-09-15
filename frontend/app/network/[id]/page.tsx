'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
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

/** Galería con visor a pantalla completa (Esc o clic fuera para cerrar, flechas para pasar). */
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">Trabajos</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {imagenes.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setAbierta(i)}
            className={`group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 ${
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
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setAbierta(null)}
        >
          <figure className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={actual.url} alt={actual.descripcion} className="max-h-[80vh] w-auto mx-auto rounded-xl object-contain" />
            <figcaption className="flex items-center justify-between gap-3 mt-3 text-white/70 text-sm">
              <span className="min-w-0 truncate">{actual.descripcion}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setAbierta((i) => ((i ?? 0) - 1 + imagenes.length) % imagenes.length)}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20"
                  aria-label="Anterior"
                >
                  ←
                </button>
                <span className="text-white/40 text-xs">
                  {(abierta ?? 0) + 1}/{imagenes.length}
                </span>
                <button
                  type="button"
                  onClick={() => setAbierta((i) => ((i ?? 0) + 1) % imagenes.length)}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20"
                  aria-label="Siguiente"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setAbierta(null)}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

function Estrellas({ valor, tamano = 'w-4 h-4' }: { valor: number; tamano?: string }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${valor} de 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          className={`${tamano} ${s <= Math.round(valor) ? 'text-amber-400' : 'text-white/15'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function Reparto({ distribucion, total }: { distribucion: Distribucion; total: number }) {
  if (total === 0) return null;
  return (
    <div className="space-y-1.5">
      {([5, 4, 3, 2, 1] as const).map((n) => {
        const cuantas = distribucion[String(n) as keyof Distribucion] ?? 0;
        const porcentaje = total > 0 ? (cuantas / total) * 100 : 0;
        return (
          <div key={n} className="flex items-center gap-2 text-[11px]">
            <span className="text-white/40 w-3 text-right">{n}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-amber-400/70" style={{ width: `${porcentaje}%` }} />
            </div>
            <span className="text-white/30 w-6">{cuantas}</span>
          </div>
        );
      })}
    </div>
  );
}

const FECHA = new Intl.DateTimeFormat('es-MX', { year: 'numeric', month: 'long' });

/**
 * Ficha pública de un experto.
 *
 * Todo lo que se pinta aquí lo ha revisado un admin. El contacto solo aparece si
 * el experto pidió mostrarlo, y el aviso de que el acuerdo es entre él y el
 * cliente es fijo: la plataforma no cobra la consulta ni responde por ella, y
 * eso tiene que estar dicho donde se toma la decisión de contactarlo.
 */
export default function FichaExpertoPage() {
  const { id } = useParams<{ id: string }>();
  const [ficha, setFicha] = useState<FichaExperto | null>(null);
  const [resenas, setResenas] = useState<ResenaPublica[]>([]);
  const [distribucion, setDistribucion] = useState<Distribucion>({
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  });
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-existe' | 'error'>('cargando');

  const cargar = useCallback(async () => {
    try {
      const datos = await obtenerFicha(id);
      setFicha(datos.experto);
      setResenas(datos.resenas);
      setDistribucion(datos.distribucion);
      setEstado('ok');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setEstado(status === 404 ? 'no-existe' : 'error');
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (estado === 'cargando') {
    return (
      <main className="min-h-screen bg-[#070E17] text-white">
        <Navbar />
        <p className="pt-40 text-center text-white/40 text-sm">Cargando ficha…</p>
        <Footer />
      </main>
    );
  }

  if (estado !== 'ok' || !ficha) {
    return (
      <main className="min-h-screen bg-[#070E17] text-white">
        <Navbar />
        <div className="pt-40 pb-24 px-6 text-center">
          <h1 className="text-2xl font-extrabold mb-3">
            {estado === 'no-existe' ? 'Esta ficha no está disponible' : 'No pudimos cargar la ficha'}
          </h1>
          <p className="text-white/40 text-sm max-w-md mx-auto">
            {estado === 'no-existe'
              ? 'Puede que el experto se haya dado de baja o que su ficha esté en revisión.'
              : 'Vuelve a intentarlo en un momento.'}
          </p>
          <Link
            href="/network"
            className="inline-block mt-6 px-5 py-2.5 rounded-xl border border-white/15 text-white/70 font-semibold text-sm hover:bg-white/5"
          >
            Volver al directorio
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  const acento = ACENTO[ficha.categoria] ?? ACENTO.legal;
  const tarifa = formatearTarifa(ficha.tarifa_desde, ficha.moneda);
  const hayContacto = Boolean(ficha.whatsapp || ficha.email_contacto || ficha.telefono || ficha.sitio_web);
  // Mensaje prellenado: el experto sabe de dónde viene el contacto.
  const enlaceWhatsapp = ficha.whatsapp
    ? `https://wa.me/${ficha.whatsapp}?text=${encodeURIComponent(
        `Hola, vi tu perfil «${ficha.nombre_comercial}» en 0 a 100 y me interesa tu servicio.`
      )}`
    : null;

  return (
    <main className="min-h-screen bg-[#070E17] text-white">
      <Navbar />

      <section className="pt-28 pb-8 px-6">
        <div className="max-w-[1100px] mx-auto">
          <Link
            href={`/network?categoria=${ficha.categoria}`}
            className="text-white/40 hover:text-white text-xs font-semibold transition-colors"
          >
            ← {NOMBRE_CATEGORIA[ficha.categoria]} en el directorio
          </Link>

          {ficha.portada_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ficha.portada_url}
              alt=""
              className="mt-4 w-full h-40 sm:h-64 rounded-2xl object-cover border border-white/10"
            />
          )}

          <div className={`flex flex-col sm:flex-row sm:items-start gap-5 ${ficha.portada_url ? '-mt-10 sm:-mt-12 px-4' : 'mt-6'}`}>
            {ficha.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ficha.avatar_url}
                alt=""
                className="w-20 h-20 rounded-2xl object-cover border-2 border-[#070E17] ring-1 ring-white/10 bg-[#070E17]"
              />
            ) : (
              // Fondo opaco debajo del tinte: sobre la portada, el tinte solo se transparentaría.
              <div className="w-20 h-20 flex-shrink-0 rounded-2xl bg-[#070E17]" aria-hidden="true">
                <div
                  className={`w-full h-full rounded-2xl ${acento.bg} border ${acento.borde} ${acento.texto} flex items-center justify-center text-3xl font-extrabold`}
                >
                  {(ficha.nombre_display || ficha.nombre_comercial).charAt(0).toUpperCase()}
                </div>
              </div>
            )}

            <div className={`min-w-0 flex-1 ${ficha.portada_url ? 'sm:pt-14' : ''}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {ficha.nombre_comercial}
                </h1>
                {ficha.verificado && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${acento.bg} border ${acento.borde} ${acento.texto}`}
                  >
                    Acreditación comprobada
                  </span>
                )}
                {ficha.es_patrocinado && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 uppercase tracking-widest">
                    Promocionado
                  </span>
                )}
              </div>

              <p className="text-white/50 text-sm mt-1">
                {[ficha.especialidad, ficha.ciudad, ficha.pais].filter(Boolean).join(' · ')}
              </p>

              <div className="flex items-center gap-2 mt-3">
                {ficha.total_resenas > 0 ? (
                  <>
                    <Estrellas valor={ficha.rating} />
                    <span className="text-amber-400 text-sm font-bold">{ficha.rating.toFixed(1)}</span>
                    <span className="text-white/30 text-xs">
                      ({ficha.total_resenas} {ficha.total_resenas === 1 ? 'reseña' : 'reseñas'})
                    </span>
                  </>
                ) : (
                  <span className="text-white/30 text-xs">
                    Nadie ha dejado una reseña todavía
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* ── Columna principal ──────────────────────────────────────── */}
          <div className="space-y-6">
            {(ficha.bio_larga || ficha.bio_corta) && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-3">
                  Sobre {ficha.nombre_display || ficha.nombre_comercial}
                </h2>
                {/* Texto escrito por un tercero: se pinta como texto, nunca como
                    HTML. React lo escapa, y aquí no se usa dangerouslySetInnerHTML
                    a propósito. */}
                <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line">
                  {ficha.bio_larga || ficha.bio_corta}
                </p>

                {ficha.sub_especialidades.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-5">
                    {ficha.sub_especialidades.map((tag) => (
                      <span
                        key={tag}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${acento.bg} ${acento.texto} border ${acento.borde}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {ficha.servicios.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">Servicios</h2>
                <ul className="divide-y divide-white/5">
                  {ficha.servicios.map((s) => (
                    <li key={s.id} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-white font-bold text-sm">{s.nombre}</p>
                        {s.descripcion && (
                          <p className="text-white/50 text-sm leading-relaxed mt-0.5 whitespace-pre-line">{s.descripcion}</p>
                        )}
                      </div>
                      <p className="text-white/70 text-sm font-semibold sm:text-right flex-shrink-0">
                        {s.precio_desde !== null ? (
                          <>
                            <span className="text-white/35 text-xs font-normal">desde </span>
                            {pesosMx(s.precio_desde)}
                            {s.unidad && <span className="block text-white/35 text-[11px] font-normal">por {s.unidad}</span>}
                          </>
                        ) : (
                          <span className="text-white/40 text-xs">A consultar</span>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Galeria imagenes={ficha.imagenes} />

            {ficha.video_url && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-3">
                  Presentación
                </h2>
                <a
                  href={ficha.video_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-white/70 hover:text-white text-sm font-semibold underline decoration-white/20"
                >
                  Ver el vídeo de presentación ↗
                </a>
              </div>
            )}

            {/* ── Reseñas ─────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">
                  Reseñas
                </h2>
                {ficha.total_resenas > 0 && (
                  <span className="text-white/30 text-xs">{ficha.total_resenas} en total</span>
                )}
              </div>

              <FormularioResena
                expertoId={ficha.id}
                miResena={resenas.find((r) => r.es_mia) ?? null}
                alGuardar={cargar}
              />

              {resenas.length === 0 ? (
                <p className="text-white/30 text-sm mt-4">
                  Todavía no hay reseñas de este experto.
                </p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {resenas.map((r) => (
                    <li key={r.id} className="border-t border-white/5 pt-4 first:border-0 first:pt-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Estrellas valor={r.puntuacion} tamano="w-3 h-3" />
                        <span className="text-white/70 text-xs font-semibold">{r.autor}</span>
                        {r.es_mia && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">
                            tu reseña
                          </span>
                        )}
                        <span className="text-white/20 text-[11px]">
                          {FECHA.format(new Date(r.fecha_creacion))}
                        </span>
                      </div>
                      {r.comentario && (
                        <p className="text-white/50 text-sm leading-relaxed mt-1.5 whitespace-pre-line">
                          {r.comentario}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ── Columna de contacto ────────────────────────────────────── */}
          <aside className="space-y-4 lg:sticky lg:top-28">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-white/40 text-xs mb-1">Tarifa</p>
              <p className="text-white font-bold">
                {tarifa ?? <span className="text-white/50 font-semibold">A consultar</span>}
                {tarifa && <span className="text-white/30 text-xs font-normal"> en adelante</span>}
              </p>
              {ficha.ofrece_consulta_gratis && (
                <p className="text-emerald-400/80 text-xs font-medium mt-2">
                  Ofrece una primera consulta gratuita
                </p>
              )}

              <div className="mt-5 space-y-2">
                {ficha.es_mia && (
                  <p className="text-white/40 text-[11px] leading-relaxed">
                    Así ven tu perfil los visitantes. Tus propios clics no cuentan en tus estadísticas.
                  </p>
                )}
                {enlaceWhatsapp && (
                  <a
                    href={enlaceWhatsapp}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onClick={() => registrarContacto(ficha.id, 'whatsapp')}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-extrabold bg-[#25D366] text-[#062612] hover:brightness-110 transition-all"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.23 9.43-9.44 9.43m8.03-17.46A11.28 11.28 0 0 0 12.05.72C5.8.72.7 5.8.7 12.07c0 2 .52 3.95 1.52 5.67L.6 23.3l5.72-1.5a11.3 11.3 0 0 0 5.42 1.38h.01c6.26 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.02" />
                    </svg>
                    Escribir por WhatsApp
                  </a>
                )}
                {ficha.email_contacto && (
                  <a
                    href={`mailto:${ficha.email_contacto}`}
                    onClick={() => registrarContacto(ficha.id, 'email')}
                    className={`block w-full text-center py-2.5 rounded-xl text-sm font-bold ${acento.bg} border ${acento.borde} ${acento.texto} hover:brightness-125 transition-all`}
                  >
                    Escribir un correo
                  </a>
                )}
                {ficha.telefono && (
                  <a
                    href={`tel:${ficha.telefono.replace(/\s+/g, '')}`}
                    onClick={() => registrarContacto(ficha.id, 'telefono')}
                    className="block w-full text-center py-2.5 rounded-xl text-sm font-bold border border-white/15 text-white/80 hover:bg-white/5 transition-colors"
                  >
                    {ficha.telefono}
                  </a>
                )}
                {ficha.sitio_web && (
                  <a
                    href={ficha.sitio_web}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onClick={() => registrarContacto(ficha.id, 'web')}
                    className="block w-full text-center py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-white/60 hover:bg-white/5 transition-colors"
                  >
                    Su sitio web ↗
                  </a>
                )}
                {!hayContacto && (
                  <p className="text-white/30 text-xs leading-relaxed">
                    Este experto no ha publicado datos de contacto. Puedes dejarle una reseña si ya
                    has trabajado con él.
                  </p>
                )}
              </div>
            </div>

            {/*
              Este aviso no es letra pequeña de adorno: la plataforma no cobra la
              consulta, no la garantiza y no media en el acuerdo. Quien lea esta
              ficha tiene que saberlo antes de contactar, no después.
            */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <p className="text-white/50 text-xs leading-relaxed">
                El acuerdo y el pago son directamente entre tú y el experto. 0 a 100 revisa las
                fichas antes de publicarlas, pero no interviene en la contratación ni responde por
                el servicio.
              </p>
              {ficha.fecha_aprobacion && (
                <p className="text-white/25 text-[11px] mt-3">
                  En el directorio desde {FECHA.format(new Date(ficha.fecha_aprobacion))}
                </p>
              )}
            </div>

            {ficha.total_resenas > 0 && (
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">
                  Reparto de puntuaciones
                </p>
                <Reparto distribucion={distribucion} total={ficha.total_resenas} />
              </div>
            )}
          </aside>
        </div>
      </section>

      <Footer />
    </main>
  );
}
