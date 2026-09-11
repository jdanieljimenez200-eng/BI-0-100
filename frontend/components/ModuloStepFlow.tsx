'use client';

import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import { IconMercado, IconMarketing, IconVentas, IconFinanzas, IconLegal } from './ui/ModuleIcons';
import type { IconProps } from './ui/ModuleIcons';

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuloEstado = 'pending' | 'procesando' | 'completado' | 'error';

interface ModuloConfig {
  step: string;
  key: string;
  label: string;
  Icon: (props: IconProps) => ReactElement;
  color: string;
  glow: string;
}

const MODULOS: ModuloConfig[] = [
  { step: '01', key: 'mercado',     label: 'Mercado',     Icon: IconMercado,     color: '#3B82F6', glow: 'rgba(59,130,246,0.3)' },
  { step: '02', key: 'marketing',   label: 'Marketing',   Icon: IconMarketing,   color: '#8B5CF6', glow: 'rgba(139,92,246,0.3)' },
  { step: '03', key: 'ventas', label: 'Ventas', Icon: IconVentas, color: '#06B6D4', glow: 'rgba(6,182,212,0.3)'  },
  { step: '04', key: 'finanzas',    label: 'Finanzas',    Icon: IconFinanzas,    color: '#10B981', glow: 'rgba(16,185,129,0.3)' },
  { step: '05', key: 'legal',       label: 'Legal',       Icon: IconLegal,       color: '#A78BFA', glow: 'rgba(167,139,250,0.3)' },
];

