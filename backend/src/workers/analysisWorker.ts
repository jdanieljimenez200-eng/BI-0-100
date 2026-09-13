import { UnrecoverableError, type Job } from 'bullmq';
import { AppDataSource } from '../config/database';
import { Producto } from '../models/Producto';
import { orquestarMercado } from '../services/mercado/mercadoOrchestrator';
import { orquestarMarketing } from '../services/marketing/marketingOrchestrator';
import { ejecutarAnalisisFinanzas } from '../services/finanzas/finanzasOrchestrator';
import { ejecutarAnalisisLegal } from '../services/legal/legalOrchestrator';
import { ejecutarAnalisisBrief } from '../services/brief/briefOrchestrator';
import { ejecutarAnalisisVentas } from '../services/ventas/ventasOrchestrator';
import { logger } from '../utils/logger';
import { conSeguimientoIA } from '../utils/seguimientoIA';

/**
 * Sin producto no hay nada que reintentar: se falla de inmediato en vez de gastar
 * los tres intentos.
 */
async function cargarProducto(productoId: string): Promise<Producto> {
  const producto = await AppDataSource.getRepository(Producto).findOneBy({ id: productoId });
  if (!producto) throw new UnrecoverableError('Producto no encontrado');
  return producto;
}

export async function procesarAnalisis(job: Job) {
  // Cada trabajo abre su propio seguimiento de secciones que salieron de plantilla.
  return conSeguimientoIA(() => ejecutarTrabajo(job));
}

async function ejecutarTrabajo(job: Job) {
  const { moduleName, analisisId, usuarioId, productoId, payload } = job.data;
  // Brief, Legal y Finanzas leen el usuario y el producto del input para avisar
  // al terminar (SSE y correo). La ruta los quita del cuerpo antes de encolar, así
  // que se reponen aquí desde el trabajo: sin esto el aviso salía sin destinatario.
  const input = { ...(payload ?? {}), usuarioId, productoId };

  logger.info(`[Worker] Starting analysis job`, {
    jobId: job.id,
    moduleName,
    analisisId,
    usuarioId,
    productoId,
  });

  try {
    switch (moduleName) {
      case 'mercado':
        await orquestarMercado(analisisId, usuarioId, productoId, payload);
        break;

      case 'marketing':
        await orquestarMarketing(analisisId, usuarioId, productoId, payload);
        break;

      case 'finanzas':
        await ejecutarAnalisisFinanzas(analisisId, input, await cargarProducto(productoId));
        break;

      case 'legal':
        await ejecutarAnalisisLegal(analisisId, await cargarProducto(productoId), input);
        break;

      case 'brief':
        await ejecutarAnalisisBrief(analisisId, await cargarProducto(productoId), input);
        break;

      case 'ventas':
        await ejecutarAnalisisVentas(analisisId, usuarioId, await cargarProducto(productoId), payload as Record<string, unknown>);
        break;

      default:
        throw new UnrecoverableError(`Unknown module: ${moduleName}`);
    }

    logger.info(`[Worker] Analysis completed successfully`, {
      jobId: job.id,
      analisisId,
      moduleName,
    });
  } catch (err) {
    logger.error(`[Worker] Analysis failed`, {
      jobId: job.id,
      analisisId,
      moduleName,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err; // BullMQ will handle retries
  }
}