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

export type CategoriaExperto =
  | 'legal'
  | 'contabilidad'
  | 'marketing'
  | 'diseno'
  | 'ventas'
  | 'proveedores'
  | 'tecnologia';
export type EstadoExperto = 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido';

export const CATEGORIAS: CategoriaExperto[] = [
  'legal',
  'contabilidad',
  'marketing',
  'diseno',
  'ventas',
  'proveedores',
  'tecnologia',
];

export const NOMBRE_CATEGORIA: Record<CategoriaExperto, string> = {
  legal: 'Legal',
  contabilidad: 'Contabilidad y fiscal',
  marketing: 'Marketing',
  diseno: 'Diseño y marca',
  ventas: 'Ventas y distribución',
  proveedores: 'Proveedores y fabricantes',
  tecnologia: 'Tecnología',
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
  direccion?: string | null;
  google_maps_url?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  avatar_url: string | null;
  portada_url: string | null;
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
  /** Solo dígitos con lada de país, listo para wa.me. */
  whatsapp: string | null;
  fecha_aprobacion: string | null;
  imagenes: ImagenPerfil[];
  servicios: ServicioPerfil[];
  /** El visitante es el dueño: no se le ofrece contactarse ni valorarse. */
  es_mia?: boolean;
}

export interface ImagenPerfil {
  id: string;
  url: string;
  descripcion: string;
  tipo?: 'imagen' | 'video';
}

export interface ServicioPerfil {
  id: string;
  nombre: string;
  descripcion: string;
  precio_desde: number | null;
  unidad: string;
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
  direccion?: string | null;
  google_maps_url?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  email_contacto: string | null;
  telefono: string | null;
  whatsapp: string | null;
  mostrar_contacto: boolean;
  sitio_web: string | null;
  avatar_url: string | null;
  portada_url: string | null;
  tarifa_desde: number | string | null;
  moneda: string;
  ofrece_consulta_gratis: boolean;
  video_url: string | null;
  estado: EstadoExperto;
  verificado: boolean;
  /**
   * Si hay documento de acreditación. La ubicación del fichero no sale nunca
   * del backend: el documento solo se abre con `abrirDocumento`, como admin.
   */
  tiene_documento: boolean;
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
    /** Impulsados para esta búsqueda. Solo llegan en la primera página. */
    promocionados?: ExpertoPublico[];
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
  direccion: string | null;
  google_maps_url: string | null;
  latitud: number | null;
  longitud: number | null;
  email_contacto: string | null;
  telefono: string | null;
  whatsapp: string | null;
  mostrar_contacto: boolean;
  sitio_web: string | null;
  avatar_url: string | null;
  tarifa_desde: number | null;
  moneda: string;
  ofrece_consulta_gratis: boolean;
  video_url: string | null;
}>;

/**
 * Obtiene el enlace de Google Maps a partir de los datos disponibles en la ficha
 * (enlace explícito de Maps, coordenadas GPS, o búsqueda por dirección/ciudad).
 */
