'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getImageUrl } from '@/lib/utils';
import { MODULE_THEME, type ModuloSlug } from '@/lib/moduleTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalisisSnap {
  id: string;
  estado: 'procesando' | 'completado' | 'error';
}

interface Producto {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precio: number | null;
  precio_esperado?: number | null;
  imagen_url: string | null;
  tipo?: 'producto' | 'servicio';
  estatus_proyecto?: string | null;
  puv?: string | null;
  created_at?: string;
}

interface ProductoResumen {
  id: string;
  nombre: string;
  categoria: string;
  precio_esperado: number | null;
  imagen_url: string | null;
  analisis: {
    mercado: AnalisisSnap | null;
    marketing: AnalisisSnap | null;
    ventas: AnalisisSnap | null;
    finanzas: AnalisisSnap | null;
    legal: AnalisisSnap | null;
  };
}

type ModuloKey = ModuloSlug;

interface AlertaUI {
  modulo: 'mercado' | 'finanzas' | 'legal';
  analisis_id: string;
  producto_id: string;
  nivel: 'verde' | 'amarillo' | 'rojo';
  tipo: string;
  titulo: string;
  mensaje: string;
  accion: string | null;
}

// Clases estáticas por nivel: Tailwind no purga bien las construidas en runtime.
const NIVEL_UI: Record<
  AlertaUI['nivel'],
  { label: string; card: string; badge: string; dot: string }
> = {
  rojo: {
    label: 'Crítico',
    card: 'border-rose-400/20 bg-rose-400/[0.06] hover:border-rose-400/40',
    badge: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
    dot: 'bg-rose-400',
  },
  amarillo: {
    label: 'Atención',
    card: 'border-amber-400/20 bg-amber-400/[0.06] hover:border-amber-400/40',
    badge: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  verde: {
    label: 'Informativo',
    card: 'border-emerald-400/20 bg-emerald-400/[0.06] hover:border-emerald-400/40',
    badge: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
};

// ─── Iconos (SVG hairline, estilo SF Symbols) ─────────────────────────────────

const ICONS: Record<ModuloKey, ReactNode> = {
  mercado: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" />
    </svg>
  ),
  marketing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M14.5 8.5a5 5 0 0 1 0 7M17.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  ventas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18" />
      <path d="M16.5 7.5c0-1.7-2-2.5-4.5-2.5S7.5 5.9 7.5 7.9c0 4.4 9 1.7 9 6.2 0 2-2 3-4.5 3s-4.5-.9-4.5-2.7" />
    </svg>
  ),
  finanzas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" />
      <path d="M21 11V6h-5" />
    </svg>
  ),
  legal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v16M7 20h10M12 6l7 2M12 6L5 8" />
      <path d="M5 8l-2 5a3 3 0 0 0 4 0L5 8ZM19 8l-2 5a3 3 0 0 0 4 0L19 8Z" />
    </svg>
  ),
};

// ─── Config de módulos ────────────────────────────────────────────────────────
// Color, títulos y descripciones viven en @/lib/moduleTheme (única fuente de
// verdad, compartida con las pantallas índice de cada módulo). `rgb` es un
// triplete sin coma para usarlo como rgb(var(--pd-rgb) / .12) desde globals.css
// y evitar clases dinámicas que Tailwind no purgaría bien.

const ESTADO_CONFIG: Record<
  AnalisisSnap['estado'],
  { label: string; cls: string; dot: string }
> = {
  completado: {
    label: 'Listo',
    cls: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
    dot: 'bg-emerald-400',
  },
  procesando: {
    label: 'En curso',
    cls: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
    dot: 'bg-sky-400 animate-pulse',
  },
  error: {
    label: 'Error',
    cls: 'bg-rose-400/10 text-rose-300 border-rose-400/20',
    dot: 'bg-rose-400',
  },
};

