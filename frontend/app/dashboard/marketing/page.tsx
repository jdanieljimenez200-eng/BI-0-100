'use client';

import ModuloIndexPanel from '@/components/dashboard/ModuloIndexPanel';

export default function MarketingIndexPage() {
  return (
    <ModuloIndexPanel
      modulo="marketing"
      breadcrumb="Marketing"
      titulo="Estrategia de Marketing"
      descripcion="Canales de adquisición, propuesta de valor y posicionamiento de marca por producto."
      textoSinProductos="Añade tu primer producto para estructurar su estrategia de marketing."
      claseAcento="text-pink-400"
      claseAcentoHover="hover:text-pink-300"
    />
  );
}
