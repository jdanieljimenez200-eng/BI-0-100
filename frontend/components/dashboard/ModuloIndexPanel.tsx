'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { Breadcrumbs } from '@/components/ui';

/**
 * Índice de productos de un módulo de análisis.
 *
 * Existía copiado cinco veces: `dashboard/{mercado,marketing,finanzas,legal,
 * ventas}/page.tsx`, 362 líneas cada uno y solo 10 líneas de diferencia entre
 * ellos (color, títulos y la clave del análisis). Esa duplicación ya había
 * causado un defecto real: corregir la lectura del precio obligó a tocar los
 * cinco archivos, y bastaba olvidar uno para dejarlo inconsistente.
 *
 * El JSX es exactamente el de esas páginas; lo único que se parametriza son las
 * diferencias reales.
 *
 * (No se reutilizó `components/dashboard/ModuloIndex.tsx`: es de una versión
 * anterior, nadie lo importa y renderiza otros textos.)
 */

export type ModuloAnalisis = 'mercado' | 'marketing' | 'finanzas' | 'legal' | 'ventas';

interface AnalisisSnap {
  id: string;
  estado: 'procesando' | 'completado' | 'error';
  created_at?: string;
}

interface ProductoResumen {
  id: string;
  nombre: string;
  categoria: string;
  /** Nombre real de la columna. Antes se leía `precio_esperado`, que no existe. */
  precio?: number | null;
  analisis?: {
    [key: string]: AnalisisSnap | null | unknown;
  };
}

export interface ModuloIndexPanelProps {
  /** Clave del módulo: da la ruta y la entrada dentro de `producto.analisis`. */
  modulo: ModuloAnalisis;
  /** Texto del breadcrumb (ej. "Mercado"). */
  breadcrumb: string;
  /** Título principal (ej. "Inteligencia de Mercado"). */
  titulo: string;
  descripcion: string;
  /** Mensaje cuando la cuenta aún no tiene productos. */
  textoSinProductos: string;
  /** Clase del acento en el breadcrumb (ej. "text-cyan-400"). */
  claseAcento: string;
  /** Clase del hover sobre el nombre del producto (ej. "hover:text-cyan-300"). */
  claseAcentoHover: string;
}

// ─── Iconografía Vectorial Limpia ─────────────────────────────────────────────

