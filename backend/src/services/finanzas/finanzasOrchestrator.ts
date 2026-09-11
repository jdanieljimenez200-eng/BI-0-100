import { AppDataSource } from '../../config/database';
import { AnalisisFinanzas } from '../../models/AnalisisFinanzas';
import { Producto } from '../../models/Producto';
import { FinanzasInput } from './types';
import { generarProyeccion } from './proyeccionService';
import { calcularBreakeven } from './breakevenService';
import { generarResumen } from './resumenService';
import { calcularSensibilidad } from './sensibilidadService';
import { generarRiesgosNegocio } from './riesgosService';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { emitAnalysisUpdate } from '../../events/sse';
import { logger } from '../../utils/logger';

export async function ejecutarAnalisisFinanzas(
  analisisId: string,
  input: FinanzasInput,
  producto: Producto,
): Promise<void> {
  const repo = AppDataSource.getRepository(AnalisisFinanzas);
  const analisis = await repo.findOneBy({ id: analisisId });
  if (!analisis) throw new Error('Análisis no encontrado durante worker job');

  try {
    // Stage A: proyección 12 meses (síncrono, rápido)
    const proyeccion = generarProyeccion(input);

    // Stage B: breakeven (síncrono, usa datos de Stage A) → resumen
    const breakeven = calcularBreakeven(input, proyeccion.meses);
    const resumenFinal = generarResumen(input, proyeccion, breakeven);
    const sensibilidad = calcularSensibilidad(input);

    // Riesgos financieros del negocio, con base en los números ya calculados
    // arriba — no bloquea el análisis si el LLM falla (fallback determinista).
    const riesgos = await generarRiesgosNegocio({
      nombre_producto: producto.nombre,
      categoria: producto.categoria,
      pais: producto.pais,
      precio_venta: input.precio_venta,
      costo_variable_unitario: input.costo_variable_unitario,
      costos_fijos_mensuales: input.costos_fijos_mensuales,
      margen_neto_promedio: proyeccion.totales.margen_neto_promedio,
      viabilidad: resumenFinal.viabilidad,
      meses_para_recuperar_inversion: breakeven.meses_para_recuperar_inversion,
    });

    analisis.proyeccion_data = proyeccion;
    analisis.breakeven_data = breakeven;
    analisis.resumen_data = resumenFinal;
    analisis.sensibilidad_data = sensibilidad;
    analisis.riesgos_data = riesgos;
    analisis.inputs_data = {
      precio_venta: input.precio_venta,
      costo_variable_unitario: input.costo_variable_unitario,
      costos_fijos_mensuales: input.costos_fijos_mensuales,
      unidades_mes_inicial: input.unidades_mes_inicial,
      tasa_crecimiento_mensual: input.tasa_crecimiento_mensual,
    };
    analisis.estado_analisis = 'completado';
    analisis.fecha_completado = new Date();
    await repo.save(analisis);

    // Push SSE: sin esto el frontend solo se enteraba por polling.
    emitAnalysisUpdate(input.usuarioId, {
      tipo: 'finanzas',
      estado: 'completado',
      productoId: input.productoId,
      id: analisis.id,
    });

    // Notificación email (fire-and-forget) — al dueño y al trabajador que lo disparó
    notificarAnalisisCompleto({
      ownerId: input.usuarioId,
      trabajadorId: input.trabajadorId,
      productoNombre: producto.nombre,
      productoId: input.productoId,
      analisisId: analisis.id,
      modulo: 'finanzas',
    }).catch(swallowWithLog('email:analisis_completo', { analisisId: analisis.id, modulo: 'finanzas' }));
  } catch (err) {
    logger.error(`❌ Error análisis finanzas ${analisisId}:`, err);
    const detalle = err instanceof Error ? err.message : 'Error desconocido';
    analisis.estado_analisis = 'error';
    analisis.error_mensaje = detalle;
    await repo.save(analisis);
    emitAnalysisUpdate(input.usuarioId, {
      tipo: 'finanzas',
      estado: 'error',
      productoId: input.productoId,
      id: analisis.id,
      errorMessage: detalle,
    });
  }
}

