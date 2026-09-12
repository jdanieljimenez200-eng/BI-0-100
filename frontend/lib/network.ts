import api from '@/lib/api';

/**
 * Cliente de la red de expertos.
 *
 * Los tipos son un espejo de lo que devuelve el backend, con una diferencia que
 * conviene tener presente al pintar: los campos opcionales llegan como `null`
 * cuando el experto no los rellenó, y `null` no es cero. Una tarifa sin poner no
 * es una consulta gratis, y un rating de 0 con 0 reseñas no es un mal experto:
 * es uno del que nadie ha opinado todavía.
 */

export type CategoriaExperto = 'legal' | 'marketing' | 'ventas';
export type EstadoExperto = 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido';

export const CATEGORIAS: CategoriaExperto[] = ['legal', 'marketing', 'ventas'];

export const NOMBRE_CATEGORIA: Record<CategoriaExperto, string> = {
  legal: 'Legal',
  marketing: 'Marketing',
  ventas: 'Ventas',
};

/** Lo que ve cualquiera. Sin cédula, sin teléfono, sin email. */
export interface ExpertoPublico {
  id: string;
  nombre_comercial: string;
  nombre_display: string;
  bio_corta: string;
  categoria: CategoriaExperto;
  especialidad: string;
  sub_especialidades: string[];
  ciudad: string;
  pais: string | null;
  avatar_url: string | null;
  sitio_web: string | null;
  tarifa_desde: number | null;
  moneda: string;
  ofrece_consulta_gratis: boolean;
  video_disponible: boolean;
  verificado: boolean;
  rating: number;
  total_resenas: number;
  es_patrocinado: boolean;
}

export interface FichaExperto extends ExpertoPublico {
  bio_larga: string | null;
  video_url: string | null;
  /** Solo llegan si el experto pidió mostrarlos. */
  email_contacto: string | null;
  telefono: string | null;
  fecha_aprobacion: string | null;
}

export interface ResenaPublica {
  id: string;
  puntuacion: number;
  comentario: string | null;
  autor: string;
  fecha_creacion: string;
  es_mia: boolean;
}

export type Distribucion = Record<'1' | '2' | '3' | '4' | '5', number>;

/** La ficha completa tal como la ve su dueño o un admin. */
export interface FichaPropia {
  id: string;
  usuario_id: string | null;
  nombre_comercial: string;
  nombre_display: string;
  bio_corta: string;
  bio_larga: string | null;
  categoria: CategoriaExperto;
  especialidad: string;
  sub_especialidades: string[];
  ciudad: string;
  pais: string | null;
  email_contacto: string | null;
  telefono: string | null;
  mostrar_contacto: boolean;
  sitio_web: string | null;
  avatar_url: string | null;
  tarifa_desde: number | string | null;
  moneda: string;
  ofrece_consulta_gratis: boolean;
  video_url: string | null;
  estado: EstadoExperto;
  verificado: boolean;
  documento_url: string | null;
  motivo_rechazo: string | null;
  rating_promedio: number | string;
  total_resenas: number;
  fecha_creacion: string;
  fecha_aprobacion: string | null;
}

export interface Patrocinio {
  id: string;
  experto_id: string;
  categoria: CategoriaExperto;
  estado: 'activo' | 'cancelado' | 'vencido';
  prioridad: number;
  fecha_inicio: string;
  fecha_fin: string | null;
}

// ─── Directorio público ──────────────────────────────────────────────────────

export interface FiltrosDirectorio {
  categoria?: CategoriaExperto;
  ciudad?: string;
  q?: string;
  pagina?: number;
  limite?: number;
}

export async function listarExpertos(filtros: FiltrosDirectorio = {}) {
  const { data } = await api.get<{
    expertos: ExpertoPublico[];
    total: number;
    pagina: number;
    limite: number;
  }>('/network/expertos', { params: filtros });
  return data;
}

export async function obtenerFicha(id: string) {
  const { data } = await api.get<{
    experto: FichaExperto;
    resenas: ResenaPublica[];
    distribucion: Distribucion;
  }>(`/network/expertos/${id}`);
  return data;
}

