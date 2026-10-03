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
import { CICLOS_VENTA, QUIEN_DECIDE, type VentasAnalisisInput } from './types';
import { construirMetaIaVentas } from './transparenciaVentas';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { emitAnalysisUpdate } from '../../events/sse';
import { contextoIA, huboFallbackIA } from '../../utils/seguimientoIA';
import { logger } from '../../utils/logger';
import { estatusEfectivo } from '../../utils/estatusProyecto';
import { tipoActividadDe } from '../mercado/tipoActividad';
import { resolverPrompt } from '../ia/registroPrompts';
import { leerPerfil } from '../ia/perfilNegocio';

/** El día local de quien pidió el análisis (la ruta lo manda); si falta, el UTC. */
function fechaDelAnalisis(payload: Record<string, unknown>): string {
  const f = payload.fecha_local;
  return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : new Date().toISOString().slice(0, 10);
}

const numero = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;

/**
 * Datos del embudo que trae el trabajo (ya validados por la ruta). Se vuelven
 * a filtrar aquí porque el payload es jsonb de la cola: un trabajo viejo o
 * corrupto no debe meter basura en el prompt.
 */
export function embudoDePayload(payload: Record<string, unknown>): Partial<VentasAnalisisInput> {
  const ciclo = payload.ciclo_venta;
  const decide = payload.quien_decide;
  const objeciones = typeof payload.objeciones_frecuentes === 'string' ? payload.objeciones_frecuentes.trim().slice(0, 400) : '';
  return {
    contactos_mes: numero(payload.contactos_mes, 1_000_000),
    tasa_cierre_pct: numero(payload.tasa_cierre_pct, 100),
    ciclo_venta: (CICLOS_VENTA as readonly unknown[]).includes(ciclo) ? (ciclo as VentasAnalisisInput['ciclo_venta']) : undefined,
    quien_decide: (QUIEN_DECIDE as readonly unknown[]).includes(decide) ? (decide as VentasAnalisisInput['quien_decide']) : undefined,
    objeciones_frecuentes: objeciones || undefined,
  };
}

/** Lo del producto que usa Ventas (el real, o el de un caso de prueba del panel). */
export interface ProductoVentas {
  nombre: string;
  pais?: string | null;
  categoria?: string | null;
  precio?: number | string | null;
  descripcion?: string | null;
  video_url?: string | null;
  estatus_proyecto?: string | null;
  clientes_mes?: number | null;
  tipo_actividad?: string | null;
  puv?: string | null;
  cliente_ideal?: string | null;
  perfil_negocio?: unknown;
}

/** Input completo: lo del formulario más lo que ya sabe el producto. */
export function inputDeVentas(producto: ProductoVentas, payload: Record<string, unknown>): VentasAnalisisInput {
  return {
    tipo_venta: (payload.tipo_venta as VentasAnalisisInput['tipo_venta']) ?? 'B2C_directo',
    canal_principal: (payload.canal_principal as VentasAnalisisInput['canal_principal']) ?? 'directo',
    ticket_promedio: Number(payload.ticket_promedio) || Number(producto.precio) || 0,
    tamano_equipo: (payload.tamano_equipo as VentasAnalisisInput['tamano_equipo']) ?? 'solo_tu',
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
    // Lo que el dueño ya dijo en el alta: antes no llegaba a Ventas.
    estatus: estatusEfectivo(producto.estatus_proyecto, producto.clientes_mes),
    tipo_actividad: tipoActividadDe(producto.tipo_actividad, producto.categoria ?? ''),
    puv: producto.puv?.trim() || undefined,
    cliente_ideal: typeof producto.cliente_ideal === 'string' ? producto.cliente_ideal.trim() || undefined : undefined,
    perfil: leerPerfil(producto.perfil_negocio),
    ...embudoDePayload(payload),
  };
}

/**
 * Tips, historia y perfil de cliente con su transparencia, sin tocar la base.
 * Lo usan el worker y el «Probar» del panel, con las versiones ancladas.
 */
export async function generarResultadoVentas(p: { input: VentasAnalisisInput; conIcp: boolean; fechaISO: string }) {
  // Secciones que el admin ocultó en la versión del modo anclada a este trabajo.
  const modo = await resolverPrompt('ventas.modo', contextoIA()?.versionesPrompt?.['ventas.modo']);
  const ocultas = new Set(modo.secciones_ocultas);
  const conHistoria = !ocultas.has('ventas.historia');

  const [tips, historia, perfilCliente] = await Promise.all([
    generarTips(p.input),
    conHistoria ? generarHistoriaDiaria(p.input, p.fechaISO) : Promise.resolve(null),
    p.conIcp ? generarPerfilCliente(p.input) : Promise.resolve(null),
  ]);

  const meta_ia = construirMetaIaVentas({
    input: p.input,
    tips,
    modo,
    ocultas,
    seccionesIA: [{ es_mock: tips.es_mock }],
    conHistoria,
  });
  return { tips: tips.tips, historia, perfil_cliente: perfilCliente, meta_ia };
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

    const r = await generarResultadoVentas({
      input: inputDeVentas(producto, payload),
      conIcp: gate.tiene_icp,
      fechaISO: fechaDelAnalisis(payload),
    });

    analisis.tips_data = r.tips;
    analisis.historia_data = r.historia;
    // Deprecado: el análisis de riesgo de negocio ahora vive en Finanzas
    // (services/finanzas/riesgosService.ts) — es contenido financiero, no una
    // táctica de venta. Se deja en null en análisis nuevos; los análisis viejos
    // conservan su valor y el frontend sigue mostrándolos de forma read-only.
    analisis.porque_fallan_data = null;
    analisis.perfil_cliente_data = r.perfil_cliente;
    // script_scorer y competitor_intel se generan on-demand vía endpoints /guion y /competidores
    analisis.evaluaciones_guion_data = [];
    analisis.competidores_data = { competidores: [], comparativa: null };
    analisis.meta_ia = r.meta_ia;

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
