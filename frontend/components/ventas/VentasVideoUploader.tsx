'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VIDEO_ACCEPT,
  VIDEO_MAX_BYTES,
  eliminarVideoProducto,
  formatearMB,
  mensajeErrorVideo,
  subirVideoProducto,
  urlPublicaVideo,
  validarVideo,
} from '@/lib/ventasVideo';

/**
 * Subida del vídeo de demo/pitch del producto dentro del módulo de VENTAS.
 * Paleta alineada al resto de la página (#0F1C2A, border-white/10, bg-ventas).
 */
interface VentasVideoUploaderProps {
  productoId: string;
  /** `video_url` tal como lo devuelve el backend (absoluto en prod, relativo en dev). */
  videoUrl?: string | null;
  /** Se notifica con la nueva URL, o null tras eliminar. */
  onChange?: (videoUrl: string | null) => void;
  disabled?: boolean;
}

export default function VentasVideoUploader({
  productoId,
  videoUrl = null,
  onChange,
  disabled = false,
}: VentasVideoUploaderProps) {
  const [urlGuardada, setUrlGuardada] = useState<string | null>(videoUrl);
  const [previewLocal, setPreviewLocal] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [borrando, setBorrando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);

  // Sincroniza si el padre recarga el producto.
  useEffect(() => {
    setUrlGuardada(videoUrl);
  }, [videoUrl]);

  const limpiarPreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setPreviewLocal(null);
  }, []);

  // Al desmontar: cancelar subida en curso y liberar el object URL.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
    },
    []
  );

  const procesarArchivo = useCallback(
    async (file: File) => {
      const problema = validarVideo(file);
      if (problema) {
        setError(problema);
        setAviso('');
        return;
      }

      setError('');
      setAviso('');
      setConfirmarBorrado(false);

      // Preview inmediata mientras sube (se descarta al terminar: a partir de
      // ahí se reproduce la URL real del storage).
      const objectUrl = URL.createObjectURL(file);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = objectUrl;
      setPreviewLocal(objectUrl);

      setProgreso(0);
      setSubiendo(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const data = await subirVideoProducto(productoId, file, setProgreso, controller.signal);
        setUrlGuardada(data.video_url);
        onChange?.(data.video_url);
        setAviso('Vídeo actualizado.');
        limpiarPreview();
      } catch (err) {
        setError(mensajeErrorVideo(err));
        limpiarPreview();
      } finally {
        setSubiendo(false);
        setProgreso(0);
        abortRef.current = null;
        // Permite volver a elegir el mismo archivo tras un fallo.
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [productoId, onChange, limpiarPreview]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setArrastrando(false);
      if (disabled || subiendo || borrando) return;
      const file = e.dataTransfer.files?.[0];
      if (file) void procesarArchivo(file);
    },
    [disabled, subiendo, borrando, procesarArchivo]
  );

  const handleEliminar = useCallback(async () => {
    setError('');
    setAviso('');
    setBorrando(true);
    try {
      await eliminarVideoProducto(productoId);
      setUrlGuardada(null);
      onChange?.(null);
      limpiarPreview();
      setAviso('Vídeo eliminado.');
      setConfirmarBorrado(false);
    } catch (err) {
      setError(mensajeErrorVideo(err));
    } finally {
      setBorrando(false);
    }
  }, [productoId, onChange, limpiarPreview]);

  const bloqueado = disabled || subiendo || borrando;
  const fuente = previewLocal ?? (urlGuardada ? urlPublicaVideo(urlGuardada) : null);
  const inputId = `video-ventas-${productoId}`;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!bloqueado) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={handleDrop}
        className={[
          'rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          arrastrando ? 'border-ventas bg-ventas/10' : 'border-white/10 bg-white/[0.02]',
          bloqueado ? 'opacity-60' : '',
        ].join(' ')}
      >
        <p className="text-xs font-semibold text-white/80">
          Arrastra aquí tu vídeo de demo o pitch de venta
        </p>
        <p className="mt-1 text-[11px] text-white/30">
          mp4, webm, mov o m4v · máximo {formatearMB(VIDEO_MAX_BYTES)}
        </p>

        <label
          htmlFor={inputId}
          className={[
            'mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-ventas px-4 py-2.5',
            'text-xs font-bold text-white transition hover:opacity-90',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-ventas/40',
            bloqueado ? 'pointer-events-none opacity-40' : '',
          ].join(' ')}
        >
          {subiendo ? 'Subiendo…' : urlGuardada ? 'Reemplazar vídeo' : 'Elegir vídeo'}
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            disabled={bloqueado}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void procesarArchivo(file);
            }}
            className="sr-only"
          />
        </label>
      </div>

      {subiendo && (
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progreso}
            aria-label="Progreso de subida del vídeo"
            className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
          >
            <div
              className="h-full rounded-full bg-ventas transition-[width] duration-200"
              style={{ width: `${progreso}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/40">
            <span className="tabular-nums">{progreso}%</span>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded font-semibold text-white/50 underline transition hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ventas/40"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {fuente && (
        <div className="space-y-3">
          <video
            key={fuente}
            src={fuente}
            controls
            preload="metadata"
            playsInline
            className="max-h-72 w-full rounded-xl border border-white/8 bg-black"
          >
            Tu navegador no puede reproducir este vídeo.
          </video>

          {urlGuardada && !subiendo && (
            <div className="flex flex-wrap items-center gap-2">
              {confirmarBorrado ? (
                <>
                  <span className="text-xs text-white/60">¿Eliminar el vídeo?</span>
                  <button
                    type="button"
                    onClick={() => void handleEliminar()}
                    disabled={borrando}
                    className="rounded-lg bg-brand-accent px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:opacity-40"
                  >
                    {borrando ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarBorrado(false)}
                    disabled={borrando}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/60 transition hover:border-white/20 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-40"
                  >
                    No
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(true)}
                  disabled={disabled}
                  className="rounded-lg border border-brand-accent/30 px-3 py-1.5 text-[11px] font-semibold text-brand-accent transition hover:border-brand-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:opacity-40"
                >
                  Quitar vídeo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <p aria-live="polite" className="min-h-[1.125rem] text-[11px]">
        {error ? (
          <span className="text-brand-accent">{error}</span>
        ) : aviso ? (
          <span className="text-ventas">{aviso}</span>
        ) : null}
      </p>
    </div>
  );
}