'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { useProductoActivo } from '@/lib/productoActivo';
import { BackButton } from '@/components/ui';

/* ────────────────────────────────────────────────────────────────────────────
   Tipos — contrato de GET /dashboard/alertas-operativas
   (backend/src/routes/dashboard.ts → services/alertas/agregadorOperativo.ts)

   Ojo: la Alerta operativa NO tiene `titulo` ni `accion` (a diferencia de la de
   /dashboard/alertas, que sale de los análisis de IA). Solo { nivel, tipo,
   mensaje }, así que el título de cada tarjeta se deriva de `tipo`.
   ────────────────────────────────────────────────────────────────────────── */

type NivelAlerta = 'verde' | 'amarillo' | 'rojo';

interface Alerta {
  nivel: NivelAlerta;
  tipo: string;
  mensaje: string;
}

interface ResumenNiveles {
  rojo: number;
  amarillo: number;
  verde: number;
  total: number;
}

interface RangoFechas {
  desde: string; // YYYY-MM-DD inclusive
  hasta: string; // YYYY-MM-DD inclusive
}

interface Periodo {
  dias: number;
  actual: RangoFechas;
  anterior: RangoFechas;
  ingreso_actual: number;
  ingreso_anterior: number;
  ventas_actual: number;
  ventas_anterior: number;
}

interface AlertasOperativas {
  alertas: Alerta[];
  resumen: ResumenNiveles;
  periodo: Periodo;
  metas_evaluadas: number;
  articulos_evaluados: number;
}

/* ────────────────────────────────────────────────────────────────────────────
   Tipos — contrato de GET /dashboard/alertas-operativas/resumen
   (backend/src/services/alertas/resumenIaService.ts → ResumenIaAlertas)

   El servicio NUNCA lanza: si no hay ANTHROPIC_API_KEY, si no hay alertas o si
   el LLM falla, devuelve el mismo objeto con `es_mock: true`. Por eso el
   frontend no ramifica por origen: solo etiqueta la procedencia.
   El endpoint sí puede responder 403 (requirePlanFeature 'alertas_automaticas'),
   y ese caso se pinta como upsell, no como error.
   ────────────────────────────────────────────────────────────────────────── */

type EstadoResumen = 'cargando' | 'listo' | 'bloqueado' | 'error';

interface PrioridadResumen {
  nivel: NivelAlerta;
  foco: string;
  accion: string;
}

interface ResumenIaAlertas {
  titular: string;
  diagnostico: string;
  prioridades: PrioridadResumen[];
  siguiente_paso: string;
  es_mock: boolean;
  desde_cache: boolean;
  generado_en: string; // ISO 8601
}

