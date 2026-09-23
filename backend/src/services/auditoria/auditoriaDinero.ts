import { EntityManager } from 'typeorm';
import { AuditoriaDinero, AccionAuditada } from '../../models/AuditoriaDinero';
import type { AuthRequest } from '../../middleware/auth';

export interface DatosAuditoria {
  accion: AccionAuditada;
  entidad: 'venta' | 'movimiento_contable';
  entidadId: string;
  productoId?: string | null;
  montoAntes?: number | null;
  montoDespues?: number | null;
  motivo?: string | null;
  detalle?: Record<string, unknown> | null;
}

/**
 * Deja constancia de un cambio sobre dinero ya registrado.
 *
 * Se llama SIEMPRE con el `manager` de la transacción que hace el cambio: si el
 * cambio se deshace, el rastro también, y nunca puede haber un movimiento sin
 * su huella. `req` aporta la cuenta (`userId`, ya resuelta al dueño por el
 * gating) y la persona real que operó (`trabajadorRealId`).
 */
export async function auditarDinero(
  manager: EntityManager,
  req: AuthRequest,
  datos: DatosAuditoria,
): Promise<void> {
  await manager.save(
    AuditoriaDinero,
    manager.create(AuditoriaDinero, {
      usuario_id: req.userId!,
      actor_id: req.trabajadorRealId ?? req.userId ?? null,
      accion: datos.accion,
      entidad: datos.entidad,
      entidad_id: datos.entidadId,
      producto_id: datos.productoId ?? null,
      monto_antes: datos.montoAntes ?? null,
      monto_despues: datos.montoDespues ?? null,
      motivo: datos.motivo?.trim() || null,
      detalle: datos.detalle ?? null,
    }),
  );
}