const MODULOS: ModuloKey[] = ['mercado', 'marketing', 'ventas', 'finanzas', 'legal'];

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-md">
      {children}
    </span>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const safeTotal = total > 0 ? total : 1;
  const pct = Math.max(0, Math.min(1, done / safeTotal));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative h-[84px] w-[84px] flex-shrink-0" aria-hidden="true">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="url(#pdRingGradient)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="pd-ring-progress"
        />
        <defs>
          <linearGradient id="pdRingGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E74C3C" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold leading-none tracking-tight text-white">
          {Math.round(pct * 100)}
          <span className="text-[10px] align-top text-white/40">%</span>
        </span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
          {done}/{safeTotal}
        </span>
      </div>
    </div>
  );
}

function SkeletonState() {
  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="pd-skeleton h-8 w-32 rounded-full" />
      <div className="pd-skeleton h-[188px] rounded-[28px]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {MODULOS.map((m) => (
          <div key={m} className="pd-skeleton h-[132px] rounded-[24px]" />
        ))}
      </div>
      <span className="sr-only">Cargando producto…</span>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ProductoDetailPage() {
  const router = useRouter();
  const { productoId } = useParams<{ productoId: string }>();

  const [producto, setProducto] = useState<Producto | null>(null);
  const [resumenProducto, setResumenProducto] = useState<ProductoResumen | null>(null);
  const [alertas, setAlertas] = useState<AlertaUI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productoId) return;

    let cancelado = false;

    Promise.all([
      api.get<Producto>(`/productos/${productoId}`),
      api.get<{ productos: ProductoResumen[] }>('/dashboard/resumen'),
      // Complementario: si /alertas falla, la página sigue viva y no redirige.
      api
        .get<{ alertas: AlertaUI[] }>(
          `/dashboard/alertas?producto_id=${encodeURIComponent(productoId)}&solo_accionables=1`
        )
        .catch(() => null),
    ])
      .then(([prodRes, resumenRes, alertasRes]) => {
        if (cancelado) return;
        setProducto(prodRes.data);
        const lista = resumenRes.data?.productos ?? [];
        setResumenProducto(lista.find((p) => p.id === productoId) ?? null);
        setAlertas(alertasRes?.data?.alertas ?? []);
      })
      .catch(() => {
        if (!cancelado) router.push('/dashboard');
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [productoId, router]);

  if (loading) return <SkeletonState />;

  if (!producto) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white/40">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <p className="text-sm text-white/50">No encontramos este producto.</p>
        <Link
          href="/dashboard"
          className="rounded-full border border-white/[0.1] px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/25 hover:text-white active:scale-[0.98]"
        >
          Volver al dashboard
        </Link>
      </div>
    );
  }

  const analisis = resumenProducto?.analisis ?? {
    mercado: null,
    marketing: null,
    ventas: null,
    finanzas: null,
    legal: null,
  };

  const completados = MODULOS.filter((m) => analisis[m]?.estado === 'completado').length;
  const enCurso = MODULOS.filter((m) => analisis[m]?.estado === 'procesando').length;
  const imgUrl = getImageUrl(producto.imagen_url);
  const precio = producto.precio ?? resumenProducto?.precio_esperado ?? null;

  const fechaCreacion = producto.created_at
    ? new Date(producto.created_at).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-16">
      {/* ── Volver ─────────────────────────────────────────────────────────── */}
      <Link
        href="/dashboard"
        className="pd-fade-in group inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] py-1.5 pl-2.5 pr-3.5 text-[11px] font-medium text-white/45 backdrop-blur-md transition hover:border-white/15 hover:text-white/85 active:scale-[0.97]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Dashboard
      </Link>

      {/* ── Hero del producto ──────────────────────────────────────────────── */}
      <section className="pd-fade-in pd-hero relative overflow-hidden rounded-[28px] p-6 sm:p-8" style={{ animationDelay: '60ms' }}>
        <div className="pd-hero-glow" aria-hidden="true" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Imagen / squircle */}
          <div className="pd-thumb h-20 w-20 flex-shrink-0 sm:h-[88px] sm:w-[88px]">
            {imgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgUrl}
                alt={producto.nombre}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-white/40" aria-hidden="true">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </span>
            )}
          </div>

          {/* Info principal */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {producto.categoria && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  {producto.categoria}
                </span>
              )}
              {enCurso > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-sky-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                  {enCurso} en curso
                </span>
              )}
            </div>

            <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.022em] text-white sm:text-[32px]">
              {producto.nombre}
            </h1>

            {producto.descripcion && (
              <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-white/55 line-clamp-3">
                {producto.descripcion}
              </p>
            )}

            {producto.puv && (
              <p className="mt-4 border-l-2 border-brand-accent/50 pl-3 text-[13px] italic leading-relaxed text-white/65">
                {producto.puv}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {precio != null && (
                <Chip>
                  <span className="text-white/40">MXN</span>
                  <span className="font-semibold text-white/90">
                    ${Number(precio).toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                  </span>
                </Chip>
              )}
              {producto.tipo && (
                <Chip>{producto.tipo === 'servicio' ? 'Servicio' : 'Producto'}</Chip>
              )}
              {producto.estatus_proyecto && <Chip>{producto.estatus_proyecto}</Chip>}
              {fechaCreacion && (
                <Chip>
                  <span className="text-white/40">Creado</span> {fechaCreacion}
                </Chip>
              )}
            </div>
          </div>

          {/* Progreso + acción */}
          <div className="flex items-center gap-5 sm:flex-col sm:items-end sm:gap-4">
            <ProgressRing done={completados} total={MODULOS.length} />
            <Link
              href={`/dashboard/mercado/${productoId}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[11px] font-semibold text-white/70 backdrop-blur-md transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white active:scale-[0.97]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Editar
            </Link>
          </div>
        </div>

        {/* Barra de progreso segmentada */}
        <div className="relative mt-7">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Progreso general
            </span>
            <span className="text-[11px] font-medium text-white/45">
              {completados} de {MODULOS.length} módulos completados
            </span>
          </div>
          <div className="flex gap-1.5" role="img" aria-label={`${completados} de ${MODULOS.length} módulos completados`}>
            {MODULOS.map((mod) => {
              const estado = analisis[mod]?.estado;
              const rgb = MODULE_THEME[mod].rgb;
              return (
                <span
                  key={mod}
                  className={`pd-seg h-1.5 flex-1 rounded-full ${
                    estado === 'procesando'
                      ? 'animate-pulse bg-sky-400/60'
                      : estado === 'error'
                      ? 'bg-rose-400/50'
                      : estado === 'completado'
                      ? ''
                      : 'bg-white/[0.06]'
                  }`}
                  style={
                    estado === 'completado'
                      ? { background: `linear-gradient(90deg, rgb(${rgb} / 0.5), rgb(${rgb}))` }
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Alertas de los análisis ────────────────────────────────────────── */}
      {alertas.length > 0 && (
        <section className="pd-fade-in space-y-3" style={{ animationDelay: '90ms' }}>
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Alertas detectadas
            </h2>
            <span className="text-[10px] text-white/25">
              {alertas.length} {alertas.length === 1 ? 'hallazgo' : 'hallazgos'}
            </span>
          </div>

          <ul className="space-y-2.5">
            {alertas.map((alerta, i) => {
              const ui = NIVEL_UI[alerta.nivel] ?? NIVEL_UI.amarillo;
              const moduloLabel = MODULE_THEME[alerta.modulo]?.short ?? alerta.modulo;

              return (
                <li key={`${alerta.modulo}-${alerta.analisis_id}-${i}`}>
                  <Link
                    href={`/dashboard/${alerta.modulo}/${productoId}/resultado/${alerta.analisis_id}`}
                    aria-label={`${ui.label} en ${moduloLabel}: ${alerta.titulo}`}
                    className={`block rounded-[20px] border p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 active:scale-[0.995] ${ui.card}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${ui.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} />
                        {ui.label}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        {moduloLabel}
                      </span>
                    </div>

                    <p className="mt-2 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-white/90">
                      {alerta.titulo}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-white/55">
                      {alerta.mensaje}
                    </p>

                    {alerta.accion && (
                      <p className="mt-2.5 border-l-2 border-white/15 pl-2.5 text-[11.5px] leading-relaxed text-white/70">
                        <span className="font-semibold text-white/50">Acción: </span>
                        {alerta.accion}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Módulos ────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            Módulos de análisis
          </h2>
          <span className="text-[10px] text-white/25">{MODULOS.length} disponibles</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {MODULOS.map((mod, i) => {
            const cfg = MODULE_THEME[mod];
            const snap = analisis[mod];
            const estadoCfg = snap ? ESTADO_CONFIG[snap.estado] ?? ESTADO_CONFIG.procesando : null;

            const href =
              snap?.estado === 'completado'
                ? `/dashboard/${mod}/${productoId}/resultado/${snap.id}`
                : `/dashboard/${mod}/${productoId}`;

            const cta =
              snap?.estado === 'completado'
                ? 'Ver resultados'
                : snap?.estado === 'procesando'
                ? 'Ver progreso en vivo'
                : snap?.estado === 'error'
                ? 'Reintentar análisis'
                : `Lanzar ${cfg.short.toLowerCase()}`;

            return (
              <Link
                key={mod}
                href={href}
                aria-label={`${cfg.titulo} — ${cta}`}
                className={`pd-tile pd-fade-in group relative overflow-hidden rounded-[24px] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  snap ? 'pd-tile--active' : 'pd-tile--empty'
                }`}
                style={{ '--pd-rgb': cfg.rgb, animationDelay: `${120 + i * 55}ms` } as CSSProperties}
              >
                <span className="pd-sheen" aria-hidden="true" />

                <div className="relative flex items-start gap-3.5">
                  <span className={`pd-icon flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[14px] ${snap ? '' : 'pd-icon--empty'}`}>
                    <span className="h-[19px] w-[19px]">{ICONS[mod]}</span>
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[14.5px] font-semibold leading-snug tracking-[-0.01em] ${snap ? 'pd-accent-text' : 'text-white/75'}`}>
                        {cfg.titulo}
                      </p>
                      {estadoCfg && (
                        <span className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${estadoCfg.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${estadoCfg.dot}`} />
                          {estadoCfg.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-white/35">
                      {cfg.descripcionCorta}
                    </p>
                  </div>
                </div>

                <div className="relative mt-4 flex items-center justify-between border-t border-white/[0.05] pt-3">
                  <span className={`text-[11.5px] font-medium ${snap ? 'pd-accent-text opacity-80' : 'text-white/40'} transition-opacity group-hover:opacity-100`}>
                    {cta}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-1 ${snap ? 'pd-accent-text' : 'text-white/35'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── CTA cuando no hay nada completado ──────────────────────────────── */}
      {completados === 0 && (
        <section className="pd-fade-in relative overflow-hidden rounded-[28px] border border-brand-accent/20 bg-brand-accent/[0.06] p-8 text-center" style={{ animationDelay: '420ms' }}>
          <div className="pd-cta-glow" aria-hidden="true" />
          <div className="relative mx-auto max-w-md space-y-3">
            <h3 className="text-lg font-semibold tracking-[-0.015em] text-white">
              Empieza por validar el mercado
            </h3>
            <p className="text-[13.5px] leading-relaxed text-white/55">
              El análisis de mercado tarda 2–3 minutos y es la base del resto de los módulos.
            </p>
            <Link
              href={`/dashboard/mercado/${productoId}`}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-accent px-6 py-3 text-[13px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(231,76,60,0.7)] transition-all duration-300 hover:bg-[#EF5A4A] hover:shadow-[0_14px_40px_-10px_rgba(231,76,60,0.85)] active:scale-[0.98]"
            >
              Iniciar análisis de mercado
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}