interface NegocioMin {
  id: string;
  nombre: string;
  emoji?: string | null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Tipos — Progreso: resumen completo bajo demanda (sin historial persistido)
   (backend/src/services/alertas/resumenCompletoService.ts →
    POST /dashboard/progreso/resumen-completo)
   ────────────────────────────────────────────────────────────────────────── */

type ModuloResumen = 'mercado' | 'marketing' | 'finanzas' | 'legal' | 'brief' | 'ventas';

interface ModuloResumenInfo {
  modulo: ModuloResumen;
  label: string;
  tiene_analisis: boolean;
  fecha_ultimo: string | null;
  dias_transcurridos: number | null;
  cadencia_dias: number;
  recomendacion: string;
  campos_clave: string | null;
}

interface ResumenCompleto {
  resumen_ia: string;
  modulos: ModuloResumenInfo[];
  es_mock: boolean;
  desde_cache: boolean;
  generado_en: string;
}

type EstadoResumenCompleto = 'inicial' | 'cargando' | 'listo' | 'bloqueado' | 'error';

// Ruta real del formulario de cada módulo — acceso directo para editar si algo cambió.
const RUTA_MODULO: Record<ModuloResumen, (productoId: string) => string> = {
  mercado: (id) => `/dashboard/mercado/${id}`,
  marketing: (id) => `/dashboard/marketing/${id}`,
  finanzas: (id) => `/dashboard/finanzas/${id}`,
  legal: (id) => `/dashboard/legal/${id}`,
  brief: () => `/dashboard/marca`,
  ventas: (id) => `/dashboard/ventas/${id}`,
};

/* ────────────────────────────────────────────────────────────────────────────
   Iconos Vectoriales SVG (Stroke 1.8, Cero Emojis)
   ────────────────────────────────────────────────────────────────────────── */

function IconCrosshair({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  );
}

function IconMegaphone({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function IconCoins({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  );
}

function IconScale({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  );
}

function IconPalette({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.12a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.96 6.01 17.46 2 12 2z" />
    </svg>
  );
}

function IconTrendingUp({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function IconPackage({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function IconTrendingDown({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </svg>
  );
}

function IconTarget({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconSparkles({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function IconLayers({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2 12.5" />
      <path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L2 17.5" />
    </svg>
  );
}

function IconShieldCheck({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconFolder({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function IconArrowUpRight({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

function IconAlertCircle({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconRefresh({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function IconActivity({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function getIconoModulo(modulo: ModuloResumen) {
  switch (modulo) {
    case 'mercado':
      return <IconCrosshair className="h-4 w-4 text-sky-400" />;
    case 'marketing':
      return <IconMegaphone className="h-4 w-4 text-violet-400" />;
    case 'finanzas':
      return <IconCoins className="h-4 w-4 text-emerald-400" />;
    case 'legal':
      return <IconScale className="h-4 w-4 text-amber-400" />;
    case 'brief':
      return <IconPalette className="h-4 w-4 text-pink-400" />;
    case 'ventas':
      return <IconTrendingUp className="h-4 w-4 text-indigo-400" />;
    default:
      return <IconLayers className="h-4 w-4 text-white/50" />;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Constantes de presentación
   ────────────────────────────────────────────────────────────────────────── */

const VENTANAS = [7, 30, 90] as const;
const NIVELES: NivelAlerta[] = ['rojo', 'amarillo', 'verde'];

// Clases estáticas por nivel: Tailwind no purga las construidas en runtime.
const NIVEL_UI: Record<
  NivelAlerta,
  { label: string; card: string; badge: string; dot: string; chip: string; glow: string }
> = {
  rojo: {
    label: 'Crítico',
    card: 'border-rose-500/25 bg-gradient-to-b from-rose-500/[0.08] to-rose-500/[0.02]',
    badge: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    dot: 'bg-rose-400',
    chip: 'text-rose-300',
    glow: 'shadow-[0_0_12px_rgba(244,63,94,0.12)]',
  },
  amarillo: {
    label: 'Atención',
    card: 'border-amber-500/25 bg-gradient-to-b from-amber-500/[0.08] to-amber-500/[0.02]',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    dot: 'bg-amber-400',
    chip: 'text-amber-300',
    glow: 'shadow-[0_0_12px_rgba(245,158,11,0.12)]',
  },
  verde: {
    label: 'Informativo',
    card: 'border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.08] to-emerald-500/[0.02]',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
    chip: 'text-emerald-300',
    glow: 'shadow-[0_0_12px_rgba(16,185,129,0.12)]',
  },
};

function tipoUI(tipo: string): { label: string; icon: ReactNode } {
  switch (tipo) {
    case 'stock':
      return {
        label: 'Inventario Crítico',
        icon: <IconPackage className="h-3.5 w-3.5 text-rose-400" />,
      };
    case 'ingresos':
      return {
        label: 'Flujo & Liquidez',
        icon: <IconTrendingDown className="h-3.5 w-3.5 text-amber-400" />,
      };
    case 'meta':
      return {
        label: 'Objetivo Operativo',
        icon: <IconTarget className="h-3.5 w-3.5 text-sky-400" />,
      };
    default:
      return {
        label: tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : 'General',
        icon: <IconAlertCircle className="h-3.5 w-3.5 text-white/50" />,
      };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Helpers puros
   ────────────────────────────────────────────────────────────────────────── */

/** Los decimales de pg/TypeORM pueden llegar serializados como string. */
function num(valor: unknown): number {
  const n = typeof valor === 'string' ? Number.parseFloat(valor) : typeof valor === 'number' ? valor : NaN;
  return Number.isFinite(n) ? n : 0;
}

// El backend no asume unidad monetaria (centavos o pesos), así que no se
// imprime símbolo de moneda: solo separadores de miles.
const FORMATO_NUM = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const FORMATO_ENTERO = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

function fmtImporte(valor: number): string {
  return FORMATO_NUM.format(valor);
}

function fmtEntero(valor: number): string {
  return FORMATO_ENTERO.format(valor);
}

/** 'YYYY-MM-DD' → '05 mar' leído en UTC (así lo genera periodos.ts). */
function fmtFecha(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const fecha = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function fmtRango(rango: RangoFechas): string {
  if (!rango.desde || !rango.hasta) return '—';
  return `${fmtFecha(rango.desde)} – ${fmtFecha(rango.hasta)}`;
}

function esNivel(valor: unknown): valor is NivelAlerta {
  return valor === 'rojo' || valor === 'amarillo' || valor === 'verde';
}

function normalizarRango(raw: unknown): RangoFechas {
  const r = (raw ?? {}) as Partial<RangoFechas>;
  return {
    desde: typeof r.desde === 'string' ? r.desde : '',
    hasta: typeof r.hasta === 'string' ? r.hasta : '',
  };
}

/**
 * Blinda la respuesta: si el backend degrada (campo ausente, decimal como
 * string, nivel desconocido) la pantalla sigue pintando en vez de lanzar.
 */
function normalizar(raw: unknown): AlertasOperativas {
  const d = (raw ?? {}) as Record<string, unknown>;
  const periodo = (d.periodo ?? {}) as Record<string, unknown>;
  const resumen = (d.resumen ?? {}) as Record<string, unknown>;

  const alertas: Alerta[] = Array.isArray(d.alertas)
    ? d.alertas
        .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
        .map((a) => ({
          nivel: esNivel(a.nivel) ? a.nivel : 'amarillo',
          tipo: typeof a.tipo === 'string' ? a.tipo : '',
          mensaje: typeof a.mensaje === 'string' ? a.mensaje : '',
        }))
        .filter((a) => a.mensaje !== '')
    : [];

  return {
    alertas,
    resumen: {
      rojo: num(resumen.rojo),
      amarillo: num(resumen.amarillo),
      verde: num(resumen.verde),
      total: num(resumen.total),
    },
    periodo: {
      dias: num(periodo.dias) || 30,
      actual: normalizarRango(periodo.actual),
      anterior: normalizarRango(periodo.anterior),
      ingreso_actual: num(periodo.ingreso_actual),
      ingreso_anterior: num(periodo.ingreso_anterior),
      ventas_actual: num(periodo.ventas_actual),
      ventas_anterior: num(periodo.ventas_anterior),
    },
    metas_evaluadas: num(d.metas_evaluadas),
    articulos_evaluados: num(d.articulos_evaluados),
  };
}

/**
 * Extrae y blinda `resumen_ia` de la respuesta del endpoint de resumen.
 * Devuelve null si no llegó nada utilizable (titular y diagnostico vacíos),
 * para que la tarjeta no se pinte a medias.
 */
function normalizarResumenIa(raw: unknown): ResumenIaAlertas | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  const r = (d.resumen_ia ?? {}) as Record<string, unknown>;

  const titular = typeof r.titular === 'string' ? r.titular.trim() : '';
  const diagnostico = typeof r.diagnostico === 'string' ? r.diagnostico.trim() : '';
  const siguientePaso = typeof r.siguiente_paso === 'string' ? r.siguiente_paso.trim() : '';
  if (titular === '' && diagnostico === '') return null;

  const prioridades: PrioridadResumen[] = Array.isArray(r.prioridades)
    ? r.prioridades
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({
          nivel: esNivel(p.nivel) ? p.nivel : 'amarillo',
          foco: typeof p.foco === 'string' ? p.foco.trim() : '',
          accion: typeof p.accion === 'string' ? p.accion.trim() : '',
        }))
        .filter((p) => p.accion !== '')
    : [];

  return {
    titular: titular || 'Resumen del periodo',
    diagnostico,
    prioridades,
    siguiente_paso: siguientePaso,
    es_mock: r.es_mock === true,
    desde_cache: r.desde_cache === true,
    generado_en: typeof r.generado_en === 'string' ? r.generado_en : '',
  };
}

/** Hora local corta del ISO que devuelve el servicio; '' si no es válido. */
function fmtHora(iso: string): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** Variación relativa; null cuando el periodo anterior no da base comparable. */
function variacion(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return (actual - anterior) / anterior;
}

/* ────────────────────────────────────────────────────────────────────────────
   Subcomponentes
   ────────────────────────────────────────────────────────────────────────── */

function Kpi({
  label,
  valor,
  detalle,
  icon,
}: {
  label: string;
  valor: string;
  detalle?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-5 backdrop-blur-md transition-all duration-300 hover:border-white/15 hover:bg-white/[0.035] group">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
        {icon && <div className="text-white/30 transition-colors group-hover:text-white/60">{icon}</div>}
      </div>
      <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-white">{valor}</p>
      {detalle ? <div className="mt-2 text-[11.5px] leading-relaxed text-white/50">{detalle}</div> : null}
    </div>
  );
}

function ContadorNivel({ nivel, valor }: { nivel: NivelAlerta; valor: number }) {
  const ui = NIVEL_UI[nivel];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${ui.badge} ${ui.glow}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ui.dot} ${nivel === 'rojo' ? 'animate-pulse' : ''}`} />
      {ui.label}
      <span className="font-mono text-white/70">{fmtEntero(valor)}</span>
    </span>
  );
}

/**
 * Tarjeta del resumen ejecutivo y diagnóstico operativo.
 */
function ResumenIaPanel({
  estado,
  resumen,
  onReintentar,
}: {
  estado: EstadoResumen;
  resumen: ResumenIaAlertas | null;
  onReintentar: () => void;
}) {
  if (estado === 'cargando') {
    return (
      <section
        aria-label="Diagnóstico operativo en proceso"
        aria-busy="true"
        className="rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-md"
      >
        <div className="flex items-center gap-2">
          <div className="ao-skeleton h-4 w-36 rounded-full" />
          <div className="ao-skeleton ml-auto h-4 w-20 rounded-full" />
        </div>
        <div className="ao-skeleton mt-4 h-6 w-3/4 rounded-full" />
        <div className="ao-skeleton mt-3 h-4 w-full rounded-full" />
        <div className="ao-skeleton mt-2 h-4 w-5/6 rounded-full" />
        <span className="sr-only">Compilando diagnóstico operativo de incidencias…</span>
      </section>
    );
  }

  if (estado === 'bloqueado') {
    return (
      <section
        aria-label="Diagnóstico operativo avanzado bloqueado"
        className="rounded-[24px] border border-indigo-500/25 bg-gradient-to-r from-indigo-500/[0.08] via-indigo-500/[0.03] to-transparent p-6 backdrop-blur-md"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-200">
              <IconSparkles className="h-3 w-3" />
              Priorización Táctica Multimodal
            </div>
            <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-white sm:text-base">
              Supervisión de Riesgos y Jerarquización de Acciones
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/60">
              Convierte los registros operativos en diagnósticos concretos priorizados por impacto financiero y
              desabastecimiento de inventario. Característica disponible en licencias Pro con monitoreo continuo.
            </p>
          </div>
          <a
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/15 px-4 py-2 text-[12px] font-medium text-indigo-100 transition hover:bg-indigo-400/25 hover:border-indigo-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/50"
          >
            Actualizar Licencia
            <IconArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>
    );
  }

  if (estado === 'error' || !resumen) {
    return (
      <section
        aria-label="Diagnóstico operativo no disponible"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-5 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <IconAlertCircle className="h-4 w-4 text-white/40" />
          <p className="text-[12.5px] text-white/50">
            No fue posible compilar el diagnóstico consolidado. Los registros individuales continúan activos debajo.
          </p>
        </div>
        <button
          type="button"
          onClick={onReintentar}
          className="rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-[11.5px] font-medium text-white/70 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          Reintentar Diagnóstico
        </button>
      </section>
    );
  }

  const hora = fmtHora(resumen.generado_en);

  return (
    <section
      aria-label="Diagnóstico operativo consolidado"
      className="rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-indigo-200">
          <IconSparkles className="h-3 w-3" />
          Diagnóstico Operativo
        </span>

        {resumen.es_mock && (
          <span
            title="Consolidación algorítmica local de reglas operativas."
            className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/40"
          >
            Motor Local
          </span>
        )}

        {resumen.desde_cache && (
          <span
            title="Respuesta indexada en memoria para optimizar latencia."
            className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/40"
          >
            En Memoria
          </span>
        )}

        {hora && <span className="ml-auto font-mono text-[11px] text-white/35">Actualizado a las {hora}</span>}
      </div>

      <h2 className="mt-3.5 text-base font-semibold leading-snug tracking-tight text-white sm:text-lg">
        {resumen.titular}
      </h2>

      {resumen.diagnostico && (
        <p className="mt-2 text-[13px] leading-relaxed text-white/65">{resumen.diagnostico}</p>
      )}

      {resumen.prioridades.length > 0 && (
        <div className="mt-5 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Prioridades Tácticas de Intervención
          </p>
          <ol className="space-y-2">
            {resumen.prioridades.map((p, i) => {
              const ui = NIVEL_UI[p.nivel];
              return (
                <li
                  key={`${p.nivel}-${i}`}
                  className={`flex items-start gap-3.5 rounded-[18px] border p-3.5 transition-all duration-200 ${ui.card} ${ui.glow}`}
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.05] font-mono text-[11px] font-bold text-white/70"
                  >
                    0{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[12px] font-semibold ${ui.chip}`}>
                        {p.foco || ui.label}
                      </span>
                      <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/30">
                        {ui.label}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-[12.5px] leading-relaxed text-white/75">
                      {p.accion}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {resumen.siguiente_paso && (
        <div className="mt-5 rounded-[18px] border border-white/[0.08] bg-white/[0.015] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
            Acción Inmediata Recomendada
          </p>
          <p className="mt-1.5 break-words text-[13px] font-medium leading-relaxed text-white/85">
            {resumen.siguiente_paso}
          </p>
        </div>
      )}
    </section>
  );
}

/** Fecha corta y legible de un ISO completo, para "último análisis". */
function fmtFechaCorta(iso: string | null): string {
  if (!iso) return 'Sin registro';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'Sin registro';
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Resumen completo del negocio: Bento Grid sobre los 6 pilares estratégicos
 */
function ResumenCompletoPanel({ productoId }: { productoId: string }) {
  const [estado, setEstado] = useState<EstadoResumenCompleto>('inicial');
  const [resumen, setResumen] = useState<ResumenCompleto | null>(null);

  const generar = useCallback(() => {
    setEstado('cargando');
    api
      .post<{ resumen: ResumenCompleto }>('/dashboard/progreso/resumen-completo', { producto_id: productoId })
      .then(({ data }) => {
        setResumen(data.resumen);
        setEstado('listo');
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setResumen(null);
        setEstado(status === 403 ? 'bloqueado' : 'error');
      });
  }, [productoId]);

  useEffect(() => {
    setEstado('inicial');
    setResumen(null);
  }, [productoId]);

  return (
    <section
      aria-label="Matriz de Integridad de Pilares Estratégicos"
      className="rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
            <IconLayers className="h-3.5 w-3.5 text-white/70" />
            Matriz de Cobertura de Pilares Estratégicos
          </div>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/50">
            Auditoría continua sobre los 6 vectores clave de tu negocio. Si cambian tus canales, costos o estructura legal,
            recalibra el módulo correspondiente para mantener la sincronía operativa.
          </p>
        </div>

        {estado !== 'cargando' && (
          <button
            type="button"
            onClick={generar}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-[#0B1015] shadow-sm transition hover:bg-white/90 active:scale-[0.98]"
          >
            <IconActivity className="h-3.5 w-3.5 text-[#0B1015]" />
            {estado === 'listo' ? 'Recalibrar Matriz' : 'Ejecutar Diagnóstico Global'}
          </button>
        )}
      </div>

      {estado === 'cargando' && (
        <div className="mt-6 space-y-3" aria-busy="true">
          <div className="ao-skeleton h-5 w-2/3 rounded-full" />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ao-skeleton h-36 rounded-[18px]" />
            ))}
          </div>
        </div>
      )}

      {estado === 'bloqueado' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-indigo-500/25 bg-indigo-500/[0.05] p-4">
          <p className="text-[12.5px] text-white/70">
            El diagnóstico holístico de pilares estratégicos requiere un plan habilitado con análisis automatizado.
          </p>
          <a
            href="/dashboard/billing"
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3.5 py-1.5 text-[11px] font-medium text-indigo-100 transition hover:bg-indigo-400/20"
          >
            Consultar Planes
            <IconArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      )}

      {estado === 'error' && (
        <p className="mt-5 text-[12.5px] text-white/40">
          No fue posible procesar la matriz de pilares en este momento. Reintenta nuevamente.
        </p>
      )}

      {estado === 'listo' && resumen && (
        <div className="mt-6 space-y-5">
          {/* Tarjeta de Síntesis Ejecutiva */}
          <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-4.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Dictamen Integral
              </span>
              {resumen.es_mock && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/40">
                  Cálculo Local
                </span>
              )}
              {resumen.desde_cache && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/40">
                  En Caché
                </span>
              )}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-white/80">{resumen.resumen_ia}</p>
          </div>

          {/* Bento Grid de los 6 Pilares */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {resumen.modulos.map((m) => {
              const necesitaRecalibrar =
                m.tiene_analisis &&
                m.dias_transcurridos !== null &&
                m.dias_transcurridos >= m.cadencia_dias;

              return (
                <div
                  key={m.modulo}
                  className="group relative flex flex-col justify-between rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-4.5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.035]"
                >
                  <div>
                    {/* Fila superior: Icono y Status Chip */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                        {getIconoModulo(m.modulo)}
                      </div>

                      {m.tiene_analisis ? (
                        necesitaRecalibrar ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.08em] text-amber-300">
                            <span className="h-1 w-1 rounded-full bg-amber-400" />
                            Recalibrar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.08em] text-emerald-300">
                            <span className="h-1 w-1 rounded-full bg-emerald-400" />
                            Vigente
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.08em] text-white/40">
                          Pendiente
                        </span>
                      )}
                    </div>

                    {/* Nombre y Tiempos */}
                    <h4 className="mt-3 text-[13.5px] font-semibold text-white group-hover:text-white transition-colors">
                      {m.label}
                    </h4>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-white/35">
                      <span>Último: {fmtFechaCorta(m.fecha_ultimo)}</span>
                      <span>·</span>
                      <span>Cadencia: {m.cadencia_dias}d</span>
                    </div>

                    {/* Recomendación */}
                    <p className="mt-2 text-[12px] leading-relaxed text-white/55 line-clamp-3">
                      {m.recomendacion}
                    </p>
                  </div>

                  {/* Botón de Enlace al Formulario */}
                  <div className="mt-4 pt-3 border-t border-white/[0.04]">
                    <a
                      href={RUTA_MODULO[m.modulo](productoId)}
                      className="inline-flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] font-medium text-white/70 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                    >
                      <span>{m.tiene_analisis ? 'Ajustar Parámetros' : 'Completar Módulo'}</span>
                      <IconArrowUpRight className="h-3.5 w-3.5 text-white/40 group-hover:text-white transition-colors" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function SkeletonState() {
  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="ao-skeleton h-8 w-48 rounded-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ao-skeleton h-[104px] rounded-[20px]" />
        ))}
      </div>
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ao-skeleton h-[92px] rounded-[20px]" />
        ))}
      </div>
      <span className="sr-only">Cargando alertas operativas…</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Página
   ────────────────────────────────────────────────────────────────────────── */

export default function ProgresoPage() {
  const [datos, setDatos] = useState<AlertasOperativas | null>(null);
  const [negocios, setNegocios] = useState<NegocioMin[]>([]);
  const [loading, setLoading] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resumen ejecutivo (IA): estado independiente del panel. Si falla o el plan
  // no lo incluye, las alertas se siguen mostrando igual.
  const [resumenIa, setResumenIa] = useState<ResumenIaAlertas | null>(null);
  const [estadoResumen, setEstadoResumen] = useState<EstadoResumen>('cargando');

  // Filtros → query de /dashboard/alertas-operativas
  const [dias, setDias] = useState<number>(30);
  const [soloAccionables, setSoloAccionables] = useState(true);
  const [negocioId, setNegocioId] = useState<string>('');
  const [nonce, setNonce] = useState(0); // fuerza recarga manual

  // Resumen completo bajo demanda — requiere un producto activo.
  const { productos, activoId, setActivoId } = useProductoActivo();

  // Carpetas/negocios para el filtro. Complementario: si falla, el panel sigue
  // funcionando sin el selector.
  useEffect(() => {
    const controlador = new AbortController();
    api
      .get<NegocioMin[]>('/negocios', { signal: controlador.signal })
      .then(({ data }) => {
        setNegocios(
          (Array.isArray(data) ? data : []).filter(
            (n): n is NegocioMin => !!n && typeof n.id === 'string' && typeof n.nombre === 'string'
          )
        );
      })
      .catch(() => {
        /* filtro opcional */
      });
    return () => controlador.abort();
  }, []);

  useEffect(() => {
    const controlador = new AbortController();
    const primeraCarga = datos === null;
    if (primeraCarga) setLoading(true);
    else setRecargando(true);

    const params = new URLSearchParams({ dias: String(dias) });
    if (soloAccionables) params.set('solo_accionables', '1');
    if (negocioId) params.set('negocio_id', negocioId);

    api
      .get<unknown>(`/dashboard/alertas-operativas?${params.toString()}`, {
        signal: controlador.signal,
      })
      .then(({ data }) => {
        if (controlador.signal.aborted) return;
        setDatos(normalizar(data));
        setError(null);
      })
      .catch(() => {
        if (controlador.signal.aborted) return;
        setError('No pudimos cargar las alertas operativas. Reintenta en unos segundos.');
      })
      .finally(() => {
        if (controlador.signal.aborted) return;
        setLoading(false);
        setRecargando(false);
      });

    return () => controlador.abort();
    // `datos` se lee solo para distinguir primera carga de refresco; incluirlo
    // en deps provocaría un bucle de fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, soloAccionables, negocioId, nonce]);

  // Resumen ejecutivo. `solo_accionables` NO se envía: el backend siempre lo
  // calcula sobre el diagnóstico completo. `refrescar=1` solo en recargas
  // manuales, para no saltarse la caché de 15 min en cada cambio de filtro.
  useEffect(() => {
    const controlador = new AbortController();
    setEstadoResumen('cargando');

    const params = new URLSearchParams({ dias: String(dias) });
    if (negocioId) params.set('negocio_id', negocioId);
    if (nonce > 0) params.set('refrescar', '1');

    api
      .get<unknown>(`/dashboard/alertas-operativas/resumen?${params.toString()}`, {
        signal: controlador.signal,
      })
      .then(({ data }) => {
        if (controlador.signal.aborted) return;
        const normalizado = normalizarResumenIa(data);
        setResumenIa(normalizado);
        setEstadoResumen(normalizado ? 'listo' : 'error');
      })
      .catch((err: unknown) => {
        if (controlador.signal.aborted) return;
        // 403 = requirePlanFeature('alertas_automaticas'): es upsell, no error.
        const status = (err as { response?: { status?: number } })?.response?.status;
        setResumenIa(null);
        setEstadoResumen(status === 403 ? 'bloqueado' : 'error');
      });

    return () => controlador.abort();
  }, [dias, negocioId, nonce]);

  const periodo = datos?.periodo;
  const resumen = datos?.resumen;

  const deltaIngresos = useMemo(
    () => (periodo ? variacion(periodo.ingreso_actual, periodo.ingreso_anterior) : null),
    [periodo]
  );
  const deltaVentas = useMemo(
    () => (periodo ? variacion(periodo.ventas_actual, periodo.ventas_anterior) : null),
    [periodo]
  );

  const grupos = useMemo(() => {
    const base: Record<NivelAlerta, Alerta[]> = { rojo: [], amarillo: [], verde: [] };
    for (const alerta of datos?.alertas ?? []) base[alerta.nivel].push(alerta);
    return base;
  }, [datos]);

  const recargar = useCallback(() => setNonce((n) => n + 1), []);

  // `resumen` cuenta TODAS las evaluadas (también las verdes que oculta el
  // filtro), así que este delta explica el hueco entre badge y lista.
  const ocultas = Math.max(0, (resumen?.total ?? 0) - (datos?.alertas.length ?? 0));

  if (loading) return <SkeletonState />;

  const fmtDelta = (valor: number | null): string =>
    valor === null ? 'sin base comparable' : `${valor >= 0 ? '+' : '−'}${Math.abs(Math.round(valor * 100))}%`;

  const claseDelta = (valor: number | null): string =>
    valor === null ? 'text-white/40' : valor >= 0 ? 'text-emerald-300' : 'text-rose-300';

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-16">
      {/* Estilos para Shimmer */}
      <style jsx global>{`
        .ao-skeleton {
          background: linear-gradient(
            90deg,
            rgb(255 255 255 / 0.03) 25%,
            rgb(255 255 255 / 0.07) 37%,
            rgb(255 255 255 / 0.03) 63%
          );
          background-size: 400% 100%;
          animation: ao-shimmer 1.5s ease-in-out infinite;
        }
        @keyframes ao-shimmer {
          0% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0 50%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ao-skeleton {
            animation: none;
          }
        }
      `}</style>

      {/* ── Encabezado Institucional ────────────────────────────────────────── */}
      <header className="space-y-3">
        <BackButton href="/dashboard" label="Volver al panel" className="mb-2" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            DIAGNÓSTICO OPERATIVO & CONTROL DE TRACCIÓN · BI0A100
          </div>

          <button
            type="button"
            onClick={recargar}
            disabled={recargando}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-white/80 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconRefresh className={`h-3.5 w-3.5 ${recargando ? 'animate-spin' : ''}`} />
            {recargando ? 'Sincronizando…' : 'Actualizar Estado'}
          </button>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 pt-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Centro de Control Operativo
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-white/50">
              Supervisión de salud del negocio, inventario crítico, tracción financiera y matriz de cobertura en tiempo real.
            </p>
          </div>

          {periodo && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-right font-mono text-[11px] text-white/40">
              Ventana de {fmtEntero(periodo.dias)}d: {fmtRango(periodo.actual)}
            </div>
          )}
        </div>
      </header>

      {/* ── Matriz de Pilares Estratégicos (Resumen Completo) ──────────────── */}
      <div className="space-y-2">
        {productos.length > 1 && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
              Producto Activo:
            </span>
            <select
              value={activoId}
              onChange={(e) => setActivoId(e.target.value)}
              className="max-w-[240px] truncate rounded-full border border-white/[0.1] bg-[#0A0E14] px-3.5 py-1.5 text-[12px] text-white/85 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {!activoId ? (
          <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-6 text-center">
            <p className="text-[13px] text-white/40">Registra o selecciona un producto para auditar su matriz de pilares.</p>
          </div>
        ) : (
          <ResumenCompletoPanel productoId={activoId} />
        )}
      </div>

      {/* ── Filtros y Parámetros de Ventana ───────────────────────────────── */}
      <section
        aria-label="Filtros tácticos"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border border-white/[0.08] bg-white/[0.02] p-4 backdrop-blur-md"
      >
        <div
          role="group"
          aria-label="Ventana temporal de análisis"
          className="relative inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] p-1"
        >
          {VENTANAS.map((v) => {
            const activa = dias === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setDias(v)}
                aria-pressed={activa}
                className={`relative z-10 rounded-full px-3.5 py-1.5 text-[11.5px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  activa ? 'text-white' : 'text-white/45 hover:text-white/80'
                }`}
              >
                {activa && (
                  <motion.div
                    layoutId="alertas-ventana-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-white/10 border border-white/20 shadow-sm -z-10"
                  />
                )}
                {v} días
              </button>
            );
          })}
        </div>

        {negocios.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-white/40">
              <IconFolder className="h-3.5 w-3.5" />
              <label
                htmlFor="ao-negocio"
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40"
              >
                Carpeta
              </label>
            </div>
            <select
              id="ao-negocio"
              value={negocioId}
              onChange={(e) => setNegocioId(e.target.value)}
              className="max-w-[200px] truncate rounded-full border border-white/[0.1] bg-[#0A0E14] px-3.5 py-1.5 text-[12px] text-white/85 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <option value="">Todas las unidades</option>
              {negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="ml-auto inline-flex cursor-pointer items-center gap-2.5 text-[12px] text-white/70">
          <input
            type="checkbox"
            checked={soloAccionables}
            onChange={(e) => setSoloAccionables(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-white/20 bg-white/[0.06] accent-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          />
          Solo incidencias prioritarias
        </label>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-[20px] border border-rose-500/25 bg-rose-500/[0.06] p-4 text-[13px] text-rose-200"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={recargar}
            className="mt-2 rounded-full border border-rose-500/30 px-3.5 py-1.5 text-[11.5px] font-medium text-rose-100 transition hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/50"
          >
            Reintentar Conexión
          </button>
        </div>
      )}

      {/* ── Diagnóstico Operativo Consolidado ─────────────────────────────── */}
      <ResumenIaPanel estado={estadoResumen} resumen={resumenIa} onReintentar={recargar} />

      {/* ── Tiras Métricas de Tracción (KPIs) ──────────────────────────────── */}
      {periodo && (
        <section aria-label="Indicadores clave de tracción" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Ingresos del Periodo"
            valor={`$${fmtImporte(periodo.ingreso_actual)}`}
            icon={<IconCoins className="h-4 w-4" />}
            detalle={
              <div className="flex items-center gap-1.5 font-mono">
                <span className={claseDelta(deltaIngresos)}>{fmtDelta(deltaIngresos)}</span>
                <span className="text-white/30">vs. anterior (${fmtImporte(periodo.ingreso_anterior)})</span>
              </div>
            }
          />
          <Kpi
            label="Transacciones Concretadas"
            valor={fmtEntero(periodo.ventas_actual)}
            icon={<IconTrendingUp className="h-4 w-4" />}
            detalle={
              <div className="flex items-center gap-1.5 font-mono">
                <span className={claseDelta(deltaVentas)}>{fmtDelta(deltaVentas)}</span>
                <span className="text-white/30">vs. anterior ({fmtEntero(periodo.ventas_anterior)})</span>
              </div>
            }
          />
          <Kpi
            label="Artículos Bajo Control"
            valor={fmtEntero(datos?.articulos_evaluados ?? 0)}
            icon={<IconPackage className="h-4 w-4" />}
            detalle="Supervisión activa de umbrales de stock"
          />
          <Kpi
            label="Metas Operativas Vigentes"
            valor={fmtEntero(datos?.metas_evaluadas ?? 0)}
            icon={<IconTarget className="h-4 w-4" />}
            detalle="Hitos de crecimiento y margen monitoreados"
          />
        </section>
      )}

      {/* ── Distribución de Severidad ─────────────────────────────────────── */}
      {resumen && (
        <section className="flex flex-wrap items-center justify-between gap-3 pt-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            {NIVELES.map((nivel) => (
              <ContadorNivel key={nivel} nivel={nivel} valor={resumen[nivel]} />
            ))}
          </div>

          <span className="font-mono text-[11px] text-white/35">
            {fmtEntero(resumen.total)} {resumen.total === 1 ? 'registro evaluado' : 'registros evaluados'}
            {ocultas > 0 ? ` · ${fmtEntero(ocultas)} informativos filtrados` : ''}
          </span>
        </section>
      )}

      {/* ── Monitor de Alertas por Severidad ──────────────────────────────── */}
      {datos && datos.alertas.length === 0 ? (
        <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center backdrop-blur-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.15)]">
            <IconShieldCheck className="h-7 w-7" />
          </div>
          <p className="mt-4 text-[15px] font-semibold text-white/90">
            {ocultas > 0 ? 'Sin incidencias prioritarias pendientes' : 'Conformidad Operativa Asegurada'}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-white/45">
            {ocultas > 0
              ? `Existen ${fmtEntero(ocultas)} ${ocultas === 1 ? 'registro informativo' : 'registros informativos'} ocultos por el filtro de prioridad. Desactiva el filtro para inspeccionarlos.`
              : 'No se detectaron quiebres de inventario, caídas anómalas de facturación ni rezago de metas en la ventana seleccionada.'}
          </p>
        </div>
      ) : (
        <section className="space-y-6" aria-label="Registro de alertas operativas">
          {NIVELES.filter((nivel) => grupos[nivel].length > 0).map((nivel) => {
            const ui = NIVEL_UI[nivel];
            const lista = grupos[nivel];
            return (
              <div key={nivel} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${ui.dot}`} />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                      Nivel {ui.label}
                    </h3>
                  </div>
                  <span className="font-mono text-[11px] text-white/30">
                    {fmtEntero(lista.length)} {lista.length === 1 ? 'incidencia' : 'incidencias'}
                  </span>
                </div>

                <ul className="space-y-3">
                  {lista.map((alerta, i) => {
                    const t = tipoUI(alerta.tipo);
                    return (
                      <li
                        key={`${nivel}-${alerta.tipo}-${i}`}
                        className={`rounded-[20px] border p-4.5 transition-all duration-200 ${ui.card} ${ui.glow}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${ui.badge}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} />
                              {ui.label}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/50">
                              {t.icon}
                              {t.label}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2.5 break-words text-[13.5px] font-medium leading-relaxed tracking-[-0.01em] text-white/90">
                          {alerta.mensaje}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
