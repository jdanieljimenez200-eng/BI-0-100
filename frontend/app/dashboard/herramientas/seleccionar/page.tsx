'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Lock, Package } from 'lucide-react';
import { useProductoActivo } from '@/lib/productoActivo';
import { Breadcrumbs } from '@/components/ui';

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
            <Package className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Primero necesitas un producto</h2>
          <p className="text-sm text-white/55 mb-5">
            Todas las herramientas trabajan sobre un mismo producto o servicio. Crea uno para empezar.
          </p>
          <Link
            href="/dashboard/nuevo"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold bg-gradient-to-br from-emerald-500 to-emerald-600 transition-all hover:brightness-110 active:scale-[0.98]"
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

      <Breadcrumbs
        showBack
        backHref="/dashboard/herramientas"
        backLabel="Herramientas"
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Herramientas', href: '/dashboard/herramientas' },
          { label: 'Elegir producto' },
        ]}
        className="mb-8"
      />

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
              className={`group relative text-left rounded-2xl border bg-gradient-to-br from-[#0d1117] to-[#0b1421] p-5 overflow-hidden transition-all active:scale-[0.98] ${
                bloqueado
                  ? 'border-white/8 opacity-55 cursor-not-allowed'
                  : activo
                    ? 'border-emerald-500/50 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
                    : 'border-white/8 hover:border-emerald-500/30 hover:shadow-[0_0_24px_rgba(255,255,255,0.06)]'
              }`}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
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
                  <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <Lock className="w-3 h-3" />
                    Fuera del plan
                  </span>
                ) : activo ? (
                  <span className="flex-shrink-0 text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Actual
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-emerald-300 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5">
                    <ArrowRight className="w-4 h-4" />
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
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold bg-gradient-to-br from-amber-500 to-amber-600 transition-all hover:brightness-110 active:scale-[0.98]"
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