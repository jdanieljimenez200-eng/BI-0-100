import type { Job } from 'bullmq';
import { AppDataSource } from '../config/database';
import { Producto } from '../models/Producto';
import { orquestarMercado } from '../services/mercado/mercadoOrchestrator';
import { orquestarMarketing } from '../services/marketing/marketingOrchestrator';
import { ejecutarAnalisisFinanzas } from '../services/finanzas/finanzasOrchestrator';
import { ejecutarAnalisisLegal } from '../services/legal/legalOrchestrator';
import { ejecutarAnalisisBrief } from '../services/brief/briefOrchestrator';
import { ejecutarAnalisisVentas } from '../services/ventas/ventasOrchestrator';
import { logger } from '../utils/logger';

export async function procesarAnalisis(job: Job) {
  const { moduleName, analisisId, usuarioId, productoId, payload } = job.data;

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

      case 'finanzas': {
        // Fetch producto para finanzas
        const producto = await AppDataSource.getRepository(Producto).findOneBy({
          id: productoId,
        });
        if (!producto) throw new Error('Producto no encontrado');
        await ejecutarAnalisisFinanzas(analisisId, payload, producto);
        break;
      }

      case 'legal': {
        const producto = await AppDataSource.getRepository(Producto).findOneBy({ id: productoId });
        if (!producto) throw new Error('Producto no encontrado');
        await ejecutarAnalisisLegal(analisisId, producto, payload);
        break;
      }

      case 'brief': {
        const producto = await AppDataSource.getRepository(Producto).findOneBy({ id: productoId });
        if (!producto) throw new Error('Producto no encontrado');
        await ejecutarAnalisisBrief(analisisId, producto, payload);
        break;
      }

      case 'ventas': {
        const producto = await AppDataSource.getRepository(Producto).findOneBy({ id: productoId });
        if (!producto) throw new Error('Producto no encontrado');
        await ejecutarAnalisisVentas(analisisId, usuarioId, producto, payload as Record<string, unknown>);
        break;
      }

      default:
        throw new Error(`Unknown module: ${moduleName}`);
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