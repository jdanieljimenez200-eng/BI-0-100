import {
  ViabilidadResult,
  ViabilidadEstado,
  ViabilidadFactores,
  TendenciasResult,
  CompetenciaResult,
  DensidadZonaResult,
} from './types';
import { clamp, interpolarCurva } from '../../utils/curvas';
import { combinarConfianza, NivelConfianza } from '../../utils/confianza';

/** minúsculas + sin acentos: 'Electrónicos' y 'electronicos' deben mapear igual. */
function normalizarCategoria(categoria: string): string {
  if (!categoria) return '';
  return categoria
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ─── Escalas por factor ─────────────────────────────────────────────────────

function scoreTendencia(pct: number): number {
  if (pct >= 20) return 90;
  if (pct >= 10) return 75;
  if (pct >= 5)  return 60;
  if (pct >= 0)  return 40;
  if (pct >= -20) return 20;
  return 10;
}

function scoreCompetencia(n: number): number {
  if (n <= 1)  return 100;
  if (n <= 3)  return 85;
  if (n <= 6)  return 70;
  if (n <= 10) return 55;
  if (n <= 15) return 40;
  return 20;
}

function scoreMargen(pct: number): number {
  if (pct >= 40) return 90;
  if (pct >= 30) return 75;
  if (pct >= 20) return 60;
  if (pct >= 10) return 40;
  if (pct >= 5)  return 20;
  return 0;
}

function scoreDemanda(busquedas: number): number {
  if (busquedas >= 5000) return 90;
  if (busquedas >= 2000) return 75;
  if (busquedas >= 500)  return 60;
  if (busquedas >= 100)  return 40;
  return 20;
}

function scoreOportunidad(tieneGap: boolean, nCompetidores: number): number {
  if (tieneGap)       return 100;
  if (nCompetidores <= 2) return 80;
  if (nCompetidores <= 5) return 70;
  if (nCompetidores <= 8) return 60;
  return 30;
}

// ─── Precio relativo (posicionamiento, NO rentabilidad) ─────────────────────
//
// Criterio de negocio detrás de cada ancla (ratio = tu precio / precio mercado):
//  · 0.90×  → óptimo comercial: entrar ligeramente por debajo del mercado es la
//             posición más defendible para un negocio sin marca consolidada.
//  · 1.00×  → precio de mercado: sano, pero sin ventaja de entrada.
//  · 1.15×  → sostenible SI hay diferenciación; empieza a costar conversión.
//  · 1.30×  → ya exige marca o propuesta claramente premium.
//  · ≥2.00× → caso raro; se aplana en el mínimo en vez de seguir cayendo.
//  · ≤0.40× → dumping: el riesgo real es percepción de baja calidad y guerra de
//             precios, no la rentabilidad.
//
// IMPORTANTE: el coste de vender barato NO se penaliza aquí. Ya lo recoge
// estimarMargen vía el margen bruto. Penalizarlo en ambos factores era el sesgo
// del modelo anterior (un precio agresivo perdía puntos dos veces).
const CURVA_PRECIO_RELATIVO: ReadonlyArray<readonly [number, number]> = [
  [0.40, 50],
  [0.70, 78],
  [0.90, 88],
  [1.00, 85],
  [1.15, 70],
  [1.30, 50],
  [1.60, 25],
  [2.00, 12],
];

/** `null` = no evaluable (sin precio propio o sin referencia de mercado). */
function scorePrecioRelativo(precioUsuario: number, precioMercado: number): number | null {
  if (!(precioUsuario > 0) || !(precioMercado > 0)) return null;
  return Math.round(interpolarCurva(precioUsuario / precioMercado, CURVA_PRECIO_RELATIVO));
}

// ─── Estimación de margen por categoría ─────────────────────────────────────

const MARGEN_CATEGORIA: Record<string, number> = {
  'ropa y accesorios': 45,
  'alimentos y bebidas': 30,
  'electrónicos': 20,
  'hogar y decoración': 40,
  'salud y belleza': 50,
  'deportes y fitness': 38,
  'juguetes y juegos': 42,
  'servicios profesionales': 65,
  'educación y cursos': 70,
  'arte y manualidades': 55,
  'automotriz': 25,
  'mascotas': 40,
  'otro': 35,
};

const MARGEN_DEFAULT = 35;

// Piso 1% (no 0): mantiene positivas las divisiones de TAM/payback aguas abajo,
// y scoreMargen ya lo traduce a 0 puntos, que es la señal que importa.
const MARGEN_PISO = 1;
const MARGEN_TECHO = 80;

// Elasticidad coste-precio: cuánto del sobreprecio se come en costes (mejores
// materiales, packaging, servicio, canal). 0.5 = la mitad. Es un supuesto de
// negocio explícito y ajustable, no una constante mágica.
const ELASTICIDAD_COSTO = 0.5;

const MARGEN_POR_CATEGORIA: Record<string, number> = (() => {
  const mapa: Record<string, number> = {};
  for (const clave of Object.keys(MARGEN_CATEGORIA)) {
    mapa[normalizarCategoria(clave)] = MARGEN_CATEGORIA[clave];
  }
  return mapa;
})();

/**
 * Margen bruto estimado (%).
 *
 * Se ancla el coste unitario en el precio de mercado: a precio de mercado la
 * categoría rinde su margen base, así que coste = mercado × (1 − base). Si te
 * mueves del mercado, el coste acompaña parcialmente (ELASTICIDAD_COSTO) y el
 * margen sale de la aritmética, no de un bono fijo:
 *
 *   margen% = 100 − (100 − base) × (e + (1 − e) × mercado/precio)
 *
 * Ventajas frente al ±10 anterior: es continuo (sin saltos en 1.3× / 0.7×),
 * escala con la estructura de costes de cada categoría y penaliza de verdad los
 * precios insostenibles.
 */
export function estimarMargen(categoria: string, precioVenta: number, precioMercado: number): number {
  const margenBase = MARGEN_POR_CATEGORIA[normalizarCategoria(categoria)] ?? MARGEN_DEFAULT;

  // Sin referencia de mercado o sin precio propio no hay nada que ajustar.
  if (precioVenta <= 0 || precioMercado <= 0) return margenBase;

  const costoRelativo = ELASTICIDAD_COSTO + (1 - ELASTICIDAD_COSTO) * (precioMercado / precioVenta);
  const margenReal = 100 - (100 - margenBase) * costoRelativo;

  return Math.round(clamp(margenReal, MARGEN_PISO, MARGEN_TECHO));
}

// ─── Pesos del modelo ───────────────────────────────────────────────────────
// Suman 1. Si el precio relativo no es evaluable, su peso se reparte
// proporcionalmente entre los otros cinco en vez de inyectar un 50 neutro que
// arrastraría el score hacia la media (un producto excelente sin precio
// declarado perdía ~4 puntos por un dato que nadie aportó).
const PESOS = {
  tendencia: 0.25,
  competencia: 0.20,
  margen: 0.15,
  demanda: 0.15,
  oportunidad: 0.15,
  precio_relativo: 0.10,
} as const;

const PESO_BASE =
  PESOS.tendencia + PESOS.competencia + PESOS.margen + PESOS.demanda + PESOS.oportunidad;

// Densidad de competencia por km². Va fuera de PESOS porque solo se aplica
// cuando la zona tiene área conocida; el score final se divide por el peso
// realmente aplicado, así que sigue siendo una media ponderada correcta.
// 0.10 y no más: la densidad matiza a `competencia`, no la sustituye, y su área
// suele venir del radio declarado (confianza media).
const PESO_DENSIDAD = 0.10;

// Umbrales de narrativa alineados con CURVA_DENSIDAD: ≥84 es hueco geográfico
// real (≤0.5 competidores/km²), ≤46 es zona disputada o saturada (≥4/km²).
const DENSIDAD_BUENA = 84;
const DENSIDAD_AVISO = 46;

/** Valor mostrado (no ponderado) cuando el precio no es evaluable. */
const PRECIO_RELATIVO_NEUTRO = 50;

// Umbrales de narrativa alineados con la curva: ≥78 es banda buena (0.70×–1.05×),
// ≤55 es zona de aviso (≥1.28× o ≤0.45×). Entre ambos no se emite mensaje.
const FPR_BUENO = 78;
const FPR_AVISO = 55;

// ─── Cálculo principal ───────────────────────────────────────────────────────

export function calcularViabilidad(
  tendencias: TendenciasResult,
  competencia: CompetenciaResult,
  margenPct: number,
  precioUsuario?: number,
  densidad?: DensidadZonaResult | null
): ViabilidadResult {
  const precioValido = precioUsuario ?? 0;

  // Densidad: solo cuenta si se pudo medir. `null` = no evaluable, y entonces su
  // peso no se aplica en vez de inyectar un neutro que arrastraría el score.
  const fdenEvaluado =
    densidad && densidad.es_evaluable && typeof densidad.score === 'number'
      ? clamp(Math.round(densidad.score), 0, 100)
      : null;

  const ft  = scoreTendencia(tendencias.crecimiento_porcentaje);
  const fc  = scoreCompetencia(competencia.total_competidores);
  const fm  = scoreMargen(margenPct);
  const fd  = scoreDemanda(tendencias.volumen_busquedas_mensual);
  const fo  = scoreOportunidad(competencia.gap_detectado !== null, competencia.total_competidores);
  const fprEvaluado = scorePrecioRelativo(precioValido, competencia.precio_mercado_promedio);
  const fpr = fprEvaluado ?? PRECIO_RELATIVO_NEUTRO;

  let suma =
    ft * PESOS.tendencia +
    fc * PESOS.competencia +
    fm * PESOS.margen +
    fd * PESOS.demanda +
    fo * PESOS.oportunidad;
  let pesoAplicado = PESO_BASE;

  if (fprEvaluado !== null) {
    suma += fprEvaluado * PESOS.precio_relativo;
    pesoAplicado += PESOS.precio_relativo;
  }

  if (fdenEvaluado !== null) {
    suma += fdenEvaluado * PESO_DENSIDAD;
    pesoAplicado += PESO_DENSIDAD;
  }

  const score = clamp(Math.round(suma / pesoAplicado), 0, 100);

  const estado: ViabilidadEstado =
    score >= 80 ? 'MUY_VIABLE'
    : score >= 60 ? 'VIABLE'
    : score >= 40 ? 'MODERADO'
    : score >= 20 ? 'POCO_VIABLE'
    : 'NO_RECOMENDADO';

  const factores: ViabilidadFactores = {
    tendencia:      ft,
    competencia:    fc,
    margen:         fm,
    demanda:        fd,
    oportunidad:    fo,
    precio_relativo: fpr,
  };

  // Se añade la clave SOLO si hubo medición, para que el consumidor pueda
  // distinguir "densidad baja" de "densidad no medida".
  if (fdenEvaluado !== null) factores.densidad = fdenEvaluado;

  // Mensajes explicativos
  const positivos: string[] = [];
  const negativos: string[] = [];

  if (ft >= 75) positivos.push(`Mercado en crecimiento (+${tendencias.crecimiento_porcentaje}%)`);
  else if (ft <= 40) negativos.push(`Tendencia débil o decreciente (${tendencias.crecimiento_porcentaje}%)`);

  if (fc >= 85) positivos.push('Poca competencia directa');
  else if (fc <= 40) negativos.push(`Alta competencia (${competencia.total_competidores} competidores)`);

  if (fm >= 75) positivos.push(`Margen potencial excelente (${margenPct}%)`);
  else if (fm <= 40) negativos.push(`Margen ajustado (${margenPct}%), vigilar costos`);

  if (fd >= 75) positivos.push(`Alta demanda (${tendencias.volumen_busquedas_mensual.toLocaleString()} búsquedas/mes)`);
  else if (fd <= 40) negativos.push('Demanda baja — evaluar canales de venta alternativos');

  if (fo >= 80) positivos.push(competencia.gap_detectado ?? 'Oportunidad de diferenciación detectada');
  else negativos.push('Mercado genérico, requiere diferenciación clara');

  // Mensaje de precio relativo: distingue sobreprecio de infraprecio, porque la
  // acción correctiva es opuesta en cada caso.
  if (fprEvaluado !== null) {
    const ratio = precioValido / competencia.precio_mercado_promedio;
    const deltaPct = Math.round((ratio - 1) * 100);

    if (fprEvaluado >= FPR_BUENO) {
      positivos.push(`Precio competitivo (${deltaPct > 0 ? '+' : ''}${deltaPct}% vs mercado)`);
    } else if (fprEvaluado <= FPR_AVISO) {
      if (ratio > 1) {
        negativos.push(`Precio ${deltaPct}% sobre el mercado, requiere diferenciación premium`);
      } else {
        negativos.push(`Precio ${Math.abs(deltaPct)}% por debajo del mercado — riesgo de percepción de baja calidad y guerra de precios`);
      }
    }
  }

  // Densidad: la acción correctiva es distinta a la de "muchos competidores",
  // porque aquí lo que decide es la ubicación, no la categoría.
  if (fdenEvaluado !== null && densidad) {
    if (fdenEvaluado >= DENSIDAD_BUENA) {
      positivos.push(`Zona con hueco geográfico (${densidad.competidores_km2} competidores/km²)`);
    } else if (fdenEvaluado <= DENSIDAD_AVISO) {
      negativos.push(`Zona ${densidad.interpretacion} (${densidad.competidores_km2} competidores/km²) — la ubicación exacta pesa más que el producto`);
    }
  }

  // ── Confianza del análisis ─────────────────────────────────────────────
  // Alta: ambas fuentes son reales. Media: una es real. Baja: ambas son mock.
  const confianzaFuentes: NivelConfianza =
    (!tendencias.es_mock && !competencia.es_mock) ? 'alta' :
    (!tendencias.es_mock || !competencia.es_mock) ? 'media' :
    'baja';

  // Si la densidad entró en el score, su fiabilidad también limita la del total.
  const confianza: NivelConfianza =
    fdenEvaluado !== null && densidad
      ? combinarConfianza(confianzaFuentes, densidad.confianza)
      : confianzaFuentes;

  return { score, estado, factores, factores_positivos: positivos, factores_negativos: negativos, confianza };
}