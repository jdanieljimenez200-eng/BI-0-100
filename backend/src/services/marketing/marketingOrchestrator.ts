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
import { contextoIA, huboFallbackIA } from '../../utils/seguimientoIA';
import { getMoneda } from '../../utils/latam';
import { tipoActividadDe } from '../mercado/tipoActividad';
import { resolverPrompt } from '../ia/registroPrompts';
import { leerPerfil } from '../ia/perfilNegocio';
import { construirMetaIaMarketing } from './transparenciaMarketing';

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

/** Lo del producto que usa Marketing (el real, o el de un caso de prueba del panel). */
export interface ProductoMarketing {
  nombre: string;
  categoria?: string | null;
  descripcion?: string | null;
  precio?: number | string | null;
  pais?: string | null;
  tipo_actividad?: string | null;
  puv?: string | null;
  perfil_negocio?: unknown;
}

/**
 * Estrategias, copies y calendario con su transparencia, sin tocar la base. Lo
 * usan el worker y el «Probar» del panel, con las versiones ancladas.
 */
export async function generarResultadoMarketing(p: {
  producto: ProductoMarketing;
  input: MarketingAnalisisInput;
  /** El plan incluye copies. */
  conCopies: boolean;
  ctx?: MercadoContexto;
  briefCtx?: BriefContexto;
  /** Resumen del ICP de Ventas: fuente canónica del cliente ideal si existe. */
  icpVentas?: string;
}) {
  const { producto, input } = p;
  const nombre = producto.nombre || 'Producto';
  const categoria = producto.categoria || 'general';
  const descripcion = producto.descripcion ?? null;
  // Lo declarado en el alta: antes se adivinaba por la categoría.
  const tipoActividad = tipoActividadDe(producto.tipo_actividad, categoria) === 'Servicio' ? ('servicio' as const) : ('producto' as const);
  const pais = producto.pais || 'MX';
  const puv = producto.puv?.trim() || undefined;
  const perfil = leerPerfil(producto.perfil_negocio);
  const voz = normalizarVoz(input.vozMarca);
  const presupuesto = input.presupuestoMensual ?? 3000;
  const clienteIdealEfectivo = p.icpVentas ?? input.clienteIdeal;

  // Secciones que el admin ocultó en la versión del modo anclada a este trabajo.
  const modo = await resolverPrompt('marketing.modo', contextoIA()?.versionesPrompt?.['marketing.modo']);
  const ocultas = new Set(modo.secciones_ocultas);

  // ── Estrategias de agencia (4 pilares: Seguidores, Reconocimiento, Ventas, Ventas+) ──
  const estrategias = generarEstrategias(
    nombre,
    categoria,
    tipoActividad,
    Number(producto.precio) || 0,
    presupuesto,
    p.ctx,
    puv,
    input.plataformas?.[0],
    undefined,
    input.reporteAds,
    input.canalCierre,
    input.nivelTraccion,
    input.margenEstimado,
    pais
  );
  const recomendada = estrategias.find((e) => e.recomendada) ?? estrategias[0];

  // ── Copies (de pago; el admin también los puede quitar) ───────────────────
  const copies =
    p.conCopies && !ocultas.has('marketing.copies')
      ? await generarCopies(nombre, categoria, descripcion, [recomendada], voz, tipoActividad, clienteIdealEfectivo, p.briefCtx, input.metaCampana, input.plataformas, pais, puv)
      : null;

  // ── Calendario editorial ─────────────────────────────────────────────────
  const calendario = await generarCalendario(
    nombre,
    categoria,
    descripcion,
    recomendada.tipo,
    p.ctx,
    voz,
    tipoActividad,
    clienteIdealEfectivo,
    p.briefCtx,
    input.metaCampana,
    input.plataformas,
    input.capacidadContenido,
    pais,
    puv,
    RECORTE_COMPLETO, // el recorte por plan se aplica después, no al generar
    input.reporteAds,
    { ya_probado: input.yaProbado, activos: input.activos, zona_clientes: input.zonaClientes, perfil, moneda: getMoneda(pais) }
  );

  const meta_ia = construirMetaIaMarketing({
    datos: {
      input,
      conMercado: Boolean(p.ctx),
      clienteIdeal: p.icpVentas ? 'ventas' : input.clienteIdeal?.trim() ? 'formulario' : null,
      conBrief: Boolean(p.briefCtx),
      calendarioDePlantilla: calendario.es_mock,
    },
    calendario,
    modo,
    ocultas,
    seccionesIA: [{ es_mock: calendario.es_mock }, ...(copies ?? []).map((c) => ({ es_mock: c.es_mock }))],
    contexto: {
      pais,
      moneda: getMoneda(pais),
      tipo_actividad: tipoActividad,
      con_puv: Boolean(puv),
      con_mercado: Boolean(p.ctx),
      con_brief: Boolean(p.briefCtx),
      cliente_ideal: p.icpVentas ? 'ventas' : input.clienteIdeal?.trim() ? 'formulario' : null,
      con_reporte_ads: Boolean(input.reporteAds),
    },
  });

  return { estrategias, copies, calendario: calendario.calendario, meta_ia, voz, presupuesto };
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
    const usuario = analisis.usuario;
    const gate = getPlanGate(usuario?.plan, 'marketing');

    const ctx = await cargarContextoMercado(usuarioId, productoId, payload.analisisMercadoId);
    const briefCtx = await cargarBriefContexto(usuarioId, productoId, payload.briefAnalisisId);
    // El ICP de Ventas es la fuente canónica del cliente ideal: si existe, gana
    // sobre el texto libre que el usuario haya escrito en este formulario.
    const icpVentas = await cargarContextoVentasICP(usuarioId, productoId, payload.ventasAnalisisId);

    // ── Reporte de Ads / Estadísticas Pasadas ──────────────────────────────────
    const reporteAds = (payload.reporteAds ?? analisis.reporte_ads_data) as ReporteAdsProcesado | undefined;
    if (reporteAds) {
      analisis.reporte_ads_data = reporteAds as never;
    }

    const r = await generarResultadoMarketing({
      producto: { ...(producto ?? {}), nombre },
      input: { ...payload, reporteAds },
      conCopies: gate.completo || gate.permite('marketing.copies'),
      ctx,
      briefCtx,
      icpVentas,
    });

    analisis.estrategias_data = r.estrategias as never;
    if (r.copies) analisis.copies_data = r.copies as never;

    const calendarioData = r.calendario as unknown as Record<string, unknown> & {
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
    analisis.meta_ia = r.meta_ia;
    analisis.voz_marca = r.voz;
    // `presupuesto_mensual` es `integer`: un presupuesto con centavos (8500.50,
    // que el formulario deja escribir) reventaba este guardado con «invalid
    // input syntax for type integer» y el análisis acababa en error después de
    // haber pagado todas las llamadas a la IA.
    analisis.presupuesto_mensual = Math.round(r.presupuesto);
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
