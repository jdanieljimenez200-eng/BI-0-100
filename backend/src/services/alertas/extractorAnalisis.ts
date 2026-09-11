/**
 * Extractor de alertas de los MÓDULOS DE ANÁLISIS (mercado, finanzas, legal).
 *
 * No confundir con `alertasService.ts`, que es el módulo de alertas AUTOMÁTICAS
 * de operación (stock bajo, metas, caída de ingresos). Este archivo solo
 * normaliza lo que los análisis ya dejaron guardado en sus columnas jsonb y lo
 * unifica en una sola forma para el dashboard.
 *
 * Reglas de diseño:
 * - Función pura: recibe filas planas, no entidades TypeORM ni Request. Así es
 *   testeable sin DB (ver src/__tests__/services/extractorAnalisis.test.ts).
 * - Todo lo que llega de jsonb se trata como `unknown` y se valida: un análisis
 *   viejo o un LLM que devolvió basura NO debe tumbar /dashboard/resumen.
 * - No inventa diagnósticos. La única alerta derivada es la de finanzas con
 *   `viabilidad: 'baja'`, porque en ese caso `mensaje_viabilidad` es el
 *   veredicto y `alertas` puede venir vacío.
 *
 * Módulos SIN alertas por diseño (no tienen columna ni campo que las declare):
 * marketing (estrategias/copies/calendario), ventas (tips/historia/porque_fallan)
 * y brief.
 */

// ─── Salida ─────────────────────────────────────────────────────────────────

export type NivelAlerta = 'verde' | 'amarillo' | 'rojo';

export type ModuloConAlertas = 'mercado' | 'finanzas' | 'legal';

export interface AlertaUnificada {
  modulo: ModuloConAlertas;
  /** Id del análisis del que salió — permite enlazar al resultado. */
  analisis_id: string;
  producto_id: string;
  nivel: NivelAlerta;
  /** Categoría corta y estable para agrupar/filtrar en la UI. */
  tipo: string;
  titulo: string;
  mensaje: string;
  /** Acción concreta recomendada. Solo legal la trae hoy. */
  accion: string | null;
}

export interface ResumenNiveles {
  rojo: number;
  amarillo: number;
  verde: number;
  total: number;
}

// ─── Entradas (forma mínima, estructural) ───────────────────────────────────

export interface FuenteMercado {
  id: string;
  producto_id: string;
  /** AnalisisMercado.alertas — Alerta[] | null */
  alertas?: unknown;
}

export interface FuenteFinanzas {
  id: string;
  producto_id: string;
  /** AnalisisFinanzas.resumen_data — ResumenFinanzas | null */
  resumen_data?: unknown;
}

export interface FuenteLegal {
  id: string;
  producto_id: string;
  /** AnalisisLegal.cumplimiento_global — 'verde' | 'amarillo' | 'rojo' */
  cumplimiento_global?: string | null;
  /** AnalisisLegal.resultado_data — LegalResultado | null */
  resultado_data?: unknown;
}

export interface EntradaExtractor {
  mercado?: FuenteMercado[] | null;
  finanzas?: FuenteFinanzas[] | null;
  legal?: FuenteLegal[] | null;
  /** Descarta las alertas nivel 'verde' (informativas). Default: false. */
  soloAccionables?: boolean;
  /** Tope de alertas por producto, ya ordenadas por gravedad. 0/undefined = sin tope. */
  maxPorProducto?: number;
}

// ─── Helpers de validación ──────────────────────────────────────────────────

const NIVELES: readonly string[] = ['verde', 'amarillo', 'rojo'];

const PESO_NIVEL: Record<NivelAlerta, number> = { rojo: 0, amarillo: 1, verde: 2 };

const PESO_MODULO: Record<ModuloConAlertas, number> = { mercado: 0, finanzas: 1, legal: 2 };

