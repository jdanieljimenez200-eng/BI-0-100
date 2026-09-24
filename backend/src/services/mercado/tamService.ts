import { TamResult, TamEscenario, MesEstacional } from './types';
import { getPoblacionRegion, NSE_PCT, getPaisInfo } from '../../utils/latam';
import { paisTieneTablaNse, paisTieneCalendarioComercial } from './coberturaPais';

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface TamInput {
  pais: string;              // ISO code: 'MX', 'CO', etc.
  region?: string | null;    // e.g. 'Jalisco', 'Antioquia'
  scope: 'local' | 'nacional' | 'regional';
  nseTarget?: string | null; // e.g. 'C+', 'AB', 'D+'
  precioUnitario: number;    // precio de venta del producto/servicio
  categoria: string;         // para estacionalidad
  margenPct: number;         // margen neto estimado (0-100)
  frecuenciaCompraAnual?: number; // veces al año que un cliente compra (default 1)
}

// ─── Penetración por escenario ───────────────────────────────────────────────

const PENETRACION = {
  pesimista: 0.1,   // 0.1%
  realista:  0.25,  // 0.25%
  optimista: 0.5,   // 0.5%
} as const;

// ─── Estacionalidad por categoría ────────────────────────────────────────────

const ESTACIONALIDAD: Record<string, MesEstacional[]> = {
  alimentos: [
    { mes: 'Enero', factor: 0.85, razon: 'Post-fiestas, menor gasto' },
    { mes: 'Febrero', factor: 0.9, razon: 'Recuperación gradual' },
    { mes: 'Marzo', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Abril', factor: 1.05, razon: 'Semana Santa impulsa consumo' },
    { mes: 'Mayo', factor: 1.1, razon: 'Día de las Madres' },
    { mes: 'Junio', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Julio', factor: 0.95, razon: 'Vacaciones escolares' },
    { mes: 'Agosto', factor: 0.95, razon: 'Regreso a clases' },
    { mes: 'Septiembre', factor: 1.05, razon: 'Fiestas patrias' },
    { mes: 'Octubre', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Noviembre', factor: 1.15, razon: 'Buen Fin / Black Friday' },
    { mes: 'Diciembre', factor: 1.4, razon: 'Temporada navideña' },
  ],
  tecnologia: [
    { mes: 'Enero', factor: 0.8, razon: 'Post-compras navideñas' },
    { mes: 'Febrero', factor: 0.85, razon: 'Bajo consumo' },
    { mes: 'Marzo', factor: 0.9, razon: 'Recuperación gradual' },
    { mes: 'Abril', factor: 0.95, razon: 'Mes estándar' },
    { mes: 'Mayo', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Junio', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Julio', factor: 1.05, razon: 'Ofertas de mitad de año' },
    { mes: 'Agosto', factor: 1.1, razon: 'Regreso a clases' },
    { mes: 'Septiembre', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Octubre', factor: 1.05, razon: 'Lanzamientos de temporada' },
    { mes: 'Noviembre', factor: 1.5, razon: 'Buen Fin / Black Friday / Cyber Monday' },
    { mes: 'Diciembre', factor: 1.4, razon: 'Regalos navideños' },
  ],
  moda: [
    { mes: 'Enero', factor: 1.1, razon: 'Rebajas de temporada' },
    { mes: 'Febrero', factor: 1.05, razon: 'San Valentín' },
    { mes: 'Marzo', factor: 1.0, razon: 'Cambio primavera' },
    { mes: 'Abril', factor: 0.95, razon: 'Mes estándar' },
    { mes: 'Mayo', factor: 1.1, razon: 'Día de las Madres' },
    { mes: 'Junio', factor: 0.9, razon: 'Entretemporada' },
    { mes: 'Julio', factor: 1.1, razon: 'Rebajas de verano' },
    { mes: 'Agosto', factor: 0.95, razon: 'Regreso a clases' },
    { mes: 'Septiembre', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Octubre', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Noviembre', factor: 1.3, razon: 'Buen Fin / Black Friday' },
    { mes: 'Diciembre', factor: 1.35, razon: 'Temporada navideña' },
  ],
  servicios: [
    { mes: 'Enero', factor: 0.8, razon: 'Cuesta de enero' },
    { mes: 'Febrero', factor: 0.9, razon: 'Recuperación lenta' },
    { mes: 'Marzo', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Abril', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Mayo', factor: 1.05, razon: 'Actividad económica' },
    { mes: 'Junio', factor: 1.0, razon: 'Mes estándar' },
    { mes: 'Julio', factor: 0.9, razon: 'Vacaciones, menor demanda' },
    { mes: 'Agosto', factor: 0.95, razon: 'Mes estándar' },
    { mes: 'Septiembre', factor: 1.05, razon: 'Reactivación post-verano' },
    { mes: 'Octubre', factor: 1.05, razon: 'Mes estándar' },
    { mes: 'Noviembre', factor: 1.1, razon: 'Fin de año empresarial' },
    { mes: 'Diciembre', factor: 1.1, razon: 'Cierre fiscal, bonos' },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Alias aceptados desde el formulario → claves canónicas de NSE_PCT.
// El NSE alto se reporta como "A/B" en AMAI, pero la tabla usa la clave 'ab'.
const NSE_ALIASES: Record<string, string> = {
  'a': 'ab',
  'b': 'ab',
  'ab': 'ab',
  'a/b': 'ab',
  'a-b': 'ab',
  'ayb': 'ab',
  'c+': 'c+',
  'c': 'c',
  'c-': 'c-',
  'd+': 'd+',
  'd': 'd',
  'e': 'e',
};

/**
 * Convierte el texto libre de nse_target en claves válidas de NSE_PCT.
 * Acepta "A/B", "nse c+", "C+, C", "D+ y D". Devuelve [] si nada coincide.
 */
function resolveNseKeys(raw: string): string[] {
  const bruto = raw.toLowerCase().replace(/nse/g, ' ').trim();
  if (!bruto) return [];

  const keys: string[] = [];
  for (const parte of bruto.split(/[,;]|\s+y\s+/)) {
    const limpio = parte.replace(/\s+/g, '');
    if (!limpio) continue;

    const canon = NSE_ALIASES[limpio]
      ?? (Object.prototype.hasOwnProperty.call(NSE_PCT, limpio) ? limpio : undefined);

    if (canon && !keys.includes(canon)) keys.push(canon);
  }
  return keys;
}

function getEstacionalidad(categoria: string): MesEstacional[] | undefined {
  const cat = categoria.toLowerCase();
  if (cat.includes('alimento') || cat.includes('comida') || cat.includes('bebida') || cat.includes('food')) {
    return ESTACIONALIDAD.alimentos;
  }
  if (cat.includes('tecnolog') || cat.includes('electr') || cat.includes('software') || cat.includes('tech') || cat.includes('comput')) {
    return ESTACIONALIDAD.tecnologia;
  }
  if (cat.includes('moda') || cat.includes('ropa') || cat.includes('calzado') || cat.includes('textil') || cat.includes('fashion')) {
    return ESTACIONALIDAD.moda;
  }
  if (cat.includes('servicio') || cat.includes('consult') || cat.includes('service') || cat.includes('saas')) {
    return ESTACIONALIDAD.servicios;
  }
  return undefined;
}

function buildEscenario(
  poblacionObjetivo: number,
  precioUnitario: number,
  margenPct: number,
  penetracionPct: number,
  frecuencia: number,
): TamEscenario {
  const clientesPotenciales = Math.round(poblacionObjetivo * (penetracionPct / 100));
  const unidadesMes = Math.round((clientesPotenciales * frecuencia) / 12);
  const mercadoMensual = Math.round(unidadesMes * precioUnitario);
  const mercadoAnual = mercadoMensual * 12;
  const gananciaMes = Math.round(mercadoMensual * (margenPct / 100));

  return {
    penetracion: penetracionPct,
    mercado_anual: mercadoAnual,
    mercado_mensual: mercadoMensual,
    unidades_mes: unidadesMes,
    ganancia_mes: gananciaMes,
  };
}

/**
 * Traduce el modelo de cobro del formulario a "veces que un cliente paga al año".
 * - Pago Único → 1 compra al año.
 * - Suscripción → un pago al mes, acotado a los meses de permanencia declarados
 *   (tope 12, porque el TAM se proyecta a un año).
 * Cualquier valor ausente o inválido cae en el caso conservador.
 */
export function calcularFrecuenciaCompraAnual(
  formaCobro?: string | null,
  recurrenciaMeses?: number | null,
): number {
  const esSuscripcion = (formaCobro ?? '').toLowerCase().startsWith('suscrip');
  if (!esSuscripcion) return 1;

  const meses = Number(recurrenciaMeses);
  if (!Number.isFinite(meses) || meses < 1) return 12;
  return Math.min(Math.floor(meses), 12);
}

// ─── Función principal ───────────────────────────────────────────────────────

export function calcularTam(input: TamInput): TamResult {
  const {
    pais,
    region,
    scope,
    nseTarget,
    precioUnitario,
    categoria,
    margenPct,
    frecuenciaCompraAnual = 1,
  } = input;

  const paisInfo = getPaisInfo(pais);
  const moneda = paisInfo.moneda;

  // 1. Determinar población base según scope
  let poblacionBase: number;
  let ubicacion: string;

  switch (scope) {
    case 'nacional':
      poblacionBase = paisInfo.poblacion;
      ubicacion = paisInfo.nombre;
      break;
    case 'local':
    case 'regional':
    default:
      poblacionBase = getPoblacionRegion(pais, region);
      ubicacion = region
        ? `${region}, ${paisInfo.nombre}`
        : paisInfo.nombre;
      break;
  }

  const advertencias: string[] = [];

  // Un negocio de barrio no vende a todo el estado. No tenemos población por
  // colonia, así que se dice de qué base salió el número en vez de presentarlo
  // como si fuera el mercado de la puerta de al lado.
  if (scope === 'local') {
    advertencias.push(
      `La base son los ${poblacionBase.toLocaleString('es-MX')} habitantes de ${ubicacion}, no los de tu zona inmediata: si atiendes solo un barrio, tu mercado real es una fracción de esto.`
    );
  }

  // 2. Aplicar filtro NSE si se proporcionó.
  //    Solo donde existe una tabla real: NSE_PCT es la clasificación AMAI de
  //    México y multiplicarla en Colombia (estratos 1-6) o Brasil (clases con
  //    otros cortes) daba un recorte de población sin ningún respaldo.
  let nseAplicado: string | undefined;
  let pctMercadoNse: number | undefined;

  if (nseTarget && !paisTieneTablaNse(pais)) {
    advertencias.push(
      `No aplicamos el filtro de nivel socioeconómico: la tabla que usamos es la clasificación AMAI de México y no describe la estructura de ${paisInfo.nombre}.`
    );
  } else if (nseTarget) {
    const nseKeys = resolveNseKeys(nseTarget);
    // Varios segmentos suman su porcentaje de población (tope 100%).
    const pctNse = Math.min(
      nseKeys.reduce((acc, key) => acc + (NSE_PCT[key] ?? 0), 0),
      1,
    );

    if (pctNse > 0) {
      poblacionBase = Math.round(poblacionBase * pctNse);
      nseAplicado = nseKeys.map((key) => key.toUpperCase()).join(', ');
      pctMercadoNse = Math.round(pctNse * 100);
    }
  }

  // 3. Calcular escenarios
  const pesimista = buildEscenario(poblacionBase, precioUnitario, margenPct, PENETRACION.pesimista, frecuenciaCompraAnual);
  const realista = buildEscenario(poblacionBase, precioUnitario, margenPct, PENETRACION.realista, frecuenciaCompraAnual);
  const optimista = buildEscenario(poblacionBase, precioUnitario, margenPct, PENETRACION.optimista, frecuenciaCompraAnual);

  // 4. TAM por escenario. El mercado total sin penetración no se expone porque
  //    ni el frontend ni los prompts lo consumen.
  const tamMinimo = pesimista.mercado_anual;
  const tamMaximo = optimista.mercado_anual;
  const tamPromedio = realista.mercado_anual;

  // 5. Estacionalidad: el calendario comercial que tenemos (Buen Fin, fiestas
  //    patrias, cuesta de enero) es mexicano. En otro país no se muestra.
  const estacionalidad = paisTieneCalendarioComercial(pais) ? getEstacionalidad(categoria) : undefined;
  if (!paisTieneCalendarioComercial(pais) && getEstacionalidad(categoria)) {
    advertencias.push(
      `No mostramos estacionalidad: nuestro calendario comercial es el mexicano y no aplica a ${paisInfo.nombre}.`
    );
  }

  return {
    scope,
    pais,
    moneda,
    ubicacion,
    tam_minimo: tamMinimo,
    tam_maximo: tamMaximo,
    tam_promedio: tamPromedio,
    tam_escenarios: {
      pesimista,
      realista,
      optimista,
    },
    ...(nseAplicado ? { nse_aplicado: nseAplicado } : {}),
    ...(pctMercadoNse ? { pct_mercado_nse: pctMercadoNse } : {}),
    ...(estacionalidad ? { estacionalidad } : {}),
    // Los tres escenarios son penetraciones supuestas sobre población, no una
    // medición: se declara para que la pantalla no los presente como un hecho.
    supuestos: {
      penetracion_pct: {
        pesimista: PENETRACION.pesimista,
        realista: PENETRACION.realista,
        optimista: PENETRACION.optimista,
      },
      poblacion_base: poblacionBase,
      advertencias,
    },
  };
}