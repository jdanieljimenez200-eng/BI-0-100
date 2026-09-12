import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { PatrocinioExperto } from '../../models/PatrocinioExperto';
import { Experto } from '../../models/Experto';
import type { CategoriaExperto } from '../../models/Experto';
import { logger } from '../../utils/logger';

/**
 * Patrocinios: el experto paga por aparecer arriba de su categoría.
 *
 * Todo lo que hay aquí lo llama el webhook de Stripe, que puede reenviar el
 * mismo evento varias veces. Así que cada función es **idempotente**: repetirla
 * deja el mismo resultado que ejecutarla una vez. El ancla es
 * `stripe_subscription_id`, único en la base.
 *
 * Lo que NO hay aquí, a propósito: nada que cobre la consulta del experto al
 * cliente. La plataforma no intermedia ese dinero, y eso es lo que ahorra
 * Stripe Connect, el KYC de terceros y la responsabilidad fiscal sobre fondos
 * ajenos.
 */

/**
 * Activa (o reactiva) el patrocinio de una suscripción.
 *
 * Si la suscripción ya tenía una fila, se actualiza en vez de crear otra: un
 * reenvío del webhook, o una renovación mensual, no debe duplicar patrocinios
 * ni dejar dos filas compitiendo por la misma posición.
 */
export async function activarPatrocinio(
  manager: EntityManager,
  datos: {
    expertoId: string;
    categoria: CategoriaExperto;
    subscriptionId: string;
    fechaFin: Date | null;
    prioridad?: number;
  }
): Promise<PatrocinioExperto | null> {
  const repo = manager.getRepository(PatrocinioExperto);

  // La ficha tiene que existir: si no, hay un patrocinio pagado apuntando a
  // nada, y eso merece un registro en el log antes que un fallo silencioso.
  const experto = await manager.getRepository(Experto).findOne({
    where: { id: datos.expertoId },
    select: ['id'],
  });
  if (!experto) {
    logger.error(
      `[network] patrocinio ${datos.subscriptionId} apunta al experto ${datos.expertoId}, que no existe`
    );
    return null;
  }

  const existente = await repo.findOne({ where: { stripe_subscription_id: datos.subscriptionId } });

  if (existente) {
    existente.estado = 'activo';
    existente.categoria = datos.categoria;
    existente.fecha_fin = datos.fechaFin;
    if (datos.prioridad !== undefined) existente.prioridad = datos.prioridad;
    return repo.save(existente);
  }

  return repo.save(
    repo.create({
      experto_id: datos.expertoId,
      categoria: datos.categoria,
      stripe_subscription_id: datos.subscriptionId,
      estado: 'activo',
      prioridad: datos.prioridad ?? 10,
      fecha_fin: datos.fechaFin,
    })
  );
}

/**
 * Cierra un patrocinio: cancelado (el experto lo dio de baja) o vencido (el
 * pago dejó de entrar).
 *
 * No borra la fila. Queda el rastro de que ese experto estuvo patrocinado y
 * hasta cuándo, que es lo que hace falta para responder una reclamación.
 */
export async function cerrarPatrocinio(
  manager: EntityManager,
  subscriptionId: string,
  estado: 'cancelado' | 'vencido'
): Promise<void> {
  const repo = manager.getRepository(PatrocinioExperto);
  const patrocinio = await repo.findOne({ where: { stripe_subscription_id: subscriptionId } });
  if (!patrocinio) return;

  patrocinio.estado = estado;
  patrocinio.fecha_fin = patrocinio.fecha_fin ?? new Date();
  await repo.save(patrocinio);
}

/** Los patrocinios de las fichas de un usuario, para su propio panel. */
export async function listarDeUsuario(usuarioId: string): Promise<PatrocinioExperto[]> {
  return AppDataSource.getRepository(PatrocinioExperto)
    .createQueryBuilder('p')
    .innerJoin(Experto, 'e', 'e.id = p.experto_id')
    .where('e.usuario_id = :usuarioId', { usuarioId })
    .orderBy('p.fecha_inicio', 'DESC')
    .getMany();
}

/** ¿Esta ficha ya tiene un patrocinio vigente en su categoría? */
export async function tienePatrocinioVigente(expertoId: string): Promise<boolean> {
  const [{ existe }]: [{ existe: boolean }] = await AppDataSource.query(
    `SELECT EXISTS (
       SELECT 1 FROM patrocinios_experto
        WHERE experto_id = $1
          AND estado = 'activo'
          AND (fecha_fin IS NULL OR fecha_fin > now())
     ) AS existe`,
    [expertoId]
  );
  return existe;
}
