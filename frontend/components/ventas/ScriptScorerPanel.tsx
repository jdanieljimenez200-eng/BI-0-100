'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';

interface MetricaGuion {
  nombre: string;
  score: number;
  explicacion: string;
  mejora: string;
}

interface EvaluacionGuion {
  score_general: number;
  resumen: string;
  metricas: MetricaGuion[];
  puntos_fuertes: string[];
  puntos_debiles: string[];
  version_mejorada: string;
  fecha_evaluacion: string;
  /** Solo presente cuando se subió/analizó un vídeo (análisis visual con IA). */
  metricas_visuales?: MetricaGuion[];
}

interface EvaluacionHistorial {
  id: string;
  guion_input: string;
  resultado: EvaluacionGuion;
}

interface Props {
  analisisId: string;
  bloqueado: boolean;
  /** true si el producto tiene un vídeo de pitch subido — habilita "Evaluar mi vídeo". */
  tieneVideoPitch?: boolean;
}

// ─── Vector Icons (0 Emojis) ──────────────────────────────────────────────────

function IconCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconLock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconEdit(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconClock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCopy(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function IconGauge(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>
    </svg>
  );
}

function IconVideo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  );
}

function IconFolder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function IconEye(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'from-emerald-400 to-green-400' : score >= 60 ? 'from-yellow-400 to-amber-400' : 'from-red-400 to-rose-500';
  const label = score >= 80 ? 'Excelente' : score >= 60 ? 'Regular' : 'Necesita optimización';
  return (
    <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${color} px-3 py-1`}>
      <span className="text-lg font-black text-[#05221B]">{score}</span>
      <span className="text-[11px] font-bold text-[#05221B]">{label}</span>
    </div>
  );
}

function MetricaRow({ m }: { m: MetricaGuion }) {
  const [open, setOpen] = useState(false);
  const pct = m.score;
  const color = pct >= 80 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#f87171';
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-white/[0.03] transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-white">{m.nombre}</span>
            <span className="text-xs font-bold" style={{ color }}>{pct}/100</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: color }} />
          </div>
        </div>
        <span className="text-white/40 shrink-0 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="border-t border-white/[0.05] px-4 pb-4 pt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Diagnóstico</p>
              <p className="text-sm text-white/65">{m.explicacion}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                <IconCheck className="w-3.5 h-3.5" />
                <span>Recomendación de Ajuste</span>
              </div>
              <p className="text-sm text-white/75">{m.mejora}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export default function ScriptScorerPanel({ analisisId, bloqueado, tieneVideoPitch }: Props) {
  const [guion, setGuion] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [loadingVideoDirecto, setLoadingVideoDirecto] = useState(false);
  const [resultado, setResultado] = useState<EvaluacionGuion | null>(null);
  const [historial, setHistorial] = useState<EvaluacionHistorial[]>([]);
  const [tabActiva, setTabActiva] = useState<'nuevo' | 'historial'>('nuevo');
  const [mostrarMejora, setMostrarMejora] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [videoNombre, setVideoNombre] = useState('');

  if (bloqueado) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20">
        <div aria-hidden="true" className="pointer-events-none select-none p-6 blur-[5px] opacity-30 space-y-4">
          <div className="h-4 w-1/3 rounded-full bg-white/10" />
          <div className="h-32 rounded-xl bg-white/[0.05]" />
          <div className="grid grid-cols-3 gap-3">
            {[0,1,2].map(i => <div key={i} className="h-12 rounded-xl bg-white/[0.05]" />)}
          </div>
        </div>
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0A0F17]/60 via-[#0A0F17]/85 to-[#0A0F17]/95 px-6 text-center">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-400">
            <IconLock className="w-5 h-5" />
          </div>
          <h3 className="max-w-md text-lg font-bold text-white">Calibrador de Pitch & Argumentario</h3>
          <p className="max-w-md text-sm text-white/45">Evalúa la estructura argumentativa, claridad de propuesta de valor y efectividad de cierre.</p>
        </div>
      </div>
    );
  }

  async function evaluar() {
    if (!guion.trim() || guion.trim().length < 10) return;
    setLoading(true);
    setResultado(null);
    setMostrarMejora(false);
    setError(null);
    try {
      const res = await api.post(`/ventas/${analisisId}/guion`, { guion });
      setResultado(res.data.evaluacion);
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo evaluar el argumentario. Intenta de nuevo.');
      setError(info.mensaje);
    } finally {
      setLoading(false);
    }
  }

  async function evaluarVideo() {
    setLoadingVideo(true);
    setResultado(null);
    setMostrarMejora(false);
    setError(null);
    try {
      const res = await api.post(`/ventas/${analisisId}/guion`, { usar_video_producto: true });
      setResultado(res.data.evaluacion);
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo evaluar el vídeo de pitch. Intenta de nuevo.');
      setError(info.mensaje);
    } finally {
      setLoadingVideo(false);
    }
  }

  async function evaluarVideoDirecto() {
    const archivo = videoFileRef.current?.files?.[0];
    if (!archivo) return;
    if (archivo.size > MAX_VIDEO_BYTES) {
      setError('El vídeo supera el máximo de 50 MB');
      return;
    }
    setLoadingVideoDirecto(true);
    setResultado(null);
    setMostrarMejora(false);
    setError(null);
    try {
      const form = new FormData();
      form.append('video', archivo);
      const res = await api.post(`/ventas/${analisisId}/guion`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResultado(res.data.evaluacion);
      setVideoNombre('');
      if (videoFileRef.current) videoFileRef.current.value = '';
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo analizar el vídeo. Intenta de nuevo.');
      setError(info.mensaje);
    } finally {
      setLoadingVideoDirecto(false);
    }
  }

  async function cargarHistorial() {
    try {
      const res = await api.get(`/ventas/${analisisId}/guiones`);
      setHistorial((res.data.evaluaciones as EvaluacionHistorial[]).reverse());
    } catch { /* noop */ }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Tabs */}
      <div className="inline-flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
        {(['nuevo', 'historial'] as const).map(t => (
          <button key={t} onClick={() => { setTabActiva(t); if (t === 'historial') cargarHistorial(); }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${tabActiva === t ? 'bg-amber-500/20 text-amber-200' : 'text-white/45 hover:text-white/75'}`}>
            {t === 'nuevo' ? (
              <>
                <IconEdit className="w-3.5 h-3.5" />
                <span>Calibrar Argumentario</span>
              </>
            ) : (
              <>
                <IconClock className="w-3.5 h-3.5" />
                <span>Historial</span>
              </>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-white/40 hover:text-white ml-2 text-sm font-bold">×</button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {tabActiva === 'nuevo' ? (
          <motion.div key="nuevo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Input area */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2">
                <IconEdit className="w-3.5 h-3.5" />
                <span>Argumentario Comercial, Hook o Cierre</span>
              </div>
              <textarea
                className="w-full min-h-[140px] rounded-xl border border-white/[0.08] bg-white/[0.04] p-3.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-400/40 resize-y"
                placeholder={'Pega aquí tu guion de ventas, caption, hook de video, o CTA...\n\nEjemplo:\n"¿Cansado de perder clientes por responder tarde? Con nuestra app, atiendes 3x más rápido. Prueba 7 días gratis. Escríbenos ahora."'}
                value={guion}
                onChange={e => setGuion(e.target.value)}
                maxLength={5000}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-white/25">{guion.length}/5000 caracteres</span>
                <button
                  id="evaluar-guion-btn"
                  onClick={evaluar}
                  disabled={loading || guion.trim().length < 10}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-sm font-bold text-[#05221B] shadow-[0_4px_20px_rgba(251,191,36,0.25)] transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                      </svg>
                      Analizando métricas...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <IconGauge className="w-3.5 h-3.5" />
                      <span>Calibrar Argumentario</span>
                    </span>
                  )}
                </button>
              </div>
            </div>

            {tieneVideoPitch && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1">O evalúa tu vídeo de pitch</p>
                  <p className="text-xs text-white/40">Transcribimos el vídeo que ya subiste y lo calificamos igual que un guion.</p>
                </div>
                <button
                  onClick={evaluarVideo}
                  disabled={loadingVideo}
                  className="shrink-0 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-200 transition-all hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loadingVideo ? 'Transcribiendo...' : 'Evaluar mi vídeo de pitch'}
                </button>
              </div>
            )}

            {/* Subida directa de vídeo — análisis visual con IA */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300 mb-1">
                  <IconEye className="w-3.5 h-3.5" />
                  <span>O sube un vídeo nuevo para análisis visual</span>
                </div>
                <p className="text-xs text-white/40">Transcribimos tu voz Y analizamos con visión (energía, entorno, producto en cámara).</p>
              </div>
              <div>
                <div
                  onClick={() => videoFileRef.current?.click()}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/[0.04]"
                >
                  <div className="w-9 h-9 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50">
                    {videoNombre ? <IconVideo className="w-4.5 h-4.5 text-cyan-400" /> : <IconFolder className="w-4.5 h-4.5" />}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm text-white/45">{videoNombre || 'Haz clic para seleccionar un vídeo'}</span>
                    <span className="text-[11px] text-white/25">mp4, webm o mov — máximo 50 MB</span>
                  </div>
                </div>
                <input
                  ref={videoFileRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={e => setVideoNombre(e.target.files?.[0]?.name ?? '')}
                />
              </div>
              <button
                onClick={evaluarVideoDirecto}
                disabled={loadingVideoDirecto || !videoNombre}
                className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-200 transition-all hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loadingVideoDirecto ? 'Analizando vídeo: transcripción + visión...' : 'Analizar vídeo subido'}
              </button>
            </div>

            {/* Resultado */}
            <AnimatePresence>
              {resultado && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                  className="space-y-4">
                  {/* Score general */}
                  <div className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent p-5">
                    <div className="shrink-0 pt-0.5">
                      <ScoreBadge score={resultado.score_general} />
                    </div>
                    <div>
                      <p className="text-sm leading-relaxed text-white/75 mb-3">{resultado.resumen}</p>
                      <div className="flex flex-wrap gap-2">
                        {resultado.puntos_fuertes.map((f, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/[0.08] px-2.5 py-0.5 text-[11px] text-emerald-200">
                            <IconCheck className="w-3 h-3 text-emerald-400" />
                            <span>{f}</span>
                          </span>
                        ))}
                        {resultado.puntos_debiles.map((d, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full border border-red-400/20 bg-red-500/[0.08] px-2.5 py-0.5 text-[11px] text-red-200">
                            <IconX className="w-3 h-3 text-red-400" />
                            <span>{d}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Métricas */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Breakdown por criterio</p>
                    {resultado.metricas.map((m, i) => <MetricaRow key={i} m={m} />)}
                  </div>

                  {/* Análisis visual (solo si se evaluó un vídeo) */}
                  {resultado.metricas_visuales && resultado.metricas_visuales.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                        <IconEye className="w-3.5 h-3.5" />
                        <span>Análisis Visual del Pitch</span>
                      </div>
                      {resultado.metricas_visuales.map((m, i) => <MetricaRow key={i} m={m} />)}
                    </div>
                  )}

                  {/* Versión mejorada */}
                  <div>
                    <button
                      onClick={() => setMostrarMejora(v => !v)}
                      className="w-full flex items-center justify-between rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] px-5 py-3.5 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-500/[0.12]"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <IconCheck className="w-4 h-4 text-emerald-400" />
                        <span>Ver argumentario optimizado</span>
                      </span>
                      <span className="text-xs">{mostrarMejora ? '▲' : '▼'}</span>
                    </button>
                    <AnimatePresence>
                      {mostrarMejora && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="rounded-b-2xl border border-t-0 border-emerald-400/15 bg-emerald-500/[0.04] px-5 py-4">
                            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-white/80 font-sans">
                              {resultado.version_mejorada}
                            </pre>
                            <button
                              onClick={() => navigator.clipboard.writeText(resultado.version_mejorada)}
                              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-emerald-300/70 hover:text-emerald-300 transition-colors"
                            >
                              <IconCopy className="w-3.5 h-3.5" />
                              <span>Copiar argumentario optimizado</span>
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="historial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {historial.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] p-5 text-center text-sm text-white/35">
                No hay evaluaciones guardadas aún.
              </div>
            ) : historial.map((h) => (
              <div key={h.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm italic text-white/50 line-clamp-2">"{h.guion_input}"</p>
                  <ScoreBadge score={h.resultado.score_general} />
                </div>
                <p className="text-xs text-white/30">{new Date(h.resultado.fecha_evaluacion).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
