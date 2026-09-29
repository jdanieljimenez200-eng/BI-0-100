'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getImageUrl } from '@/lib/utils';
import { interpretarErrorApi } from '@/lib/apiError';
import AvisoErrorApi from '@/components/ui/AvisoErrorApi';
import ReporteAdsUploader from './ReporteAdsUploader';
import { BackButton } from '@/components/ui';
import type { ReporteAdsProcesado } from './resultado/[analisisId]/RendimientoPasadoSection';

type VozMarca = 'Profesional' | 'Divertido' | 'Urgente' | 'Empático';

const VOCES: { id: VozMarca; label: string; desc: string }[] = [
  { id: 'Profesional', label: 'Profesional', desc: 'Formal, datos, confianza' },
  { id: 'Divertido',   label: 'Divertido',   desc: 'Casual, directo, cercano' },
  { id: 'Urgente',     label: 'Urgente',     desc: 'Escasez, actuar AHORA' },
  { id: 'Empático',    label: 'Empático',    desc: 'Cálido, sin presión' },
];

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number | null;
  imagen_url: string | null;
  inversion_inicial: number | null;
  cliente_ideal: string | null;
}

interface AnalisisBriefPrevio {
  id: string;
  fecha_creacion: string;
  estado_analisis?: string;
}

interface AnalisisVentasPrevio {
  id: string;
  fecha_creacion: string;
  estado_analisis?: string;
  perfil_cliente_data?: unknown;
}

interface AnalisisMercadoPrevio {
  id: string;
  fecha_creacion: string;
  viabilidad_score: number;
  estado_analisis?: string;
  reporte_bi_data?: Record<string, unknown> | null;
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-white/5 border border-white/10 text-white placeholder-white/25 rounded-xl ' +
  'px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-marketing/40 ' +
  'focus:border-marketing/40 transition';

// Para <select>: appearance-none quita la flecha nativa del SO
const selectCls = inputCls + ' appearance-none cursor-pointer';

// ─── Micro-components ─────────────────────────────────────────────────────────

function Block({
  n, title, subtitle, children,
}: {
  n: number; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0F1C2A] rounded-2xl border border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-marketing/20 text-marketing text-xs font-bold flex items-center justify-center flex-shrink-0">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {subtitle && <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 space-y-6">{children}</div>
    </div>
  );
}

import { HelpTip } from '@/components/ui/HelpTip';

function Field({
  label, required, optional, hint, help, error, children,
}: {
  label: string; required?: boolean; optional?: boolean;
  hint?: string; help?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/80 mb-1.5">
        {label}
        {required && <span className="text-brand-accent ml-0.5">*</span>}
        {optional && <span className="text-white/30 font-normal ml-1">(opcional)</span>}
        {help && <HelpTip text={help} label={label} />}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-white/30 mt-1.5 leading-snug">{hint}</p>}
      {error && <p className="text-xs text-brand-accent mt-1.5">{error}</p>}
    </div>
  );
}

