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
  /**
   * Mes calendario (1-12) en que arranca la proyección: el día local de quien
   * lo pide. Sin él los meses se llamaban Enero…Diciembre aunque el análisis se
   * hiciera en septiembre, y «tu peor mes: Enero» era en realidad el primero.
   */
  mes_inicio?: number;

  // ── Datos que cambian el cálculo («Afina tu análisis» y el formulario) ────
  // Todos opcionales: sin ellos el modelo es el de siempre (precio sin
  // impuesto, sin comisiones, de contado y sin deuda) y la transparencia del
  // análisis lo declara como supuesto.

  /** País del producto: moneda e impuesto al consumo. */
  pais?: string;
  /** ¿El precio de venta ya incluye el impuesto al consumo (IVA, IGV, ITBM…)? */
  precio_incluye_impuesto?: boolean | null;
  /** Tasa del impuesto al consumo del país (0.16…). La pone el código según el país, nunca el usuario. */
  tasa_impuesto_consumo?: number;
  /** % de lo que paga el cliente que se quedan pasarelas, marketplaces o apps de reparto. */
  comision_venta_pct?: number | null;
  /** Días que tardas en cobrar una venta (0 = de contado). */
  dias_cobro?: number | null;
  /** Días que te dan tus proveedores para pagar los insumos (0 = de contado). */
  dias_pago?: number | null;
  /** Sueldo del dueño que NO está dentro de `costos_fijos_mensuales`. */
  sueldo_dueno_mensual?: number | null;
  /** Cuota mensual de las deudas del negocio (capital más intereses). */
  pago_deuda_mensual?: number | null;
}

/** Lo que de verdad deja cada venta, una vez quitado el impuesto y las comisiones. */
export interface EconomiaUnitaria {
  /** Precio sin el impuesto al consumo: lo que es ingreso del negocio. */
  precio_neto: number;
  /** Impuesto al consumo que va dentro del precio (0 si el precio no lo incluye). */
  impuesto_unitario: number;
  /** Comisión por venta, sobre lo que paga el cliente. */
  comision_unitaria: number;
  /** Costo variable declarado más la comisión. */
  costo_variable_efectivo: number;
  margen_unitario: number;
  /** Costos fijos declarados más el sueldo del dueño que no estaba dentro. */
  costos_fijos_efectivos: number;
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
  /**
   * Dinero que de verdad entra menos el que sale ese mes: cobros (con sus días
   * de cobro) menos insumos (con sus días de pago), comisiones, costos fijos y
   * cuota de deuda. Sin plazos ni deuda coincide con la utilidad neta.
   */
  flujo_caja: number;
  /** Saldo de caja acumulado, empezando en menos la inversión inicial. */
  saldo_caja: number;
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
  /**
   * Caja extra que inmovilizan los plazos: cobrar a crédito mientras pagas de
   * contado. 0 sin plazos declarados.
   */
  capital_de_trabajo: number;
  /**
   * Veces que la utilidad mensual promedio cubre la cuota de deuda. `null` sin
   * deuda declarada. Menos de 1: el negocio no puede pagarla con lo que genera.
   */
  cobertura_deuda: number | null;
  /** Lo que se usó en el cálculo, para mostrarlo y explicarlo. */
  economia_unitaria: EconomiaUnitaria;
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
  /**
   * Unidades al mes para cubrir también la cuota de deuda (equilibrio de caja).
   * `null` sin deuda declarada.
   */
  unidades_equilibrio_con_deuda: number | null;
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
