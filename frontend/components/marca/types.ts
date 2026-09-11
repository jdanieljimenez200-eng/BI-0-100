'use client';

// ─── Shared types for Kit de Marca ────────────────────────────────────────────

export interface ColorToken { nombre: string; hex: string; uso: string }

export interface BriefResultado {
  brief_identidad: {
    adn: string; diferenciador_clave: string; personalidad: string[];
    voz_marca: string; slogan_principal: string; slogans_alternativos: string[];
  };
  identidad_visual: {
    paleta: { primario: ColorToken; secundario: ColorToken; acento: ColorToken; neutro: ColorToken };
    tipografias: { principal: string; secundaria: string };
    concepto_logo: string; descripcion_isotipo: string; estilo_grafico: string;
  };
  diagnostico_estrategico: string;
  score_marca: { coherencia: number; diferenciacion: number; claridad: number; impacto_visual: number; total: number };
  instrucciones_disenador: string[];
  resumen_tweet: string;
  es_mock: boolean;
}

export interface ColorExtraido {
  hex: string;
  nombre: string;
  porcentaje: number;
  uso_sugerido: string;
}

export interface LogoAnalysisResult {
  score_logo: {
    legibilidad: number;
    versatilidad: number;
    originalidad: number;
    coherencia_marca: number;
    impacto_visual: number;
    total: number;
  };
  colores_extraidos: ColorExtraido[];
  tipo_logo_detectado: string;
  analisis_tecnico: string;
  recomendaciones: string[];
  coherencia_con_brief: string | null;
}

export interface AnalisisBriefPoll {
  id: string;
  estado_analisis: 'procesando' | 'completado' | 'error';
  resultado_data: BriefResultado | null;
  error_mensaje: string | null;
  fecha_completado: string | null;
}

/**
 * Respuesta de GET /api/brief/:id/status. El backend usa el contrato corto
 * uniforme de los 6 módulos: { id, estado, error } — NO la entidad completa.
 * `estado_analisis` / `error_mensaje` se declaran opcionales solo como alias
 * legado para filas o despliegues antiguos.
 */
export interface AnalisisBriefStatus {
  id: string;
  estado?: 'procesando' | 'completado' | 'error';
  error?: string | null;
  estado_analisis?: 'procesando' | 'completado' | 'error';
  error_mensaje?: string | null;
}

export interface MarcaGuardada {
  id: string; nombre: string; slogan: string | null;
  paleta_colores: ColorToken[] | null; tipografia: string | null;
  brief_data: BriefResultado | null;
  logo_url: string | null;
  logo_analysis: LogoAnalysisResult | null;
  producto_id: string | null;
}

export interface Producto {
  id: string; nombre: string; categoria: string;
  descripcion: string | null; imagen_url: string | null;
}

export interface FormState {
  percepcion: string[]; emocion: string; anti_valores: string[];
  estilo_visual: string; paleta_elegida: 'A' | 'B' | 'C' | '';
  tipo_logo: string; simbolo_representativo: string;
  resultado_cliente: string; tono_comunicacion: string;
  posicionamiento: string; nivel_diferenciacion: string;
  percepcion_custom: string; emocion_custom: string;
  anti_valores_custom: string; estilo_visual_custom: string;
  tipo_logo_custom: string; tono_comunicacion_custom: string;
}

export type Step = 'select' | 'form' | 'polling' | 'result';

export const PERCEPCIONES  = ['Moderno','Clásico','Minimalista','Lujoso','Divertido','Confiable','Atrevido','Natural'];
export const EMOCIONES     = ['Confianza','Aspiración','Pertenencia','Urgencia','Nostalgia','Sorpresa','Seguridad','Alegría'];
export const ESTILOS       = ['Minimalista','Bold/Impactante','Orgánico/Natural','Futurista/Tech','Artesanal/Handmade','Elegante/Lujo'];
export const TIPOS_LOGO    = [
  { value:'Logotipo (solo texto)',            label:'Logotipo',   desc:'Solo tipografía' },
  { value:'Isotipo (solo ícono)',             label:'Isotipo',    desc:'Solo ícono/símbolo' },
  { value:'Isologo (texto+ícono juntos)',     label:'Isologo',    desc:'Texto + ícono integrados' },
  { value:'Imagotipo (texto+ícono separados)',label:'Imagotipo',  desc:'Texto + ícono independientes' },
];
export const TONOS = ['Profesional y serio','Cercano y cálido','Divertido e irreverente','Inspirador y aspiracional','Directo y al grano'];
export const POSICIONAMIENTOS = [
  { value:'Líder de precio (más barato)',      label:'Líder de precio',  desc:'La opción más accesible' },
  { value:'Calidad premium (mejor calidad)',   label:'Calidad premium',  desc:'La mejor experiencia' },
  { value:'Especialista (nicho específico)',   label:'Especialista',     desc:'Experto en un segmento' },
  { value:'Innovador (primero en su tipo)',    label:'Innovador',        desc:'Categoría nueva' },
  { value:'Confiable (el de siempre)',         label:'Confiable',        desc:'La marca de siempre' },
];
export const DIFERENCIACIONES = [
  { value:'Bajo (similar a competencia)',      label:'Bajo',   desc:'Similar a lo que existe' },
  { value:'Medio (algunas diferencias)',       label:'Medio',  desc:'Diferencias perceptibles' },
  { value:'Alto (claramente distinto)',        label:'Alto',   desc:'Claramente distinto' },
  { value:'Único (sin comparación directa)',   label:'Único',  desc:'Sin comparación directa' },
];

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace('/api', '');
export const FORM_EMPTY: FormState = {
  percepcion:[], emocion:'', anti_valores:[],
  estilo_visual:'', paleta_elegida:'', tipo_logo:'',
  simbolo_representativo:'', resultado_cliente:'',
  tono_comunicacion:'', posicionamiento:'', nivel_diferenciacion:'',
  percepcion_custom:'', emocion_custom:'', anti_valores_custom:'',
  estilo_visual_custom:'', tipo_logo_custom:'', tono_comunicacion_custom:'',
};

// ─── WCAG contrast helpers ────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(...hexToRgb(hex1));
  const l2 = relativeLuminance(...hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagLevel(ratio: number): 'AAA' | 'AA' | 'Fail' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'Fail';
}

// ─── Style constants ──────────────────────────────────────────────────────────

export const fieldCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#8B5CF6]/50 focus:bg-[#8B5CF6]/5 transition-all duration-200';
export const card = 'rounded-2xl border border-white/[0.06] p-5';
export const cardBg = { background: '#0A1520', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' };

// ─── Score recommendations ────────────────────────────────────────────────────

export const SCORE_TIPS: Record<string, string> = {
  coherencia: 'Revisa que el tono de comunicación, la paleta y el tipo de logo cuenten la misma historia.',
  diferenciacion: 'Ajusta el posicionamiento para distanciarte más de la competencia directa.',
  claridad: 'Simplifica el slogan y asegura que el ADN de marca sea entendible en una oración.',
  impacto_visual: 'Considera una paleta con más contraste y un estilo gráfico más llamativo.',
};
