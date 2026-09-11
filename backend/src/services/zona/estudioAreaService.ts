/**
 * estudioAreaService.ts
 * Estudio estimado del ÁREA: qué implica en dinero el espacio que necesita el
 * negocio. Cruza los m² dimensionados con las dos referencias de la zona —renta
 * mensual por m² y precio de VENTA por m²— para responder a "¿cuánto cuesta
 * ocupar este espacio y cuánto costaría comprarlo?".
 *
 * Reglas heredadas del resto del módulo de zona:
 *  - Ningún número se inventa: si falta una fuente, el campo viaja como `null`
 *    y la `nota` dice exactamente qué dato falta.
 *  - La confianza del estudio es la de la PEOR fuente que lo alimenta.
 *  - El veredicto es una comparación aritmética entre rentar y comprar, NO una
 *    recomendación de inversión, y sólo se emite si la confianza lo aguanta.
 */

import { calcularSuperficie } from './superficieService';
import { calcularRentaZona } from './rentaZonaService';
import { obtenerPrecioVentaM2 } from './precioViviendaService';
import { EstudioAreaInput, EstudioAreaResult, VeredictoArea } from './types';
import { combinarConfianza, esAlMenos } from '../../utils/confianza';
import { redondearA } from '../../utils/curvas';

/** Yield bruto anual (renta anual / precio de compra) que inclina la balanza. */
const YIELD_COMPRAR_PCT = 8;
const YIELD_RENTAR_PCT = 5;

export async function calcularEstudioArea(input: EstudioAreaInput): Promise<EstudioAreaResult> {
  const renta = await calcularRentaZona(input);

  // Sin local no hay área que valorar, y eso también es una conclusión.
  if (input.tipo_local === 'sin_local') {
    return {
      m2_totales: null,
      fuente_superficie: 'no_aplica',
      renta,
      renta_mensual: renta.renta_mensual,
      renta_anual: renta.renta_mensual !== null ? redondearA(renta.renta_mensual * 12, 2) : null,
      precio_venta_m2: null,
      valor_compra_estimado: null,
      yield_bruto_anual_pct: null,
      meses_renta_equivalentes: null,
      multiplo_precio_renta_anual: null,
      moneda: renta.moneda,
      veredicto: 'sin_conclusion',
      nivel_confianza: 'alta',
      advertencias: [...renta.advertencias],
      supuestos: [],
      nota: 'La operación se declaró sin local físico: no hay área que valorar ni compra que comparar.',
    };
  }

  // Se recalcula la superficie (función pura, determinista) para exponer sus
  // supuestos y su fuente, que rentaZonaService consume pero no devuelve.
  const superficie = calcularSuperficie({
    tipo_local: input.tipo_local,
    unidades_mes: input.unidades_mes,
    personal: input.personal,
    m2_declarados: input.m2_declarados,
  });

  const venta = await obtenerPrecioVentaM2({
    precio_venta_m2_declarado: input.precio_venta_m2_declarado,
    pais: input.pais,
    estado: input.estado,
    zona: input.zona,
    moneda: input.moneda ?? renta.moneda ?? undefined,
  });

  const m2 = superficie.m2_totales;
  const renta_mensual =
    renta.renta_mensual !== null && renta.renta_mensual > 0 ? renta.renta_mensual : null;
  const renta_anual = renta_mensual !== null ? redondearA(renta_mensual * 12, 2) : null;

  const valor_compra_estimado =
    m2 !== null && venta.precio_venta_m2 !== null ? Math.round(m2 * venta.precio_venta_m2) : null;

  const yield_bruto_anual_pct =
    valor_compra_estimado !== null && valor_compra_estimado > 0 && renta_anual !== null
      ? redondearA((renta_anual / valor_compra_estimado) * 100, 2)
      : null;

  const meses_renta_equivalentes =
    valor_compra_estimado !== null && renta_mensual !== null
      ? Math.round(valor_compra_estimado / renta_mensual)
      : null;

  const multiplo_precio_renta_anual =
    valor_compra_estimado !== null && renta_anual !== null && renta_anual > 0
      ? redondearA(valor_compra_estimado / renta_anual, 1)
      : null;

  const nivel_confianza = combinarConfianza(renta.nivel_confianza, venta.nivel_confianza);

  const advertencias = [...renta.advertencias];
  if (venta.fuente === 'sin_fuente') {
    advertencias.push(venta.nota);
  } else if (venta.fuente === 'tabla_operador') {
    advertencias.push(
      `El precio de venta por m² es una referencia de ${venta.zona_consultada}, no la tasación de un inmueble concreto.`,
    );
  }
  if (
    renta.moneda !== null &&
    venta.moneda !== null &&
    renta.moneda.toUpperCase() !== venta.moneda.toUpperCase()
  ) {
    advertencias.push(
      `La renta está en ${renta.moneda} y el precio de venta en ${venta.moneda}: la comparación entre rentar y comprar no es directa hasta unificar la moneda.`,
    );
  }
  if (yield_bruto_anual_pct !== null) {
    advertencias.push(
      'La comparación entre rentar y comprar es aritmética y bruta: no descuenta mantenimiento, predial, escrituración ni costo del crédito.',
    );
  }

  let veredicto: VeredictoArea = 'sin_conclusion';
  if (yield_bruto_anual_pct !== null && esAlMenos(nivel_confianza, 'media')) {
    if (yield_bruto_anual_pct >= YIELD_COMPRAR_PCT) veredicto = 'comprar';
    else if (yield_bruto_anual_pct <= YIELD_RENTAR_PCT) veredicto = 'rentar';
    else veredicto = 'equilibrado';
  }

  let nota: string;
  if (valor_compra_estimado !== null && renta_mensual !== null) {
    nota =
      `${m2} m² × ${venta.precio_venta_m2} de venta por m² = ${valor_compra_estimado} para comprar el espacio. ` +
      `A ${renta_mensual}/mes de renta equivale a ${meses_renta_equivalentes} meses de ocupación ` +
      `(yield bruto ${yield_bruto_anual_pct}% anual, múltiplo ${multiplo_precio_renta_anual}× la renta anual).`;
  } else if (valor_compra_estimado !== null) {
    nota = `Comprar los ${m2} m² costaría del orden de ${valor_compra_estimado}, pero falta la renta mensual para comparar con rentar.`;
  } else if (renta_mensual !== null) {
    nota = `Renta de ${renta_mensual}/mes por ${m2} m²; falta el precio de venta por m² de la zona para valorar la compra.`;
  } else {
    nota = 'Faltan la renta mensual y el precio de venta por m² de la zona: todavía no hay estudio del área que sostener.';
  }

  return {
    m2_totales: m2,
    fuente_superficie: superficie.fuente,
    renta,
    renta_mensual,
    renta_anual,
    precio_venta_m2: venta.precio_venta_m2,
    valor_compra_estimado,
    yield_bruto_anual_pct,
    meses_renta_equivalentes,
    multiplo_precio_renta_anual,
    moneda: venta.moneda ?? renta.moneda ?? input.moneda ?? null,
    veredicto,
    nivel_confianza,
    advertencias,
    supuestos: [...superficie.supuestos],
    nota,
  };
}