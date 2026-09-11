'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';

interface AnalisisCompetidor {
  id: string;
  nombre: string;
  hook_primeros_segundos: string;
  propuesta_valor: string;
  tono: string;
  puntos_fuertes: string[];
  puntos_debiles: string[];
  estructura_contenido: string;
  cta_usado: string;
  transcripcion_degradada?: boolean;
  redes_sociales?: string;
  pagina_web?: string;
  origen?: 'video' | 'foto' | 'texto';
}

interface ComparativaData {
  mi_producto: {
    nombre: string;
    fortalezas_vs_competencia: string[];
    gaps_detectados: string[];
    oportunidades: string[];
  };
  competidores: AnalisisCompetidor[];
  recomendacion_diferenciacion: string;
  tabla_comparativa: Record<string, string>[];
}

// ─── Vector Icons (0 Emojis) ──────────────────────────────────────────────────

function IconLock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconPlus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconBarChart(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
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

function IconImage(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

function IconLink(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconTrash(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function IconCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconAlert(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconTarget(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>
    </svg>
  );
}

function IconLightbulb(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
      <path d="M9 18h6"/><path d="M10 22h4"/>
    </svg>
  );
}

function IconRadar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12 21.5 8.5"/><path d="M12 6a6 6 0 1 0 6 6"/><path d="M12 12h.01"/>
    </svg>
  );
}

interface Props {
  analisisId: string;
  bloqueado: boolean;
  miProductoNombre: string;
}

export default function CompetitorIntelPanel({ analisisId, bloqueado, miProductoNombre }: Props) {
  const [competidores, setCompetidores] = useState<AnalisisCompetidor[]>([]);
  const [comparativa, setComparativa] = useState<ComparativaData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [redesSociales, setRedesSociales] = useState('');
  const [paginaWeb, setPaginaWeb] = useState('');
  const [tabActiva, setTabActiva] = useState<'agregar' | 'comparativa'>('agregar');
  const [tipoArchivo, setTipoArchivo] = useState<'video' | 'foto'>('video');
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivoNombre, setArchivoNombre] = useState('');
  const [cargado, setCargado] = useState(false);

  // Carga inicial
  const cargarDatos = async () => {
    try {
      const res = await api.get(`/ventas/${analisisId}/competidores`);
      setCompetidores(res.data.competidores ?? []);
      setComparativa(res.data.comparativa ?? null);
    } catch { /* noop */ }
    setCargado(true);
  };

  useEffect(() => {
    if (!cargado && !bloqueado) {
      cargarDatos();
    }
  }, [cargado, bloqueado, analisisId]);

  if (bloqueado) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20">
        <div aria-hidden="true" className="pointer-events-none select-none p-6 blur-[5px] opacity-30 space-y-4">
          <div className="h-4 w-1/2 rounded-full bg-white/10" />
          <div className="grid grid-cols-3 gap-3">
            {[0,1,2].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.05]" />)}
          </div>
        </div>
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0A0F17]/60 via-[#0A0F17]/85 to-[#0A0F17]/95 px-6 text-center">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-400">
            <IconLock className="w-5 h-5" />
          </div>
          <h3 className="max-w-md text-lg font-bold text-white">Radar de Inteligencia Competitiva</h3>
          <p className="max-w-md text-sm text-white/45">Modela referentes de mercado y detecta ventajas de conversión, objeciones comunes y diferenciadores clave.</p>
        </div>
      </div>
    );
  }

  function cambiarTipoArchivo(t: 'video' | 'foto') {
    setTipoArchivo(t);
    setArchivoNombre('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function agregarCompetidor() {
    if (!nombre.trim()) return;
    const archivo = fileRef.current?.files?.[0];
    setCargando(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('nombre', nombre.trim());
      if (redesSociales.trim()) form.append('redes_sociales', redesSociales.trim());
      if (paginaWeb.trim()) form.append('pagina_web', paginaWeb.trim());
      if (archivo) form.append(tipoArchivo, archivo);
      const res = await api.post(`/ventas/${analisisId}/competidores`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCompetidores(prev => [...prev, res.data.competidor]);
      setComparativa(res.data.comparativa);
      setNombre('');
      setRedesSociales('');
      setPaginaWeb('');
      setArchivoNombre('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'Error al analizar el competidor. Intenta nuevamente.');
      setError(info.mensaje);
    } finally {
      setCargando(false);
    }
  }

  async function eliminar(id: string) {
    setEliminando(id);
    setError(null);
    try {
      const res = await api.delete(`/ventas/${analisisId}/competidores/${id}`);
      setCompetidores(res.data.competidores);
      setComparativa(res.data.comparativa);
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'Error al eliminar el competidor.');
      setError(info.mensaje);
    }
    setEliminando(null);
  }

  const columnas = comparativa?.tabla_comparativa?.[0] ? Object.keys(comparativa.tabla_comparativa[0]) : [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Tabs */}
      <div className="inline-flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
        {(['agregar', 'comparativa'] as const).map(t => (
          <button key={t} onClick={() => setTabActiva(t)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${tabActiva === t ? 'bg-rose-500/20 text-rose-200' : 'text-white/45 hover:text-white/75'}`}>
            {t === 'agregar' ? (
              <>
                <IconPlus className="w-3.5 h-3.5" />
                <span>Agregar Referente</span>
              </>
            ) : (
              <>
                <IconBarChart className="w-3.5 h-3.5" />
                <span>Matriz Comparativa</span>
              </>
            )}
            {t === 'comparativa' && comparativa && (
              <span className="ml-1 rounded-full bg-rose-400/20 px-1.5 py-0.2 text-[10px] text-rose-300">
                {competidores.length}
              </span>
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
        {tabActiva === 'agregar' ? (
          <motion.div key="agregar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Formulario */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-300">
                <IconRadar className="w-3.5 h-3.5" />
                <span>Añadir Competidor / Referente de Mercado</span>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Nombre del competidor *</label>
                <input
                  className="w-full rounded-xl border border-white/[0.09] bg-white/[0.04] p-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-400/40"
                  placeholder='Ej. "Pizzería El Herradero" o "Marca X"'
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1">
                    <IconLink className="w-3 h-3" />
                    <span>Redes sociales — opcional</span>
                  </label>
                  <input
                    className="w-full rounded-xl border border-white/[0.09] bg-white/[0.04] p-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-400/40"
                    placeholder="Ej. @marca en Instagram, TikTok..."
                    value={redesSociales}
                    onChange={e => setRedesSociales(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1">
                    <IconLink className="w-3 h-3" />
                    <span>Página web — opcional</span>
                  </label>
                  <input
                    className="w-full rounded-xl border border-white/[0.09] bg-white/[0.04] p-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-400/40"
                    placeholder="Ej. marcacompetidora.com"
                    value={paginaWeb}
                    onChange={e => setPaginaWeb(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-white/25 -mt-1">Las redes/web son solo referencia: la IA no las visita ni las analiza, solo las tiene en cuenta como contexto de marca.</p>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-white/50">Vídeo o foto del competidor — opcional</label>
                  <div className="inline-flex gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
                    {(['video', 'foto'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => cambiarTipoArchivo(t)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${tipoArchivo === t ? 'bg-rose-500/20 text-rose-200' : 'text-white/45 hover:text-white/70'}`}
                      >
                        {t === 'video' ? 'Video' : 'Foto'}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] p-6 transition-colors hover:border-rose-400/30 hover:bg-rose-500/[0.04]"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50">
                    {archivoNombre
                      ? (tipoArchivo === 'video' ? <IconVideo className="w-5 h-5 text-rose-400" /> : <IconImage className="w-5 h-5 text-rose-400" />)
                      : <IconFolder className="w-5 h-5" />}
                  </div>
                  <span className="text-sm text-white/40">
                    {archivoNombre || (tipoArchivo === 'video' ? 'Haz clic para seleccionar un video' : 'Haz clic para seleccionar una foto')}
                  </span>
                  <span className="text-[11px] text-white/25">
                    {tipoArchivo === 'video'
                      ? 'mp4, webm o mov — máx 50 MB. Si no adjuntas nada, el análisis se procesa por identidad de marca'
                      : 'jpg, png, webp o gif. Se analiza visualmente con IA (energía, propuesta de valor, mensaje)'}
                  </span>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={tipoArchivo === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif'}
                  className="hidden"
                  onChange={e => setArchivoNombre(e.target.files?.[0]?.name ?? '')}
                />
              </div>
              <button
                id="agregar-competidor-btn"
                onClick={agregarCompetidor}
                disabled={cargando || !nombre.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 py-3 text-sm font-bold text-white shadow-[0_4px_20px_rgba(244,63,94,0.25)] transition-all hover:brightness-110 disabled:opacity-40"
              >
                {cargando ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                    </svg>
                    Analizando competidor...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <IconBarChart className="w-4 h-4" />
                    <span>Procesar y Comparar Referente</span>
                  </span>
                )}
              </button>
            </div>

            {/* Lista de competidores */}
            {competidores.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Competidores modelados ({competidores.length}/10)</p>
                {competidores.map((c) => (
                  <motion.div key={c.id}
                    layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {c.origen === 'video' && <IconVideo className="w-3.5 h-3.5 text-white/30" />}
                          {c.origen === 'foto' && <IconImage className="w-3.5 h-3.5 text-white/30" />}
                          <h4 className="font-semibold text-white">{c.nombre}</h4>
                        </div>
                        <span className="text-xs text-white/35">{c.tono}</span>
                        {(c.redes_sociales || c.pagina_web) && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/30">
                            {c.redes_sociales && (
                              <span className="inline-flex items-center gap-1"><IconLink className="w-2.5 h-2.5" />{c.redes_sociales}</span>
                            )}
                            {c.pagina_web && (
                              <span className="inline-flex items-center gap-1"><IconLink className="w-2.5 h-2.5" />{c.pagina_web}</span>
                            )}
                          </div>
                        )}
                        {c.transcripcion_degradada && (
                          <div
                            className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"
                            title="No se subió video ni foto: este análisis se generó a partir de texto genérico, no de contenido real."
                          >
                            <IconAlert className="w-3 h-3" />
                            <span>Análisis basado en texto genérico, sin video ni foto</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => eliminar(c.id)}
                        disabled={eliminando === c.id}
                        className="p-1 rounded-lg text-white/25 hover:text-red-400 hover:bg-white/5 transition-colors"
                        title="Eliminar competidor"
                      >
                        {eliminando === c.id ? '...' : <IconTrash className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="grid gap-2.5 text-sm md:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold text-white/35 mb-1">Hook / Gancho de Apertura</p>
                        <p className="text-white/60">{c.hook_primeros_segundos}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-white/35 mb-1">Propuesta de valor</p>
                        <p className="text-white/60">{c.propuesta_valor}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-300/70 mb-1">
                          <IconCheck className="w-3 h-3 text-emerald-400" />
                          <span>Fortalezas detectadas</span>
                        </div>
                        <ul className="space-y-0.5">{c.puntos_fuertes.map((f,i) => <li key={i} className="text-white/55">{f}</li>)}</ul>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-red-300/70 mb-1">
                          <IconAlert className="w-3 h-3 text-red-400" />
                          <span>Vulnerabilidades detectadas</span>
                        </div>
                        <ul className="space-y-0.5">{c.puntos_debiles.map((d,i) => <li key={i} className="text-white/55">{d}</li>)}</ul>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="comparativa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {!comparativa ? (
              <div className="rounded-xl border border-white/[0.06] p-6 text-center text-sm text-white/35">
                Agrega al menos un competidor para ver la comparativa estratégica.
              </div>
            ) : (
              <>
                {/* Mi producto vs. competencia */}
                <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-3">
                    <IconTarget className="w-3.5 h-3.5" />
                    <span>{miProductoNombre} — Posicionamiento y Diferenciación</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-300/70 mb-1.5">
                        <IconCheck className="w-3 h-3 text-emerald-400" />
                        <span>Ventajas Competitivas</span>
                      </div>
                      <ul className="space-y-1">{comparativa.mi_producto.fortalezas_vs_competencia.map((f,i) => <li key={i} className="text-sm text-white/65">{f}</li>)}</ul>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[10px] text-red-300/70 mb-1.5">
                        <IconAlert className="w-3 h-3 text-red-400" />
                        <span>Gaps a Mitigar</span>
                      </div>
                      <ul className="space-y-1">{comparativa.mi_producto.gaps_detectados.map((g,i) => <li key={i} className="text-sm text-white/65">{g}</li>)}</ul>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[10px] text-blue-300/70 mb-1.5">
                        <IconLightbulb className="w-3 h-3 text-blue-400" />
                        <span>Vectores de Oportunidad</span>
                      </div>
                      <ul className="space-y-1">{comparativa.mi_producto.oportunidades.map((o,i) => <li key={i} className="text-sm text-white/65">{o}</li>)}</ul>
                    </div>
                  </div>
                </div>

                {/* Recomendación */}
                <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.07] p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-300 mb-1.5">
                    <IconTarget className="w-3.5 h-3.5" />
                    <span>Ángulo de Diferenciación Recomendado</span>
                  </div>
                  <p className="text-sm leading-relaxed text-white/80">{comparativa.recomendacion_diferenciacion}</p>
                </div>

                {/* Tabla comparativa */}
                {columnas.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Tabla comparativa</p>
                    <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/[0.07] bg-white/[0.03]">
                            {columnas.map(col => (
                              <th key={col} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-white/40">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comparativa.tabla_comparativa.map((fila, i) => (
                            <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                              {columnas.map(col => (
                                <td key={col} className={`px-4 py-2.5 text-white/65 ${col === 'Criterio' ? 'font-semibold text-white/80' : ''}`}>
                                  {fila[col] ?? '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
