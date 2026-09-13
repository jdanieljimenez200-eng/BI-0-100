import { AppDataSource } from '../../config/database';
import { AnalisisMercado } from '../../models/AnalisisMercado';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { getPlanGate } from '../billing/gatingAnalisis';
import {
  obtenerCompetencia,
} from './competenciaService';
import { obtenerTendencias } from './tendenciasService';
import { calcularDensidadZona } from './densidadService';
import { estimarMargen, calcularViabilidad } from './viabilidadService';
import { generarDafo } from './dafoService';
import { calcularTam } from './tamService';
import { calcularPayback, generarReporteBi } from './reporteBiService';
import { calcularEstudioArea } from '../zona/estudioAreaService';
import type { EstudioAreaInput } from '../zona/types';
import type {
  MercadoAnalisisInput,
  ProductoContextoMercado,
} from './types';
import { logger } from '../../utils/logger';
import { emitAnalysisUpdate } from '../../events/sse';
import { huboFallbackIA } from '../../utils/seguimientoIA';

/**
 * Composición del análisis de Mercado.
 *
 * Pipeline: competencia → tendencias → densidad → margen/viabilidad →
 * DAFO/TAM/payback → reporte BI. Con gate freemium activo, las secciones
 * bloqueadas NO se generan (ahorro de IA) ni se persisten; el gancho visible
 * es el estudio de viabilidad.
 */
