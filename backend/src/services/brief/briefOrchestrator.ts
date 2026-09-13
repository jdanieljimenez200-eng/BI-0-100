import { AppDataSource } from '../../config/database';
import { AnalisisBrief } from '../../models/AnalisisBrief';
import { Producto } from '../../models/Producto';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { generarBrief } from './briefService';
import { BriefAnalisisInput } from './types';
import { emitAnalysisUpdate } from '../../events/sse';
import { huboFallbackIA } from '../../utils/seguimientoIA';
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
      resultado_estimado: huboFallbackIA(),
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
    // Solo se registra y se relanza: la cola marca el error y avisa al usuario
    // cuando ya no quedan reintentos (workers/analysisQueue.ts).
    logger.error(`❌ Error análisis brief ${analisisId}:`, err);
    throw err;
  }
}
