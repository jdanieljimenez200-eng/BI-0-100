import { CAPABILITIES, CapabilityKey } from './planService';

/**
 * Catálogo de herramientas contratables del "sistema computacional".
 * Cada entrada es una CapabilityKey de grupo 'herramientas' con su precio
 * mensual como add-on. La herramienta INCLUIDA del plan Business sale gratis;
 * estos precios aplican a partir de la 2ª herramienta.
 *
 * Los precios son coherentes con el escalón pro 199 / business 499 MXN: cada
 * extra queda por debajo del salto de plan para que activar 2–3 tenga sentido.
 */
export interface ServicioMeta {
  key: HerramientaKey;
  label: string;
  precio_mxn: number; // mensual, como subscription item adicional
}

// Solo las capacidades de grupo 'herramientas' son contratables como servicio.
export type HerramientaKey = Extract<
  (typeof CAPABILITIES)[number],
  { grupo: 'herramientas' }
>['key'];

export const SERVICIOS_CATALOGO: Record<HerramientaKey, ServicioMeta> = {
  pos:          { key: 'pos',          label: 'Punto de Venta',    precio_mxn: 149 },
  contabilidad: { key: 'contabilidad', label: 'Reportes',          precio_mxn: 149 },
  inventario:   { key: 'inventario',   label: 'Inventario',        precio_mxn: 99 },
  nomina:       { key: 'nomina',       label: 'Personal & Nómina', precio_mxn: 99 },
  cotizaciones: { key: 'cotizaciones', label: 'Cotizaciones',      precio_mxn: 69 },
  clientes:     { key: 'clientes',     label: 'Clientes (CRM)',    precio_mxn: 69 },
  citas:        { key: 'citas',        label: 'Reservas & Citas',  precio_mxn: 69 },
  mantenimientos: { key: 'mantenimientos', label: 'Mantenimientos', precio_mxn: 69 },
};

/** Lista ordenada por precio descendente (para render de UI). */
export const SERVICIOS_LISTA: ServicioMeta[] = Object.values(SERVICIOS_CATALOGO)
  .sort((a, b) => b.precio_mxn - a.precio_mxn);

export function esHerramientaContratable(key: string): key is HerramientaKey {
  return Object.prototype.hasOwnProperty.call(SERVICIOS_CATALOGO, key);
}

export function getPrecioServicio(key: HerramientaKey): number {
  return SERVICIOS_CATALOGO[key].precio_mxn;
}

// Exhaustividad en compilación: si se añade una herramienta a CAPABILITIES y no
// se le pone precio aquí, el objeto SERVICIOS_CATALOGO deja de tipar. Además
// verificamos que no sobre ninguna clave.
type _CatalogoServiciosCompleto =
  Exclude<HerramientaKey, keyof typeof SERVICIOS_CATALOGO> extends never ? true : never;
const _exhaustividad: _CatalogoServiciosCompleto = true;
void _exhaustividad;