function IconLupa({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconFlecha({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconReloj({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconPlus({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconAlerta({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// ─── Componente ────────────────────────────────────────────────────────────────

export default function ModuloIndexPanel({
  modulo,
  breadcrumb,
  titulo,
  descripcion,
  textoSinProductos,
  claseAcento,
  claseAcentoHover,
}: ModuloIndexPanelProps) {
  const router = useRouter();
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'completado' | 'pendiente'>('todos');

  const snapDe = (p: ProductoResumen): AnalisisSnap | null =>
    (p.analisis?.[modulo] as AnalisisSnap | null | undefined) ?? null;

  useEffect(() => {
    let activo = true;
    api.get('/dashboard/resumen')
      .then(({ data }) => {
        if (!activo) return;
        setProductos(Array.isArray(data?.productos) ? data.productos : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!activo) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          router.push('/auth/login');
          return;
        }
        setError('No fue posible sincronizar el catálogo de productos.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => { activo = false; };
  }, [router]);

  const total = productos.length;
  const completados = useMemo(
    () => productos.filter((p) => snapDe(p)?.estado === 'completado').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productos, modulo]
  );
  const pendientes = useMemo(
    () => productos.filter((p) => snapDe(p)?.estado !== 'completado').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productos, modulo]
  );

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const matchTexto =
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.categoria.toLowerCase().includes(busqueda.toLowerCase());

      if (!matchTexto) return false;

      const estado = snapDe(p)?.estado;
      if (filtroEstado === 'completado') return estado === 'completado';
      if (filtroEstado === 'pendiente') return estado !== 'completado';
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, busqueda, filtroEstado, modulo]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">

      {/* ── Cabecera de Lujo Silencioso ─────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.06]">
        <div>
          <Breadcrumbs
            showBack
            backHref="/dashboard"
            backLabel="Volver al panel"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: breadcrumb },
            ]}
            className="mb-2"
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {titulo}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            {descripcion}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 tabular-nums">
            {completados} de {total} analizados
          </span>
          <Link
            href="/dashboard/nuevo"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/90 hover:text-white text-xs font-medium border border-white/[0.08] transition-colors"
          >
            <IconPlus className="w-3.5 h-3.5 text-slate-400" />
            <span>Nuevo producto</span>
          </Link>
        </div>
      </header>

      {/* ── Controles: Búsqueda y Filtro Rápido ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <IconLupa className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por producto o categoría…"
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-white/20 focus:bg-white/[0.04] transition-all"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFiltroEstado('todos')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filtroEstado === 'todos'
                ? 'bg-white/[0.08] text-white border border-white/[0.08]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos ({total})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado('completado')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filtroEstado === 'completado'
                ? 'bg-white/[0.08] text-white border border-white/[0.08]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Analizados ({completados})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado('pendiente')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filtroEstado === 'pendiente'
                ? 'bg-white/[0.08] text-white border border-white/[0.08]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pendientes ({pendientes})
          </button>
        </div>
      </div>

      {/* ── Listado Esencial de Productos ────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/[0.02] border border-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-xl bg-red-500/5 border border-red-500/20 text-center space-y-3">
          <IconAlerta className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-xs text-slate-300">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : productosFiltrados.length === 0 ? (
        <div className="p-12 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-3">
          <p className="text-sm font-medium text-white">No se encontraron productos</p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {busqueda
              ? 'No hay productos que coincidan con la búsqueda actual.'
              : textoSinProductos}
          </p>
          {!busqueda && (
            <Link
              href="/dashboard/nuevo"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-medium transition-colors"
            >
              <IconPlus className="w-3.5 h-3.5" />
              Crear producto
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence>
            {productosFiltrados.map((producto) => {
              const snap = snapDe(producto);
              const estado = snap?.estado;
              const urlDestino =
                estado === 'completado' && snap?.id
                  ? `/dashboard/${modulo}/${producto.id}/resultado/${snap.id}`
                  : `/dashboard/${modulo}/${producto.id}`;

              return (
                <motion.div
                  key={producto.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="px-4 sm:px-5 py-3.5 rounded-xl bg-[#09111D]/80 border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-center justify-between gap-4"
                >
                  {/* Info Producto */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <Link
                        href={urlDestino}
                        className={`text-sm font-semibold text-white ${claseAcentoHover} transition-colors truncate`}
                      >
                        {producto.nombre}
                      </Link>
                      {producto.categoria && (
                        <span className="text-[11px] text-slate-400 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded-md">
                          {producto.categoria}
                        </span>
                      )}
                      {producto.precio ? (
                        <span className="text-[11px] text-slate-400 font-mono">
                          ${Number(producto.precio).toLocaleString('es-MX')} MXN
                        </span>
                      ) : null}
                    </div>

                    {/* Estado del Análisis */}
                    <div className="flex items-center gap-2 text-xs">
                      {estado === 'completado' ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400/90 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Analizado
                        </span>
                      ) : estado === 'procesando' ? (
                        <span className="inline-flex items-center gap-1.5 text-blue-400/90 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                          En proceso
                        </span>
                      ) : estado === 'error' ? (
                        <span className="inline-flex items-center gap-1.5 text-red-400/90 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          Error en análisis
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                          Sin analizar
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acción Directa */}
                  <div className="flex-shrink-0">
                    <Link
                      href={urlDestino}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        estado === 'completado'
                          ? 'text-white/80 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08]'
                          : estado === 'procesando'
                          ? 'text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20'
                          : 'text-white/90 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1]'
                      }`}
                    >
                      {estado === 'completado' ? (
                        <>
                          <span>Ver análisis</span>
                          <IconFlecha className="w-3 h-3 text-slate-400" />
                        </>
                      ) : estado === 'procesando' ? (
                        <>
                          <span>Ver progreso</span>
                          <IconReloj className="w-3 h-3 text-blue-400" />
                        </>
                      ) : (
                        <>
                          <span>Comenzar</span>
                          <IconFlecha className="w-3 h-3 text-slate-400" />
                        </>
                      )}
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}
