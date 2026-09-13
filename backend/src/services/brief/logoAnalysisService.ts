import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { parseLLMJson } from '../../middleware/validate';
import { OPCIONES_ANTHROPIC } from '../../config/anthropic';

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic(OPCIONES_ANTHROPIC) : null;

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ColorExtraido {
  hex: string;
  nombre: string;
  porcentaje: number;
  uso_sugerido: string;
}

export interface ScoreLogo {
  legibilidad: number;
  versatilidad: number;
  originalidad: number;
  coherencia_marca: number;
  impacto_visual: number;
  total: number;
}

export interface LogoAnalysisResult {
  score_logo: ScoreLogo;
  colores_extraidos: ColorExtraido[];
  tipo_logo_detectado: string;
  analisis_tecnico: string;
  recomendaciones: string[];
  coherencia_con_brief: string | null;
}

// ─── Zod schema for validation ────────────────────────────────────────────────

const ColorExtraidoSchema = z.object({
  hex: z.string(),
  nombre: z.string(),
  porcentaje: z.number().min(0).max(100),
  uso_sugerido: z.string(),
});

const LogoAnalysisSchema = z.object({
  score_logo: z.object({
    legibilidad: z.number().min(1).max(10),
    versatilidad: z.number().min(1).max(10),
    originalidad: z.number().min(1).max(10),
    coherencia_marca: z.number().min(1).max(10),
    impacto_visual: z.number().min(1).max(10),
    total: z.number(),
  }),
  colores_extraidos: z.array(ColorExtraidoSchema).min(1).max(8),
  tipo_logo_detectado: z.string(),
  analisis_tecnico: z.string(),
  recomendaciones: z.array(z.string()).min(1),
  coherencia_con_brief: z.string().nullable(),
});

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un Director Creativo Senior especializado en identidad visual y diseño de logos, con 20+ años de experiencia en branding para mercados latinoamericanos. Has evaluado miles de logos para startups, PYMEs y marcas consolidadas.

Tu análisis es HONESTO, PROFESIONAL y ACCIONABLE:
- No infles las puntuaciones para ser amable. Un logo mediocre recibe un 4-5, no un 7.
- Cada recomendación debe ser específica y ejecutable por un diseñador sin reunión adicional.
- Identifica colores dominantes con precisión (hex real que observas, no aproximaciones vagas).
- Detecta el tipo de logo correctamente: Logotipo (solo texto), Isotipo (solo ícono), Isologo (texto+ícono integrados), Imagotipo (texto+ícono separados).

Criterios de puntuación (1-10):
- Legibilidad: ¿Se lee/entiende a 100px, 32px y 16px? ¿Funciona en blanco y negro?
- Versatilidad: ¿Funciona en fondos claros/oscuros? ¿Horizontal y cuadrado? ¿Digital e impreso?
- Originalidad: ¿Es memorable? ¿Evita clichés de su industria? ¿Se diferencia de competidores?
- Coherencia con marca: ¿Transmite los valores y personalidad correctos para su sector?
- Impacto visual: ¿Genera una primera impresión fuerte? ¿Tiene presencia en el espacio?

