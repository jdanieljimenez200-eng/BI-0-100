import { AppDataSource } from '../../config/database';
import { AnalisisFinanzas, type FinanzasInputsSnapshot } from '../../models/AnalisisFinanzas';
import { Producto } from '../../models/Producto';
import { FinanzasInput } from './types';
import { generarProyeccion } from './proyeccionService';
import { calcularBreakeven } from './breakevenService';
import { generarResumen } from './resumenService';
import { calcularSensibilidad } from './sensibilidadService';
import { generarRiesgosNegocio, type ResultadoRiesgos } from './riesgosService';
import { construirMetaIaFinanzas } from './transparenciaFinanzas';
import { notificarAnalisisCompleto } from '../email/emailService';
import { swallowWithLog } from '../../utils/fireAndForget';
import { emitAnalysisUpdate } from '../../events/sse';
import { contextoIA, huboFallbackIA } from '../../utils/seguimientoIA';
import { logger } from '../../utils/logger';
import { getTaxConfig } from '../../utils/taxConfig';
import { estatusEfectivo } from '../../utils/estatusProyecto';
import { tipoActividadDe } from '../mercado/tipoActividad';
import { resolverPrompt } from '../ia/registroPrompts';
import type { PerfilNegocio } from '../ia/perfilNegocio';
import { leerPerfil } from '../ia/perfilNegocio';

export type OrigenDatosFinanzas = 'contabilidad' | 'declarado';

/** Lo del producto que usa Finanzas (el real, o el de un caso de prueba del panel). */
export interface ProductoFinanzas {
  nombre: string;
  categoria?: string | null;
  pais?: string | null;
  estatus_proyecto?: string | null;
  clientes_mes?: number | null;
  tipo_actividad?: string | null;
}

/**
 * El país lo pone el producto y la tasa del impuesto al consumo el código: el
 * usuario solo dice si su precio ya la incluye.
 */
export function inputConPais(input: FinanzasInput, pais: string | null | undefined): FinanzasInput {
  const cfg = getTaxConfig(pais);
  return { ...input, pais: cfg.pais, tasa_impuesto_consumo: cfg.consumo.tasa };
}

/**
 * Todo el análisis de Finanzas sin tocar la base: cálculo determinista, riesgos
 * con IA (salvo que el admin los oculte) y transparencia. Lo usan el worker y el
 * «Probar» del panel de prompts, con las versiones ancladas en el contexto.
 */
