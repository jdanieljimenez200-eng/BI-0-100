'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';

export interface PerfilCliente {
  demograficos: {
    edad_rango: string;
    genero_predominante: string;
    nivel_socioeconomico: string;
    ubicacion_tipica: string;
  };
  psicografia: {
    miedos_principales: string[];
    deseos_clave: string[];
    objeciones_tipicas: string[];
    valores_compra: string[];
  };
  canales_preferidos: string[];
  disparadores_compra: string[];
  frenos_compra: string[];
  lenguaje_tipico: string;
  queries_tipicas: string[];
  score_afinidad: number;
  score_razon: string;
}

interface Props {
  analisisId: string;
  perfil: PerfilCliente | null;
  bloqueado: boolean;
  onUpdate?: (p: PerfilCliente) => void;
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
  const dash = Math.round((score / 100) * 251);
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r="40" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <circle
          cx="44" cy="44" r="40" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} 251`}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <span className="text-2xl font-black" style={{ color }}>{score}</span>
    </div>
  );
}

// ─── Vector Icons (0 Emojis) ──────────────────────────────────────────────────

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

function IconX(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconUser(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IconDevice(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>
    </svg>
  );
}

function IconSearch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  );
}

function IconBrain(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-5.04Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-5.04Z"/>
    </svg>
  );
}

function IconZap(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function IconMessage(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconHelpCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
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

function IconTarget(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function TagList({ items, color }: { items: string[]; color: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {items.map((item, i) => (
        <span key={i} className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

/** Valor actual en `perfil` para un campo simple (`lenguaje_tipico`) o anidado (`psicografia.miedos_principales`). */
function valorEnCampo(perfil: PerfilCliente | null, campo: string): unknown {
  const partes = campo.replace(/\[\]$/, '').split('.');
  if (partes.length === 2) {
    return (perfil?.[partes[0] as keyof PerfilCliente] as Record<string, unknown> | undefined)?.[partes[1]];
  }
  return perfil?.[partes[0] as keyof PerfilCliente];
}

export default function PerfilClientePanel({ analisisId, perfil: perfilInicial, bloqueado, onUpdate }: Props) {
  const [perfil, setPerfil] = useState<PerfilCliente | null>(perfilInicial);
  const [editando, setEditando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editField, setEditField] = useState<string>('');
  const [editValue, setEditValue] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [rebatidas, setRebatidas] = useState<Record<string, string> | null>(null);
  const [cargandoRebatidas, setCargandoRebatidas] = useState(false);
  const [objecionExpandida, setObjecionExpandida] = useState<string | null>(null);
  const [palabrasAds, setPalabrasAds] = useState<{ keywords_busqueda: string[]; intereses_meta: string[] } | null>(null);
  const [cargandoAds, setCargandoAds] = useState(false);
  const [copiado, setCopiado] = useState<'google' | 'meta' | null>(null);

  async function generarPalabrasAds() {
    if (palabrasAds) return;
    setCargandoAds(true);
    try {
      const res = await api.get<{ keywords_busqueda: string[]; intereses_meta: string[] }>(
        `/ventas/${analisisId}/palabras-clave-ads`
      );
      setPalabrasAds(res.data);
    } catch {
      /* el usuario puede reintentar con el mismo botón */
    } finally {
      setCargandoAds(false);
    }
  }

  function copiarLista(grupo: 'google' | 'meta', items: string[]) {
    navigator.clipboard.writeText(items.join(', '));
    setCopiado(grupo);
    setTimeout(() => setCopiado((c) => (c === grupo ? null : c)), 1500);
  }

  async function verRebatida(objecion: string) {
    if (objecionExpandida === objecion) {
      setObjecionExpandida(null);
      return;
    }
    setObjecionExpandida(objecion);
    if (rebatidas) return;
    setCargandoRebatidas(true);
    try {
      const res = await api.get<{ rebatidas: { objecion: string; rebatida: string }[] }>(`/ventas/${analisisId}/objeciones`);
      const mapa: Record<string, string> = {};
      for (const r of res.data.rebatidas) mapa[r.objecion] = r.rebatida;
      setRebatidas(mapa);
    } catch {
      /* si falla, el toggle se queda expandido sin rebatida; el usuario puede reintentar */
    } finally {
      setCargandoRebatidas(false);
    }
  }

  if (bloqueado) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20">
        <div aria-hidden="true" className="pointer-events-none select-none p-6 blur-[5px] opacity-30 space-y-4">
          <div className="h-4 w-1/3 rounded-full bg-white/10" />
          <div className="grid grid-cols-2 gap-3">
            {[0,1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.05]" />)}
          </div>
        </div>
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0A0F17]/60 via-[#0A0F17]/85 to-[#0A0F17]/95 px-6 text-center">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-400">
            <IconLock className="w-5 h-5" />
          </div>
          <h3 className="max-w-md text-lg font-bold text-white">Perfil del Cliente Ideal (ICP)</h3>
          <p className="max-w-md text-sm text-white/45">Modelado analítico de variables demográficas, psicográficas y barreras de conversión de tu comprador.</p>
        </div>
      </div>
    );
  }

  if (!perfil) {
    return (
      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/[0.05] p-5 text-sm text-yellow-200/80">
        El perfil del cliente no fue generado en este análisis. Ejecuta un nuevo análisis para obtenerlo.
      </div>
    );
  }

  async function guardarEdicion(campo: string, valor: string) {
    setSaving(true);
    setError(null);
    try {
      // Soporte para campos anidados (demograficos.edad_rango) y de array,
      // top-level o anidados (psicografia.miedos_principales). Se decide por
      // el TIPO real del valor vigente, no por el sufijo del nombre del
      // campo — un `campo.split('.')` nunca termina en '[]', así que ese
      // check por sufijo se saltaba los arrays anidados y los guardaba como
      // string plano, corrompiendo el ICP.
      const esArray = Array.isArray(valorEnCampo(perfil, campo));
      const valorFinal: unknown = esArray
        ? valor.split('\n').map((s) => s.trim()).filter(Boolean)
        : valor;

      const partes = campo.replace(/\[\]$/, '').split('.');
      const update: Record<string, unknown> = {};
      if (partes.length === 2) {
        update[partes[0]] = {
          ...(perfil?.[partes[0] as keyof PerfilCliente] as object),
          [partes[1]]: valorFinal,
        };
      } else {
        update[partes[0]] = valorFinal;
      }
      const res = await api.patch(`/ventas/${analisisId}/perfil`, update);
      const nuevo = res.data.perfil_cliente_data as PerfilCliente;
      setPerfil(nuevo);
      onUpdate?.(nuevo);
      setEditando(false);
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo guardar el cambio. Intenta de nuevo.');
      setError(info.mensaje);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(campo: string, valorActual: string | string[]) {
    setEditField(campo);
    setEditValue(Array.isArray(valorActual) ? valorActual.join('\n') : valorActual);
    setEditando(true);
    setError(null);
  }

  const p: PerfilCliente = {
    score_afinidad: perfil?.score_afinidad ?? 85,
    score_razon: perfil?.score_razon ?? 'Perfil y comportamiento calibrado con el segmento objetivo.',
    demograficos: {
      edad_rango: perfil?.demograficos?.edad_rango ?? (perfil as any)?.edad ?? '25-45 años',
      genero_predominante: perfil?.demograficos?.genero_predominante ?? (perfil as any)?.genero ?? 'Mixto',
      nivel_socioeconomico: perfil?.demograficos?.nivel_socioeconomico ?? (perfil as any)?.ingresos ?? 'Medio-Alto (C+/B)',
      ubicacion_tipica: perfil?.demograficos?.ubicacion_tipica ?? (perfil as any)?.ubicacion ?? 'Zonas urbanas',
    },
    canales_preferidos: Array.isArray(perfil?.canales_preferidos) && perfil.canales_preferidos.length > 0
      ? perfil.canales_preferidos
      : (Array.isArray((perfil as any)?.canales_contacto) ? (perfil as any).canales_contacto : ['WhatsApp', 'Instagram', 'Referidos']),
    queries_tipicas: Array.isArray(perfil?.queries_tipicas) && perfil.queries_tipicas.length > 0
      ? perfil.queries_tipicas
      : ['servicios profesionales de calidad', 'cómo contratar soluciones a medida', 'mejores alternativas en México'],
    psicografia: {
      miedos_principales: Array.isArray(perfil?.psicografia?.miedos_principales) && perfil.psicografia.miedos_principales.length > 0
        ? perfil.psicografia.miedos_principales
        : ((perfil as any)?.dolor_principal ? [(perfil as any).dolor_principal, 'Pagar sin garantías de calidad'] : ['Pagar y no ver resultados', 'Proceso lento']),
      deseos_clave: Array.isArray(perfil?.psicografia?.deseos_clave) && perfil.psicografia.deseos_clave.length > 0
        ? perfil.psicografia.deseos_clave
        : ((perfil as any)?.motivacion_compra ? [(perfil as any).motivacion_compra] : ['Aumentar ventas', 'Profesionalizar imagen']),
      objeciones_tipicas: Array.isArray(perfil?.psicografia?.objeciones_tipicas) && perfil.psicografia.objeciones_tipicas.length > 0
        ? perfil.psicografia.objeciones_tipicas
        : (Array.isArray((perfil as any)?.objeciones_comunes) ? (perfil as any).objeciones_comunes : (Array.isArray((perfil as any)?.objeciones_frecuentes) ? (perfil as any).objeciones_frecuentes : ['¿Por qué contratar tu servicio en vez de una opción más económica?'])),
      valores_compra: Array.isArray(perfil?.psicografia?.valores_compra) && perfil.psicografia.valores_compra.length > 0
        ? perfil.psicografia.valores_compra
        : ['Atención directa', 'Transparencia', 'Calidad técnica'],
    },
    disparadores_compra: Array.isArray(perfil?.disparadores_compra) && perfil.disparadores_compra.length > 0
      ? perfil.disparadores_compra
      : ((perfil as any)?.motivacion_compra ? [(perfil as any).motivacion_compra, 'Garantía por escrito'] : ['Prueba social comprobada', 'Recomendación directa']),
    frenos_compra: Array.isArray(perfil?.frenos_compra) && perfil.frenos_compra.length > 0
      ? perfil.frenos_compra
      : (Array.isArray((perfil as any)?.objeciones_comunes) ? (perfil as any).objeciones_comunes : ['Presupuesto inicial ajustado', 'Miedo a cambiar de proveedor']),
    lenguaje_tipico: perfil?.lenguaje_tipico || ((perfil as any)?.dolor_principal ? `Busco resolver que ${(perfil as any).dolor_principal.toLowerCase()}` : 'Busco un servicio confiable con resultados reales.'),
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* Header con score */}
      <div className="flex items-center gap-5 rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.12] to-transparent p-5">
        <ScoreRing score={p.score_afinidad} />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/80 mb-0.5">Score de Afinidad Producto ↔ ICP</p>
          <p className="text-base leading-relaxed text-white/80">{p.score_razon}</p>
          <div className="flex items-center gap-1.5 text-[11px] text-white/40 mt-1">
            {p.score_afinidad >= 80 ? (
              <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                <IconCheck className="w-3 h-3" /> Alta afinidad comercial
              </span>
            ) : p.score_afinidad >= 60 ? (
              <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                <IconAlert className="w-3 h-3" /> Afinidad moderada — optimizaciones viables
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-300 font-medium">
                <IconX className="w-3 h-3" /> Afinidad baja — calibrar propuesta de valor
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-white/40 hover:text-white ml-2 text-sm font-bold">×</button>
        </div>
      )}

      {/* Grid de secciones */}
      <div className="grid gap-3 md:grid-cols-2">

        {/* Demografía */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
            <IconUser className="w-3.5 h-3.5" />
            <span>Segmentación Demográfica</span>
          </div>
          {[
            { label: 'Edad', campo: 'demograficos.edad_rango', valor: p.demograficos.edad_rango },
            { label: 'Género', campo: 'demograficos.genero_predominante', valor: p.demograficos.genero_predominante },
            { label: 'NSE', campo: 'demograficos.nivel_socioeconomico', valor: p.demograficos.nivel_socioeconomico },
            { label: 'Ubicación', campo: 'demograficos.ubicacion_tipica', valor: p.demograficos.ubicacion_tipica },
          ].map(({ label, campo, valor }) => (
            <div key={campo} className="flex items-start gap-2 group cursor-pointer" onClick={() => startEdit(campo, valor)}>
              <span className="text-[10px] text-white/35 min-w-[52px] pt-0.5">{label}</span>
              <span className="text-sm text-white/75 group-hover:text-white transition-colors flex-1">{valor}</span>
              <span className="text-white/20 group-hover:text-violet-400 transition-colors opacity-0 group-hover:opacity-100">
                <IconEdit className="w-3 h-3" />
              </span>
            </div>
          ))}
        </div>

        {/* Canales */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-300">
            <IconDevice className="w-3.5 h-3.5" />
            <span>Canales de Adquisición & Consumo</span>
          </div>
          <TagList items={p.canales_preferidos} color="border border-blue-400/25 bg-blue-500/[0.08] text-blue-200" />
          <button onClick={() => startEdit('canales_preferidos[]', p.canales_preferidos)}
            className="inline-flex items-center gap-1 text-[10px] text-white/25 hover:text-violet-400 transition-colors mt-1">
            <IconEdit className="w-3 h-3" />
            <span>Editar</span>
          </button>

          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 mt-3">
            <IconSearch className="w-3.5 h-3.5" />
            <span>Búsquedas e Intenciones Frecuentes</span>
          </div>
          <div className="space-y-1">
            {p.queries_tipicas.map((q, i) => (
              <p key={i} className="text-[12px] text-white/55 font-mono">"{q}"</p>
            ))}
          </div>
          <button onClick={() => startEdit('queries_tipicas[]', p.queries_tipicas)}
            className="inline-flex items-center gap-1 text-[10px] text-white/25 hover:text-violet-400 transition-colors">
            <IconEdit className="w-3 h-3" />
            <span>Editar</span>
          </button>
        </div>

        {/* Psicografía */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-orange-300">
            <IconBrain className="w-3.5 h-3.5" />
            <span>Matriz Psicográfica</span>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] text-red-300/80 mb-1">
              <IconAlert className="w-3 h-3 text-red-400" />
              <span>Dolores y Puntos de Dolor Primarios</span>
            </div>
            <TagList items={p.psicografia.miedos_principales} color="border border-red-400/20 bg-red-500/[0.06] text-red-200" />
            <button onClick={() => startEdit('psicografia.miedos_principales', p.psicografia.miedos_principales)}
              className="inline-flex items-center gap-1 text-[10px] text-white/20 hover:text-violet-400 transition-colors mt-1">
              <IconEdit className="w-3 h-3" />
              <span>Editar</span>
            </button>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-300/80 mb-1">
              <IconZap className="w-3 h-3 text-emerald-400" />
              <span>Deseos y Transformación Buscada</span>
            </div>
            <TagList items={p.psicografia.deseos_clave} color="border border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-200" />
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] text-yellow-300/80 mb-1">
              <IconCheck className="w-3 h-3 text-yellow-400" />
              <span>Criterios y Valores de Decisión</span>
            </div>
            <TagList items={p.psicografia.valores_compra} color="border border-yellow-400/20 bg-yellow-500/[0.06] text-yellow-100" />
          </div>
        </div>

        {/* Disparadores y frenos */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-pink-300">
            <IconZap className="w-3.5 h-3.5" />
            <span>Disparadores &amp; Fricciones</span>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-300/80 mb-1">
              <IconCheck className="w-3 h-3 text-emerald-400" />
              <span>Catalizadores de Conversión</span>
            </div>
            <ul className="space-y-1">
              {p.disparadores_compra.map((d, i) => (
                <li key={i} className="flex gap-2 text-sm text-white/65">
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/60" />{d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] text-red-300/80 mb-1">
              <IconAlert className="w-3 h-3 text-red-400" />
              <span>Frenos de Decisión & Fricción</span>
            </div>
            <ul className="space-y-1">
              {p.frenos_compra.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-white/65">
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />{f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Lenguaje típico */}
      <div className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-4">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-300 mb-2">
          <IconMessage className="w-3.5 h-3.5" />
          <span>Voz del Cliente & Patrón de Lenguaje</span>
        </div>
        <p className="text-base italic text-white/80">"{p.lenguaje_tipico}"</p>
        <button onClick={() => startEdit('lenguaje_tipico', p.lenguaje_tipico)}
          className="inline-flex items-center gap-1 text-[10px] text-white/25 hover:text-violet-400 transition-colors mt-2">
          <IconEdit className="w-3 h-3" />
          <span>Editar</span>
        </button>
      </div>

      {/* Objeciones */}
      <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.05] p-4">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2">
          <IconHelpCircle className="w-3.5 h-3.5" />
          <span>Objeciones Críticas en Etapa de Cierre</span>
        </div>
        <ul className="space-y-1.5">
          {p.psicografia.objeciones_tipicas.map((o, i) => (
            <li key={i}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-white/70 italic">"{o}"</span>
                <button
                  onClick={() => verRebatida(o)}
                  className="shrink-0 text-[10px] font-semibold text-violet-300/70 hover:text-violet-300 transition-colors whitespace-nowrap"
                >
                  {objecionExpandida === o ? 'Ocultar' : 'Ver rebatida sugerida'}
                </button>
              </div>
              {objecionExpandida === o && (
                <div className="mt-1.5 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] p-3">
                  {cargandoRebatidas ? (
                    <p className="text-xs text-white/40">Generando rebatida...</p>
                  ) : (
                    <p className="text-xs text-white/80 leading-relaxed">
                      {rebatidas?.[o] ?? 'No se pudo generar la rebatida. Intenta de nuevo.'}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Palabras clave para ads */}
      <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.05] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-300">
            <IconTarget className="w-3.5 h-3.5" />
            <span>Palabras Clave para Ads</span>
          </div>
          {!palabrasAds && (
            <button
              onClick={generarPalabrasAds}
              disabled={cargandoAds}
              className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-[10.5px] font-semibold text-blue-200 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
            >
              {cargandoAds ? 'Generando...' : 'Generar palabras clave para ads'}
            </button>
          )}
        </div>

        {palabrasAds && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-white/50">Google Ads — palabras clave</p>
                <button
                  onClick={() => copiarLista('google', palabrasAds.keywords_busqueda)}
                  className="inline-flex items-center gap-1 text-[10px] text-blue-300/70 hover:text-blue-300 transition-colors"
                >
                  <IconCopy className="w-3 h-3" />
                  <span>{copiado === 'google' ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <TagList items={palabrasAds.keywords_busqueda} color="border border-blue-400/25 bg-blue-500/[0.08] text-blue-200" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-white/50">Meta Ads — intereses</p>
                <button
                  onClick={() => copiarLista('meta', palabrasAds.intereses_meta)}
                  className="inline-flex items-center gap-1 text-[10px] text-blue-300/70 hover:text-blue-300 transition-colors"
                >
                  <IconCopy className="w-3 h-3" />
                  <span>{copiado === 'meta' ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <TagList items={palabrasAds.intereses_meta} color="border border-indigo-400/25 bg-indigo-500/[0.08] text-indigo-200" />
            </div>
          </div>
        )}
      </div>

      {/* Modal de edición */}
      <AnimatePresence>
        {editando && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditando(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0F1B2E] p-6 shadow-2xl"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-violet-300 mb-3">
                <IconEdit className="w-3.5 h-3.5" />
                <span>Editar Parámetro:</span>
                <span className="text-white/60">{editField.replace(/\[\]$/, '').replace('.', ' → ').replace(/_/g, ' ')}</span>
              </div>
              {Array.isArray(valorEnCampo(perfil, editField)) ? (
                <>
                  <textarea
                    className="w-full rounded-xl border border-white/15 bg-white/[0.05] p-3 text-sm text-white focus:outline-none focus:border-violet-400/50 resize-none"
                    rows={5}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    placeholder="Un item por línea"
                  />
                  <p className="text-[10px] text-white/35 mt-1">Un elemento por línea</p>
                </>
              ) : (
                <input
                  className="w-full rounded-xl border border-white/15 bg-white/[0.05] p-3 text-sm text-white focus:outline-none focus:border-violet-400/50"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                />
              )}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => guardarEdicion(editField, editValue)}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => setEditando(false)}
                  className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm text-white/60 hover:bg-white/[0.05]">
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
