'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarCheck2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import api from '@/lib/api';

/**
 * Enlace de la agenda con Google Calendar (solo app → Google).
 * Backend: /api/integraciones/google-calendar.
 */

interface EstadoGoogle {
  disponible: boolean;
  conectado: boolean;
  requiere_reconectar: boolean;
  email: string | null;
  conectado_por_mi: boolean;
  ultimo_error: string | null;
  citas_pendientes: number;
  citas_con_error: number;
}

const MENSAJES_RETORNO: Record<string, string> = {
  conectado: 'Google Calendar conectado. Tus citas se están copiando.',
  cancelado: 'Conexión con Google cancelada.',
  sin_permiso: 'Google no dio permiso para el calendario. Vuelve a intentarlo y marca la casilla del calendario.',
  error: 'No se pudo conectar con Google. Inténtalo de nuevo.',
};

export default function GoogleCalendarCard({
  onAviso,
  onSincronizado,
}: {
  onAviso: (mensaje: string) => void;
  /** Se llama tras encolar una sincronización, para refrescar los indicadores de las citas. */
  onSincronizado?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoGoogle | null>(null);
  const [ocupado, setOcupado] = useState<'conectar' | 'sincronizar' | 'desconectar' | null>(null);
  // En ref: la página pasa una función nueva en cada render y no debe reiniciar el sondeo.
  const alSincronizar = useRef(onSincronizado);
  useEffect(() => {
    alSincronizar.current = onSincronizado;
  }, [onSincronizado]);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<EstadoGoogle>('/integraciones/google-calendar/estado');
      setEstado(data);
    } catch {
      setEstado(null);
    }
  }, []);

  useEffect(() => {
    api
      .get<EstadoGoogle>('/integraciones/google-calendar/estado')
      .then(({ data }) => setEstado(data))
      .catch(() => setEstado(null));
    // Vuelta desde Google: ?google=conectado|cancelado|sin_permiso|error
    const params = new URLSearchParams(window.location.search);
    const retorno = params.get('google');
    if (retorno) {
      onAviso(MENSAJES_RETORNO[retorno] ?? MENSAJES_RETORNO.error);
      params.delete('google');
      const resto = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${resto ? `?${resto}` : ''}`);
    }
    // Solo al montar: el aviso de vuelta de Google se muestra una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras haya citas en cola, refresca el contador cada pocos segundos.
  useEffect(() => {
    if (!estado?.conectado || estado.citas_pendientes === 0) return;
    const t = setTimeout(() => {
      void cargar();
      alSincronizar.current?.();
    }, 4000);
    return () => clearTimeout(t);
  }, [estado, cargar]);

  if (!estado || !estado.disponible) return null;

  async function conectar() {
    setOcupado('conectar');
    try {
      const { data } = await api.post<{ url: string }>('/integraciones/google-calendar/conectar');
      window.location.assign(data.url);
    } catch {
      onAviso('No se pudo iniciar la conexión con Google');
      setOcupado(null);
    }
  }

  async function sincronizar() {
    setOcupado('sincronizar');
    try {
      const { data } = await api.post<{ encoladas: number }>('/integraciones/google-calendar/sincronizar');
      onAviso(data.encoladas ? `Enviando ${data.encoladas} cita(s) a Google Calendar` : 'Todo está al día en Google Calendar');
      await cargar();
      alSincronizar.current?.();
    } catch {
      onAviso('No se pudo sincronizar');
    } finally {
      setOcupado(null);
    }
  }

  async function desconectar() {
    if (!confirm('¿Desconectar Google Calendar? Las citas ya copiadas se quedan en tu calendario de Google.')) return;
    setOcupado('desconectar');
    try {
      await api.delete('/integraciones/google-calendar');
      onAviso('Google Calendar desconectado');
      await cargar();
      alSincronizar.current?.();
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      onAviso(status === 403 ? 'Solo quien lo conectó o el dueño pueden desconectarlo' : 'No se pudo desconectar');
    } finally {
      setOcupado(null);
    }
  }

  const boton =
    'inline-flex items-center gap-1.5 px-3.5 h-8 rounded-xl text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50';

  if (!estado.conectado) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 backdrop-blur-xl transition-all ${
          estado.requiere_reconectar ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/[0.03]'
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {estado.requiere_reconectar ? (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <CalendarCheck2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white tracking-tight">
              {estado.requiere_reconectar ? 'Google Calendar dejó de sincronizar' : 'Copia tus citas en Google Calendar'}
            </p>
            <p className="text-xs text-white/50 mt-0.5 break-words">
              {estado.requiere_reconectar
                ? estado.ultimo_error ?? 'Google retiró el acceso. Vuelve a conectar tu calendario.'
                : 'Cada cita que crees, cambies o canceles aquí aparecerá en tu calendario de Google con su hora local.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={conectar}
          disabled={ocupado !== null}
          className={`${boton} bg-cyan-600 hover:bg-cyan-500 text-white self-start sm:self-auto`}
        >
          {ocupado === 'conectar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarCheck2 className="w-3.5 h-3.5" />}
          {estado.requiere_reconectar ? 'Reconectar' : 'Conectar Google Calendar'}
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <CalendarCheck2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Google Calendar conectado</p>
          <p className="text-xs text-white/50 mt-0.5 break-all">
            {estado.email ?? 'Cuenta de Google'}
            {estado.citas_pendientes > 0 && <span className="text-cyan-300"> · enviando {estado.citas_pendientes}</span>}
            {estado.citas_con_error > 0 && (
              <span className="text-amber-300"> · {estado.citas_con_error} con error (pulsa Sincronizar)</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          onClick={sincronizar}
          disabled={ocupado !== null}
          className={`${boton} border border-white/15 text-white/80 hover:bg-white/5`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${ocupado === 'sincronizar' ? 'animate-spin' : ''}`} />
          Sincronizar
        </button>
        <button
          type="button"
          onClick={desconectar}
          disabled={ocupado !== null}
          className={`${boton} text-white/50 hover:text-red-300 hover:bg-red-500/10`}
        >
          {ocupado === 'desconectar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
          Desconectar
        </button>
      </div>
    </div>
  );
}
