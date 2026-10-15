'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  actualizarSolicitudArco,
  listarSolicitudesArco,
  miRolAdmin,
  type EstadoArco,
  type SolicitudArco,
} from '@/lib/admin';
import { ESTADOS_ABIERTOS, NOMBRE_ESTADO_ARCO, NOMBRE_TIPO_ARCO } from '@/lib/arco';

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });
const DIA_MS = 24 * 60 * 60 * 1000;

function errorDe(e: unknown, porDefecto: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? porDefecto;
}

/** Días que faltan para una fecha límite (negativo si ya venció). */
function diasPara(fecha: string): number {
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / DIA_MS);
}

/**
 * Bandeja de solicitudes ARCO (docs/legal/09_PROCEDIMIENTO_ARCO.md).
 *
 * Plazos de la LFPDPPP: 20 días para responder desde la recepción y 15 para
 * ejecutar desde la respuesta. Las abiertas van primero, por fecha límite.
 */
export default function ArcoAdminPage() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<SolicitudArco[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<{ estado: EstadoArco; respuesta: string; notas: string }>({
    estado: 'recibida',
    respuesta: '',
    notas: '',
  });
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const yo = await miRolAdmin();
      if (!yo.permisos.atenderArco) {
        router.push('/dashboard/admin');
        return;
      }
      setSolicitudes(await listarSolicitudesArco());
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        router.push('/dashboard/admin');
        return;
      }
      setError('No se pudieron cargar las solicitudes.');
    }
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = (s: SolicitudArco) => {
    setAbierta(abierta === s.id ? null : s.id);
    setBorrador({ estado: s.estado, respuesta: s.respuesta ?? '', notas: s.notas_internas ?? '' });
    setAviso(null);
    setError(null);
  };

  const guardar = async (s: SolicitudArco, enviar: boolean) => {
    if (enviar && !borrador.respuesta.trim()) {
      setError('Escribe la respuesta antes de enviarla.');
      return;
    }
    if (enviar && !window.confirm(`Se enviará la respuesta por correo a ${s.email}. ¿Continuar?`)) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const r = await actualizarSolicitudArco(s.id, {
        estado: borrador.estado,
        respuesta: borrador.respuesta.trim() || null,
        notas_internas: borrador.notas.trim() || null,
        enviar_respuesta: enviar,
      });
      setAviso(
        enviar
          ? r.respuesta_enviada
            ? `${s.folio}: guardada y respuesta enviada a ${s.email}.`
            : `${s.folio}: guardada, pero el correo NO salió. Envíala manualmente.`
          : `${s.folio}: guardada.`,
      );
      await cargar();
    } catch (e) {
      setError(errorDe(e, 'No se pudo guardar.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mx-auto max-w-[960px] p-6 sm:p-8">
      <Link href="/dashboard/admin" className="text-xs font-semibold text-white/40 hover:text-white">
        ← Centro de Control
      </Link>

      <h1 className="mb-1 mt-4 text-2xl font-extrabold tracking-tight">Solicitudes ARCO</h1>
      <p className="mb-6 max-w-2xl text-sm text-white/40">
        Responde en un máximo de 20 días desde la recepción y ejecuta en los 15 siguientes. Antes de entregar datos o
        borrar una cuenta, confirma la identidad del titular por correo. Formulario público:{' '}
        <Link href="/arco" className="underline">
          /arco
        </Link>
        .
      </p>

      {aviso && (
        <div className="mb-4 rounded-xl border border-white/15 bg-white/[0.04] p-4">
          <p className="text-sm text-white/70">{aviso}</p>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      {solicitudes === null ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : solicitudes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-white/50">No hay solicitudes.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
          {solicitudes.map((s) => {
            const abiertaSol = ESTADOS_ABIERTOS.includes(s.estado);
            const restantes = diasPara(s.fecha_limite_respuesta);
            const restantesEjec = s.fecha_limite_ejecucion && s.estado === 'respondida' ? diasPara(s.fecha_limite_ejecucion) : null;
            return (
              <li key={s.id} className="bg-white/[0.02]">
                <button type="button" onClick={() => abrir(s)} className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      <span className="font-mono">{s.folio}</span> · {NOMBRE_TIPO_ARCO[s.tipo]}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {s.nombre} · {s.email}
                      {s.relacion === 'representante' ? ' · por representante' : ''}
                      {s.usuario_id ? ' · tiene cuenta' : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-white/30">Recibida el {FECHA.format(new Date(s.fecha_recepcion))}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-white/60">{NOMBRE_ESTADO_ARCO[s.estado]}</span>
                    {abiertaSol && (
                      <p className={`mt-0.5 text-xs font-bold ${restantes <= 3 ? 'text-rose-300' : 'text-white/40'}`}>
                        {restantes < 0 ? `Vencida hace ${-restantes} d` : `Responder en ${restantes} d`}
                      </p>
                    )}
                    {restantesEjec !== null && (
                      <p className={`mt-0.5 text-xs font-bold ${restantesEjec <= 3 ? 'text-rose-300' : 'text-white/40'}`}>
                        {restantesEjec < 0 ? `Ejecución vencida hace ${-restantesEjec} d` : `Ejecutar en ${restantesEjec} d`}
                      </p>
                    )}
                  </div>
                </button>

                {abierta === s.id && (
                  <div className="space-y-3 border-t border-white/5 p-4">
                    <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/70">
                      {s.descripcion}
                    </p>
                    <label className="block text-xs font-semibold text-white/50">
                      Estado
                      <select
                        value={borrador.estado}
                        onChange={(e) => setBorrador({ ...borrador, estado: e.target.value as EstadoArco })}
                        className="mt-1 block w-full rounded-lg border border-white/10 bg-[#161618] px-3 py-2 text-sm text-white"
                      >
                        {(Object.keys(NOMBRE_ESTADO_ARCO) as EstadoArco[]).map((e) => (
                          <option key={e} value={e}>
                            {NOMBRE_ESTADO_ARCO[e]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-white/50">
                      Respuesta al titular
                      <textarea
                        value={borrador.respuesta}
                        onChange={(e) => setBorrador({ ...borrador, respuesta: e.target.value })}
                        rows={5}
                        maxLength={8000}
                        className="mt-1 block w-full rounded-lg border border-white/10 bg-[#161618] px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-white/50">
                      Notas internas (no se envían)
                      <textarea
                        value={borrador.notas}
                        onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })}
                        rows={3}
                        maxLength={8000}
                        className="mt-1 block w-full rounded-lg border border-white/10 bg-[#161618] px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => guardar(s, false)}
                        disabled={ocupado}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/5 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => guardar(s, true)}
                        disabled={ocupado}
                        className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        Guardar y enviar respuesta
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
