'use client';

import { useState, useRef, useCallback } from 'react';
import { contrastRatio, wcagLevel } from './types';
import type { ColorExtraido, LogoAnalysisResult } from './types';

// ─── OtroInput ────────────────────────────────────────────────────────────────

export function OtroInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]/60 flex-shrink-0" />
      <input
        type="text" autoFocus value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Escribe aquí...'}
        className="flex-1 rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/5 px-3.5 py-2 text-xs text-white placeholder-white/25 outline-none focus:border-[#8B5CF6]/60 transition-all duration-200"
      />
    </div>
  );
}

// ─── ChipToggle ───────────────────────────────────────────────────────────────

export function ChipToggle({ options, selected, max = 1, onChange, customValue, onCustomChange, exclude }:
  { options: string[]; selected: string[]; max?: number; onChange: (v: string[]) => void;
    customValue?: string; onCustomChange?: (v: string) => void; exclude?: string[] }) {
  const OTRO = '__otro__';
  const otroActive = selected.includes(OTRO);
  const filtered = exclude ? options.filter(o => !exclude.includes(o)) : options;

  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
    else if (selected.length < max) onChange([...selected, opt]);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {filtered.map(opt => {
          const active = selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              className={['rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200',
                active ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/50 text-[#8B5CF6]'
                       : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:border-white/20 hover:text-white/60',
              ].join(' ')}>
              {opt}
            </button>
          );
        })}
        {onCustomChange && (
          <button type="button" onClick={() => toggle(OTRO)}
            className={['rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200',
              otroActive ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/50 text-[#8B5CF6]'
                         : 'bg-white/[0.02] border-dashed border-white/[0.12] text-white/30 hover:border-white/25 hover:text-white/50',
            ].join(' ')}>
            + Otro
          </button>
        )}
      </div>
      {otroActive && onCustomChange && (
        <OtroInput value={customValue ?? ''} onChange={onCustomChange}
          placeholder="Describe con tus propias palabras..." />
      )}
    </div>
  );
}

// ─── RadioCard ────────────────────────────────────────────────────────────────

export function RadioCard({ label, desc, selected, onSelect }:
  { value: string; label: string; desc: string; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect}
      className={['w-full text-left rounded-xl border px-4 py-3 transition-all duration-200',
        selected ? 'bg-[#8B5CF6]/10 border-[#8B5CF6]/40 text-white'
                 : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:border-white/15 hover:text-white/60',
      ].join(' ')}>
      <div className="flex items-center gap-3">
        <div className={['h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
          selected ? 'border-[#8B5CF6]' : 'border-white/20'].join(' ')}>
          {selected && <div className="h-2 w-2 rounded-full bg-[#8B5CF6]" />}
        </div>
        <div>
          <span className="block text-xs font-semibold tracking-tight">{label}</span>
          <span className="block text-[11px] text-white/35 mt-0.5">{desc}</span>
        </div>
      </div>
    </button>
  );
}

// ─── PaletaCard (with preview mockup) ─────────────────────────────────────────

