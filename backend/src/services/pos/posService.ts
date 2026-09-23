// Servicio puro de POS — sin DB ni HTTP. Cálculo de totales, impuestos por país,
// generación de folio. Las funciones del orchestrator (rutas) consumen esto.

import { calcularImpuesto, getTaxConfig } from '../../utils/taxConfig';
import { r2 } from '../../utils/dinero';

export interface CarritoLinea {
  item_pos_id?: string | null;
  nombre: string;          // snapshot
  precio_unitario: number; // ya unitario, sin impuesto
  cantidad: number;
}

export interface TotalesVenta {
  subtotal: number;
  impuesto_monto: number;
  impuesto_tasa: number;
  impuesto_nombre: string;
  moneda: string;
  total: number;
  lineas: Array<CarritoLinea & { subtotal_linea: number }>;
}

/**
 * Calcula totales de una venta. Subtotal = suma de líneas (precio × cantidad),
 * impuesto se calcula sobre el subtotal usando la tasa del país del producto.
 *
 * @param lineas Carrito (precio_unitario es el monto SIN impuesto, "precio neto")
 * @param paisProducto País del Producto SSOT (ej. "MX", "CO", "AR")
 */
export function calcularTotalesVenta(lineas: CarritoLinea[], paisProducto: string): TotalesVenta {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new Error('El carrito está vacío');
  }

  const lineasConSubtotal = lineas.map((l) => {
    const cantidad = Number(l.cantidad);
    const precio = Number(l.precio_unitario);
    if (!isFinite(cantidad) || cantidad <= 0) throw new Error(`Cantidad inválida para "${l.nombre}"`);
    if (!isFinite(precio) || precio < 0) throw new Error(`Precio inválido para "${l.nombre}"`);
    return {
      ...l,
      precio_unitario: precio,
      cantidad,
      subtotal_linea: r2(precio * cantidad),
    };
  });

  const subtotal = lineasConSubtotal.reduce((sum, l) => sum + l.subtotal_linea, 0);
  const calc = calcularImpuesto(subtotal, paisProducto);
  const cfg = getTaxConfig(paisProducto);

  return {
    subtotal: calc.subtotal,
    impuesto_monto: calc.impuesto_monto,
    impuesto_tasa: calc.impuesto_tasa,
    impuesto_nombre: calc.impuesto_nombre,
    moneda: cfg.moneda,
    total: calc.total,
    lineas: lineasConSubtotal,
  };
}

/**
 * Genera un enlace wa.me con el texto del ticket preformateado. El cliente
 * abre WhatsApp y solo presiona "Enviar". Se incluye un URL público del ticket
 * para que el cliente pueda verlo en línea (no se envía PDF nativo en este modo).
 *
 * Nota: si el teléfono no tiene código de país, el link puede no resolver.
 */
export function buildWhatsAppLink(opts: {
  telefono?: string | null;          // ej. "+525512345678" o "525512345678"
  nombreNegocio: string;
  numeroTicket: string;
  total: number;
  moneda: string;
  simbolo: string;
  ticketUrl: string;                 // URL pública del ticket HTML
}): string {
  const telefonoLimpio = (opts.telefono || '').replace(/[^\d]/g, '');
  const mensaje =
    `*${opts.nombreNegocio}*\n` +
    `Ticket *${opts.numeroTicket}*\n` +
    `Total: *${opts.simbolo}${opts.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${opts.moneda}*\n\n` +
    `Ver detalle: ${opts.ticketUrl}\n\n` +
    `¡Gracias por tu compra!`;

  const base = telefonoLimpio ? `https://wa.me/${telefonoLimpio}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(mensaje)}`;
}
