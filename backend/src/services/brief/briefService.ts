import { Producto } from '../../models/Producto';
import { BriefAnalisisInput, BriefResultado, PaletaColores } from './types';
import { obtenerPaleta } from './paletasService';
import { sanitizeForLLM, sanitizeArrayForLLM } from '../../utils/sanitizeForLLM';
import { parseLLMJson } from '../../middleware/validate';
import { logger } from '../../utils/logger';
import { z } from 'zod';
import { crearMensaje, hayClaveAnthropic, textoDe } from '../../config/anthropic';
import { registrarFallbackIA } from '../../utils/seguimientoIA';

const BriefSchema = z.object({
  brief_identidad: z.object({
    adn: z.string().min(5),
    diferenciador_clave: z.string().min(5),
    personalidad: z.array(z.string()).min(1),
    voz_marca: z.string().min(5),
    slogan_principal: z.string().min(3),
    slogans_alternativos: z.array(z.string()).min(1),
  }),
  identidad_visual: z.object({
    tipografias: z.object({
      principal: z.string().min(2),
      secundaria: z.string().min(2),
    }),
    concepto_logo: z.string().min(5),
    descripcion_isotipo: z.string().min(5),
    estilo_grafico: z.string().min(5),
  }),
  diagnostico_estrategico: z.string().min(10),
  score_marca: z.object({
    coherencia: z.number().min(1).max(10),
    diferenciacion: z.number().min(1).max(10),
    claridad: z.number().min(1).max(10),
    impacto_visual: z.number().min(1).max(10),
    total: z.number().min(1).max(10),
  }),
  instrucciones_disenador: z.array(z.string()).min(1),
  resumen_tweet: z.string().min(5),
});

function getTipografiasDefault(estilo: string): { principal: string; secundaria: string } {
  switch (estilo) {
    case 'Minimalista':
      return { principal: 'Inter', secundaria: 'Space Grotesk' };
    case 'Bold/Impactante':
      return { principal: 'Syne', secundaria: 'Archivo Black' };
    case 'Orgánico/Natural':
      return { principal: 'Playfair Display', secundaria: 'Lato' };
    case 'Futurista/Tech':
      return { principal: 'Orbitron', secundaria: 'Roboto Mono' };
    case 'Artesanal/Handmade':
      return { principal: 'Cormorant Garamond', secundaria: 'Montserrat' };
    case 'Elegante/Lujo':
      return { principal: 'Cinzel', secundaria: 'Montserrat' };
    default:
      return { principal: 'Inter', secundaria: 'Roboto' };
  }
}

function generarBriefFallback(
  producto: Producto,
  input: BriefAnalisisInput,
  paleta: PaletaColores
): BriefResultado {
  const nombre = producto.nombre || 'Tu Marca';
  const tipografias = getTipografiasDefault(input.estilo_visual);
  const percepciones = input.percepcion?.join(', ') || 'profesional, innovadora';

  return {
    brief_identidad: {
      adn: `${nombre} transforma la experiencia en su categoría mediante una propuesta centrada en ${input.resultado_cliente || 'calidad y confianza'}.`,
      diferenciador_clave: `Enfoque en ${input.posicionamiento || 'especialización'} con una identidad ${percepciones}.`,
      personalidad: [
        ...(input.percepcion || ['Innovadora', 'Confiable']),
        input.emocion || 'Confianza',
      ],
      voz_marca: input.tono_comunicacion || 'Cercana y profesional',
      slogan_principal: `${nombre}: Elevando el estándar de lo que mereces.`,
      slogans_alternativos: [
        `La evolución natural de tu elección con ${nombre}.`,
        `${nombre} — Calidad que se siente desde el primer momento.`,
      ],
    },
    identidad_visual: {
      paleta,
      tipografias,
      concepto_logo: `Identidad basada en ${input.tipo_logo || 'Imagotipo'}, balanceando legibilidad y personalidad de marca.`,
      descripcion_isotipo: input.simbolo_representativo
        ? `Síntesis geométrica moderna inspirada en "${input.simbolo_representativo}".`
        : `Ícono vectorial con líneas limpias que proyectan dinamismo y solidez.`,
      estilo_grafico: `Dirección ${input.estilo_visual || 'Minimalista'} con alto contraste cromático y espacios de respiro amplios.`,
    },
    diagnostico_estrategico: `La marca presenta un posicionamiento sólido orientado a ${input.posicionamiento || 'valor'}. Se recomienda mantener coherencia estricta en el uso de los colores primarios y tono de voz para afianzar el recuerdo en su audiencia objetivo.`,
    score_marca: {
      coherencia: 8.5,
      diferenciacion: 8.0,
      claridad: 9.0,
      impacto_visual: 8.5,
      total: 8.5,
    },
    instrucciones_disenador: [
      `Respetar la paleta de colores oficial (${paleta.primario.hex}, ${paleta.secundario.hex}, ${paleta.acento.hex}).`,
      `Aplicar la tipografía ${tipografias.principal} para titulares y ${tipografias.secundaria} para cuerpo de texto.`,
      `Evitar absolutamente los siguientes anti-valores: ${input.anti_valores?.join(', ') || 'estética recargada, falta de claridad'}.`,
      `Mantener siempre un área de protección mínima de 1x alrededor del logo en todas las aplicaciones digitales e impresas.`,
    ],
    resumen_tweet: `${nombre}: Una marca con ADN ${input.estilo_visual || 'moderno'} que comunica con tono ${input.tono_comunicacion || 'cálido'} y transmite ${input.emocion || 'confianza'}.`,
    es_mock: true,
  };
}

