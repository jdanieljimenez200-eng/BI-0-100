'use client';

import { useRef, useState } from 'react';
import api from '@/lib/api';
import type { ReporteAdsProcesado } from './resultado/[analisisId]/RendimientoPasadoSection';

interface Props {
  productoId: string;
  /** Se llama con el reporte procesado, o con null al quitarlo. */
  onReporte: (reporte: ReporteAdsProcesado | null) => void;
  disabled?: boolean;
}

/** Espejo de `uploadReporte` en backend/src/middleware/upload.ts. */
const MAX_BYTES = 10 * 1024 * 1024;
const EXT_VALIDAS = ['.csv', '.xlsx', '.xls'];

const FUENTE_LABEL: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
  generico: 'Reporte genérico',
};

const money = (v: number) =>
  `$${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Number(v ?? 0))}`;

/**
 * Paso opcional del formulario: subir el export de métricas que ya entregan
 * Google Ads, Meta o TikTok.
 *
 * El archivo se manda a `/marketing/metricas-pasadas/parse`, que lo procesa en
 * memoria y devuelve el agregado ya interpretado. **El archivo nunca se
 * almacena**: lo que viaja después, dentro del análisis, es sólo ese resumen.
 *
 * Nunca bloquea el formulario: si falla o se omite, el análisis se lanza igual
 * y la sección de Rendimiento muestra su estado vacío.
 */
export default function ReporteAdsUploader({ productoId, onReporte, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<'idle' | 'procesando' | 'listo'>('idle');
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [resumen, setResumen] = useState<ReporteAdsProcesado | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const limpiar = () => {
    setEstado('idle');
    setError('');
    setUpgrade(false);
    setNombreArchivo('');
    setResumen(null);
    onReporte(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const procesar = async (file: File) => {
    setError('');
    setUpgrade(false);

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!EXT_VALIDAS.includes(ext)) {
      setError('Formato no válido. Sube el CSV o Excel que descargas de tu plataforma de anuncios.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('El archivo supera los 10 MB. Exporta un rango de fechas más corto.');
      return;
    }

    setNombreArchivo(file.name);
    setEstado('procesando');

    try {
      const fd = new FormData();
      fd.append('reporte', file);
      fd.append('producto_id', productoId);

      const { data } = await api.post('/marketing/metricas-pasadas/parse', fd);
      setResumen(data as ReporteAdsProcesado);
      onReporte(data as ReporteAdsProcesado);
      setEstado('listo');
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string; code?: string } } };
      setUpgrade(e.response?.status === 403 || e.response?.data?.code === 'UPGRADE_REQUIRED');
      setError(e.response?.data?.error ?? 'No se pudo leer el archivo. Revisa que sea el export original.');
      setEstado('idle');
      setNombreArchivo('');
      onReporte(null);
    }
  };

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    setArrastrando(false);
    if (disabled) return;
    const file = ev.dataTransfer.files?.[0];
    if (file) void procesar(file);
  };

  /* ── Resultado ─────────────────────────────────────────────────────────── */
  if (estado === 'listo' && resumen) {
    const t = resumen.totales;
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{nombreArchivo}</p>
            <p className="mt-0.5 text-[11px] text-emerald-300/80">
              {FUENTE_LABEL[resumen.fuente] ?? resumen.fuente} · {resumen.campanas?.length ?? 0} campaña(s)
              {resumen.rango_fechas?.inicio
                ? ` · ${resumen.rango_fechas.inicio} → ${resumen.rango_fechas.fin ?? '—'}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={limpiar}
            className="shrink-0 text-[11px] text-white/40 transition-colors hover:text-rose-400"
          >
            Quitar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: 'Inversión', v: money(t.gasto_total) },
            { l: 'Conversiones', v: String(t.conversiones_total ?? 0) },
            { l: 'CPA', v: money(t.cpa_promedio) },
            { l: 'CTR', v: `${Number(t.ctr_promedio ?? 0).toFixed(2)}%` },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <p className="text-[9px] font-mono uppercase tracking-wider text-white/40">{k.l}</p>
              <p className="text-sm font-bold tabular-nums text-white">{k.v}</p>
            </div>
          ))}
        </div>

        {resumen.alertas?.length > 0 && (
          <p className="mt-2.5 text-[11px] leading-relaxed text-amber-200/80">
            {resumen.alertas.length} hallazgo(s) detectado(s): {resumen.alertas[0].titulo}
            {resumen.alertas.length > 1 ? ' y otros más.' : '.'}
          </p>
        )}

        <p className="mt-2.5 text-[10px] leading-relaxed text-white/35">
          El archivo no se guarda: sólo este resumen viaja con tu análisis para alimentar las
          estrategias y el calendario.
        </p>
      </div>
    );
  }

  /* ── Dropzone ──────────────────────────────────────────────────────────── */
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        onClick={() => !disabled && estado !== 'procesando' && inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-all ${
          arrastrando
            ? 'border-pink-400/60 bg-pink-500/[0.06]'
            : 'border-white/[0.12] bg-white/[0.02] hover:border-white/25'
        } ${disabled || estado === 'procesando' ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void procesar(file);
          }}
        />

        {estado === 'procesando' ? (
          <>
            <p className="text-sm font-medium text-white/80">Analizando {nombreArchivo}…</p>
            <p className="mt-1 text-[11px] text-white/40">
              Leyendo campañas y calculando métricas reales.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-white/80">
              Arrastra tu reporte o haz clic para elegirlo
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-white/40">
              El CSV o Excel que descargas de Google Ads, Meta, TikTok o LinkedIn. Máximo 10 MB.
            </p>
          </>
        )}
      </div>

      {error && (
        <p
          className={`mt-2 text-[11px] leading-relaxed ${
            upgrade ? 'text-amber-300' : 'text-rose-300'
          }`}
        >
          {error}
          {upgrade && ' Puedes continuar sin adjuntar métricas.'}
        </p>
      )}
    </div>
  );
}
