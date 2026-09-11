'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Página que lista todos los resultados de análisis de ventas para un producto
 * (redirige a [analisisId] específico o vuelve al formulario)
 */
export default function ResultadosListPage() {
  const router = useRouter();
  const { productoId } = useParams<{ productoId: string }>();

  useEffect(() => {
    // Si llegamos aquí sin un ID de análisis específico, regresamos al formulario
    if (productoId) {
      router.replace(`/dashboard/ventas/${productoId}`);
    }
  }, [productoId, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F1B2E] via-[#0A0F17] to-[#070B12] flex items-center justify-center px-4 py-10">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Cargando...</h1>
        {productoId && (
          <Link
            href={`/dashboard/ventas/${productoId}`}
            className="text-ventas hover:text-ventas-light font-semibold text-sm transition-colors"
          >
            ← Volver al formulario
          </Link>
        )}
      </div>
    </div>
  );
}