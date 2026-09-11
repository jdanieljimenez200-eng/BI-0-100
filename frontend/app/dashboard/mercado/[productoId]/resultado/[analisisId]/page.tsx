'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getTaxConfig } from '@/lib/taxConfig';
import { seccionesBloqueadasDe, type SeccionBloqueable } from '@/lib/gating';
import LockedSection, { SkeletonBloque, SkeletonTarjetas } from '@/components/ui/LockedSection';
import { AnalysisLoader } from '@/components/ui/AnalysisLoader';
import { AnalysisError } from '@/components/ui/AnalysisError';
import { useAnalysisEvents } from '@/app/hooks/useAnalysisEvents';
import { useAnalysisLoaderGate } from '@/app/hooks/useAnalysisLoaderGate';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

// ─── Tipos ───────────────────────────────────────────────────────────────────

// `precio_relativo` y `densidad` son opcionales a propósito: el backend los omite
// cuando no hay precio declarado o cuando la zona no es medible. Ausente ≠ 0.
interface Factores {
  tendencia: number;
  competencia: number;
  margen: number;
  demanda: number;
  oportunidad: number;
  precio_relativo?: number;
  densidad?: number;
}

// Espejo de DensidadZonaResult (backend/src/services/mercado/types.ts).
interface DensidadZona {
  es_evaluable: boolean;
  score: number | null;
  competidores_km2: number | null;
  area_km2: number | null;
  origen_area: 'area_declarada' | 'radio' | null;
  distancia_media_km: number | null;
  interpretacion: 'virgen' | 'holgada' | 'normal' | 'disputada' | 'saturada' | 'no_evaluable';
  mensaje: string;
  confianza: 'alta' | 'media' | 'baja';
}
interface Competidor { ranking: number; nombre: string; url?: string; precio_promedio: number; precio_minimo?: number; precio_maximo?: number; rating: number; numero_resenas: number; ubicacion: string; fuente: string; fortalezas?: string[]; debilidades?: string[]; }

// Señal de origen POR competidor. `fuente` ya es la verdad por fila que envía el
// backend: solo las fuentes investigadas reales se etiquetan "real"; cualquier
// otra (mock, benchmark_sector, o una fuente futura desconocida) cae por defecto
// a "estimado" — nunca presentamos competencia fabricada como dato real.
const FUENTE_REAL: Record<string, { text: string; cls: string }> = {
  mercadolibre:    { text: 'real', cls: 'text-yellow-300/70 border-yellow-500/20' },
  google_maps:     { text: 'real', cls: 'text-blue-300/70 border-blue-500/20' },
  google_shopping: { text: 'real', cls: 'text-green-300/70 border-green-500/20' },
};

const FUENTE_ESTIMADA = { text: 'estimado', cls: 'text-white/30 border-white/12' };

function fuenteFila(c: Competidor): { text: string; cls: string } {
  return FUENTE_REAL[c.fuente] ?? FUENTE_ESTIMADA;
}

interface DafoItem { titulo: string; descripcion: string; impacto?: string; probabilidad?: string; potencial?: string; mitigacion?: string; apalancamiento?: string; accion?: string; }
interface TamEsc { penetracion: number; mercado_anual: number; mercado_mensual: number; unidades_mes: number; ganancia_mes: number; }
interface Alerta { nivel: 'verde' | 'amarillo' | 'rojo'; tipo: string; mensaje: string; }
interface MesEstacional { mes: string; factor: number; razon: string; }

interface ReporteBiData {
  resumen_ejecutivo: string;
  grafica_tendencias: 'Creciente' | 'Estable' | 'Decreciente';
  score_viabilidad: number;
  mapa_competencia: string;
  alertas_ia: { color: 'Rojo' | 'Amarillo' | 'Verde'; mensaje: string }[];
  analisis_mercado: {
    validacion_precio: string;
    gap_oportunidad: string;
    analisis_dafo_dinamico: string;
    cruce_inversion_tam: string;
    proximos_pasos?: string[];
  };
  // `true` cuando el backend cayó al reporte de respaldo (reporteBiMock): textos
  // genéricos y score_viabilidad fijo. Se muestra al usuario, no se oculta.
  es_mock: boolean;
}

interface Analisis {
  id: string;
  scope: string;
  pais?: string;
  estado_analisis: 'procesando' | 'completado' | 'error';
  viabilidad_score: number;
  viabilidad_estado: string;
  viabilidad_factores: Factores;
  tendencias_data: { volumen_busquedas_mensual: number; crecimiento_porcentaje: number; tendencia: string; crecimiento_descripcion: string; datos_12_meses: { mes: string; volumen: number }[]; };
  competencia_data: { total_competidores: number; gap_detectado: string | null; competidores: Competidor[]; precio_mercado_promedio: number; };
  densidad_data?: DensidadZona | null;
  renta_zona_data?: RentaZona | null;
  estudio_area_data?: EstudioArea | null;
  dafo_data: { debilidades: DafoItem[]; amenazas: DafoItem[]; fortalezas: DafoItem[]; oportunidades: DafoItem[]; };
  tam_data: {
    ubicacion: string;
    tam_promedio: number;
    tam_escenarios: { pesimista: TamEsc; realista: TamEsc; optimista: TamEsc };
    nse_aplicado?: string;
    pct_mercado_nse?: number;
    estacionalidad?: MesEstacional[];
  };
  alertas: Alerta[];
  reporte_bi_data?: ReporteBiData;
  error_mensaje?: string;
  factores_positivos?: string[];
  factores_negativos?: string[];
  precio_usuario?: number;
  confianza_analisis?: 'alta' | 'media' | 'baja';
  payback_data?: unknown;
  // Claves que el backend recortó al servir la respuesta. Los análisis freemium
  // anteriores al gate no la traen, así que el espejo estático de lib/gating
  // sigue siendo quien decide; esto solo se suma como unión.
  secciones_bloqueadas?: string[];
}

// ─── Score config ─────────────────────────────────────────────────────────────

const SCORE_CFG: Record<string, { label: string; color: string; ring: string; bg: string; border: string; glow: string }> = {
  MUY_VIABLE:     { label: 'Muy viable',      color: '#4ade80', ring: '#4ade80', bg: 'rgba(74,222,128,0.06)',  border: 'rgba(74,222,128,0.25)',  glow: 'rgba(74,222,128,0.2)' },
  VIABLE:         { label: 'Viable',           color: '#60a5fa', ring: '#60a5fa', bg: 'rgba(96,165,250,0.06)',  border: 'rgba(96,165,250,0.25)',  glow: 'rgba(96,165,250,0.2)' },
  MODERADO:       { label: 'Moderado',         color: '#facc15', ring: '#facc15', bg: 'rgba(250,204,21,0.06)',  border: 'rgba(250,204,21,0.25)',  glow: 'rgba(250,204,21,0.2)' },
  POCO_VIABLE:    { label: 'Poco viable',      color: '#fb923c', ring: '#fb923c', bg: 'rgba(251,146,60,0.06)',  border: 'rgba(251,146,60,0.25)',  glow: 'rgba(251,146,60,0.2)' },
  NO_RECOMENDADO: { label: 'No recomendado',   color: '#f87171', ring: '#f87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.25)', glow: 'rgba(248,113,113,0.2)' },
};

const SCORE_ACCIONES: Record<string, {
  titulo: string; descripcion: string; acciones: { texto: string }[];
}> = {
  MUY_VIABLE: {
    titulo: 'Tu negocio tiene señales muy sólidas',
    descripcion: 'La combinación de demanda, competencia y márgenes muestra un camino claro hacia la rentabilidad.',
    acciones: [
      { texto: 'Define tu plan de lanzamiento en los próximos 30 días — el mercado está listo' },
      { texto: 'Valida tu precio con 5–10 clientes reales antes de invertir en publicidad' },
      { texto: 'Asegura tu capital inicial ahora que el análisis respalda la oportunidad' },
    ],
  },
  VIABLE: {
    titulo: 'Tu negocio tiene una base sólida',
    descripcion: 'Hay demanda real y espacio en el mercado. Con ejecución consistente puede ser rentable.',
    acciones: [
      { texto: 'Diferénciate de los competidores identificados — define en qué eres mejor' },
      { texto: 'Prueba con un grupo pequeño de clientes antes de escalar' },
      { texto: 'Revisa tu estructura de costos para garantizar margen positivo desde el inicio' },
    ],
  },
  MODERADO: {
    titulo: 'Hay oportunidad, pero requiere ajustes',
    descripcion: 'El mercado existe. La competencia o el margen presentan señales mixtas que se pueden corregir.',
    acciones: [
      { texto: 'Define tu ventaja específica y asegúrate de que sea difícil de copiar' },
      { texto: 'Empieza en un mercado más pequeño para ganar tracción antes de expandirte' },
      { texto: 'Revisa el análisis de Finanzas — los números deben cuadrar con tu inversión disponible' },
    ],
  },
  POCO_VIABLE: {
    titulo: 'Hay señales de alerta que atender antes de invertir',
    descripcion: 'El camino a la rentabilidad en la forma actual requiere cambios importantes.',
    acciones: [
      { texto: 'Considera un nicho más específico donde haya menos competencia directa' },
      { texto: 'Revisa tu precio — puede estar fuera del rango que el mercado acepta' },
      { texto: 'Habla con 10 clientes potenciales antes de comprometer más inversión' },
    ],
  },
  NO_RECOMENDADO: {
    titulo: 'El mercado actual presenta obstáculos significativos',
    descripcion: 'La idea no es mala, pero en su forma actual los riesgos superan las oportunidades.',
    acciones: [
      { texto: 'Evalúa si cambiar de ciudad, región o país mejora el panorama' },
      { texto: 'Reformula la propuesta de valor o el modelo de ingresos antes de relanzar' },
      { texto: 'Usa el módulo de Marketing — puede haber canales donde el negocio sí funcione' },
    ],
  },
};

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

const LOADING_STEPS = [
  'Escaneando competencia real...',
  'Analizando con Inteligencia Artificial...',
  'Validando oportunidades de mercado...',
  'Generando reporte final...',
];

// Pasos en el formato que espera AnalysisLoader. LOADING_STEPS se mantiene como
// array de strings porque el resto del archivo lo usa así.
const MERCADO_LOADER_STEPS = LOADING_STEPS.map((label) => ({ label }));

// ─── Circular Score (GSAP) ────────────────────────────────────────────────────

const CIRCUMFERENCE = 2 * Math.PI * 54;

function CircularScore({ score, estado }: { score: number; estado: string }) {
  const container = useRef<HTMLDivElement>(null);
  const numberRef  = useRef<HTMLSpanElement>(null);
  const circleRef  = useRef<SVGCircleElement>(null);
  const cfg = SCORE_CFG[estado] ?? SCORE_CFG.MODERADO;

  // `useId` devuelve algo como ":r3:"; los dos puntos rompen las referencias
  // url(#id) en algunos navegadores, así que los quitamos.
  const uid     = useId().replace(/:/g, '');
  const gradId  = `score-grad-${uid}`;
  const glowId  = `score-glow-${uid}`;

  // El score llega del backend: lo acotamos a 0-100 para que el dashoffset no
  // se salga del rango (un 120 dejaría offset negativo y giraría de más).
  const safeScore = Math.min(100, Math.max(0, Number.isFinite(score) ? score : 0));

  useGSAP(() => {
    gsap.set(circleRef.current, { strokeDashoffset: CIRCUMFERENCE });
    const tl = gsap.timeline({ scrollTrigger: { trigger: container.current, start: 'top 85%', once: true } });
    const valObj = { val: 0 };
    tl.to(valObj, {
      val: safeScore, duration: 2.2, ease: 'power3.out',
      onUpdate: () => { if (numberRef.current) numberRef.current.innerText = Math.round(valObj.val).toString(); }
    }, 0)
    .to(circleRef.current, {
      strokeDashoffset: CIRCUMFERENCE * (1 - safeScore / 100), duration: 2.2, ease: 'power3.out',
    }, 0);
  }, { scope: container, dependencies: [safeScore] });

  return (
    <div ref={container} className="flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
        {/* Glow de fondo: radial para que el desvanecido sea redondo y no deje borde */}
        <div className="absolute inset-0 rounded-full blur-2xl opacity-40 pointer-events-none"
          style={{ background: `radial-gradient(circle at 50% 50%, ${cfg.glow} 0%, transparent 70%)` }} />
        {/* viewBox con 8px de padding + región de filtro explícita: sin esto el
            resplandor se recorta en recto y se ve el "cuadrado" del filtro. */}
        <svg viewBox="-8 -8 136 136" className="-rotate-90 absolute inset-0 w-full h-full"
          style={{ overflow: 'visible' }} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor={cfg.ring} stopOpacity="0.45" />
              <stop offset="100%" stopColor={cfg.ring} stopOpacity="1" />
            </linearGradient>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%"
              colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="3.5" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle ref={circleRef} cx="60" cy="60" r="54"
            fill="none" stroke={`url(#${gradId})`} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE}
            filter={`url(#${glowId})`} />
        </svg>
        <div className="relative flex flex-col items-center justify-center">
          <span ref={numberRef} className="text-5xl font-black leading-none tabular-nums" style={{ color: cfg.color }}>0</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mt-1">de 100</span>
        </div>
      </div>
      <span className="mt-4 text-sm font-extrabold uppercase tracking-widest px-4 py-1.5 rounded-full border"
        style={{ color: cfg.color, borderColor: cfg.border, background: cfg.bg }}>
        {cfg.label}
      </span>
    </div>
  );
}

