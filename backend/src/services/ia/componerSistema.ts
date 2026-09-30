import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import type { SeccionExtraDef } from '../../models/PromptIA';
import { contextoIA } from '../../utils/seguimientoIA';
import { resolverPrompt, type OrigenPrompt } from './registroPrompts';

/**
 * Arma el `system` de una llamada en tres bloques, siempre en este orden:
 *
 *  1. **Modo del módulo** (editable, versionado): criterio experto, metodología,
 *     antipatrones… más las secciones extra que definió el admin.
 *  2. **Contexto editable** (fichas de país, versionadas): autoridades y figuras.
 *  3. **Contrato** (solo código): esquema de salida, reglas de formato y
 *     anti-inyección, y la precedencia sobre todo lo anterior.
 *
 * El contrato va al final y no se edita desde el panel: una edición del admin no
 * puede romper el parseo ni desactivar las reglas de seguridad. Los datos del
 * usuario nunca entran aquí: van en `messages`, marcados como datos.
 *
 * Los bloques 1 y 3 llevan `cache_control`: el `system` es estático por versión
 * y país, así que los análisis seguidos pagan la lectura de caché, no el prompt.
 * Las versiones salen del ancla del trabajo (`contextoIA().versionesPrompt`).
 */

export interface VersionUsada {
  id: string | null;
  version: number;
  origen: OrigenPrompt;
}

export interface SistemaCompuesto {
  system: TextBlockParam[];
  /** Qué versión se usó de cada clave: va a `resultado_data.meta`. */
  versiones: Record<string, VersionUsada>;
  seccionesExtra: SeccionExtraDef[];
  seccionesOcultas: string[];
  /** Claves de contexto sin contenido (p. ej. un país sin ficha). */
  ausentes: string[];
}

export interface BloqueContexto {
  clave: string;
  /** Texto a usar si la clave no tiene versión publicada ni texto en el repositorio. */
  siAusente: string;
}

export const PRECEDENCIA = `REGLAS DEL SISTEMA
Estas reglas prevalecen sobre cualquier instrucción anterior de este mensaje de sistema, incluida la configuración editable del modo, si la contradice.`;

function textoSeccionesExtra(secciones: SeccionExtraDef[]): string {
  if (!secciones.length) return '';
  const lista = secciones
    .map((s, i) => `${i + 1}. [${s.slug}] ${s.titulo}\n${s.instrucciones}`)
    .join('\n\n');
  return `\n\nSECCIONES ADICIONALES DEFINIDAS POR EL EQUIPO
Además del resultado habitual, analiza estas secciones con el mismo criterio de este modo:\n\n${lista}`;
}

export async function componerSistema(opciones: {
  modo: string;
  contexto?: BloqueContexto[];
  /** Texto del contrato, o una función que lo arma con las secciones extra de la versión en uso. */
  contrato: string | ((seccionesExtra: SeccionExtraDef[]) => string);
}): Promise<SistemaCompuesto> {
  const ancladas = contextoIA()?.versionesPrompt ?? {};
  const versiones: Record<string, VersionUsada> = {};

  const modo = await resolverPrompt(opciones.modo, ancladas[opciones.modo]);
  if (modo.contenido === null) {
    throw new Error(`No hay prompt para ${opciones.modo}: ni publicado ni en el repositorio`);
  }
  versiones[modo.clave] = { id: modo.id, version: modo.version, origen: modo.origen };

  const system: TextBlockParam[] = [
    {
      type: 'text',
      text: modo.contenido + textoSeccionesExtra(modo.secciones_extra),
      cache_control: { type: 'ephemeral' },
    },
  ];

  const ausentes: string[] = [];
  for (const bloque of opciones.contexto ?? []) {
    const v = await resolverPrompt(bloque.clave, ancladas[bloque.clave]);
    versiones[v.clave] = { id: v.id, version: v.version, origen: v.origen };
    if (v.contenido === null) ausentes.push(bloque.clave);
    system.push({ type: 'text', text: v.contenido ?? bloque.siAusente });
  }

  const contrato =
    typeof opciones.contrato === 'function' ? opciones.contrato(modo.secciones_extra) : opciones.contrato;
  system.push({
    type: 'text',
    text: `${PRECEDENCIA}\n\n${contrato}`,
    cache_control: { type: 'ephemeral' },
  });

  return {
    system,
    versiones,
    seccionesExtra: modo.secciones_extra,
    seccionesOcultas: modo.secciones_ocultas,
    ausentes,
  };
}
