// ─── Input ──────────────────────────────────────────────────────────────────

export type VozMarca = 'Profesional' | 'Divertido' | 'Urgente' | 'Empático';

export type PilarMarketing = 'SEGUIDORES' | 'RECONOCIMIENTO' | 'VENTAS' | 'VENTAS_PLUS';
export type CanalCierre = 'whatsapp_dm' | 'ecommerce_web' | 'llamada' | 'tienda_fisica';
export type NivelTraccion = 'desde_cero' | 'en_marcha' | 'escalando';
export type RangoMargen = 'bajo_30' | 'medio_30_50' | 'alto_50_70' | 'premium_70_plus';

export interface BriefContexto {
  percepcion: string[];
  emocion: string;
  anti_valores: string[];
  tono_comunicacion: string;
  posicionamiento: string;
  nivel_diferenciacion: string;
  resultado_cliente: string;
  slogan?: string;
}

export interface MarketingAnalisisInput {
  productoId: string;
  usuarioId: string;
  trabajadorId?: string; // id del trabajador que disparó el análisis (si aplica)
  analisisMercadoId?: string;
  briefAnalisisId?: string;
  /** Análisis de Ventas cuyo ICP se usa como cliente ideal en vez del texto libre. */
  ventasAnalisisId?: string;
  vozMarca?: VozMarca;
  presupuestoMensual?: number;
  metaCampana?: string;           // 'Lanzamiento' | 'Crecimiento'
  clienteIdeal?: string;
  plataformas?: string[];         // ['Instagram','TikTok','Facebook','WhatsApp','LinkedIn','YouTube']
  capacidadContenido?: string;    // '1-2/semana' | '3-4/semana' | 'diario'
  canalCierre?: CanalCierre;
  nivelTraccion?: NivelTraccion;
  margenEstimado?: RangoMargen;
  reporteAds?: ReporteAdsProcesado;
}

/**
 * Recorte del calendario según el plan. Se decide ANTES de llamar al LLM (ver
 * services/billing/gatingAnalisis.ts) porque las 2 semanas, los video_script y
 * los prompt_visual salen de una única llamada: filtrar la respuesta no
 * ahorraría ni un token, solo esconder lo que ya se pagó.
 */
export interface RecorteCalendario {
  /** Semanas a generar. 1 = plan gratuito. */
  semanas: 1 | 2;
  incluirVideoScript: boolean;
  incluirPromptVisual: boolean;
}

// ─── Contexto de mercado (si se tiene analisis previo) ───────────────────────

export interface MercadoContexto {
  viabilidad_score: number;
  total_competidores: number;
  precio_mercado_promedio: number;
  tendencia: 'CRECIENTE' | 'ESTABLE' | 'DECRECIENTE';
  gap_detectado: string | null;
}

// ─── Posicionamiento & 4 Pilares de Agencia ──────────────────────────────────

export type TipoEstrategia =
  | 'PREMIUM'
  | 'VOLUMEN'
  | 'ESPECIALIZADO'
  | 'SEGUIDORES'
  | 'RECONOCIMIENTO'
  | 'VENTAS'
  | 'VENTAS_PLUS';

export interface ROIEstimado {
  alcance: string;
  leads: string;
  descripcion: string;
}

export interface UnitEconomicsVentasPlus {
  presupuesto_simulado: number;
  clics_estimados: number;
  cpc_promedio: number;
  leads_o_conversaciones: number;
  tasa_conversion_prospecto: number; // Porcentaje ej. 3.5
  ventas_cerradas: number;
  tasa_cierre: number; // Porcentaje ej. 20
  ingreso_proyectado: number;
  roas_estimado: number;
  /** false = con estos supuestos la campaña pierde dinero (ROAS < 1). */
  rentable: boolean;
  /** De dónde salen CPC y tasas: del reporte de ads del usuario o de benchmark. */
  origen_supuestos: 'tus_datos' | 'benchmark';
  cac_maximo_tolerable: number;
  ticket_promedio_con_bump: number;
  punto_equilibrio_unidades: number;
}

