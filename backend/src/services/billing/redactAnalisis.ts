import { getPlanGate, FREEMIUM_ESTRATEGIAS_VISIBLES } from './gatingAnalisis';
import type { ModuloAnalisis } from './gatingAnalisis';
// `import type` — se borra en compilación: este módulo no debe arrastrar
// entidades TypeORM en runtime (se testea sin DB, como el resto de servicios puros).
import type { Plan } from '../../models/Usuario';

/**
 * Recorte del PAYLOAD de un análisis ya persistido, por plan.
 *
 * Complementa a `gatingAnalisis.ts` (que decide qué NO se GENERA) tapando lo que
 * sí existe en la fila pero no le corresponde al plan. Los dos ejes son
 * necesarios: hay contenido determinista (finanzas, estrategias de marketing,
 * directorio de proveedores) que no cuesta tokens y por eso se genera siempre,
 * así que la única defensa es no enviarlo.
 *
 * Cada regla de aquí está atada a una clave declarada en `BLOQUEADAS_FREEMIUM`.
 * Vaciar un campo SIN clave declarada haría que el front mostrase un bloque
 * vacío sin candado (parece un bug, no un muro), así que no se toca.
 *
 * Función pura, sin DB ni HTTP → cubierta por los tests unitarios.
 */

export const CANDADO_PRO = '🔒 Disponible desde el plan Emprendedor';

type Fila = Record<string, unknown>;

