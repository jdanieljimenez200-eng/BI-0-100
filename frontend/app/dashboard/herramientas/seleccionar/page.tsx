'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useProductoActivo } from '@/lib/productoActivo';

// Destinos permitidos tras elegir producto — evita open-redirect a rutas externas.
const NEXT_FALLBACK = '/dashboard/herramientas';

function destinoSeguro(next: string | null): string {
  if (!next) return NEXT_FALLBACK;
  // Solo rutas internas absolutas del dashboard.
  if (next.startsWith('/dashboard/')) return next;
  return NEXT_FALLBACK;
}

function SeleccionarInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = useMemo(() => destinoSeguro(params.get('next')), [params]);

  const { productos, loading, error, activoId, setActivoId } = useProductoActivo();

  const elegir = (id: string) => {
    setActivoId(id);
    // replace (no push): la pantalla de selección es un paso intermedio, no
    // un destino — así "atrás" desde la herramienta no re-entra aquí para
    // volver a redirigir hacia adelante (historial-trap).
    router.replace(next);
  };

  // ¿Hay productos que exceden el límite del plan (tras un downgrade)?
  const hayBloqueados = productos.some((p) => p.dentro_del_plan === false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-white/15 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 sm:px-6 py-10 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-8 text-center">
          <p className="text-sm text-white/50">No pudimos cargar tus productos. Recarga la página en un momento.</p>
        </div>
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-10 max-w-3xl mx-auto">
        <div className="rounded-3xl border border-emerald-500/30 bg-white/3 p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Primero necesitas un producto</h2>
          <p className="text-sm text-white/55 mb-5">
            Todas las herramientas trabajan sobre un mismo producto o servicio. Crea uno para empezar.
          </p>
          <Link
            href="/dashboard/nuevo"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold bg-gradient-to-br from-emerald-500 to-emerald-600"
          >
            Crear producto →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-4 sm:px-6 py-10 max-w-4xl mx-auto pb-20">
      <div className="fixed top-[-15%] right-[-8%] w-[45vh] h-[45vh] bg-emerald-500/10 rounded-full blur-[130px] pointer-events-none" />

      <div className="flex items-center gap-2 text-sm mb-8">
        <Link href="/dashboard" className="text-white/35 hover:text-white/70 transition-colors">Dashboard</Link>
        <span className="text-white/20">›</span>
        <Link href="/dashboard/herramientas" className="text-white/35 hover:text-white/70 transition-colors">Herramientas</Link>
        <span className="text-white/20">›</span>
        <span className="text-white/70 font-medium">Elegir producto</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
          ¿Con qué producto vas a trabajar?
        </h1>
        <p className="text-sm text-white/45 max-w-xl leading-relaxed">
          El producto que elijas se usará en <span className="text-emerald-300">todas las herramientas</span>.
          Podrás cambiarlo cuando quieras.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {productos.map((p, i) => {
          const activo = p.id === activoId;
          const bloqueado = p.dentro_del_plan === false;
          return (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => { if (!bloqueado) elegir(p.id); }}
              disabled={bloqueado}
              aria-disabled={bloqueado}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className={`group relative text-left rounded-2xl border bg-gradient-to-br from-[#0d1117] to-[#0b1421] p-5 overflow-hidden transition-all ${
                bloqueado
                  ? 'border-white/8 opacity-55 cursor-not-allowed'
                  : activo
                    ? 'border-emerald-500/50 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
                    : 'border-white/8 hover:border-emerald-500/30 hover:shadow-[0_0_24px_rgba(255,255,255,0.06)]'
              }`}
            >
              <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-40 transition-opacity bg-emerald-500/10 ${bloqueado ? '' : 'group-hover:opacity-80'}`} />
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-white truncate">{p.nombre}</p>
                  <p className="text-xs text-white/45 mt-1">
                    {p.pais}
                    {p.negocio_nombre ? ` · ${p.negocio_nombre}` : ''}
                  </p>
                </div>
                {bloqueado ? (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Fuera del plan
                  </span>
                ) : activo ? (
                  <span className="flex-shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Actual
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-emerald-300 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {hayBloqueados && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
        >
          <p className="text-sm text-white/60 leading-relaxed">
            Algunos productos quedaron <span className="text-amber-300">fuera de tu plan</span>.
            Sube de plan para volver a administrarlos, o archiva otros para liberar espacio.
          </p>
          <Link
            href="/dashboard/billing"
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold bg-gradient-to-br from-amber-500 to-amber-600"
          >
            Ver planes →
          </Link>
        </motion.div>
      )}
    </div>
  );
}

export default function SeleccionarProductoPage() {
  return (
    <Suspense fallback={<div className="py-32" />}>
      <SeleccionarInner />
    </Suspense>
  );
}