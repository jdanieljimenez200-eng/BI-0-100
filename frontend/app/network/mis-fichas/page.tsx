'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useHaySesion } from '@/lib/useSesion';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import FormularioFicha, { type FicherosFicha } from '@/components/network/FormularioFicha';
import {
  misFichas,
  misPatrocinios,
  editarFicha,
  borrarFicha,
  iniciarPatrocinio,
  subirAvatar,
  subirDocumento,
  errorLegible,
  formatearTarifa,
  NOMBRE_CATEGORIA,
  type DatosFicha,
  type EstadoExperto,
  type FichaPropia,
  type Patrocinio,
} from '@/lib/network';

const ESTADO: Record<EstadoExperto, { texto: string; clase: string; explicacion: string }> = {
  pendiente: {
    texto: 'En revisión',
    clase: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    explicacion: 'Todavía no aparece en el directorio. Nadie más que tú puede verla.',
  },
  aprobado: {
    texto: 'Publicada',
    clase: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    explicacion: 'Visible en el directorio.',
  },
  rechazado: {
    texto: 'Rechazada',
    clase: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    explicacion: 'Corrige lo que se te indica y al guardar volverá a revisión automáticamente.',
  },
  suspendido: {
    texto: 'Suspendida',
    clase: 'bg-white/5 border-white/20 text-white/60',
    explicacion: 'Retirada del directorio por el equipo de revisión.',
  },
};

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

/**
 * Panel del experto: el estado de sus fichas, su edición y su patrocinio.
 *
 * Es también la página de vuelta del Checkout de Stripe. El pago lo confirma el
 * webhook, no esta pantalla: por eso, al volver con `?patrocinio=ok`, se dice que
 * puede tardar unos segundos en reflejarse en vez de afirmar que ya está activo.
 */