// ─── Ficha propia ────────────────────────────────────────────────────────────

export type DatosFicha = Partial<{
  nombre_comercial: string;
  nombre_display: string;
  bio_corta: string;
  bio_larga: string | null;
  categoria: CategoriaExperto;
  especialidad: string;
  sub_especialidades: string[];
  ciudad: string;
  pais: string | null;
  email_contacto: string | null;
  telefono: string | null;
  mostrar_contacto: boolean;
  sitio_web: string | null;
  avatar_url: string | null;
  tarifa_desde: number | null;
  moneda: string;
  ofrece_consulta_gratis: boolean;
  video_url: string | null;
  documento_url: string | null;
}>;

export async function misFichas() {
  const { data } = await api.get<{ fichas: FichaPropia[] }>('/network/mis-fichas');
  return data.fichas;
}

export async function crearFicha(datos: DatosFicha) {
  const { data } = await api.post<{ experto: FichaPropia; mensaje: string }>(
    '/network/expertos',
    datos
  );
  return data;
}

export async function editarFicha(id: string, datos: DatosFicha) {
  const { data } = await api.patch<{ experto: FichaPropia; mensaje: string }>(
    `/network/expertos/${id}`,
    datos
  );
  return data;
}

export async function borrarFicha(id: string) {
  await api.delete(`/network/expertos/${id}`);
}

// ─── Reseñas ─────────────────────────────────────────────────────────────────

export async function dejarResena(expertoId: string, puntuacion: number, comentario?: string) {
  const { data } = await api.post(`/network/expertos/${expertoId}/resenas`, {
    puntuacion,
    comentario: comentario?.trim() || null,
  });
  return data;
}

export async function editarResena(id: string, puntuacion: number, comentario?: string) {
  const { data } = await api.patch(`/network/resenas/${id}`, {
    puntuacion,
    comentario: comentario?.trim() || null,
  });
  return data;
}

export async function borrarResena(id: string) {
  await api.delete(`/network/resenas/${id}`);
}

// ─── Patrocinios ─────────────────────────────────────────────────────────────

export async function misPatrocinios() {
  const { data } = await api.get<{ patrocinios: Patrocinio[] }>('/network/mis-patrocinios');
  return data.patrocinios;
}

export async function iniciarPatrocinio(expertoId: string) {
  const { data } = await api.post<{ url: string }>('/network/patrocinios/checkout', {
    experto_id: expertoId,
  });
  return data.url;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function pendientesDeRevision() {
  const { data } = await api.get<{ fichas: FichaPropia[] }>('/admin/network/pendientes');
  return data.fichas;
}

export async function fichasAdmin(estado?: EstadoExperto) {
  const { data } = await api.get<{ fichas: FichaPropia[] }>('/admin/network/expertos', {
    params: estado ? { estado } : undefined,
  });
  return data.fichas;
}

export async function cambiarEstadoFicha(
  id: string,
  estado: EstadoExperto,
  extras: { verificado?: boolean; motivo_rechazo?: string } = {}
) {
  const { data } = await api.patch<{ experto: FichaPropia }>(
    `/admin/network/expertos/${id}/estado`,
    { estado, ...extras }
  );
  return data.experto;
}

// ─── Utilidades de presentación ──────────────────────────────────────────────

/**
 * Formatea la tarifa respetando la moneda que puso el experto.
 *
 * Devuelve `null` si no hay tarifa, para que quien lo llame decida qué decir.
 * El diseño anterior imprimía `$X MXN` con la moneda fija en el texto, así que
 * la tarifa de un experto colombiano o español salía etiquetada como pesos
 * mexicanos.
 */
export function formatearTarifa(valor: number | string | null, moneda: string): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (!Number.isFinite(numero)) return null;
  return `${numero.toLocaleString('es-MX', { maximumFractionDigits: 0 })} ${moneda}`;
}

export function errorLegible(e: unknown, porDefecto = 'Algo no funcionó'): string {
  const mensaje = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return mensaje || porDefecto;
}