export interface RedaccionAnalisis<T> {
  /** Copia recortada de la fila (la original nunca se muta). */
  payload: T;
  /** Lista que viaja al front para pintar los candados. */
  secciones_bloqueadas: readonly string[];
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function comoArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function comoListaClaves(lista: unknown): string[] | null {
  if (!Array.isArray(lista)) return null;
  // simple-array devuelve [''] para una cadena vacía en algunas versiones: las
  // claves vacías no existen en el gate y ensuciarían el upsell del front.
  return lista.filter((s): s is string => typeof s === 'string' && s.length > 0);
}

/**
 * Lee la lista de secciones recortadas que se guardó JUNTO al análisis. Su
 * presencia distingue un análisis generado CON gate de uno legacy generado
 * completo, y hay dos formas de almacenamiento según el módulo:
 *
 * - `ventas`: columna propia `secciones_bloqueadas` de la fila
 *   (ver AnalisisVentas + ventasOrchestrator). Es la única que puede ser `null`
 *   por ser legacy anterior a la columna.
 * - `marketing`: anidada en `calendario_data.secciones_bloqueadas`
 *   (ver marketing/types.ts), porque la entidad no tiene columna dedicada.
 *
 * Sin la rama de ventas, `respuestaAnalisis` sobrescribía la columna real con
 * `[]` en planes de pago: un análisis generado en freemium (con
 * `porque_fallan_data` ya vacío en BD) llegaba al front sin claves bloqueadas y
 * el hueco se pintaba como bloque vacío en lugar de candado.
 */
function leerBloqueadasPersistidas(modulo: ModuloAnalisis, fila: Fila): string[] | null {
  if (modulo === 'ventas') {
    return comoListaClaves(fila.secciones_bloqueadas);
  }
  const contenedor = modulo === 'marketing' ? fila.calendario_data : null;
  if (!esObjeto(contenedor)) return null;
  return comoListaClaves(contenedor.secciones_bloqueadas);
}

// ─── Mercado ──────────────────────────────────────────────────────────────────
// Gancho visible: estudio de viabilidad (viabilidad_score / viabilidad_estado /
// viabilidad_factores). Los escalares de acceso rápido se vacían junto a su
// bloque porque son el mismo dato: el dashboard NO depende de ellos
// (routes/dashboard.ts tiene su propio SELECT) y la página de resultado los lee
// desde dentro de tendencias_data / competencia_data, con fallback a 0.
// Sin clave declarada y por tanto visibles: densidad_data, payback_data,
// renta_zona_data, estudio_area_data, alertas.

function redactMercado(fila: Fila, bloq: Set<string>): void {
  if (bloq.has('mercado.tendencias')) {
    fila.tendencias_data = null;
    fila.volumen_busquedas_mensual = null;
    fila.tendencia_porcentaje = null;
  }
  if (bloq.has('mercado.competencia')) {
    fila.competencia_data = null;
    fila.total_competidores = null;
  }
  if (bloq.has('mercado.dafo')) fila.dafo_data = null;
  if (bloq.has('mercado.tam_sam_som')) fila.tam_data = null;
  // El resumen ejecutivo y la comparativa viven dentro del reporte BI.
  if (
    bloq.has('mercado.reporte_bi') ||
    bloq.has('mercado.resumen_ejecutivo') ||
    bloq.has('mercado.comparativa_competidores')
  ) {
    fila.reporte_bi_data = null;
  }
}

// ─── Marketing ────────────────────────────────────────────────────────────────
// Gancho visible: la estrategia recomendada. Las secundarias se BLANQUEAN en
// lugar de eliminarse: el front recorre el array para pintar las 3 pestañas y
// el upsell, así que recortarlo mataría el gancho comercial.

function bloquearEstrategia(e: Record<string, unknown>): Record<string, unknown> {
  return {
    ...e, // conserva tipo / nivel_inversion / riesgo (enums que el front formatea)
    nombre: CANDADO_PRO,
    tagline: CANDADO_PRO,
    descripcion: CANDADO_PRO,
    por_que: '',
    precio_sugerido: 0,
    precio_rango: { min: 0, max: 0 },
    margen_rango: '',
    publico_objetivo: '',
    edad_rango: '',
    canales_principales: [],
    ventaja_competitiva: '',
    presupuesto_mensual_sugerido: 0,
    tiempo_resultados: '',
    puntaje_fit: 0,
    roi: { alcance: '', leads: '', descripcion: '' },
    recomendada: false,
    unit_economics: undefined,
    script_cierre: undefined,
    secuencia_seguimiento: undefined,
    garantia_irresistible: undefined,
    order_bump_sugerido: undefined,
    plan_accion_paso_a_paso: [],
    kpis_reales: undefined,
  };
}

/** Índices que conservan datos reales: la recomendada primero, luego mayor fit. */
function indicesEstrategiasVisibles(estrategias: Record<string, unknown>[], n: number): Set<number> {
  const orden = estrategias
    .map((e, i) => ({
      i,
      rec: e.recomendada === true ? 1 : 0,
      fit: typeof e.puntaje_fit === 'number' ? e.puntaje_fit : 0,
    }))
    .sort((a, b) => b.rec - a.rec || b.fit - a.fit || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map((x) => x.i);
  return new Set(orden);
}

/**
 * Publicación reducida a "dónde y qué día": conserva solo la plataforma.
 *
 * Se devuelve este stub en lugar de `publicaciones: []` porque un array vacío
 * hace que el front pinte el día como DESCANSO (DayCard: `isRestDay =
 * dia.publicaciones.length === 0`), y eso es información falsa: ese día sí hay
 * publicación, solo está bloqueada. Los campos de contenido se dejan como
 * cadena vacía / array vacío para que los condicionales del front (`pub?.idea
 * && …`, `pub?.hora && …`) no rendericen nada, sin romper los tipos.
 */
function soloPlataforma(p: Record<string, unknown>): Record<string, unknown> {
  return {
    plataforma: typeof p.plataforma === 'string' ? p.plataforma : '',
    hora: '',
    tipo_contenido: '',
    idea: '',
    copy: '',
    hashtags: [],
  };
}

function maskPublicacion(p: Record<string, unknown>, bloq: Set<string>): Record<string, unknown> {
  const out = { ...p };
  if (bloq.has('marketing.video_script') && esObjeto(out.video_script)) {
    out.video_script = { hook: CANDADO_PRO, valor: CANDADO_PRO, cta: CANDADO_PRO };
  }
  if (
    bloq.has('marketing.prompt_visual') &&
    typeof out.prompt_visual === 'string' &&
    out.prompt_visual.length > 0
  ) {
    out.prompt_visual = CANDADO_PRO;
  }
  return out;
}

function redactMarketing(fila: Fila, bloq: Set<string>): void {
  if (bloq.has('marketing.estrategias_secundarias')) {
    const estrategias = comoArray(fila.estrategias_data);
    if (estrategias.length > 0) {
      const visibles = indicesEstrategiasVisibles(estrategias, FREEMIUM_ESTRATEGIAS_VISIBLES);
      fila.estrategias_data = estrategias.map((e, i) => (visibles.has(i) ? e : bloquearEstrategia(e)));
    }
  }

  if (bloq.has('marketing.copies')) fila.copies_data = null;
  if (bloq.has('marketing.reporte_ads')) fila.reporte_ads_data = null;

  const cal = fila.calendario_data;
  if (!esObjeto(cal)) return;

  if (bloq.has('marketing.tendencias')) {
    cal.tendencias = [];
    // recomendacion_plataforma se DERIVA de tendencias (calendarioService.ts) y
    // arrastra las tendencias completas que la justifican: dejarla viva sería
    // una fuga del mismo candado por otra clave.
    cal.recomendacion_plataforma = [];
  }
  if (bloq.has('marketing.calendario')) cal.sugerencia_visual_campana = '';

  if (!Array.isArray(cal.semanas)) return;

  const calendarioEntero = bloq.has('marketing.calendario');
  const semana2 = bloq.has('marketing.calendario_semana_2');

  cal.semanas = comoArray(cal.semanas).map((s) => {
    const dias = comoArray(s.dias);
    // Las semanas se conservan como objeto aunque queden sin publicaciones: el
    // front genera la pestaña "🔒 Sem. 2" recorriendo el array.
    const vaciar = calendarioEntero || (semana2 && Number(s.numero) === 2);
    if (vaciar) {
      // El gancho visible es la CADENCIA: qué día toca publicar y en qué
      // plataforma. El contenido (idea, copy, hashtags, script, visual) sí se
      // recorta por completo.
      return {
        ...s,
        dias: dias.map((d) => ({
          ...d,
          publicaciones: comoArray(d.publicaciones).map(soloPlataforma),
          sugerencia_engagement: '',
        })),
      };
    }
    return {
      ...s,
      dias: dias.map((d) => ({
        ...d,
        publicaciones: comoArray(d.publicaciones).map((p) => maskPublicacion(p, bloq)),
      })),
    };
  });
}

// ─── Finanzas ─────────────────────────────────────────────────────────────────
// Gancho visible: punto de equilibrio (breakeven_data) + los inputs que el
// usuario escribió (inputs_data). Antes la ruta enviaba el JSON completo y el
// candado era solo visual: el payload se leía entero desde devtools.

function redactFinanzas(fila: Fila, bloq: Set<string>): void {
  if (bloq.has('finanzas.resumen')) {
    fila.resumen_data = null;
    // Riesgos financieros (antes "por qué fallan" en Ventas): mismo tier que el resumen.
    fila.riesgos_data = null;
  }
  if (bloq.has('finanzas.proyeccion_12m')) fila.proyeccion_data = null;
  if (bloq.has('finanzas.escenarios_avanzados')) fila.sensibilidad_data = null;
  if (bloq.has('finanzas.centro_mando')) fila.overrides_data = null;
}

// ─── Legal ────────────────────────────────────────────────────────────────────
// Módulo entero de pago. Sobreviven los 3 escalares del semáforo, que ya son
// públicos en GET /api/legal/producto/:productoId.

function redactLegal(fila: Fila, bloq: Set<string>): void {
  if (bloq.has('legal.completo')) fila.resultado_data = null;
}

// ─── Brief ────────────────────────────────────────────────────────────────────
// Gancho visible: score_marca (objeto con notas /10, ver briefService) +
// resumen_tweet. El desarrollo se sustituye por rellenos que PRESERVAN LA FORMA:
// no se puede poner null porque el front evalúa `paleta.primario.hex` antes de
// que <LockedSection> pinte el candado, y reventaría con TypeError.

const IDENTIDAD_BLOQUEADA = {
  adn: CANDADO_PRO,
  diferenciador_clave: CANDADO_PRO,
  personalidad: [] as string[],
  voz_marca: '',
  slogan_principal: CANDADO_PRO,
  slogans_alternativos: [] as string[],
};

const IDENTIDAD_VISUAL_BLOQUEADA = {
  paleta: {
    primario: { nombre: CANDADO_PRO, hex: '#1F2937', uso: '' },
    secundario: { nombre: CANDADO_PRO, hex: '#374151', uso: '' },
    acento: { nombre: CANDADO_PRO, hex: '#4B5563', uso: '' },
    neutro: { nombre: CANDADO_PRO, hex: '#9CA3AF', uso: '' },
  },
  tipografias: { principal: CANDADO_PRO, secundaria: CANDADO_PRO },
  concepto_logo: CANDADO_PRO,
  descripcion_isotipo: '',
  estilo_grafico: '',
};

function redactBrief(fila: Fila, bloq: Set<string>): void {
  const data = fila.resultado_data;
  if (!esObjeto(data)) return;

  if (bloq.has('brief.identidad')) {
    data.brief_identidad = JSON.parse(JSON.stringify(IDENTIDAD_BLOQUEADA));
  }
  if (bloq.has('brief.identidad_visual')) {
    data.identidad_visual = JSON.parse(JSON.stringify(IDENTIDAD_VISUAL_BLOQUEADA));
  }
  if (bloq.has('brief.diagnostico_estrategico')) data.diagnostico_estrategico = CANDADO_PRO;
  if (bloq.has('brief.instrucciones_disenador')) data.instrucciones_disenador = [];
}

// ─── Ventas ───────────────────────────────────────────────────────────────────
// Gancho visible en gratuito: tips de negociación + historia diaria del
// emprendedor (ambos se GENERAN siempre, ver ventasOrchestrator). Lo único de
// pago es "por qué fallan", que en gratuito ni se genera: aquí solo se anula por
// si la fila viene de un plan de pago degradado a gratuito.

function redactVentas(fila: Fila, bloq: Set<string>): void {
  // Freemium: tips + historia_diaria son el gancho visible.
  // "Por qué los emprendimientos fallan" (personalizado) solo en planes de pago.
  if (bloq.has('ventas.porque_fallan')) {
    fila.porque_fallan_data = null;
  }
}

// ─── Entrada pública ──────────────────────────────────────────────────────────

const REDACTORES: Record<ModuloAnalisis, (fila: Fila, bloq: Set<string>) => void> = {
  mercado: redactMercado,
  marketing: redactMarketing,
  finanzas: redactFinanzas,
  legal: redactLegal,
  brief: redactBrief,
  ventas: redactVentas,
};

/**
 * Recorta la fila según el plan. El recorte se decide con el plan ACTUAL.
 *
 * La lista reportada depende de la rama:
 * - Plan de pago: la persistida, para que un análisis generado en gratuito siga
 *   describiéndose incompleto aunque la cuenta haya subido de plan (hay que
 *   re-ejecutarlo, gratis porque en esos planes la cuota es ilimitada).
 * - Plan gratuito: la UNIÓN de la persistida y `gate.bloqueadas`. La persistida
 *   sola no sirve: un análisis generado en un plan de pago la guarda como array
 *   VACÍO, y reportar `[]` junto a un payload ya recortado deja al front sin
 *   candados ni upsell (ver el gate de la página de resultado de marketing, que
 *   evalúa `secciones_bloqueadas.includes(...)`).
 */
export function redactAnalisisPayload<T extends object>(
  modulo: ModuloAnalisis,
  plan: Plan | string | null | undefined,
  fila: T
): RedaccionAnalisis<T> {
  const gate = getPlanGate(plan, modulo);
  const persistidas = leerBloqueadasPersistidas(modulo, fila as unknown as Fila);

  // Plan de pago: se muestra lo que existe, incluso si la fila se generó
  // recortada. No hay nada que ocultar.
  if (gate.completo) {
    return { payload: fila, secciones_bloqueadas: persistidas ?? [] };
  }

  const payload = JSON.parse(JSON.stringify(fila)) as T;
  const bloq = new Set<string>(gate.bloqueadas);
  REDACTORES[modulo](payload as unknown as Fila, bloq);

  // El payload se recortó con `gate.bloqueadas`, así que esas claves tienen que
  // viajar SIEMPRE o el front pinta bloques vacíos sin candado. `persistidas` se
  // suma para no perder claves que este build aún no declare.
  const reportadas = new Set<string>(gate.bloqueadas);
  for (const clave of persistidas ?? []) reportadas.add(clave);

  return { payload, secciones_bloqueadas: Array.from(reportadas) };
}

/**
 * Recorte del brief cuando NO viaja dentro de una fila de `AnalisisBrief`, sino
 * como copia embebida en otra entidad (`Marca.brief_data`). Reutiliza el mismo
 * redactor y las mismas claves para que el gate no se duplique ni se desincronice.
 */
export function redactBriefData<T extends object>(
  plan: Plan | string | null | undefined,
  briefData: T | null | undefined
): { brief_data: T | null; secciones_bloqueadas: readonly string[] } {
  if (briefData === null || briefData === undefined) {
    return { brief_data: null, secciones_bloqueadas: [] };
  }

  const { payload, secciones_bloqueadas } = redactAnalisisPayload('brief', plan, {
    resultado_data: briefData,
  });

  return { brief_data: payload.resultado_data, secciones_bloqueadas };
}

/** Azúcar para las rutas: devuelve el cuerpo listo para `res.json(...)`. */
export function respuestaAnalisis<T extends object>(
  modulo: ModuloAnalisis,
  plan: Plan | string | null | undefined,
  fila: T
): T & { secciones_bloqueadas: readonly string[] } {
  const { payload, secciones_bloqueadas } = redactAnalisisPayload(modulo, plan, fila);
  return { ...payload, secciones_bloqueadas };
}