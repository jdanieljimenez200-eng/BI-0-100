import { AppDataSource } from '../../config/database';
import { AnalisisBrief } from '../../models/AnalisisBrief';
import { Producto } from '../../models/Producto';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { generarBrief } from './briefService';
import { BriefAnalisisInput } from './types';
import { emitAnalysisUpdate } from '../../events/sse';
import { logger } from '../../utils/logger';

// ─── Ejecutar análisis completo ──────────────────────────────────────────────

export async function ejecutarAnalisisBrief(
  analisisId: string,
  producto: Producto,
  input: BriefAnalisisInput
): Promise<void> {
  const repo = AppDataSource.getRepository(AnalisisBrief);

  try {
    const resultado = await generarBrief(producto, input);

    await repo.update(analisisId, {
      resultado_data: resultado as unknown as object,
      estado_analisis: 'completado',
      fecha_completado: new Date(),
    });

     logger.info(`✅ Análisis brief ${analisisId} completado`);

    // Push SSE: sin esto el frontend solo se enteraba por polling.
    emitAnalysisUpdate(input.usuarioId, {
      tipo: 'brief',
      estado: 'completado',
      productoId: input.productoId,
      id: analisisId,
    });

    // Notificación email (fire-and-forget) — al dueño y al trabajador que lo disparó
    notificarAnalisisCompleto({
      ownerId: input.usuarioId,
      trabajadorId: input.trabajadorId,
      productoNombre: producto.nombre,
      productoId: input.productoId,
      analisisId,
      modulo: 'brief',
    }).catch(swallowWithLog('email:analisis_completo', { analisisId, modulo: 'brief' }));
  } catch (err) {
    logger.error(`❌ Error análisis brief ${analisisId}:`, err);
    const detalle = err instanceof Error ? err.message : 'Error desconocido';
    await repo.update(analisisId, {
      estado_analisis: 'error',
      error_mensaje: detalle,
    });
    emitAnalysisUpdate(input.usuarioId, {
      tipo: 'brief',
      estado: 'error',
      productoId: input.productoId,
      id: analisisId,
      errorMessage: detalle,
    });
  }
}
