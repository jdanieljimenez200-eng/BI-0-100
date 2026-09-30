import { z } from 'zod';
import type { SeccionExtraDef } from '../../models/PromptIA';

/**
 * Contrato común de salida de los módulos de análisis.
 *
 * Lo que un consultor serio dice además de la respuesta: qué supuso, qué dato
 * le faltó, cuánta confianza tiene y, si el admin las definió, las secciones
 * extra. Todos los campos son tolerantes: si el modelo los omite o los devuelve
 * mal, el análisis NO falla por ellos (se vacían), porque lo principal del
 * módulo sigue siendo válido.
 */

export type NivelConfianza = 'alto' | 'medio' | 'bajo';

const ORDEN_CONFIANZA: Record<NivelConfianza, number> = { bajo: 0, medio: 1, alto: 2 };

export interface InformacionFaltante {
  dato: string;
  por_que_importa: string;
}

/** Lo que se guarda en `resultado_data.transparencia`. */
export interface TransparenciaIA {
  supuestos: string[];
  informacion_faltante: InformacionFaltante[];
  nivel_confianza: NivelConfianza;
  motivo_confianza: string;
}

export interface SeccionExtraResultado {
  slug: string;
  titulo: string;
  resumen: string;
  puntos: string[];
  nivel_confianza?: NivelConfianza;
}

const aMinusculas = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
const NivelSchema = z.preprocess(aMinusculas, z.enum(['alto', 'medio', 'bajo']));

export const ContratoComunSchema = z.object({
  supuestos: z.array(z.string().trim().min(3).max(400)).max(10).catch([]),
  informacion_faltante: z
    .array(
      z.object({
        dato: z.string().trim().min(2).max(160),
        por_que_importa: z.string().trim().min(3).max(400),
      })
    )
    .max(8)
    .catch([]),
  nivel_confianza: NivelSchema.optional().catch(undefined),
  motivo_confianza: z.string().trim().max(500).optional().catch(undefined),
  secciones_extra: z
    .array(
      z.object({
        slug: z.string().trim().max(40),
        titulo: z.string().trim().max(120).optional(),
        resumen: z.string().trim().min(3).max(1200),
        puntos: z.array(z.string().trim().min(2).max(400)).max(12).default([]),
        nivel_confianza: NivelSchema.optional().catch(undefined),
      })
    )
    .max(8)
    .catch([]),
});

export type SalidaContratoComun = z.infer<typeof ContratoComunSchema>;

/** Campos JSON del contrato común, para añadir al esquema de salida de cada módulo. */
export function camposContratoComun(): string {
  return `"supuestos": [str],
  "informacion_faltante": [{"dato": str, "por_que_importa": str}],
  "nivel_confianza": "alto" | "medio" | "bajo",
  "motivo_confianza": str,
  "secciones_extra": [{"slug": str, "titulo": str, "resumen": str, "puntos": [str], "nivel_confianza": "alto" | "medio" | "bajo"}]`;
}

/** Instrucciones del contrato común (van en el bloque de código, no en el editable). */
export function reglasContratoComun(seccionesExtra: SeccionExtraDef[]): string {
  const extra = seccionesExtra.length
    ? `- secciones_extra: exactamente una entrada por cada sección adicional definida en las instrucciones (${seccionesExtra
        .map((s) => `"${s.slug}"`)
        .join(', ')}), con ese mismo slug y en ese orden. resumen de 2-4 oraciones y 3-6 puntos accionables.`
    : '- secciones_extra: devuelve un array vacío.';
  return `CONTRATO COMÚN DE TRANSPARENCIA
- supuestos: hasta 8. Lo que asumiste porque no se declaró o no se podía saber; una oración cada uno. Si no asumiste nada, array vacío.
- informacion_faltante: hasta 6, el dato que más cambiaría el resultado primero. "dato" en palabras del dueño; "por_que_importa" en una oración concreta.
- nivel_confianza y motivo_confianza: según los criterios de confianza del modo. motivo_confianza en 1-2 oraciones.
${extra}`;
}

export interface OpcionesContrato {
  seccionesExtra: SeccionExtraDef[];
  /** Tope que impone el código (p. ej. país sin ficha o resultado de plantilla). */
  confianzaMaxima?: NivelConfianza;
  motivoTope?: string;
}

/**
 * Normaliza lo que devolvió el modelo:
 *  - la confianza nunca supera el tope que fija el código;
 *  - solo se aceptan las secciones extra definidas por el admin, en su orden y
 *    con SU título (el modelo no renombra lo que el equipo configuró).
 */
export function aplicarContratoComun(
  salida: SalidaContratoComun,
  opciones: OpcionesContrato
): { transparencia: TransparenciaIA; secciones_extra: SeccionExtraResultado[] } {
  let nivel: NivelConfianza = salida.nivel_confianza ?? 'medio';
  let motivo = salida.motivo_confianza?.trim() || 'El modelo no explicó su nivel de confianza.';
  const tope = opciones.confianzaMaxima;
  if (tope && ORDEN_CONFIANZA[nivel] > ORDEN_CONFIANZA[tope]) {
    nivel = tope;
    motivo = opciones.motivoTope ? `${opciones.motivoTope} ${motivo}` : motivo;
  }

  const porSlug = new Map(salida.secciones_extra.map((s) => [s.slug, s]));
  const secciones_extra = opciones.seccionesExtra
    .map((def): SeccionExtraResultado | null => {
      const s = porSlug.get(def.slug);
      if (!s) return null;
      return {
        slug: def.slug,
        titulo: def.titulo,
        resumen: s.resumen,
        puntos: s.puntos.slice(0, 8),
        ...(s.nivel_confianza ? { nivel_confianza: s.nivel_confianza } : {}),
      };
    })
    .filter((s): s is SeccionExtraResultado => s !== null);

  return {
    transparencia: {
      supuestos: salida.supuestos.slice(0, 8),
      informacion_faltante: salida.informacion_faltante.slice(0, 6),
      nivel_confianza: nivel,
      motivo_confianza: motivo,
    },
    secciones_extra,
  };
}

/** Transparencia de un resultado de plantilla: confianza baja y el porqué. */
export function transparenciaDePlantilla(motivo: string, supuestos: string[] = []): TransparenciaIA {
  return {
    supuestos,
    informacion_faltante: [],
    nivel_confianza: 'bajo',
    motivo_confianza: motivo,
  };
}