export default function MisFichasPage() {
  const params = useSearchParams();
  const [fichas, setFichas] = useState<FichaPropia[] | null>(null);
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const haySesion = useHaySesion();
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([misFichas(), misPatrocinios()]);
      setFichas(f);
      setPatrocinios(p);
    } catch (e) {
      setFichas([]);
      setError(errorLegible(e, 'No pudimos cargar tus fichas.'));
    }
  }, []);

  useEffect(() => {
    if (haySesion) cargar();
  }, [haySesion, cargar]);

  useEffect(() => {
    if (params.get('alta') === 'ok' && params.get('fallo')) {
      const que = params.get('fallo')!.split(',').join(' ni la ');
      setAviso(
        `Ficha enviada, pero no se pudo subir el ${que}. Ábrela con "Editar" y vuelve a intentarlo: la ficha no se ha perdido.`
      );
    } else if (params.get('alta') === 'ok') {
      setAviso('Ficha enviada. La revisamos y te avisamos por correo: hasta entonces no aparece en el directorio.');
    } else if (params.get('patrocinio') === 'ok') {
      setAviso(
        'Pago recibido. El patrocinio se activa en cuanto Stripe nos confirma el cobro; puede tardar unos segundos en aparecer aquí.'
      );
    } else if (params.get('patrocinio') === 'cancelado') {
      setAviso('No se ha cobrado nada. Puedes intentarlo cuando quieras.');
    }
  }, [params]);

  const patrocinioDe = (expertoId: string) =>
    patrocinios.find(
      (p) =>
        p.experto_id === expertoId &&
        p.estado === 'activo' &&
        (!p.fecha_fin || new Date(p.fecha_fin) > new Date())
    );

  const guardar = (id: string) => async (datos: DatosFicha, ficheros: FicherosFicha) => {
    const { mensaje } = await editarFicha(id, datos);

    // Los datos ya están guardados: un fichero que falle se dice, no se lanza,
    // para no hacer creer que tampoco se guardó lo demás.
    const fallos: string[] = [];
    let volvioARevision = false;
    if (ficheros.documento) {
      try {
        await subirDocumento(id, ficheros.documento);
        volvioARevision = true;
      } catch (e) {
        fallos.push(`el documento (${errorLegible(e, 'error de subida')})`);
      }
    }
    if (ficheros.avatar) {
      try {
        await subirAvatar(id, ficheros.avatar);
      } catch (e) {
        fallos.push(`la foto (${errorLegible(e, 'error de subida')})`);
      }
    }

    setAviso(
      fallos.length
        ? `Cambios guardados, pero no se pudo subir ${fallos.join(' ni ')}. Vuelve a intentarlo.`
        : volvioARevision
          ? 'Documento recibido. La ficha vuelve a revisión.'
          : mensaje
    );
    setEditando(null);
    await cargar();
  };

  const darDeBaja = async (ficha: FichaPropia) => {
    const seguro = window.confirm(
      `¿Dar de baja «${ficha.nombre_comercial}»? Se borra la ficha, sus reseñas y tus datos de contacto. No se puede deshacer.`
    );
    if (!seguro) return;
    try {
      await borrarFicha(ficha.id);
      setAviso('Ficha dada de baja.');
      await cargar();
    } catch (e) {
      setError(errorLegible(e, 'No pudimos dar de baja la ficha.'));
    }
  };

  const patrocinar = async (ficha: FichaPropia) => {
    setError(null);
    try {
      const url = await iniciarPatrocinio(ficha.id);
      window.location.href = url;
    } catch (e) {
      setError(errorLegible(e, 'No pudimos abrir el pago.'));
    }
  };

  return (
    <main className="min-h-screen bg-[#070E17] text-white">
      <Navbar />

      <section className="pt-32 pb-8 px-6">
        <div className="max-w-[900px] mx-auto">
          <Link href="/network" className="text-white/40 hover:text-white text-xs font-semibold">
            ← Directorio
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight mt-5">Mis fichas de experto</h1>

          {aviso && (
            <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.04] p-4">
              <p className="text-white/70 text-sm">{aviso}</p>
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-rose-300 text-sm">{error}</p>
            </div>
          )}
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-[900px] mx-auto space-y-5">
          {!haySesion ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <p className="text-white font-bold mb-2">Entra en tu cuenta</p>
              <Link
                href="/auth/login"
                className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90"
              >
                Iniciar sesión
              </Link>
            </div>
          ) : fichas === null ? (
            <p className="text-white/40 text-sm">Cargando…</p>
          ) : fichas.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <p className="text-white font-bold mb-2">Todavía no tienes ninguna ficha</p>
              <p className="text-white/40 text-sm max-w-md mx-auto">
                Si trabajas en legal, marketing o ventas, puedes presentarte y pasar por la revisión.
              </p>
              <Link
                href="/network/registro"
                className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90"
              >
                Presentar mi ficha
              </Link>
            </div>
          ) : (
            fichas.map((ficha) => {
              const est = ESTADO[ficha.estado];
              const patrocinio = patrocinioDe(ficha.id);
              const tarifa = formatearTarifa(ficha.tarifa_desde, ficha.moneda);

              return (
                <article
                  key={ficha.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-white font-bold">{ficha.nombre_comercial}</h2>
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${est.clase}`}
                        >
                          {est.texto}
                        </span>
                        {ficha.verificado && (
                          <span className="px-2 py-0.5 rounded-full border border-white/15 text-white/60 text-[10px] font-bold">
                            Acreditación comprobada
                          </span>
                        )}
                        {patrocinio && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
                            Patrocinada
                          </span>
                        )}
                      </div>
                      <p className="text-white/40 text-xs mt-1">
                        {NOMBRE_CATEGORIA[ficha.categoria]}
                        {ficha.ciudad ? ` · ${ficha.ciudad}` : ''}
                        {tarifa ? ` · desde ${tarifa}` : ''}
                      </p>
                      <p className="text-white/30 text-xs mt-2">{est.explicacion}</p>

                      {ficha.estado === 'rechazado' && ficha.motivo_rechazo && (
                        <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                          <p className="text-rose-200/80 text-xs leading-relaxed">
                            <span className="font-bold">Motivo: </span>
                            {ficha.motivo_rechazo}
                          </p>
                        </div>
                      )}

                      {ficha.total_resenas > 0 && (
                        <p className="text-white/40 text-xs mt-2">
                          {Number(ficha.rating_promedio).toFixed(1)} de 5 · {ficha.total_resenas}{' '}
                          {ficha.total_resenas === 1 ? 'reseña' : 'reseñas'}
                        </p>
                      )}
                      {patrocinio?.fecha_fin && (
                        <p className="text-white/30 text-xs mt-1">
                          Patrocinio pagado hasta {FECHA.format(new Date(patrocinio.fecha_fin))}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {ficha.estado === 'aprobado' && (
                        <Link
                          href={`/network/${ficha.id}`}
                          className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 text-xs font-bold hover:bg-white/5"
                        >
                          Ver ficha
                        </Link>
                      )}
                      <button
                        onClick={() => setEditando(editando === ficha.id ? null : ficha.id)}
                        className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 text-xs font-bold hover:bg-white/5"
                      >
                        {editando === ficha.id ? 'Cerrar' : 'Editar'}
                      </button>
                      {ficha.estado === 'aprobado' && !patrocinio && (
                        <button
                          onClick={() => patrocinar(ficha)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold hover:brightness-125"
                        >
                          Patrocinar
                        </button>
                      )}
                      <button
                        onClick={() => darDeBaja(ficha)}
                        className="px-3 py-1.5 rounded-lg text-rose-300/70 hover:text-rose-300 text-xs font-semibold"
                      >
                        Dar de baja
                      </button>
                    </div>
                  </div>

                  {editando === ficha.id && (
                    <div className="mt-6 pt-6 border-t border-white/5">
                      <FormularioFicha
                        ficha={ficha}
                        alGuardar={guardar(ficha.id)}
                        textoBoton="Guardar cambios"
                      />
                    </div>
                  )}
                </article>
              );
            })
          )}

          {fichas && fichas.length > 0 && fichas.length < 3 && (
            <Link
              href="/network/registro"
              className="block rounded-2xl border border-dashed border-white/10 p-5 text-center text-white/40 hover:text-white/70 hover:border-white/20 text-sm font-semibold transition-colors"
            >
              + Presentar otra ficha en otra categoría
            </Link>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