export async function orquestarMercado(
  analisisId: string,
  usuarioId: string,
  productoId: string,
  payload: MercadoAnalisisInput
): Promise<void> {
  const repo = AppDataSource.getRepository(AnalisisMercado);
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
    const pais = payload.pais || producto?.pais || 'MX';
    const precioUsuario = Number(producto?.precio) > 0 ? Number(producto!.precio) : undefined;
    const tipoActividad = /servici/i.test(categoria) ? ('Servicio' as const) : ('Producto' as const);

    const usuario = analisis.usuario;
    const gate = getPlanGate(usuario?.plan, 'mercado');

    // ── Insumos de viabilidad (siempre necesarios para puntuar) ────────────────
    const competencia = await obtenerCompetencia(
      nombre,
      payload.scope,
      precioUsuario ?? 0,
      pais,
      tipoActividad,
      categoria,
      payload.estado ?? undefined
    );
    const tendencias = await obtenerTendencias(nombre, payload.scope, pais, payload.estado ?? null);
    const densidad = calcularDensidadZona(competencia, {
      radio_km: payload.radioKm,
      scope: payload.scope,
    });
    const margenPct = estimarMargen(categoria, precioUsuario ?? 0, competencia.precio_mercado_promedio);
    const viabilidad = calcularViabilidad(tendencias, competencia, margenPct, precioUsuario, densidad);

    // ── Gancho freemium: viabilidad siempre persistida ────────────────────────
    analisis.viabilidad_score = viabilidad.score;
    analisis.viabilidad_estado = viabilidad.estado;

    // Resultado completo (score/estado/factores/positivos/negativos/confianza)
    analisis.viabilidad_factores = viabilidad as never;
    analisis.confianza_analisis = viabilidad.confianza;
    analisis.precio_usuario = precioUsuario ?? 0;

    const puede = (seccion: Parameters<typeof gate.permite>[0]) => gate.completo || gate.permite(seccion);

    // ── Alertas accionables derivadas del score ───────────────────────────────
    const alertas: { nivel: 'verde' | 'amarillo' | 'rojo'; tipo: string; mensaje: string }[] = [];
    for (const f of viabilidad.factores_negativos.slice(0, 2)) {
      alertas.push({ nivel: 'amarillo', tipo: 'viabilidad', mensaje: f });
    }
    if (densidad.es_evaluable && (densidad.interpretacion === 'saturada' || densidad.interpretacion === 'disputada')) {
      alertas.push({ nivel: 'rojo', tipo: 'densidad', mensaje: densidad.mensaje });
    }
    analisis.alertas = alertas as never;

    // ── Estudio del área: rentar vs comprar (usa lo declarado por el usuario) ─
    if (payload.tipo_local) {
      try {
        const estudio = await calcularEstudioArea({
          pais,
          estado: payload.estado ?? undefined,
          ciudad: payload.ciudad,
          zona: payload.zona,
          tipo_local: payload.tipo_local,
          m2_declarados: payload.m2_declarados,
          precio_m2_mes_declarado: payload.precio_m2_mes_declarado,
          personal: payload.personal,
          renta_declarada: payload.renta_declarada,
          unidades_mes: payload.clientes_mes,
          precio_venta_m2_declarado: payload.precio_venta_m2_declarado,
        } as EstudioAreaInput);
        analisis.estudio_area_data = estudio as never;
        analisis.renta_zona_data = (estudio as { renta?: unknown }).renta as never;
      } catch (err) {
        logger.warn('[mercado] Estudio de área no disponible:', err instanceof Error ? err.message : err);
      }
    }

    // ── Secciones gated ──────────────────────────────────────────────────────
    if (puede('mercado.competencia')) {
      analisis.competencia_data = competencia as never;
      analisis.total_competidores = competencia.total_competidores;
      analisis.datos_oficiales_data = (competencia.censo_oficial ?? null) as never;
    }
    if (puede('mercado.tendencias')) {
      analisis.tendencias_data = tendencias as never;
      analisis.volumen_busquedas_mensual = tendencias.volumen_busquedas_mensual;
      analisis.tendencia_porcentaje = tendencias.crecimiento_porcentaje;
    }
    if (payload.tipo_local && puede('mercado.estacionalidad')) {
      analisis.densidad_data = densidad as never;
    }
    if (puede('mercado.dafo')) {
      const dafo = await generarDafo(
        { nombre, categoria, descripcion: descripcion ?? undefined },
        competencia,
        tendencias,
        viabilidad,
        {
          precio_usuario: precioUsuario,
          nse_target: payload.nse_target,
          forma_cobro: payload.forma_cobro,
          scope: payload.scope,
          estado: payload.estado,
          pais,
          competidores_conocidos: payload.competidores_conocidos,
        }
      );
      analisis.dafo_data = dafo as never;
    }
    if (puede('mercado.tam_sam_som')) {
      // Frecuencia anual según modelo de cobro: una suscripción mensual
      // multiplica ×12 el mercado anual vs compra única.
      const frecuenciaAnual =
        payload.forma_cobro === 'Suscripción'
          ? Math.max(1, Math.round(12 / Math.max(1, payload.recurrencia_meses ?? 12)))
          : 1;
      const tam = calcularTam({
        pais,
        region: payload.estado ?? null,
        scope: payload.scope === 'nacional' ? 'nacional' : 'local',
        nseTarget: payload.nse_target ?? null,
        precioUnitario: precioUsuario ?? 0,
        categoria,
        margenPct,
        frecuenciaCompraAnual: frecuenciaAnual,
      });
      analisis.tam_data = tam as never;

      // Payback usa TAM + contexto financiero declarado
      const rentaEstimada =
        payload.renta_declarada ??
        (payload.m2_declarados && payload.precio_m2_mes_declarado
          ? payload.m2_declarados * payload.precio_m2_mes_declarado
          : 0);
      const ctx: ProductoContextoMercado = {
        estatus_proyecto: payload.clientes_mes ? 'en_operacion' : 'planificacion',
        tipo_actividad: tipoActividad,
        puv: '',
        inversion_inicial: rentaEstimada * 3 || 50000,
        costos_fijos: rentaEstimada || 8000,
        precio_venta: precioUsuario ?? 0,
      };
      analisis.payback_data = calcularPayback(
        ctx,
        payload,
        tam.tam_escenarios.realista.mercado_mensual,
        tam.tam_escenarios.optimista.mercado_mensual,
        margenPct
      ) as never;
    }
    if (puede('mercado.reporte_bi')) {
      const rentaCtx: ProductoContextoMercado = {
        estatus_proyecto: payload.clientes_mes ? 'en_operacion' : 'planificacion',
        tipo_actividad: tipoActividad,
        puv: '',
        inversion_inicial: 50000,
        costos_fijos: payload.renta_declarada ?? 8000,
        precio_venta: precioUsuario ?? 0,
      };
      analisis.reporte_bi_data = (await generarReporteBi(
        payload,
        rentaCtx,
        { nombre, categoria },
        tendencias,
        competencia,
        viabilidad
      )) as never;
    }

    analisis.resultado_estimado = huboFallbackIA();
    analisis.estado_analisis = 'completado';
    analisis.fecha_completado = new Date();
    await repo.save(analisis);

    emitAnalysisUpdate(usuarioId, {
      tipo: 'mercado',
      estado: 'completado',
      productoId,
      id: analisisId,
    });

    if (analisis.usuario?.email) {
      notificarAnalisisCompleto({
        ownerId: usuarioId,
        modulo: 'Mercado',
        productoNombre: nombre,
      }).catch(swallowWithLog('email:mercado', { analisisId }));
    }
  } catch (error) {
    // Solo se registra y se relanza: la cola marca el error y avisa al usuario
    // cuando ya no quedan reintentos (workers/analysisQueue.ts).
    logger.error('[mercado] Orquestación falló:', error);
    throw error;
  }
}
