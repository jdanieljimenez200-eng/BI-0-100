'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  Package,
  Plus,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import api from '@/lib/api';
import { MODULE_THEME } from '@/lib/moduleTheme';
import {
  IconCheck,
  IconFinanzas,
  IconLegal,
  IconMarketing,
  IconMercado,
  IconMetricas,
  IconVentas,
} from '@/components/ui/ModuleIcons';

/* ────────────────────────────────────────────────────────────────────────────
   Tipos — contrato de GET /dashboard/resumen (backend/src/routes/dashboard.ts)
   ────────────────────────────────────────────────────────────────────────── */

interface AnalisisSnap {
  id: string;
  estado: string;
}

interface ProductoResumen {
  id: string;
  nombre: string;
  categoria: string;
  precio: number | null;
  imagen_url: string | null;
  negocio_id: string | null;
  negocio_nombre: string | null;
  negocio_emoji: string | null;
  dentro_del_plan: boolean;
  analisis: {
    mercado: AnalisisSnap | null;
    marketing: AnalisisSnap | null;
    ventas: AnalisisSnap | null;
    finanzas: AnalisisSnap | null;
    legal: AnalisisSnap | null;
  };
}

interface Usuario {
  nombre: string;
  email: string;
  plan: string;
}

type ModuloKey = 'mercado' | 'marketing' | 'ventas' | 'finanzas' | 'legal';

type IconComponent = (props: { className?: string }) => ReactElement;

const MODULOS: ModuloKey[] = ['mercado', 'marketing', 'ventas', 'finanzas', 'legal'];

const MODULE_CONFIG: Record<ModuloKey, { label: string; hex: string; Icon: IconComponent }> = {
  mercado: { label: 'Mercado', hex: MODULE_THEME.mercado.hex, Icon: IconMercado },
  marketing: { label: 'Marketing', hex: MODULE_THEME.marketing.hex, Icon: IconMarketing },
  ventas: { label: 'Ventas', hex: MODULE_THEME.ventas.hex, Icon: IconVentas },
  finanzas: { label: 'Finanzas', hex: MODULE_THEME.finanzas.hex, Icon: IconFinanzas },
  legal: { label: 'Legal', hex: MODULE_THEME.legal.hex, Icon: IconLegal },
};

const ACCENT = '#E74C3C';

/* ────────────────────────────────────────────────────────────────────────────
   Iconografía canónica unificada con Lucide (trazo 1.8)
   ────────────────────────────────────────────────────────────────────────── */

function IconProceso({ className }: { className?: string }): ReactElement {
  return <RefreshCw className={className} strokeWidth={1.8} aria-hidden="true" />;
}

function IconProductos({ className }: { className?: string }): ReactElement {
  return <Package className={className} strokeWidth={1.8} aria-hidden="true" />;
}

function IconArrow({ className }: { className?: string }): ReactElement {
  return <ArrowRight className={className} strokeWidth={2} aria-hidden="true" />;
}

function IconPlus({ className }: { className?: string }): ReactElement {
  return <Plus className={className} strokeWidth={2} aria-hidden="true" />;
}

function IconSpark({ className }: { className?: string }): ReactElement {
  return <Sparkles className={className} strokeWidth={1.8} aria-hidden="true" />;
}

function IconImagen({ className }: { className?: string }): ReactElement {
  return <ImageIcon className={className} strokeWidth={1.8} aria-hidden="true" />;
}

/* ────────────────────────────────────────────────────────────────────────────
   Utilidades
   ────────────────────────────────────────────────────────────────────────── */

function getSaludo(hora: number): { saludo: string; periodo: string } {
  if (hora >= 5 && hora < 12) return { saludo: 'Buenos días', periodo: 'mañana' };
  if (hora >= 12 && hora < 19) return { saludo: 'Buenas tardes', periodo: 'tarde' };
  return { saludo: 'Buenas noches', periodo: 'noche' };
}

/**
 * Resuelve `imagen_url` a una URL utilizable por el navegador.
 * En prod llega absoluta (S3); en dev llega relativa (`/uploads/...`) y hay que
 * colgarla del origen del backend, no del de Next. NEXT_PUBLIC_API_URL incluye
 * el sufijo `/api`, así que se recorta.
 */
function resolveImagenUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const valor = raw.trim();
  if (valor === '') return null;
  if (/^(https?:)?\/\//i.test(valor) || valor.startsWith('data:')) return valor;

  const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(
    /\/api\/?$/,
    '',
  );
  return `${base.replace(/\/$/, '')}/${valor.replace(/^\//, '')}`;
}

function formatPrecio(valor: number | null): string | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(valor);
  } catch {
    return `$${Math.round(valor)}`;
  }
}

/** Contador animado con requestAnimationFrame (easing out-cubic). */
function useCountUp(target: number, enabled: boolean, duration = 850): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frame = useRef<number | null>(null);
  const origin = useRef(0);

  useEffect(() => {
    if (!enabled) {
      origin.current = target;
      setValue(target);
      return;
    }

    const desde = origin.current;
    const delta = target - desde;
    const inicio = performance.now();

    const tick = (ahora: number) => {
      const t = Math.min((ahora - inicio) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(desde + delta * eased));
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        origin.current = target;
        frame.current = null;
      }
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, enabled, duration]);

  return value;
}

/* ────────────────────────────────────────────────────────────────────────────
   Piezas visuales
   ────────────────────────────────────────────────────────────────────────── */

function ProgressRing({
  ratio,
  hex,
  size = 60,
  stroke = 4,
  animar,
}: {
  ratio: number;
  hex: string;
  size?: number;
  stroke?: number;
  animar: boolean;
}): ReactElement {
  const radio = (size - stroke) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const objetivo = circunferencia * (1 - pct);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 flex-shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radio}
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radio}
        fill="none"
        stroke={hex}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circunferencia}
        initial={{ strokeDashoffset: animar ? circunferencia : objetivo }}
        animate={{ strokeDashoffset: objetivo }}
        transition={{ duration: animar ? 1.1 : 0, ease: 'easeOut' }}
      />
    </svg>
  );
}

