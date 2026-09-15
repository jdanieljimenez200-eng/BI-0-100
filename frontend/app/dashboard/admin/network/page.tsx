'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ModeracionResenas from '@/components/network/ModeracionResenas';
import ModeracionImpulsos from '@/components/network/ModeracionImpulsos';
import {
  fichasAdmin,
  cambiarEstadoFicha,
  abrirDocumento,
  errorLegible,
  formatearTarifa,
  NOMBRE_CATEGORIA,
  type EstadoExperto,
  type FichaPropia,
} from '@/lib/network';

type Pestana = EstadoExperto | 'resenas' | 'impulsos';

const PESTANAS: { clave: Pestana; texto: string }[] = [
  { clave: 'pendiente', texto: 'Por revisar' },
  { clave: 'aprobado', texto: 'Publicadas' },
  { clave: 'rechazado', texto: 'Rechazadas' },
  { clave: 'suspendido', texto: 'Suspendidas' },
  { clave: 'resenas', texto: 'Reseñas' },
  { clave: 'impulsos', texto: 'Impulsos' },
];

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div>
      <dt className="text-white/30 text-[10px] font-bold uppercase tracking-widest">{etiqueta}</dt>
      <dd className="text-white/70 text-sm mt-0.5 break-words">{children}</dd>
    </div>
  );
}

/**
 * Cola de revisión de la red de expertos.
 *
 * Esta pantalla es la única que ve el documento de acreditación, y la única que
 * concede la insignia de verificado. Por eso aprobar y verificar son dos
 * acciones distintas: publicar una ficha es dejar que se vea, verificarla es
 * afirmar que alguien miró la cédula. Mezclarlas convertiría la insignia en
 * decoración.
 */
