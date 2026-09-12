import { AppDataSource } from '../../config/database';

/**
 * Reseñas de expertos.
 *
 * El rating vive desnormalizado en `expertos` para que el directorio no tenga
 * que agregar reseñas en cada listado, y esa copia es lo primero que se queda
 * obsoleta. Por eso todo el que toque una reseña —crear, editar, ocultar,
 * borrar— pasa por `recalcularRating`, y el recálculo no suma ni resta sobre el
 * valor anterior: lo vuelve a sacar de las reseñas publicadas.
 *
 * Reconstruir desde la verdad en vez de ir acumulando significa que dos
 * peticiones simultáneas, o un fallo a medias, no dejan un promedio inventado
 * que nadie sabría que está mal.
 */

export interface ResenaPublica {
  id: string;
  puntuacion: number;
  comentario: string | null;
  autor: string;
  fecha_creacion: Date;
  es_mia: boolean;
}

/**
 * Recalcula `rating_promedio` y `total_resenas` desde cero.
 *
 * Solo cuentan las reseñas `publicada`: ocultar una reseña abusiva tiene que
 * quitarla también del promedio, o el moderador la esconde y el daño sigue
 * puesto en la estrella.
 */
export async function recalcularRating(expertoId: string): Promise<void> {
  await AppDataSource.query(
    `UPDATE expertos e
        SET rating_promedio = COALESCE(agg.promedio, 0),
            total_resenas   = COALESCE(agg.total, 0)
       FROM (
         SELECT round(avg(puntuacion)::numeric, 2) AS promedio,
                count(*)                          AS total
           FROM resenas_experto
          WHERE experto_id = $1 AND estado = 'publicada'
       ) agg
      WHERE e.id = $1`,
    [expertoId]
  );
}

/**
 * Reseñas publicadas de un experto, de la más reciente a la más antigua.
 *
 * `autor` es el nombre del usuario, nunca su email. `es_mia` permite que la
 * interfaz ofrezca editar la propia sin tener que adivinar cuál es.
 */
export async function listarPublicadas(
  expertoId: string,
  usuarioId?: string,
  limite = 50
): Promise<ResenaPublica[]> {
  const filas: {
    id: string;
    puntuacion: number;
    comentario: string | null;
    autor: string | null;
    usuario_id: string;
    fecha_creacion: Date;
  }[] = await AppDataSource.query(
    `SELECT r.id, r.puntuacion, r.comentario, r.usuario_id, r.fecha_creacion, u.nombre AS autor
       FROM resenas_experto r
       JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.experto_id = $1 AND r.estado = 'publicada'
      ORDER BY r.fecha_creacion DESC
      LIMIT $2`,
    [expertoId, limite]
  );

  return filas.map((f) => ({
    id: f.id,
    puntuacion: f.puntuacion,
    comentario: f.comentario,
    autor: f.autor?.trim() || 'Usuario',
    fecha_creacion: f.fecha_creacion,
    es_mia: Boolean(usuarioId) && f.usuario_id === usuarioId,
  }));
}

/** Reparto de estrellas, para pintar la barra de distribución de la ficha. */
export async function distribucion(expertoId: string): Promise<Record<1 | 2 | 3 | 4 | 5, number>> {
  const filas: { puntuacion: number; total: string }[] = await AppDataSource.query(
    `SELECT puntuacion, count(*)::int AS total
       FROM resenas_experto
      WHERE experto_id = $1 AND estado = 'publicada'
      GROUP BY puntuacion`,
    [expertoId]
  );

  const reparto = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const f of filas) {
    const p = f.puntuacion as 1 | 2 | 3 | 4 | 5;
    if (p >= 1 && p <= 5) reparto[p] = Number(f.total);
  }
  return reparto;
}
