'use client';

/**
 * /dashboard/producto — listado completo del portafolio.
 *
 * El dashboard enlaza aquí ("Mis productos" y "Ver los N"), pero la carpeta solo
 * contenía el segmento dinámico [productoId], por lo que la ruta padre devolvía
 * 404. Esta página consume el mismo contrato que /dashboard (GET /dashboard/resumen)
 * y añade búsqueda, filtros y orden sobre el conjunto completo, sin el recorte de
 * 6 tarjetas que aplica el panel principal.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import api from '@/lib/api';
import {
  IconCheck,
  IconFinanzas,
  IconLegal,
  IconMarketing,
  IconMercado,
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

type ModuloKey = 'mercado' | 'marketing' | 'ventas' | 'finanzas' | 'legal';

type IconComponent = (props: { className?: string }) => ReactElement;

type FiltroEstado = 'todos' | 'completos' | 'proceso' | 'pendientes';

type Orden = 'nombre' | 'avance' | 'precio';

const MODULOS: ModuloKey[] = ['mercado', 'marketing', 'ventas', 'finanzas', 'legal'];

const MODULE_CONFIG: Record<ModuloKey, { label: string; hex: string; Icon: IconComponent }> = {
  mercado: { label: 'Mercado', hex: '#3B82F6', Icon: IconMercado },
  marketing: { label: 'Marketing', hex: '#8B5CF6', Icon: IconMarketing },
  ventas: { label: 'Ventas', hex: '#F97316', Icon: IconVentas },
  finanzas: { label: 'Finanzas', hex: '#10B981', Icon: IconFinanzas },
  legal: { label: 'Legal', hex: '#7C3AED', Icon: IconLegal },
};

const ESTADOS: { key: FiltroEstado; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'completos', label: 'Completos' },
  { key: 'proceso', label: 'En proceso' },
  { key: 'pendientes', label: 'Sin empezar' },
];

const ORDENES: { key: Orden; label: string }[] = [
  { key: 'nombre', label: 'Nombre (A-Z)' },
  { key: 'avance', label: 'Más avanzados' },
  { key: 'precio', label: 'Precio (mayor)' },
];

/* ────────────────────────────────────────────────────────────────────────────
   Iconografía local (trazo 1.7, currentColor — coherente con ModuleIcons)
   ────────────────────────────────────────────────────────────────────────── */

function IconProductos({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8.5 12 13 3 8.5 12 4l9 4.5z" />
      <path d="M3 8.5v7L12 20l9-4.5v-7" />
      <path d="M12 13v7" />
    </svg>
  );
}