function SkeletonCard({ alto = 'h-32' }: { alto?: string }): ReactElement {
  return (
    <div
      className={`${alto} rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden relative`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tarjeta de producto — con área de imagen 16:10
   ────────────────────────────────────────────────────────────────────────── */

function ProductoCard({
  producto,
  animar,
  variants,
}: {
  producto: ProductoResumen;
  animar: boolean;
  variants: Variants;
}): ReactElement {
  const [imgEstado, setImgEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');

  const src = resolveImagenUrl(producto.imagen_url);
  const mostrarImagen = src !== null && imgEstado !== 'error';

  const completados = MODULOS.filter((m) => producto.analisis?.[m]?.estado === 'completado').length;
  const enProceso = MODULOS.filter((m) => producto.analisis?.[m]?.estado === 'procesando').length;
  const ratio = completados / MODULOS.length;
  const precio = formatPrecio(producto.precio);
  const inicial = producto.nombre.trim().charAt(0).toUpperCase() || '?';

  return (
    <motion.div variants={variants}>
      <motion.div
        whileHover={animar ? { y: -6 } : undefined}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        className="h-full"
      >
        <Link
          href={`/dashboard/producto/${producto.id}`}
          className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl transition-colors duration-300 hover:border-brand-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${
            producto.dentro_del_plan ? '' : 'opacity-70 hover:opacity-100'
          }`}
        >
          {/* ── Área de imagen ───────────────────────────────────────────── */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0B111C]">
            {/* Trama de fondo, visible tras la imagen y en el estado vacío */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.10) 1px, transparent 0)',
                backgroundSize: '14px 14px',
              }}
              aria-hidden="true"
            />

            {mostrarImagen ? (
              <>
                {imgEstado === 'cargando' && (
                  <div
                    className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
                    aria-hidden="true"
                  />
                )}
                {/* next/image está en modo unoptimized y las imágenes pueden venir
                    de S3 (dominio arbitrario), así que se usa <img> nativo. */}
                <img
                  src={src ?? ''}
                  alt={`Imagen de ${producto.nombre}`}
                  loading="lazy"
                  decoding="async"
                  onLoad={() => setImgEstado('ok')}
                  onError={() => setImgEstado('error')}
                  className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
                    imgEstado === 'ok' ? 'opacity-100' : 'opacity-0'
                  } ${animar ? 'group-hover:scale-[1.06]' : ''}`}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-lg font-black text-white/70"
                  style={{ background: 'rgba(231,76,60,0.10)' }}
                >
                  {producto.negocio_emoji ? (
                    <span className="text-xl leading-none">{producto.negocio_emoji}</span>
                  ) : (
                    inicial
                  )}
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/25">
                  <IconImagen className="h-3.5 w-3.5" />
                  Sin imagen
                </span>
              </div>
            )}

            {/* Degradado inferior para asegurar contraste de los overlays */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#070B12] via-[#070B12]/60 to-transparent"
              aria-hidden="true"
            />

            {/* Carpeta / negocio */}
            {producto.negocio_nombre && (
              <span className="absolute left-3 top-3 inline-flex max-w-[70%] items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white/75 backdrop-blur-md">
                {producto.negocio_emoji && <span className="leading-none">{producto.negocio_emoji}</span>}
                <span className="truncate">{producto.negocio_nombre}</span>
              </span>
            )}

            {/* Fuera del plan (p. ej. tras un downgrade) */}
            {!producto.dentro_del_plan && (
              <span className="absolute right-3 top-3 rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-300 backdrop-blur-md">
                Fuera del plan
              </span>
            )}

            {/* Progreso global del producto */}
            <div className="absolute bottom-3 right-3 flex items-center justify-center">
              <div className="relative flex items-center justify-center rounded-full bg-black/40 p-0.5 backdrop-blur-md">
                <ProgressRing ratio={ratio} hex={ACCENT} size={46} stroke={3} animar={animar} />
                <span className="absolute text-[10px] font-black tabular-nums text-white">
                  {Math.round(ratio * 100)}%
                </span>
              </div>
            </div>

            {/* Estado en curso */}
            {enProceso > 0 && (
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white/80 backdrop-blur-md">
                <motion.span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-brand-accent"
                  animate={animar ? { opacity: [1, 0.2, 1] } : undefined}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                />
                {enProceso} en curso
              </span>
            )}
          </div>

          {/* ── Contenido ────────────────────────────────────────────────── */}
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 flex-1 truncate text-base font-bold text-white transition-colors duration-300 group-hover:text-brand-accent">
                {producto.nombre}
              </h3>
              {precio && (
                <span className="flex-shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold tabular-nums text-white/70">
                  {precio}
                </span>
              )}
            </div>

            <p className="mt-1.5 truncate text-[11px] text-white/40">
              {producto.categoria ? `${producto.categoria} · ` : ''}
              {completados} de {MODULOS.length} módulos completados
            </p>

            {/* Segmentos por módulo */}
            <div className="mt-4 flex gap-1.5">
              {MODULOS.map((m, idx) => {
                const snap = producto.analisis?.[m];
                const cfg = MODULE_CONFIG[m];
                const completo = snap?.estado === 'completado';
                const procesando = snap?.estado === 'procesando';

                return (
                  <div key={m} className="relative flex-1" title={cfg.label}>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: completo || procesando ? cfg.hex : 'transparent',
                          opacity: procesando ? 0.55 : 1,
                        }}
                        initial={{ width: animar ? 0 : completo || procesando ? '100%' : 0 }}
                        animate={{ width: completo || procesando ? '100%' : 0 }}
                        transition={{
                          duration: animar ? 0.6 : 0,
                          ease: 'easeOut',
                          delay: animar ? 0.2 + idx * 0.06 : 0,
                        }}
                      />
                    </div>
                    {procesando && (
                      <motion.span
                        className="absolute inset-0 rounded-full"
                        style={{ background: cfg.hex, opacity: 0.25 }}
                        animate={animar ? { opacity: [0.1, 0.4, 0.1] } : undefined}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Iconos de módulo con estado */}
            <div className="mt-4 flex items-center gap-2">
              {MODULOS.map((m) => {
                const snap = producto.analisis?.[m];
                const cfg = MODULE_CONFIG[m];
                const activo = snap?.estado === 'completado' || snap?.estado === 'procesando';

                return (
                  <span
                    key={m}
                    title={`${cfg.label}: ${
                      snap?.estado === 'completado'
                        ? 'completado'
                        : snap?.estado === 'procesando'
                          ? 'en proceso'
                          : 'pendiente'
                    }`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:scale-105"
                    style={{
                      color: activo ? cfg.hex : 'rgba(255,255,255,0.25)',
                      borderColor: activo ? `${cfg.hex}33` : 'rgba(255,255,255,0.07)',
                      background: activo ? `${cfg.hex}12` : 'transparent',
                    }}
                  >
                    <cfg.Icon className="h-3.5 w-3.5" />
                  </span>
                );
              })}
            </div>

            <div className="mt-auto flex items-center gap-1.5 border-t border-white/[0.06] pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35 transition-colors duration-300 group-hover:text-brand-accent">
              Ver análisis
              <IconArrow className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" />
            </div>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Página
   ────────────────────────────────────────────────────────────────────────── */

export default function DashboardPage(): ReactElement {
  const router = useRouter();
  const reducir = useReducedMotion();
  const animar = !reducir;

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [saludo, setSaludo] = useState('Hola');
  const [periodo, setPeriodo] = useState('jornada');
  const [fechaLarga, setFechaLarga] = useState('');

  /* Saludo y fecha se calculan en cliente para evitar desajustes de hidratación. */
  useEffect(() => {
    const ahora = new Date();
    const g = getSaludo(ahora.getHours());
    setSaludo(g.saludo);
    setPeriodo(g.periodo);
    try {
      setFechaLarga(
        new Intl.DateTimeFormat('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(ahora),
      );
    } catch {
      setFechaLarga(ahora.toLocaleDateString());
    }
  }, []);

  useEffect(() => {
    let vivo = true;

    const guardado = localStorage.getItem('usuario');
    if (guardado) {
      try {
        setUsuario(JSON.parse(guardado) as Usuario);
      } catch {
        localStorage.removeItem('usuario');
      }
    }

    const cargarUsuario = api
      .get('/auth/me')
      .then(({ data }) => {
        if (!vivo) return;
        const actual = localStorage.getItem('usuario');
        let parsed: Record<string, unknown> = {};
        try {
          parsed = actual ? (JSON.parse(actual) as Record<string, unknown>) : {};
        } catch {
          parsed = {};
        }
        const actualizado: Usuario = {
          ...(parsed as unknown as Usuario),
          nombre: data?.name ?? data?.nombre ?? '',
          email: data?.email ?? '',
          plan: data?.plan ?? 'freemium',
        };
        localStorage.setItem('usuario', JSON.stringify(actualizado));
        setUsuario(actualizado);
      })
      .catch(() => {
        if (vivo) router.push('/auth/login');
      });

    const cargarResumen = api
      .get('/dashboard/resumen')
      .then(({ data }) => {
        if (!vivo) return;
        setProductos(Array.isArray(data?.productos) ? (data.productos as ProductoResumen[]) : []);
      })
      .catch(() => {
        if (vivo) setProductos([]);
      });

    Promise.all([cargarUsuario, cargarResumen]).finally(() => {
      if (vivo) setLoading(false);
    });

    return () => {
      vivo = false;
    };
  }, [router]);

  const stats = useMemo(() => {
    let completados = 0;
    let enProceso = 0;

    const moduloStats: Record<ModuloKey, { completados: number; enProceso: number }> = {
      mercado: { completados: 0, enProceso: 0 },
      marketing: { completados: 0, enProceso: 0 },
      ventas: { completados: 0, enProceso: 0 },
      finanzas: { completados: 0, enProceso: 0 },
      legal: { completados: 0, enProceso: 0 },
    };

    productos.forEach((p) => {
      MODULOS.forEach((mod) => {
        const snap = p.analisis?.[mod];
        if (!snap) return;
        if (snap.estado === 'completado') {
          completados += 1;
          moduloStats[mod].completados += 1;
        } else if (snap.estado === 'procesando') {
          enProceso += 1;
          moduloStats[mod].enProceso += 1;
        }
      });
    });

    const capacidad = productos.length * MODULOS.length;

    return {
      completados,
      enProceso,
      total: completados + enProceso,
      capacidad,
      cobertura: capacidad > 0 ? completados / capacidad : 0,
      moduloStats,
    };
  }, [productos]);

  const valCompletados = useCountUp(stats.completados, animar && !loading);
  const valProceso = useCountUp(stats.enProceso, animar && !loading);
  const valTotal = useCountUp(stats.total, animar && !loading);
  const valProductos = useCountUp(productos.length, animar && !loading);
  const valCobertura = useCountUp(Math.round(stats.cobertura * 100), animar && !loading);

  const contenedor: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: animar ? 0.07 : 0, delayChildren: animar ? 0.04 : 0 } },
  };

  const item: Variants = animar
    ? {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
      }
    : { hidden: { opacity: 1 }, show: { opacity: 1 } };

  const primerNombre = usuario?.nombre?.trim().split(' ')[0] || 'Usuario';
  const productosVisibles = productos.slice(0, 6);

  return (
    <div className="relative space-y-10">
      {/* Luz ambiental */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <motion.div
          className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full blur-[130px]"
          style={{ background: 'rgba(231,76,60,0.10)' }}
          animate={animar ? { opacity: [0.5, 0.9, 0.5], scale: [1, 1.08, 1] } : undefined}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-40 right-0 h-[380px] w-[380px] rounded-full blur-[130px]"
          style={{ background: 'rgba(59,130,246,0.08)' }}
          animate={animar ? { opacity: [0.4, 0.75, 0.4], scale: [1.05, 1, 1.05] } : undefined}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <motion.header
        variants={contenedor}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"
      >
        <motion.div variants={item} className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-accent opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-accent" />
            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brand-accent/80">
              Panel de control
            </p>
            {fechaLarga && (
              <>
                <span className="h-3 w-px bg-white/10" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  {fechaLarga}
                </p>
              </>
            )}
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.05]">
            {saludo},{' '}
            <span className="bg-gradient-to-r from-brand-accent via-[#F0705F] to-brand-accent bg-clip-text text-transparent">
              {primerNombre}
            </span>
          </h1>

          <p className="max-w-xl text-sm text-white/45">
            Este es el estado de tu inteligencia de negocio esta {periodo}. Cinco módulos
            independientes por producto, listos en minutos.
          </p>
        </motion.div>

        <motion.div variants={item} className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/producto"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/70 backdrop-blur-xl transition-all duration-300 hover:border-white/25 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <IconProductos className="h-4 w-4" />
            Mis productos
          </Link>

          <motion.div whileHover={animar ? { scale: 1.03 } : undefined} whileTap={animar ? { scale: 0.97 } : undefined}>
            <Link
              href="/dashboard/nuevo"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-accent px-5 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(231,76,60,0.28)] transition-shadow duration-300 hover:shadow-[0_0_38px_rgba(231,76,60,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60"
            >
              <IconPlus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              Nuevo análisis
            </Link>
          </motion.div>
        </motion.div>
      </motion.header>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="kpis-skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} alto="h-36" />
            ))}
          </motion.div>
        ) : (
          <motion.section
            key="kpis"
            variants={contenedor}
            initial="hidden"
            animate="show"
            aria-label="Métricas generales"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {/* Cobertura global */}
            <motion.div
              variants={item}
              whileHover={animar ? { y: -4 } : undefined}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="group relative overflow-hidden rounded-2xl border border-brand-accent/25 bg-brand-accent/[0.07] p-5 backdrop-blur-xl transition-colors duration-300 hover:border-brand-accent/45 sm:col-span-2 xl:col-span-1"
            >
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-accent/15 blur-3xl transition-opacity duration-500 group-hover:opacity-100 sm:opacity-70" />
              <div className="relative flex items-center gap-4">
                <div className="relative flex items-center justify-center">
                  <ProgressRing ratio={stats.cobertura} hex={ACCENT} animar={animar} size={64} />
                  <span className="absolute text-[13px] font-black text-white">{valCobertura}%</span>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-brand-accent/85">
                    Cobertura
                  </p>
                  <p className="text-2xl font-black leading-none text-white">
                    {valCompletados}
                    <span className="text-base font-bold text-white/35"> / {stats.capacidad}</span>
                  </p>
                  <p className="mt-1.5 text-[11px] text-white/45">Módulos analizados sobre el total</p>
                </div>
              </div>
            </motion.div>

            {/* Completados */}
            <StatCard
              variants={item}
              animar={animar}
              label="Completados"
              valor={valCompletados}
              detalle="Informes listos para revisar y exportar"
              hex={MODULE_THEME.finanzas.hex}
              Icon={IconCheck}
            />

            {/* En proceso */}
            <StatCard
              variants={item}
              animar={animar}
              label="En proceso"
              valor={valProceso}
              detalle={stats.enProceso > 0 ? 'La IA está generando tus informes' : 'Sin trabajos en la cola'}
              hex={MODULE_THEME.ventas.hex}
              Icon={IconProceso}
              girar={stats.enProceso > 0 && animar}
            />

            {/* Productos */}
            <StatCard
              variants={item}
              animar={animar}
              label="Productos"
              valor={valProductos}
              detalle={`${valTotal} análisis lanzados en total`}
              hex={MODULE_THEME.mercado.hex}
              Icon={IconProductos}
            />
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Portafolio ───────────────────────────────────────────────────── */}
      <section aria-label="Tus productos" className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-brand-accent/80">
              Portafolio
            </p>
            <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">
              Tus productos y servicios
            </h2>
          </div>
          {productos.length > 6 && (
            <Link
              href="/dashboard/producto"
              className="group inline-flex items-center gap-1.5 rounded text-xs font-bold text-white/50 transition-colors hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            >
              Ver los {productos.length}
              <IconArrow className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} alto="h-[26rem]" />
            ))}
          </div>
        ) : productos.length === 0 ? (
          <motion.div
            initial={animar ? { opacity: 0, y: 14 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/50 to-transparent" />
            <motion.div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-accent/25 bg-brand-accent/10 text-brand-accent"
              animate={animar ? { y: [0, -6, 0] } : undefined}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <IconSpark className="h-6 w-6" />
            </motion.div>
            <h3 className="mb-2 text-lg font-black text-white">Todavía no hay nada que analizar</h3>
            <p className="mx-auto mb-6 max-w-md text-sm text-white/45">
              Sube tu primer producto o servicio con su imagen y en dos o tres minutos tendrás
              Mercado, Marketing, Ventas, Finanzas y Legal sobre la mesa.
            </p>
            <motion.div
              className="inline-block"
              whileHover={animar ? { scale: 1.04 } : undefined}
              whileTap={animar ? { scale: 0.97 } : undefined}
            >
              <Link
                href="/dashboard/nuevo"
                className="group inline-flex items-center gap-2 rounded-xl bg-gradient-accent px-6 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(231,76,60,0.3)] transition-shadow duration-300 hover:shadow-[0_0_40px_rgba(231,76,60,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60"
              >
                <IconPlus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
                Crear mi primer análisis
              </Link>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            variants={contenedor}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {productosVisibles.map((producto) => (
              <ProductoCard
                key={producto.id}
                producto={producto}
                animar={animar}
                variants={item}
              />
            ))}
          </motion.div>
        )}
      </section>

      {/* ── Desglose por módulo ──────────────────────────────────────────── */}
      <section aria-label="Desglose por módulo" className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-brand-accent/80">
              Desglose
            </p>
            <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">
              Estado por módulo inteligente
            </h2>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-white/35 sm:flex">
            <IconMetricas className="h-4 w-4" />
            Distribución de análisis
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {MODULOS.map((m) => (
              <SkeletonCard key={m} alto="h-40" />
            ))}
          </div>
        ) : (
          <motion.div
            variants={contenedor}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            {MODULOS.map((mod) => {
              const cfg = MODULE_CONFIG[mod];
              const datos = stats.moduloStats[mod];
              const total = datos.completados + datos.enProceso;
              const ratio = productos.length > 0 ? datos.completados / productos.length : 0;

              return (
                <motion.div key={mod} variants={item}>
                  <motion.div
                    whileHover={animar ? { y: -5 } : undefined}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                    className="h-full"
                  >
                    <Link
                      href={`/dashboard/${mod}`}
                      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur-xl transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
                    >
                      {/* Halo del color del módulo al hover */}
                      <div
                        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: cfg.hex }}
                        aria-hidden="true"
                      />
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: `linear-gradient(90deg, transparent, ${cfg.hex}, transparent)` }}
                        aria-hidden="true"
                      />

                      <div className="relative mb-4 flex items-center justify-between">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110"
                          style={{
                            color: cfg.hex,
                            borderColor: `${cfg.hex}33`,
                            background: `${cfg.hex}14`,
                          }}
                        >
                          <cfg.Icon className="h-4 w-4" />
                        </div>
                        <span className="text-[11px] font-black tabular-nums text-white/70">
                          {datos.completados}
                          <span className="text-white/25">/{productos.length || 0}</span>
                        </span>
                      </div>

                      <p className="relative text-sm font-bold text-white transition-transform duration-300 group-hover:translate-x-0.5">
                        {cfg.label}
                      </p>

                      <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: cfg.hex }}
                          initial={{ width: animar ? 0 : `${ratio * 100}%` }}
                          animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
                          transition={{ duration: animar ? 0.9 : 0, ease: 'easeOut', delay: animar ? 0.15 : 0 }}
                        />
                      </div>

                      <div className="relative mt-3 flex-1 space-y-1.5">
                        {total === 0 ? (
                          <p className="text-[11px] text-white/35">Sin análisis aún</p>
                        ) : (
                          <>
                            {datos.completados > 0 && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-white/45">Completados</span>
                                <span className="font-bold tabular-nums text-white">{datos.completados}</span>
                              </div>
                            )}
                            {datos.enProceso > 0 && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-white/45">En proceso</span>
                                <span className="flex items-center gap-1.5 font-bold tabular-nums text-white">
                                  <motion.span
                                    className="inline-block h-1.5 w-1.5 rounded-full"
                                    style={{ background: cfg.hex }}
                                    animate={animar ? { opacity: [1, 0.25, 1] } : undefined}
                                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                                  />
                                  {datos.enProceso}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="relative mt-4 flex items-center gap-1.5 border-t border-white/[0.06] pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35 transition-colors duration-300 group-hover:text-white/80">
                        Abrir módulo
                        <IconArrow className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" />
                      </div>
                    </Link>
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </section>

      {/* ── CTA final ────────────────────────────────────────────────────── */}
      {!loading && productos.length > 0 && (
        <motion.section
          initial={animar ? { opacity: 0, y: 18 } : false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-2xl border border-brand-accent/20 bg-brand-accent/[0.06] p-8 backdrop-blur-xl sm:p-10"
        >
          <motion.div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-accent/15 blur-[90px]"
            animate={animar ? { scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] } : undefined}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
          <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-accent/25 bg-brand-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand-accent">
                <IconSpark className="h-3.5 w-3.5" />
                2–3 minutos
              </div>
              <h3 className="mb-2 text-xl font-black tracking-tight text-white sm:text-2xl">
                ¿Listo para el siguiente análisis?
              </h3>
              <p className="text-sm text-white/50">
                Carga otro producto o servicio y obtén Mercado, Marketing, Ventas, Finanzas y Legal
                como informes independientes, exportables a PDF.
              </p>
            </div>

            <motion.div
              whileHover={animar ? { scale: 1.04 } : undefined}
              whileTap={animar ? { scale: 0.97 } : undefined}
              className="flex-shrink-0"
            >
              <Link
                href="/dashboard/nuevo"
                className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-accent px-7 py-4 text-base font-black text-white shadow-[0_0_28px_rgba(231,76,60,0.3)] transition-shadow duration-300 hover:shadow-[0_0_46px_rgba(231,76,60,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60"
              >
                <IconPlus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
                Nuevo análisis
                <IconArrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </div>
        </motion.section>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tarjeta de métrica
   ────────────────────────────────────────────────────────────────────────── */

function StatCard({
  label,
  valor,
  detalle,
  hex,
  Icon,
  variants,
  animar,
  girar = false,
}: {
  label: string;
  valor: number;
  detalle: string;
  hex: string;
  Icon: IconComponent;
  variants: Variants;
  animar: boolean;
  girar?: boolean;
}): ReactElement {
  return (
    <motion.div
      variants={variants}
      whileHover={animar ? { y: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl transition-colors duration-300 hover:border-white/20"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: hex }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${hex}, transparent)` }}
        aria-hidden="true"
      />

      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
            {label}
          </p>
          <p className="text-3xl font-black leading-none tabular-nums text-white">{valor}</p>
        </div>
        <motion.div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110"
          style={{ color: hex, borderColor: `${hex}33`, background: `${hex}12` }}
          animate={girar ? { rotate: 360 } : undefined}
          transition={girar ? { duration: 2.4, repeat: Infinity, ease: 'linear' } : undefined}
        >
          <Icon className="h-5 w-5" />
        </motion.div>
      </div>

      <p className="relative text-[12px] leading-relaxed text-white/45">{detalle}</p>
    </motion.div>
  );
}