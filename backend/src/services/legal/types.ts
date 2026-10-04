import type { SeccionExtraResultado, TransparenciaIA } from '../ia/contratoComun';
import type { VersionUsada } from '../ia/componerSistema';

// ─── Inputs ────────────────────────────────────────────────────────────────

export interface LegalAnalisisInput {
  productoId: string;
  usuarioId: string;
  trabajadorId?: string;
  forma_juridica: string;
  tiene_empleados: boolean;
  numero_empleados?: number;
  vende_en_linea: boolean;
  exporta_importa: boolean;
  giro_especifico?: string;
  estado_constitucion?: string;
  anios_operando?: string; // '0' | '1-2' | '3-5' | '+5'
}

// ─── Permisos y Licencias ──────────────────────────────────────────────────

/** Obligación (la norma lo exige), condicionada (aplica si…) o recomendación (protege, no es exigible). */
export type NaturalezaObligacion = 'obligacion' | 'condicionada' | 'recomendacion';

export interface PermisoCumplimiento {
  nombre: string;            // "Registro en REPUVE"
  autoridad: string;         // "SEGOB / AMDA"
  descripcion: string;
  obligatorio: boolean;
  naturaleza?: NaturalezaObligacion; // desde legal@2

  nivel_riesgo: 'bajo' | 'medio' | 'alto';
  plazo_tramite: string;     // "15-30 días hábiles"
  costo_estimado: string;    // "Gratuito" | "$2,000 MXN aprox."
  url_tramite: string;       // URL portal oficial (puede ser #no-aplica si no existe)
}

// ─── Obligaciones Fiscales ─────────────────────────────────────────────────

export interface ObligacionFiscal {
  nombre: string;            // "Alta en el RFC como PFAE"
  regimen_fiscal: string;    // "Régimen Simplificado de Confianza (RESICO)"
  periodicidad: string;      // "Mensual / Anual"
  descripcion: string;
  naturaleza?: NaturalezaObligacion; // desde legal@2
  nivel_riesgo: 'bajo' | 'medio' | 'alto';
  aplica_si: string;         // "Ingresos > $3.5M MXN anuales" | "Siempre"
}

// ─── Alertas ──────────────────────────────────────────────────────────────

export interface AlertaLegal {
  nivel: 'verde' | 'amarillo' | 'rojo';
  titulo: string;
  descripcion: string;
  accion_recomendada: string;
}

// ─── Checklist ────────────────────────────────────────────────────────────

export interface ChecklistItem {
  categoria: 'permiso' | 'fiscal' | 'laboral' | 'otro';
  texto: string;
  prioridad: 'alta' | 'media' | 'baja';
}

// ─── Resultado completo ────────────────────────────────────────────────────

export interface LegalResultado {
  giro_detectado: string;          // "Comercio de vehículos usados"
  pais_analizado: string;          // "México (MX)"
  entidad_fiscal: string;          // "SAT — Servicio de Administración Tributaria"
  fecha_generacion: string;        // ISO 8601

  // Semáforo global de cumplimiento
  cumplimiento_global: 'verde' | 'amarillo' | 'rojo';
  puntaje_cumplimiento: number;    // 0-100

  // Resumen ejecutivo
  resumen_ejecutivo: string;

  // Secciones principales
  permisos_licencias: PermisoCumplimiento[];
  obligaciones_fiscales: ObligacionFiscal[];
  obligaciones_laborales: ObligacionFiscal[];  // IMSS, INFONAVIT, etc. (solo si tiene_empleados)
  regulacion_digital: ObligacionFiscal[];      // LFPDPPP, comercio electrónico (solo si vende_en_linea)
  regulacion_comercio_exterior: ObligacionFiscal[]; // Aduanas, SENASICA, etc. (solo si exporta_importa)

  alertas: AlertaLegal[];
  checklist: ChecklistItem[];

  // Recursos
  disclaimer: string;
  fuentes_recomendadas: { nombre: string; url: string }[];

  // Desde legal@2 (opcionales: los análisis antiguos no los tienen)
  transparencia?: TransparenciaIA;
  secciones_extra?: SeccionExtraResultado[];
  /** Claves de secciones nativas que el admin ocultó en la versión usada. */
  secciones_ocultas?: string[];
  meta?: MetaAnalisisIA;
}

/** Con qué se hizo el análisis: contrato, origen, versiones de prompt y datos disponibles. */
export interface MetaAnalisisIA {
  contrato: string;
  origen: 'ia' | 'plantilla';
  versiones_prompt: Record<string, VersionUsada>;
  contexto_usado: {
    pais_con_ficha: boolean;
    perfil_respondido: string[];
    perfil_sin_responder: string[];
    /** Cifras legales de la IA que no salen de la ficha ni de los datos (análisis anteriores: ausente). */
    cifras_sin_respaldo?: string[];
  };
}