function IconProceso({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconArrow({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function IconArrowLeft({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

function IconImagen({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.75" cy="9.75" r="1.6" />
      <path d="M21 15.5l-4.6-4.1a1.6 1.6 0 0 0-2.2.06L4.2 20" />
    </svg>
  );
}

function IconAlerta({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 2.4 18a1.8 1.8 0 0 0 1.6 2.7h16a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Utilidades
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Resuelve `imagen_url` a una URL utilizable por el navegador.
 * En prod llega absoluta (S3); en dev llega relativa (`/uploads/...`) y hay que
 * colgarla del origen del backend. NEXT_PUBLIC_API_URL incluye `/api`, se recorta.
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

/** Normaliza para búsqueda: minúsculas y sin diacríticos. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function contarEstados(producto: ProductoResumen): { completados: number; enProceso: number } {
  let completados = 0;
  let enProceso = 0;
  MODULOS.forEach((mod) => {
    const estado = producto.analisis?.[mod]?.estado;
    if (estado === 'completado') completados += 1;
    else if (estado === 'procesando') enProceso += 1;
  });
  return { completados, enProceso };
}

/* ────────────────────────────────────────────────────────────────────────────
   Piezas visuales
   ────────────────────────────────────────────────────────────────────────── */

function SkeletonCard({ alto = 'h-[26rem]' }: { alto?: string }): ReactElement {
  return (
    <div
      className={`${alto} relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

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

  const { completados, enProceso } = contarEstados(producto);
  const pct = Math.round((completados / MODULOS.length) * 100);
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src ?? ''}
                  alt={producto.nombre}
                  loading="lazy"
                  onLoad={() => setImgEstado('ok')}
                  onError={() => setImgEstado('error')}
                  className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
                    imgEstado === 'ok' ? 'opacity-100' : 'opacity-0'
                  } ${animar ? 'group-hover:scale-[1.04]' : ''}`}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/25">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-lg font-black text-white/50">
                  {inicial}
                </span>
                <IconImagen className="h-4 w-4" />
              </div>
            )}

            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#070B12] to-transparent"
              aria-hidden="true"
            />

            {/* Negocio */}
            {producto.negocio_nombre && (
              <span className="absolute left-3 top-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white/75 backdrop-blur-md">
                {producto.negocio_emoji && <span aria-hidden="true">{producto.negocio_emoji}</span>}
                <span className="truncate">{producto.negocio_nombre}</span>
              </span>
            )}

            {/* Avance */}
            <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-black text-white/85 backdrop-blur-md">
              {enProceso > 0 ? (
                <IconProceso className={`h-3 w-3 text-[#F97316] ${animar ? 'animate-spin' : ''}`} />
              ) : (
                <IconCheck className="h-3 w-3 text-[#10B981]" />
              )}
              {completados}/{MODULOS.length}
            </span>
          </div>

          {/* ── Cuerpo ───────────────────────────────────────────────────── */}
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="min-w-0 space-y-1.5">
              <h3 className="truncate text-base font-black tracking-tight text-white transition-colors duration-300 group-hover:text-brand-accent">
                {producto.nombre}
              </h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/45">
                {producto.categoria && <span className="truncate">{producto.categoria}</span>}
                {producto.categoria && precio && (
                  <span className="h-2.5 w-px bg-white/15" aria-hidden="true" />
                )}
                {precio && <span className="font-bold text-white/70">{precio}</span>}
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="space-y-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <motion.div
                  className="h-full rounded-full bg-gradient-accent"
                  initial={{ width: animar ? 0 : `${pct}%` }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: animar ? 0.8 : 0, ease: 'easeOut' }}
                />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                {pct}% analizado
              </p>
            </div>

            {/* Módulos */}
            <ul className="mt-auto flex flex-wrap gap-1.5" aria-label="Estado por módulo">
              {MODULOS.map((mod) => {
                const { label, hex, Icon } = MODULE_CONFIG[mod];
                const estado = producto.analisis?.[mod]?.estado ?? null;
                const completado = estado === 'completado';
                const procesando = estado === 'procesando';
                const textoEstado = completado
                  ? 'completado'
                  : procesando
                    ? 'en proceso'
                    : 'sin analizar';

                return (
                  <li key={mod}>
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors duration-300 ${
                        completado || procesando
                          ? 'border-transparent'
                          : 'border-white/[0.07] bg-white/[0.02] text-white/30'
                      }`}
                      style={
                        completado
                          ? { borderColor: `${hex}55`, backgroundColor: `${hex}1F`, color: hex }
                          : procesando
                            ? {
                                borderColor: 'rgba(249,115,22,0.35)',
                                backgroundColor: 'rgba(249,115,22,0.12)',
                                color: '#F97316',
                              }
                            : undefined
                      }
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                      <span className="sr-only">: {textoEstado}</span>
                    </span>
                  </li>
                );
              })}
            </ul>

            {!producto.dentro_del_plan && (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-2 text-[10px] font-semibold leading-snug text-amber-200/85">
                <IconAlerta className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                Fuera de los límites de tu plan actual.
              </p>
            )}

            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white/40 transition-colors duration-300 group-hover:text-brand-accent">
              Ver detalle
              <IconArrow className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Página
   ────────────────────────────────────────────────────────────────────────── */

export default function ProductosPage(): ReactElement {
  const router = useRouter();
  const reduce = useReducedMotion();
  const animar = !reduce;

  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState<string>('todas');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [orden, setOrden] = useState<Orden>('nombre');

  const cargar = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/dashboard/resumen');
      setProductos(Array.isArray(data?.productos) ? (data.productos as ProductoResumen[]) : []);
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null
          ? ((err as { response?: { status?: number } }).response?.status ?? null)
          : null;
      if (status === 401) {
        router.push('/auth/login');
        return;
      }
      setProductos([]);
      setError('No pudimos cargar tu portafolio. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    void cargar();
  }, [cargar, router]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    productos.forEach((p) => {
      const valor = (p.categoria || '').trim();
      if (valor !== '') set.add(valor);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [productos]);

  const stats = useMemo(() => {
    let completados = 0;
    let enProceso = 0;
    productos.forEach((p) => {
      const c = contarEstados(p);
      completados += c.completados;
      enProceso += c.enProceso;
    });
    return {
      completados,
      enProceso,
      capacidad: productos.length * MODULOS.length,
    };
  }, [productos]);

  const filtrados = useMemo(() => {
    const termino = normalizar(q.trim());

    const lista = productos.filter((p) => {
      if (termino !== '') {
        const heno = normalizar(
          `${p.nombre} ${p.categoria ?? ''} ${p.negocio_nombre ?? ''}`,
        );
        if (!heno.includes(termino)) return false;
      }

      if (categoria !== 'todas' && (p.categoria || '').trim() !== categoria) return false;

      if (estado !== 'todos') {
        const { completados, enProceso } = contarEstados(p);
        if (estado === 'completos' && completados < MODULOS.length) return false;
        if (estado === 'proceso' && enProceso === 0) return false;
        if (estado === 'pendientes' && completados + enProceso > 0) return false;
      }

      return true;
    });

    const ordenada = [...lista];
    ordenada.sort((a, b) => {
      if (orden === 'avance') {
        const diff = contarEstados(b).completados - contarEstados(a).completados;
        if (diff !== 0) return diff;
      } else if (orden === 'precio') {
        const pa = Number.isFinite(a.precio as number) ? (a.precio as number) : -1;
        const pb = Number.isFinite(b.precio as number) ? (b.precio as number) : -1;
        if (pb !== pa) return pb - pa;
      }
      return a.nombre.localeCompare(b.nombre, 'es');
    });

    return ordenada;
  }, [productos, q, categoria, estado, orden]);

  const hayFiltros = q.trim() !== '' || categoria !== 'todas' || estado !== 'todos';

  const limpiarFiltros = (): void => {
    setQ('');
    setCategoria('todas');
    setEstado('todos');
  };

  const contenedor: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: animar ? 0.05 : 0, delayChildren: animar ? 0.03 : 0 } },
  };

  const item: Variants = animar
    ? {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
      }
    : { hidden: { opacity: 1 }, show: { opacity: 1 } };

  const selectClase =
    'w-full appearance-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-white/80 outline-none transition-colors duration-300 hover:border-white/20 focus-visible:border-brand-accent/50 focus-visible:ring-2 focus-visible:ring-brand-accent/30 sm:w-auto';

  return (
    <div className="relative space-y-8">
      {/* Luz ambiental */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full blur-[130px]"
          style={{ background: 'rgba(231,76,60,0.09)' }}
        />
        <div
          className="absolute top-48 right-0 h-[360px] w-[360px] rounded-full blur-[130px]"
          style={{ background: 'rgba(59,130,246,0.07)' }}
        />
      </div>

      {/* ── Cabecera ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded text-[11px] font-bold text-white/40 transition-colors duration-300 hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          >
            <IconArrowLeft className="h-3.5 w-3.5" />
            Volver al panel
          </Link>

          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-[2.25rem] lg:leading-[1.1]">
            Mis{' '}
            <span className="bg-gradient-to-r from-brand-accent via-[#F0705F] to-brand-accent bg-clip-text text-transparent">
              productos
            </span>
          </h1>

          <p className="max-w-xl text-sm text-white/45">
            {loading
              ? 'Cargando tu portafolio…'
              : `${productos.length} ${productos.length === 1 ? 'producto' : 'productos'} · ${stats.completados} de ${stats.capacidad} módulos analizados${
                  stats.enProceso > 0 ? ` · ${stats.enProceso} en proceso` : ''
                }`}
          </p>
        </div>

        <motion.div whileHover={animar ? { scale: 1.03 } : undefined} whileTap={animar ? { scale: 0.97 } : undefined}>
          <Link
            href="/dashboard/nuevo"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-accent px-5 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(231,76,60,0.28)] transition-shadow duration-300 hover:shadow-[0_0_38px_rgba(231,76,60,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60"
          >
            <IconPlus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
            Nuevo análisis
          </Link>
        </motion.div>
      </header>

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      {!loading && productos.length > 0 && (
        <section
          aria-label="Filtros del portafolio"
          className="space-y-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur-xl sm:p-5"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="buscar-producto" className="sr-only">
                Buscar producto
              </label>
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                id="buscar-producto"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, categoría o negocio…"
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors duration-300 hover:border-white/20 focus-visible:border-brand-accent/50 focus-visible:ring-2 focus-visible:ring-brand-accent/30"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {categorias.length > 0 && (
                <div>
                  <label htmlFor="filtro-categoria" className="sr-only">
                    Filtrar por categoría
                  </label>
                  <select
                    id="filtro-categoria"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className={selectClase}
                  >
                    <option value="todas">Todas las categorías</option>
                    {categorias.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="filtro-orden" className="sr-only">
                  Ordenar por
                </label>
                <select
                  id="filtro-orden"
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as Orden)}
                  className={selectClase}
                >
                  {ORDENES.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ESTADOS.map((e) => {
              const activo = estado === e.key;
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => setEstado(e.key)}
                  aria-pressed={activo}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${
                    activo
                      ? 'border-brand-accent/45 bg-brand-accent/[0.12] text-brand-accent'
                      : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/20 hover:text-white/75'
                  }`}
                >
                  {e.label}
                </button>
              );
            })}

            {hayFiltros && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="ml-auto rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white/40 underline-offset-2 transition-colors duration-300 hover:text-brand-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <p className="text-[11px] font-semibold text-white/35" role="status" aria-live="polite">
            {filtrados.length} de {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
          </p>
        </section>
      )}

      {/* ── Contenido ──────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="skeletons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-8 text-center backdrop-blur-xl"
          >
            <IconAlerta className="mx-auto mb-3 h-8 w-8 text-red-300/80" />
            <p className="mb-5 text-sm font-semibold text-white/70">{error}</p>
            <button
              type="button"
              onClick={() => void cargar()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2.5 text-sm font-bold text-white transition-colors duration-300 hover:border-white/30 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <IconProceso className="h-4 w-4" />
              Reintentar
            </button>
          </motion.div>
        ) : productos.length === 0 ? (
          <motion.div
            key="vacio"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center backdrop-blur-xl"
          >
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-accent/25 bg-brand-accent/[0.08] text-brand-accent">
              <IconProductos className="h-7 w-7" />
            </span>
            <h2 className="mb-2 text-lg font-black tracking-tight text-white">
              Todavía no tienes productos
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm text-white/45">
              Sube tu primer producto y en un par de minutos tendrás los cinco análisis
              independientes listos para revisar.
            </p>
            <Link
              href="/dashboard/nuevo"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-accent px-5 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(231,76,60,0.28)] transition-shadow duration-300 hover:shadow-[0_0_38px_rgba(231,76,60,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60"
            >
              <IconPlus className="h-4 w-4" />
              Crear el primero
            </Link>
          </motion.div>
        ) : filtrados.length === 0 ? (
          <motion.div
            key="sin-resultados"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center backdrop-blur-xl"
          >
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/35">
              <IconSearch className="h-6 w-6" />
            </span>
            <h2 className="mb-2 text-base font-black tracking-tight text-white">
              Ningún producto coincide
            </h2>
            <p className="mx-auto mb-6 max-w-sm text-sm text-white/45">
              Prueba con otro término de búsqueda o quita algún filtro.
            </p>
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2.5 text-sm font-bold text-white transition-colors duration-300 hover:border-white/30 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              Limpiar filtros
            </button>
          </motion.div>
        ) : (
          <motion.section
            key="grid"
            variants={contenedor}
            initial="hidden"
            animate="show"
            aria-label="Listado de productos"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {filtrados.map((p) => (
              <ProductoCard key={p.id} producto={p} animar={animar} variants={item} />
            ))}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}