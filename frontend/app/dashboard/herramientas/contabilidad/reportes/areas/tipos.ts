/** Formas que devuelve `GET /api/reportes/area/:area`. Espejo de reportesAreas.ts. */
import type {
  AlmacenReporte,
  ClientesReporte,
  CotizacionesReporte,
  Granularidad,
  HorariosReporte,
  MetodoPagoReporte,
  ProductoReporte,
  PuntoSerie,
} from '../tipos';

export const AREAS = ['ventas', 'inventario', 'cotizaciones', 'clientes', 'citas', 'personal', 'contabilidad'] as const;
export type Area = (typeof AREAS)[number];
export type AreasVisibles = Record<Area, boolean>;

type Pct = number | null;

export interface Periodo {
  desde: string;
  hasta: string;
}

export interface AreaVentas {
  totales: {
    num_ventas: number;
    importe: number;
    subtotal: number;
    impuestos: number;
    ticket_promedio: number;
    costo_ventas: number;
    utilidad_bruta: number;
    margen_pct: Pct;
    cobertura_pct: number;
    canceladas: number;
    importe_cancelado: number;
    desde_cotizacion: number;
    importe_desde_cotizacion: number;
    dias_con_venta: number;
    promedio_diario: number;
  };
  comparativa: {
    periodo_anterior: Periodo;
    importe_anterior: number;
    importe_pct: Pct;
    num_ventas_pct: Pct;
    ticket_promedio_pct: Pct;
  };
  serie: { granularidad: Granularidad; puntos: PuntoSerie[] };
  productos: ProductoReporte[];
  mejores_margenes: ProductoReporte[];
  peores_margenes: ProductoReporte[];
  productos_sin_costo: string[];
  por_categoria: { categoria: string; unidades: number; importe: number; tickets: number; participacion_pct: Pct }[];
  por_vendedor: { vendedor: string; num_ventas: number; importe: number; ticket_promedio: number; participacion_pct: Pct }[];
  rangos_ticket: { rango: string; num_ventas: number; importe: number }[];
  metodos_pago: MetodoPagoReporte[];
  horarios: HorariosReporte;
}

export interface AreaInventario extends AlmacenReporte {
  valuacion: {
    insumos_activos: number;
    sin_stock: number;
    bajo_minimo: number;
    valor_total: number;
    por_categoria: { categoria: string; insumos: number; valor: number; participacion_pct: Pct }[];
  };
  consumo: {
    por_ventas: number;
    salidas_manuales: number;
    mermas: number;
    compras: number;
    mermas_sobre_consumo_pct: Pct;
  };
  mermas_por_motivo: { motivo: string; veces: number; valor: number }[];
  por_proveedor: { proveedor: string; compras: number; insumos: number; valor: number }[];
  sin_movimiento: {
    id: string;
    nombre: string;
    unidad: string;
    stock_actual: number;
    valor: number;
    ultimo_movimiento: string | null;
  }[];
  cobertura: {
    id: string;
    nombre: string;
    unidad: string;
    stock_actual: number;
    consumo_periodo: number;
    consumo_diario: number;
    dias_cobertura: number | null;
  }[];
}

export interface AreaCotizaciones extends CotizacionesReporte {
  ticket_promedio: number;
  descuentos: { total: number; cotizaciones_con_descuento: number; descuento_medio_pct: number };
  por_estado: { estado: string; cantidad: number; importe: number }[];
  conversion_a_venta: { convertidas: number; importe_vendido: number; dias_promedio: number | null };
  vencidas: {
    cantidad: number;
    importe: number;
    lista: {
      id: string;
      numero: string;
      cliente: string | null;
      total: number;
      estado: string;
      fecha_vencimiento: string;
      dias_vencida: number;
    }[];
  };
  por_cliente: { cliente: string; cotizaciones: number; aceptadas: number; importe: number; conversion_pct: Pct }[];
  por_mes: { mes: string; emitidas: number; aceptadas: number; importe: number }[];
}

export interface AreaClientes extends ClientesReporte {
  cartera: {
    total: number;
    leads: number;
    clientes: number;
    proveedores: number;
    ambos: number;
    nuevos_periodo: number;
    leads_nuevos_periodo: number;
    conversion_lead_cliente_pct: Pct;
  };
  por_categoria: { categoria: string; cantidad: number }[];
  seguimiento: {
    hasta_30_dias: number;
    de_31_a_60_dias: number;
    de_61_a_90_dias: number;
    mas_de_90_dias: number;
    sin_contacto_registrado: number;
  };
  dormidos: {
    id: string;
    nombre: string;
    telefono: string | null;
    compras: number;
    importe_historico: number;
    ultima_compra: string;
    dias_sin_comprar: number;
  }[];
  cotizados_sin_compra: { id: string; nombre: string; cotizaciones: number; importe_cotizado: number }[];
}

