import { EntityManager } from 'typeorm';
import { z } from 'zod';
import { AuditoriaAdmin } from '../../models/AuditoriaAdmin';
import { Usuario } from '../../models/Usuario';
import type { AuthRequest } from '../../middleware/auth';

/**
 * Registro de las acciones de administración.
 *
 * La regla de uso es una sola: **se llama con el `manager` de la misma
 * transacción que hace el cambio.** Así, si el registro no se puede escribir,
 * el cambio tampoco se aplica. Un cambio sin rastro es exactamente lo que este
 * registro existe para impedir, y apuntarlo "después, si todo fue bien" deja una
 * ventana en la que el cambio ya ocurrió y el registro todavía puede fallar.
 */

export type RecursoAuditado = 'usuario' | 'experto' | 'resena' | 'documento' | 'rol';

export interface AccionAdmin {
  accion: string;
  recursoTipo: RecursoAuditado;
  recursoId?: string | null;
  antes?: Record<string, unknown> | null;
  despues?: Record<string, unknown> | null;
  motivo?: string | null;
}

/**
 * Motivo de una acción destructiva. Obligatorio y con contenido.
 *
 * Un campo que se rellena con "." no sirve para responder una reclamación: se
 * exige al menos una frase corta.
 */
export const MotivoSchema = z
  .string({ required_error: 'Indica el motivo: queda en el registro de auditoría' })
  .trim()
  .min(5, 'El motivo es demasiado corto: escribe por qué, queda en el registro de auditoría')
  .max(1000);

/** Rol con el que queda firmada la acción. */
function rolDe(admin: Pick<Usuario, 'es_admin'> & { admin_rol?: string | null }): string {
  return admin.admin_rol ?? (admin.es_admin ? 'superadmin' : 'desconocido');
}

/**
 * Escribe una acción en la auditoría, dentro de la transacción del cambio.
 *
 * Toma el email y el rol del admin **en este momento**: si mañana cambia de
 * email o pierde el rol, el registro sigue diciendo quién era cuando actuó.
 */
export async function registrarAccionAdmin(
  manager: EntityManager,
  req: AuthRequest,
  datos: AccionAdmin
): Promise<AuditoriaAdmin> {
  const admin = await manager.getRepository(Usuario).findOne({
    where: { id: req.userId! },
    select: ['id', 'email', 'es_admin'],
  });
  if (!admin) {
    // Sin admin identificable no hay a quién atribuir la acción: se aborta la
    // transacción entera en vez de registrar algo anónimo.
    throw new Error('[auditoria] no se encontró al admin que ejecuta la acción');
  }

  const repo = manager.getRepository(AuditoriaAdmin);
  return repo.save(
    repo.create({
      admin_id: admin.id,
      admin_email: admin.email,
      admin_rol: rolDe(admin as Usuario & { admin_rol?: string | null }),
      accion: datos.accion,
      recurso_tipo: datos.recursoTipo,
      recurso_id: datos.recursoId ?? null,
      antes: datos.antes ?? null,
      despues: datos.despues ?? null,
      motivo: datos.motivo?.trim() || null,
      ip: (req.ip ?? '').slice(0, 64) || null,
      user_agent: (req.get('user-agent') ?? '').slice(0, 500) || null,
    })
  );
}
