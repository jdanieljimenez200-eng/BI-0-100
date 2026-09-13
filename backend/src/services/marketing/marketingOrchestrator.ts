import { AppDataSource } from '../../config/database';
import { AnalisisMarketing } from '../../models/AnalisisMarketing';
import { AnalisisMercado } from '../../models/AnalisisMercado';
import { AnalisisBrief } from '../../models/AnalisisBrief';
import { AnalisisVentas } from '../../models/AnalisisVentas';
import type { PerfilClienteIdeal } from '../ventas/types';
import type { MercadoContexto, VozMarca, BriefContexto, MarketingAnalisisInput, ReporteAdsProcesado } from './types';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { generarEstrategias } from './posicionamientoService';
import { generarCopies } from './copywritingService';
import { generarCalendario, RECORTE_COMPLETO } from './calendarioService';
import { getPlanGate, FREEMIUM_SEMANAS_CALENDARIO } from '../billing/gatingAnalisis';
import { logger } from '../../utils/logger';
import { emitAnalysisUpdate } from '../../events/sse';
import { huboFallbackIA } from '../../utils/seguimientoIA';

const VOCES_VALIDAS: VozMarca[] = ['Profesional', 'Divertido', 'Urgente', 'Emp\u00e1tico'];

function normalizarVoz(voz?: string): VozMarca {
  return VOCES_VALIDAS.includes((voz ?? '') as VozMarca) ? (voz as VozMarca) : 'Profesional';
}

/** Contexto de mercado del análisis previo (mejora fit/copies/calendario). */
async function cargarContextoMercado(
  usuarioId: string,
  productoId: string,
  preferId?: string
): Promise<MercadoContexto | undefined> {
  const repo = AppDataSource.getRepository(AnalisisMercado);
  const previo = preferId
    ? await repo.findOne({
        where: { id: preferId, usuario_id: usuarioId, producto_id: productoId },
      })
    : await repo.findOne({
        where: {
          usuario_id: usuarioId,
          producto_id: productoId,
          estado_analisis: 'completado',
        },
        order: { fecha_creacion: 'DESC' },
      });
  if (!previo || previo.viabilidad_score == null) return undefined;

  const tendencias = previo.tendencias_data as { tendencia?: MercadoContexto['tendencia'] } | null;
  return {
    viabilidad_score: Number(previo.viabilidad_score),
    total_competidores: Number(previo.total_competidores ?? 0),
    precio_mercado_promedio:
      (previo.competencia_data as { precio_mercado_promedio?: number } | null)
        ?.precio_mercado_promedio ??
      Number(previo.precio_usuario ?? 0),
    tendencia: tendencias?.tendencia ?? 'ESTABLE',
    gap_detectado:
      (previo.competencia_data as { gap_detectado?: string | null } | null)?.gap_detectado ?? null,
  };
}

/** Brief de marca vinculado → coherencia de tono/percepción en copies. */
async function cargarBriefContexto(
  usuarioId: string,
  productoId: string,
  briefId?: string
): Promise<BriefContexto | undefined> {
  const repo = AppDataSource.getRepository(AnalisisBrief);
  const brief = briefId
    ? await repo.findOne({ where: { id: briefId, usuario_id: usuarioId, producto_id: productoId } })
    : await repo.findOne({
        where: {
          usuario_id: usuarioId,
          producto_id: productoId,
          estado_analisis: 'completado',
        },
        order: { fecha_creacion: 'DESC' },
      });
  if (!brief || !brief.tono_comunicacion) return undefined;

  return {
    percepcion: (brief.percepcion as unknown as string[]) ?? [],
    emocion: brief.emocion ?? '',
    anti_valores: (brief.anti_valores as unknown as string[]) ?? [],
    tono_comunicacion: brief.tono_comunicacion,
    posicionamiento: brief.posicionamiento ?? '',
    nivel_diferenciacion: brief.nivel_diferenciacion ?? '',
    resultado_cliente: brief.resultado_cliente ?? '',
  };
}

/**
 * ICP de Ventas (fuente única del cliente ideal, ver services/ventas/): se
 * deriva un resumen de texto y se usa como `clienteIdeal` en vez de pedirle
 * al usuario que retipee la misma información en Marketing.
 */
async function cargarContextoVentasICP(
  usuarioId: string,
  productoId: string,
  preferId?: string
): Promise<string | undefined> {
  const repo = AppDataSource.getRepository(AnalisisVentas);
  const previo = preferId
    ? await repo.findOne({ where: { id: preferId, usuario_id: usuarioId, producto_id: productoId } })
    : await repo.findOne({
        where: {
          usuario_id: usuarioId,
          producto_id: productoId,
          estado_analisis: 'completado',
        },
        order: { fecha_creacion: 'DESC' },
      });

  const icp = previo?.perfil_cliente_data as PerfilClienteIdeal | null | undefined;
  if (!icp?.demograficos) return undefined;

  const miedos = icp.psicografia?.miedos_principales?.slice(0, 2).join(', ') || 'sin datos';
  const objeciones = icp.psicografia?.objeciones_tipicas?.slice(0, 2).join('; ') || 'sin datos';
  return (
    `Cliente ideal (de Ventas): ${icp.demograficos.edad_rango}, NSE ${icp.demograficos.nivel_socioeconomico}, ` +
    `${icp.demograficos.ubicacion_tipica}. Le preocupa: ${miedos}. Objeciones frecuentes: ${objeciones}. ` +
    `Forma de hablar: "${icp.lenguaje_tipico || 'sin datos'}".`
  );
}

