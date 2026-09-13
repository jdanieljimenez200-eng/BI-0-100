import { AppDataSource } from '../../config/database';
import { AnalisisLegal } from '../../models/AnalisisLegal';
import { Producto } from '../../models/Producto';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { generarAnalisisLegal } from './legalService';
import { LegalAnalisisInput } from './types';
import { emitAnalysisUpdate } from '../../events/sse';
import { huboFallbackIA } from '../../utils/seguimientoIA';
import { logger } from '../../utils/logger';

// ─── Ejecutar análisis completo (llamado por el Worker) ───────────────────────

export async function ejecutarAnalisisLegal(
  analisisId: string,
  producto: Producto,
  input: LegalAnalisisInput
): Promise<void> {
  const repo = AppDataSource.getRepository(AnalisisLegal);

  try {
    const resultado = await generarAnalisisLegal(producto, input);

    await repo.update(analisisId, {
      resultado_data: resultado,
      giro_detectado: resultado.giro_detectado,
      cumplimiento_global: resultado.cumplimiento_global,
      puntaje_cumplimiento: resultado.puntaje_cumplimiento,
      resultado_estimado: huboFallbackIA(),
      estado_analisis: 'completado',
      fecha_completado: new Date(),
    });

     logger.info(`✅ Análisis legal ${analisisId} completado`);

    // Push SSE: sin esto el frontend solo se enteraba por polling.
    emitAnalysisUpdate(input.usuarioId, {
      tipo: 'legal',
      estado: 'completado',
      productoId: input.productoId,
      id: analisisId,
    });

    // Notificación email (fire-and-forget)
    notificarAnalisisCompleto({
      ownerId: input.usuarioId,
      trabajadorId: input.trabajadorId,
      productoNombre: producto.nombre,
      productoId: input.productoId,
      analisisId,
      modulo: 'legal',
    }).catch(swallowWithLog('email:analisis_completo', { analisisId, modulo: 'legal' }));
  } catch (err) {
    // Solo se registra y se relanza: la cola marca el error y avisa al usuario
    // cuando ya no quedan reintentos (workers/analysisQueue.ts).
    logger.error(`❌ Error análisis legal ${analisisId}:`, err);
    throw err;
  }
}
