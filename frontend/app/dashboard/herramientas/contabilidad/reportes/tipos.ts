/** Formas que devuelve `GET /api/reportes/*`. Espejo de reportesService.ts. */

export interface ResumenReporte {
  periodo: { desde: string; hasta: string };
  periodo_anterior: { desde: string; hasta: string };
  ventas: {
    num_ventas: number;
    importe: number;
    subtotal: number;
    impuestos: number;
    ticket_promedio: number;
  };
  margen: {
    costo_ventas: number;
    utilidad_bruta: number;
    /** null = ninguna venta del periodo tenía costo conocido. */
    margen_pct: number | null;
    /** % del importe vendido con costo conocido. Sin esto el margen engaña. */
    cobertura_pct: number;
  };
  flujo: { ingresos: number; egresos: number; utilidad_neta: number };
  comparativa: {
    /** null = no había periodo previo con el que comparar. */
    importe_pct: number | null;
    num_ventas_pct: number | null;
    ticket_promedio_pct: number | null;
    importe_anterior: number;
    num_ventas_anterior: number;
  };
}

export interface PuntoSerie {
  periodo: string;
  num_ventas: number;
  importe: number;
}

export interface ProductoReporte {
  nombre: string;
  item_pos_id: string | null;
  unidades: number;
  importe: number;
  tickets: number;
  costo: number | null;
  utilidad: number | null;
  margen_pct: number | null;
  costo_parcial: boolean;
}

export interface AlmacenReporte {
  totales: {
    entradas_unidades: number;
    entradas_valor: number;
    salidas_unidades: number;
    salidas_valor: number;
    mermas_unidades: number;
    mermas_valor: number;
    ajustes_unidades: number;
    salidas_por_venta: number;
  };
  por_insumo: {
    id: string;
    nombre: string;
    unidad: string;
    entradas: number;
    salidas: number;
    mermas: number;
    valor_salidas: number;
  }[];
  bajo_minimo: {
    id: string;
    nombre: string;
    unidad: string;
    stock_actual: number;
    stock_minimo: number;
    costo_promedio: number;
  }[];
}

export interface ClientesReporte {
  cobertura: {
    ventas_con_cliente: number;
    ventas_sin_cliente: number;
    importe_sin_cliente: number;
  };
  segmentos: { nuevos: number; recurrentes: number };
  top: {
    id: string;
    nombre: string;
    telefono: string | null;
    categoria: string | null;
    compras: number;
    importe: number;
    ticket_promedio: number;
    ultima_compra: string | null;
  }[];
}

export interface HorariosReporte {
  timezone: string;
  celdas: { dia_semana: number; hora: number; num_ventas: number; importe: number }[];
}

export interface MetodoPagoReporte {
  metodo_pago: string;
  num_ventas: number;
  importe: number;
}

export interface CotizacionesReporte {
  emitidas: number;
  aceptadas: number;
  rechazadas: number;
  abiertas: number;
  importe_emitido: number;
  importe_aceptado: number;
  tasa_conversion_pct: number | null;
}

export type Granularidad = 'dia' | 'semana' | 'mes' | 'anio';
