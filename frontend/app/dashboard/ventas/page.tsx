'use client';

import ModuloIndexPanel from '@/components/dashboard/ModuloIndexPanel';

export default function VentasIndexPage() {
  return (
    <ModuloIndexPanel
      modulo="ventas"
      breadcrumb="Ventas"
      titulo="Estrategia de Ventas"
      descripcion="Protocolos de conversión comercial, modelado de ingresos y guiones de venta por producto."
      textoSinProductos="Añade tu primer producto para estructurar su estrategia de ventas."
      claseAcento="text-orange-400"
      claseAcentoHover="hover:text-orange-300"
    />
  );
}
