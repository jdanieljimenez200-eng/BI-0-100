'use client';

import ModuloIndexPanel from '@/components/dashboard/ModuloIndexPanel';

export default function LegalIndexPage() {
  return (
    <ModuloIndexPanel
      modulo="legal"
      breadcrumb="Legal"
      titulo="Marco Legal & Cumplimiento"
      descripcion="Diagnóstico regulatorio preventivo, licencias obligatorias y blindaje societario por producto."
      textoSinProductos="Añade tu primer producto para estructurar su marco legal y regulatorio."
      claseAcento="text-violet-400"
      claseAcentoHover="hover:text-violet-300"
    />
  );
}
