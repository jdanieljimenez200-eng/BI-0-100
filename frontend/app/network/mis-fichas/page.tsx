'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useHaySesion } from '@/lib/useSesion';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import FormularioFicha, { type FicherosFicha } from '@/components/network/FormularioFicha';
import EditorContenido from '@/components/network/EditorContenido';
import MetricasFicha from '@/components/network/MetricasFicha';
import PanelImpulso from '@/components/network/PanelImpulso';
import {
  misFichas,
  misPatrocinios,
  misImpulsos,
  editarFicha,
  borrarFicha,
  subirAvatar,
  subirDocumento,
  errorLegible,
  formatearTarifa,
  NOMBRE_CATEGORIA,
  type DatosFicha,
  type EstadoExperto,
  type FichaPropia,
  type Impulso,
  type Patrocinio,
} from '@/lib/network';

const ESTADO: Record<EstadoExperto, { texto: string; clase: string; explicacion: string }> = {
  pendiente: {
    texto: 'En revisión',
    clase: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    explicacion: 'Todavía no aparece en el directorio. Mientras tanto, completa tus fotos y servicios.',
  },
  aprobado: {
    texto: 'Publicado',
    clase: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    explicacion: 'Visible en el directorio.',
  },
  rechazado: {
    texto: 'Rechazado',
    clase: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    explicacion: 'Corrige lo que se te indica y al guardar volverá a revisión automáticamente.',
  },
  suspendido: {
    texto: 'Suspendido',
    clase: 'bg-white/5 border-white/20 text-white/60',
    explicacion: 'Retirado del directorio por el equipo de revisión.',
  },
};

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

type Pestana = 'contenido' | 'datos' | 'estadisticas' | 'impulsar';
const PESTANAS: { clave: Pestana; texto: string }[] = [
  { clave: 'contenido', texto: 'Fotos y servicios' },
  { clave: 'datos', texto: 'Datos del perfil' },
  { clave: 'estadisticas', texto: 'Estadísticas' },
  { clave: 'impulsar', texto: 'Impulsar' },
];

/**
 * Panel del experto: estado de sus perfiles, contenido, estadísticas e impulsos.
 *
 * Es también la página de vuelta del Checkout de Stripe. El pago lo confirma el
 * webhook, no esta pantalla: al volver con `?impulso=ok` se dice que puede tardar
 * unos segundos en reflejarse en vez de afirmar que ya está activo.
 */