// ─── Factor Bar (GSAP) ────────────────────────────────────────────────────────

// Las barras se pintan desde las claves del objeto de factores, así que las
// claves con guion bajo necesitan una etiqueta legible.
const FACTOR_LABELS: Record<string, string> = {
  tendencia: 'Tendencia',
  competencia: 'Competencia',
  margen: 'Margen',
  demanda: 'Demanda',
  oportunidad: 'Oportunidad',
  precio_relativo: 'Precio vs mercado',
  densidad: 'Densidad de zona',
};

function FactorBar({ label, value }: { label: string; value: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  const cont   = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.fromTo(barRef.current, { width: '0%' }, {
      width: `${value}%`, duration: 1.5, ease: 'power3.out',
      scrollTrigger: { trigger: cont.current, start: 'top 90%', once: true }
    });
  }, { scope: cont, dependencies: [value] });

  const color = value >= 75 ? '#4ade80' : value >= 50 ? '#60a5fa' : value >= 30 ? '#facc15' : '#f87171';

  return (
    <div ref={cont}>
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="capitalize font-semibold text-white/65">{FACTOR_LABELS[label] ?? label.replace(/_/g, ' ')}</span>
        <span className="font-black" style={{ color }}>{value}</span>
      </div>
      <div className="h-2 bg-white/6 rounded-full overflow-hidden">
        <div ref={barRef} className="h-full rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
      </div>
    </div>
  );
}

// ─── Densidad de zona ─────────────────────────────────────────────────────────

const DENSIDAD_CFG: Record<DensidadZona['interpretacion'], {
  label: string; color: string; border: string; bg: string;
}> = {
  virgen:       { label: 'Zona virgen',        color: '#4ade80', border: 'rgba(74,222,128,0.25)',  bg: 'rgba(74,222,128,0.06)' },
  holgada:      { label: 'Zona holgada',       color: '#86efac', border: 'rgba(134,239,172,0.22)', bg: 'rgba(134,239,172,0.05)' },
  normal:       { label: 'Densidad normal',    color: '#60a5fa', border: 'rgba(96,165,250,0.25)',  bg: 'rgba(96,165,250,0.06)' },
  disputada:    { label: 'Zona disputada',     color: '#facc15', border: 'rgba(250,204,21,0.25)',  bg: 'rgba(250,204,21,0.06)' },
  saturada:     { label: 'Zona saturada',      color: '#f87171', border: 'rgba(248,113,113,0.25)', bg: 'rgba(248,113,113,0.06)' },
  no_evaluable: { label: 'Sin área definida',  color: '#94a3b8', border: 'rgba(148,163,184,0.2)',  bg: 'rgba(148,163,184,0.05)' },
};

const CONFIANZA_DENSIDAD: Record<DensidadZona['confianza'], string> = {
  alta:  'Confianza alta',
  media: 'Confianza media',
  baja:  'Confianza baja',
};