export interface AreaCitas {
  totales: {
    total: number;
    pendientes: number;
    confirmadas: number;
    completadas: number;
    canceladas: number;
    tasa_cancelacion_pct: Pct;
    tasa_completadas_pct: Pct;
    clientes_distintos: number;
    duracion_promedio_min: number | null;
    promedio_diario: number;
  };
  conversion_a_venta: { completadas_con_venta: number; importe: number; tasa_pct: Pct };
  serie: {
    granularidad: Granularidad;
    puntos: { periodo: string; citas: number; completadas: number; canceladas: number }[];
  };
  por_dia_semana: { dia_semana: number; citas: number; canceladas: number }[];
  por_hora: { hora: number; citas: number }[];
  por_cliente: { cliente: string; citas: number; completadas: number; canceladas: number }[];
  proximas: { id: string; titulo: string; fecha: string; hora: string; estado: string; cliente: string | null }[];
}

export interface AreaPersonal {
  plantilla: {
    activos: number;
    inactivos: number;
    altas_periodo: number;
    masa_salarial_mensual: { moneda: string; importe: number }[];
  };
  pagado: {
    por_moneda: { moneda: string; pagos: number; total: number; empleados_pagados: number }[];
    total: number;
    sobre_ventas_pct: Pct;
  };
  por_cargo: { cargo: string; moneda: string; personas: number; masa_mensual: number }[];
  por_empleado: {
    empleado: string;
    cargo: string | null;
    moneda: string;
    pagos: number;
    total: number;
    ultimo_pago: string | null;
  }[];
  por_mes: { mes: string; moneda: string; total: number; pagos: number }[];
  sin_pago_en_periodo: {
    id: string;
    nombre: string;
    cargo: string | null;
    tipo_pago: string;
    salario: number;
    moneda: string;
    ultimo_pago: string | null;
  }[];
}

export interface AreaContabilidad {
  flujo: { ingresos: number; egresos: number; utilidad_neta: number; margen_neto_pct: Pct };
  comparativa: { periodo_anterior: Periodo; ingresos_pct: Pct; egresos_pct: Pct; utilidad_anterior: number };
  ingresos_por_categoria: { categoria: string; movimientos: number; total: number; participacion_pct: Pct }[];
  egresos_por_categoria: { categoria: string; movimientos: number; total: number; participacion_pct: Pct }[];
  por_fuente: { fuente: string; ingresos: number; egresos: number; movimientos: number }[];
  serie: {
    granularidad: Granularidad;
    puntos: { periodo: string; ingresos: number; egresos: number; neto: number; acumulado: number }[];
  };
  fiscal: {
    egresos_con_cfdi: number;
    egresos_sin_cfdi: number;
    movimientos_sin_cfdi: number;
    egresos_deducibles_pct: Pct;
    ingresos_con_cfdi: number;
  };
  origen: { automaticos: number; manuales: number };
  top_egresos: {
    id: string;
    descripcion: string;
    categoria: string;
    fecha: string;
    monto: number;
    fuente: string;
    tiene_cfdi: boolean;
  }[];
}

export interface Alerta {
  area: Area;
  nivel: 'alta' | 'media';
  mensaje: string;
}

export interface Panorama {
  areas: AreasVisibles;
  kpis: {
    ventas: { importe: number; num_ventas: number; ticket_promedio: number; margen_pct: Pct; importe_pct: Pct } | null;
    inventario: { valor: number; compras: number; mermas: number; bajo_minimo: number } | null;
    cotizaciones: { emitidas: number; importe_emitido: number; tasa_conversion_pct: Pct; vencidas: number } | null;
    clientes: { cartera: number; nuevos: number; compradores_nuevos: number; recurrentes: number } | null;
    citas: { total: number; completadas: number; tasa_cancelacion_pct: Pct } | null;
    personal: { activos: number; pagado: number; sobre_ventas_pct: Pct } | null;
    contabilidad: { ingresos: number; egresos: number; utilidad_neta: number; margen_neto_pct: Pct } | null;
  };
  alertas: Alerta[];
}

export interface ReporteCompleto {
  periodo: Periodo;
  generado_en: string;
  panorama: Panorama;
  ventas: AreaVentas | null;
  inventario: AreaInventario | null;
  cotizaciones: AreaCotizaciones | null;
  clientes: AreaClientes | null;
  citas: AreaCitas | null;
  personal: AreaPersonal | null;
  contabilidad: AreaContabilidad | null;
}
