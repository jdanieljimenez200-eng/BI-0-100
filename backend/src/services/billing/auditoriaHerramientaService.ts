import { AuditoriaHerramienta, AccionHerramienta } from '../../models/AuditoriaHerramienta';
import { Plan } from '../../models/Usuario';

/**
 * Construye un objeto de auditoría (sin persistencia).
 * Función pura que solo organiza datos — testeable sin BD.
 */
export function construirRegistroAuditoria(
  usuario_id: string,
  herramienta_key: string,
  accion: AccionHerramienta,
  plan_snapshot: Plan,
  razon?: string,
): {
  usuario_id: string;
  herramienta_key: string;
  accion: AccionHerramienta;
  plan_snapshot: Plan;
  razon: string | null;
} {
  return {
    usuario_id,
    herramienta_key,
    accion,
    plan_snapshot,
    razon: razon || null,
  };
}

/**
 * Registra un cambio de herramienta en auditoría.
 * Usa lazy import para AppDataSource para testabilidad.
 */
export async function registrarCambioHerramienta(
  usuario_id: string,
  herramienta_key: string,
  accion: AccionHerramienta,
  plan_snapshot: Plan,
  razon?: string,
): Promise<void> {
  const { AppDataSource } = await import('../../config/database');
  const datos = construirRegistroAuditoria(usuario_id, herramienta_key, accion, plan_snapshot, razon);
  const repo = AppDataSource.getRepository(AuditoriaHerramienta);
  const registro = repo.create(datos);
  await repo.save(registro);
}

/**
 * Obtiene historial de cambios para un usuario (owner only).
 */
export async function obtenerHistorialHerramientas(
  usuario_id: string,
  limit: number = 100,
  offset: number = 0,
): Promise<AuditoriaHerramienta[]> {
  const { AppDataSource } = await import('../../config/database');
  const repo = AppDataSource.getRepository(AuditoriaHerramienta);
  const limitSafe = Math.max(1, limit);
  const offsetSafe = Math.max(0, offset);
  return repo.find({
    where: { usuario_id },
    order: { created_at: 'DESC' },
    take: limitSafe,
    skip: offsetSafe,
  });
}