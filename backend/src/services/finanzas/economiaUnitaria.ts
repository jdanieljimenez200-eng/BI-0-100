import { r2, r4 } from '../../utils/dinero';
import { getTaxConfig } from '../../utils/taxConfig';
import type { EconomiaUnitaria, FinanzasInput } from './types';

/** «12,500 COP»: la moneda del país del negocio, nunca «$» ni MXN fijos. */
export function formatoDinero(n: number, pais: string | null | undefined): string {
  return `${Math.round(n).toLocaleString('es-MX')} ${getTaxConfig(pais).moneda}`;
}

/**
 * Lo que de verdad deja cada venta.
 *
 * Antes el modelo tomaba el precio tal cual como ingreso: un taquero que cobra
 * 100 con el IVA dentro y le paga 30 % a la app de reparto aparecía con el
 * margen de quien se queda los 100. Aquí se quita el impuesto incluido (es del
 * fisco, no del negocio), se suma la comisión al costo variable y el sueldo del
 * dueño que no estaba en los costos fijos. Sin esos datos, todo queda como antes.
 */
export function economiaUnitaria(input: FinanzasInput): EconomiaUnitaria {
  const precio = Math.max(0, Number(input.precio_venta) || 0);
  const tasa = input.precio_incluye_impuesto ? Math.max(0, Number(input.tasa_impuesto_consumo) || 0) : 0;
  const precio_neto = tasa > 0 ? r4(precio / (1 + tasa)) : precio;
  // La plataforma cobra sobre lo que paga el cliente, impuesto incluido.
  const comisionPct = Math.min(Math.max(Number(input.comision_venta_pct) || 0, 0), 100);
  const comision_unitaria = r4(precio * (comisionPct / 100));
  const costo_variable_efectivo = r4((Number(input.costo_variable_unitario) || 0) + comision_unitaria);
  const sueldo = Math.max(0, Number(input.sueldo_dueno_mensual) || 0);

  return {
    precio_neto: r2(precio_neto),
    impuesto_unitario: r2(precio - precio_neto),
    comision_unitaria: r2(comision_unitaria),
    costo_variable_efectivo: r2(costo_variable_efectivo),
    margen_unitario: r2(precio_neto - costo_variable_efectivo),
    costos_fijos_efectivos: r2((Number(input.costos_fijos_mensuales) || 0) + sueldo),
  };
}

/**
 * Serie desplazada por un plazo en días: lo vendido en el mes m se cobra
 * `dias / 30` meses después (repartido entre dos meses si no es exacto). Lo
 * que se cobra después del mes 12 no entra: es dinero que sigue en la calle.
 */
export function desplazarPorDias(serie: number[], dias: number | null | undefined): number[] {
  const d = Math.max(0, Number(dias) || 0);
  if (d === 0) return [...serie];
  const meses = d / 30;
  const k = Math.floor(meses);
  const fraccion = meses - k;
  const valor = (i: number) => (i >= 0 && i < serie.length ? serie[i] : 0);
  return serie.map((_, m) => (1 - fraccion) * valor(m - k) + fraccion * valor(m - k - 1));
}
