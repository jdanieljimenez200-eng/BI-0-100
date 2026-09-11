'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProductoActivo, ProductoActivo } from '@/lib/productoActivo';

interface ProductoGateProps {
  /** Nombre de la herramienta, para los textos (ej. "Punto de Venta"). */
  herramienta: string;
  /** Acento Tailwind de la herramienta (ej. "emerald", "amber", "violet"). */
  acento?: string;
  /** Se renderiza con el producto global ya elegido. */
  children: (ctx: {
    producto: ProductoActivo;
    /** Vuelve a la página de selección para cambiar el producto global. */
    cambiarProducto: () => void;
  }) => ReactNode;
}

// Mapa de acentos → clases fijas (Tailwind no admite clases dinámicas por interpolación).
const ACENTOS: Record<string, { border: string; grad: string }> = {
  emerald: { border: 'border-emerald-500/30', grad: 'from-emerald-500 to-emerald-600' },
  amber:   { border: 'border-amber-500/30',   grad: 'from-amber-500 to-amber-600' },
  blue:    { border: 'border-blue-500/30',    grad: 'from-blue-500 to-blue-600' },
  violet:  { border: 'border-violet-500/30',  grad: 'from-violet-500 to-violet-600' },
  cyan:    { border: 'border-cyan-500/30',    grad: 'from-cyan-500 to-cyan-600' },
  rose:    { border: 'border-rose-500/30',    grad: 'from-rose-500 to-rose-600' },
  teal:    { border: 'border-teal-500/30',    grad: 'from-teal-500 to-teal-600' },
};

const SELECCION_PATH = '/dashboard/herramientas/seleccionar';

/**
 * Gate previo a una herramienta (opción B — página intermedia con ruta propia).
 * Selección de producto GLOBAL y compartida entre todas las herramientas.
 *
 *  - 0 productos → estado vacío con CTA a crear uno.
 *  - 1 producto  → autoselección; entra directo.
 *  - N sin elegir → redirige a /dashboard/herramientas/seleccionar?next=<ruta actual>.
 */
export default function ProductoGate({ herramienta, acento = 'emerald', children }: ProductoGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { productos, loading, error, activo, limpiarSeleccion } = useProductoActivo();
  const a = ACENTOS[acento] ?? ACENTOS.emerald;

  // Sin producto activo (y habiendo varios) → a la página de selección.
  const debeElegir = !loading && !error && productos.length > 1 && !activo;
  useEffect(() => {
    if (debeElegir) {
      router.replace(`${SELECCION_PATH}?next=${encodeURIComponent(pathname)}`);
    }
  }, [debeElegir, router, pathname]);

  const cambiarProducto = () => {
    limpiarSeleccion();
    router.push(`${SELECCION_PATH}?next=${encodeURIComponent(pathname)}`);
  };

  if (loading || debeElegir) {
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

  // Sin productos: no se puede operar ninguna herramienta.
  if (productos.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-10 max-w-3xl mx-auto">
        <div className="rounded-3xl border border-white/8 bg-white/3 px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 mb-4">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <circle cx="8" cy="12" r="2" />
              <path d="M14 10h4" />
              <path d="M14 14h2" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Primero necesitas un producto</h2>
          <p className="text-sm text-white/55 mb-5">
            Cada herramienta trabaja sobre un producto o servicio. Crea uno para empezar.
          </p>
          <Link
            href="/dashboard/nuevo"
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold bg-gradient-to-br ${a.grad}`}
          >
            Crear producto →
          </Link>
        </div>
      </div>
    );
  }

  // Producto global elegido (o autoseleccionado por ser único) → renderiza la herramienta.
  if (activo) {
    return <>{children({ producto: activo, cambiarProducto })}</>;
  }

  // Estado transitorio mientras se resuelve la redirección.
  return <div className="py-32" />;
}