export function obtenerEnlaceGoogleMaps(experto: {
  direccion?: string | null;
  ciudad?: string;
  pais?: string | null;
  google_maps_url?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  nombre_comercial?: string;
}): string | null {
  if (experto.google_maps_url?.trim()) {
    return experto.google_maps_url.trim();
  }
  if (experto.latitud != null && experto.longitud != null) {
    return `https://www.google.com/maps?q=${experto.latitud},${experto.longitud}`;
  }
  const partes = [experto.nombre_comercial, experto.direccion, experto.ciudad, experto.pais]
    .map((s) => s?.trim())
    .filter(Boolean);
  if (partes.length > 0) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(', '))}`;
  }
  return null;
}

export interface CupoNet0 {
  fichas_actuales: number;
  limite_permitido: number;
  negocios_activos: number;
  puede_crear: boolean;
}

export interface NegocioDisponibleNet0 {
  id: string;
  nombre: string;
  emoji?: string;
  descripcion?: string;
}

export interface RespuestaMisFichas {
  fichas: FichaPropia[];
  cupo: CupoNet0;
  negocios_disponibles: NegocioDisponibleNet0[];
}

export async function misFichas(): Promise<RespuestaMisFichas> {
  const { data } = await api.get<RespuestaMisFichas>('/network/mis-fichas');
  return data;
}

export async function obtenerCupoNet0(): Promise<CupoNet0> {
  const { data } = await api.get<CupoNet0>('/network/cupo');
  return data;
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

/**
 * Sube el documento de acreditación. Devuelve la ficha a revisión: el documento
 * es la prueba sobre la que decide quien revisa.
 */
export async function subirDocumento(id: string, fichero: File) {
  const datos = new FormData();
  datos.append('documento', fichero);
  const { data } = await api.post<{ mensaje: string }>(`/network/expertos/${id}/documento`, datos, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function subirAvatar(id: string, fichero: File) {
  const datos = new FormData();
  datos.append('avatar', fichero);
  const { data } = await api.post<{ avatar_url: string }>(`/network/expertos/${id}/avatar`, datos, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.avatar_url;
}

export async function subirPortada(id: string, fichero: File) {
  const datos = new FormData();
  datos.append('portada', fichero);
  const { data } = await api.post<{ portada_url: string }>(`/network/expertos/${id}/portada`, datos, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.portada_url;
}

// ─── Galería y servicios ─────────────────────────────────────────────────────

export async function contenidoFicha(id: string) {
  const { data } = await api.get<{
    imagenes: ImagenPerfil[];
    servicios: ServicioPerfil[];
    max_imagenes: number;
    max_servicios: number;
  }>(`/network/expertos/${id}/contenido`);
  return data;
}

export async function subirImagenGaleria(id: string, fichero: File, descripcion = '') {
  const datos = new FormData();
  datos.append('archivo', fichero);
  datos.append('imagen', fichero);
  if (descripcion) datos.append('descripcion', descripcion);
  const { data } = await api.post<{ imagen: ImagenPerfil }>(`/network/expertos/${id}/imagenes`, datos, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.imagen;
}

export async function insertarVideoGaleria(id: string, url: string, descripcion = '') {
  const { data } = await api.post<{ imagen: ImagenPerfil }>(`/network/expertos/${id}/videos`, {
    url,
    descripcion,
  });
  return data.imagen;
}

/**
 * Detecta si un recurso de la galería es un vídeo (por su tipo explícito, extensión o dominio).
 */
export function esUrlVideo(url?: string | null, tipo?: string): boolean {
  if (tipo === 'video') return true;
  if (!url) return false;
  const limpio = url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v)$/i.test(limpio)) return true;
  if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)/i.test(url)) return true;
  return false;
}

/** Extrae el ID de un vídeo de YouTube si la URL corresponde a esta plataforma. */
export function obtenerYoutubeId(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match ? match[1] : null;
}

/** Extrae el ID de un vídeo de Vimeo si la URL corresponde a esta plataforma. */
export function obtenerVimeoId(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)/i);
  return match ? match[3] : null;
}

/** Retorna la URL de inserción (embed) para reproductores iframe de YouTube o Vimeo. */
export function obtenerEmbedVideoUrl(url?: string | null): string | null {
  if (!url) return null;
  const ytId = obtenerYoutubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`;
  const vimeoId = obtenerVimeoId(url);
  if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}?autoplay=1`;
  return null;
}

/** Obtiene la miniatura optimizada de un vídeo (ej. YouTube hqdefault). */
export function obtenerMiniaturaVideo(url?: string | null): string | null {
  if (!url) return null;
  const ytId = obtenerYoutubeId(url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return null;
}

export async function borrarImagenGaleria(id: string, imagenId: string) {
  await api.delete(`/network/expertos/${id}/imagenes/${imagenId}`);
}

export async function ordenarGaleria(id: string, ids: string[]) {
  const { data } = await api.put<{ imagenes: ImagenPerfil[] }>(`/network/expertos/${id}/imagenes/orden`, { ids });
  return data.imagenes;
}

export type DatosServicio = Omit<ServicioPerfil, 'id'>;

export async function crearServicio(id: string, datos: DatosServicio) {
  const { data } = await api.post<{ servicio: ServicioPerfil }>(`/network/expertos/${id}/servicios`, datos);
  return data.servicio;
}

export async function editarServicio(id: string, servicioId: string, datos: Partial<DatosServicio>) {
  const { data } = await api.patch<{ servicio: ServicioPerfil }>(
    `/network/expertos/${id}/servicios/${servicioId}`,
    datos
  );
  return data.servicio;
}

export async function borrarServicio(id: string, servicioId: string) {
  await api.delete(`/network/expertos/${id}/servicios/${servicioId}`);
}

// ─── Contacto y métricas ─────────────────────────────────────────────────────

export type CanalContacto = 'whatsapp' | 'telefono' | 'email' | 'web';

/**
 * Anota el clic de contacto sin retrasar la apertura del enlace: si la petición
 * falla, el visitante igual llega a WhatsApp.
 */
export function registrarContacto(expertoId: string, canal: CanalContacto): void {
  api.post(`/network/expertos/${expertoId}/contacto`, { canal }).catch(() => undefined);
}

export interface TotalesMetricas {
  impresiones: number;
  impresiones_impulsadas: number;
  vistas: number;
  clics_whatsapp: number;
  clics_telefono: number;
  clics_email: number;
  clics_web: number;
}

export interface MetricasPerfil {
  dias: number;
  totales: TotalesMetricas;
  serie: ({ fecha: string } & TotalesMetricas)[];
}

export async function metricasFicha(id: string, dias = 30) {
  const { data } = await api.get<MetricasPerfil>(`/network/expertos/${id}/metricas`, { params: { dias } });
  return data;
}

// ─── Impulsos ────────────────────────────────────────────────────────────────

export type AlcanceImpulso = 'ciudad' | 'nacional';

export interface TarifasImpulso {
  moneda: 'MXN';
  tarifa_dia: Record<AlcanceImpulso, number>;
  dias_min: number;
  dias_max: number;
  cupo: number;
}

export interface Cotizacion {
  monto_mxn: number;
  tarifa_dia: number;
  dias: number;
  cupo: number;
  ocupados: number;
  disponible: boolean;
  libera_el: string | null;
}

export interface Impulso {
  id: string;
  experto_id: string;
  nombre_comercial: string;
  categoria: CategoriaExperto;
  alcance: AlcanceImpulso;
  ciudad: string | null;
  dias: number;
  monto_mxn: number;
  estado: 'pendiente_pago' | 'activo' | 'terminado' | 'cancelado';
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_creacion: string;
  motivo_cancelacion: string | null;
  metricas: { impresiones: number; vistas: number; clics: number };
}

export interface PedidoImpulso {
  experto_id: string;
  alcance: AlcanceImpulso;
  ciudad?: string | null;
  dias: number;
}

export async function tarifasImpulso() {
  const { data } = await api.get<TarifasImpulso>('/network/impulsos/tarifas');
  return data;
}

export async function cotizarImpulso(pedido: PedidoImpulso) {
  const { data } = await api.get<Cotizacion>('/network/impulsos/cotizacion', { params: pedido });
  return data;
}

export async function pagarImpulso(pedido: PedidoImpulso) {
  const { data } = await api.post<{ url: string }>('/network/impulsos/checkout', pedido);
  return data.url;
}

export async function misImpulsos() {
  const { data } = await api.get<{ impulsos: Impulso[] }>('/network/mis-impulsos');
  return data.impulsos;
}

export async function impulsosAdmin() {
  const { data } = await api.get<{ impulsos: Impulso[] }>('/admin/network/impulsos');
  return data.impulsos;
}

export async function cancelarImpulso(id: string, motivo: string) {
  await api.patch(`/admin/network/impulsos/${id}/cancelar`, { motivo });
}

export function pesosMx(valor: number): string {
  return `$${valor.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN`;
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

/**
 * Abre el documento de acreditación de una ficha en una pestaña nueva.
 *
 * No existe una URL del documento que se pueda pegar en un `href`: el endpoint
 * exige la sesión de admin en cada petición. Así que se descarga con el token,
 * se convierte en un objeto local del navegador y se abre ese. El enlace
 * resultante solo vale en esta pestaña y muere al cerrarla.
 */
export async function abrirDocumento(id: string) {
  // La pestaña se abre YA, dentro del clic. Abrirla después del `await` la
  // convierte en una ventana emergente que el navegador bloquea sin avisar.
  const ventana = window.open('', '_blank');
  try {
    const { data, headers } = await api.get<Blob>(`/admin/network/expertos/${id}/documento`, {
      responseType: 'blob',
    });
    const tipo = String(headers['content-type'] ?? data.type ?? 'application/octet-stream');
    const url = URL.createObjectURL(new Blob([data], { type: tipo }));
    if (ventana) {
      ventana.location.href = url;
    } else {
      window.location.href = url;
    }
    // Da tiempo a la pestaña a leerlo antes de liberar la memoria.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    ventana?.close();
    throw e;
  }
}

export async function cambiarEstadoFicha(
  id: string,
  estado: EstadoExperto,
  extras: { verificado?: boolean; motivo_rechazo?: string } = {}
) {
  const { data } = await api.patch<{ experto: FichaPropia; avisado: boolean }>(
    `/admin/network/expertos/${id}/estado`,
    { estado, ...extras }
  );
  return data;
}

// ─── Moderación de reseñas (admin) ──────────────────────────────────────────

export interface ResenaAdmin {
  id: string;
  experto_id: string;
  usuario_id: string;
  puntuacion: number;
  comentario: string | null;
  estado: 'publicada' | 'oculta';
  fecha_creacion: string;
}

export async function resenasAdmin(estado?: 'publicada' | 'oculta') {
  const { data } = await api.get<{ resenas: ResenaAdmin[] }>('/admin/network/resenas', {
    params: estado ? { estado } : undefined,
  });
  return data.resenas;
}

/** Ocultar exige motivo (queda en la auditoría); volver a publicar, no. */
export async function moderarResena(id: string, estado: 'publicada' | 'oculta', motivo?: string) {
  const { data } = await api.patch<{ resena: ResenaAdmin }>(`/admin/network/resenas/${id}/estado`, {
    estado,
    motivo,
  });
  return data.resena;
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