function MisFichasContent() {
  const params = useSearchParams();
  const [fichas, setFichas] = useState<FichaPropia[] | null>(null);
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([]);
  const [impulsos, setImpulsos] = useState<Impulso[]>([]);
  // Perfil abierto y la pestaña que muestra. Uno a la vez.
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('contenido');
  const haySesion = useHaySesion();
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [f, p, i] = await Promise.all([misFichas(), misPatrocinios(), misImpulsos()]);
      setFichas(f);
      setPatrocinios(p);
      setImpulsos(i);
      // Con un solo perfil no hace falta pulsar «Administrar» para empezar.
      if (f.length === 1) setAbierta((actual) => actual ?? f[0].id);
    } catch (e) {
      setFichas([]);
      setError(errorLegible(e, 'No pudimos cargar tus perfiles.'));
    }
  }, []);

  useEffect(() => {
    if (haySesion) cargar();
  }, [haySesion, cargar]);

  useEffect(() => {
    if (params.get('alta') === 'ok' && params.get('fallo')) {
      const que = params.get('fallo')!.split(',').join(' ni la ');
      setAviso(
        `Perfil enviado, pero no se pudo subir el ${que}. Vuelve a intentarlo en «Datos del perfil»: el perfil no se ha perdido.`
      );
    } else if (params.get('alta') === 'ok') {
      setAviso('Perfil enviado. Lo revisamos y te avisamos por correo: hasta entonces no aparece en el directorio.');
    } else if (params.get('impulso') === 'ok') {
      setPestana('impulsar');
      setAviso(
        'Pago recibido. Tu impulso empieza en cuanto Stripe confirma el cobro; puede tardar unos segundos en aparecer como «En curso».'
      );
    } else if (params.get('impulso') === 'cancelado') {
      setPestana('impulsar');
      setAviso('No se ha cobrado nada y el espacio se libera. Puedes impulsar tu perfil cuando quieras.');
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

  const impulsoActivoDe = (expertoId: string) =>
    impulsos.find((i) => i.experto_id === expertoId && i.estado === 'activo');

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
          ? 'Documento recibido. El perfil vuelve a revisión.'
          : mensaje
    );
    await cargar();
  };

  const darDeBaja = async (ficha: FichaPropia) => {
    const seguro = window.confirm(
      `¿Dar de baja «${ficha.nombre_comercial}»? Se borran el perfil, sus fotos, servicios, reseñas y tus datos de contacto. No se puede deshacer.`
    );
    if (!seguro) return;
    try {
      await borrarFicha(ficha.id);
      setAviso('Perfil dado de baja.');
      setAbierta(null);
      await cargar();
    } catch (e) {
      setError(errorLegible(e, 'No pudimos dar de baja el perfil.'));
    }
  };

  return (
    <main className="min-h-screen bg-[#070E17] text-white">
      <Navbar />

      <section className="pt-32 pb-8 px-6">
        <div className="max-w-[960px] mx-auto">
          <Link href="/network" className="text-white/40 hover:text-white text-xs font-semibold">
            ← Directorio
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight mt-5">Mi perfil de experto</h1>

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
        <div className="max-w-[960px] mx-auto space-y-5">
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
              <p className="text-white font-bold mb-2">Todavía no tienes un perfil</p>
              <p className="text-white/40 text-sm max-w-md mx-auto">
                Crea tu perfil con tus servicios y fotos de tu trabajo. Pasa por una revisión y después aparece en el
                directorio y en los análisis de negocios de tu rubro.
              </p>
              <Link
                href="/network/registro"
                className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90"
              >
                Crear mi perfil
              </Link>
            </div>
          ) : (
            fichas.map((ficha) => {
              const est = ESTADO[ficha.estado];
              const patrocinio = patrocinioDe(ficha.id);
              const impulso = impulsoActivoDe(ficha.id);
              const tarifa = formatearTarifa(ficha.tarifa_desde, ficha.moneda);
              const estaAbierta = abierta === ficha.id;

              return (
                <article key={ficha.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
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
                        {(impulso || patrocinio) && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
                            Promocionado
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
                      {impulso?.fecha_fin && (
                        <p className="text-amber-200/60 text-xs mt-1">
                          Impulso {impulso.alcance === 'nacional' ? 'nacional' : `en ${impulso.ciudad}`} hasta el{' '}
                          {FECHA.format(new Date(impulso.fecha_fin))}
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
                          Ver perfil público
                        </Link>
                      )}
                      <button
                        onClick={() => setAbierta(estaAbierta ? null : ficha.id)}
                        className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 text-xs font-bold hover:bg-white/5"
                      >
                        {estaAbierta ? 'Cerrar' : 'Administrar'}
                      </button>
                      {ficha.estado === 'aprobado' && !impulso && (
                        <button
                          onClick={() => {
                            setAbierta(ficha.id);
                            setPestana('impulsar');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold hover:brightness-125"
                        >
                          Impulsar
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

                  {estaAbierta && (
                    <div className="mt-6 pt-5 border-t border-white/5">
                      <div className="flex gap-1 overflow-x-auto mb-6 -mx-1 px-1" role="tablist">
                        {PESTANAS.map((p) => (
                          <button
                            key={p.clave}
                            role="tab"
                            aria-selected={pestana === p.clave}
                            onClick={() => setPestana(p.clave)}
                            className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                              pestana === p.clave
                                ? 'bg-white text-[#070E17]'
                                : 'text-white/50 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            {p.texto}
                          </button>
                        ))}
                      </div>

                      {pestana === 'contenido' && (
                        <EditorContenido expertoId={ficha.id} portadaUrl={ficha.portada_url} />
                      )}
                      {pestana === 'datos' && (
                        <FormularioFicha ficha={ficha} alGuardar={guardar(ficha.id)} textoBoton="Guardar cambios" />
                      )}
                      {pestana === 'estadisticas' && <MetricasFicha expertoId={ficha.id} />}
                      {pestana === 'impulsar' && <PanelImpulso ficha={ficha} impulsos={impulsos} />}
                    </div>
                  )}
                </article>
              );
            })
          )}

          {fichas && fichas.length > 0 && fichas.length < 7 && (
            <Link
              href="/network/registro"
              className="block rounded-2xl border border-dashed border-white/10 p-5 text-center text-white/40 hover:text-white/70 hover:border-white/20 text-sm font-semibold transition-colors"
            >
              + Crear otro perfil en otra categoría
            </Link>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default function MisFichasPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080d14] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
      </div>
    }>
      <MisFichasContent />
    </Suspense>
  );
}