export async function generarBrief(
  producto: Producto,
  input: BriefAnalisisInput
): Promise<BriefResultado> {
  const paleta = obtenerPaleta(input.estilo_visual, input.paleta_elegida || 'A');

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.info('[briefService] Sin ANTHROPIC_API_KEY configurada, usando generador estructurado fallback');
    return generarBriefFallback(producto, input, paleta);
  }

  try {
    const tipografias = getTipografiasDefault(input.estilo_visual);

    const prompt = `Eres un director de branding y estratega de marca senior.
Crea un Brief de Identidad de Marca exhaustivo y profesional en formato JSON para el siguiente producto y parámetros:

Producto:
- Nombre: ${sanitizeForLLM(producto.nombre)}
- Descripción: ${sanitizeForLLM(producto.descripcion || '')}
- Categoría: ${sanitizeForLLM(producto.categoria || '')}

Entrada del Usuario para el Brief:
- Percepciones deseadas: ${sanitizeArrayForLLM(input.percepcion, { maxLen: 200 }).join(', ') || 'N/A'}
- Emoción clave: ${sanitizeForLLM(input.emocion, { maxLen: 200 }) || 'N/A'}
- Anti-valores (lo que la marca NUNCA debe parecer): ${sanitizeArrayForLLM(input.anti_valores, { maxLen: 200 }).join(', ') || 'N/A'}
- Estilo visual seleccionado: ${sanitizeForLLM(input.estilo_visual, { maxLen: 200 }) || 'N/A'}
- Tipo de logo preferido: ${sanitizeForLLM(input.tipo_logo, { maxLen: 200 }) || 'N/A'}
- Símbolo o elemento representativo: ${sanitizeForLLM(input.simbolo_representativo || '')}
- Resultado deseado para el cliente: ${sanitizeForLLM(input.resultado_cliente || '')}
- Tono de comunicación: ${sanitizeForLLM(input.tono_comunicacion, { maxLen: 200 }) || 'N/A'}
- Posicionamiento estratégico: ${sanitizeForLLM(input.posicionamiento, { maxLen: 100 }) || 'N/A'}
- Nivel de diferenciación buscado: ${sanitizeForLLM(input.nivel_diferenciacion, { maxLen: 100 }) || 'N/A'}

Paleta asignada:
- Primario: ${paleta.primario.nombre} (${paleta.primario.hex})
- Secundario: ${paleta.secundario.nombre} (${paleta.secundario.hex})
- Acento: ${paleta.acento.nombre} (${paleta.acento.hex})
- Neutro: ${paleta.neutro.nombre} (${paleta.neutro.hex})

Tipografías sugeridas:
- Principal: ${tipografias.principal}
- Secundaria: ${tipografias.secundaria}

Responde ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
{
  "brief_identidad": {
    "adn": "Declaración contundente del ADN de la marca (2-3 oraciones)",
    "diferenciador_clave": "El factor por el cual el cliente no puede reemplazar a la marca",
    "personalidad": ["Rasgo 1", "Rasgo 2", "Rasgo 3"],
    "voz_marca": "Descripción de cómo habla y se expresa la marca",
    "slogan_principal": "Slogan principal potente y memorable",
    "slogans_alternativos": ["Opción 1", "Opción 2"]
  },
  "identidad_visual": {
    "tipografias": {
      "principal": "${tipografias.principal}",
      "secundaria": "${tipografias.secundaria}"
    },
    "concepto_logo": "Explicación conceptual del logo",
    "descripcion_isotipo": "Descripción detallada de la forma, trazo y significado del ícono o isotipo",
    "estilo_grafico": "Pautas de composición, contrastes y tratamiento de imagen"
  },
  "diagnostico_estrategico": "Diagnóstico y recomendaciones estratégicas de posicionamiento",
  "score_marca": {
    "coherencia": 8.5,
    "diferenciacion": 8.0,
    "claridad": 9.0,
    "impacto_visual": 8.5,
    "total": 8.5
  },
  "instrucciones_disenador": [
    "Instrucción técnica y visual 1",
    "Instrucción técnica y visual 2",
    "Instrucción técnica y visual 3"
  ],
  "resumen_tweet": "Resumen condensado estilo pitch de elevador (< 280 caracteres)"
}`;

    const response = await crearMensaje('brief.identidad', 'estrategia', {
      max_tokens: 2000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = textoDe(response);
    const parsed = parseLLMJson(textContent, BriefSchema);

    return {
      brief_identidad: parsed.brief_identidad,
      identidad_visual: {
        ...parsed.identidad_visual,
        paleta,
      },
      diagnostico_estrategico: parsed.diagnostico_estrategico,
      score_marca: parsed.score_marca,
      instrucciones_disenador: parsed.instrucciones_disenador,
      resumen_tweet: parsed.resumen_tweet,
      es_mock: false,
    };
  } catch (err) {
    registrarFallbackIA('brief');
    logger.error('[briefService] Error en llamada a Anthropic Claude, recurriendo a fallback:', err);
    return generarBriefFallback(producto, input, paleta);
  }
}