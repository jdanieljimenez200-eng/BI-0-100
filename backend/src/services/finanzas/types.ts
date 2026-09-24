export interface FinanzasInput {
  productoId: string;
  usuarioId: string;
  trabajadorId?: string; // id del trabajador que disparó el análisis (si aplica)
  precio_venta: number;
  costo_variable_unitario: number;
  costos_fijos_mensuales: number;
  unidades_mes_inicial: number;
  tasa_crecimiento_mensual: number; // porcentaje, ej. 10 = 10%
  /**
   * Lo que cuesta arrancar (equipo, obra, inventario inicial, depósitos).
   * Sin este dato NO hay payback: antes se devolvía el primer mes con utilidad
   * acumulada positiva, que para un negocio rentable es el mes 1, y la pantalla
   * lo presentaba como «recuperas tu inversión en 1 mes».
   */
  inversion_inicial?: number | null;
}

export interface MesProyeccion {
  mes: number;
  nombre_mes: string;
  unidades: number;
  ingresos: number;
  costo_variable_total: number;
  costos_fijos: number;
  utilidad_bruta: number;
  utilidad_neta: number;
  margen_neto: number; // porcentaje
  acumulado_neto: number;
}

export interface ProyeccionAnual {
  meses: MesProyeccion[];
  totales: {
    unidades_totales: number;
    ingresos_totales: number;
    costo_variable_total: number;
    costos_fijos_total: number;
    utilidad_bruta_total: number;
    utilidad_neta_total: number;
    margen_neto_promedio: number;
  };
  mejor_mes: number;
  peor_mes: number;
  /**
   * Caja que hay que tener para aguantar hasta que el acumulado cubra la
   * inversión: el punto más bajo del saldo. 0 = nunca baja de lo invertido.
   */
  caja_necesaria: number;
  /** Mes de ese punto más bajo (0 = el arranque). */
  mes_valle: number;
  /** Siempre true: esta proyección no descuenta impuestos y hay que decirlo. */
  utilidad_antes_de_impuestos: true;
}

export interface BreakevenData {
  unidades_breakeven_mes: number;
  ingresos_breakeven_mes: number;
  margen_contribucion_unitario: number;
  margen_contribucion_porcentaje: number;
  punto_equilibrio_alcanzado: boolean;
  mes_equilibrio: number | null; // null si no alcanza en 12 meses
  /** Mes en que la utilidad acumulada iguala la inversión inicial declarada. */
  meses_para_recuperar_inversion: number | null;
  /** Por qué no hay payback, cuando no lo hay. La pantalla lo muestra tal cual. */
  payback_no_disponible: 'sin_inversion_declarada' | 'no_se_recupera_en_12_meses' | null;
  inversion_inicial: number;
  escenarios: EscenarioBreakeven[];
}

export interface EscenarioBreakeven {
  nombre: string;
  descripcion: string;
  unidades_necesarias: number;
  ingresos_necesarios: number;
  diferencia_vs_inicial: number; // % respecto a unidades_mes_inicial
}

export interface ResumenFinanzas {
  viabilidad: 'alta' | 'media' | 'baja';
  color_viabilidad: string;
  mensaje_viabilidad: string;
  roi_anual: number; // porcentaje
  /**
   * Sobre qué se calculó el ROI. Con inversión declarada es el retorno de
   * verdad; sin ella es el retorno sobre el costo fijo del año, que NO es lo
   * mismo y la pantalla tiene que decirlo.
   */
  base_roi: 'inversion_inicial' | 'costos_fijos_anuales';
  payback_meses: number | null;
  payback_no_disponible: BreakevenData['payback_no_disponible'];
  ingreso_promedio_mensual: number;
  utilidad_promedio_mensual: number;
  recomendaciones: string[];
  alertas: string[];
}

// ─── Sensitivity Analysis ────────────────────────────────────────────────────

export interface EscenarioSensibilidad {
  nombre: 'Pesimista' | 'Base' | 'Optimista';
  descripcion: string;
  factor_unidades: number;       // multiplicador vs base (0.7, 1.0, 1.3)
  factor_precio: number;         // multiplicador vs precio base (0.9, 1.0, 1.1)
  unidades_mes1: number;
  ingresos_anuales: number;
  utilidad_neta_anual: number;
  roi_anual: number;
  mes_breakeven: number | null;
  viabilidad: 'alta' | 'media' | 'baja';
  color: string;
}

export interface SensibilidadAnalisis {
  escenarios: EscenarioSensibilidad[];
  pregunta_clave: string;        // "¿Qué pasa si vendes 30% menos?"
  palanca_principal: string;     // el factor que más impacta la rentabilidad
  rango_ingresos: { min: number; max: number };
  rango_roi: { min: number; max: number };
}