export interface ScriptWhatsAppVentasPlus {
  paso1_filtro: {
    objetivo: string;
    pregunta: string;
  };
  paso2_diagnostico: {
    objetivo: string;
    mensaje: string;
  };
  paso3_presentacion: {
    objetivo: string;
    audio_o_texto: string;
  };
  paso4_cierre_objeciones: {
    objecion_precio: string;
    objecion_pensarlo: string;
    objecion_consultarlo: string;
  };
}

export interface SecuenciaSeguimientoVentasPlus {
  dia1_caso_exito: string;
  dia3_beneficio_clave: string;
  dia5_despedida_urgencia: string;
}

export interface EstrategiaMarketing {
  tipo: TipoEstrategia;
  nombre: string;
  tagline: string;
  descripcion: string;
  por_que: string;                 // narrative justification
  precio_sugerido: number;
  precio_rango: { min: number; max: number };
  margen_rango: string;            // e.g. "45%-55%"
  publico_objetivo: string;
  edad_rango: string;
  canales_principales: string[];
  ventaja_competitiva: string;
  nivel_inversion: 'BAJO' | 'MEDIO' | 'ALTO';
  presupuesto_mensual_sugerido: number;
  tiempo_resultados: string;
  riesgo: 'BAJO' | 'MEDIO' | 'ALTO';
  puntaje_fit: number;             // 0-100
  roi: ROIEstimado;
  recomendada: boolean;
  // Extensiones de Agencia y Ventas+
  pilar?: PilarMarketing;
  kpis_reales?: {
    metrica_norte: string;
    benchmark_industria: string;
    frecuencia_revision: string;
  };
  plan_accion_paso_a_paso?: string[];
  unit_economics?: UnitEconomicsVentasPlus;
  script_cierre?: ScriptWhatsAppVentasPlus;
  secuencia_seguimiento?: SecuenciaSeguimientoVentasPlus;
  garantia_irresistible?: string;
  order_bump_sugerido?: string;
}

// ─── Copy ────────────────────────────────────────────────────────────────────

export interface CopyEstrategia {
  tipo: TipoEstrategia;
  headline: string;
  subtitulo: string;
  propuesta_valor: string;
  cta: string;
  copy_facebook: string;
  copy_instagram: string;
  copy_whatsapp: string;
  hashtags: string[];
  es_mock: boolean;
}

// ─── Calendario semanal (2 semanas) ──────────────────────────────────────────

export type DiaSemanaLabel = 'lunes' | 'martes' | 'miércoles' | 'jueves' | 'viernes' | 'sábado' | 'domingo';

export interface VideoScript {
  hook: string;   // 0-3s
  valor: string;  // 10-20s
  cta: string;    // 3-5s
}

export interface PublicacionDiaria {
  hora: string;
  plataforma: string;
  tipo_contenido: string;
  idea: string;
  copy: string;
  hashtags: string[];
  video_script?: VideoScript;
  prompt_visual: string;
  // Extensiones de Agencia
  pilar?: PilarMarketing;
  hook_3_segundos?: {
    visual: string;
    verbal: string;
  };
  desarrollo_escenas?: string[];
  cta_cierre?: string;
  // Legacy fields (kept for backward compat with old analyses)
  copy_facebook?: string;
  copy_instagram?: string;
  copy_whatsapp?: string;
}

export interface DiaCalendario {
  dia: DiaSemanaLabel;
  evento_estacional?: string | null;
  publicaciones: PublicacionDiaria[];
  sugerencia_engagement: string;
}

/** Global = formatos globales; Nacional = país del análisis; Sector = giro/categoría del negocio. */
export type AmbitoTendencia = 'Global' | 'Nacional' | 'Sector';

/**
 * Tendencia viral del calendario.
 *
 * Los 5 primeros campos son el formato original y siguen siendo obligatorios.
 * El resto lo añade el generador ampliado (calendarioService.ts) para alimentar
 * la sección "Inteligencia de Tendencias Virales" del front, y es OPCIONAL a
 * propósito: los análisis guardados antes de esta ampliación no lo traen y el
 * componente hace fallback (`nombre ?? tendencia`, `viralidad ?? score / 10`).
 */