export async function generarResultadoFinanzas(p: {
  input: FinanzasInput;
  producto: ProductoFinanzas;
  perfil: PerfilNegocio;
  origenDatos: OrigenDatosFinanzas;
}) {
  const input = inputConPais(p.input, p.producto.pais);
  const estatus = estatusEfectivo(p.producto.estatus_proyecto, p.producto.clientes_mes);
  const tipoActividad = tipoActividadDe(p.producto.tipo_actividad, p.producto.categoria ?? '');

  // Secciones que el admin ocultó en la versión del modo anclada a este trabajo.
  const modo = await resolverPrompt('finanzas.modo', contextoIA()?.versionesPrompt?.['finanzas.modo']);
  const ocultas = new Set(modo.secciones_ocultas);

  // Stage A: proyección 12 meses (síncrono, rápido)
  const proyeccion = generarProyeccion(input);

  // Stage B: breakeven (síncrono, usa datos de Stage A) → resumen
  const breakeven = calcularBreakeven(input, proyeccion.meses);
  const resumen = generarResumen(input, proyeccion, breakeven, { volumenComprobado: p.origenDatos === 'contabilidad' });
  const sensibilidad = calcularSensibilidad(input);

  // Riesgos financieros del negocio, con base en los números ya calculados
  // arriba — no bloquea el análisis si el LLM falla (fallback determinista).
  let riesgos: ResultadoRiesgos | null = null;
  if (!ocultas.has('finanzas.riesgos')) {
    const eco = proyeccion.economia_unitaria;
    riesgos = await generarRiesgosNegocio({
      nombre_producto: p.producto.nombre,
      categoria: p.producto.categoria ?? undefined,
      pais: input.pais,
      precio_venta: input.precio_venta,
      costo_variable_unitario: input.costo_variable_unitario,
      costos_fijos_mensuales: input.costos_fijos_mensuales,
      margen_neto_promedio: proyeccion.totales.margen_neto_promedio,
      viabilidad: resumen.viabilidad,
      meses_para_recuperar_inversion: breakeven.meses_para_recuperar_inversion,
      payback_no_disponible: breakeven.payback_no_disponible,
      estatus,
      tipo_actividad: tipoActividad,
      origen_datos: p.origenDatos,
      tasa_crecimiento_mensual: input.tasa_crecimiento_mensual,
      inversion_inicial: input.inversion_inicial ?? null,
      precio_neto: eco.precio_neto,
      precio_incluye_impuesto: input.precio_incluye_impuesto ?? null,
      comision_unitaria: eco.comision_unitaria,
      merma_pct: input.merma_pct ?? null,
      merma_unitaria: eco.merma_unitaria,
      margen_unitario: eco.margen_unitario,
      sueldo_dueno_mensual: input.sueldo_dueno_mensual ?? null,
      dias_cobro: input.dias_cobro ?? null,
      dias_pago: input.dias_pago ?? null,
      pago_deuda_mensual: input.pago_deuda_mensual ?? null,
      cobertura_deuda: proyeccion.cobertura_deuda,
      caja_necesaria: proyeccion.caja_necesaria,
      mes_valle: proyeccion.mes_valle,
      capital_de_trabajo: proyeccion.capital_de_trabajo,
      unidades_breakeven_mes: breakeven.unidades_breakeven_mes,
      perfil: p.perfil,
    });
  }

  const inputs_data: FinanzasInputsSnapshot = {
    precio_venta: input.precio_venta,
    costo_variable_unitario: input.costo_variable_unitario,
    costos_fijos_mensuales: input.costos_fijos_mensuales,
    unidades_mes_inicial: input.unidades_mes_inicial,
    tasa_crecimiento_mensual: input.tasa_crecimiento_mensual,
    inversion_inicial: input.inversion_inicial ?? null,
    precio_incluye_impuesto: input.precio_incluye_impuesto ?? null,
    tasa_impuesto_consumo: input.tasa_impuesto_consumo,
    comision_venta_pct: input.comision_venta_pct ?? null,
    dias_cobro: input.dias_cobro ?? null,
    dias_pago: input.dias_pago ?? null,
    sueldo_dueno_mensual: input.sueldo_dueno_mensual ?? null,
    pago_deuda_mensual: input.pago_deuda_mensual ?? null,
    merma_pct: input.merma_pct ?? null,
  };

  const meta_ia = construirMetaIaFinanzas({
    datos: { input, proyeccion, breakeven, origenDatos: p.origenDatos, estatus, perfil: p.perfil, categoria: p.producto.categoria },
    riesgos,
    modo,
    ocultas,
    tipoActividad,
  });

  return {
    pais: input.pais as string,
    proyeccion,
    breakeven,
    resumen,
    sensibilidad,
    riesgos: riesgos?.riesgos ?? null,
    inputs_data,
    meta_ia,
  };
}

export async function ejecutarAnalisisFinanzas(
  analisisId: string,
  input: FinanzasInput & { origen_datos?: OrigenDatosFinanzas },
  producto: Producto,
): Promise<void> {
  const repo = AppDataSource.getRepository(AnalisisFinanzas);
  const analisis = await repo.findOneBy({ id: analisisId });
  if (!analisis) throw new Error('Análisis no encontrado durante worker job');

  try {
    const r = await generarResultadoFinanzas({
      input,
      producto,
      perfil: leerPerfil(producto.perfil_negocio),
      origenDatos: input.origen_datos === 'contabilidad' ? 'contabilidad' : 'declarado',
    });

    analisis.pais = r.pais;
    analisis.proyeccion_data = r.proyeccion;
    analisis.breakeven_data = r.breakeven;
    analisis.resumen_data = r.resumen;
    analisis.sensibilidad_data = r.sensibilidad;
    analisis.riesgos_data = r.riesgos;
    analisis.inputs_data = r.inputs_data;
    analisis.meta_ia = r.meta_ia;
    analisis.resultado_estimado = huboFallbackIA();
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
    // Solo se registra y se relanza: la cola marca el error y avisa al usuario
    // cuando ya no quedan reintentos (workers/analysisQueue.ts).
    logger.error(`❌ Error análisis finanzas ${analisisId}:`, err);
    throw err;
  }
}