export default function MarketingScopePage() {
  const router = useRouter();
  const { productoId } = useParams<{ productoId: string }>();

  const [producto, setProducto] = useState<Producto | null>(null);
  const [productoError, setProductoError] = useState<string | null>(null);
  const [analisisPrevios, setAnalisisPrevios] = useState<AnalisisMercadoPrevio[]>([]);
  
  // Form State
  const [mercadoId, setMercadoId] = useState('');
  const [vincularMercado, setVincularMercado] = useState(true);
  const [vozMarca, setVozMarca] = useState<VozMarca>('Profesional');
  const [presupuesto, setPresupuesto] = useState(3000);
  const [presupuestoIniciado, setPresupuestoIniciado] = useState(false);
  const [metaCampana, setMetaCampana] = useState<'Lanzamiento' | 'Crecimiento'>('Lanzamiento');

  const [clienteIdeal, setClienteIdeal] = useState('');
  const [briefPrevios, setBriefPrevios] = useState<AnalisisBriefPrevio[]>([]);
  const [briefAnalisisId, setBriefAnalisisId] = useState('');
  const [vincularBrief, setVincularBrief] = useState(true);

  const [ventasPrevios, setVentasPrevios] = useState<AnalisisVentasPrevio[]>([]);
  const [ventasAnalisisId, setVentasAnalisisId] = useState('');
  const [vincularVentasIcp, setVincularVentasIcp] = useState(true);

  // Reporte de anuncios ya procesado por /marketing/metricas-pasadas/parse.
  // Opcional: si es null, el análisis se lanza igual y sin datos históricos.
  const [reporteAds, setReporteAds] = useState<ReporteAdsProcesado | null>(null);

  const [plataformas, setPlataformas] = useState<string[]>(['Instagram', 'Facebook']);
  const [capacidadContenido, setCapacidadContenido] = useState<'1-2/semana' | '3-4/semana' | 'diario'>('3-4/semana');

  // Parámetros de Dinámica Comercial y Conversión (Agencia)
  const [canalCierre, setCanalCierre] = useState<'whatsapp_dm' | 'ecommerce_web' | 'llamada' | 'tienda_fisica'>('whatsapp_dm');
  const [margenEstimado, setMargenEstimado] = useState<'bajo_30' | 'medio_30_50' | 'alto_50_70' | 'premium_70_plus'>('medio_30_50');
  const [nivelTraccion, setNivelTraccion] = useState<'desde_cero' | 'en_marcha' | 'escalando'>('desde_cero');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // true → el error es un gate de plan (403 + upgrade_required), no datos inválidos
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  // Errores por campo (M2) — independientes del `error` global de servidor
  const [fieldErrors, setFieldErrors] = useState<{ plataformas?: string }>({});

  // El orden y los ids deben coincidir con el enum de plataformas de
  // backend/src/routes/marketing.ts (AnalizarMarketingSchema): cualquier id
  // que no esté en ese enum hace fallar la validación del POST
  // /api/marketing/analizar con 400. El schema acepta como máximo 12
  // plataformas, las 12 que se listan aquí.
  // Los colores replican los de PLATAFORMA_META en PlanInversionSection.tsx
  // para que el formulario y el resultado hablen el mismo idioma visual.
  // `fg` es el color del texto cuando la plataforma está activa: sobre fondos
  // claros (Snapchat) el blanco es ilegible, así que ahí se usa tinta oscura.
  const PLATAFORMAS_OPCIONES: { id: string; color: string; fg: string }[] = [
    { id: 'Instagram', color: '#E1306C', fg: '#FFFFFF' },
    { id: 'TikTok',    color: '#EE1D52', fg: '#FFFFFF' },
    { id: 'Facebook',  color: '#1877F2', fg: '#FFFFFF' },
    { id: 'WhatsApp',  color: '#25D366', fg: '#0B1F14' },
    { id: 'LinkedIn',  color: '#0A66C2', fg: '#FFFFFF' },
    { id: 'YouTube',   color: '#FF0000', fg: '#FFFFFF' },
    { id: 'Twitter',   color: '#1DA1F2', fg: '#FFFFFF' },
    { id: 'Pinterest', color: '#E60023', fg: '#FFFFFF' },
    { id: 'Threads',   color: '#A1A1AA', fg: '#18181B' },
    { id: 'Telegram',  color: '#229ED9', fg: '#FFFFFF' },
    { id: 'Snapchat',  color: '#FFFC00', fg: '#1A1A00' },
    { id: 'Reddit',    color: '#FF4500', fg: '#FFFFFF' },
  ];

  const MAX_PLATAFORMAS = 12;

  const CANALES_CIERRE = [
    { id: 'whatsapp_dm' as const,   label: 'WhatsApp / DM',        desc: 'Cierre conversacional por chat' },
    { id: 'ecommerce_web' as const, label: 'Web / Tienda Online',   desc: 'Carrito directo sin intervención' },
    { id: 'llamada' as const,       label: 'Llamada Telefónica',    desc: 'Venta consultiva de alto valor' },
    { id: 'tienda_fisica' as const, label: 'Punto de Venta / Local', desc: 'Tráfico presencial a sucursal' },
  ];

  const MARGENES_OPCIONES = [
    { id: 'bajo_30' as const,         label: '< 30%',       desc: 'Volumen alto, margen ajustado' },
    { id: 'medio_30_50' as const,     label: '30% – 50%',   desc: 'Estándar comercial promedio' },
    { id: 'alto_50_70' as const,      label: '50% – 70%',   desc: 'Margen saludable de producto' },
    { id: 'premium_70_plus' as const, label: '> 70%',       desc: 'Servicios, infoproductos, SaaS' },
  ];

  const NIVELES_TRACCION = [
    { id: 'desde_cero' as const, label: 'Desde Cero', desc: '0 a 500 seguidores, comenzando' },
    { id: 'en_marcha' as const,  label: 'En Marcha',  desc: 'Audiencia activa, buscando escala' },
    { id: 'escalando' as const,  label: 'Escalando',  desc: 'Ventas constantes, optimizando CAC' },
  ];

  const togglePlataforma = (p: string) => {
    setFieldErrors(prev => (prev.plataformas ? {} : prev));
    setPlataformas((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  useEffect(() => {
    // Navegar de un producto a otro reutiliza este componente y relanza el
    // efecto: sin este flag, la respuesta del producto anterior puede llegar
    // después y pintarse bajo el producto nuevo.
    let vigente = true;
    
    api.get(`/productos/${productoId}`)
      .then(({ data }) => {
        if (!vigente) return;
        setProducto(data);
        if (data.cliente_ideal) setClienteIdeal(data.cliente_ideal);
        if (!presupuestoIniciado && data.inversion_inicial) {
          const sugerido = Math.round((Number(data.inversion_inicial) * 0.15) / 1000) * 1000;
          const clamped  = Math.max(1000, Math.min(50000, sugerido));
          setPresupuesto(clamped);
        }
      })
      .catch(() => setProductoError('No se pudo cargar el producto.'));

    api.get(`/mercado/producto/${productoId}`)
      .then(({ data }) => {
        // El endpoint devuelve UN objeto (último análisis), no una lista.
        const uno = data as AnalisisMercadoPrevio | null;
        const completados = uno && (uno.estado_analisis === 'completado' || uno.viabilidad_score != null)
          ? [uno]
          : [];
        setAnalisisPrevios(completados);
        if (completados.length > 0) {
          setMercadoId(completados[0].id);
          setVincularMercado(true);
        } else {
          setVincularMercado(false);
        }
      })
      .catch(() => setVincularMercado(false));

    api.get(`/brief/producto/${productoId}`)
      .then(({ data }) => {
        // Ídem: un solo objeto o 404.
        const uno = data as AnalisisBriefPrevio | null;
        const completados = uno && uno.estado_analisis === 'completado' ? [uno] : [];
        setBriefPrevios(completados);
        if (completados.length > 0) {
          setBriefAnalisisId(completados[0].id);
          setVincularBrief(true);
        } else {
          setVincularBrief(false);
        }
      })
      .catch(() => setVincularBrief(false));

    api.get(`/ventas/producto/${productoId}`)
      .then(({ data }) => {
        // Ídem: un solo objeto o 404. Solo cuenta si de verdad trae un ICP
        // generado (freemium puede tener el análisis pero sin perfil_cliente_data).
        const uno = data as AnalisisVentasPrevio | null;
        const completados = uno && uno.estado_analisis === 'completado' && uno.perfil_cliente_data ? [uno] : [];
        setVentasPrevios(completados);
        if (completados.length > 0) {
          setVentasAnalisisId(completados[0].id);
          setVincularVentasIcp(true);
        } else {
          setVincularVentasIcp(false);
        }
      })
      .catch(() => { if (vigente) setVincularVentasIcp(false); });
    return () => { vigente = false; };
  }, [productoId, router]);

  const handleAnalizar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (plataformas.length === 0) { setFieldErrors({ plataformas: 'Selecciona al menos una plataforma activa' }); return; }
    setFieldErrors({});
    setError('');
    setUpgradeRequired(false);
    setLoading(true);
    try {
      const { data } = await api.post('/marketing/analizar', {
        producto_id: productoId,
        voz_marca: vozMarca,
        analisis_mercado_id: vincularMercado && mercadoId ? mercadoId : undefined,
        presupuesto_mensual: Number(presupuesto) || 3000,
        meta_campana: metaCampana,
        brief_analisis_id: vincularBrief && briefAnalisisId ? briefAnalisisId : undefined,
        ventas_analisis_id: vincularVentasIcp && ventasAnalisisId ? ventasAnalisisId : undefined,
        cliente_ideal: clienteIdeal.trim() || undefined,
        plataformas: plataformas.length > 0 ? plataformas : undefined,
        capacidad_contenido: capacidadContenido,
        canal_cierre: canalCierre,
        margen_estimado: margenEstimado,
        nivel_traccion: nivelTraccion,
        // Sólo el resumen agregado: el archivo original nunca sale del parser.
        reporte_ads: reporteAds ?? undefined,
      });
      router.push(`/dashboard/marketing/${productoId}/resultado/${data.analisis_id}`);
    } catch (err: unknown) {
      const interpretado = interpretarErrorApi(
        err,
        'Error al iniciar el análisis de marketing. Revisa tus datos.',
      );
      setError(interpretado.mensaje);
      setUpgradeRequired(interpretado.upgradeRequired);
      setLoading(false);
    }
  };

  if (productoError) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <p className="text-white/50 text-sm">{productoError}</p>
        <Link href="/dashboard" className="text-sm mt-2 block hover:underline">← Volver al dashboard</Link>
      </div>
    );
  }

  if (!producto) {
    return <div className="flex items-center justify-center h-64 text-white/40 text-sm">Cargando...</div>;
  }

  const imgUrl = getImageUrl(producto.imagen_url);

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto animate-fade-in">

      <div className="mb-8">
        <BackButton
          href={`/dashboard/producto/${productoId}`}
          label="Ficha del producto"
          className="mb-4"
        />
        <h1 className="text-2xl font-bold text-white mb-2">
          Estrategia de Marketing
        </h1>
        <p className="text-sm text-white/40 mt-1">
          La IA diseñará un embudo completo y calendario de 14 días con tus copies listos para usar.
        </p>

        {/* Producto Card */}
        <div className="bg-[#0F1C2A] rounded-2xl p-5 mt-6 flex items-center gap-4 border border-white/8 shadow-sm">
          <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
            {imgUrl
              ? <img src={imgUrl} alt={producto.nombre} className="w-full h-full object-cover" />
              : (
                <svg className="w-6 h-6 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m7.5 4.27 9 5.15"/>
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                  <path d="m3.3 7 8.7 5 8.7-5"/>
                  <path d="M12 22V12"/>
                </svg>
              )}
          </div>
          <div>
            <p className="font-bold text-white">{producto.nombre}</p>
            <p className="text-sm text-white/50">
              {producto.categoria}{producto.precio ? ` · $${Number(producto.precio).toFixed(0)} MXN` : ''}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleAnalizar} noValidate className="flex flex-col gap-5">
        
        {/* BLOQUE 1 - Configuración de Identidad */}
        <Block n={1} title="Configuración de Identidad" subtitle="Define la voz y el contexto de la marca">
          
          <Field label="Voz de Marca" required hint="La IA usará esta personalidad para escribir todos tus textos." help="El tono y personalidad con que tu marca le habla al cliente. Define si los copies suenan cercanos, expertos, divertidos o aspiracionales. Elige el que mejor encaje con tu público.">
            <div className="grid grid-cols-2 gap-3 mt-1">
              {VOCES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVozMarca(v.id)}
                  className={`text-left p-3.5 rounded-xl border-2 transition-all ${
                    vozMarca === v.id
                      ? 'border-marketing bg-marketing/10'
                      : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                  }`}
                >
                  <p className={`text-xs font-bold leading-tight mb-1 ${vozMarca === v.id ? 'text-white' : 'text-white/70'}`}>
                    {v.label}
                  </p>
                  <p className="text-[10px] text-white/40 leading-snug">{v.desc}</p>
                </button>
              ))}
            </div>
          </Field>

          {analisisPrevios.length > 0 ? (
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input 
                    type="checkbox" 
                    checked={vincularMercado} 
                    onChange={e => setVincularMercado(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${vincularMercado ? 'bg-marketing border-marketing' : 'border-white/20 bg-white/5 group-hover:border-white/40'}`}>
                    {vincularMercado && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-semibold text-white/90">Vincular Análisis de Mercado</span>
                  <p className="text-xs text-white/50 mt-0.5 leading-snug">
                    Extraeremos tu Propuesta Única de Valor (PUV) y el Gap de Oportunidad para inyectarlo en los argumentos de venta.
                  </p>
                </div>
              </label>
              
              {vincularMercado && (
                <div className="ml-8 mt-3 animate-fade-in">
                  <select
                    value={mercadoId}
                    onChange={e => setMercadoId(e.target.value)}
                    className={selectCls}
                  >
                    {analisisPrevios.map((a) => (
                      <option key={a.id} value={a.id} className="bg-[#0F1C2A]">
                        Mercado — Score {a.viabilidad_score}/100 — {new Date(a.fecha_creacion).toLocaleDateString('es-MX')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
             <div className="p-3.5 bg-white/5 rounded-xl border border-white/10 text-xs text-white/50">
                <i>No se encontraron análisis de mercado previos. Te sugerimos realizar uno primero para que la estrategia sea más precisa.</i>
             </div>
          )}
        </Block>

        {/* BLOQUE 2 - Canales y Capacidad */}
        <Block n={2} title="Canales y Capacidad" subtitle="La IA generará contenido SOLO para las plataformas que selecciones">

          <Field label="¿En qué plataformas estás activo?" required hint="El calendario usará únicamente estas plataformas — no más." help="Marca solo las redes donde realmente vas a publicar. La IA genera contenido exclusivamente para estas — no tiene sentido seleccionar una en la que no producirás nada." error={fieldErrors.plataformas}>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLATAFORMAS_OPCIONES.map((p) => {
                const activa = plataformas.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => togglePlataforma(p.id)}
                    style={activa ? { backgroundColor: p.color, borderColor: p.color, color: p.fg } : undefined}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-marketing/50 ${
                      activa
                        ? 'shadow-sm'
                        : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30 hover:text-white/80'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: activa ? 'currentColor' : p.color }} />
                    {p.id}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-white/35 mt-2" aria-live="polite">
              {plataformas.length === 0
                ? 'Ninguna seleccionada'
                : `${plataformas.length} de ${MAX_PLATAFORMAS} seleccionadas: ${plataformas.join(' · ')}`}
            </p>
          </Field>

          <Field label="¿Cuánto contenido puedes producir por semana?" hint="Sé honesto — un calendario realista que ejecutas vale más que uno perfecto que no." help="Tu capacidad real de publicar (posts, reels, historias). La IA ajusta la densidad del calendario a este ritmo: prometer diario y no cumplirlo daña más que un ritmo tranquilo sostenido.">
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { v: '1-2/semana', label: '1-2 / semana', sub: 'Ritmo tranquilo' },
                { v: '3-4/semana', label: '3-4 / semana', sub: 'Ritmo estándar' },
                { v: 'diario',     label: 'Diario',        sub: 'Ritmo intensivo' },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setCapacidadContenido(o.v)}
                  className={`p-3 rounded-xl border transition-all text-center ${
                    capacidadContenido === o.v
                      ? 'border-marketing bg-marketing/10'
                      : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                  }`}
                >
                  <p className={`text-xs font-bold ${capacidadContenido === o.v ? 'text-white' : 'text-white/60'}`}>{o.label}</p>
                  <p className="text-[10px] text-white/35 mt-0.5">{o.sub}</p>
                </button>
              ))}
            </div>
          </Field>

        </Block>

        {/* BLOQUE 3 - Dinámica Comercial & Unit Economics */}
        <Block n={3} title="Dinámica Comercial y Conversión" subtitle="Parámetros de cierre para modelar tus Unit Economics y guiones tácticos">
          <Field label="¿Dónde cierras la mayoría de tus ventas?" required hint="La IA diseñará el guión exacto y el embudo adaptado a este canal." help="El canal donde se realiza la transacción o el acuerdo final. Si vendes por WhatsApp tus necesidades de guión son muy distintas a una tienda online con carrito automático.">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-1">
              {CANALES_CIERRE.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCanalCierre(c.id)}
                  className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between ${
                    canalCierre === c.id
                      ? 'border-marketing bg-marketing/10 shadow-sm'
                      : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                  }`}
                >
                  <p className={`text-xs font-bold ${canalCierre === c.id ? 'text-white' : 'text-white/80'}`}>{c.label}</p>
                  <p className="text-[10px] text-white/40 mt-1 leading-snug">{c.desc}</p>
                </button>
              ))}
            </div>
          </Field>

          <Field label="¿Cuál es tu margen aproximado de ganancia?" required hint="Permite calcular con precisión tu CAC máximo tolerable (lo máximo que puedes pagar en pauta por cliente)." help="El porcentaje de beneficio neto que te queda tras descontar el costo directo de entrega o producto. Vital para asegurar que el marketing no te haga perder dinero.">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-1">
              {MARGENES_OPCIONES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMargenEstimado(m.id)}
                  className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between ${
                    margenEstimado === m.id
                      ? 'border-marketing bg-marketing/10 shadow-sm'
                      : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                  }`}
                >
                  <p className={`text-xs font-bold font-mono ${margenEstimado === m.id ? 'text-white' : 'text-white/80'}`}>{m.label}</p>
                  <p className="text-[10px] text-white/40 mt-1 leading-snug">{m.desc}</p>
                </button>
              ))}
            </div>
          </Field>

          <Field label="¿En qué etapa está tu cuenta hoy?" required hint="Calibra el balance de masa crítica vs velocidad de conversión." help="El estado actual de tu audiencia en redes. Permite recomendar tácticas de crecimiento orgánico si estás desde cero o aceleradores de pauta si ya estás en marcha.">
            <div className="grid grid-cols-3 gap-2.5 mt-1">
              {NIVELES_TRACCION.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNivelTraccion(t.id)}
                  className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between ${
                    nivelTraccion === t.id
                      ? 'border-marketing bg-marketing/10 shadow-sm'
                      : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                  }`}
                >
                  <p className={`text-xs font-bold ${nivelTraccion === t.id ? 'text-white' : 'text-white/80'}`}>{t.label}</p>
                  <p className="text-[10px] text-white/40 mt-1 leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>
          </Field>
        </Block>

        <Block n={4} title="Presupuesto de Marketing" subtitle="Porción de tu inversión destinada a publicidad y contenido">
          
          {producto && producto.inversion_inicial && (
            <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 mb-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Capital total del proyecto</span>
                <span className="text-sm font-bold text-white font-mono tabular-nums">${Number(producto.inversion_inicial).toLocaleString('es-MX')} MXN</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-marketing/70 uppercase tracking-wider font-semibold">Sugerido para marketing (~15%)</span>
                <span className="text-sm font-bold text-marketing font-mono tabular-nums">
                  ${Math.max(1000, Math.min(50000, Math.round((Number(producto.inversion_inicial) * 0.15) / 1000) * 1000)).toLocaleString('es-MX')} MXN
                </span>
              </div>
              <p className="text-[10px] text-white/30 leading-relaxed border-t border-white/5 pt-2">
                Descuenta gastos fijos, inventario y costos operativos antes de asignar tu presupuesto de marketing. Escribe el monto mensual que destinarás a publicidad y contenido.
              </p>
            </div>
          )}

          <Field label="¿Cuánto de tu inversión destinas a marketing?" required hint="El motor proyectará metas reales de alcance y ROI basadas en este presupuesto." help="El monto mensual que gastarás en publicidad y contenido. Una guía común es ~15% del capital del proyecto. Con esto la IA estima alcance, clics y retorno realistas.">
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-white/50 font-mono">$</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={presupuesto}
                onChange={e => { setPresupuesto(Number(e.target.value)); setPresupuestoIniciado(true); }}
                className={`${inputCls} font-mono tabular-nums`}
                placeholder="Ej. 15000"
              />
              <span className="text-sm text-white/50 whitespace-nowrap">MXN/mes</span>
            </div>
          </Field>

          <Field label="Meta de Campaña" required help="Lanzamiento = darte a conocer y conseguir tus primeros clientes (negocio nuevo). Crecimiento = escalar ventas con una base ya existente. Cambia el enfoque del embudo y los copies.">
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                type="button"
                onClick={() => setMetaCampana('Lanzamiento')}
                className={`p-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center ${
                  metaCampana === 'Lanzamiento'
                    ? 'border-marketing bg-marketing/10'
                    : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                }`}
              >
                <svg className={`w-5 h-5 mb-1.5 ${metaCampana === 'Lanzamiento' ? 'text-marketing' : 'text-white/40'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
                <p className={`text-xs font-bold ${metaCampana === 'Lanzamiento' ? 'text-white' : 'text-white/60'}`}>
                  Lanzamiento
                </p>
                <p className="text-[10px] mt-0.5 text-white/40">Para Negocios Nuevos</p>
              </button>

              <button
                type="button"
                onClick={() => setMetaCampana('Crecimiento')}
                className={`p-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center ${
                  metaCampana === 'Crecimiento'
                    ? 'border-marketing bg-marketing/10'
                    : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                }`}
              >
                <svg className={`w-5 h-5 mb-1.5 ${metaCampana === 'Crecimiento' ? 'text-marketing' : 'text-white/40'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
                <p className={`text-xs font-bold ${metaCampana === 'Crecimiento' ? 'text-white' : 'text-white/60'}`}>
                  Crecimiento
                </p>
                <p className="text-[10px] mt-0.5 text-white/40">Para Negocios en Marcha</p>
              </button>
            </div>
          </Field>
        </Block>

        {/* BLOQUE 5 - Audiencia y Contexto */}
        <Block n={5} title="Audiencia y Contexto" subtitle="Opcional — personaliza los copies para tu cliente ideal">

          <Field
            label="¿Quién es tu cliente ideal?"
            optional
            hint="La IA escribirá los copies dirigidos exactamente a esta persona. Cuanto más específico, mejores resultados."
            help="Describe a la persona concreta que compra: edad, lugar, qué le preocupa y dónde compra. Mientras más detalle des, más afilados y persuasivos serán los textos que genere la IA."
          >
            <textarea
              rows={3}
              value={clienteIdeal}
              onChange={e => setClienteIdeal(e.target.value)}
              maxLength={500}
              placeholder="Ej: Mamás de 28-40 años en CDMX que buscan productos orgánicos para sus hijos y compran por Instagram..."
              className={`${inputCls} resize-none`}
            />
          </Field>

          {briefPrevios.length > 0 && (
            <div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={vincularBrief}
                    onChange={e => setVincularBrief(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${vincularBrief ? 'bg-marketing border-marketing' : 'border-white/20 bg-white/5 group-hover:border-white/40'}`}>
                    {vincularBrief && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-semibold text-white/90">Vincular Brief de Marca</span>
                  <p className="text-xs text-white/50 mt-0.5 leading-snug">
                    Inyecta tu percepción, emociones, tono de comunicación y posicionamiento para que los copies sean 100% coherentes con tu identidad de marca.
                  </p>
                </div>
              </label>

              {vincularBrief && (
                <div className="ml-8 mt-3 animate-fade-in">
                  <select
                    value={briefAnalisisId}
                    onChange={e => setBriefAnalisisId(e.target.value)}
                    className={selectCls}
                  >
                    {briefPrevios.map((b) => (
                      <option key={b.id} value={b.id} className="bg-[#0F1C2A]">
                        Brief — {new Date(b.fecha_creacion).toLocaleDateString('es-MX')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {ventasPrevios.length > 0 && (
            <div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={vincularVentasIcp}
                    onChange={e => setVincularVentasIcp(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${vincularVentasIcp ? 'bg-marketing border-marketing' : 'border-white/20 bg-white/5 group-hover:border-white/40'}`}>
                    {vincularVentasIcp && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-semibold text-white/90">Usando tu Perfil de Cliente Ideal de Ventas</span>
                  <p className="text-xs text-white/50 mt-0.5 leading-snug">
                    Usa el ICP que ya generaste en Ventas (miedos, objeciones, cómo habla tu cliente) en vez del texto libre de arriba — desmarca para escribirlo manualmente.
                  </p>
                </div>
              </label>

              {vincularVentasIcp && (
                <div className="ml-8 mt-3 animate-fade-in">
                  <select
                    value={ventasAnalisisId}
                    onChange={e => setVentasAnalisisId(e.target.value)}
                    className={selectCls}
                  >
                    {ventasPrevios.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#0F1C2A]">
                        Perfil ICP — {new Date(v.fecha_creacion).toLocaleDateString('es-MX')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

        </Block>

        <Block
          n={5}
          title="Tus métricas anteriores"
          subtitle="Opcional — sube lo que ya exportas de Google Ads, Meta o TikTok y la IA lo analiza"
        >
          <ReporteAdsUploader
            productoId={productoId}
            onReporte={setReporteAds}
            disabled={loading}
          />
        </Block>

        <AvisoErrorApi mensaje={error} upgradeRequired={upgradeRequired} />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-marketing text-white py-4 rounded-xl font-bold hover:opacity-90 transition disabled:opacity-40 shadow-[0_0_20px_rgba(236,72,153,0.3)] mt-2"
        >
          {loading ? 'Generando Máquina de Ventas...' : 'Generar Estrategia de Marketing'}
        </button>
        <p className="text-center text-[11px] text-white/30">
          La IA estructurará el calendario completo en unos segundos.
        </p>

      </form>
    </div>
  );
}
