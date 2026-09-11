import { useEffect, useRef } from 'react';
import api from '@/lib/api';

export type AnalysisEvent = {
  id: string;
  estado: 'procesando' | 'completado' | 'error';
  productoId?: string;
  tipo?: string;
  errorMessage?: string;
};

/** Escalones de sondeo: rápido al principio, más lento cuanto más tarda. */
const POLL_STEPS: ReadonlyArray<{ until: number; delay: number }> = [
  { until: 30_000, delay: 3_000 },
  { until: 120_000, delay: 6_000 },
  { until: Number.POSITIVE_INFINITY, delay: 12_000 },
];

/** Con SSE vivo el polling es solo red de seguridad. */
const SSE_POLL_DELAY = 20_000;

/** Tras este tiempo el análisis se considera perdido y se deja de sondear. */
const MAX_DURATION = 10 * 60 * 1000;

/** Reintentos de SSE antes de rendirse (token inválido, proxy sin soporte, etc.). */
const MAX_SSE_ERRORS = 3;

function delayFor(elapsed: number, sseLive: boolean): number {
  if (sseLive) return SSE_POLL_DELAY;
  const step = POLL_STEPS.find((s) => elapsed < s.until);
  return step ? step.delay : 12_000;
}

function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * Hook para recibir actualizaciones de análisis vía SSE + polling de seguridad.
 *
 * - SSE: el backend emite frames NOMBRADOS (`event: analysis-update`), por lo que
 *   se registra ese listener además de `message` (frame de handshake sin nombre).
 *   EventSource no permite headers custom: el token va en `?token=`.
 * - Polling: intervalo escalonado (3s → 6s → 12s), 20s si el SSE está vivo y
 *   pausado mientras la pestaña está oculta. Así el sondeo ya no agota el
 *   rate-limit de /api por sí solo.
 * - onUpdate va en un ref para no incluirlo en deps y evitar reconectar el SSE
 *   en cada render.
 */
export function useAnalysisEvents(
  analysisId: string,
  statusEndpoint: string, // e.g. '/mercado/:id/status'
  onUpdate: (event: AnalysisEvent) => void
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!analysisId || !statusEndpoint) return;

    let closed = false;
    let sseLive = false;
    let sseErrors = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let source: EventSource | null = null;
    const startedAt = Date.now();

    const stop = (): void => {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      source?.close();
    };

    const emit = (event: AnalysisEvent): void => {
      if (closed) return;
      onUpdateRef.current(event);
      if (event.estado === 'completado' || event.estado === 'error') stop();
    };

    const scheduleNext = (): void => {
      if (closed) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed > MAX_DURATION) {
        stop();
        return;
      }
      timer = setTimeout(() => void tick(), delayFor(elapsed, sseLive));
    };

    const tick = async (): Promise<void> => {
      if (closed) return;
      // Pestaña en background: no gastar cupo, el SSE sigue escuchando.
      if (typeof document !== 'undefined' && document.hidden) {
        scheduleNext();
        return;
      }
      try {
        const { data } = await api.get(statusEndpoint);
        // Mercado devuelve `estado`; marketing y el resto `estado_analisis`.
        const estado = (data?.estado ?? data?.estado_analisis) as
          | AnalysisEvent['estado']
          | undefined;
        const errorMessage: string | undefined =
          data?.error ?? data?.error_mensaje ?? undefined;
        if (estado === 'completado' || estado === 'error') {
          emit({ id: analysisId, estado, errorMessage });
          return;
        }
      } catch (err: unknown) {
        const status = statusOf(err);
        // 404 = no existe, 401/403 = sesión perdida: dejar de pedir.
        if (status === 404 || status === 401 || status === 403) {
          stop();
          return;
        }
        // 429 y errores de red: se reintenta en el siguiente escalón.
      }
      scheduleNext();
    };

    const onVisible = (): void => {
      if (closed || document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), 250);
    };

    // ── SSE (notificación inmediata cuando está disponible) ───────────────────
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const url = token
      ? `${base}/events?token=${encodeURIComponent(token)}`
      : `${base}/events`;

    const handleFrame = (e: Event): void => {
      if (closed) return;
      const raw = (e as MessageEvent<string>).data;
      if (!raw) return;
      try {
        const data = JSON.parse(raw) as Partial<AnalysisEvent> & { status?: string };
        if (data.status === 'connected') {
          sseLive = true;
          return;
        }
        if (!data.id || data.id !== analysisId || !data.estado) return;
        emit({
          id: data.id,
          estado: data.estado,
          productoId: data.productoId,
          tipo: data.tipo,
          errorMessage: data.errorMessage,
        });
      } catch {
        // frame malformado: ignorar
      }
    };

    const handleOpen = (): void => {
      sseLive = true;
      sseErrors = 0;
    };

    const handleError = (): void => {
      sseLive = false;
      sseErrors += 1;
      // EventSource reintenta solo; si el fallo es persistente (token inválido,
      // proxy que corta el stream) se cierra y queda el polling.
      if (sseErrors >= MAX_SSE_ERRORS) source?.close();
    };

    try {
      source = new EventSource(url, { withCredentials: true });
      source.addEventListener('open', handleOpen);
      source.addEventListener('message', handleFrame);
      source.addEventListener('analysis-update', handleFrame);
      source.addEventListener('error', handleError);
    } catch {
      source = null; // entorno sin EventSource: solo polling
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    // Sondeo inmediato al montar: si el análisis ya terminó en base de datos,
    // emitir en <50ms en vez de esperar SSE_POLL_DELAY (20s).
    void tick();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      if (source) {
        source.removeEventListener('open', handleOpen);
        source.removeEventListener('message', handleFrame);
        source.removeEventListener('analysis-update', handleFrame);
        source.removeEventListener('error', handleError);
        source.close();
      }
    };
  }, [analysisId, statusEndpoint]); // onUpdate excluido intencionalmente (va en ref)
}