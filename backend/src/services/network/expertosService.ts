import { AppDataSource } from '../../config/database';
import type { CategoriaExperto } from '../../models/Experto';
import { IMPULSO_VIGENTE } from './impulsosService';

/**
 * Consultas del directorio de expertos.
 *
 * Dos reglas gobiernan todo lo que hay aquí:
 *
 *  1. **Solo se publica lo aprobado.** Cualquier consulta que sirva a un
 *     visitante filtra por `estado = 'aprobado'`. No es un detalle de UI: una
 *     ficha sin revisar no la ve nadie más que su dueño y un admin.
 *  2. **La publicidad va etiquetada.** Los patrocinados salen primero, pero
 *     vuelven marcados con `es_patrocinado` para que la interfaz lo diga.
 *     Colocar un anuncio donde el usuario cree ver un resultado por mérito es
 *     justo lo que hace que un directorio deje de servir para elegir.
 */

export interface FiltrosDirectorio {
  categoria?: CategoriaExperto;
  ciudad?: string;
  q?: string;
  limit: number;
  offset: number;
}

/** Lo que ve un visitante. Sin documento, sin teléfono, sin email. */
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
  direccion: string | null;
  google_maps_url: string | null;
  latitud: number | null;
  longitud: number | null;
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

/**
 * Columnas que puede ver cualquiera.
 *
 * Se enumeran a mano, y no con `SELECT e.*`, para que añadir una columna
 * sensible a `expertos` no la publique sola. `documento_url` —la cédula— es
 * exactamente el caso que esto protege.
 */
const COLUMNAS_PUBLICAS = `
  e.id,
  e.nombre_comercial,
  e.nombre_display,
  e.bio_corta,
  e.categoria,
  e.especialidad,
  e.sub_especialidades,
  e.ciudad,
  e.pais,
  e.direccion,
  e.google_maps_url,
  e.latitud,
  e.longitud,
  e.avatar_url,
  e.portada_url,
  e.sitio_web,
  e.tarifa_desde,
  e.moneda,
  e.ofrece_consulta_gratis,
  e.video_url,
  e.verificado,
  e.rating_promedio,
  e.total_resenas
`;

/** Un patrocinio cuenta solo si está activo y no ha caducado. */
const PATROCINIO_VIGENTE = `
  LEFT JOIN LATERAL (
    SELECT p.prioridad
      FROM patrocinios_experto p
     WHERE p.experto_id = e.id
       AND p.categoria  = e.categoria
       AND p.estado     = 'activo'
       AND (p.fecha_fin IS NULL OR p.fecha_fin > now())
     ORDER BY p.prioridad DESC
     LIMIT 1
  ) pat ON true
`;

type FilaDirectorio = {
  id: string;
  nombre_comercial: string;
  nombre_display: string;
  bio_corta: string;
  categoria: CategoriaExperto;
  especialidad: string;
  sub_especialidades: string[] | null;
  ciudad: string;
  pais: string | null;
  direccion: string | null;
  google_maps_url: string | null;
  latitud: string | null;
  longitud: string | null;
  avatar_url: string | null;
  portada_url: string | null;
  sitio_web: string | null;
  tarifa_desde: string | null;
  moneda: string;
  ofrece_consulta_gratis: boolean;
  video_url: string | null;
  verificado: boolean;
  rating_promedio: string | null;
  total_resenas: number;
  prioridad_patrocinio: number | null;
};

function aPublico(f: FilaDirectorio): ExpertoPublico {
  return {
    id: f.id,
    nombre_comercial: f.nombre_comercial,
    nombre_display: f.nombre_display,
    bio_corta: f.bio_corta,
    categoria: f.categoria,
    especialidad: f.especialidad,
    sub_especialidades: Array.isArray(f.sub_especialidades) ? f.sub_especialidades : [],
    ciudad: f.ciudad,
    pais: f.pais,
    direccion: f.direccion ?? null,
    google_maps_url: f.google_maps_url ?? null,
    latitud: f.latitud === null || f.latitud === undefined ? null : Number(f.latitud),
    longitud: f.longitud === null || f.longitud === undefined ? null : Number(f.longitud),
    avatar_url: f.avatar_url,
    portada_url: f.portada_url,
    sitio_web: f.sitio_web,
    // null significa "no ha puesto tarifa", que no es lo mismo que "es gratis".
    tarifa_desde: f.tarifa_desde === null ? null : Number(f.tarifa_desde),
    moneda: f.moneda,
    ofrece_consulta_gratis: f.ofrece_consulta_gratis,
    // Se expone si HAY vídeo, no la URL: el reproductor va en la ficha.
    video_disponible: Boolean(f.video_url),
    verificado: f.verificado,
    rating: f.rating_promedio === null ? 0 : Number(f.rating_promedio),
    total_resenas: f.total_resenas,
    es_patrocinado: f.prioridad_patrocinio !== null,
  };
}

