// ─── Input del análisis ───────────────────────────────────────────────────────

export interface VentasAnalisisInput {
  tipo_venta: 'B2C_directo' | 'B2B' | 'hibrido' | 'servicios';
  canal_principal: 'directo' | 'marketplace' | 'redes_sociales' | 'telefono' | 'combinado';
  ticket_promedio: number;
  tamano_equipo: 'solo_tu' | '1_2_personas' | '3_mas_personas';
  objetivo_ventas?: string;
  /**
   * Contexto del producto para personalizar la generación. Lo rellena el
   * orquestador desde la entidad Producto (no el payload de la cola), así el
   * análisis usa el estado actual del producto.
   */
  pais?: string;
  nombre_producto?: string;
  categoria?: string;
  precio?: number;
  /** Descripción del producto, recortada antes de entrar al prompt. */
  descripcion?: string;
  /**
   * Señal de que el producto tiene vídeo cargado. NO es el contenido del
   * vídeo: el modelo no puede verlo, solo saber que existe como activo de
   * venta. Para usar el contenido haría falta transcribirlo.
   */
  tiene_video?: boolean;
}

// ─── Tip de emprendedor / negociación ────────────────────────────────────────

export interface TipNegociacion {
  titulo: string;
  descripcion: string;
  ejemplo_practico: string;
  error_comun: string;
}

// ─── Historia diaria de emprendedor ("la noticia del día") ───────────────────

export interface HistoriaEmprendedor {
  nombre: string;
  industria: string;
  pais: string;
  /** Cómo pasó de cero a donde está (pasos concretos). */
  como_lo_logro: string;
  mentalidad_clave: string;
  obstaculo_principal: string;
  estrategia_marketing: string;
  metricas: string;
  /** Lección accionable de 1-2 frases para el negocio del usuario. */
  leccion_aplicable: string;
  /** Fecha ISO (YYYY-MM-DD) para la que fue generada la historia. */
  fecha: string;
}

// ─── Por qué los emprendimientos fallan ─────────────────────────────────────

export interface RazonFracaso {
  titulo: string;
  descripcion: string;
  senales_alerta: string[];
  como_evitarlo: string;
}

export interface PorqueFallan {
  patron_comun: string;
  razones: RazonFracaso[];
}

// ─── Perfil del Cliente Ideal (ICP) ─────────────────────────────────────────

export interface PerfilClienteIdeal {
  /** Segmento demográfico principal */
  demograficos: {
    edad_rango: string;         // ej. "28-42 años"
    genero_predominante: string;
    nivel_socioeconomico: string; // ej. "C+, C"
    ubicacion_tipica: string;
  };
  /** Quién es psicológicamente */
  psicografia: {
    miedos_principales: string[];    // top 3
    deseos_clave: string[];          // top 3
    objeciones_tipicas: string[];    // top 3
    valores_compra: string[];        // qué prioriza al decidir
  };
  /** Dónde vive digitalmente */
  canales_preferidos: string[];      // Instagram, WhatsApp, TikTok…
  /** Qué dispara la compra y qué la frena */
  disparadores_compra: string[];
  frenos_compra: string[];
  /** Cómo habla el cliente (para copies) */
  lenguaje_tipico: string;           // frase representativa en su voz
  /** Qué busca en Google/redes cuando tiene el problema */
  queries_tipicas: string[];
  /** Score de alineación producto ↔ ICP (0-100) */
  score_afinidad: number;
  score_razon: string;               // 1-2 frases explicando el score
}

// ─── Rebatidas de objeciones (derivadas del ICP) ─────────────────────────────

export interface RebatidaObjecion {
  objecion: string;
  rebatida: string;
}

export interface RebatidasObjeciones {
  rebatidas: RebatidaObjecion[];
}

// ─── Secuencia de seguimiento ─────────────────────────────────────────────────

export interface FollowUpMensaje {
  momento: string;
  mensaje: string;
}

// ─── Palabras clave para ads (derivadas del ICP) ─────────────────────────────

export interface PalabrasClaveAds {
  keywords_busqueda: string[];
  intereses_meta: string[];
}

// ─── Evaluador de Guiones / CTAs ─────────────────────────────────────────────

export interface MetricaGuion {
  nombre: string;
  score: number;    // 0-100
  explicacion: string;
  mejora: string;   // acción concreta
}

export interface EvaluacionGuion {
  score_general: number;             // 0-100
  resumen: string;                   // 1-2 frases del diagnóstico global
  metricas: MetricaGuion[];          // gancho, CTA, ICP, objeciones
  puntos_fuertes: string[];          // qué está bien
  puntos_debiles: string[];          // qué mejorar
  version_mejorada: string;          // rewrite completo del guion
  fecha_evaluacion: string;          // ISO 8601
  /** Solo presente cuando se evaluó un vídeo con visión (Claude Fable). */
  metricas_visuales?: MetricaGuion[];
}

// ─── Competidor / Referente ───────────────────────────────────────────────────

export interface AnalisisCompetidor {
  nombre: string;
  hook_primeros_segundos: string;    // qué dice/muestra en los primeros 3-5s (o impacto visual inicial, si es foto)
  propuesta_valor: string;           // qué promete
  tono: string;                      // cercano, aspiracional, urgente…
  puntos_fuertes: string[];
  puntos_debiles: string[];
  estructura_contenido: string;      // cómo está armado: problema→solución→CTA
  cta_usado: string;
  /** true si no hubo contenido real (video/foto/transcripción) y el análisis corrió sobre un placeholder genérico. */
  transcripcion_degradada?: boolean;
  /** Redes sociales del competidor, texto libre proporcionado por el usuario — solo referencia, nunca se visita. */
  redes_sociales?: string;
  /** Página web del competidor, texto libre proporcionado por el usuario — solo referencia, nunca se visita. */
  pagina_web?: string;
  /** Qué disparó el análisis: contenido real subido o solo texto/nombre. */
  origen?: 'video' | 'foto' | 'texto';
}

/** Datos de referencia del competidor que el usuario puede aportar sin subir archivo. Nunca se visitan ni se hace scraping. */
export interface CompetidorContexto {
  redes_sociales?: string;
  pagina_web?: string;
}

/** Imagen lista para mandar a Claude como bloque de visión (base64 + su media type real). */
export interface ImagenParaAnalisis {
  base64: string;
  media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface ComparativaCompetidores {
  mi_producto: {
    nombre: string;
    fortalezas_vs_competencia: string[];
    gaps_detectados: string[];        // dónde pierdo vs. ellos
    oportunidades: string[];          // qué nadie está haciendo bien
  };
  competidores: AnalisisCompetidor[];
  recomendacion_diferenciacion: string; // qué ángulo tomar
  tabla_comparativa: Record<string, string>[]; // filas de la tabla
}

// ─── Resultado persistido en la fila ────────────────────────────────────────

export interface ResultadoVentas {
  tips_negociacion: TipNegociacion[];
  historia_diaria: HistoriaEmprendedor | null;
  porque_fallan: PorqueFallan | null;
  perfil_cliente: PerfilClienteIdeal | null;
  secciones_bloqueadas: string[];
}
