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

// ─── Roles ───────────────────────────────────────────────────────────────────

export type AdminRol = 'soporte' | 'moderador' | 'superadmin';

export type Permiso =
  | 'verPanel'
  | 'gestionarActivo'
  | 'moderarRed'
  | 'cambiarPlan'
  | 'gestionarRoles'
  | 'verAuditoria';

export const NOMBRE_ROL: Record<AdminRol, string> = {
  soporte: 'Soporte',
  moderador: 'Moderación',
  superadmin: 'Superadmin',
};

export const DESCRIPCION_ROL: Record<AdminRol, string> = {
  soporte: 'Ve estadísticas y usuarios, y puede desactivar o reactivar cuentas.',
  moderador: 'Revisa fichas de la red, abre cédulas y modera reseñas.',
  superadmin: 'Todo lo anterior, más cambiar planes, asignar roles y ver la auditoría.',
};

/**
 * Rol y permisos de quien usa el panel. Solo sirve para no OFRECER lo que va a
 * fallar: quien decide es cada endpoint del backend.
 */
export async function miRolAdmin() {
  const { data } = await api.get<{ id: string; rol: AdminRol; permisos: Record<Permiso, boolean> }>('/admin/yo');
  return data;
}

export interface Administrador {
  id: string;
  email: string;
  nombre: string;
  admin_rol: AdminRol;
  activo: boolean;
  fecha_creacion: string;
}

export async function listarAdministradores() {
  const { data } = await api.get<{ administradores: Administrador[] }>('/admin/administradores');
  return data.administradores;
}

export async function cambiarRolAdmin(id: string, rol: AdminRol | null, motivo: string) {
  const { data } = await api.patch<{ message: string; rol: AdminRol | null }>(`/admin/usuarios/${id}/rol`, {
    rol,
    motivo,
  });
  return data;
}

export interface UsuarioBuscado {
  id: string;
  email: string;
  nombre: string;
}

/** Reutiliza el listado de usuarios del panel para encontrar a quién dar un rol. */
export async function buscarUsuarios(texto: string) {
  const { data } = await api.get<{ usuarios: UsuarioBuscado[] }>('/admin/usuarios', {
    params: { search: texto, page: 1 },
  });
  return data.usuarios;
}
