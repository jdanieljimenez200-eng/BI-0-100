import type { FinanzasInput } from '../finanzas/types';
import type { PerfilNegocio } from './perfilNegocio';

/**
 * Negocios ficticios para probar el modo de Finanzas antes de publicarlo.
 *
 * Cubren lo que cambia el cálculo: precio con impuesto incluido, comisiones de
 * plataformas, venta a crédito, deuda, sueldo del dueño fuera de los costos y
 * un caso sin inversión declarada (no debe hablar de recuperarla).
 */
export interface CasoPruebaFinanzas {
  id: string;
  titulo: string;
  pais: string;
  producto: {
    nombre: string;
    categoria: string;
    tipo_actividad: 'producto' | 'servicio';
    estatus_proyecto: 'nueva_idea' | 'negocio_en_marcha';
  };
  input: Omit<FinanzasInput, 'productoId' | 'usuarioId' | 'pais' | 'tasa_impuesto_consumo'>;
  origen_datos: 'contabilidad' | 'declarado';
  perfil: PerfilNegocio;
}

export const CASOS_FINANZAS: CasoPruebaFinanzas[] = [
  {
    // Una idea con equipo barato: el resumen no puede presumir un «ROI de 2 600 %»;
    // lo que hay que comprobar es si llega a las ventas del punto de equilibrio.
    id: 'mx_tamales_via_publica',
    titulo: 'Puesto de tamales afuera del Metro Niños Héroes (CDMX), todavía sin vender',
    pais: 'MX',
    producto: { nombre: 'Tamales Doña Lupe', categoria: 'Alimentos preparados', tipo_actividad: 'producto', estatus_proyecto: 'nueva_idea' },
    input: {
      precio_venta: 45,
      costo_variable_unitario: 17,
      costos_fijos_mensuales: 14000,
      unidades_mes_inicial: 2600,
      tasa_crecimiento_mensual: 2,
      inversion_inicial: 25000,
      precio_incluye_impuesto: false,
      comision_venta_pct: 0,
      dias_cobro: 0,
      dias_pago: 0,
      sueldo_dueno_mensual: 12000,
      pago_deuda_mensual: 0,
    },
    origen_datos: 'declarado',
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'via_publica', sectores_regulados: ['alimentos_bebidas'] },
  },
  {
    id: 'mx_taqueria_apps',
    titulo: 'Taquería en Monterrey que vende por apps de reparto',
    pais: 'MX',
    producto: { nombre: 'Tacos El Güero', categoria: 'Alimentos preparados', tipo_actividad: 'producto', estatus_proyecto: 'negocio_en_marcha' },
    input: {
      precio_venta: 120,
      costo_variable_unitario: 42,
      costos_fijos_mensuales: 38000,
      unidades_mes_inicial: 900,
      tasa_crecimiento_mensual: 3,
      inversion_inicial: 180000,
      precio_incluye_impuesto: true,
      comision_venta_pct: 18,
      dias_cobro: 7,
      dias_pago: 0,
      sueldo_dueno_mensual: 15000,
      pago_deuda_mensual: null,
    },
    origen_datos: 'contabilidad',
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'local_rentado' },
  },
  {
    id: 'co_agencia_b2b_credito',
    titulo: 'Agencia de mantenimiento industrial en Medellín que cobra a 60 días',
    pais: 'CO',
    producto: { nombre: 'Mantenimientos Andinos', categoria: 'Servicios industriales', tipo_actividad: 'servicio', estatus_proyecto: 'negocio_en_marcha' },
    input: {
      precio_venta: 3500000,
      costo_variable_unitario: 1400000,
      costos_fijos_mensuales: 18000000,
      unidades_mes_inicial: 9,
      tasa_crecimiento_mensual: 5,
      inversion_inicial: 60000000,
      precio_incluye_impuesto: false,
      comision_venta_pct: 0,
      dias_cobro: 60,
      dias_pago: 0,
      sueldo_dueno_mensual: null,
      pago_deuda_mensual: 2500000,
    },
    origen_datos: 'declarado',
    perfil: { tipo_clientes: 'empresas' },
  },
  {
    id: 'pe_tienda_online_deuda',
    titulo: 'Tienda online de accesorios en Lima con préstamo bancario',
    pais: 'PE',
    producto: { nombre: 'Pulso Accesorios', categoria: 'Comercio electrónico', tipo_actividad: 'producto', estatus_proyecto: 'negocio_en_marcha' },
    input: {
      precio_venta: 89,
      costo_variable_unitario: 38,
      costos_fijos_mensuales: 6500,
      unidades_mes_inicial: 210,
      tasa_crecimiento_mensual: 6,
      inversion_inicial: 25000,
      precio_incluye_impuesto: true,
      comision_venta_pct: 4.5,
      dias_cobro: 2,
      dias_pago: 30,
      sueldo_dueno_mensual: 2500,
      pago_deuda_mensual: 1800,
    },
    origen_datos: 'declarado',
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'en_casa' },
  },
  {
    id: 'cl_panaderia_idea',
    titulo: 'Idea de panadería de barrio en Valparaíso',
    pais: 'CL',
    producto: { nombre: 'Masa Madre del Puerto', categoria: 'Panadería', tipo_actividad: 'producto', estatus_proyecto: 'nueva_idea' },
    input: {
      precio_venta: 2500,
      costo_variable_unitario: 900,
      costos_fijos_mensuales: 2200000,
      unidades_mes_inicial: 1100,
      tasa_crecimiento_mensual: 12,
      inversion_inicial: 18000000,
      precio_incluye_impuesto: true,
      comision_venta_pct: null,
      dias_cobro: null,
      dias_pago: null,
      sueldo_dueno_mensual: 800000,
      pago_deuda_mensual: null,
    },
    origen_datos: 'declarado',
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'local_rentado', sectores_regulados: ['alimentos_bebidas'] },
  },
  {
    id: 'ar_consultor_sin_inversion',
    titulo: 'Consultor de sistemas en Córdoba, sin inversión declarada',
    pais: 'AR',
    producto: { nombre: 'Núcleo Sistemas', categoria: 'Servicios profesionales', tipo_actividad: 'servicio', estatus_proyecto: 'negocio_en_marcha' },
    input: {
      precio_venta: 450000,
      costo_variable_unitario: 60000,
      costos_fijos_mensuales: 900000,
      unidades_mes_inicial: 4,
      tasa_crecimiento_mensual: 30,
      inversion_inicial: null,
    },
    origen_datos: 'declarado',
    perfil: {},
  },
];