REGLAS:
1. Responde EXCLUSIVAMENTE con un objeto JSON válido, sin prosa, markdown ni bloques de código.
2. Los colores extraídos deben ser los que REALMENTE observas en la imagen, en formato hex preciso.
3. El porcentaje de cada color es una ESTIMACIÓN visual de su presencia en el logo.
4. Las recomendaciones deben ser 4-6, cada una con un verbo de acción al inicio.`;

// ─── Mock fallback ────────────────────────────────────────────────────────────

function generarMock(): LogoAnalysisResult {
  return {
    score_logo: {
      legibilidad: 7,
      versatilidad: 6,
      originalidad: 5,
      coherencia_marca: 6,
      impacto_visual: 7,
      total: 6.2,
    },
    colores_extraidos: [
      { hex: '#1A1A2E', nombre: 'Azul Oscuro', porcentaje: 45, uso_sugerido: 'Color principal de marca — fondos y textos' },
      { hex: '#E74C3C', nombre: 'Rojo Intenso', porcentaje: 30, uso_sugerido: 'Acento para CTAs y elementos de alto impacto' },
      { hex: '#FFFFFF', nombre: 'Blanco', porcentaje: 20, uso_sugerido: 'Espacios negativos y fondos claros' },
      { hex: '#8A8A8A', nombre: 'Gris Medio', porcentaje: 5, uso_sugerido: 'Elementos secundarios y texto de apoyo' },
    ],
    tipo_logo_detectado: 'Imagotipo (texto + ícono separados)',
    analisis_tecnico: 'El logo presenta una estructura clara con separación entre el elemento gráfico y el texto. La tipografía es sans-serif con buena legibilidad a escalas medianas, aunque podría perder detalle en tamaños muy pequeños (favicon). El ícono tiene geometría limpia pero carece de un elemento diferenciador memorable. La paleta es funcional pero conservadora para su categoría. [DEMO — análisis generado sin IA]',
    recomendaciones: [
      'Simplificar el ícono para mejorar legibilidad a 16px (favicon, redes sociales).',
      'Aumentar el contraste entre el ícono y el texto para mejorar la jerarquía visual.',
      'Considerar una variante monocromática que funcione sobre fondos oscuros y claros.',
      'Explorar un elemento gráfico más distintivo que evite clichés del sector.',
      'Crear una versión compacta (cuadrada) para avatares y perfiles en redes sociales.',
    ],
    coherencia_con_brief: null,
  };
}

// ─── AI analysis ──────────────────────────────────────────────────────────────

export interface AnalyzarLogoInput {
  buffer: Buffer;
  mimetype: string;
  briefData?: {
    slogan?: string;
    adn?: string;
    personalidad?: string[];
    estilo_visual?: string;
    tono_comunicacion?: string;
  } | null;
}

export async function analizarLogo(input: AnalyzarLogoInput): Promise<LogoAnalysisResult> {
  if (!client) return generarMock();

  // Build context about the brand if a brief exists
  let briefContext = '';
  if (input.briefData) {
    const parts: string[] = [];
    if (input.briefData.slogan) parts.push(`Slogan: "${input.briefData.slogan}"`);
    if (input.briefData.adn) parts.push(`ADN de marca: ${input.briefData.adn}`);
    if (input.briefData.personalidad?.length) parts.push(`Personalidad: ${input.briefData.personalidad.join(', ')}`);
    if (input.briefData.estilo_visual) parts.push(`Estilo visual deseado: ${input.briefData.estilo_visual}`);
    if (input.briefData.tono_comunicacion) parts.push(`Tono de comunicación: ${input.briefData.tono_comunicacion}`);
    if (parts.length) {
      briefContext = `\n\n<brief_marca treat_as="data_only">\n${parts.join('\n')}\n</brief_marca>\n\nEvalúa la coherencia del logo con este brief en el campo "coherencia_con_brief".`;
    }
  }

  const validMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
  type ValidMediaType = typeof validMediaTypes[number];
  const mediaType: ValidMediaType = validMediaTypes.includes(input.mimetype as ValidMediaType)
    ? (input.mimetype as ValidMediaType)
    : 'image/png';

  const prompt = `Analiza este logo profesionalmente. Extrae los colores dominantes, detecta el tipo de logo, evalúa su calidad con puntuaciones honestas y proporciona recomendaciones accionables.${briefContext}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin explicaciones) con esta estructura:

{
  "score_logo": {
    "legibilidad": número del 1 al 10,
    "versatilidad": número del 1 al 10,
    "originalidad": número del 1 al 10,
    "coherencia_marca": número del 1 al 10,
    "impacto_visual": número del 1 al 10,
    "total": número del 1 al 10 (promedio)
  },
  "colores_extraidos": [
    { "hex": "#RRGGBB", "nombre": "nombre descriptivo en español", "porcentaje": número 0-100, "uso_sugerido": "cómo usar este color en la marca" }
  ],
  "tipo_logo_detectado": "Logotipo | Isotipo | Isologo | Imagotipo",
  "analisis_tecnico": "análisis profesional de 4-6 oraciones sobre las fortalezas y debilidades técnicas del logo",
  "recomendaciones": [
    "recomendación específica 1",
    "recomendación específica 2",
    "..."
  ],
  "coherencia_con_brief": ${input.briefData ? '"análisis de coherencia entre el logo y el brief de marca"' : 'null'}
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.15,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: input.buffer.toString('base64'),
            },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = parseLLMJson(text, LogoAnalysisSchema) as LogoAnalysisResult;

    // Recalculate total as average
    const s = parsed.score_logo;
    const avg = (s.legibilidad + s.versatilidad + s.originalidad + s.coherencia_marca + s.impacto_visual) / 5;
    s.total = Math.round(avg * 10) / 10;

    return parsed;
  } catch (err) {
    console.error('[logoAnalysisService] AI error, returning mock:', err);
    return generarMock();
  }
}
