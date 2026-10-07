import { buildWhatsAppLink, calcularTotalesVenta } from '../../services/pos/posService';
import { impuestoIncluido } from '../../utils/taxConfig';

/**
 * El precio del catálogo es el precio al público, con el impuesto dentro: así
 * lo exige la ley de protección al consumidor en México (LFPC 7 Bis),
 * Colombia (Ley 1480, art. 26), Perú (Ley 29571), Chile (Ley 19.496, art. 30)
 * y Ecuador. Antes el POS sumaba el impuesto encima: 3 tamales de $25 se
 * cobraban $87.
 */
describe('POS: totales con el impuesto incluido en el precio', () => {
  const tamales = [{ item_pos_id: null, nombre: 'Tamal verde', precio_unitario: 25, cantidad: 3 }];

  it('México: se cobra lo del catálogo y el IVA se desglosa dentro', () => {
    const t = calcularTotalesVenta(tamales, 'MX');
    expect(t.total).toBe(75);
    expect(t.impuesto_monto).toBe(10.34); // 75 − 75 / 1.16
    expect(t.subtotal).toBe(64.66);
    expect(t.impuesto_nombre).toBe('IVA');
    expect(t.impuesto_tasa).toBe(0.16);
    // La línea guarda el importe sin impuesto (márgenes y ventas por producto).
    expect(t.lineas[0].subtotal_linea).toBe(64.66);
    expect(t.lineas[0].precio_unitario).toBe(25);
  });

  it.each([
    ['CO', 'IVA', 0.19, 1000, 159.66],
    ['PE', 'IGV', 0.18, 1000, 152.54],
    ['AR', 'IVA', 0.21, 1000, 173.55],
    ['CL', 'IVA', 0.19, 1000, 159.66],
    ['EC', 'IVA', 0.15, 1000, 130.43],
    ['PA', 'ITBM', 0.07, 1000, 65.42],
  ])('%s: %s %s incluido', (pais, nombre, tasa, precio, impuesto) => {
    const t = calcularTotalesVenta([{ nombre: 'X', precio_unitario: precio, cantidad: 1 }], pais);
    expect(t.total).toBe(precio);
    expect(t.impuesto_nombre).toBe(nombre);
    expect(t.impuesto_tasa).toBe(tasa);
    expect(t.impuesto_monto).toBe(impuesto);
    expect(t.subtotal + t.impuesto_monto).toBeCloseTo(t.total, 2);
  });

  it('si el negocio no cobra el impuesto, se cobra lo mismo y no se registra impuesto', () => {
    const t = calcularTotalesVenta(tamales, 'AR', { cobraImpuesto: false });
    expect(t.total).toBe(75);
    expect(t.impuesto_monto).toBe(0);
    expect(t.impuesto_tasa).toBe(0);
    expect(t.subtotal).toBe(75);
    expect(t.lineas[0].subtotal_linea).toBe(75);
  });

  it('las líneas sin impuesto suman exactamente el subtotal (el centavo del redondeo va a la mayor)', () => {
    const t = calcularTotalesVenta(
      [
        { nombre: 'A', precio_unitario: 10.01, cantidad: 1 },
        { nombre: 'B', precio_unitario: 10.01, cantidad: 1 },
        { nombre: 'C', precio_unitario: 33.33, cantidad: 3 },
      ],
      'MX'
    );
    const suma = Math.round(t.lineas.reduce((s, l) => s + l.subtotal_linea, 0) * 100) / 100;
    expect(suma).toBe(t.subtotal);
    expect(Math.round((t.subtotal + t.impuesto_monto) * 100) / 100).toBe(t.total);
  });

  it('rechaza carrito vacío, cantidades y precios inválidos', () => {
    expect(() => calcularTotalesVenta([], 'MX')).toThrow('vacío');
    expect(() => calcularTotalesVenta([{ nombre: 'X', precio_unitario: 10, cantidad: 0 }], 'MX')).toThrow('Cantidad');
    expect(() => calcularTotalesVenta([{ nombre: 'X', precio_unitario: -1, cantidad: 1 }], 'MX')).toThrow('Precio');
  });

  it('impuestoIncluido con tasa 0 es 0', () => {
    expect(impuestoIncluido(100, 0)).toBe(0);
  });
});

describe('POS: ticket por WhatsApp', () => {
  const base = {
    telefono: '55 1234 5678',
    pais: 'MX',
    nombreNegocio: 'Tamales Doña Rosa',
    numeroTicket: 'POS-000001',
    fecha: '2026-10-05',
    lineas: [{ nombre: 'Tamal verde', cantidad: 3, importe: 75 }],
    total: 75,
    impuesto: { nombre: 'IVA', monto: 10.34 },
    moneda: 'MXN',
    simbolo: '$',
    locale: 'es-MX',
  };
  const texto = (url: string) => decodeURIComponent(url.split('?text=')[1]);

  it('lleva el ticket completo en el mensaje y no un enlace a una página', () => {
    const url = buildWhatsAppLink(base);
    expect(url.startsWith('https://wa.me/52')).toBe(true);
    const t = texto(url);
    expect(t).toContain('*Tamales Doña Rosa*');
    expect(t).toContain('Ticket *POS-000001* · 2026-10-05');
    expect(t).toContain('3 × Tamal verde — $75.00');
    expect(t).toContain('*Total: $75.00 MXN*');
    expect(t).toContain('Incluye IVA: $10.34');
    expect(t).not.toMatch(/https?:\/\/[^\s]*ticket/);
  });

  it('sin impuesto no menciona impuesto, y un ticket largo se recorta', () => {
    const lineas = Array.from({ length: 30 }, (_, i) => ({ nombre: `Art ${i}`, cantidad: 1, importe: 1 }));
    const t = texto(buildWhatsAppLink({ ...base, impuesto: null, lineas, total: 30 }));
    expect(t).not.toContain('Incluye');
    expect(t).toContain('…y 5 artículo(s) más');
  });
});