function DensidadCard({ data }: { data: DensidadZona }) {
  const d = DENSIDAD_CFG[data.interpretacion] ?? DENSIDAD_CFG.no_evaluable;

  const num = (n: number | null, dec = 2) =>
    n === null || n === undefined || !Number.isFinite(n)
      ? '—'
      : n.toLocaleString('es-MX', { maximumFractionDigits: dec });

  const metricas: { label: string; val: string }[] = [
    { label: 'Competidores / km²', val: num(data.competidores_km2, 2) },
    { label: 'Área analizada',     val: data.area_km2 === null ? '—' : `${num(data.area_km2, 1)} km²` },
    { label: 'Distancia media',    val: data.distancia_media_km === null ? '—' : `${num(data.distancia_media_km, 1)} km` },
    {
      label: 'Origen del área',
      val: data.origen_area === 'area_declarada' ? 'Área declarada'
         : data.origen_area === 'radio'          ? 'Radio de cobertura'
         : 'No disponible',
    },
  ];

  return (
    <div className="reveal rounded-3xl border p-6 sm:p-8" style={{ borderColor: d.border, background: d.bg }}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 border" style={{ borderColor: d.border, background: 'rgba(255,255,255,0.04)', color: d.color }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a10 10 0 0 1 10 10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: d.color }}>
              Densidad de competencia
            </p>
            <h3 className="text-lg font-black text-white leading-tight">{d.label}</h3>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed break-words">{data.mensaje}</p>
          </div>
        </div>

        {data.es_evaluable && data.score !== null && (
          <div className="flex flex-col items-end flex-shrink-0">
            <span className="text-4xl font-black font-mono tabular-nums leading-none" style={{ color: d.color }}>
              {data.score}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/35 mt-1.5">
              {CONFIANZA_DENSIDAD[data.confianza]}
            </span>
          </div>
        )}
      </div>

      {data.es_evaluable ? (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metricas.map((m) => (
            <div key={m.label} className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-white/40 mb-1.5">{m.label}</dt>
              <dd className="text-sm font-black text-white/85 tabular-nums break-words">{m.val}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 flex gap-2.5">
          <svg className="w-4 h-4 text-white/50 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <p className="text-xs text-white/55 leading-snug">
            Este factor no entró en el score porque no hay un área de cobertura conocida.
            Define el radio de cobertura del producto y vuelve a analizar para medir cuántos
            competidores hay por km² en tu zona.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Estudio del área: rentar vs comprar ─────────────────────────────────────
// Espejo de EstudioAreaResult (backend/src/services/zona/types.ts). El bloque
// `renta` que viaja dentro es EL MISMO objeto que `renta_zona_data`, así que
// esta tarjeta NO repite las métricas de renta: solo aporta la comparación con
// el precio de compra. `sin_conclusion` = faltan datos o su confianza no
// aguanta; en ese caso se dice qué falta en vez de mostrar un veredicto vacío.

type VeredictoArea = 'rentar' | 'comprar' | 'equilibrado' | 'sin_conclusion';
type FuenteSuperficie = 'declarada' | 'modelo_operativo' | 'no_aplica';

interface EstudioArea {
  m2_totales: number | null;
  fuente_superficie: FuenteSuperficie;
  renta: RentaZona;
  renta_mensual: number | null;
  renta_anual: number | null;
  precio_venta_m2: number | null;
  valor_compra_estimado: number | null;
  yield_bruto_anual_pct: number | null;
  meses_renta_equivalentes: number | null;
  multiplo_precio_renta_anual: number | null;
  moneda: string | null;
  veredicto: VeredictoArea;
  nivel_confianza: 'alta' | 'media' | 'baja';
  advertencias: string[];
  supuestos: string[];
  nota: string;
}

const VEREDICTO_CFG: Record<VeredictoArea, { label: string; color: string; border: string; bg: string }> = {
  comprar:        { label: 'Comprar sale mejor que rentar', color: '#4ade80', border: 'rgba(74,222,128,0.25)',  bg: 'rgba(74,222,128,0.06)' },
  rentar:         { label: 'Rentar sale mejor que comprar', color: '#60a5fa', border: 'rgba(96,165,250,0.25)',  bg: 'rgba(96,165,250,0.06)' },
  equilibrado:    { label: 'Rentar y comprar en equilibrio', color: '#facc15', border: 'rgba(250,204,21,0.25)',  bg: 'rgba(250,204,21,0.06)' },
  sin_conclusion: { label: 'Sin conclusión: faltan datos',   color: '#94a3b8', border: 'rgba(148,163,184,0.2)',  bg: 'rgba(148,163,184,0.05)' },
};

const CONFIANZA_AREA: Record<EstudioArea['nivel_confianza'], string> = {
  alta:  'Confianza alta',
  media: 'Confianza media',
  baja:  'Confianza baja',
};

const FUENTE_SUPERFICIE_LABEL: Record<FuenteSuperficie, string> = {
  declarada:        'm² declarados por ti',
  modelo_operativo: 'm² estimados por modelo operativo',
  no_aplica:        'Operación sin local',
};

function EstudioAreaCard({ data }: { data: EstudioArea }) {
  const v = VEREDICTO_CFG[data.veredicto] ?? VEREDICTO_CFG.sin_conclusion;
  const moneda = data.moneda ? ` ${data.moneda}` : '';

  const num = (n: number | null | undefined, dec = 2) =>
    n === null || n === undefined || !Number.isFinite(n)
      ? '—'
      : n.toLocaleString('es-MX', { maximumFractionDigits: dec });

  const dinero = (n: number | null | undefined) =>
    n === null || n === undefined || !Number.isFinite(n) ? '—' : `${num(n, 0)}${moneda}`;

  const metricas: { label: string; val: string }[] = [
    { label: 'Valor de compra',    val: dinero(data.valor_compra_estimado) },
    { label: 'Venta por m²',       val: dinero(data.precio_venta_m2) },
    { label: 'Yield bruto anual',  val: data.yield_bruto_anual_pct === null ? '—' : `${num(data.yield_bruto_anual_pct, 2)} %` },
    { label: 'Meses de renta',     val: data.meses_renta_equivalentes === null ? '—' : num(data.meses_renta_equivalentes, 0) },
    { label: 'Múltiplo precio/renta', val: data.multiplo_precio_renta_anual === null ? '—' : `${num(data.multiplo_precio_renta_anual, 1)}×` },
    { label: 'Renta anual',        val: dinero(data.renta_anual) },
    { label: 'Superficie',         val: data.m2_totales === null ? '—' : `${num(data.m2_totales, 1)} m²` },
  ];

  const hayComparacion = data.veredicto !== 'sin_conclusion' && data.valor_compra_estimado !== null;

  return (
    <div className="reveal rounded-3xl border p-6 sm:p-8" style={{ borderColor: v.border, background: v.bg }}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 border" style={{ borderColor: v.border, background: 'rgba(255,255,255,0.04)', color: v.color }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect width="16" height="20" x="4" y="2" rx="2" />
              <path d="M9 22v-4h6v4" />
              <path d="M8 6h.01" />
              <path d="M16 6h.01" />
              <path d="M8 10h.01" />
              <path d="M16 10h.01" />
              <path d="M8 14h.01" />
              <path d="M16 14h.01" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: v.color }}>
              Estudio del área · rentar vs comprar
            </p>
            <h3 className="text-lg font-black text-white leading-tight">{v.label}</h3>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed break-words">{data.nota}</p>
          </div>
        </div>

        {hayComparacion && (
          <div className="flex flex-col items-end flex-shrink-0">
            <span className="text-3xl sm:text-4xl font-black font-mono tabular-nums leading-none break-all" style={{ color: v.color }}>
              {dinero(data.valor_compra_estimado)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/35 mt-1.5">
              comprar · {CONFIANZA_AREA[data.nivel_confianza]}
            </span>
          </div>
        )}
      </div>

      {hayComparacion ? (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {metricas.map((m) => (
              <div key={m.label} className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/40 mb-1.5">{m.label}</dt>
                <dd className="text-sm font-black text-white/85 tabular-nums break-words">{m.val}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 flex gap-2.5">
            <svg className="w-4 h-4 text-white/50 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/>
              <path d="m14.5 3.5 2 2"/>
              <path d="m11.5 6.5 2 2"/>
              <path d="m8.5 9.5 2 2"/>
              <path d="m5.5 12.5 2 2"/>
            </svg>
            <p className="text-xs text-white/55 leading-snug break-words">
              {FUENTE_SUPERFICIE_LABEL[data.fuente_superficie]}. Es aritmética bruta: no descuenta
              predial, mantenimiento, notariales ni el costo del crédito.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 flex gap-2.5">
          <svg className="w-4 h-4 text-white/50 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <p className="text-xs text-white/55 leading-snug">
            No comparamos rentar contra comprar sin fuentes: declara el precio de venta por m² de tu
            zona (tasación o anuncio de un local parecido) y vuelve a analizar.
          </p>
        </div>
      )}

      {data.advertencias.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.advertencias.map((a, i) => (
            <li key={i} className="text-xs text-yellow-200/85 bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-3.5 py-2.5 flex gap-2">
              <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className="leading-snug break-words">{a}</span>
            </li>
          ))}
        </ul>
      )}

      {data.supuestos.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-lg px-1 py-1">
            Supuestos usados ({data.supuestos.length})
          </summary>
          <ul className="mt-2.5 space-y-1.5">
            {data.supuestos.map((s, i) => (
              <li key={i} className="text-xs text-white/50 leading-snug flex gap-2 break-words">
                <span className="text-white/25 flex-shrink-0" aria-hidden="true">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Renta del local (m² × precio por m²) ────────────────────────────────────

type OrigenRenta = 'declarada' | 'derivada_m2' | 'sin_local' | 'no_disponible';

interface RentaZona {
  renta_mensual: number | null;
  origen: OrigenRenta;
  m2_totales: number | null;
  precio_m2_mes: number | null;
  moneda: string | null;
  renta_estimada_m2: number | null;
  nivel_confianza: 'alta' | 'media' | 'baja';
  advertencias: string[];
  nota: string;
}

const RENTA_CFG: Record<OrigenRenta, { label: string; color: string; border: string; bg: string }> = {
  declarada:     { label: 'Renta declarada por ti', color: '#4ade80', border: 'rgba(74,222,128,0.25)',  bg: 'rgba(74,222,128,0.06)' },
  derivada_m2:   { label: 'Renta estimada por m²',  color: '#60a5fa', border: 'rgba(96,165,250,0.25)',  bg: 'rgba(96,165,250,0.06)' },
  sin_local:     { label: 'Operación sin local',    color: '#94a3b8', border: 'rgba(148,163,184,0.2)',  bg: 'rgba(148,163,184,0.05)' },
  no_disponible: { label: 'Falta el precio por m²', color: '#facc15', border: 'rgba(250,204,21,0.25)',  bg: 'rgba(250,204,21,0.06)' },
};

const CONFIANZA_RENTA: Record<RentaZona['nivel_confianza'], string> = {
  alta:  'Confianza alta',
  media: 'Confianza media',
  baja:  'Confianza baja',
};

function RentaZonaCard({ data }: { data: RentaZona }) {
  const r = RENTA_CFG[data.origen] ?? RENTA_CFG.no_disponible;
  const moneda = data.moneda ? ` ${data.moneda}` : '';

  const num = (n: number | null | undefined, dec = 2) =>
    n === null || n === undefined || !Number.isFinite(n)
      ? '—'
      : n.toLocaleString('es-MX', { maximumFractionDigits: dec });

  const dinero = (n: number | null | undefined) =>
    n === null || n === undefined || !Number.isFinite(n) ? '—' : `${num(n, 0)}${moneda}`;

  const metricas: { label: string; val: string }[] = [
    { label: 'Renta mensual',   val: dinero(data.renta_mensual) },
    { label: 'Superficie',      val: data.m2_totales === null ? '—' : `${num(data.m2_totales, 1)} m²` },
    { label: 'Precio por m²',   val: dinero(data.precio_m2_mes) },
    { label: 'Modelo por m²',   val: dinero(data.renta_estimada_m2) },
  ];

  return (
    <div className="reveal rounded-3xl border p-6 sm:p-8" style={{ borderColor: r.border, background: r.bg }}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 border" style={{ borderColor: r.border, background: 'rgba(255,255,255,0.04)', color: r.color }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
              <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
              <path d="M10 9H8"/>
              <path d="M16 13H8"/>
              <path d="M16 17H8"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: r.color }}>
              Renta del local
            </p>
            <h3 className="text-lg font-black text-white leading-tight">{r.label}</h3>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed break-words">{data.nota}</p>
          </div>
        </div>

        {data.renta_mensual !== null && (
          <div className="flex flex-col items-end flex-shrink-0">
            <span className="text-3xl sm:text-4xl font-black font-mono tabular-nums leading-none break-all" style={{ color: r.color }}>
              {dinero(data.renta_mensual)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/35 mt-1.5">
              al mes · {CONFIANZA_RENTA[data.nivel_confianza]}
            </span>
          </div>
        )}
      </div>

      {data.origen === 'sin_local' ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 flex gap-2.5">
          <svg className="w-4 h-4 text-white/50 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <p className="text-xs text-white/55 leading-snug">
            Declaraste operar sin local físico, así que la renta de local no entra en tus costos fijos.
          </p>
        </div>
      ) : data.origen === 'no_disponible' ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 flex gap-2.5">
          <svg className="w-4 h-4 text-white/50 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <p className="text-xs text-white/55 leading-snug">
            No inventamos una renta: falta el precio de renta por m² de tu zona. Declara el precio que
            te cotizaron y vuelve a analizar para convertir los m² en renta mensual.
          </p>
        </div>
      ) : (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metricas.map((m) => (
            <div key={m.label} className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-white/40 mb-1.5">{m.label}</dt>
              <dd className="text-sm font-black text-white/85 tabular-nums break-words">{m.val}</dd>
            </div>
          ))}
        </dl>
      )}

      {data.advertencias.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.advertencias.map((a, i) => (
            <li key={i} className="text-xs text-yellow-200/85 bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-3.5 py-2.5 flex gap-2">
              <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className="leading-snug break-words">{a}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── DAFO Card ────────────────────────────────────────────────────────────────

function DafoCard({ titulo, items, borderColor, iconColor, icon }: {
  titulo: string; items: DafoItem[]; borderColor: string; iconColor: string; icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ borderColor, background: 'rgba(255,255,255,0.018)' }}>
      <div className="flex items-center gap-2.5 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0" style={{ color: iconColor, background: `${iconColor}15` }}>{icon}</span>
        <p className="font-black text-sm uppercase tracking-wide" style={{ color: iconColor }}>{titulo}</p>
      </div>
      <ul className="space-y-3 flex-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 text-xs flex-shrink-0" style={{ color: iconColor }}>▸</span>
            <div>
              <p className="text-[13px] font-bold text-white leading-snug">{item.titulo}</p>
              {item.descripcion && <p className="text-[12px] text-white/55 mt-1 leading-relaxed">{item.descripcion}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Radar de Competencia ─────────────────────────────────────────────────────

function seededRand(seed: number, index: number): number {
  const s = (seed * 1664525 + 1013904223 + index * 22695477) >>> 0;
  return ((s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
}

function CompetenciaMap({ total }: { total: number }) {
  const container = useRef<HTMLDivElement>(null);
  const dotsCount = Math.min(total, 15);
  const dots = Array.from({ length: dotsCount }, (_, i) => ({
    x: 10 + seededRand(total, i * 2) * 80,
    y: 10 + seededRand(total, i * 2 + 1) * 80,
  }));

  useGSAP(() => {
    gsap.fromTo('.competitor-dot', { scale: 0, opacity: 0 }, {
      scale: 1, opacity: 1, duration: 0.6, stagger: 0.05, ease: 'back.out(1.5)',
      scrollTrigger: { trigger: container.current, start: 'top 80%', once: true }
    });
  }, { scope: container });

  return (
    <div ref={container} className="relative w-full rounded-xl overflow-hidden border border-brand-primary/15" style={{ height: 180, backgroundColor: '#060c13' }}>
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: `linear-gradient(to right,#3b82f6 1px,transparent 1px),linear-gradient(to bottom,#3b82f6 1px,transparent 1px)`, backgroundSize: '25px 25px' }} />
      <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-gradient-to-r from-transparent to-brand-primary/40 origin-left animate-[spin_4s_linear_infinite]" style={{ transform: 'translateY(-50%)' }} />
      <div className="absolute rounded-full border border-brand-primary/15 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] aspect-square" />
      <div className="absolute rounded-full border border-brand-primary/8 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75%] aspect-square" />
      {dots.map((dot, i) => (
        <div key={i} className="competitor-dot absolute w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)] border border-[#060c13] z-10"
          style={{ left: `calc(${dot.x}% - 5px)`, top: `calc(${dot.y}% - 5px)` }} />
      ))}
      <div className="absolute z-20" style={{ left: 'calc(50% - 8px)', top: 'calc(50% - 8px)' }}>
        <div className="relative w-4 h-4 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-brand-accent animate-ping opacity-50" />
          <div className="relative w-3 h-3 rounded-full bg-brand-accent border border-white shadow-[0_0_10px_rgba(231,76,60,0.8)]" />
        </div>
      </div>
      <div className="absolute bottom-2 right-2 bg-black/60 text-[9px] text-white/60 px-2 py-0.5 rounded font-mono border border-white/8">RADAR</div>
      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded border border-white/8">
        <div className="w-2 h-2 rounded-full bg-brand-accent" />
        <span className="text-[10px] font-bold text-white">Tu negocio</span>
      </div>
    </div>
  );
}

// ─── Price Bar (GSAP) ─────────────────────────────────────────────────────────

function PriceBar({ userPrice, marketAvg, pais }: { userPrice: number | null; marketAvg: number; pais?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const userBar   = useRef<HTMLDivElement>(null);
  const mktBar    = useRef<HTMLDivElement>(null);

  // La guarda NO puede ir antes de los hooks: si `userPrice` pasara de null a
  // un valor con el componente ya montado, cambiaría el número de hooks
  // ejecutados y React lanzaría error. Se evalúa como bandera y el early return
  // se hace DESPUÉS de useGSAP.
  const visible = userPrice !== null && userPrice > 0 && marketAvg > 0;
  const precio  = userPrice ?? 0;

  const max     = visible ? Math.max(precio, marketAvg) * 1.3 : 0;
  const userPct = max > 0 ? (precio / max) * 100 : 0;
  const mktPct  = max > 0 ? (marketAvg / max) * 100 : 0;
  const diffPct = marketAvg > 0 ? Math.round(((precio - marketAvg) / marketAvg) * 100) : 0;

  // La divisa sale del país del análisis (AnalisisMercado.pais). Si falta o es
  // desconocido, getTaxConfig cae a MX — idéntico al comportamiento anterior.
  const { moneda, simbolo, locale } = getTaxConfig(pais ?? 'MX');
  const fmtPrecio = (n: number) => `${simbolo}${n.toLocaleString(locale, { maximumFractionDigits: 0 })}`;

  useGSAP(() => {
    if (!visible) return;
    const tl = gsap.timeline({ scrollTrigger: { trigger: container.current, start: 'top 85%', once: true } });
    tl.fromTo(userBar.current, { width: '0%' }, { width: `${userPct}%`, duration: 1.5, ease: 'elastic.out(1,0.7)' })
      .fromTo(mktBar.current, { width: '0%' }, { width: `${mktPct}%`, duration: 1.5, ease: 'elastic.out(1,0.7)' }, '-=1.2');
  }, { scope: container, dependencies: [visible, userPct, mktPct] });

  if (!visible) return null;

  return (
    <div ref={container} className="rounded-2xl border border-white/8 p-6" style={{ background: 'rgba(255,255,255,0.015)' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="12" y2="22"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <p className="font-black text-white text-base">Análisis de precio</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
          diffPct > 0 ? 'text-orange-300 bg-orange-500/10 border-orange-500/25'
          : diffPct < 0 ? 'text-green-300 bg-green-500/10 border-green-500/25'
          : 'text-blue-300 bg-blue-500/10 border-blue-500/25'
        }`}>
          {diffPct > 0 ? `+${diffPct}% sobre el mercado` : diffPct < 0 ? `${Math.abs(diffPct)}% por debajo` : 'En el promedio'}
        </span>
      </div>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-end mb-1.5">
            <span className="text-xs text-white/40 font-medium">Tu precio</span>
            <span className="font-black text-white">{fmtPrecio(precio)} <span className="text-[10px] text-white/30 font-normal">{moneda}</span></span>
          </div>
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
            <div ref={userBar} className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-accent shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
          </div>
        </div>
        <div>
          <div className="flex justify-between items-end mb-1.5">
            <span className="text-xs text-white/40 font-medium">Precio promedio del mercado</span>
            <span className="font-bold text-white/70">{fmtPrecio(marketAvg)} <span className="text-[10px] text-white/30 font-normal">{moneda}</span></span>
          </div>
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
            <div ref={mktBar} className="h-full rounded-full bg-white/25" />
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-white/55 leading-relaxed">
        {diffPct > 0 ? `Tu precio está ${diffPct}% por encima del promedio. Justífica con mejor calidad, marca o un nicho bien definido.`
          : diffPct < 0 ? `Tu precio está ${Math.abs(diffPct)}% por debajo del promedio. Tienes ventaja competitiva — cuida que el margen cubra tus costos.`
          : 'Tu precio está en el promedio del mercado. Compite por valor, no por precio.'}
      </p>
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-5 h-5 rounded-full border border-white/20 text-white/35 text-[10px] font-black flex items-center justify-center hover:border-white/50 hover:text-white/70 transition-all leading-none"
        aria-label="Más información"
      >?</button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-7 z-50 w-64 bg-[#0d1c2e] border border-white/12 rounded-xl px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)] pointer-events-none">
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[#0d1c2e] border-r border-b border-white/12" />
          <p className="text-[12px] text-white/70 leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}

function IconBrain() {
  return (
    <svg className="w-4 h-4 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
      <path d="M12 5v13"/>
      <path d="m15 9-3 3-3-3"/>
    </svg>
  );
}

function IconTrendingUp() {
  return (
    <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  );
}

function IconCrosshair() {
  return (
    <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="22" y1="12" x2="18" y2="12"/>
      <line x1="6" y1="12" x2="2" y2="12"/>
      <line x1="12" y1="6" x2="12" y2="2"/>
      <line x1="12" y1="22" x2="12" y2="18"/>
    </svg>
  );
}

function IconTarget() {
  return (
    <svg className="w-4 h-4 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, tag, tooltip, className = 'mb-5' }: { icon: React.ReactNode; title: string; tag?: string; tooltip?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white/70 flex-shrink-0" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
        {icon}
      </div>
      <h2 className="text-base font-black text-white tracking-tight">{title}</h2>
      {tooltip && <Tooltip text={tooltip} />}
      {tag && (
        <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-white/30 border border-white/8 px-2.5 py-1 rounded-full">{tag}</span>
      )}
    </div>
  );
}

// ─── Tipos de Pestaña ────────────────────────────────────────────────────────
type MercadoTab = 'resumen' | 'competencia' | 'tendencias' | 'dafo' | 'completo';

// ─── Normalizadores de Mercado ──────────────────────────────────────────────

function normalizeViabilidadFactores(raw: unknown): Factores {
  const result: Record<string, number> = {
    tendencia: 0,
    competencia: 0,
    margen: 0,
    demanda: 0,
    oportunidad: 0,
  };
  if (!raw || typeof raw !== 'object') return result as unknown as Factores;

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      result[k] = v;
    } else if (v && typeof v === 'object' && 'score' in v && typeof (v as { score: unknown }).score === 'number') {
      result[k] = (v as { score: number }).score;
    }
  }
  return result as unknown as Factores;
}

function normalizeTendencias(raw: unknown) {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const vol = Number(r.volumen_busquedas_mensual ?? r.volumen_mensual ?? 0);
  const crecPct = Number(r.crecimiento_porcentaje ?? r.tendencia_12m ?? 0);
  const tend = String(r.tendencia || (crecPct > 5 ? 'Creciente' : crecPct < -5 ? 'Decreciente' : 'Estable'));
  const crecDesc = String(r.crecimiento_descripcion || `${crecPct >= 0 ? '+' : ''}${crecPct}% en los últimos 12 meses`);

  let datos12: { mes: string; volumen: number }[] = [];
  if (Array.isArray(r.datos_12_meses) && r.datos_12_meses.length > 0) {
    datos12 = r.datos_12_meses.map((d: Record<string, unknown>) => ({
      mes: String(d?.mes ?? ''),
      volumen: Number(d?.volumen ?? 0),
    }));
  } else if (Array.isArray(r.estacionalidad) && r.estacionalidad.length > 0) {
    datos12 = r.estacionalidad.map((d: Record<string, unknown>) => ({
      mes: String(d?.mes ?? ''),
      volumen: Number(d?.volumen ?? 0),
    }));
  }

  return {
    volumen_busquedas_mensual: vol,
    crecimiento_porcentaje: crecPct,
    tendencia: tend,
    crecimiento_descripcion: crecDesc,
    datos_12_meses: datos12,
  };
}

function normalizeCompetencia(raw: unknown, precioUsuario?: number) {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawList = Array.isArray(r.competidores) && r.competidores.length > 0
    ? r.competidores
    : Array.isArray(r.competidores_principales)
    ? r.competidores_principales
    : [];

  const competidores: Competidor[] = (rawList as Record<string, unknown>[]).map((c, i) => ({
    ranking: Number(c?.ranking ?? i + 1),
    nombre: String(c?.nombre ?? c?.name ?? `Competidor ${i + 1}`),
    url: c?.url ? String(c.url) : undefined,
    precio_promedio: Number(c?.precio_promedio ?? c?.precio ?? 0),
    precio_minimo: c?.precio_minimo !== undefined ? Number(c.precio_minimo) : undefined,
    precio_maximo: c?.precio_maximo !== undefined ? Number(c.precio_maximo) : undefined,
    rating: Number(c?.rating ?? 4.0),
    numero_resenas: Number(c?.numero_resenas ?? c?.resenas ?? 0),
    ubicacion: String(c?.ubicacion ?? c?.zona ?? 'Local / Nacional'),
    fuente: String(c?.fuente ?? 'benchmark_sector'),
    fortalezas: Array.isArray(c?.fortalezas) ? (c.fortalezas as string[]) : undefined,
    debilidades: Array.isArray(c?.debilidades) ? (c.debilidades as string[]) : undefined,
  }));

  const total = Number(r.total_competidores ?? competidores.length);
  const rangoPrecios = r.rango_precios as { promedio?: number } | undefined;
  const avgP = Number(r.precio_mercado_promedio ?? rangoPrecios?.promedio ?? (
    competidores.length > 0
      ? Math.round(competidores.reduce((acc, c) => acc + (c.precio_promedio || 0), 0) / competidores.length)
      : (precioUsuario || 0)
  ));

  return {
    total_competidores: total,
    gap_detectado: (r.gap_detectado as string | null) ?? null,
    competidores,
    precio_mercado_promedio: avgP,
  };
}

function normalizeDafoList(list: unknown): DafoItem[] {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (typeof item === 'string') {
      return { titulo: item, descripcion: '' };
    }
    if (item && typeof item === 'object') {
      const it = item as Record<string, unknown>;
      return {
        titulo: String(it.titulo || it.nombre || it.title || it.name || ''),
        descripcion: String(it.descripcion || it.desc || it.detalle || ''),
        impacto: typeof it.impacto === 'string' ? it.impacto : undefined,
        probabilidad: typeof it.probabilidad === 'string' ? it.probabilidad : undefined,
        potencial: typeof it.potencial === 'string' ? it.potencial : undefined,
        mitigacion: typeof it.mitigacion === 'string' ? it.mitigacion : undefined,
        apalancamiento: typeof it.apalancamiento === 'string' ? it.apalancamiento : undefined,
        accion: typeof it.accion === 'string' ? it.accion : undefined,
      };
    }
    return { titulo: String(item ?? ''), descripcion: '' };
  }).filter(i => i.titulo.trim().length > 0);
}

function normalizeDafo(raw: unknown) {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    fortalezas: normalizeDafoList(r.fortalezas),
    debilidades: normalizeDafoList(r.debilidades),
    oportunidades: normalizeDafoList(r.oportunidades),
    amenazas: normalizeDafoList(r.amenazas),
  };
}

function normalizeTam(raw: unknown, pais?: string, precioUsuario?: number) {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tamTotal = Number(r.tam ?? r.tam_promedio ?? 0);
  const samTotal = Number(r.sam ?? Math.round(tamTotal * 0.15));
  const somTotal = Number(r.som ?? Math.round(samTotal * 0.05));

  const tamMensual = Math.round(tamTotal / 12);
  const samMensual = Math.round(samTotal / 12);
  const somMensual = Math.round(somTotal / 12);

  const price = precioUsuario && precioUsuario > 0 ? precioUsuario : 500;

  const rawEsc = r.tam_escenarios as { pesimista?: TamEsc; realista?: TamEsc; optimista?: TamEsc } | undefined;
  const pesimista: TamEsc = rawEsc?.pesimista ?? {
    penetracion: 0.5,
    mercado_anual: Math.round(somTotal * 0.7),
    mercado_mensual: Math.round(somMensual * 0.7),
    unidades_mes: Math.max(1, Math.round((somMensual * 0.7) / price)),
    ganancia_mes: Math.round(somMensual * 0.7),
  };
  const realista: TamEsc = rawEsc?.realista ?? {
    penetracion: 1.0,
    mercado_anual: somTotal,
    mercado_mensual: somMensual,
    unidades_mes: Math.max(1, Math.round(somMensual / price)),
    ganancia_mes: somMensual,
  };
  const optimista: TamEsc = rawEsc?.optimista ?? {
    penetracion: 2.0,
    mercado_anual: Math.round(somTotal * 1.5),
    mercado_mensual: Math.round(somMensual * 1.5),
    unidades_mes: Math.max(1, Math.round((somMensual * 1.5) / price)),
    ganancia_mes: Math.round(somMensual * 1.5),
  };

  let estacionalidad: MesEstacional[] = [];
  if (Array.isArray(r.estacionalidad) && r.estacionalidad.length > 0) {
    estacionalidad = r.estacionalidad as MesEstacional[];
  } else {
    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    estacionalidad = MESES.map((m, idx) => {
      const factor = [1.0, 0.95, 1.05, 1.1, 1.15, 1.0, 1.05, 0.9, 1.1, 1.2, 1.35, 1.4][idx] ?? 1.0;
      return {
        mes: m,
        factor,
        razon: factor >= 1.2 ? 'Temporada alta del sector' : factor < 1.0 ? 'Mes con menor actividad comercial' : 'Comportamiento habitual de demanda',
      };
    });
  }

  return {
    ubicacion: String(r.ubicacion || pais || 'Nacional'),
    tam_promedio: tamTotal,
    tam_escenarios: { pesimista, realista, optimista },
    nse_aplicado: r.nse_aplicado ? String(r.nse_aplicado) : 'AB/C+',
    pct_mercado_nse: r.pct_mercado_nse ? Number(r.pct_mercado_nse) : 32,
    estacionalidad,
  };
}

function normalizeReporteBi(
  raw: unknown,
  analisis: Analisis,
  comp: ReturnType<typeof normalizeCompetencia>,
  tend: ReturnType<typeof normalizeTendencias>,
  tam: ReturnType<typeof normalizeTam>,
): ReporteBiData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const alertasIa: { color: 'Rojo' | 'Amarillo' | 'Verde'; mensaje: string }[] = [];

  if (Array.isArray(r.alertas_ia) && r.alertas_ia.length > 0) {
    for (const a of r.alertas_ia as Record<string, unknown>[]) {
      const c = String(a?.color ?? '');
      alertasIa.push({
        color: c === 'Rojo' || c === 'Amarillo' || c === 'Verde' ? (c as 'Rojo' | 'Amarillo' | 'Verde') : 'Amarillo',
        mensaje: String(a?.mensaje || ''),
      });
    }
  } else if (Array.isArray(analisis.alertas) && analisis.alertas.length > 0) {
    for (const a of analisis.alertas) {
      const col = a.tipo === 'riesgo' || a.nivel === 'rojo' ? 'Rojo' : a.tipo === 'atencion' || a.nivel === 'amarillo' ? 'Amarillo' : 'Verde';
      alertasIa.push({
        color: col,
        mensaje: String(a.mensaje || a.tipo || ''),
      });
    }
  }

  const score = Number(r.score_viabilidad ?? analisis.viabilidad_score ?? 75);
  const dir = tend.tendencia === 'Creciente' ? 'Creciente' : tend.tendencia === 'Decreciente' ? 'Decreciente' : 'Estable';
  const precioFmt = comp.precio_mercado_promedio > 0 ? `$${comp.precio_mercado_promedio.toLocaleString('es-MX')}` : 'competitivo';

  const rawAm = (r.analisis_mercado && typeof r.analisis_mercado === 'object' ? r.analisis_mercado : {}) as Record<string, unknown>;

  return {
    resumen_ejecutivo: String(
      r.resumen_ejecutivo ||
      (analisis as unknown as Record<string, unknown>).resumen_ejecutivo ||
      `El análisis del mercado identifica ${comp.total_competidores} competidores en tu categoría con una tendencia ${dir.toLowerCase()} y una demanda mensual estimada de ${tend.volumen_busquedas_mensual.toLocaleString()} búsquedas. El score de viabilidad de ${score}/100 sitúa tu proyecto en una posición favorable con oportunidades claras de diferenciación.`
    ),
    grafica_tendencias: dir,
    score_viabilidad: score,
    mapa_competencia: String(r.mapa_competencia || `${comp.total_competidores} competidores analizados en el área`),
    alertas_ia: alertasIa,
    analisis_mercado: {
      validacion_precio: String(rawAm.validacion_precio || `Precio promedio de mercado en ${precioFmt}`),
      gap_oportunidad: String(rawAm.gap_oportunidad || comp.gap_detectado || 'Oportunidad de posicionarse por calidad superior y experiencia de cliente'),
      analisis_dafo_dinamico: String(rawAm.analisis_dafo_dinamico || 'Apalancar las fortalezas clave de la propuesta para contrarrestar la saturación de competidores genéricos.'),
      cruce_inversion_tam: String(rawAm.cruce_inversion_tam || `Mercado accesible anual (SAM) proyectado con espacio para captura sostenida.`),
      proximos_pasos: Array.isArray(rawAm.proximos_pasos) && rawAm.proximos_pasos.length > 0
        ? (rawAm.proximos_pasos as string[])
        : [
            'Diferenciar tu oferta de valor enfatizando los atributos más débiles de tus competidores directos.',
            'Alinear el precio de lanzamiento contra el promedio del mercado para optimizar conversión.',
            'Preparar campañas de adquisición en los meses pico señalados por la estacionalidad.',
          ],
    },
    es_mock: Boolean(r.es_mock ?? false),
  };
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ResultadoMercadoPage() {
  const { productoId, analisisId } = useParams<{ productoId: string; analisisId: string }>();
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [activeTab, setActiveTab] = useState<MercadoTab>('resumen');
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainRef      = useRef<HTMLDivElement>(null);
  const isPreloaded  = useRef(false);

  // Carga inmediata en mount para análisis ya existentes (evita esperar polling/SSE)
  useEffect(() => {
    if (!analisisId) return;
    // Abrir otro análisis reutiliza el componente: descarta la respuesta del
    // anterior si llega tarde, para no mostrar un análisis bajo otro id.
    let vigente = true;
    api.get(`/mercado/${analisisId}`)
      .then(({ data: full }) => {
        if (!vigente) return;
        if (full && full.estado_analisis === 'completado') {
          isPreloaded.current = true;
          setAnalisis(full);
        }
      })
      .catch(() => {});
    return () => { vigente = false; };
  }, [analisisId]);

  // Loader: 700 ms si ya estaba precargado, 4500 ms si se está procesando activamente
  const { showLoader, loaderDone } = useAnalysisLoaderGate(
    !!analisis && analisis.estado_analisis !== 'procesando',
    isPreloaded.current ? 700 : 4500
  );

  useEffect(() => {
    stepTimerRef.current = setInterval(() => setActiveStep(p => (p + 1) % LOADING_STEPS.length), 3500);
    return () => clearInterval(stepTimerRef.current!);
  }, []);

  useAnalysisEvents(analisisId, `/mercado/${analisisId}/status`, (event) => {
    if (event.estado === 'completado') {
      clearInterval(stepTimerRef.current!);
      // Sin .catch, un fallo aquí deja la pantalla en el loader para siempre.
      api.get(`/mercado/${analisisId}`)
        .then(({ data: full }) => setAnalisis(full))
        .catch(() => setErrorMessage('No se pudo cargar el análisis. Recarga la página para intentarlo de nuevo.'));
    } else if (event.estado === 'error') {
      clearInterval(stepTimerRef.current!);
      setErrorMessage(event.errorMessage ?? 'Error en el análisis');
    }
  });

  // Plan de la cuenta (mismo patrón que finanzas/resultado): se lee una vez, el
  // gate visual no necesita refrescarse en vivo.
  const [userPlan] = useState<string>(() => {
    try {
      const u = localStorage.getItem('usuario');
      return u ? JSON.parse(u).plan || 'freemium' : 'freemium';
    } catch {
      return 'freemium';
    }
  });

  useGSAP(() => {
    if (!analisis || showLoader) return;
    gsap.fromTo('.reveal', { y: 25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' });
  }, { scope: mainRef, dependencies: [analisis, showLoader, activeTab] });

  // El error se evalúa ANTES del loader: en fallo `analisis` sigue null y el
  // loader lo habría capturado, dejando la pantalla cargando para siempre.
  if (errorMessage || analisis?.estado_analisis === 'error') {
    return (
      <AnalysisError
        modulo="mercado"
        title="Fallo en el análisis de mercado"
        message={errorMessage ?? analisis?.error_mensaje}
        retryHref={`/dashboard/mercado/${productoId}`}
        retryLabel="Reintentar"
      />
    );
  }

  // `|| !analisis` mantiene el estrechamiento de tipos: abajo se accede a
  // analisis.* sin optional chaining.
  if (showLoader || !analisis) {
    return (
      <AnalysisLoader
        modulo="mercado"
        steps={MERCADO_LOADER_STEPS}
        currentStep={activeStep}
        title="Analizando tu mercado"
        subtitle="Escaneando competencia real y oportunidades de tu categoría"
        footnote="Esto tomará unos minutos. Te enviaremos un correo al finalizar."
        done={loaderDone}
      />
    );
  }

  const viabilidad_score = analisis.viabilidad_score ?? 0;
  const viabilidad_estado = analisis.viabilidad_estado ?? 'MODERADO';
  const viabilidad_factores = normalizeViabilidadFactores(analisis.viabilidad_factores);
  const tendencias_data = normalizeTendencias(analisis.tendencias_data);
  const competencia_data = normalizeCompetencia(analisis.competencia_data, analisis.precio_usuario);
  const dafo_data = normalizeDafo(analisis.dafo_data);
  const tam_data = normalizeTam(analisis.tam_data, analisis.pais, analisis.precio_usuario);
  const reporte_bi_data = normalizeReporteBi(analisis.reporte_bi_data, analisis, competencia_data, tendencias_data, tam_data);
  const densidad_data = analisis.densidad_data ?? null;
  const renta_zona_data = analisis.renta_zona_data ?? null;
  const estudio_area_data = analisis.estudio_area_data ?? null;
  const precio_usuario = analisis.precio_usuario;
  const confianza_analisis = analisis.confianza_analisis;

  // El contenido de estas secciones ya no viaja del backend en freemium: aquí
  // solo decidimos qué silueta borrosa se pinta en su lugar. Los placeholders
  // son decorativos (LockedSection los marca aria-hidden), nunca datos reales.
  const bloqueadas = seccionesBloqueadasDe(userPlan, 'mercado', analisis.secciones_bloqueadas);
  const tapada = (clave: SeccionBloqueable) => bloqueadas.has(clave);

  const cfg      = SCORE_CFG[viabilidad_estado] ?? SCORE_CFG.MODERADO;
  const userPrice = precio_usuario ?? null;
  const accionInfo = SCORE_ACCIONES[viabilidad_estado];

  return (
    <div ref={mainRef} className="px-4 sm:px-6 py-8 max-w-5xl mx-auto pb-24 relative">

      {/* Ambient glows */}
      <div className="fixed top-0 right-[-10%] w-[55vh] h-[55vh] bg-brand-primary/12 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-0 left-[-5%] w-[40vh] h-[40vh] bg-rose-500/8 rounded-full blur-[100px] pointer-events-none" />

      {/* ── Breadcrumb ── */}
      <div className="reveal flex items-center justify-between mb-8 text-sm" data-print="hide">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-white/30 hover:text-white transition-colors">Dashboard</Link>
          <span className="text-white/15">›</span>
          <Link href={`/dashboard/mercado/${productoId}`} className="text-white/30 hover:text-white transition-colors">Mercado</Link>
          <span className="text-white/15">›</span>
          <span className="text-white/60">Resultado</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-brand-primary/10 text-brand-primary/80 border border-brand-primary/20 px-3 py-1.5 rounded-full hidden sm:inline-flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-brand-primary/80 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {analisis.scope}
          </span>
          <button onClick={() => window.print()}
            className="text-[11px] font-bold border border-white/8 text-white/40 px-3 py-1.5 rounded-xl hover:border-white/20 hover:text-white/60 transition-all">
            PDF
          </button>
        </div>
      </div>

      {/* ── Tabs Quiet Luxury Navigation ── */}
      <div className="reveal sticky top-4 z-30 mb-8" data-print="hide">
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#08101a]/85 border border-white/10 backdrop-blur-xl shadow-2xl overflow-x-auto scrollbar-none">
          {[
            { id: 'resumen' as const, label: 'Resumen & Score', icon: <IconBrain /> },
            { id: 'competencia' as const, label: 'Competencia & Precios', icon: <IconTarget />, badge: competencia_data?.total_competidores },
            { id: 'tendencias' as const, label: 'Demanda & Tendencias', icon: <IconTrendingUp /> },
            { id: 'dafo' as const, label: 'Estrategia DAFO & TAM', icon: <IconGlobe /> },
            { id: 'completo' as const, label: 'Vista Completa', icon: <IconSearch /> },
          ].map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'text-white bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.08)] border border-white/15'
                    : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <span className={isActive ? 'text-brand-primary' : 'text-white/40'}>{t.icon}</span>
                <span>{t.label}</span>
                {t.badge !== undefined && t.badge > 0 && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold leading-none ${
                    isActive ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/30' : 'bg-white/5 text-white/40 border border-white/8'
                  }`}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">

        {/* ══ TAB 1: RESUMEN & SCORE ══ */}
        {(activeTab === 'resumen' || activeTab === 'completo') && (
          <>
        {/* ── HERO: Score ── */}
        <div className="reveal rounded-3xl overflow-hidden" style={{ background: `linear-gradient(135deg,#08111c 0%,#0a1420 60%,#080e18 100%)`, border: `1px solid ${cfg.border}`, boxShadow: `0 0 60px ${cfg.glow}` }}>
          {/* Top accent line */}
          <div className="h-[2px]" style={{ background: `linear-gradient(90deg,transparent,${cfg.color},transparent)` }} />

          <div className="p-8 sm:p-10">
            {/* Header row */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35 mb-1">Análisis de Mercado · IA</p>
                <h1 className="text-2xl font-black text-white tracking-tight">Estudio de Viabilidad</h1>
                <p className="text-xs text-white/45 mt-1.5 max-w-xs leading-relaxed">Score calculado con datos reales de competencia, tendencias, precio y tamaño de mercado.</p>
              </div>
              {confianza_analisis && (
                <div className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border ${
                  confianza_analisis === 'alta'  ? 'text-green-300 bg-green-500/10 border-green-500/20'
                  : confianza_analisis === 'media' ? 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20'
                  : 'text-white/30 bg-white/5 border-white/10'
                }`}>
                  {confianza_analisis === 'alta' ? 'Alta precisión' : confianza_analisis === 'media' ? 'Media precisión' : 'Estimado'}
                </div>
              )}
            </div>

            {/* Score + Factors */}
            <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
              {/* Big score ring */}
              <div className="flex-shrink-0">
                <CircularScore score={viabilidad_score} estado={viabilidad_estado} />
              </div>

              {/* Factor bars */}
              {viabilidad_factores && (
                <div className="flex-1 w-full space-y-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-4">Factores evaluados</p>
                  {Object.entries(viabilidad_factores)
                    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
                    .map(([k, v]) => (
                      <FactorBar key={k} label={k} value={v as number} />
                    ))}
                </div>
              )}

              {/* Gap + factores */}
              {competencia_data && (
                <div className="flex-1 w-full space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-4">Indicadores de mercado</p>

                  {/* Gap */}
                  {competencia_data.gap_detectado ? (
                    <div className="bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-3 flex gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-green-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-green-400 uppercase tracking-wide mb-1">Oportunidad detectada</p>
                        <p className="text-xs text-green-200/90 leading-snug">{competencia_data.gap_detectado}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3 flex gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"/>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                      </div>
                      <p className="text-xs text-white/55">Sin gap claro identificado en este análisis.</p>
                    </div>
                  )}

                  {/* Factores + / - */}
                  {(analisis.factores_positivos?.length || analisis.factores_negativos?.length) ? (
                    <div className="grid grid-cols-1 gap-2">
                      {analisis.factores_positivos?.slice(0, 2).map((f, i) => (
                        <div key={i} className="text-[11px] text-green-300 bg-green-500/8 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-1.5">
                          <span className="font-black text-green-400">+</span>{f}
                        </div>
                      ))}
                      {analisis.factores_negativos?.slice(0, 2).map((f, i) => (
                        <div key={i} className="text-[11px] text-red-300 bg-red-500/8 border border-red-500/15 rounded-lg px-3 py-2 flex items-center gap-1.5">
                          <span className="font-black text-red-400">−</span>{f}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Densidad de zona ── */}
        {densidad_data && <DensidadCard data={densidad_data} />}

        {/* ── Renta del local ── */}
        {renta_zona_data && <RentaZonaCard data={renta_zona_data} />}

        {/* ── Estudio del área: rentar vs comprar ── */}
        {estudio_area_data && estudio_area_data.fuente_superficie !== 'no_aplica' && (
          <EstudioAreaCard data={estudio_area_data} />
        )}

        {/* ── Qué hacer con este resultado ── */}
        {accionInfo && (
          <div className="reveal rounded-3xl border border-white/8 p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.015)' }}>
            <div className="flex items-start gap-4 mb-5">
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: cfg.color }}>
                  ¿Qué significa este resultado?
                </p>
                <h3 className="text-lg font-black text-white leading-tight">{accionInfo.titulo}</h3>
                <p className="text-sm text-white/40 mt-1 leading-relaxed">{accionInfo.descripcion}</p>
              </div>
              <div className="text-5xl font-black font-mono tabular-nums flex-shrink-0 leading-none pt-1" style={{ color: cfg.color }}>
                {viabilidad_score}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {accionInfo.acciones.map((a, i) => (
                <div key={i} className="flex gap-3 rounded-2xl border border-white/6 bg-white/[0.025] px-4 py-4">
                  <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 text-brand-primary text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-sm text-white/65 leading-snug">{a.texto}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Resumen Ejecutivo ── */}
        {tapada('mercado.reporte_bi') ? (
          <div className="reveal">
            <SectionHeader icon={<IconBrain />} title="Resumen Ejecutivo" tag="IA" tooltip="Síntesis generada por IA cruzando precio, competencia, tendencias e inversión. Se genera en los planes de pago." />
            <LockedSection
              plan={userPlan}
              titulo="Resumen Ejecutivo disponible en Plan Pro"
              detalle="La síntesis con IA, el puntaje ampliado y el plan de acción de 3 pasos."
              minHeight={300}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 rounded-2xl border border-white/[.06] bg-white/[.02]">
                  <SkeletonBloque filas={6} />
                </div>
                <div className="rounded-2xl border border-white/[.06] bg-white/[.02]">
                  <SkeletonBloque filas={4} />
                </div>
              </div>
            </LockedSection>
          </div>
        ) : reporte_bi_data && (
          <div className="reveal">
            <SectionHeader icon={<IconBrain />} title="Resumen Ejecutivo" tag="IA" tooltip="Síntesis generada por inteligencia artificial cruzando todos los datos: precio, competencia, tendencias e inversión. Resume los puntos clave que debes considerar antes de tomar decisiones." />
            {reporte_bi_data.es_mock && (
              <div
                role="status"
                className="mb-4 flex flex-col sm:flex-row sm:items-start gap-2 rounded-xl border border-amber-300/25 p-3.5"
                style={{ background: 'rgba(251,191,36,0.05)' }}
              >
                <span className="self-start text-[11px] text-amber-200/90 border border-amber-200/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                  plantilla
                </span>
                <p className="text-xs text-white/60 leading-snug">
                  Este resumen no se generó con IA: la llamada al modelo no estuvo disponible y se
                  muestra un texto de respaldo con cifras genéricas. Vuelve a lanzar el análisis
                  para obtener el resumen real.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Main text */}
              <div className="md:col-span-2 rounded-2xl border border-white/8 p-6 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
                <div className="absolute top-0 right-0 w-48 h-48 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
                <p className="text-[15px] text-white/80 leading-relaxed font-light mb-6 italic">
                  {reporte_bi_data.resumen_ejecutivo}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: 'Precio',
                      val: reporte_bi_data.analisis_mercado?.validacion_precio ?? '',
                      icn: (
                        <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="2" x2="12" y2="22"/>
                          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                      ),
                    },
                    {
                      label: 'Oportunidad',
                      val: reporte_bi_data.analisis_mercado?.gap_oportunidad ?? '',
                      icn: (
                        <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                      ),
                    },
                    {
                      label: 'DAFO',
                      val: reporte_bi_data.analisis_mercado?.analisis_dafo_dinamico ?? '',
                      icn: (
                        <svg className="w-4 h-4 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="18" x="3" y="3" rx="2"/>
                          <path d="M3 9h18M9 21V9"/>
                        </svg>
                      ),
                    },
                    {
                      label: 'Inversión',
                      val: reporte_bi_data.analisis_mercado?.cruce_inversion_tam ?? '',
                      icn: (
                        <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                          <polyline points="16 7 22 7 22 13"/>
                        </svg>
                      ),
                    },
                  ].map((m, i) => (
                    <div key={i} className="bg-white/[0.04] rounded-xl border border-white/8 p-3.5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="flex-shrink-0">{m.icn}</span>
                        <p className="text-[10px] text-white/45 uppercase tracking-wide font-bold">{m.label}</p>
                      </div>
                      <p className="text-xs text-white/80 leading-snug line-clamp-3">{m.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Side: score + plan */}
              <div className="flex flex-col gap-4">
                <div className="flex-1 rounded-2xl border border-white/8 p-5 flex flex-col items-center justify-center" style={{ background: 'rgba(255,255,255,0.015)' }}>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2 font-bold">Puntaje IA</p>
                  <p className="text-6xl font-black tabular-nums" style={{ color: cfg.color }}>{reporte_bi_data.score_viabilidad}</p>
                  <div className="mt-4 w-full bg-white/4 border border-white/5 rounded-xl px-3 py-2 flex justify-between items-center">
                    <span className="text-[11px] text-white/40">Tendencia</span>
                    <span className={`text-[11px] font-bold ${
                      reporte_bi_data.grafica_tendencias === 'Creciente' ? 'text-green-400'
                      : reporte_bi_data.grafica_tendencias === 'Estable' ? 'text-yellow-400'
                      : 'text-red-400'
                    }`}>{reporte_bi_data.grafica_tendencias}</span>
                  </div>
                </div>

                {!!reporte_bi_data.analisis_mercado?.proximos_pasos?.length && (
                  <div className="rounded-2xl border border-mercado/25 bg-mercado/[0.07] p-5">
                    <h3 className="text-[10px] font-black text-mercado-muted uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-mercado motion-safe:animate-pulse-soft flex-shrink-0" />
                      Plan de acción
                    </h3>
                    <ol className="space-y-3.5">
                      {(reporte_bi_data?.analisis_mercado?.proximos_pasos || []).slice(0, 3).map((paso: string, idx: number) => (
                        <li key={idx} className="flex gap-2.5">
                          <span aria-hidden="true" className="text-[10px] font-black text-mercado-muted/70 font-mono tabular-nums mt-1 flex-shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <p className="text-[12px] text-white/75 leading-snug">{paso}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>

            {/* IA alerts */}
            {reporte_bi_data.alertas_ia?.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {(reporte_bi_data.alertas_ia || []).map((al, idx) => {
                  const r = al.color.toLowerCase() === 'rojo';
                  const a = al.color.toLowerCase() === 'amarillo';
                  return (
                    <div key={idx} className={`p-4 rounded-2xl border text-sm ${
                      r ? 'bg-red-500/8 border-red-500/20 text-red-100'
                      : a ? 'bg-yellow-500/8 border-yellow-500/20 text-yellow-100'
                      : 'bg-green-500/8 border-green-500/20 text-green-100'
                    }`}>
                      <p className="text-[10px] font-bold mb-1.5 opacity-80 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${r ? 'bg-red-400' : a ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        {r ? 'Crítico' : a ? 'Atención' : 'Positivo'}
                      </p>
                      <p className="text-[13px] leading-snug">{al.mensaje}</p>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          )}
        </>
      )}

  {/* ══ TAB 2: COMPETENCIA & PRECIOS ══ */}
  {(activeTab === 'competencia' || activeTab === 'completo') && (
    <>
      {/* Competencia */}
      <div className="reveal">
        {tapada('mercado.competencia') ? (
          <LockedSection
            plan={userPlan}
            titulo="Competencia local en Plan Pro"
            detalle="Cuántos negocios compiten contigo, su rating promedio y el mapa de saturación."
            minHeight={320}
          >
            <div className="p-4 sm:p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="h-[86px] rounded-xl border border-white/[.06] bg-white/[.03]" />
                <div className="h-[86px] rounded-xl border border-white/[.06] bg-white/[.03]" />
              </div>
              <div className="h-32 rounded-xl border border-white/[.06] bg-white/[.02]" />
            </div>
          </LockedSection>
        ) : competencia_data && (
          <div className="rounded-2xl border border-white/8 p-6 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/8 rounded-full blur-3xl pointer-events-none" />
            <SectionHeader icon={<IconCrosshair />} title="Competencia local" tooltip="Número de negocios similares al tuyo encontrados en tu zona. Más competidores no siempre es malo: también confirma que hay demanda real en el mercado." />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/4 border border-white/5 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-white">{competencia_data.total_competidores}</p>
                <p className="text-[10px] uppercase font-bold text-white/30 tracking-wide mt-0.5">competidores</p>
              </div>
              <div className="bg-white/4 border border-white/5 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-white">
                  {(() => {
                    const ratings = (competencia_data.competidores || [])
                      .map(c => Number(c.rating))
                      .filter(r => Number.isFinite(r) && r > 0);
                    return ratings.length > 0
                      ? (ratings.reduce((acc, r) => acc + r, 0) / ratings.length).toFixed(1)
                      : '—';
                  })()}
                </p>
                <p className="text-[10px] uppercase font-bold text-amber-500/80 tracking-wide mt-0.5">rating prom.</p>
              </div>
            </div>
            <CompetenciaMap total={competencia_data.total_competidores} />
          </div>
        )}
      </div>

        {/* ── Precio ── */}
        {/* Se tapa con la clave de competencia porque el promedio de mercado
            viaja dentro de competencia_data: sin esa sección la barra compararía
            el precio del usuario contra 0 y parecería un dato roto. */}
        {tapada('mercado.competencia') ? (
          <div className="reveal">
            <LockedSection
              plan={userPlan}
              titulo="Posicionamiento de precio en Plan Pro"
              detalle="Tu precio frente al promedio real del mercado en tu zona."
              minHeight={180}
            >
              <SkeletonBloque filas={3} />
            </LockedSection>
          </div>
        ) : (
          <div className="reveal">
            <PriceBar userPrice={userPrice} marketAvg={competencia_data?.precio_mercado_promedio ?? 0} pais={analisis.pais} />
          </div>
        )}

        {/* ── Tabla de Competidores ── */}
        {tapada('mercado.comparativa_competidores') ? (
          <div className="reveal">
            <SectionHeader icon={<IconTarget />} title="Comparativa de competidores" tooltip="Competidores reales de tu zona con precio, rating y reseñas. Disponible en los planes de pago." />
            <LockedSection
              plan={userPlan}
              titulo="Comparativa de competidores en Plan Pro"
              detalle="Nombres reales, precios, ratings, reseñas y zona de cada jugador de tu mercado."
              minHeight={280}
            >
              <SkeletonTarjetas cantidad={6} />
            </LockedSection>
          </div>
        ) : competencia_data?.competidores?.length > 0 && (() => {
          const { simbolo: simboloTabla, locale: localeTabla } = getTaxConfig(analisis.pais ?? 'MX');
          const fmtPrecioTabla = (n: number) => `${simboloTabla}${n.toLocaleString(localeTabla, { maximumFractionDigits: 0 })}`;
          const fuentes = (competencia_data.competidores || []).map(c => c.fuente);
          const esMercadoLibre  = fuentes.some(f => f === 'mercadolibre');
          const esGoogleMaps    = fuentes.some(f => f === 'google_maps');
          const esBenchmark     = fuentes.some(f => f === 'benchmark_sector');
          const esGoogleShopping = fuentes.some(f => f === 'google_shopping');
          const fuenteLabel = esMercadoLibre  ? { text: 'MercadoLibre', cls: 'text-yellow-300 bg-yellow-500/8 border-yellow-500/20' }
            : esGoogleMaps     ? { text: 'Google Maps',    cls: 'text-blue-300 bg-blue-500/8 border-blue-500/20' }
            : esGoogleShopping ? { text: 'Google Shopping', cls: 'text-green-300 bg-green-500/8 border-green-500/20' }
            : esBenchmark      ? { text: 'Benchmark',       cls: 'text-white/40 bg-white/5 border-white/10' }
            : { text: 'Estimación', cls: 'text-white/30 bg-white/4 border-white/8' };
          return (
            <div className="reveal rounded-2xl border border-white/8 overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
              <div className="px-6 pt-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <SectionHeader className="mb-0" icon={<IconTarget />} title="Comparativa de competidores" tooltip="Lista de competidores reales encontrados en tu zona. Los precios en verde están por encima del tuyo (puedes subir); en rojo, por debajo. Usa esto para posicionarte mejor." />
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${fuenteLabel.cls} flex-shrink-0`}>
                  {fuenteLabel.text}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/4 text-[10px] uppercase font-black text-white/30 tracking-wider">
                    <tr>
                      <th scope="col" className="py-3 px-5 hidden sm:table-cell">#</th>
                      <th scope="col" className="py-3 px-5">Jugador</th>
                      <th scope="col" className="py-3 px-5 text-right">Precio</th>
                      <th scope="col" className="py-3 px-5 text-center">Rating</th>
                      <th scope="col" className="py-3 px-5 text-center hidden md:table-cell">Reseñas</th>
                      <th scope="col" className="py-3 px-5 hidden lg:table-cell">Zona</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/4">
                    {(competencia_data.competidores || []).map((c, i) => (
                      <tr key={i} className="hover:bg-white/[0.025] transition-colors group">
                        <td className="py-3 px-5 text-white/20 font-mono text-xs hidden sm:table-cell">{String(c.ranking ?? i + 1).padStart(2, '0')}</td>
                        <td className="py-3 px-5 font-bold text-white max-w-[180px]">
                          <div className="flex items-center gap-2">
                            <div className="truncate group-hover:text-brand-primary transition-colors text-[13px] min-w-0">
                              {c.url
                                ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">{c.nombre}</a>
                                : c.nombre}
                            </div>
                            {(() => {
                              const f = fuenteFila(c);
                              return (
                                <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${f.cls}`}>
                                  {f.text}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-3 px-5 text-right font-mono">
                          <span className={`font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5 text-[13px] ${
                            userPrice && c.precio_promedio > 0
                              ? c.precio_promedio > userPrice * 1.1 ? 'text-green-400'
                              : c.precio_promedio < userPrice * 0.9 ? 'text-red-400'
                              : 'text-white'
                              : 'text-white'
                          }`}>{fmtPrecioTabla(c.precio_promedio)}</span>
                        </td>
                        <td className="py-3 px-5 text-center">
                          <span className="inline-flex items-center gap-1.5 text-yellow-400 font-bold text-[12px] bg-yellow-500/8 px-2 py-0.5 rounded border border-yellow-500/15">
                            <svg className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" viewBox="0 0 24 24">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            {c.rating}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-center text-white/35 text-[11px] uppercase font-bold hidden md:table-cell">
                          {c.numero_resenas > 0 ? c.numero_resenas.toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-5 text-white/30 text-[11px] hidden lg:table-cell max-w-[120px] truncate">{c.ubicacion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {competencia_data.precio_mercado_promedio > 0 && userPrice && userPrice > 0 && (() => {
                const pct = Math.round(((userPrice - competencia_data.precio_mercado_promedio) / competencia_data.precio_mercado_promedio) * 100);
                const above = pct > 0;
                return (
                  <div className={`mx-5 mb-5 mt-4 flex gap-3 items-start px-4 py-3.5 rounded-xl border text-sm ${above ? 'bg-yellow-500/8 border-yellow-500/20' : 'bg-green-500/8 border-green-500/20'}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${above ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                      {above ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="16" x2="12" y2="12"/>
                          <line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="text-white/65 leading-relaxed text-[13px]">
                      Tu precio (<strong className="text-white">{fmtPrecioTabla(userPrice)}</strong>) está{' '}
                      <strong className={above ? 'text-yellow-400' : 'text-green-400'}>
                        {above ? `+${pct}% por encima` : `${Math.abs(pct)}% por debajo`}
                      </strong>{' '}
                      del promedio del mercado.
                      <span className="block mt-0.5 text-[11px] opacity-60">
                        {above ? 'Enfoca tu estrategia en valor y calidad percibida.' : 'Tienes ventaja de precio — úsala como palanca de entrada.'}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </>
    )}

    {/* ══ TAB 3: DEMANDA & TENDENCIAS ══ */}
    {(activeTab === 'tendencias' || activeTab === 'completo') && (
      <>
        {/* Tendencias */}
        {tapada('mercado.tendencias') ? (
          <div className="reveal">
            <LockedSection
              plan={userPlan}
              titulo="Tendencias de búsqueda en Plan Pro"
              detalle="Volumen mensual, crecimiento y la serie de los últimos 12 meses."
              minHeight={320}
            >
              <div>
                <SkeletonBloque filas={3} />
                <div className="px-4 sm:px-5 pb-5 flex items-end gap-1.5 h-20">
                  {[46, 72, 58, 88, 66, 94].map((h) => (
                    <div key={h} className="flex-1 rounded-sm bg-white/[.09]" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </LockedSection>
          </div>
        ) : tendencias_data && (
          <div className="reveal rounded-2xl border border-white/8 p-6 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none" />
            <SectionHeader icon={<IconTrendingUp />} title="Tendencias de búsqueda" tooltip="Muestra cuánta gente busca tu producto o servicio en internet y si esa demanda está creciendo, estable o cayendo. Un volumen alto = mercado activo." />
            <div className="space-y-2.5 mb-5 text-sm">
              {[
                { label: 'Búsquedas / mes', val: (tendencias_data.volumen_busquedas_mensual ?? 0).toLocaleString(), accent: false },
                { label: 'Crecimiento', val: tendencias_data.crecimiento_descripcion, accent: tendencias_data.crecimiento_porcentaje >= 0 },
                { label: 'Dirección', val: tendencias_data.tendencia, accent: false },
              ].map(({ label, val, accent }) => (
                <div key={label} className="flex justify-between items-center bg-white/[0.04] border border-white/8 px-3.5 py-2.5 rounded-xl">
                  <span className="text-white/55 font-medium text-[13px]">{label}</span>
                  <span className={`font-black text-[13px] ${accent ? 'text-green-400' : 'text-white'}`}>{val}</span>
                </div>
              ))}
            </div>
            {/* Mini bar chart */}
            {(() => {
              const serie = (tendencias_data.datos_12_meses || []).slice(-6);
              if (serie.length === 0) return null;
              const max = Math.max(...serie.map(x => Number(x.volumen) || 0), 1);
              return (
                <figure className="m-0 bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                  <figcaption className="text-[10px] uppercase font-bold text-white/40 tracking-widest mb-3">
                    Búsquedas por mes · últimos {serie.length} meses
                  </figcaption>
                  {/* Las barras son decorativas: la serie accesible va en la tabla sr-only de abajo. */}
                  <div aria-hidden="true" className="flex items-end gap-1.5 h-14">
                    {serie.map((d, i) => {
                      const vol = Number(d.volumen) || 0;
                      const pct = (vol / max) * 100;
                      return (
                        <div key={`bar-${d.mes}-${i}`} className="flex-1 flex flex-col items-center group/bar">
                          <div
                            className="w-full bg-gradient-to-t from-mercado/30 to-mercado rounded-sm opacity-70 group-hover/bar:opacity-100 transition-opacity relative"
                            style={{ height: `${pct}%`, minHeight: 4 }}
                          >
                            <div className="opacity-0 group-hover/bar:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] py-1 px-2 rounded font-bold tabular-nums pointer-events-none transition-opacity whitespace-nowrap z-50">
                              {vol.toLocaleString()}
                            </div>
                          </div>
                          <span className="text-[10px] text-white/40 mt-1.5 font-bold uppercase">{d.mes.slice(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <table className="sr-only">
                    <caption>Volumen de búsquedas mensuales de los últimos {serie.length} meses</caption>
                    <thead>
                      <tr>
                        <th scope="col">Mes</th>
                        <th scope="col">Búsquedas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serie.map((d, i) => (
                        <tr key={`row-${d.mes}-${i}`}>
                          <th scope="row">{d.mes}</th>
                          <td>{(Number(d.volumen) || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </figure>
              );
            })()}
          </div>
        )}

        {/* ── Estacionalidad ── */}
        {tapada('mercado.estacionalidad') ? (
          <div className="reveal">
            <SectionHeader icon={<IconCalendar />} title="Ciclos de estacionalidad" tooltip="En qué meses sube o baja la demanda de tu mercado. Disponible en los planes de pago." />
            <LockedSection
              plan={userPlan}
              titulo="Ciclos de estacionalidad en Plan Pro"
              detalle="Los 12 meses con su factor de demanda para planificar marketing y liquidez."
              minHeight={170}
            >
              <div className="flex flex-wrap gap-2 p-4 sm:p-5">
                {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map((m) => (
                  <div key={m} className="h-8 w-[86px] rounded-lg border border-white/[.06] bg-white/[.03]" />
                ))}
              </div>
            </LockedSection>
          </div>
        ) : tam_data?.estacionalidad && tam_data.estacionalidad.length > 0 && (
          <div className="reveal rounded-2xl border border-white/8 p-6" style={{ background: 'rgba(255,255,255,0.015)' }}>
            <SectionHeader icon={<IconCalendar />} title="Ciclos de estacionalidad" tooltip="Muestra en qué meses tu mercado tiene más o menos demanda. Verde = mes de alta demanda (refuerza publicidad). Rojo = mes bajo (ahorra o prepara stock). Úsalo para planificar tu presupuesto de marketing anual." />
            <p className="text-sm text-white/50 mb-5 -mt-2">Periodos clave para reforzar marketing o conservar liquidez.</p>
            <div className="flex flex-wrap gap-2">
              {(tam_data.estacionalidad || []).map((mes, i) => {
                const isH = mes.factor >= 1.3;
                const isM = mes.factor >= 1.1 && !isH;
                const isL = mes.factor < 1.0;
                return (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${
                    isH ? 'bg-green-500/8 border-green-500/25 text-green-300'
                    : isM ? 'bg-blue-500/8 border-blue-500/25 text-blue-300'
                    : isL ? 'bg-red-500/8 border-red-500/25 text-red-300'
                    : 'bg-white/4 border-white/8 text-white/50'
                  }`}>
                    <span className="uppercase tracking-wider">{mes.mes}</span>
                    <span className="bg-black/20 px-1.5 py-0.5 rounded">{mes.factor >= 1.0 ? '+' : ''}{Math.round((mes.factor - 1) * 100)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    )}

    {/* ══ TAB 4: ESTRATEGIA DAFO & TAM ══ */}
    {(activeTab === 'dafo' || activeTab === 'completo') && (
      <>
        {/* ── DAFO ── */}
        {tapada('mercado.dafo') ? (
          <div className="reveal">
            <SectionHeader icon={<IconSearch />} title="Análisis DAFO" tooltip="Diagnóstico en 4 dimensiones: fortalezas, debilidades, oportunidades y amenazas. Disponible en los planes de pago." />
            <LockedSection
              plan={userPlan}
              titulo="Análisis DAFO disponible en Plan Pro"
              detalle="Las 4 dimensiones con impacto, probabilidad y acción recomendada por punto."
              minHeight={340}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['fortalezas', 'debilidades', 'oportunidades', 'amenazas'].map((k) => (
                  <div key={k} className="rounded-2xl border border-white/[.06] bg-white/[.02]">
                    <SkeletonBloque filas={3} />
                  </div>
                ))}
              </div>
            </LockedSection>
          </div>
        ) : dafo_data && (
          <div className="reveal">
            <SectionHeader icon={<IconSearch />} title="Análisis DAFO" tooltip="Diagnóstico estratégico de tu negocio en 4 dimensiones: lo que ya tienes a favor (Fortalezas), lo que debes mejorar internamente (Debilidades), lo que el mercado te ofrece (Oportunidades) y los riesgos externos que debes vigilar (Amenazas)." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DafoCard
                titulo="Fortalezas"
                icon={(
                  <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
                  </svg>
                )}
                items={dafo_data.fortalezas || []}
                borderColor="rgba(74,222,128,0.2)"
                iconColor="#4ade80"
              />
              <DafoCard
                titulo="Debilidades"
                icon={(
                  <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                )}
                items={dafo_data.debilidades || []}
                borderColor="rgba(250,204,21,0.2)"
                iconColor="#facc15"
              />
              <DafoCard
                titulo="Oportunidades"
                icon={(
                  <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                )}
                items={dafo_data.oportunidades || []}
                borderColor="rgba(96,165,250,0.2)"
                iconColor="#60a5fa"
              />
              <DafoCard
                titulo="Amenazas"
                icon={(
                  <svg className="w-3.5 h-3.5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                )}
                items={dafo_data.amenazas || []}
                borderColor="rgba(248,113,113,0.2)"
                iconColor="#f87171"
              />
            </div>
          </div>
        )}

        {/* ── TAM / SAM / SOM ── */}
        {tapada('mercado.tam_sam_som') ? (
          <div className="reveal">
            <SectionHeader icon={<IconGlobe />} title="Tamaño del mercado" tooltip="TAM, SAM y SOM de tu zona con tres escenarios de penetración. Disponible en los planes de pago." />
            <LockedSection
              plan={userPlan}
              titulo="Tamaño de mercado (TAM · SAM · SOM) en Plan Pro"
              detalle="Cuánto dinero mueve tu categoría, qué parte puedes atender y tu ganancia estimada."
              minHeight={360}
            >
              <div className="p-4 sm:p-5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {['tam', 'sam', 'som'].map((k) => (
                    <div key={k} className="h-24 rounded-xl border border-white/[.06] bg-white/[.03]" />
                  ))}
                </div>
                <div className="h-14 rounded-xl border border-white/[.06] bg-white/[.02]" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {['conservador', 'realista', 'favorable'].map((k) => (
                    <div key={k} className="h-24 rounded-xl border border-white/[.06] bg-white/[.02]" />
                  ))}
                </div>
              </div>
            </LockedSection>
          </div>
        ) : tam_data && (() => {
          const tamMensual = tam_data.tam_escenarios?.optimista?.mercado_mensual ?? 0;
          const samMensual = tam_data.tam_escenarios?.realista?.mercado_mensual ?? 0;
          const somMensual = tam_data.tam_escenarios?.realista?.ganancia_mes ?? 0;
          const { simbolo: simboloTam, locale: localeTam } = getTaxConfig(analisis.pais ?? 'MX');
          const fmtM = (n: number) => {
            const v = Number.isFinite(n) ? n : 0;
            const abs = Math.abs(v);
            if (abs >= 1_000_000) return `${simboloTam}${(v / 1_000_000).toFixed(1)}M`;
            if (abs >= 1_000)     return `${simboloTam}${Math.round(v / 1_000)}k`;
            return `${simboloTam}${v.toLocaleString(localeTam, { maximumFractionDigits: 0 })}`;
          };

          return (
            <div className="reveal rounded-2xl border border-mercado/20 p-6 sm:p-8 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-mercado/10 rounded-full blur-3xl pointer-events-none" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3 relative z-10">
                <SectionHeader className="mb-0" icon={<IconGlobe />} title={`Tamaño del mercado · ${tam_data.ubicacion}`} tooltip="TAM es todo el dinero que se mueve en tu categoría. SAM es la parte que puedes capturar con tus canales actuales. SOM es lo que realísticamente podrías ganar tú en el primer año. Estos números son estimaciones basadas en datos reales de tu zona." />
                {tam_data.nse_aplicado && (
                  <span className="bg-mercado/15 border border-mercado/30 px-3 py-1 rounded-lg text-[11px] text-mercado-muted font-bold uppercase tracking-wider self-start sm:self-auto flex-shrink-0">
                    NSE {tam_data.nse_aplicado} · {tam_data.pct_mercado_nse}%
                  </span>
                )}
              </div>

              {/* Funnel */}
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {[
                  { sigla: 'TAM', nombre: 'Mercado Total',     desc: 'Todo el dinero que se mueve en tu categoría en esta zona',              mensual: tamMensual, width: 'md:w-full',                            color: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.14)', tag: 'text-white/60',  num: 'text-white' },
                  { sigla: 'SAM', nombre: 'Mercado Accesible', desc: 'La parte que puedes atender con tus canales y alcance actuales',        mensual: samMensual, width: 'md:w-[85%] md:justify-self-center', color: 'rgba(96,165,250,0.15)',  borderColor: 'rgba(96,165,250,0.35)',  tag: 'text-blue-300',  num: 'text-blue-200' },
                  { sigla: 'SOM', nombre: 'Ganancia estimada', desc: 'Beneficio estimado tras aplicar tu margen sobre las ventas capturadas', mensual: somMensual, width: 'md:w-[65%] md:justify-self-center', color: 'rgba(74,222,128,0.15)',  borderColor: 'rgba(74,222,128,0.35)',  tag: 'text-green-300', num: 'text-green-200' },
                ].map((lvl, i) => (
                  <div key={lvl.sigla} className={`relative ${lvl.width}`}>
                    {i > 0 && <div aria-hidden="true" className="md:hidden flex justify-center py-1 text-white/25 text-lg">▼</div>}
                    <div className="rounded-xl border px-5 py-4 flex flex-col gap-2.5 h-full" style={{ borderColor: lvl.borderColor, background: lvl.color }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${lvl.tag}`}>{lvl.sigla}</span>
                          <p className="text-sm font-bold text-white mt-0.5">{lvl.nombre}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-lg font-black font-mono tabular-nums ${lvl.num}`}>{fmtM(lvl.mensual)}<span className="text-[10px] font-normal text-white/40">/mes</span></p>
                          <p className="text-[10px] text-white/45 tabular-nums">{fmtM(lvl.mensual * 12)}/año</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-white/55 leading-snug">{lvl.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Methodology note */}
              <div className="flex items-start gap-2 bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 mb-5 relative z-10">
                <svg className="w-4 h-4 text-white/50 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <p className="text-[11px] text-white/55 leading-relaxed">
                  <strong className="text-white/80">Metodología:</strong> TAM = techo del mercado en tu zona/categoría.
                  SAM = filtrado por tus canales de alcance.
                  SOM = proyección con penetración del <strong className="text-white/80 tabular-nums">{tam_data.tam_escenarios?.realista?.penetracion ?? 0}%</strong> del SAM,
                  con tu margen ya aplicado (es beneficio, no facturación).
                </p>
              </div>

              {/* Escenarios */}
              <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  ['Conservador', tam_data.tam_escenarios?.pesimista || { penetracion: 0, mercado_anual: 0, mercado_mensual: 0, unidades_mes: 0, ganancia_mes: 0 },  'rgba(255,255,255,0.06)', 'text-white/50'],
                  ['Realista',    tam_data.tam_escenarios?.realista || { penetracion: 0, mercado_anual: 0, mercado_mensual: 0, unidades_mes: 0, ganancia_mes: 0 },   'rgba(96,165,250,0.08)',  'text-blue-300'],
                  ['Favorable',   tam_data.tam_escenarios?.optimista || { penetracion: 0, mercado_anual: 0, mercado_mensual: 0, unidades_mes: 0, ganancia_mes: 0 },  'rgba(74,222,128,0.08)',  'text-green-300'],
                ] as [string, TamEsc, string, string][]).map(([label, esc, bg, cls]) => (
                  <div key={label} className="rounded-xl border border-white/6 px-4 py-3" style={{ background: bg }}>
                    <p className={`text-[10px] font-black uppercase tracking-wide mb-2.5 ${cls}`}>{label}</p>
                    <div className="space-y-1.5 text-[11px]">
                      {[
                        ['Penetración', `${esc.penetracion ?? 0}%`],
                        ['Ventas/mes',  (esc.unidades_mes ?? 0).toLocaleString(localeTam)],
                        ['Ganancia/mes', fmtM(esc.ganancia_mes ?? 0)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <span className="text-white/55">{k}</span>
                          <span className={`font-bold tabular-nums ${cls}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </>
    )}

    {/* ══ CTA FINAL ══ */}
    {(activeTab === 'resumen' || activeTab === 'completo') && (
      <div className="reveal rounded-3xl border border-brand-primary/20 p-10 text-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#08111d 0%,#0a1420 60%,#08110d 100%)' }}>
        <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg,transparent,rgba(59,130,246,0.6),rgba(16,185,129,0.4),transparent)' }} />
        <div className="absolute top-0 right-0 w-72 h-72 bg-brand-primary/8 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center text-brand-primary mx-auto mb-5 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3 className="font-black text-2xl tracking-tight text-white mb-2">¡Análisis listo!</h3>
          <p className="text-sm text-white/35 mb-8 max-w-sm mx-auto">Con estos datos puedes avanzar a marketing, proveedores y finanzas.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={`/dashboard/producto/${productoId}`}
              className="px-8 py-3 rounded-xl font-black text-sm text-white w-full sm:w-auto"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', boxShadow: '0 0 25px rgba(59,130,246,0.4)' }}>
              Ver todos los módulos →
            </Link>
            <Link href={`/dashboard/mercado/${productoId}`}
              className="border border-white/10 text-white/50 px-8 py-3 rounded-xl text-sm font-bold hover:bg-white/5 hover:text-white transition w-full sm:w-auto">
              + Nuevo análisis
            </Link>
            <Link href="/dashboard"
              className="border border-white/10 text-white/50 px-8 py-3 rounded-xl text-sm font-bold hover:bg-white/5 hover:text-white transition w-full sm:w-auto">
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    )}

      </div>
    </div>
  );
}
