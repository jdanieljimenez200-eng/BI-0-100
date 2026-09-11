'use client';

import ModuloIndexPanel from '@/components/dashboard/ModuloIndexPanel';

export default function MercadoIndexPage() {
  return (
    <ModuloIndexPanel
      modulo="mercado"
      breadcrumb="Mercado"
      titulo="Inteligencia de Mercado"
      descripcion="Dimensionamiento de demanda, tamaño de mercado (TAM/SAM/SOM) y competidores por producto."
      textoSinProductos="Añade tu primer producto para estructurar su estudio de mercado."
      claseAcento="text-cyan-400"
      claseAcentoHover="hover:text-cyan-300"
    />
  );
}