/**
 * Composición del análisis de Marketing:
 *   posicionamiento (3 estrategias, 1 recomendada) → copies → calendario.
 * Gate freemium: solo la estrategia recomendada + semana 1 con cadencia;
 * los copies no se generan (100% bloqueados).
 */
export async function orquestarMarketing(
  analisisId: string,
  usuarioId: string,
  productoId: string,
  payload: MarketingAnalisisInput
): Promise<void> {
  const repo = AppDataSource.getRepository(AnalisisMarketing);
  const analisis = await repo.findOne({
    where: { id: analisisId },
    relations: ['usuario', 'producto'],
  });

  if (!analisis) {
    throw new Error(`Análisis ${analisisId} no encontrado`);
  }

  try {
    const producto = analisis.producto;
    const nombre = producto?.nombre || 'Producto';
    const categoria = producto?.categoria || 'general';
    const descripcion = producto?.descripcion ?? null;
    const tipoActividad = /servici/i.test(categoria) ? ('servicio' as const) : ('producto' as const);

    const usuario = analisis.usuario;
    const gate = getPlanGate(usuario?.plan, 'marketing');
    const voz = normalizarVoz(payload.vozMarca);
    const presupuesto = payload.presupuestoMensual ?? 3000;

    const ctx = await cargarContextoMercado(usuarioId, productoId, payload.analisisMercadoId);
    const briefCtx = await cargarBriefContexto(usuarioId, productoId, payload.briefAnalisisId);
    // El ICP de Ventas es la fuente canónica del cliente ideal: si existe, gana
    // sobre el texto libre que el usuario haya escrito en este formulario.
    const ventasIcpResumen = await cargarContextoVentasICP(usuarioId, productoId, payload.ventasAnalisisId);
    const clienteIdealEfectivo = ventasIcpResumen ?? payload.clienteIdeal;

    // ── Reporte de Ads / Estadísticas Pasadas ──────────────────────────────────
    const reporteAds = (payload.reporteAds ?? analisis.reporte_ads_data) as ReporteAdsProcesado | undefined;
    if (reporteAds) {
      analisis.reporte_ads_data = reporteAds as never;
    }

    // ── Estrategias de agencia (4 pilares: Seguidores, Reconocimiento, Ventas, Ventas+) ──
    const estrategias = generarEstrategias(
      nombre,
      categoria,
      tipoActividad,
      Number(producto?.precio) || 0,
      presupuesto,
      ctx,
      undefined,
      payload.plataformas?.[0],
      undefined,
      reporteAds,
      payload.canalCierre,
      payload.nivelTraccion,
      payload.margenEstimado
    );
    analisis.estrategias_data = estrategias as never;

    // ── Copies (100% Pro) ────────────────────────────────────────────────────
    if (gate.completo || gate.permite('marketing.copies')) {
      const recomendada = estrategias.find((e) => e.recomendada) ?? estrategias[0];
      analisis.copies_data = (await generarCopies(
        nombre,
        categoria,
        descripcion,
        [recomendada],
        voz,
        tipoActividad,
        clienteIdealEfectivo,
        briefCtx,
        payload.metaCampana,
        payload.plataformas
      )) as never;
    }

    // ── Calendario editorial ─────────────────────────────────────────────────
    const recomendada = estrategias.find((e) => e.recomendada) ?? estrategias[0];
    const calendario = await generarCalendario(
      nombre,
      categoria,
      descripcion,
      recomendada.tipo,
      ctx,
      voz,
      tipoActividad,
      clienteIdealEfectivo,
      briefCtx,
      payload.metaCampana,
      payload.plataformas,
      payload.capacidadContenido,
      producto?.pais,
      undefined,        // puv: no se usa desde el orquestador
      RECORTE_COMPLETO, // el recorte por plan se aplica más abajo, no al generar
      reporteAds
    );

    const calendarioData = calendario as unknown as Record<string, unknown> & {
      semanas?: unknown[];
    };

    // Recorte de generación (no solo visual): freemium ve 1 semana.
    if (!gate.completo && Array.isArray(calendarioData.semanas)) {
      calendarioData.semanas = calendarioData.semanas.slice(0, FREEMIUM_SEMANAS_CALENDARIO);
    }
    if (!gate.completo && gate.permite('marketing.tendencias') === false) {
      calendarioData.tendencias = [];
      calendarioData.recomendacion_plataforma = [];
    }
    // Contrato de persistencia: distingue análisis gated de legacy en redacción.
    calendarioData.secciones_bloqueadas = [...gate.bloqueadas];

    analisis.calendario_data = calendarioData as never;
    analisis.voz_marca = voz;
    analisis.presupuesto_mensual = presupuesto;
    analisis.meta_campana = payload.metaCampana ?? '';

    analisis.resultado_estimado = huboFallbackIA();
    analisis.estado_analisis = 'completado';
    analisis.fecha_completado = new Date();
    await repo.save(analisis);

    emitAnalysisUpdate(usuarioId, {
      tipo: 'marketing',
      estado: 'completado',
      productoId,
      id: analisisId,
    });

    if (analisis.usuario?.email) {
      notificarAnalisisCompleto({
        ownerId: usuarioId,
        modulo: 'Marketing',
        productoNombre: nombre,
      }).catch(swallowWithLog('email:marketing', { analisisId }));
    }
  } catch (error) {
    // Solo se registra y se relanza: la cola marca el error y avisa al usuario
    // cuando ya no quedan reintentos (workers/analysisQueue.ts).
    logger.error('[marketing] Orquestación falló:', error);
    throw error;
  }
}
