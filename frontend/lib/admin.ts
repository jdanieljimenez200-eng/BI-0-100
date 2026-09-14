import api, { CLAVE_TOKEN_ADMIN } from '@/lib/api';

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

// ─── Costos de IA (superadmin) ──────────────────────────────────────────────

export interface CostosIA {
  dias: number;
  totales: { periodo: number; hoy: number; mes: number; llamadas: number; cuentas: number };
  por_dia: { dia: string; costo: number; llamadas: number }[];
  por_modulo: { modulo: string; costo: number; llamadas: number; analisis: number }[];
  por_seccion: {
    seccion: string;
    modelo: string;
    llamadas: number;
    costo_medio: number;
    costo: number;
    input_medio: number;
    output_medio: number;
  }[];
  por_modelo: { modelo: string; costo: number; input_tokens: string; output_tokens: string; cache_read_tokens: string }[];
  por_plan: {
    plan: string;
    cuentas: number;
    costo: number;
    costo_por_cuenta: number;
    ingreso_estimado: number;
    margen_pct: number | null;
  }[];
  top_cuentas: { usuario_id: string; email: string | null; plan: string | null; costo: number; llamadas: number }[];
}

export async function leerCostosIA(dias: number) {
  const { data } = await api.get<CostosIA>('/admin/costos-ia', { params: { dias } });
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
  | 'verAuditoria'
  | 'gestionarPapelera'
  | 'verCostos';

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

/** Cambiar un rol pide un código fresco de la app, aunque la sesión de admin siga abierta. */
export async function cambiarRolAdmin(id: string, rol: AdminRol | null, motivo: string, codigoTotp: string) {
  const { data } = await api.patch<{ message: string; rol: AdminRol | null }>(
    `/admin/usuarios/${id}/rol`,
    { rol, motivo },
    { headers: { 'X-Admin-Totp': codigoTotp } }
  );
  return data;
}

export async function reiniciar2faAdmin(id: string, motivo: string, codigoTotp: string) {
  const { data } = await api.post<{ message: string }>(
    `/admin/usuarios/${id}/2fa/reiniciar`,
    { motivo },
    { headers: { 'X-Admin-Totp': codigoTotp } }
  );
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

// ─── Sesión de admin (verificación en dos pasos) ─────────────────────────────

export interface EstadoSesionAdmin {
  enrolado: boolean;
  rol: AdminRol;
}

export async function estadoSesionAdmin() {
  const { data } = await api.get<EstadoSesionAdmin>('/admin/sesion/estado');
  return data;
}

export async function iniciarEnrolamiento(password: string) {
  const { data } = await api.post<{ qr: string; uri: string; secreto: string }>('/admin/sesion/enrolar', {
    password,
  });
  return data;
}

export async function confirmarEnrolamiento(codigo: string) {
  const { data } = await api.post<{ token: string; expira_en: string; codigos_recuperacion: string[] }>(
    '/admin/sesion/enrolar/confirmar',
    { codigo }
  );
  guardarTokenAdmin(data.token, data.expira_en);
  return data;
}

export async function verificarCodigoAdmin(entrada: { codigo?: string; codigo_recuperacion?: string }) {
  const { data } = await api.post<{ token: string; expira_en: string; codigos_restantes?: number }>(
    '/admin/sesion/verificar',
    entrada
  );
  guardarTokenAdmin(data.token, data.expira_en);
  return data;
}

export async function cerrarSesionAdmin() {
  try {
    await api.post('/admin/sesion/cerrar');
  } finally {
    sessionStorage.removeItem(CLAVE_TOKEN_ADMIN);
    sessionStorage.removeItem(`${CLAVE_TOKEN_ADMIN}:expira`);
  }
}

function guardarTokenAdmin(token: string, expiraEn: string) {
  sessionStorage.setItem(CLAVE_TOKEN_ADMIN, token);
  sessionStorage.setItem(`${CLAVE_TOKEN_ADMIN}:expira`, expiraEn);
}

/** Momento en que caduca la sesión de admin, o `null` si no hay. */
export function expiracionSesionAdmin(): Date | null {
  if (typeof window === 'undefined' || !sessionStorage.getItem(CLAVE_TOKEN_ADMIN)) return null;
  const expira = sessionStorage.getItem(`${CLAVE_TOKEN_ADMIN}:expira`);
  const fecha = expira ? new Date(expira) : null;
  return fecha && fecha.getTime() > Date.now() ? fecha : null;
}

// ─── Papelera ────────────────────────────────────────────────────────────────

export interface CuentaEnPapelera {
  id: string;
  email: string;
  nombre: string;
  account_role: string;
  owner_id: string | null;
  eliminado_en: string;
  motivo_eliminacion: string | null;
  eliminado_por_email: string | null;
  purga_en: string;
  dias_restantes: number;
}

export async function listarPapelera() {
  const { data } = await api.get<{ cuentas: CuentaEnPapelera[]; dias: number }>('/admin/papelera');
  return data;
}

/** Enviar a la papelera: la acción más destructiva del panel. Pide código fresco. */
export async function enviarAPapelera(id: string, motivo: string, codigoTotp: string) {
  const { data } = await api.post<{
    message: string;
    cuentas_afectadas: number;
    suscripciones_canceladas: number;
    suscripciones_sin_cancelar: string[];
  }>(`/admin/usuarios/${id}/papelera`, { motivo }, { headers: { 'X-Admin-Totp': codigoTotp } });
  return data;
}

export async function restaurarCuenta(id: string, motivo: string, codigoTotp: string) {
  const { data } = await api.post<{ message: string; cuentas_restauradas: number }>(
    `/admin/usuarios/${id}/restaurar`,
    { motivo },
    { headers: { 'X-Admin-Totp': codigoTotp } }
  );
  return data;
}

/** Pide un código nuevo de la app. Devuelve `null` si se cancela o no son 6 cifras. */
export function pedirCodigoTotp(): string | null {
  const codigo = window.prompt('Escribe un código nuevo de tu app de autenticación (6 cifras):');
  const limpio = (codigo ?? '').replace(/\D/g, '');
  return limpio.length === 6 ? limpio : null;
}