/**
 * Directorio público.
 *
 * Orden: patrocinados primero (por prioridad), luego mejor valorados, y a
 * igualdad de rating los más antiguos. El desempate por antigüedad evita que
 * dos fichas recién creadas —ambas con rating 0— bailen de posición entre
 * peticiones y la paginación repita o se salte a alguien.
 */
export async function listarDirectorio(
  f: FiltrosDirectorio
): Promise<{ expertos: ExpertoPublico[]; total: number }> {
  // Aprobada Y sin la cuenta del dueño en la papelera: el directorio es público
  // y no pasa por su sesión, así que tiene que excluirla él mismo.
  const where: string[] = [`e.estado = 'aprobado'`, `e.eliminado_en IS NULL`];
  const params: unknown[] = [];

  if (f.categoria) {
    params.push(f.categoria);
    where.push(`e.categoria = $${params.length}`);
  }
  if (f.ciudad) {
    params.push(f.ciudad);
    where.push(`lower(e.ciudad) = lower($${params.length})`);
  }
  if (f.q) {
    // ILIKE con comodines: el texto va parametrizado, nunca interpolado.
    params.push(`%${f.q}%`);
    const i = params.length;
    where.push(
      `(e.nombre_comercial ILIKE $${i} OR e.nombre_display ILIKE $${i} OR e.especialidad ILIKE $${i} OR e.bio_corta ILIKE $${i})`
    );
  }
  const filtro = where.join(' AND ');

  const filas: FilaDirectorio[] = await AppDataSource.query(
    `SELECT ${COLUMNAS_PUBLICAS}, pat.prioridad AS prioridad_patrocinio
       FROM expertos e
       ${PATROCINIO_VIGENTE}
      WHERE ${filtro}
      ORDER BY pat.prioridad DESC NULLS LAST,
               e.rating_promedio DESC,
               e.fecha_creacion ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, f.limit, f.offset]
  );

  const [{ total }]: [{ total: string }] = await AppDataSource.query(
    `SELECT count(*)::int AS total FROM expertos e WHERE ${filtro}`,
    params
  );

  return { expertos: filas.map(aPublico), total: Number(total) };
}

/**
 * Expertos con un impulso vigente para esta búsqueda, en orden aleatorio.
 *
 * Con ciudad en el filtro entran los impulsos de esa ciudad y los nacionales;
 * sin ciudad, solo los nacionales: un impulso de Monterrey no compró aparecer a
 * quien busca en todo el país. El orden aleatorio reparte los huecos entre
 * quienes pagaron lo mismo.
 */
export async function listarPromocionados(f: {
  categoria?: CategoriaExperto;
  ciudad?: string;
  q?: string;
  limite: number;
}): Promise<ExpertoPublico[]> {
  const where: string[] = [`e.estado = 'aprobado'`, `e.eliminado_en IS NULL`];
  const params: unknown[] = [];
  if (f.categoria) {
    params.push(f.categoria);
    where.push(`e.categoria = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q}%`);
    const i = params.length;
    where.push(
      `(e.nombre_comercial ILIKE $${i} OR e.nombre_display ILIKE $${i} OR e.especialidad ILIKE $${i} OR e.bio_corta ILIKE $${i})`
    );
  }
  let lugar = `i.alcance = 'nacional'`;
  if (f.ciudad) {
    params.push(f.ciudad);
    lugar = `(i.alcance = 'nacional' OR lower(i.ciudad) = lower($${params.length}))`;
  }
  params.push(f.limite);

  const filas: FilaDirectorio[] = await AppDataSource.query(
    `SELECT ${COLUMNAS_PUBLICAS}, 1 AS prioridad_patrocinio
       FROM expertos e
      WHERE ${where.join(' AND ')}
        AND EXISTS (
          SELECT 1 FROM impulsos_experto i
           WHERE i.experto_id = e.id AND i.categoria = e.categoria
             AND ${IMPULSO_VIGENTE} AND ${lugar}
        )
      ORDER BY random()
      LIMIT $${params.length}`,
    params
  );
  return filas.map(aPublico);
}

export interface ImagenPublica {
  id: string;
  url: string;
  descripcion: string;
  tipo?: string;
}

export interface ServicioPublico {
  id: string;
  nombre: string;
  descripcion: string;
  precio_desde: number | null;
  unidad: string;
}

export async function imagenesDe(expertoId: string): Promise<ImagenPublica[]> {
  return AppDataSource.query(
    `SELECT id, url, descripcion, COALESCE(tipo, 'imagen') AS tipo
       FROM experto_imagenes
      WHERE experto_id = $1
      ORDER BY orden, fecha_creacion`,
    [expertoId]
  );
}

export async function serviciosDe(expertoId: string): Promise<ServicioPublico[]> {
  const filas = await AppDataSource.query(
    `SELECT id, nombre, descripcion, precio_desde, unidad
       FROM experto_servicios WHERE experto_id = $1 ORDER BY orden, fecha_creacion`,
    [expertoId]
  );
  return filas.map((s: ServicioPublico & { precio_desde: string | null }) => ({
    ...s,
    precio_desde: s.precio_desde === null ? null : Number(s.precio_desde),
  }));
}

export interface FichaPublica extends ExpertoPublico {
  bio_larga: string | null;
  video_url: string | null;
  email_contacto: string | null;
  telefono: string | null;
  whatsapp: string | null;
  fecha_aprobacion: Date | null;
  imagenes: ImagenPublica[];
  servicios: ServicioPublico[];
  /** Dueño de la ficha: no se publica, sirve para no contar sus propias visitas. */
  usuario_id?: string | null;
}

/**
 * Ficha pública de un experto aprobado, o `null` si no existe o no está
 * aprobado —el mismo 404 en ambos casos, para no confirmar la existencia de
 * fichas pendientes o rechazadas a quien vaya probando ids.
 *
 * El email y el teléfono solo salen si el experto marcó `mostrar_contacto`.
 * Son datos personales de un profesional real: publicarlos por defecto lo
 * expone a spam sin que él lo haya pedido.
 */
export async function obtenerFichaPublica(id: string): Promise<FichaPublica | null> {
  const filas: (FilaDirectorio & {
    bio_larga: string | null;
    mostrar_contacto: boolean;
    email_contacto: string | null;
    telefono: string | null;
    whatsapp: string | null;
    usuario_id: string | null;
    fecha_aprobacion: Date | null;
  })[] = await AppDataSource.query(
    `SELECT ${COLUMNAS_PUBLICAS},
            e.bio_larga, e.mostrar_contacto, e.email_contacto, e.telefono, e.whatsapp, e.usuario_id,
            e.fecha_aprobacion,
            pat.prioridad AS prioridad_patrocinio
       FROM expertos e
       ${PATROCINIO_VIGENTE}
      WHERE e.id = $1 AND e.estado = 'aprobado' AND e.eliminado_en IS NULL
      LIMIT 1`,
    [id]
  );

  const f = filas[0];
  if (!f) return null;

  const [imagenes, servicios, impulsado] = await Promise.all([
    imagenesDe(f.id),
    serviciosDe(f.id),
    AppDataSource.query(
      `SELECT EXISTS (SELECT 1 FROM impulsos_experto i WHERE i.experto_id = $1 AND ${IMPULSO_VIGENTE}) AS si`,
      [f.id]
    ),
  ]);

  const ficha = aPublico(f);
  return {
    ...ficha,
    es_patrocinado: ficha.es_patrocinado || Boolean(impulsado[0]?.si),
    bio_larga: f.bio_larga,
    video_url: f.video_url,
    email_contacto: f.mostrar_contacto ? f.email_contacto : null,
    telefono: f.mostrar_contacto ? f.telefono : null,
    // WhatsApp es el botón de contacto: quien lo rellena quiere que le escriban.
    whatsapp: f.whatsapp,
    fecha_aprobacion: f.fecha_aprobacion,
    imagenes,
    servicios,
    usuario_id: f.usuario_id,
  };
}
