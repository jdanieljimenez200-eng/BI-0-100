import { AppDataSource } from '../../config/database';
import { AnalisisVentas } from '../../models/AnalisisVentas';
import { Producto } from '../../models/Producto';
import { Usuario } from '../../models/Usuario';
import { getVentasGate } from '../billing/gatingAnalisis';
import {
  generarHistoriaDiaria,
  generarTips,
  generarPerfilCliente,
} from './ventasService';
import type { VentasAnalisisInput } from './types';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { emitAnalysisUpdate } from '../../events/sse';
import { huboFallbackIA } from '../../utils/seguimientoIA';
import { logger } from '../../utils/logger';

/** El día local de quien pidió el análisis (la ruta lo manda); si falta, el UTC. */
function fechaDelAnalisis(payload: Record<string, unknown>): string {
  const f = payload.fecha_local;
  return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : new Date().toISOString().slice(0, 10);
}

/**
 * Consume un job de analysis-queue (moduleName='ventas') y llena la fila.
 *
 * Gate por plan (getVentasGate):
 *   - tips + historia → siempre (gancho freemium)
 *   - perfil_cliente → pro y superior (ICP)
 *   - script_scorer  → pro+ y superior (on-demand vía endpoint POST /ventas/:id/guion)
 *   - competitor_intel → pro+ y superior (on-demand vía endpoint POST /ventas/:id/competidores)
 */
export async function ejecutarAnalisisVentas(
  analisisId: string,
  usuarioId: string,
  producto: Producto,
  payload: Record<string, unknown>
): Promise<void> {
  const repo = AppDataSource.getRepository(AnalisisVentas);
  const analisis = await repo.findOneBy({ id: analisisId });
  if (!analisis) throw new Error('Análisis de ventas no encontrado durante worker job');

  try {
    const usuario = await AppDataSource.getRepository(Usuario).findOneBy({ id: usuarioId });
    const plan = usuario?.plan ?? 'freemium';
    const gate = getVentasGate(plan);

    const input: VentasAnalisisInput = {
      tipo_venta:
        (payload.tipo_venta as VentasAnalisisInput['tipo_venta']) ?? 'B2C_directo',
      canal_principal:
        (payload.canal_principal as VentasAnalisisInput['canal_principal']) ?? 'directo',
      ticket_promedio: Number(payload.ticket_promedio) || Number(producto.precio) || 0,
      tamano_equipo:
        (payload.tamano_equipo as VentasAnalisisInput['tamano_equipo']) ?? 'solo_tu',
      objetivo_ventas: typeof payload.objetivo_ventas === 'string' ? payload.objetivo_ventas : undefined,
      // Contexto del producto derivado de la ENTIDAD, no del payload: el job
      // puede ejecutarse minutos después de encolarse y así nunca trabaja con
      // una copia obsoleta ni depende de que la ruta lo reenvíe.
      pais: producto.pais || 'MX',
      nombre_producto: producto.nombre,
      categoria: producto.categoria?.trim() || undefined,
      precio: Number(producto.precio) || undefined,
      descripcion: producto.descripcion?.trim().slice(0, 600) || undefined,
      tiene_video: Boolean(producto.video_url),
    };

    const fechaISO = fechaDelAnalisis(payload);

    // Tips e historia son el gancho freemium: siempre se generan.
    // Perfil_cliente solo si el gate lo permite.
    const [tips, historia, perfilCliente] = await Promise.all([
      generarTips(input),
      generarHistoriaDiaria(input, fechaISO),
      gate.tiene_icp ? generarPerfilCliente(input) : Promise.resolve(null),
    ]);

    analisis.tips_data = tips;
    analisis.historia_data = historia;
    // Deprecado: el análisis de riesgo de negocio ahora vive en Finanzas
    // (services/finanzas/riesgosService.ts) — es contenido financiero, no una
    // táctica de venta. Se deja en null en análisis nuevos; los análisis viejos
    // conservan su valor y el frontend sigue mostrándolos de forma read-only.
    analisis.porque_fallan_data = null;
    analisis.perfil_cliente_data = perfilCliente;
    // script_scorer y competitor_intel se generan on-demand vía endpoints /guion y /competidores
    analisis.evaluaciones_guion_data = [];
    analisis.competidores_data = { competidores: [], comparativa: null };

    // Persistir el gate con el que se generó: distingue análisis recortado
    // de uno completo aunque el plan cambie después.
    analisis.secciones_bloqueadas = [...gate.bloqueadas];
    analisis.resultado_estimado = huboFallbackIA();
    analisis.estado_analisis = 'completado';
    analisis.fecha_completado = new Date();
    await repo.save(analisis);

    emitAnalysisUpdate(usuarioId, {
      tipo: 'ventas',
      estado: 'completado',
      productoId: producto.id,
      id: analisis.id,
    });

    notificarAnalisisCompleto({
      ownerId: usuarioId,
      productoNombre: producto.nombre,
      productoId: producto.id,
      analisisId: analisis.id,
      modulo: 'ventas',
    }).catch(swallowWithLog('email:analisis_completo', { analisisId: analisis.id, modulo: 'ventas' }));
  } catch (err) {
    // Solo se registra y se relanza: la cola marca el error y avisa al usuario
    // cuando ya no quedan reintentos (workers/analysisQueue.ts).
    logger.error(`[ventas] Error análisis ${analisisId}:`, err);
    throw err;
  }
}