export function PaletaCard({ letra, paleta, selected, onSelect, expanded }:
  { letra: 'A' | 'B' | 'C'; paleta: { primario: { hex: string; nombre: string }; secundario: { hex: string }; acento: { hex: string; nombre: string }; neutro: { hex: string } }; selected: boolean; onSelect: () => void; expanded?: boolean }) {
  return (
    <button type="button" onClick={onSelect}
      className={['flex-1 rounded-xl border p-3 transition-all duration-200 text-left',
        selected ? 'border-[#8B5CF6]/50 bg-[#8B5CF6]/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15',
      ].join(' ')}>
      <div className={`flex gap-1.5 ${expanded ? 'mb-3' : 'mb-2'}`}>
        {[paleta.primario.hex, paleta.secundario.hex, paleta.acento.hex, paleta.neutro.hex].map((hex, i) => (
          <div key={i} className={`${expanded ? 'h-10' : 'h-6'} flex-1 rounded-md transition-all duration-200`} style={{ background: hex }} />
        ))}
      </div>
      {expanded && (
        <div className="grid grid-cols-4 gap-1 mb-2">
          {[paleta.primario.hex, paleta.secundario.hex, paleta.acento.hex, paleta.neutro.hex].map((hex, i) => (
            <span key={i} className="font-mono text-[9px] text-white/30 text-center">{hex}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-white/50">Opción {letra}</span>
        <span className="text-[10px] text-white/30">{paleta.primario.nombre}</span>
      </div>
    </button>
  );
}

// ─── BlockHeader ──────────────────────────────────────────────────────────────

export function BlockHeader({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="font-mono text-xs font-bold text-white/20 mt-0.5 w-5 flex-shrink-0">{n}</span>
      <div>
        <h3 className="text-sm font-semibold text-white/90 tracking-tight">{title}</h3>
        <p className="text-xs text-white/35 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

// ─── ScoreBar with actionable tip ─────────────────────────────────────────────

export function ScoreBar({ label, value, tip }: { label: string; value: number; tip?: string }) {
  const pct = (value / 10) * 100;
  const color = value >= 8 ? '#10B981' : value >= 6 ? '#8B5CF6' : value >= 4 ? '#F59E0B' : '#E74C3C';
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-28 flex-shrink-0 text-xs text-white/50">{label}</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="font-mono text-xs font-bold w-6 text-right" style={{ color }}>{value}</span>
      </div>
      {tip && value < 7 && (
        <p className="flex items-center gap-1 text-[10px] text-white/35 mt-1 ml-[7.5rem]">
          <svg className="w-3 h-3 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{tip}</span>
        </p>
      )}
    </div>
  );
}

// ─── ColorSwatch with click-to-copy + WCAG contrast ──────────────────────────

export function ColorSwatch({ hex, nombre, role, showContrast }: { hex: string; nombre: string; role?: string; showContrast?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* fallback: do nothing */ }
  };

  const ratioWhite = contrastRatio(hex, '#FFFFFF');
  const ratioBlack = contrastRatio(hex, '#000000');

  return (
    <div className="group cursor-pointer" onClick={handleCopy}>
      <div className="relative h-11 w-full rounded-xl border border-white/10 mb-2 overflow-hidden transition-transform duration-200 group-hover:scale-105" style={{ background: hex }}>
        {copied && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white">
              <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Copiado</span>
            </span>
          </div>
        )}
      </div>
      {role && <span className="block text-[9px] font-bold uppercase tracking-wider text-white/25">{role}</span>}
      <span className="block text-xs font-medium text-white/70">{nombre}</span>
      <span className="block font-mono text-[10px] text-white/30">{hex}</span>
      {showContrast && (
        <div className="flex gap-1.5 mt-1">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
            wcagLevel(ratioWhite) !== 'Fail' ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'
          }`}>
            ◻ {ratioWhite.toFixed(1)} {wcagLevel(ratioWhite)}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
            wcagLevel(ratioBlack) !== 'Fail' ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'
          }`}>
            ◼ {ratioBlack.toFixed(1)} {wcagLevel(ratioBlack)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── LogoUpload (drag & drop + analysis) ──────────────────────────────────────

export function LogoUpload({ onAnalysisComplete, productoId, logoUrl: existingLogoUrl, logoAnalysis: existingAnalysis, apiBase }:
  { onAnalysisComplete: (url: string, analysis: LogoAnalysisResult) => void; productoId?: string; logoUrl?: string | null; logoAnalysis?: LogoAnalysisResult | null; apiBase: string }) {

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(existingLogoUrl ? `${apiBase}${existingLogoUrl}` : null);
  const [analysis, setAnalysis] = useState<LogoAnalysisResult | null>(existingAnalysis ?? null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes (jpg, png, webp)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no puede pesar más de 5 MB');
      return;
    }

    setError('');
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    setAnalysis(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);
      if (productoId) formData.append('producto_id', productoId);

      const { default: api } = await import('@/lib/api');
      const { data } = await api.post('/marca/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setAnalysis(data.analysis);
      if (data.logo_url) {
        setPreview(`${apiBase}${data.logo_url}`);
      }
      onAnalysisComplete(data.logo_url, data.analysis);
    } catch {
      setError('Error al analizar el logo. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }, [productoId, apiBase, onAnalysisComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={[
          'relative rounded-2xl border-2 border-dashed p-6 transition-all duration-200 cursor-pointer',
          dragging ? 'border-[#8B5CF6] bg-[#8B5CF6]/10' :
          preview ? 'border-white/[0.08] bg-white/[0.02]' :
          'border-white/[0.12] bg-white/[0.02] hover:border-white/20',
        ].join(' ')}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        {uploading ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 rounded-full border-2 border-[#8B5CF6]/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#8B5CF6] animate-spin" />
            </div>
            <p className="text-sm text-white/60">Analizando tu logo con IA...</p>
            <p className="text-xs text-white/25">Esto toma ~5 segundos</p>
          </div>
        ) : preview ? (
          <div className="flex items-center gap-4">
            <img src={preview} alt="Logo" className="w-16 h-16 object-contain rounded-lg bg-white/5 p-1" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/50 mb-1">{analysis ? 'Logo analizado' : 'Logo subido'}</p>
              <p className="text-[11px] text-white/25">Click o arrastra para reemplazar</p>
            </div>
            {analysis && (
              <div className="text-right">
                <span className="font-mono text-2xl font-black text-[#8B5CF6]">{analysis.score_logo.total}</span>
                <span className="text-[10px] text-white/30 block">/10</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4">
            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-white/50">Arrastra tu logo aquí o haz click</p>
            <p className="text-[11px] text-white/25">PNG, JPG o WEBP • Máx 5 MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-[#E74C3C]/20 bg-[#E74C3C]/5 px-4 py-2 text-xs text-[#E74C3C]">{error}</p>
      )}

      {/* Analysis results */}
      {analysis && (
        <div className="space-y-4">
          {/* Score */}
          <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Score del Logo</span>
            <div className="space-y-2.5">
              <ScoreBar label="Legibilidad" value={analysis.score_logo.legibilidad} tip="Simplifica las formas para que funcione a tamaños pequeños (favicon, avatar)." />
              <ScoreBar label="Versatilidad" value={analysis.score_logo.versatilidad} tip="Crea variantes para fondo claro, oscuro y monocromático." />
              <ScoreBar label="Originalidad" value={analysis.score_logo.originalidad} tip="Evita formas genéricas de tu sector; busca un símbolo propio." />
              <ScoreBar label="Coherencia" value={analysis.score_logo.coherencia_marca} tip="Asegura que el logo refleje los valores y personalidad de la marca." />
              <ScoreBar label="Impacto" value={analysis.score_logo.impacto_visual} tip="Aumenta el contraste y el peso visual del elemento principal." />
              <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                <span className="text-sm font-semibold text-white/50">Score total</span>
                <span className="font-mono text-2xl font-black text-[#8B5CF6]">{analysis.score_logo.total}<span className="text-sm font-normal text-white/30">/10</span></span>
              </div>
            </div>
          </div>

          {/* Tipo detectado */}
          <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">Tipo de Logo Detectado</span>
            <p className="text-sm font-semibold text-white">{analysis.tipo_logo_detectado}</p>
          </div>

          {/* Colores extraídos */}
          <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Colores Extraídos del Logo</span>
            <div className="grid grid-cols-4 gap-3">
              {analysis.colores_extraidos.map((c: ColorExtraido, i: number) => (
                <ColorSwatch key={i} hex={c.hex} nombre={`${c.nombre} (${c.porcentaje}%)`} showContrast />
              ))}
            </div>
          </div>

          {/* Análisis técnico */}
          <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">Análisis Técnico</span>
            <p className="text-sm text-white/65 leading-relaxed">{analysis.analisis_tecnico}</p>
          </div>

          {/* Coherencia con brief */}
          {analysis.coherencia_con_brief && (
            <div className="rounded-2xl border border-[#8B5CF6]/20 p-5" style={{ background: 'radial-gradient(ellipse at 80% 0%, rgba(139,92,246,0.08) 0%, transparent 60%), #0A1520' }}>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-[#8B5CF6]/60 mb-2">Coherencia con tu Brief</span>
              <p className="text-sm text-white/65 leading-relaxed">{analysis.coherencia_con_brief}</p>
            </div>
          )}

          {/* Recomendaciones */}
          <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Recomendaciones</span>
            <ol className="space-y-2.5">
              {analysis.recomendaciones.map((rec: string, i: number) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-xs font-bold text-[#8B5CF6]/50 flex-shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-sm text-white/60 leading-relaxed">{rec}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FormProgress (stepper) ───────────────────────────────────────────────────

export function FormProgress({ steps, current }: { steps: { label: string; complete: boolean }[]; current: number }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
          <div className={[
            'w-full h-1 rounded-full transition-all duration-300',
            i < current ? 'bg-[#8B5CF6]' :
            i === current ? 'bg-[#8B5CF6]/50' :
            s.complete ? 'bg-[#10B981]' :
            'bg-white/[0.06]',
          ].join(' ')} />
          <span className={[
            'inline-flex items-center gap-1 text-[9px] font-medium tracking-wide transition-colors duration-200',
            i === current ? 'text-[#8B5CF6]' :
            s.complete ? 'text-white/40' :
            'text-white/20',
          ].join(' ')}>
            {s.complete && i < current && (
              <svg className="w-2.5 h-2.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span>{s.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── TypographyPreview ────────────────────────────────────────────────────────

export function TypographyPreview({ principal, secundaria, brandName }: { principal: string; secundaria: string; brandName: string }) {
  // Load Google Fonts dynamically
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(principal)}:wght@400;700&family=${encodeURIComponent(secundaria)}:wght@400;700&display=swap`;

  return (
    <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      { }
      <link href={fontUrl} rel="stylesheet" />
      <span className="block text-[10px] font-bold uppercase tracking-widest text-white/25 mb-4">Preview Tipográfico</span>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <span className="block text-[10px] text-white/25 mb-2">Tipografía principal — {principal}</span>
          <p className="text-2xl font-bold text-white leading-tight" style={{ fontFamily: `'${principal}', sans-serif` }}>
            {brandName}
          </p>
          <p className="text-sm text-white/50 mt-1" style={{ fontFamily: `'${principal}', sans-serif` }}>
            Aa Bb Cc Dd Ee Ff Gg 0123456789
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <span className="block text-[10px] text-white/25 mb-2">Tipografía secundaria — {secundaria}</span>
          <p className="text-lg text-white/80" style={{ fontFamily: `'${secundaria}', sans-serif` }}>
            {brandName}
          </p>
          <p className="text-sm text-white/50 mt-1" style={{ fontFamily: `'${secundaria}', sans-serif` }}>
            Aa Bb Cc Dd Ee Ff Gg 0123456789
          </p>
        </div>
      </div>
    </div>
  );
}
