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
  NOMBRE_CATEGORIA,
  type Distribucion,
  type FichaExperto,
  type ResenaPublica,
} from '@/lib/network';

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
  const hayContacto = Boolean(ficha.email_contacto || ficha.telefono || ficha.sitio_web);

  return (
    <main className="min-h-screen bg-[#070E17] text-white">
      <Navbar />

      <section className="pt-32 pb-8 px-6">
        <div className="max-w-[1100px] mx-auto">
          <Link
            href={`/network?categoria=${ficha.categoria}`}
            className="text-white/40 hover:text-white text-xs font-semibold transition-colors"
          >
            ← {NOMBRE_CATEGORIA[ficha.categoria]} en el directorio
          </Link>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-start gap-5">
            {ficha.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ficha.avatar_url}
                alt=""
                className="w-20 h-20 rounded-2xl object-cover border border-white/10"
              />
            ) : (
              <div
                className={`w-20 h-20 rounded-2xl ${acento.bg} border ${acento.borde} ${acento.texto} flex items-center justify-center text-3xl font-extrabold`}
                aria-hidden="true"
              >
                {(ficha.nombre_display || ficha.nombre_comercial).charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
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
                    Patrocinado
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
                {ficha.email_contacto && (
                  <a
                    href={`mailto:${ficha.email_contacto}`}
                    className={`block w-full text-center py-2.5 rounded-xl text-sm font-bold ${acento.bg} border ${acento.borde} ${acento.texto} hover:brightness-125 transition-all`}
                  >
                    Escribir un correo
                  </a>
                )}
                {ficha.telefono && (
                  <a
                    href={`tel:${ficha.telefono.replace(/\s+/g, '')}`}
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