function IconLockTiny({ className = 'w-2.5 h-2.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconCheckTiny({ className = 'w-2.5 h-2.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconCrossTiny({ className = 'w-2.5 h-2.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// ─── Status config ────────────────────────────────────────────────────────────

const ESTADO_CFG: Record<ModuloEstado, { label: string; Icon?: (props: { className?: string }) => React.ReactElement; color: string; bg: string; border: string }> = {
  pending:    { label: 'Pendiente',  color: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' },
  procesando: { label: 'Procesando', color: '#FCD34D',              bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  completado: { label: 'Listo',      Icon: IconCheckTiny, color: '#34D399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)'  },
  error:      { label: 'Error',      Icon: IconCrossTiny, color: '#F87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)'   },
};

// ─── ModuloCard ───────────────────────────────────────────────────────────────

interface ModuloCardProps {
  modulo: ModuloConfig;
  estado: ModuloEstado;
  onClick?: () => void;
  index: number;
  bloqueado?: boolean;
}

function ModuloCard({ modulo, estado, onClick, index, bloqueado = false }: ModuloCardProps) {
  const isDone   = estado === 'completado';
  const isActive = !bloqueado && (isDone || estado === 'procesando');
  const cfg      = ESTADO_CFG[estado];

  return (
    <motion.button
      onClick={bloqueado ? undefined : onClick}
      disabled={bloqueado}
      aria-disabled={bloqueado}
      title={bloqueado ? 'No tienes permiso para este módulo' : undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={bloqueado ? undefined : { y: -2, scale: 1.02 }}
      whileTap={bloqueado ? undefined : { scale: 0.97 }}
      className={`relative w-full text-left rounded-2xl overflow-hidden ${modulo.key === 'legal' ? 'col-span-2' : ''}`}
      style={{
        background: isActive
          ? `linear-gradient(135deg, ${modulo.color}14 0%, ${modulo.color}06 100%)`
          : 'rgba(255,255,255,0.025)',
        border: `1px solid ${isActive ? modulo.color + '35' : 'rgba(255,255,255,0.07)'}`,
        boxShadow: isDone && !bloqueado ? `0 4px 20px ${modulo.glow}20` : 'none',
        padding: '14px 14px 12px',
        opacity: bloqueado ? 0.55 : 1,
        cursor: bloqueado ? 'not-allowed' : 'pointer',
      }}
    >
      {/* Lock overlay — capacidad no concedida al trabajador */}
      {bloqueado && (
        <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-lg flex items-center justify-center"
             style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="rgba(255,255,255,0.5)"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
      )}
      {/* Top shimmer */}
      <div className="absolute top-0 left-0 right-0 h-px"
           style={{ background: `linear-gradient(90deg, transparent, ${isActive ? modulo.color + '50' : 'rgba(255,255,255,0.06)'}, transparent)` }} />

      {/* Left accent */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-r-sm"
             style={{ background: `linear-gradient(to bottom, ${modulo.color}, ${modulo.color}30)`, boxShadow: `0 0 8px ${modulo.glow}` }} />
      )}

      {/* Header row: icon + step */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: isActive ? `${modulo.color}18` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isActive ? modulo.color + '30' : 'rgba(255,255,255,0.07)'}`,
            boxShadow: isDone && !bloqueado ? `0 0 12px ${modulo.glow}` : 'none',
            color: isActive ? modulo.color : 'rgba(255,255,255,0.4)',
          }}
        >
          <modulo.Icon className="w-[18px] h-[18px]" />
        </div>
        <span className="font-mono text-[10px] font-bold" style={{ color: isActive ? modulo.color + 'aa' : 'rgba(255,255,255,0.15)' }}>
          {modulo.step}
        </span>
      </div>

      {/* Label */}
      <p className="text-[13px] font-semibold leading-tight mb-2.5"
         style={{ color: isActive ? modulo.color : 'rgba(255,255,255,0.25)' }}>
        {modulo.label}
      </p>

      {/* Status chip — "Bloqueado" si la capacidad no está concedida */}
      {bloqueado ? (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg"
             style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <IconLockTiny className="w-2.5 h-2.5 flex-shrink-0 text-white/40" />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Bloqueado
          </span>
        </div>
      ) : (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg"
             style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
          {estado === 'procesando' ? (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping flex-shrink-0" />
          ) : cfg.Icon ? (
            <cfg.Icon className="w-2.5 h-2.5 flex-shrink-0" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-white/20 flex-shrink-0" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
        </div>
      )}
    </motion.button>
  );
}

// ─── ModuloStepList ───────────────────────────────────────────────────────────

interface ModuloStepListProps {
  estados: Record<string, ModuloEstado>;
  onModuloClick?: (key: string) => void;
  // Mapa de capacidades efectivas (de /api/auth/me). Si se omite, nada se bloquea
  // (p. ej. el owner, que tiene todo en true). Un módulo se bloquea cuando su
  // clave está explícitamente en false.
  permisos?: Record<string, boolean>;
}

export function ModuloStepList({ estados, onModuloClick, permisos }: ModuloStepListProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MODULOS.map((modulo, i) => (
        <ModuloCard
          key={modulo.key}
          modulo={modulo}
          estado={estados[modulo.key] ?? 'pending'}
          onClick={() => onModuloClick?.(modulo.key)}
          index={i}
          bloqueado={permisos ? permisos[modulo.key] === false : false}
        />
      ))}
    </div>
  );
}

// ─── EmptyStateModuloCard ─────────────────────────────────────────────────────

export function EmptyStateModuloCard() {
  return (
    <div
      className="w-full max-w-sm rounded-2xl border border-white/[0.06] p-5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0a1520 0%, #0b1421 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

      {/* skeleton header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06]" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 w-28 rounded-full bg-white/[0.05]" />
          <div className="h-2 w-16 rounded-full bg-white/[0.03]" />
        </div>
        <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.05]" />
      </div>

      {/* 2x2 grid skeleton */}
      <div className="grid grid-cols-2 gap-2">
        {MODULOS.map((modulo, i) => (
          <div key={modulo.key} className={`rounded-2xl border border-white/[0.05] p-3.5 ${modulo.key === 'legal' ? 'col-span-2' : ''}`}
               style={{ background: 'rgba(255,255,255,0.015)' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center opacity-30 text-white">
                <modulo.Icon className="w-4 h-4" />
              </div>
              <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.1)' }}>{modulo.step}</span>
            </div>
            <div className="h-2 w-14 rounded-full bg-white/[0.05] mb-2.5" />
            <div className="h-5 w-16 rounded-lg bg-white/[0.03] border border-white/[0.04]" />
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.12)' }}>
        Agrega un producto para comenzar
      </p>
    </div>
  );
}

// ─── ModuloStepFlow — indicador de pasos del módulo (páginas de resultado y scope) ───

import type { ReactNode } from 'react';

interface StepItem {
  label: string;
  sub?: string;
  icon?: ReactNode;
}

interface ModuloStepFlowProps {
  /** Alias usado por la página de Ventas */
  paso?: string;
  /** Módulo actual ('mercado' | 'marketing' | 'ventas' | 'finanzas' | 'legal') */
  modulo?: string;
  steps?: StepItem[];
  currentStep?: number;
  title?: string;
  subtitle?: string;
  footnote?: string;
}

export default function ModuloStepFlow({
  paso,
  modulo,
  steps,
  currentStep = 0,
  title,
  subtitle,
  footnote,
}: ModuloStepFlowProps) {
  const activo = modulo ?? paso ?? '';
  const lista = steps ?? [];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          {subtitle && <p className="text-sm text-white/60">{subtitle}</p>}
          {activo && <span className="mt-2 inline-block rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-white/70">{activo}</span>}
        </div>
      )}

      {lista.length > 0 && (
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {lista.map((s, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <li
                key={`${s.label}-${i}`}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  done
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : active
                      ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                      : 'border-white/10 bg-white/[0.04] text-white/50'
                }`}
              >
                {s.icon && <span className="shrink-0">{s.icon}</span>}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.label}</span>
                  {s.sub && <span className="block truncate text-xs opacity-70">{s.sub}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {footnote && <p className="mt-4 text-xs text-white/40">{footnote}</p>}
    </div>
  );
}