export default function AdminNetworkPage() {
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>('pendiente');
  const [aviso, setAviso] = useState<string | null>(null);
  const [fichas, setFichas] = useState<FichaPropia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [verificar, setVerificar] = useState<Record<string, boolean>>({});

  const cargar = useCallback(async () => {
    if (pestana === 'resenas' || pestana === 'impulsos') return;
    setFichas(null);
    setError(null);
    try {
      setFichas(await fichasAdmin(pestana));
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        router.push('/dashboard');
        return;
      }
      setFichas([]);
      setError(errorLegible(e, 'No pudimos cargar la cola de revisión.'));
    }
  }, [pestana, router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actuar = async (ficha: FichaPropia, estado: EstadoExperto) => {
    setOcupado(ficha.id);
    setError(null);
    setAviso(null);
    try {
      const { avisado } = await cambiarEstadoFicha(ficha.id, estado, {
        verificado: estado === 'aprobado' ? Boolean(verificar[ficha.id]) : undefined,
        // Rechazar y suspender exigen motivo: lo lee el experto y queda en la auditoría.
        motivo_rechazo: estado === 'rechazado' || estado === 'suspendido' ? motivos[ficha.id] : undefined,
      });
      // Si el correo no salió, quien revisa tiene que saberlo: el experto no se
      // va a enterar por sí solo de que su ficha cambió.
      setAviso(
        avisado
          ? `«${ficha.nombre_comercial}»: hecho, y se ha avisado al experto por correo.`
          : `«${ficha.nombre_comercial}»: hecho, pero NO se pudo enviar el aviso por correo. Conviene avisarle por otro medio.`
      );
      await cargar();
    } catch (e) {
      setError(errorLegible(e, 'No pudimos cambiar el estado.'));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="p-6 sm:p-8 max-w-[1100px] mx-auto">
      <Link href="/dashboard/admin" className="text-white/40 hover:text-white text-xs font-semibold">
        ← Panel de administración
      </Link>

      <h1 className="text-2xl font-extrabold tracking-tight mt-4 mb-1">Red de expertos</h1>
      <p className="text-white/40 text-sm mb-6 max-w-2xl">
        Una ficha aprobada se hace pública. La insignia de acreditación comprobada es aparte, y solo
        debería marcarse si el documento respalda lo que dice la ficha.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            onClick={() => setPestana(p.clave)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              pestana === p.clave
                ? 'bg-white text-[#070E17]'
                : 'text-white/50 hover:text-white border border-white/10'
            }`}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {aviso && (
        <div className="mb-5 rounded-xl border border-white/15 bg-white/[0.04] p-4">
          <p className="text-white/70 text-sm">{aviso}</p>
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-rose-300 text-sm">{error}</p>
        </div>
      )}

      {pestana === 'resenas' ? (
        <ModeracionResenas />
      ) : pestana === 'impulsos' ? (
        <ModeracionImpulsos />
      ) : fichas === null ? (
        <p className="text-white/40 text-sm">Cargando…</p>
      ) : fichas.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-white/50 text-sm">
            {pestana === 'pendiente' ? 'No hay nada por revisar.' : 'Ninguna ficha en este estado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {fichas.map((ficha) => (
            <article key={ficha.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-white font-bold">{ficha.nombre_comercial}</h2>
                    <span className="px-2 py-0.5 rounded-full border border-white/15 text-white/50 text-[10px] font-bold uppercase tracking-widest">
                      {NOMBRE_CATEGORIA[ficha.categoria]}
                    </span>
                    {ficha.verificado && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                        Verificada
                      </span>
                    )}
                  </div>
                  <p className="text-white/30 text-xs mt-1">
                    Presentada el {FECHA.format(new Date(ficha.fecha_creacion))}
                  </p>
                </div>
                {ficha.estado === 'aprobado' && (
                  <Link
                    href={`/network/${ficha.id}`}
                    target="_blank"
                    className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 text-xs font-bold hover:bg-white/5"
                  >
                    Ver pública ↗
                  </Link>
                )}
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <Dato etiqueta="Nombre corto">{ficha.nombre_display}</Dato>
                <Dato etiqueta="Especialidad">{ficha.especialidad}</Dato>
                <Dato etiqueta="Ubicación">
                  {[ficha.ciudad, ficha.pais].filter(Boolean).join(', ')}
                </Dato>
                <Dato etiqueta="Tarifa">
                  {formatearTarifa(ficha.tarifa_desde, ficha.moneda) ?? 'A consultar'}
                </Dato>
                <Dato etiqueta="Email">{ficha.email_contacto}</Dato>
                <Dato etiqueta="Teléfono">{ficha.telefono}</Dato>
                <Dato etiqueta="Contacto público">{ficha.mostrar_contacto ? 'Sí' : 'No'}</Dato>
                <Dato etiqueta="Sitio web">
                  {ficha.sitio_web && (
                    <a
                      href={ficha.sitio_web}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline decoration-white/20 hover:text-white"
                    >
                      {ficha.sitio_web}
                    </a>
                  )}
                </Dato>
                <Dato etiqueta="Acreditación">
                  {ficha.tiene_documento ? (
                    <button
                      type="button"
                      onClick={() =>
                        abrirDocumento(ficha.id).catch((e) =>
                          setError(errorLegible(e, 'No se pudo abrir el documento.'))
                        )
                      }
                      className="underline decoration-white/20 hover:text-white"
                    >
                      Abrir documento ↗
                    </button>
                  ) : (
                    <span className="text-amber-300/70">Sin documento</span>
                  )}
                </Dato>
              </dl>

              {(ficha.bio_corta || ficha.bio_larga) && (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 mb-4">
                  {ficha.bio_corta && <p className="text-white/70 text-sm">{ficha.bio_corta}</p>}
                  {ficha.bio_larga && (
                    <p className="text-white/50 text-xs leading-relaxed mt-2 whitespace-pre-line">
                      {ficha.bio_larga}
                    </p>
                  )}
                </div>
              )}

              {ficha.sub_especialidades.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {ficha.sub_especialidades.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/50"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {ficha.motivo_rechazo && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 mb-4">
                  <p className="text-rose-200/80 text-xs">
                    <span className="font-bold">Motivo del rechazo anterior: </span>
                    {ficha.motivo_rechazo}
                  </p>
                </div>
              )}

              {/* ── Acciones ─────────────────────────────────────────────── */}
              <div className="border-t border-white/5 pt-4 space-y-3">
                {ficha.estado !== 'aprobado' && (
                  <label
                    className={`flex items-start gap-3 ${ficha.tiene_documento ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <input
                      type="checkbox"
                      disabled={!ficha.tiene_documento}
                      checked={Boolean(verificar[ficha.id]) && ficha.tiene_documento}
                      onChange={(e) =>
                        setVerificar((v) => ({ ...v, [ficha.id]: e.target.checked }))
                      }
                      className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5"
                    />
                    <span className="text-white/60 text-xs leading-relaxed">
                      Marcar como <strong className="text-white/80">acreditación comprobada</strong>
                      <span className="block text-white/30 mt-0.5">
                        {ficha.tiene_documento
                          ? 'Solo si has abierto el documento y respalda lo que dice la ficha. Esta insignia es lo que hace que alguien confíe su asunto a un desconocido.'
                          : 'No disponible: la ficha no tiene documento. Se puede publicar, pero no verificar.'}
                      </span>
                    </span>
                  </label>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {ficha.estado !== 'aprobado' && (
                    <button
                      onClick={() => actuar(ficha, 'aprobado')}
                      disabled={ocupado === ficha.id}
                      className="px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:brightness-125 disabled:opacity-50"
                    >
                      Aprobar y publicar
                    </button>
                  )}
                  {ficha.estado === 'aprobado' && (
                    <button
                      onClick={() => actuar(ficha, 'suspendido')}
                      disabled={ocupado === ficha.id || (motivos[ficha.id] ?? '').trim().length < 5}
                      title={
                        (motivos[ficha.id] ?? '').trim().length >= 5
                          ? undefined
                          : 'Escribe abajo el motivo de la suspensión'
                      }
                      className="px-4 py-2 rounded-lg border border-white/15 text-white/70 text-xs font-bold hover:bg-white/5 disabled:opacity-40"
                    >
                      Suspender
                    </button>
                  )}
                </div>

                {ficha.estado !== 'rechazado' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={motivos[ficha.id] ?? ''}
                      onChange={(e) => setMotivos((m) => ({ ...m, [ficha.id]: e.target.value }))}
                      placeholder={
                        ficha.estado === 'aprobado'
                          ? 'Motivo para rechazar o suspender: lo lee el experto y queda en la auditoría'
                          : 'Motivo del rechazo: el experto lo va a leer y tiene que poder corregirlo'
                      }
                      className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
                    />
                    <button
                      onClick={() => actuar(ficha, 'rechazado')}
                      disabled={ocupado === ficha.id || (motivos[ficha.id] ?? '').trim().length < 5}
                      title={
                        (motivos[ficha.id] ?? '').trim()
                          ? undefined
                          : 'Escribe el motivo antes de rechazar'
                      }
                      className="px-4 py-2 rounded-lg border border-rose-500/30 text-rose-300 text-xs font-bold hover:bg-rose-500/10 disabled:opacity-40"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
