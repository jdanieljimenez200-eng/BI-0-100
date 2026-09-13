import PuertaAdmin from '@/components/admin/PuertaAdmin';

/**
 * Todo /dashboard/admin pasa por la verificación en dos pasos antes de mostrarse.
 * La barrera real está en el backend; esto evita enseñar un panel que no carga.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PuertaAdmin>{children}</PuertaAdmin>;
}
