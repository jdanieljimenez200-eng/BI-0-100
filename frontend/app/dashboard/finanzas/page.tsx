'use client';

import ModuloIndexPanel from '@/components/dashboard/ModuloIndexPanel';

export default function FinanzasIndexPage() {
  return (
    <ModuloIndexPanel
      modulo="finanzas"
      breadcrumb="Finanzas"
      titulo="Análisis Financiero"
      descripcion="Estructura de costos, punto de equilibrio y proyecciones de flujo de caja por producto."
      textoSinProductos="Añade tu primer producto para estructurar su análisis financiero."
      claseAcento="text-emerald-400"
      claseAcentoHover="hover:text-emerald-300"
    />
  );
}
