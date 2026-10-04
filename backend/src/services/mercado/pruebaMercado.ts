import { calcularDensidadZona } from './densidadService';
import { calcularViabilidad, estimarMargen } from './viabilidadService';
import { generarDafo } from './dafoService';
import { generarReporteBi } from './reporteBiService';
import { construirMetaIaMercado } from './transparenciaMercado';
import { tipoActividadDe } from './tipoActividad';
import type { ProductoContextoMercado } from './types';
import { estatusEfectivo } from '../../utils/estatusProyecto';
import { contextoIA } from '../../utils/seguimientoIA';
import { resolverPrompt } from '../ia/registroPrompts';
import { insumosDeCasoMercado, type CasoPruebaMercado } from '../ia/casosPruebaMercado';

/**
 * Corre la parte de IA de Mercado (DAFO y reporte BI) sobre un caso de prueba,
 * con las versiones de prompt ancladas en el contexto. Los datos de demanda y
 * competencia son los fijos del caso: no toca fuentes externas ni la base.
 */
export async function probarCasoMercado(caso: CasoPruebaMercado) {
  const p = caso.producto;
  const { tendencias, competencia } = insumosDeCasoMercado(caso);
  const precio = p.precio > 0 ? p.precio : undefined;
  const densidad = calcularDensidadZona(competencia, { scope: caso.input.scope });
  const margen = estimarMargen(p.categoria, precio ?? 0, competencia.precio_mercado_promedio);
  const viabilidad = calcularViabilidad(tendencias, competencia, margen, precio, densidad);
  const tipoActividad = tipoActividadDe(p.tipo_actividad, p.categoria);
  const ctx: ProductoContextoMercado = {
    estatus_proyecto: estatusEfectivo(p.estatus_proyecto, caso.input.clientes_mes),
    tipo_actividad: tipoActividad,
    puv: p.puv ?? '',
    inversion_inicial: p.inversion_inicial,
    costos_fijos: p.costos_fijos,
    precio_venta: precio ?? 0,
  };

  const modo = await resolverPrompt('mercado.modo', contextoIA()?.versionesPrompt?.['mercado.modo']);
  const ocultas = new Set(modo.secciones_ocultas);
  const seccionesIA: { es_mock?: boolean }[] = [];

  const dafo = ocultas.has('mercado.dafo')
    ? null
    : await generarDafo({ nombre: p.nombre, categoria: p.categoria, descripcion: p.descripcion }, competencia, tendencias, viabilidad, {
        precio_usuario: precio,
        nse_target: caso.input.nse_target,
        forma_cobro: caso.input.forma_cobro,
        scope: caso.input.scope,
        estado: caso.input.estado,
        pais: caso.pais,
        competidores_conocidos: caso.input.competidores_conocidos,
        puv: p.puv ?? undefined,
        cliente_ideal: p.cliente_ideal ?? undefined,
        canal_venta: p.canal_venta ?? undefined,
        tipo_actividad: tipoActividad,
        estatus: ctx.estatus_proyecto,
        perfil: caso.perfil,
      });
  if (dafo) seccionesIA.push(dafo);

  const reporteBi = ocultas.has('mercado.reporte_bi')
    ? null
    : await generarReporteBi(caso.input, ctx, { nombre: p.nombre, categoria: p.categoria }, tendencias, competencia, viabilidad, {
        cliente_ideal: p.cliente_ideal,
        canal_venta: p.canal_venta,
        perfil: caso.perfil,
      });
  if (reporteBi) seccionesIA.push(reporteBi.reporte);

  const meta_ia = construirMetaIaMercado({
    datos: {
      viabilidad,
      competencia,
      tendencias,
      precioUsuario: precio,
      estatus: ctx.estatus_proyecto,
      clientesMes: caso.input.clientes_mes,
      puv: p.puv,
      clienteIdeal: p.cliente_ideal,
      competidoresConocidos: caso.input.competidores_conocidos,
      perfil: caso.perfil,
    },
    reporteBi,
    modo,
    ocultas,
    seccionesIA,
    tipoActividad,
    cifrasConocidas: [caso.input, ctx],
  });

  return { viabilidad, dafo, reporte_bi: reporteBi?.reporte ?? null, meta_ia };
}
