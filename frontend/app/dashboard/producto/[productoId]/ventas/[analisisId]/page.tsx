'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Ruta legacy del resultado de Ventas. El módulo canónico vive en
 * /dashboard/ventas/[productoId]/resultado/[analisisId]; esta página solo
 * redirige para que enlaces antiguos sigan funcionando.
 */
export default function ResultadoVentasLegacyPage() {
  const router = useRouter();
  const params = useParams() as { productoId: string; analisisId: string };

  useEffect(() => {
    router.replace(`/dashboard/ventas/${params.productoId}/resultado/${params.analisisId}`);
  }, [router, params.productoId, params.analisisId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-cyan-400" />
    </div>
  );
}
