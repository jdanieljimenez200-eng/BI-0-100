// Servicio puro de POS — sin DB ni HTTP. Cálculo de totales, impuestos por país,
// generación de folio. Las funciones del orchestrator (rutas) consumen esto.

import { getTaxConfig, impuestoIncluido } from '../../utils/taxConfig';
import { r2 } from '../../utils/dinero';
import { telefonoWhatsApp } from '../../utils/whatsapp';

export interface CarritoLinea {
  item_pos_id?: string | null;
  nombre: string;          // snapshot
  precio_unitario: number; // precio al público, con el impuesto incluido
  cantidad: number;
}

export interface TotalesVenta {
  /** Sin impuesto (total − impuesto). */
  subtotal: number;
  impuesto_monto: number;
  impuesto_tasa: number;
  impuesto_nombre: string;
  moneda: string;
  /** Lo que paga el cliente: la suma de precio × cantidad. */
  total: number;
  /** `subtotal_linea` va SIN impuesto: con él se miden márgenes y ventas por producto. */
  lineas: Array<CarritoLinea & { subtotal_linea: number }>;
}

/**
 * Totales de una venta del POS.
 *
 * El precio del catálogo es el precio al público, con el impuesto incluido:
 * total = Σ precio × cantidad, y el impuesto se desglosa dentro con la tasa del
 * país del producto. Antes se sumaba encima: 3 tamales de $25 se cobraban $87.
 * Si el negocio no cobra el impuesto (`cobraImpuesto: false`: monotributo,
 * Nuevo RUS, no responsable de IVA), el total es el mismo y no se registra
 * impuesto.
 *
 * @param paisProducto País del Producto SSOT (ej. "MX", "CO", "AR")
 */
export function calcularTotalesVenta(
  lineas: CarritoLinea[],
  paisProducto: string,
  opciones: { cobraImpuesto?: boolean } = {}
): TotalesVenta {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new Error('El carrito está vacío');
  }

  const conImporte = lineas.map((l) => {
    const cantidad = Number(l.cantidad);
    const precio = Number(l.precio_unitario);
    if (!isFinite(cantidad) || cantidad <= 0) throw new Error(`Cantidad inválida para "${l.nombre}"`);
    if (!isFinite(precio) || precio < 0) throw new Error(`Precio inválido para "${l.nombre}"`);
    return { ...l, precio_unitario: precio, cantidad, importe: r2(precio * cantidad) };
  });

  const cfg = getTaxConfig(paisProducto);
  const tasa = opciones.cobraImpuesto === false ? 0 : cfg.consumo.tasa;
  const total = r2(conImporte.reduce((suma, l) => suma + l.importe, 0));
  const impuesto = impuestoIncluido(total, tasa);
  const subtotal = r2(total - impuesto);

  // Cada línea sin impuesto; el centavo que deja el redondeo va a la línea más
  // grande para que las líneas sumen exactamente el subtotal.
  const netas = conImporte.map((l) => (tasa > 0 ? r2(l.importe / (1 + tasa)) : l.importe));
  const resto = r2(subtotal - netas.reduce((suma, x) => suma + x, 0));
  if (resto !== 0) {
    const mayor = conImporte.reduce((iMax, l, i, arr) => (l.importe > arr[iMax].importe ? i : iMax), 0);
    netas[mayor] = r2(netas[mayor] + resto);
  }

  return {
    subtotal,
    impuesto_monto: impuesto,
    impuesto_tasa: tasa,
    impuesto_nombre: cfg.consumo.nombre,
    moneda: cfg.moneda,
    total,
    lineas: conImporte.map(({ importe: _importe, ...l }, i) => ({ ...l, subtotal_linea: netas[i] })),
  };
}

/** Máximo de líneas en el mensaje: un ticket enorme no cabe en un enlace wa.me. */
const MAX_LINEAS_WHATSAPP = 25;

/**
 * Enlace wa.me con el ticket completo en el texto: el cliente abre WhatsApp y
 * solo presiona «Enviar». Antes llevaba un enlace a `/ticket/:id`, una página
 * que no existía (404): el detalle va en el propio mensaje y ninguna venta
 * queda publicada en una URL abierta.
 *
 * Un teléfono nacional («55 1234 5678») recibe la lada del país del producto.
 */
export function buildWhatsAppLink(opts: {
  telefono?: string | null;          // ej. "55 1234 5678", "+525512345678" o "525512345678"
  pais?: string | null;              // ISO del producto; sin él, México
  nombreNegocio: string;
  numeroTicket: string;
  fecha?: string | null;
  /** Lo que ve el cliente: cantidad, nombre e importe con impuesto. */
  lineas: Array<{ nombre: string; cantidad: number; importe: number }>;
  total: number;
  /** Impuesto incluido en el total; null si el negocio no lo cobra. */
  impuesto?: { nombre: string; monto: number } | null;
  moneda: string;
  simbolo: string;
  locale?: string;
}): string {
  const telefonoLimpio = telefonoWhatsApp(opts.telefono, opts.pais);
  const dinero = (v: number) =>
    `${opts.simbolo}${new Intl.NumberFormat(opts.locale || 'es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
  const visibles = opts.lineas.slice(0, MAX_LINEAS_WHATSAPP);
  const resto = opts.lineas.length - visibles.length;

  const mensaje = [
    opts.nombreNegocio ? `*${opts.nombreNegocio}*` : null,
    `Ticket *${opts.numeroTicket}*${opts.fecha ? ` · ${opts.fecha}` : ''}`,
    '',
    ...visibles.map((l) => `${Number(l.cantidad)} × ${l.nombre} — ${dinero(l.importe)}`),
    resto > 0 ? `…y ${resto} artículo(s) más` : null,
    '',
    `*Total: ${dinero(opts.total)} ${opts.moneda}*`,
    opts.impuesto && opts.impuesto.monto > 0 ? `Incluye ${opts.impuesto.nombre}: ${dinero(opts.impuesto.monto)}` : null,
    '',
    '¡Gracias por tu compra!',
  ]
    .filter((x): x is string => x !== null)
    .join('\n');

  const base = telefonoLimpio ? `https://wa.me/${telefonoLimpio}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(mensaje)}`;
}
