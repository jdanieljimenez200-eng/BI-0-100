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
import { conSeguimientoIA, huboFallbackIA, type VersionesPrompt } from '../utils/seguimientoIA';
import { clavesDeModulo } from '../services/ia/prompts';
import { versionesAAnclar } from '../services/ia/registroPrompts';
import { reembolsarCreditos } from '../services/billing/creditosIA';
import { esErrorTransitorio } from '../utils/erroresTransitorios';

/**
 * Sin producto no hay nada que reintentar: se falla de inmediato en vez de gastar
 * los tres intentos.
 */
async function cargarProducto(productoId: string): Promise<Producto> {
  const producto = await AppDataSource.getRepository(Producto).findOneBy({ id: productoId });
  if (!producto) throw new UnrecoverableError('Producto no encontrado');
  return producto;
}

/**
 * Fija las versiones de prompt de este trabajo en su primer intento y las
 * guarda en el propio trabajo: si el admin publica una versión nueva a mitad
 * del análisis, o el trabajo se reintenta, se sigue usando la misma.
 *
 * Nunca hace fallar el análisis: sin ancla, cada llamada usa la versión
 * publicada en ese momento, que es lo que pasaba antes de existir el registro.
 */
export async function anclarVersionesPrompt(job: Job): Promise<VersionesPrompt | undefined> {
  const { moduleName, productoId, versionesPrompt } = job.data ?? {};
  if (versionesPrompt && typeof versionesPrompt === 'object') return versionesPrompt as VersionesPrompt;
  try {
    let pais: string | null = null;
    if (moduleName === 'legal' && productoId) {
      const producto = await AppDataSource.getRepository(Producto).findOne({
        where: { id: productoId },
        select: ['id', 'pais'],
      });
      pais = producto?.pais ?? null;
    }
    const claves = clavesDeModulo(moduleName, pais);
    if (!claves.length) return undefined;
    const versiones = await versionesAAnclar(claves);
    if (typeof job.updateData === 'function') {
      await job.updateData({ ...job.data, versionesPrompt: versiones });
    }
    return versiones;
  } catch (err) {
    logger.warn('[Worker] No se pudieron anclar las versiones de prompt', {
      jobId: job.id,
      moduleName,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

export async function procesarAnalisis(job: Job) {
  // Cada trabajo abre su propio seguimiento de secciones que salieron de plantilla.
  const { moduleName, analisisId, usuarioId } = job.data ?? {};
  const versionesPrompt = await anclarVersionesPrompt(job);
  return conSeguimientoIA(async () => {
    await ejecutarTrabajo(job);
    // Si alguna sección salió de plantilla, el cliente no paga ese análisis.
    if (huboFallbackIA()) await reembolsarCreditos({ referenciaId: analisisId });
  }, { usuarioId, modulo: moduleName, analisisId, versionesPrompt });
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
    const transitorio = !(err instanceof UnrecoverableError) && esErrorTransitorio(err);
    logger.error(`[Worker] Analysis failed`, {
      jobId: job.id,
      analisisId,
      moduleName,
      transitorio,
      error: err instanceof Error ? err.message : String(err),
    });
    // Solo se reintenta lo transitorio (BD, red, proveedor saturado). Un error de
    // datos o de código fallaría igual en cada intento y cada intento repite las
    // llamadas de IA ya hechas: hasta ×3 el coste para acabar en error de todos modos.
    if (err instanceof UnrecoverableError || transitorio) throw err;
    throw new UnrecoverableError(err instanceof Error ? err.message : String(err));
  }
}