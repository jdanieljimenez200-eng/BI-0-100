import { z } from 'zod';
import type { ModuloPrompt } from './prompts';

/**
 * Secciones nativas de cada módulo y cuáles puede ocultar el admin.
 *
 * Las que no son ocultables sostienen el resto del resultado (sin resumen ni
 * permisos, un dictamen legal no dice nada). Una sección oculta ni se genera
 * ni se muestra; los análisis antiguos se siguen mostrando con lo que tenían.
 */

export interface SeccionNativa {
  clave: string;
  titulo: string;
  ocultable: boolean;
}

export const SECCIONES_NATIVAS: Record<ModuloPrompt, SeccionNativa[]> = {
  legal: [
    { clave: 'legal.resumen_ejecutivo', titulo: 'Resumen ejecutivo', ocultable: false },
    { clave: 'legal.permisos_licencias', titulo: 'Permisos y licencias', ocultable: false },
    { clave: 'legal.obligaciones_fiscales', titulo: 'Obligaciones fiscales', ocultable: false },
    { clave: 'legal.obligaciones_laborales', titulo: 'Obligaciones laborales', ocultable: true },
    { clave: 'legal.regulacion_digital', titulo: 'Regulación digital', ocultable: true },
    { clave: 'legal.regulacion_comercio_exterior', titulo: 'Comercio exterior', ocultable: true },
    { clave: 'legal.alertas', titulo: 'Alertas', ocultable: true },
    { clave: 'legal.checklist', titulo: 'Plan de acción (checklist)', ocultable: true },
  ],
  // Solo se ocultan las secciones que escribe la IA; las de datos (tendencias,
  // competencia, TAM) son la evidencia del análisis y siempre se muestran.
  mercado: [
    { clave: 'mercado.resumen_ejecutivo', titulo: 'Viabilidad', ocultable: false },
    { clave: 'mercado.tendencias', titulo: 'Tendencias de demanda', ocultable: false },
    { clave: 'mercado.competencia', titulo: 'Competencia', ocultable: false },
    { clave: 'mercado.tam_sam_som', titulo: 'Tamaño de mercado (TAM/SAM/SOM)', ocultable: false },
    { clave: 'mercado.dafo', titulo: 'DAFO', ocultable: true },
    { clave: 'mercado.reporte_bi', titulo: 'Reporte BI (diagnóstico y próximos pasos)', ocultable: true },
  ],
};

export function seccionesOcultables(modulo: ModuloPrompt): string[] {
  return SECCIONES_NATIVAS[modulo].filter((s) => s.ocultable).map((s) => s.clave);
}

/** Definición de una sección extra, tal como la escribe el admin. */
export const SeccionExtraDefSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, 'El identificador va en minúsculas, sin espacios (p. ej. riesgos_estacionales)'),
  titulo: z.string().trim().min(3).max(80),
  instrucciones: z.string().trim().min(10).max(2000),
});

export const MAX_SECCIONES_EXTRA = 5;

export const SeccionesExtraSchema = z
  .array(SeccionExtraDefSchema)
  .max(MAX_SECCIONES_EXTRA)
  .refine((lista) => new Set(lista.map((s) => s.slug)).size === lista.length, {
    message: 'Hay dos secciones extra con el mismo identificador',
  });

/** Valida que las secciones a ocultar existan y se puedan ocultar. Devuelve el error o `null`. */
export function errorSeccionesOcultas(modulo: ModuloPrompt, claves: string[]): string | null {
  const permitidas = new Set(seccionesOcultables(modulo));
  const invalidas = claves.filter((c) => !permitidas.has(c));
  return invalidas.length ? `Estas secciones no se pueden ocultar: ${invalidas.join(', ')}` : null;
}
