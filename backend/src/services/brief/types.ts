// ─── Input ───────────────────────────────────────────────────────────────────

export interface BriefAnalisisInput {
  productoId: string;
  usuarioId: string;
  trabajadorId?: string; // id del trabajador que disparó el análisis (si aplica)
  // Bloque 2: Percepción
  percepcion: string[];            // max 2: 'Moderno','Clásico','Minimalista','Lujoso','Divertido','Confiable','Atrevido','Natural'
  emocion: string;                 // 'Confianza','Aspiración','Pertenencia','Urgencia','Nostalgia','Sorpresa','Seguridad','Alegría'
  anti_valores: string[];          // max 2: same palette as percepcion (what to avoid)
  // Bloque 3: Dirección visual
  estilo_visual: string;           // 'Minimalista','Bold/Impactante','Orgánico/Natural','Futurista/Tech','Artesanal/Handmade','Elegante/Lujo'
  paleta_elegida: 'A' | 'B' | 'C';
  tipo_logo: string;               // 'Logotipo (solo texto)','Isotipo (solo ícono)','Isologo (texto+ícono juntos)','Imagotipo (texto+ícono separados)'
  simbolo_representativo: string;  // free text: qué objeto/animal/elemento representa la marca
  // Bloque 4: Mensaje y tono
  resultado_cliente: string;       // free text: qué obtiene/siente el cliente al comprar
  tono_comunicacion: string;       // 'Profesional y serio','Cercano y cálido','Divertido e irreverente','Inspirador y aspiracional','Directo y al grano'
  // Bloque 5: Posicionamiento
  posicionamiento: string;         // 'Líder de precio (más barato)','Calidad premium (mejor calidad)','Especialista (nicho específico)','Innovador (primero en su tipo)','Confiable (el de siempre)'
  // Bloque 6: Diferenciación
  nivel_diferenciacion: string;    // 'Bajo (similar a competencia)','Medio (algunas diferencias)','Alto (claramente distinto)','Único (sin comparación directa)'
}

// ─── Paletas predefinidas ─────────────────────────────────────────────────────

export interface ColorToken {
  nombre: string;
  hex: string;
  uso: string;
}

export interface PaletaColores {
  primario: ColorToken;
  secundario: ColorToken;
  acento: ColorToken;
  neutro: ColorToken;
}

// ─── Output (resultado_data stored as jsonb) ──────────────────────────────────

export interface ScoreMarca {
  coherencia: number;       // /10
  diferenciacion: number;   // /10
  claridad: number;         // /10
  impacto_visual: number;   // /10
  total: number;            // /10
}

export interface BriefIdentidad {
  adn: string;
  diferenciador_clave: string;
  personalidad: string[];
  voz_marca: string;
  slogan_principal: string;
  slogans_alternativos: string[];
}

export interface IdentidadVisual {
  paleta: PaletaColores;
  tipografias: {
    principal: string;
    secundaria: string;
  };
  concepto_logo: string;
  descripcion_isotipo: string;
  estilo_grafico: string;
}

export interface BriefResultado {
  brief_identidad: BriefIdentidad;
  identidad_visual: IdentidadVisual;
  diagnostico_estrategico: string;
  score_marca: ScoreMarca;
  instrucciones_disenador: string[];
  resumen_tweet: string;
  es_mock: boolean;
}