function esNivel(valor: unknown): valor is NivelAlerta {
  return typeof valor === 'string' && NIVELES.includes(valor);
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esFilaValida(fila: unknown): fila is { id: string; producto_id: string } {
  return (
    esObjeto(fila) &&
    typeof fila.id === 'string' &&
    fila.id !== '' &&
    typeof fila.producto_id === 'string' &&
    fila.producto_id !== ''
  );
}

// ─── Mercado ────────────────────────────────────────────────────────────────

// mercadoOrchestrator solo emite hoy 'viabilidad' y 'densidad', pero el campo es
// libre: cualquier tipo no mapeado cae al fallback capitalizado.
const TITULO_MERCADO: Record<string, string> = {
  viabilidad: 'Viabilidad en riesgo',
  densidad: 'Competencia saturada en la zona',
  competencia: 'Presión competitiva',
  tendencia: 'Tendencia de demanda',
  precio: 'Precio fuera de mercado',
  tam: 'Tamaño de mercado limitado',
};

function tituloMercado(tipo: string): string {
  const mapeado = TITULO_MERCADO[tipo.toLowerCase()];
  if (mapeado) return mapeado;
  if (!tipo) return 'Alerta de mercado';
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

export function extraerMercado(filas: FuenteMercado[] | null | undefined): AlertaUnificada[] {
  if (!Array.isArray(filas)) return [];

  const salida: AlertaUnificada[] = [];

  for (const fila of filas) {
    if (!esFilaValida(fila) || !Array.isArray((fila as FuenteMercado).alertas)) continue;

    for (const cruda of (fila as FuenteMercado).alertas as unknown[]) {
      if (!esObjeto(cruda)) continue;

      const mensaje = texto(cruda.mensaje);
      if (!mensaje) continue;

      const tipo = texto(cruda.tipo) || 'general';

      salida.push({
        modulo: 'mercado',
        analisis_id: fila.id,
        producto_id: fila.producto_id,
        nivel: esNivel(cruda.nivel) ? cruda.nivel : 'amarillo',
        tipo,
        titulo: tituloMercado(tipo),
        mensaje,
        accion: null,
      });
    }
  }

  return salida;
}

// ─── Finanzas ───────────────────────────────────────────────────────────────

// resumenService no clasifica sus alertas por nivel (son string[]), así que el
// nivel se hereda de la viabilidad global del análisis.
const NIVEL_POR_VIABILIDAD: Record<string, NivelAlerta> = {
  baja: 'rojo',
  media: 'amarillo',
  alta: 'amarillo',
};

/**
 * Las alertas de finanzas vienen como "Título del problema: detalle largo...".
 * Si hay un ':' temprano se usa como titular; si no, un rótulo genérico.
 */
function tituloFinanzas(mensaje: string): string {
  const corte = mensaje.indexOf(':');
  if (corte > 0 && corte <= 60) return mensaje.slice(0, corte).trim();
  return 'Riesgo financiero';
}

export function extraerFinanzas(filas: FuenteFinanzas[] | null | undefined): AlertaUnificada[] {
  if (!Array.isArray(filas)) return [];

  const salida: AlertaUnificada[] = [];

  for (const fila of filas) {
    if (!esFilaValida(fila)) continue;

    const resumen = esObjeto((fila as FuenteFinanzas).resumen_data)
      ? ((fila as FuenteFinanzas).resumen_data as Record<string, unknown>)
      : null;
    if (!resumen) continue;

    const viabilidad = texto(resumen.viabilidad).toLowerCase();
    const nivelBase = NIVEL_POR_VIABILIDAD[viabilidad] ?? 'amarillo';

    // Veredicto global cuando el proyecto no cierra números.
    if (viabilidad === 'baja') {
      salida.push({
        modulo: 'finanzas',
        analisis_id: fila.id,
        producto_id: fila.producto_id,
        nivel: 'rojo',
        tipo: 'viabilidad',
        titulo: 'Viabilidad financiera baja',
        mensaje:
          texto(resumen.mensaje_viabilidad) ||
          'La proyección no sostiene el negocio con los supuestos actuales de precio, costo y volumen.',
        accion: null,
      });
    }

    if (!Array.isArray(resumen.alertas)) continue;

    for (const cruda of resumen.alertas as unknown[]) {
      const mensaje = texto(cruda);
      if (!mensaje) continue;

      salida.push({
        modulo: 'finanzas',
        analisis_id: fila.id,
        producto_id: fila.producto_id,
        nivel: nivelBase,
        tipo: 'rentabilidad',
        titulo: tituloFinanzas(mensaje),
        mensaje,
        accion: null,
      });
    }
  }

  return salida;
}

// ─── Legal ──────────────────────────────────────────────────────────────────

export function extraerLegal(filas: FuenteLegal[] | null | undefined): AlertaUnificada[] {
  if (!Array.isArray(filas)) return [];

  const salida: AlertaUnificada[] = [];

  for (const fila of filas) {
    if (!esFilaValida(fila)) continue;

    const resultado = esObjeto((fila as FuenteLegal).resultado_data)
      ? ((fila as FuenteLegal).resultado_data as Record<string, unknown>)
      : null;
    if (!resultado || !Array.isArray(resultado.alertas)) continue;

    const globalLegal = texto((fila as FuenteLegal).cumplimiento_global);
    const nivelFallback: NivelAlerta = esNivel(globalLegal) ? globalLegal : 'amarillo';

    for (const cruda of resultado.alertas as unknown[]) {
      if (!esObjeto(cruda)) continue;

      const titulo = texto(cruda.titulo);
      const descripcion = texto(cruda.descripcion);
      const mensaje = descripcion || titulo;
      if (!mensaje) continue;

      salida.push({
        modulo: 'legal',
        analisis_id: fila.id,
        producto_id: fila.producto_id,
        nivel: esNivel(cruda.nivel) ? cruda.nivel : nivelFallback,
        tipo: 'cumplimiento',
        titulo: titulo || 'Cumplimiento legal',
        mensaje,
        accion: texto(cruda.accion_recomendada) || null,
      });
    }
  }

  return salida;
}

// ─── Orquestación ───────────────────────────────────────────────────────────

function comparar(a: AlertaUnificada, b: AlertaUnificada): number {
  const porNivel = PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel];
  if (porNivel !== 0) return porNivel;

  const porModulo = PESO_MODULO[a.modulo] - PESO_MODULO[b.modulo];
  if (porModulo !== 0) return porModulo;

  return a.titulo.localeCompare(b.titulo, 'es');
}

/**
 * Unifica, deduplica y ordena las alertas de los tres módulos.
 * Orden: rojo → amarillo → verde; dentro del nivel, mercado → finanzas → legal.
 */
export function extraerAlertas(entrada: EntradaExtractor): AlertaUnificada[] {
  const todas = [
    ...extraerMercado(entrada.mercado),
    ...extraerFinanzas(entrada.finanzas),
    ...extraerLegal(entrada.legal),
  ];

  const filtradas = entrada.soloAccionables ? todas.filter((a) => a.nivel !== 'verde') : todas;

  // Un mismo diagnóstico puede repetirse (p. ej. dos factores de viabilidad con
  // idéntico texto). Se deduplica por producto + módulo + mensaje.
  const vistas = new Set<string>();
  const unicas = filtradas.filter((a) => {
    const clave = `${a.producto_id}|${a.modulo}|${a.mensaje.toLowerCase()}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });

  const ordenadas = unicas.sort(comparar);

  const max = entrada.maxPorProducto ?? 0;
  if (max <= 0) return ordenadas;

  const conteo = new Map<string, number>();
  return ordenadas.filter((a) => {
    const usadas = conteo.get(a.producto_id) ?? 0;
    if (usadas >= max) return false;
    conteo.set(a.producto_id, usadas + 1);
    return true;
  });
}

/** Indexa por producto_id preservando el orden de gravedad. */
export function agruparPorProducto(
  alertas: AlertaUnificada[]
): Record<string, AlertaUnificada[]> {
  const mapa: Record<string, AlertaUnificada[]> = {};
  for (const alerta of alertas) {
    if (!mapa[alerta.producto_id]) mapa[alerta.producto_id] = [];
    mapa[alerta.producto_id].push(alerta);
  }
  return mapa;
}

/** Conteo por nivel para badges y totales del dashboard. */
export function resumirNiveles(alertas: AlertaUnificada[]): ResumenNiveles {
  const resumen: ResumenNiveles = { rojo: 0, amarillo: 0, verde: 0, total: 0 };
  for (const alerta of alertas) {
    resumen[alerta.nivel] += 1;
    resumen.total += 1;
  }
  return resumen;
}