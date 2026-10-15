/**
 * Comisión de terminales, pasarelas y apps de delivery. Gemelo de
 * `calcularDesgloseComision` en `backend/src/services/contabilidad/comisionesService.ts`:
 * se mueven juntos, porque lo que el POS anuncia antes de cobrar tiene que ser
 * lo que después se registra en Contabilidad.
 *
 * Unidades: `comision_porcentaje` y las retenciones se guardan como FRACCIÓN
 * (0.036 = 3.6 %). El POS las mostraba como «0.036%» y calculaba
 * `total × 0.036 / 100`: la comisión anunciada era 100 veces menor que la
 * registrada, y por eso «cambiaba» después de cobrar.
 */
import { r2 } from './dinero';

export interface CanalComision {
  comision_porcentaje: number | string;
  comision_fija: number | string;
  /** Si la terminal cobra IVA sobre su comisión (true por defecto, como la columna). */
  aplica_iva_comision?: boolean | null;
  retencion_isr_porcentaje?: number | string | null;
  retencion_iva_porcentaje?: number | string | null;
}

export interface DesgloseComision {
  comisionBase: number;
  comisionIva: number;
  retencionIsr: number;
  retencionIva: number;
  totalDeducciones: number;
  montoNeto: number;
}

const num = (v: unknown) => Math.max(0, Number(v) || 0);

/**
 * @param montoBruto lo que pagó el cliente
 * @param tasaIvaPais IVA del país (0.16 en México, 0.19 en Colombia…), para el IVA de la comisión
 * @param impuestoEnBruto impuesto al consumo que ya trae el precio: las
 *   retenciones de plataformas se calculan sobre la venta sin él
 */
export function calcularDesgloseComision(
  montoBruto: number,
  canal: CanalComision,
  tasaIvaPais: number,
  impuestoEnBruto = 0,
): DesgloseComision {
  const bruto = num(montoBruto);
  const baseRetencion = Math.max(0, bruto - num(impuestoEnBruto));
  const comisionBase = r2(bruto * num(canal.comision_porcentaje) + num(canal.comision_fija));
  const comisionIva = canal.aplica_iva_comision !== false ? r2(comisionBase * tasaIvaPais) : 0;
  const retencionIsr = r2(baseRetencion * num(canal.retencion_isr_porcentaje));
  const retencionIva = r2(baseRetencion * num(canal.retencion_iva_porcentaje));
  const totalDeducciones = r2(comisionBase + comisionIva + retencionIsr + retencionIva);
  return {
    comisionBase,
    comisionIva,
    retencionIsr,
    retencionIva,
    totalDeducciones,
    montoNeto: r2(Math.max(0, bruto - totalDeducciones)),
  };
}

/**
 * Precio al público para que lleguen `netoDeseado` al banco. Gemelo de
 * `calcularPrecioObjetivo` del backend.
 */
export function calcularPrecioObjetivo(
  netoDeseado: number,
  canal: CanalComision,
  tasaIvaPais: number,
  precioIncluyeImpuesto = false,
): { precioSugerido: number; desglose: DesgloseComision } {
  const neto = num(netoDeseado);
  const factorIvaComision = canal.aplica_iva_comision !== false ? 1 + tasaIvaPais : 1;
  const factorBase = precioIncluyeImpuesto && tasaIvaPais > 0 ? 1 / (1 + tasaIvaPais) : 1;
  const tasaTotal =
    num(canal.comision_porcentaje) * factorIvaComision +
    (num(canal.retencion_isr_porcentaje) + num(canal.retencion_iva_porcentaje)) * factorBase;
  const costoFijoTotal = num(canal.comision_fija) * factorIvaComision;
  const precioSugerido = tasaTotal < 1 ? r2((neto + costoFijoTotal) / (1 - tasaTotal)) : neto;
  const ivaDentro = precioIncluyeImpuesto && tasaIvaPais > 0 ? r2(precioSugerido - precioSugerido / (1 + tasaIvaPais)) : 0;
  return { precioSugerido, desglose: calcularDesgloseComision(precioSugerido, canal, tasaIvaPais, ivaDentro) };
}

/** Fracción guardada → texto para la pantalla: 0.036 → «3.6 %». */
export function textoPorcentaje(fraccion: number | string | null | undefined, locale = 'es-MX'): string {
  return `${r2(num(fraccion) * 100).toLocaleString(locale, { maximumFractionDigits: 2 })} %`;
}
