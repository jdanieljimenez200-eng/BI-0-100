/**
 * precioViviendaService.ts
 * Precio de VENTA por m² de la zona (vivienda o local en venta). Mismo criterio
 * que precioM2Service: NO existe tabla hardcodeada de precios de mercado, porque
 * inventar el valor de compra de un local sería el mismo error que inventar su
 * renta. Fuentes admitidas, en orden de prioridad:
 *
 *   1. `precio_venta_m2_declarado` — tasación, anuncio o cierre que el usuario ya
 *      tiene en la mano (confianza alta).
 *   2. `ZONA_VENTA_API_URL` — servicio externo consultable, con la misma
 *      degradación elegante del resto de integraciones: si falla, se cae al 3.
 *   3. `ZONA_VENTA_M2_JSON` — tabla que el operador de la plataforma carga con
 *      SUS propias cifras, versionada por env y no por código.
 *
 * Sin ninguna fuente devuelve `precio_venta_m2: null` con `es_mock: true`. Aguas
 * abajo eso significa "no hay valor de compra derivable", nunca un número
 * inventado.
 */

import { PrecioVentaM2Consulta, PrecioVentaM2Result } from './types';
import { etiquetaZona } from './precioM2Service';
import { crearTablaZonaEnv, esNumeroUtil } from './tablaZonaEnv';
import { NivelConfianza } from '../../utils/confianza';
import { redondearA } from '../../utils/curvas';

const TIMEOUT_MS = 8000;

/**
 * Techo alto a propósito: el m² se cotiza en la moneda local y en COP o ARS un
 * precio por m² de siete cifras es normal. Sólo filtra valores absurdos.
 */
const PRECIO_VENTA_M2_MAXIMO = 100_000_000;

/** Muestras a partir de las cuales una media de zona deja de ser frágil. */
const MUESTRAS_CONFIANZA_ALTA = 5;

const tabla = crearTablaZonaEnv({
  envVar: 'ZONA_VENTA_M2_JSON',
  campoValor: 'precio_venta_m2',
  maximo: PRECIO_VENTA_M2_MAXIMO,
});

async function consultarApiExterna(
  consulta: PrecioVentaM2Consulta,
): Promise<PrecioVentaM2Result | null> {
  const base = process.env.ZONA_VENTA_API_URL;
  if (!base) return null;

  const url = new URL(base);
  if (consulta.pais)   url.searchParams.set('pais', consulta.pais);
  if (consulta.estado) url.searchParams.set('estado', consulta.estado);
  if (consulta.zona)   url.searchParams.set('zona', consulta.zona);

  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = process.env.ZONA_VENTA_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`ZONA_VENTA_API error: ${res.status}`);

    const data = (await res.json()) as {
      precio_venta_m2?: unknown;
      moneda?: unknown;
      n_muestras?: unknown;
    };
    if (!esNumeroUtil(data?.precio_venta_m2, PRECIO_VENTA_M2_MAXIMO)) {
      throw new Error('respuesta sin precio_venta_m2 utilizable');
    }

    const muestras =
      typeof data.n_muestras === 'number' && Number.isFinite(data.n_muestras) ? data.n_muestras : 0;
    const nivel_confianza: NivelConfianza = muestras >= MUESTRAS_CONFIANZA_ALTA ? 'alta' : 'media';
    const zona_consultada = etiquetaZona(consulta);

    return {
      precio_venta_m2: redondearA(data.precio_venta_m2, 2),
      moneda: typeof data.moneda === 'string' ? data.moneda : (consulta.moneda ?? null),
      zona_consultada,
      fuente: 'api_externa',
      es_mock: false,
      nivel_confianza,
      nota: muestras > 0
        ? `Precio de venta por m² de ${zona_consultada} según el servicio externo (${muestras} muestras).`
        : `Precio de venta por m² de ${zona_consultada} según el servicio externo.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function obtenerPrecioVentaM2(
  consulta: PrecioVentaM2Consulta,
): Promise<PrecioVentaM2Result> {
  const zona_consultada = etiquetaZona(consulta);

  // 1. Declarado por el usuario: nada le gana en fiabilidad.
  if (esNumeroUtil(consulta.precio_venta_m2_declarado, PRECIO_VENTA_M2_MAXIMO)) {
    return {
      precio_venta_m2: redondearA(consulta.precio_venta_m2_declarado, 2),
      moneda: consulta.moneda ?? null,
      zona_consultada,
      fuente: 'declarado',
      es_mock: false,
      nivel_confianza: 'alta',
      nota: 'Precio de venta por m² declarado por ti (tasación, anuncio o cierre).',
    };
  }

  // 2. Servicio externo, si está configurado.
  try {
    const externo = await consultarApiExterna(consulta);
    if (externo) return externo;
  } catch (err) {
    console.warn(
      'Consulta de precio de venta por m² al servicio externo falló, se intenta la tabla del operador:',
      err,
    );
  }

  // 3. Tabla cargada por el operador vía env.
  const enTabla = tabla.buscar(consulta);
  if (enTabla) {
    return {
      precio_venta_m2: redondearA(enTabla.entrada.valor, 2),
      moneda: enTabla.entrada.moneda ?? consulta.moneda ?? null,
      zona_consultada,
      fuente: 'tabla_operador',
      // Referencia curada a nivel de país/estado/zona, no la tasación de un
      // inmueble concreto: media, nunca alta.
      nivel_confianza: 'media',
      es_mock: false,
      nota: `Referencia de precio de venta por m² a nivel de ${enTabla.especificidad} (tabla de la plataforma).`,
    };
  }

  // 4. Sin fuente: no se inventa un precio.
  return {
    precio_venta_m2: null,
    moneda: consulta.moneda ?? null,
    zona_consultada,
    fuente: 'sin_fuente',
    es_mock: true,
    nivel_confianza: 'baja',
    nota: `No hay fuente de precio de venta por m² para ${zona_consultada}. Declara el precio del m² en venta de tu zona para valorar la compra del local.`,
  };
}

/** Para tests: limpia la caché de la tabla del operador. */
export function resetCachePrecioVenta(): void {
  tabla.reset();
}