export interface TendenciaSocial {
  plataforma: string;
  tendencia: string;
  score: number;             // 0-100
  hashtags: string[];
  justificacion: string;
  nombre?: string;
  plataformas?: string[];
  ambito?: AmbitoTendencia;
  /** 'YYYY-MM-DD' solo si la tendencia está atada a una fecha comercial. */
  fecha?: string | null;
  viralidad?: number;        // 0-10
  engagement?: string;
  views?: string;
  descripcion?: string;
  gancho?: string;
  formato?: string;
  cta?: string;
}

/**
 * Plataforma que la cuenta NO seleccionó pero donde vive señal aprovechable.
 *
 * Las tendencias que solo existen en redes ajenas al plan del usuario no se
 * descartan (perder señal es peor que mostrarla fuera de sitio): se reubican
 * aquí con las tendencias que las justifican, mientras el calendario y la
 * sección de tendencias se quedan solo con plataformas ejecutables.
 */
export interface RecomendacionPlataforma {
  plataforma: string;
  /** Score (0-100) de la tendencia más fuerte que la sustenta. */
  score: number;
  motivo: string;
  tendencias: TendenciaSocial[];
}

export interface SemanaCalendario {
  numero: 1 | 2;
  dias: DiaCalendario[];
}

export interface CalendarioSemanalMarketing {
  estrategia_tipo: TipoEstrategia;
  tendencias: TendenciaSocial[];
  semanas: SemanaCalendario[];
  sugerencia_visual_campana?: string;
  /**
   * Plataformas fuera de <plataformas_activas> con tendencias relevantes.
   * Es un campo DERIVADO de `tendencias`, así que se recorta junto a ellas
   * (redactAnalisis.ts). Opcional: los análisis anteriores no lo traen.
   */
  recomendacion_plataforma?: RecomendacionPlataforma[];
  /**
   * Secciones que NO se generaron por el plan de la cuenta, persistidas junto
   * al resultado para que la respuesta sea reproducible aunque el plan cambie
   * después. Su ausencia identifica análisis anteriores al gate.
   */
  secciones_bloqueadas?: string[];
  // Legacy field
  fases?: unknown[];
}

// ─── Examinador de Estadísticas Pasadas (Reporte Ads) ───────────────────────

export type FuenteReporteAds = 'google_ads' | 'meta' | 'tiktok' | 'linkedin' | 'generico';

export interface AlertaReporteAds {
  tipo: 'gasto_sin_conversion' | 'ctr_bajo' | 'cpa_alto' | 'concentracion_gasto' | 'anomalia';
  nivel: 'warning' | 'danger' | 'info';
  titulo: string;
  descripcion: string;
  campana?: string;
}

export interface CampanaAgregada {
  nombre: string;
  gasto: number;
  impresiones: number;
  clics: number;
  conversiones: number;
  ingresos?: number;
  ctr: number; // % (clics / impresiones * 100)
  cpc: number; // gasto / clics
  cpa: number; // gasto / conversiones
  roas?: number; // ingresos / gasto
}

export interface TotalesReporteAds {
  gasto_total: number;
  impresiones_total: number;
  clics_total: number;
  conversiones_total: number;
  ingresos_total?: number;
  ctr_promedio: number; // %
  cpc_promedio: number;
  cpa_promedio: number;
  roas_promedio?: number;
}

export interface RecomendacionPriorizada {
  titulo: string;
  accion: string;
  impacto_estimado: 'ALTO' | 'MEDIO' | 'BAJO';
  canal_sugerido?: string;
}

export interface DiagnosticoIAReporteAds {
  resumen_ejecutivo: string;
  puntos_fuertes: string[];
  fugas_presupuesto: string[];
  recomendaciones_priorizadas: RecomendacionPriorizada[];
}

export interface ResumenAgregadoReporteAds {
  fuente: FuenteReporteAds;
  rango_fechas?: { inicio?: string; fin?: string };
  totales: TotalesReporteAds;
  campanas: CampanaAgregada[];
  alertas: AlertaReporteAds[];
}

export interface ReporteAdsProcesado extends ResumenAgregadoReporteAds {
  diagnostico_ia: DiagnosticoIAReporteAds;
}