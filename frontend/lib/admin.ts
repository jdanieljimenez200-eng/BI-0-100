import api from '@/lib/api';

/**
 * Cliente del panel de administración: lo que no es de ningún módulo en
 * concreto (auditoría, roles, sesión de admin).
 */

// ─── Auditoría (admin) ──────────────────────────────────────────────────────

export interface RegistroAuditoria {
  id: string;
  admin_id: string;
  admin_email: string;
  admin_rol: string;
  accion: string;
  recurso_tipo: string;
  recurso_id: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string | null;
  ip: string | null;
  fecha: string;
}

export async function leerAuditoria(filtros: {
  accion?: string;
  recurso_id?: string;
  admin_id?: string;
  page?: number;
}) {
  const { data } = await api.get<{
    registros: RegistroAuditoria[];
    total: number;
    page: number;
    pages: number;
  }>('/admin/auditoria', { params: filtros });
  return data;
}
