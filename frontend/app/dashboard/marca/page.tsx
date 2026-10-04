'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { obtenerTodasLasPaletas } from '@/lib/paletasClient';

import {
  type MarcaGuardada, type Producto, type FormState,
  type Step, type LogoAnalysisResult, type BriefResultado, type AnalisisBriefPoll,
  type AnalisisBriefStatus,
  PERCEPCIONES, EMOCIONES, ESTILOS, TIPOS_LOGO, TONOS, POSICIONAMIENTOS, DIFERENCIACIONES,
  API_BASE, FORM_EMPTY, SCORE_TIPS, USOS_MARCA,
  card, cardBg, fieldCls,
} from '@/components/marca/types';
import TransparenciaIA from '@/components/analisis/TransparenciaIA';
import SeccionesExtra from '@/components/analisis/SeccionesExtra';

import {
  ChipToggle, RadioCard, PaletaCard, BlockHeader, ScoreBar,
  ColorSwatch, LogoUpload, FormProgress, TypographyPreview, OtroInput,
} from '@/components/marca/MarcaComponents';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KitMarcaPage() {
  const [step,               setStep]               = useState<Step>('select');
  const [marcaGuardada,      setMarcaGuardada]      = useState<MarcaGuardada | null>(null);
  const [savedBriefResultado,setSavedBriefResultado]= useState<BriefResultado | null>(null);
  const [showFullBrief,      setShowFullBrief]      = useState(false);
  const [productos,          setProductos]          = useState<Producto[]>([]);
  const [productoSel,        setProductoSel]        = useState<Producto | null>(null);
  const [form,               setForm]               = useState<FormState>(FORM_EMPTY);
  const [analisisBrief,      setAnalisisBrief]      = useState<AnalisisBriefPoll | null>(null);
  const [submitting,         setSubmitting]         = useState(false);
  const [loadingSave,        setLoadingSave]        = useState(false);
  const [saved,              setSaved]              = useState(false);
  const [error,              setError]              = useState('');
  const [paletasExpanded,    setPaletasExpanded]    = useState(false);

  // Load data on mount
  useEffect(() => {
    api.get('/marca').then(({ data }) => { if (data) { setMarcaGuardada(data); if (data.brief_data) setSavedBriefResultado(data.brief_data); } }).catch(() => {});
    api
      .get('/dashboard/resumen')
      .then(({ data }) => setProductos(Array.isArray(data?.productos) ? data.productos : []))
      .catch(() => {});
    // Fallback: load from brief/recientes if marca.brief_data is null
    api.get('/brief/recientes').then(({ data }) => {
      if (data.length > 0 && data[0].resultado_data) {
        setSavedBriefResultado(prev => prev ?? (data[0].resultado_data as BriefResultado));
      }
    }).catch(() => {});
  }, []);

  // Load saved kit when product is selected
  useEffect(() => {
    if (!productoSel) return;
    // El selector de producto está en esta misma pantalla: cambiarlo dos veces
    // seguidas deja dos peticiones en vuelo, y si la primera resuelve al final
    // pisa el kit del producto correcto. Este flag descarta la respuesta que
    // llegue tarde.
    let vigente = true;
    api.get(`/marca/producto/${productoSel.id}`).then(({ data }) => {
      if (!vigente || !data) return;
      setMarcaGuardada(data);
      if (data.brief_data) setSavedBriefResultado(data.brief_data);
    }).catch(() => {});
    return () => { vigente = false; };
  }, [productoSel]);

  // ── Poll brief status ──────────────────────────────────────────────────────

  const pollStatus = useCallback(async (id: string) => {
    try {
      const { data } = await api.get<AnalisisBriefStatus>(`/brief/${id}/status`);
      // /status responde { id, estado, error }; estado_analisis es alias legado.
      const estado = data?.estado ?? data?.estado_analisis;
      if (estado === 'completado') {
        const full = await api.get<AnalisisBriefPoll>(`/brief/${id}`);
        setAnalisisBrief(full.data);
        setStep('result');
      } else if (estado === 'error') {
        setError(data?.error ?? data?.error_mensaje ?? 'Error generando el brief');
        setStep('form');
      }
    } catch { /* keep polling */ }
  }, []);

  useEffect(() => {
    if (step !== 'polling' || !analisisBrief) return;
    const timer = setInterval(() => pollStatus(analisisBrief.id), 2000);
    return () => clearInterval(timer);
  }, [step, analisisBrief, pollStatus]);

  // ── Form progress calculation ──────────────────────────────────────────────

  const formSteps = [
    { label: 'Producto', complete: !!productoSel },
    { label: 'Percepción', complete: form.percepcion.length >= 1 && !!form.emocion && form.anti_valores.length >= 1 },
    { label: 'Visual', complete: !!form.estilo_visual && !!form.paleta_elegida && !!form.tipo_logo && !!form.simbolo_representativo.trim() },
    { label: 'Mensaje', complete: !!form.resultado_cliente.trim() && !!form.tono_comunicacion },
    { label: 'Posición', complete: !!form.posicionamiento },
    { label: 'Diferencia', complete: !!form.nivel_diferenciacion },
  ];
  const currentFormStep = formSteps.findIndex(s => !s.complete);

  // ── Validation ─────────────────────────────────────────────────────────────

  const isValid = productoSel &&
    form.percepcion.length >= 1 &&
    (!form.percepcion.includes('__otro__') || form.percepcion_custom.trim()) &&
    form.emocion &&
    (form.emocion !== '__otro__' || form.emocion_custom.trim()) &&
    form.anti_valores.length >= 1 &&
    (!form.anti_valores.includes('__otro__') || form.anti_valores_custom.trim()) &&
    form.estilo_visual &&
    (form.estilo_visual !== '__otro__' || form.estilo_visual_custom.trim()) &&
    form.paleta_elegida &&
    form.tipo_logo &&
    (form.tipo_logo !== '__otro__' || form.tipo_logo_custom.trim()) &&
    form.simbolo_representativo.trim() && form.resultado_cliente.trim() &&
    form.tono_comunicacion &&
    (form.tono_comunicacion !== '__otro__' || form.tono_comunicacion_custom.trim()) &&
    form.posicionamiento && form.nivel_diferenciacion;

  // ── Submit questionnaire ───────────────────────────────────────────────────

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // Los enums del backend son CERRADOS (zod): un valor custom "+ Otro"
      // garantiza rechazo 400. Coerción segura: se descarta el chip custom
      // y el campo de texto libre cae al fallback válido más cercano.
      const resolveChips = (arr: string[]) =>
        arr.filter((v) => v !== '__otro__');
      const resolveField = (val: string, fallback: string) =>
        val === '__otro__' ? fallback : val;

      const { data } = await api.post('/brief/analizar', {
        producto_id: productoSel!.id,
        percepcion: resolveChips(form.percepcion),
        emocion: resolveField(form.emocion, 'Confianza'),
        anti_valores: resolveChips(form.anti_valores),
        estilo_visual: resolveField(form.estilo_visual, 'Minimalista'),
        paleta_elegida: form.paleta_elegida || 'A',
        tipo_logo: resolveField(form.tipo_logo, 'Isologo (texto+ícono juntos)'),
        simbolo_representativo: form.simbolo_representativo,
        resultado_cliente: form.resultado_cliente,
        tono_comunicacion: resolveField(form.tono_comunicacion, 'Cercano y cálido'),
        posicionamiento: form.posicionamiento,
        nivel_diferenciacion: form.nivel_diferenciacion,
        // «Afina tu análisis»: vacío = no declarado (el brief lo dice).
        marcas_admiradas: form.marcas_admiradas.trim() || null,
        marcas_evitar: form.marcas_evitar.trim() || null,
        elementos_conservar: form.elementos_conservar.trim() || null,
        usos_marca: form.usos_marca.length ? form.usos_marca : null,
      });
      setAnalisisBrief({ id: data.analisis_id, estado_analisis: 'procesando', resultado_data: null, error_mensaje: null, fecha_completado: null });
      setStep('polling');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; errors?: Array<{ msg: string }> } } };
      const msg = e?.response?.data?.error
        ?? e?.response?.data?.errors?.[0]?.msg
        ?? 'Error al iniciar el análisis';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Save kit to /api/marca ─────────────────────────────────────────────────

  async function handleGuardar() {
    const r = analisisBrief?.resultado_data;
    if (!r || !productoSel) return;
    setLoadingSave(true);
    try {
      const paleta = r.identidad_visual.paleta;
      const { data } = await api.post('/marca', {
        nombre: productoSel.nombre,
        slogan: r.brief_identidad.slogan_principal,
        descripcion: r.brief_identidad.adn,
        paleta_colores: [paleta.primario, paleta.secundario, paleta.acento, paleta.neutro],
        tipografia: `${r.identidad_visual.tipografias.principal} / ${r.identidad_visual.tipografias.secundaria}`,
        producto_id: productoSel.id,
        brief_data: r,
      });
      setMarcaGuardada(data);
      setSavedBriefResultado(r);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Error al guardar el kit de marca.');
    } finally {
      setLoadingSave(false);
    }
  }

  // Palette helpers
  const estiloParaPaleta = form.estilo_visual === '__otro__' ? 'Minimalista' : form.estilo_visual;
  const paletas = estiloParaPaleta ? obtenerTodasLasPaletas(estiloParaPaleta) : null;
  const resultado = analisisBrief?.resultado_data;

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-white/30 mb-6">
        <Link href="/dashboard" className="hover:text-white/60 transition-colors">Dashboard</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-white/70 font-semibold">Kit de Marca</span>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs font-bold text-[#8B5CF6]">MARCA</span>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Kit de Identidad de Marca</h1>
        <p className="mt-1.5 text-sm text-white/40">La IA genera tu identidad visual, slogan, paleta y guía de diseñador.</p>
      </div>

      <div className="space-y-4">

        {/* ── Kit guardado ───────────────────────────────────────────────── */}
        {marcaGuardada && step !== 'result' && (
          <>
            <div className="rounded-2xl border border-[#8B5CF6]/20 p-5"
              style={{ background: 'radial-gradient(ellipse at 90% 0%, rgba(139,92,246,0.10) 0%, transparent 60%), #0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {marcaGuardada.logo_url && (
                    <img src={`${API_BASE}${marcaGuardada.logo_url}`} alt="Logo" className="w-10 h-10 object-contain rounded-lg bg-white/5 p-0.5" />
                  )}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B5CF6]/70">Kit guardado</span>
                    <h2 className="text-base font-bold text-white mt-1">{marcaGuardada.nombre}</h2>
                    {marcaGuardada.slogan && (
                      <p className="text-xs text-white/50 italic mt-0.5">&ldquo;{marcaGuardada.slogan}&rdquo;</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setStep('select'); setProductoSel(null); setForm(FORM_EMPTY); setAnalisisBrief(null); setShowFullBrief(false); }}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors ml-4 flex-shrink-0"
                >
                  Renovar
                </button>
              </div>

              {marcaGuardada.paleta_colores && (
                <div className="flex gap-2 flex-wrap mb-3">
                  {(Array.isArray(marcaGuardada.paleta_colores)
                    ? (marcaGuardada.paleta_colores as unknown as Array<Record<string, unknown> | string>).map((c, i) =>
                        typeof c === 'string'
                          ? { nombre: `Color ${i + 1}`, hex: c }
                          : { nombre: String(c?.nombre || `Color ${i + 1}`), hex: String(c?.hex || '#000000') }
                      )
                    : Object.entries(marcaGuardada.paleta_colores as Record<string, string>).map(([nombre, hex]) => ({
                        nombre,
                        hex: String(hex),
                      }))
                  ).map(c => (
                    <ColorSwatch key={c.nombre} hex={c.hex} nombre={c.nombre} />
                  ))}
                </div>
              )}

              {marcaGuardada.tipografia && (
                <p className="text-xs text-white/35 mb-4">Tipografía: <span className="text-white/55">{marcaGuardada.tipografia}</span></p>
              )}

              <button
                onClick={() => setShowFullBrief(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-[#8B5CF6] hover:text-[#7C3AED] transition-colors"
              >
                <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showFullBrief ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 14 14">
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {showFullBrief ? 'Ocultar brief completo' : 'Ver brief completo →'}
              </button>
            </div>

            {/* ── Full brief expanded view ── */}
            {showFullBrief && savedBriefResultado && (
              <div className="space-y-4">
                {/* Slogan hero */}
                <div className="rounded-2xl border border-[#8B5CF6]/20 p-5 relative overflow-hidden"
                  style={{ background: 'radial-gradient(ellipse at 80% 0%, rgba(139,92,246,0.12) 0%, transparent 60%), #0A1520' }}>
                  <div className="absolute top-4 right-5 text-right">
                    <span className="block font-mono text-2xl font-black text-[#8B5CF6]">{savedBriefResultado.score_marca.total}</span>
                    <span className="text-[10px] text-white/30">/10</span>
                  </div>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-[#8B5CF6]/60 mb-1.5">Slogan principal</span>
                  <p className="text-lg font-bold text-white leading-tight pr-14">{savedBriefResultado.brief_identidad.slogan_principal}</p>
                  {savedBriefResultado.brief_identidad.slogans_alternativos.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {savedBriefResultado.brief_identidad.slogans_alternativos.map((s,i) => (
                        <span key={i} className="rounded-full bg-white/[0.04] border border-white/[0.06] px-3 py-1 text-xs text-white/40 italic">&ldquo;{s}&rdquo;</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* ADN */}
                <div className={card} style={cardBg}>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">ADN de Marca</span>
                  <p className="text-sm text-white/70 leading-relaxed mb-2">{savedBriefResultado.brief_identidad.adn}</p>
                  <p className="text-xs text-white/45 leading-relaxed border-t border-white/[0.05] pt-3 mb-3">{savedBriefResultado.brief_identidad.diferenciador_clave}</p>
                  <div className="flex flex-wrap gap-2">
                    {savedBriefResultado.brief_identidad.personalidad.map(p => (
                      <span key={p} className="rounded-full bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-3 py-1 text-xs font-medium text-[#8B5CF6]">{p}</span>
                    ))}
                  </div>
                  <p className="text-xs text-white/40 leading-relaxed mt-3 pt-3 border-t border-white/[0.05]">{savedBriefResultado.brief_identidad.voz_marca}</p>
                </div>

                {/* Paleta with WCAG contrast */}
                <div className={card} style={cardBg}>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Paleta de Colores</span>
                  <div className="grid grid-cols-4 gap-3">
                    {(['primario','secundario','acento','neutro'] as const).map(k => {
                      const t = savedBriefResultado.identidad_visual.paleta[k];
                      return <ColorSwatch key={k} hex={t.hex} nombre={t.nombre} role={k} showContrast />;
                    })}
                  </div>
                </div>

                {/* Typography preview */}
                <TypographyPreview
                  principal={savedBriefResultado.identidad_visual.tipografias.principal}
                  secundaria={savedBriefResultado.identidad_visual.tipografias.secundaria}
                  brandName={marcaGuardada.nombre}
                />

                {/* Logo + visual identity */}
                <div className={card} style={cardBg}>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Identidad Visual</span>
                  <p className="text-xs text-white/55 leading-relaxed mb-2"><span className="text-white/30 font-semibold">Concepto logo: </span>{savedBriefResultado.identidad_visual.concepto_logo}</p>
                  <p className="text-xs text-white/55 leading-relaxed mb-2"><span className="text-white/30 font-semibold">Isotipo: </span>{savedBriefResultado.identidad_visual.descripcion_isotipo}</p>
                  <p className="text-xs text-white/45 leading-relaxed"><span className="text-white/30 font-semibold">Estilo gráfico: </span>{savedBriefResultado.identidad_visual.estilo_grafico}</p>
                </div>

                {/* Logo upload section for saved kit */}
                <div className={card} style={cardBg}>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Tu Logo</span>
                  <LogoUpload
                    productoId={marcaGuardada.producto_id ?? undefined}
                    logoUrl={marcaGuardada.logo_url}
                    logoAnalysis={marcaGuardada.logo_analysis as LogoAnalysisResult | null}
                    apiBase={API_BASE}
                    onAnalysisComplete={(url, analysis) => {
                      setMarcaGuardada(prev => prev ? { ...prev, logo_url: url, logo_analysis: analysis as unknown as LogoAnalysisResult } : prev);
                    }}
                  />
                </div>

                {/* Score */}
                <div className={card} style={cardBg}>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Score de Marca</span>
                  <div className="space-y-3">
                    <ScoreBar label="Coherencia"     value={savedBriefResultado.score_marca.coherencia} tip={SCORE_TIPS.coherencia} />
                    <ScoreBar label="Diferenciación" value={savedBriefResultado.score_marca.diferenciacion} tip={SCORE_TIPS.diferenciacion} />
                    <ScoreBar label="Claridad"       value={savedBriefResultado.score_marca.claridad} tip={SCORE_TIPS.claridad} />
                    <ScoreBar label="Impacto visual" value={savedBriefResultado.score_marca.impacto_visual} tip={SCORE_TIPS.impacto_visual} />
                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                      <span className="text-sm font-semibold text-white/50">Score total</span>
                      <span className="font-mono text-2xl font-black text-[#8B5CF6]">{savedBriefResultado.score_marca.total}<span className="text-sm font-normal text-white/30">/10</span></span>
                    </div>
                  </div>
                </div>

                {/* Diagnóstico */}
                <div className={card} style={cardBg}>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">Diagnóstico Estratégico</span>
                  <p className="text-sm text-white/65 leading-relaxed">{savedBriefResultado.diagnostico_estrategico}</p>
                </div>

                {/* Instrucciones */}
                <div className={card} style={cardBg}>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Instrucciones para el Diseñador</span>
                  <ol className="space-y-2.5">
                    {savedBriefResultado.instrucciones_disenador.map((inst,i) => (
                      <li key={i} className="flex gap-3">
                        <span className="font-mono text-xs font-bold text-[#8B5CF6]/50 flex-shrink-0 mt-0.5">{String(i+1).padStart(2,'0')}</span>
                        <span className="text-sm text-white/60 leading-relaxed">{inst}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Resumen tweet */}
                <div className={card} style={cardBg}>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">Resumen en una línea</span>
                  <p className="text-sm text-white/60 leading-relaxed italic">&ldquo;{savedBriefResultado.resumen_tweet}&rdquo;</p>
                </div>

                <button onClick={() => setShowFullBrief(false)}
                  className="w-full text-center text-xs text-white/25 hover:text-white/50 transition-colors py-2">
                  ↑ Ocultar
                </button>
              </div>
            )}

            {showFullBrief && !savedBriefResultado && (
              <div className={`${card} text-center py-8`} style={cardBg}>
                <p className="text-sm text-white/40">No hay datos de brief disponibles.</p>
                <p className="text-xs text-white/25 mt-1">Genera un nuevo brief para ver los detalles completos.</p>
              </div>
            )}
          </>
        )}

        {/* ── Step 1: Seleccionar producto ────────────────────────────────── */}
        {step === 'select' && (
          <div className={card} style={cardBg}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-[#8B5CF6] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span>
              <h2 className="text-sm font-bold text-white">Selecciona tu producto o negocio</h2>
            </div>
            <p className="text-xs text-white/35 mb-4 ml-7">La IA usará los datos de tu producto para generar la identidad.</p>

            {productos.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-white/[0.08] rounded-xl">
                <p className="text-white/35 text-sm mb-4">No tienes productos registrados aún.</p>
                <Link href="/dashboard/nuevo" className="text-xs font-semibold text-[#8B5CF6] hover:text-[#7C3AED] transition-colors">
                  + Crear primer producto
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {productos.map(p => {
                    const sel = productoSel?.id === p.id;
                    return (
                      <button key={p.id} type="button"
                        onClick={() => setProductoSel(sel ? null : p)}
                        className={['text-left p-3 rounded-xl border-2 transition-all',
                          sel ? 'border-[#8B5CF6]/60 bg-[#8B5CF6]/8' : 'border-white/[0.08] hover:border-white/20 bg-white/[0.02]',
                        ].join(' ')}>
                        <div className="flex items-center gap-3">
                          {p.imagen_url ? (
                            <img src={`${API_BASE}${p.imagen_url}`} alt={p.nombre}
                              className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white text-xs truncate">{p.nombre}</p>
                            <p className="text-[11px] text-white/35 truncate">{p.categoria}</p>
                          </div>
                          {sel && (
                            <div className="w-4 h-4 rounded-full bg-[#8B5CF6] flex items-center justify-center flex-shrink-0">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  disabled={!productoSel}
                  onClick={() => setStep('form')}
                  className={['w-full rounded-2xl py-3.5 text-sm font-semibold tracking-tight transition-all duration-200',
                    productoSel ? 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] active:scale-[0.98]'
                                : 'bg-white/[0.04] text-white/20 cursor-not-allowed',
                  ].join(' ')}>
                  Continuar con {productoSel?.nombre ?? 'producto'} →
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Step 2: Questionnaire ───────────────────────────────────────── */}
        {step === 'form' && productoSel && (
          <>
            {/* Progress bar */}
            <FormProgress steps={formSteps} current={currentFormStep === -1 ? formSteps.length : currentFormStep} />

            {/* Selected product pill */}
            <div className={card} style={cardBg}>
              <div className="flex items-center gap-3">
                {productoSel.imagen_url ? (
                  <img src={`${API_BASE}${productoSel.imagen_url}`} alt={productoSel.nombre}
                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-[10px] text-white/35">Generando kit para</p>
                  <p className="text-sm font-semibold text-white">{productoSel.nombre}</p>
                </div>
                <button onClick={() => { setStep('select'); setForm(FORM_EMPTY); }}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors">← Cambiar</button>
              </div>
            </div>

            {/* Block 02: Percepción */}
            <div className={card} style={cardBg}>
              <BlockHeader n="02" title="Percepción de Marca" sub="¿Cómo quieres que te perciban?" />
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Palabras clave <span className="text-white/20">(hasta 2)</span></label>
                  <ChipToggle options={PERCEPCIONES} selected={form.percepcion} max={2}
                    onChange={v=>setForm({...form,percepcion:v})}
                    customValue={form.percepcion_custom}
                    onCustomChange={v=>setForm({...form,percepcion_custom:v})} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Emoción principal <span className="text-white/20">(1)</span></label>
                  <ChipToggle options={EMOCIONES} selected={form.emocion?[form.emocion]:[]} max={1}
                    onChange={v=>setForm({...form,emocion:v[0]??''})}
                    customValue={form.emocion_custom}
                    onCustomChange={v=>setForm({...form,emocion_custom:v})} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Qué NO debe transmitir <span className="text-white/20">(hasta 2)</span></label>
                  <ChipToggle options={PERCEPCIONES} selected={form.anti_valores} max={2}
                    onChange={v=>setForm({...form,anti_valores:v})}
                    customValue={form.anti_valores_custom}
                    onCustomChange={v=>setForm({...form,anti_valores_custom:v})}
                    exclude={form.percepcion.filter(p => p !== '__otro__')} />
                </div>
              </div>
            </div>

            {/* Block 03: Dirección visual */}
            <div className={card} style={cardBg}>
              <BlockHeader n="03" title="Dirección Visual" sub="El estilo gráfico que mejor representa tu marca" />
              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Estilo visual</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ESTILOS.map(e => (
                      <button key={e} type="button"
                        onClick={() => setForm({...form,estilo_visual:e,paleta_elegida:''})}
                        className={['rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium transition-all duration-200',
                          form.estilo_visual===e ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/50 text-[#8B5CF6]'
                                                 : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:border-white/15 hover:text-white/60',
                        ].join(' ')}>
                        {e}
                      </button>
                    ))}
                    <button type="button"
                      onClick={() => setForm({...form,estilo_visual:'__otro__',paleta_elegida:''})}
                      className={['rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium transition-all duration-200',
                        form.estilo_visual==='__otro__' ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/50 text-[#8B5CF6]'
                                                        : 'bg-white/[0.02] border-dashed border-white/[0.10] text-white/30 hover:border-white/20 hover:text-white/50',
                      ].join(' ')}>
                      + Otro
                    </button>
                  </div>
                  {form.estilo_visual==='__otro__' && (
                    <OtroInput value={form.estilo_visual_custom}
                      onChange={v=>setForm({...form,estilo_visual_custom:v})}
                      placeholder="ej. Retro, Tropical, Industrial, Neón..." />
                  )}
                </div>

                {paletas && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-medium text-white/40 uppercase tracking-widest">Paleta de colores</label>
                      <button type="button" onClick={() => setPaletasExpanded(!paletasExpanded)}
                        className="text-[10px] text-[#8B5CF6]/60 hover:text-[#8B5CF6] transition-colors">
                        {paletasExpanded ? 'Compactar' : 'Ampliar'} ↕
                      </button>
                    </div>
                    <div className="flex gap-2">
                      {(['A','B','C'] as const).map((letra,i) => (
                        <PaletaCard key={letra} letra={letra} paleta={paletas[i]}
                          selected={form.paleta_elegida===letra}
                          onSelect={()=>setForm({...form,paleta_elegida:letra})}
                          expanded={paletasExpanded} />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Tipo de logo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TIPOS_LOGO.map(({value,label,desc}) => (
                      <RadioCard key={value} value={value} label={label} desc={desc}
                        selected={form.tipo_logo===value} onSelect={()=>setForm({...form,tipo_logo:value})} />
                    ))}
                    <RadioCard value="__otro__" label="Otro" desc="Describe tu idea"
                      selected={form.tipo_logo==='__otro__'} onSelect={()=>setForm({...form,tipo_logo:'__otro__'})} />
                  </div>
                  {form.tipo_logo==='__otro__' && (
                    <OtroInput value={form.tipo_logo_custom}
                      onChange={v=>setForm({...form,tipo_logo_custom:v})}
                      placeholder="ej. Monograma, Escudo, Mascota, Emblema..." />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Símbolo representativo</label>
                  <input type="text" value={form.simbolo_representativo}
                    onChange={e=>setForm({...form,simbolo_representativo:e.target.value})}
                    placeholder="ej. una montaña, una hoja, un rayo, un árbol..."
                    className={fieldCls} />
                  <p className="mt-1.5 text-[11px] text-white/25">¿Qué objeto, animal o elemento representa mejor a tu marca?</p>
                </div>
              </div>
            </div>

            {/* Block 04: Mensaje y tono */}
            <div className={card} style={cardBg}>
              <BlockHeader n="04" title="Mensaje y Tono" sub="Cómo habla tu marca y qué promete" />
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Resultado del cliente</label>
                  <textarea rows={3} value={form.resultado_cliente}
                    onChange={e=>setForm({...form,resultado_cliente:e.target.value})}
                    placeholder="¿Qué obtiene o siente el cliente después de comprar? ej. 'Se siente más seguro al presentar sus ideas...'"
                    className={`${fieldCls} resize-none`} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Tono de comunicación</label>
                  <div className="space-y-2">
                    {TONOS.map(t => (
                      <button key={t} type="button" onClick={()=>setForm({...form,tono_comunicacion:t})}
                        className={['w-full text-left rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-all duration-200',
                          form.tono_comunicacion===t ? 'bg-[#8B5CF6]/10 border-[#8B5CF6]/40 text-[#8B5CF6]'
                                                     : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:border-white/15 hover:text-white/60',
                        ].join(' ')}>
                        {t}
                      </button>
                    ))}
                    <button type="button" onClick={()=>setForm({...form,tono_comunicacion:'__otro__'})}
                      className={['w-full text-left rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-all duration-200',
                        form.tono_comunicacion==='__otro__' ? 'bg-[#8B5CF6]/10 border-[#8B5CF6]/40 text-[#8B5CF6]'
                                                            : 'bg-white/[0.02] border-dashed border-white/[0.10] text-white/30 hover:border-white/20 hover:text-white/50',
                      ].join(' ')}>
                      + Otro tono
                    </button>
                  </div>
                  {form.tono_comunicacion==='__otro__' && (
                    <OtroInput value={form.tono_comunicacion_custom}
                      onChange={v=>setForm({...form,tono_comunicacion_custom:v})}
                      placeholder="ej. Técnico y detallado, Poético, Minimalista en palabras..." />
                  )}
                </div>
              </div>
            </div>

            {/* Block 05: Posicionamiento */}
            <div className={card} style={cardBg}>
              <BlockHeader n="05" title="Posicionamiento Estratégico" sub="¿Cuál es tu lugar en el mercado?" />
              <div className="space-y-2">
                {POSICIONAMIENTOS.map(({value,label,desc}) => (
                  <RadioCard key={value} value={value} label={label} desc={desc}
                    selected={form.posicionamiento===value} onSelect={()=>setForm({...form,posicionamiento:value})} />
                ))}
              </div>
            </div>

            {/* Block 06: Diferenciación */}
            <div className={card} style={cardBg}>
              <BlockHeader n="06" title="Nivel de Diferenciación" sub="¿Qué tan distinto eres a tu competencia?" />
              <div className="grid grid-cols-2 gap-2">
                {DIFERENCIACIONES.map(({value,label,desc}) => (
                  <RadioCard key={value} value={value} label={label} desc={desc}
                    selected={form.nivel_diferenciacion===value} onSelect={()=>setForm({...form,nivel_diferenciacion:value})} />
                ))}
              </div>
            </div>

            {/* Block 07: Afina tu análisis (opcional) */}
            <div className={card} style={cardBg}>
              <BlockHeader n="07" title="Afina tu análisis" sub="Opcional: lo que más cambia el brief y casi nadie dice." />
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Marcas que te gustan</label>
                  <input type="text" maxLength={200} value={form.marcas_admiradas}
                    onChange={e=>setForm({...form,marcas_admiradas:e.target.value})}
                    placeholder="ej. la panadería de la esquina con letrero pintado a mano"
                    className={fieldCls} />
                  <p className="mt-1.5 text-[11px] text-white/25">Son referencia de estilo: el brief nunca propone copiarlas.</p>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Marcas a las que no te quieres parecer</label>
                  <input type="text" maxLength={200} value={form.marcas_evitar}
                    onChange={e=>setForm({...form,marcas_evitar:e.target.value})}
                    placeholder="ej. las cadenas grandes"
                    className={fieldCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">Lo que ya tienes y quieres conservar</label>
                  <input type="text" maxLength={300} value={form.elementos_conservar}
                    onChange={e=>setForm({...form,elementos_conservar:e.target.value})}
                    placeholder="ej. el nombre, el color rojo del letrero, la frase que ya usas"
                    className={fieldCls} />
                  <p className="mt-1.5 text-[11px] text-white/25">Si tus clientes ya te reconocen por algo, el brief lo respeta.</p>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/40 uppercase tracking-widest mb-2">¿Dónde vas a usar la marca?</label>
                  <div className="flex flex-wrap gap-2">
                    {USOS_MARCA.map(({ value, label }) => {
                      const activo = form.usos_marca.includes(value);
                      return (
                        <button key={value} type="button" aria-pressed={activo}
                          onClick={() => setForm({ ...form, usos_marca: activo ? form.usos_marca.filter((u) => u !== value) : [...form.usos_marca, value] })}
                          className={['rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                            activo ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/40 text-white' : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/80',
                          ].join(' ')}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-white/25">Cada uso le pide algo distinto al logo y a los colores.</p>
                </div>
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-[#E74C3C]/20 bg-[#E74C3C]/5 px-4 py-3 text-sm text-[#E74C3C]">{error}</p>
            )}

            <button type="button" onClick={handleSubmit} disabled={!isValid||submitting}
              className={['w-full rounded-2xl py-4 text-sm font-semibold tracking-tight transition-all duration-200',
                isValid&&!submitting ? 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] active:scale-[0.98]'
                                    : 'bg-white/[0.04] text-white/20 cursor-not-allowed',
              ].join(' ')}>
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  Iniciando análisis...
                </span>
              ) : 'Generar Identidad de Marca →'}
            </button>
          </>
        )}

        {/* ── Polling ─────────────────────────────────────────────────────── */}
        {step === 'polling' && (
          <div className={card} style={cardBg}>
            <div className="flex flex-col items-center py-10 gap-5">
              <div className="relative h-14 w-14">
                <div className="absolute inset-0 rounded-full border-2 border-[#8B5CF6]/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#8B5CF6] animate-spin" />
                <div className="absolute inset-[6px] rounded-full bg-[#8B5CF6]/10 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-[#8B5CF6] animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white/70">Generando tu identidad de marca</p>
                <p className="text-xs text-white/30 mt-1">La IA está analizando tu brief completo...</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {['Percepción','Paleta','ADN de marca','Estrategia','Score'].map((s,i) => (
                  <span key={s} className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/25"
                    style={{animationDelay:`${i*0.3}s`}}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {step === 'result' && resultado && (
          <>
            {/* Product pill */}
            {productoSel && (
              <div className={card} style={cardBg}>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[10px] text-white/35">Kit generado para</p>
                    <p className="text-sm font-semibold text-white">{productoSel.nombre}</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400">Completado</span>
                  {resultado.es_mock && (
                    <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-medium text-amber-400">Plantilla (sin IA)</span>
                  )}
                </div>
              </div>
            )}

            {/* Hero slogan + score */}
            <div className="rounded-2xl border border-[#8B5CF6]/20 p-6 relative overflow-hidden"
              style={{ background: 'radial-gradient(ellipse at 80% 0%, rgba(139,92,246,0.15) 0%, transparent 60%), #0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
              <div className="absolute top-4 right-5 text-right">
                <span className="block font-mono text-3xl font-black text-[#8B5CF6]">{resultado.score_marca.total}</span>
                <span className="text-[10px] text-white/30">/10 score</span>
              </div>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-[#8B5CF6]/60 mb-2">Slogan principal</span>
              <p className="text-xl font-bold text-white leading-tight pr-16">{resultado.brief_identidad.slogan_principal}</p>
              {resultado.brief_identidad.slogans_alternativos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {resultado.brief_identidad.slogans_alternativos.map((s,i) => (
                    <span key={i} className="rounded-full bg-white/[0.04] border border-white/[0.06] px-3 py-1 text-xs text-white/40 italic">&ldquo;{s}&rdquo;</span>
                  ))}
                </div>
              )}
            </div>

            {/* ADN */}
            <div className={card} style={cardBg}>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">ADN de Marca</span>
              <div className="space-y-3">
                <p className="text-sm text-white/70 leading-relaxed">{resultado.brief_identidad.adn}</p>
                <p className="text-xs text-white/45 leading-relaxed border-t border-white/[0.05] pt-3">{resultado.brief_identidad.diferenciador_clave}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {resultado.brief_identidad.personalidad.map(p => (
                    <span key={p} className="rounded-full bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-3 py-1 text-xs font-medium text-[#8B5CF6]">{p}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Paleta with WCAG */}
            <div className={card} style={cardBg}>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Paleta de Colores</span>
              <div className="grid grid-cols-4 gap-3">
                {(['primario','secundario','acento','neutro'] as const).map(k => {
                  const t = resultado.identidad_visual.paleta[k];
                  return <ColorSwatch key={k} hex={t.hex} nombre={t.nombre} role={k} showContrast />;
                })}
              </div>
            </div>

            {/* Typography preview */}
            <TypographyPreview
              principal={resultado.identidad_visual.tipografias.principal}
              secundaria={resultado.identidad_visual.tipografias.secundaria}
              brandName={productoSel?.nombre ?? 'Tu Marca'}
            />

            {/* Logo upload */}
            <div className={card} style={cardBg}>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Sube tu Logo</span>
              <p className="text-xs text-white/35 mb-4">La IA analizará tu logo, extraerá colores y te dará una calificación profesional.</p>
              <LogoUpload
                productoId={productoSel?.id}
                apiBase={API_BASE}
                onAnalysisComplete={() => {}}
              />
            </div>

            {/* Score with tips */}
            <div className={card} style={cardBg}>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Score de Marca</span>
              <div className="space-y-3">
                <ScoreBar label="Coherencia"     value={resultado.score_marca.coherencia} tip={SCORE_TIPS.coherencia} />
                <ScoreBar label="Diferenciación" value={resultado.score_marca.diferenciacion} tip={SCORE_TIPS.diferenciacion} />
                <ScoreBar label="Claridad"       value={resultado.score_marca.claridad} tip={SCORE_TIPS.claridad} />
                <ScoreBar label="Impacto visual" value={resultado.score_marca.impacto_visual} tip={SCORE_TIPS.impacto_visual} />
              </div>
              {/* De dónde sale el puntaje: mide la coherencia del brief, no el éxito de la marca. */}
              {resultado.score_marca.razon && (
                <p className="mt-4 border-t border-white/[0.05] pt-3 text-[11px] leading-relaxed text-white/40">
                  {resultado.score_marca.origen === 'reglas' ? 'Calculado por reglas con lo que declaraste. ' : ''}
                  {resultado.score_marca.razon}
                </p>
              )}
            </div>

            {/* Diagnóstico (el admin lo puede ocultar: llega vacío) */}
            {resultado.diagnostico_estrategico && (
              <div className={card} style={cardBg}>
                <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">Diagnóstico Estratégico</span>
                <p className="text-sm text-white/65 leading-relaxed">{resultado.diagnostico_estrategico}</p>
              </div>
            )}

            {/* Instrucciones diseñador (también ocultable) */}
            {resultado.instrucciones_disenador.length > 0 && (
              <div className={card} style={cardBg}>
                <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Instrucciones para el Diseñador</span>
                <ol className="space-y-2.5">
                  {resultado.instrucciones_disenador.map((inst,i) => (
                    <li key={i} className="flex gap-3">
                      <span className="font-mono text-xs font-bold text-[#8B5CF6]/50 flex-shrink-0 mt-0.5">{String(i+1).padStart(2,'0')}</span>
                      <span className="text-sm text-white/60 leading-relaxed">{inst}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Qué tan confiable es y qué dato lo mejoraría (brief@2). */}
            {analisisBrief?.meta_ia?.transparencia && (
              <TransparenciaIA transparencia={analisisBrief.meta_ia.transparencia} />
            )}
            {(analisisBrief?.meta_ia?.secciones_extra?.length ?? 0) > 0 && (
              <SeccionesExtra secciones={analisisBrief?.meta_ia?.secciones_extra} />
            )}

            {/* Resumen tweet */}
            <div className="rounded-2xl border border-white/[0.06] px-5 py-4" style={cardBg}>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">Resumen en una línea</span>
              <p className="text-sm text-white/60 leading-relaxed italic">&ldquo;{resultado.resumen_tweet}&rdquo;</p>
            </div>

            {/* Actions */}
            {error && (
              <p className="rounded-xl border border-[#E74C3C]/20 bg-[#E74C3C]/5 px-4 py-3 text-sm text-[#E74C3C]">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setStep('select'); setProductoSel(null); setForm(FORM_EMPTY); setAnalisisBrief(null); setError(''); }}
                className="flex-1 rounded-2xl border border-white/[0.08] py-3.5 text-sm font-semibold text-white/50 hover:border-white/20 hover:text-white/70 transition-all duration-200"
              >
                ← Nuevo brief
              </button>
              <button
                onClick={handleGuardar}
                disabled={loadingSave}
                className="flex-1 rounded-2xl bg-[#8B5CF6] py-3.5 text-sm font-semibold text-white hover:bg-[#7C3AED] active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
              >
                {loadingSave ? 'Guardando...' : saved ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Kit guardado</span>
                  </span>
                ) : 'Guardar kit de marca'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
