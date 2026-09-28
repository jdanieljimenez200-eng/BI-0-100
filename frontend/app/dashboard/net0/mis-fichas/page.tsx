'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Plus, ExternalLink, ShieldCheck, Sparkles, Trash2, Settings2 } from 'lucide-react';
import { useHaySesion } from '@/lib/useSesion';
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
import { ENTRADA_SEGURA, MOTION_SPRINGS } from '@/lib/motion/tokens';

const ESTADO: Record<EstadoExperto, { texto: string; clase: string; explicacion: string }> = {
  pendiente: {
    texto: 'En revisión',
    clase: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    explicacion: 'Todavía no aparece en el directorio. Mientras tanto, completa tus fotos y servicios.',
  },
  aprobado: {
    texto: 'Publicado',
    clase: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    explicacion: 'Visible en el directorio Net0.',
  },
  rechazado: {
    texto: 'Rechazado',
    clase: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    explicacion: 'Corrige lo que se te indica y al guardar volverá a revisión automáticamente.',
  },
  suspendido: {
    texto: 'Suspendido',
    clase: 'bg-white/5 border-white/20 text-white/60',
    explicacion: 'Retirado del directorio por el equipo de moderación.',
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

function MisFichasContent() {
  const params = useSearchParams();
  const shouldReduce = useReducedMotion();
  const [fichas, setFichas] = useState<FichaPropia[] | null>(null);
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([]);
  const [impulsos, setImpulsos] = useState<Impulso[]>([]);
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
      if (f.length === 1) setAbierta((actual) => actual ?? f[0].id);
    } catch (e) {
      setFichas([]);
      setError(errorLegible(e, 'No pudimos cargar tus perfiles de Net0.'));
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
    <motion.div
      {...ENTRADA_SEGURA}
      initial={shouldReduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_SPRINGS.gentle}
      className="w-full max-w-5xl mx-auto space-y-6 pb-16"
    >
      {/* ── Encabezado y Regreso ── */}
      <div className="space-y-3">
        <Link
          href="/dashboard/net0"
          className="inline-flex items-center gap-2 text-xs font-sans font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver al Directorio Net0</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-sans font-extrabold tracking-tight text-white">
              Mis perfiles en Net0
            </h1>
            <p className="text-zinc-400 text-xs sm:text-sm font-sans mt-1">
              Gestiona tus servicios, tarifas, fotos de portafolio y estadísticas de contacto.
            </p>
          </div>

          <Link
            href="/dashboard/net0/registro"
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-xs sm:text-sm font-sans font-semibold text-[#070E17] bg-white hover:bg-slate-100 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 text-[#070E17]" />
            <span>Crear otro perfil</span>
          </Link>
        </div>

        {aviso && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-xs font-sans text-emerald-300">
            {aviso}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-4 text-xs font-sans text-rose-300">
            {error}
          </div>
        )}
      </div>

      {/* ── Lista de Perfiles ── */}
      <div className="space-y-4">
        {!haySesion ? (
          <div className="rounded-2xl border border-white/10 bg-[#090E17]/80 backdrop-blur-xl p-8 text-center space-y-3">
            <p className="text-white font-sans font-bold">Inicia sesión para gestionar tus perfiles</p>
            <Link
              href="/auth/login"
              className="inline-block mt-2 px-5 py-2 rounded-xl bg-white text-[#070E17] font-sans font-bold text-xs"
            >
              Iniciar sesión
            </Link>
          </div>
        ) : fichas === null ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center text-zinc-400 text-xs sm:text-sm font-sans">
            Cargando tus perfiles Net0…
          </div>
        ) : fichas.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center space-y-4 max-w-lg mx-auto">
            <h3 className="text-white font-sans font-bold text-base">Todavía no has creado un perfil profesional</h3>
            <p className="text-zinc-400 text-xs sm:text-sm font-sans leading-relaxed">
              Registra tu especialidad u oficio para figurar en el directorio Net0 y comenzar a recibir solicitudes directas de los negocios de la plataforma.
            </p>
            <Link
              href="/dashboard/net0/registro"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-sans font-bold text-xs sm:text-sm hover:bg-slate-100 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Publicar mi perfil ahora</span>
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
              <article
                key={ficha.id}
                className="rounded-2xl border border-white/[0.08] bg-[#090E17]/85 backdrop-blur-xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.3)] space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-white font-sans font-bold text-base sm:text-lg">{ficha.nombre_comercial}</h2>
                      <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-sans font-bold uppercase tracking-wider ${est.clase}`}>
                        {est.texto}
                      </span>
                      {ficha.verificado && (
                        <span className="px-2.5 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-[10px] font-sans font-semibold">
                          Acreditación comprobada
                        </span>
                      )}
                      {(impulso || patrocinio) && (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-sans font-bold uppercase tracking-wider">
                          Destacado
                        </span>
                      )}
                    </div>

                    <p className="text-zinc-400 text-xs font-sans">
                      {NOMBRE_CATEGORIA[ficha.categoria]}
                      {ficha.ciudad ? ` · ${ficha.ciudad}` : ''}
                      {tarifa ? ` · desde ${tarifa}` : ''}
                    </p>

                    <p className="text-zinc-500 text-xs font-sans">{est.explicacion}</p>

                    {ficha.estado === 'rechazado' && ficha.motivo_rechazo && (
                      <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs font-sans text-rose-300">
                        <span className="font-bold">Motivo: </span>
                        {ficha.motivo_rechazo}
                      </div>
                    )}

                    {ficha.total_resenas > 0 && (
                      <p className="text-zinc-400 text-xs font-sans pt-1">
                        ★ {Number(ficha.rating_promedio).toFixed(1)} · {ficha.total_resenas}{' '}
                        {ficha.total_resenas === 1 ? 'reseña' : 'reseñas'}
                      </p>
                    )}
                    {impulso?.fecha_fin && (
                      <p className="text-amber-300/80 text-xs font-sans">
                        Impulso activo {impulso.alcance === 'nacional' ? 'nacional' : `en ${impulso.ciudad}`} hasta el{' '}
                        {FECHA.format(new Date(impulso.fecha_fin))}
                      </p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-wrap items-center gap-2">
                    {ficha.estado === 'aprobado' && (
                      <Link
                        href={`/dashboard/net0/${ficha.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/[0.04] text-white/80 hover:text-white text-xs font-sans font-medium transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Ver ficha</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={() => setAbierta(estaAbierta ? null : ficha.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/[0.06] text-white text-xs font-sans font-semibold hover:bg-white/[0.12] transition-colors cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>{estaAbierta ? 'Cerrar' : 'Administrar'}</span>
                    </button>

                    {ficha.estado === 'aprobado' && !impulso && (
                      <button
                        type="button"
                        onClick={() => {
                          setAbierta(ficha.id);
                          setPestana('impulsar');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-sans font-bold hover:brightness-125 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Impulsar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => darDeBaja(ficha)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-rose-300/70 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-sans font-medium transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Dar de baja</span>
                    </button>
                  </div>
                </div>

                {/* Subpanel expandido */}
                {estaAbierta && (
                  <div className="pt-4 border-t border-white/[0.08] space-y-5">
                    <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
                      {PESTANAS.map((p) => (
                        <button
                          key={p.clave}
                          role="tab"
                          aria-selected={pestana === p.clave}
                          onClick={() => setPestana(p.clave)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-sans font-semibold transition-all cursor-pointer whitespace-nowrap ${
                            pestana === p.clave
                              ? 'bg-white text-[#070E17] shadow-sm'
                              : 'text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06]'
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
      </div>
    </motion.div>
  );
}

export default function MisFichasNet0Page() {
  return (
    <Suspense
      fallback={
        <div className="w-full py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          <span className="text-xs font-sans">Cargando perfiles Net0…</span>
        </div>
      }
    >
      <MisFichasContent />
    </Suspense>
  );
}
