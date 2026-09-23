import { r2 } from './dinero';
// Mirror del taxConfig del frontend. Las herramientas del backend (POS, Inventario,
// Personal) calculan impuestos sobre la venta/egreso usando el país del Producto SSOT.
// Si cambias tasas, sincroniza con frontend/lib/taxConfig.ts.

export interface TaxConsumoCfg {
  nombre: string;          // "IVA", "IGV", "ITBM", "GST", "ICMS+ISS"...
  tasa: number;            // 0.16, 0.18, 0.07, etc.
  acreditable: boolean;    // si el comprador puede acreditarlo (México)
  periodicidad: string;
  nota?: string;
}

export interface TaxConfig {
  pais: string;
  nombre: string;
  moneda: string;
  simbolo: string;
  locale: string;
  consumo: TaxConsumoCfg;
}

const CONFIGS: Record<string, TaxConfig> = {
  MX: { pais: 'MX', nombre: 'México',       moneda: 'MXN', simbolo: '$',   locale: 'es-MX', consumo: { nombre: 'IVA',                tasa: 0.16,  acreditable: true,  periodicidad: 'Mensual' } },
  BR: { pais: 'BR', nombre: 'Brasil',       moneda: 'BRL', simbolo: 'R$',  locale: 'pt-BR', consumo: { nombre: 'ICMS+ISS+PIS/COFINS', tasa: 0.12,  acreditable: false, periodicidad: 'Mensal' } },
  CO: { pais: 'CO', nombre: 'Colombia',     moneda: 'COP', simbolo: '$',   locale: 'es-CO', consumo: { nombre: 'IVA',                tasa: 0.19,  acreditable: true,  periodicidad: 'Bimestral' } },
  AR: { pais: 'AR', nombre: 'Argentina',    moneda: 'ARS', simbolo: '$',   locale: 'es-AR', consumo: { nombre: 'IVA',                tasa: 0.21,  acreditable: true,  periodicidad: 'Mensual' } },
  CL: { pais: 'CL', nombre: 'Chile',        moneda: 'CLP', simbolo: '$',   locale: 'es-CL', consumo: { nombre: 'IVA',                tasa: 0.19,  acreditable: true,  periodicidad: 'Mensual' } },
  PE: { pais: 'PE', nombre: 'Perú',         moneda: 'PEN', simbolo: 'S/',  locale: 'es-PE', consumo: { nombre: 'IGV',                tasa: 0.18,  acreditable: true,  periodicidad: 'Mensual' } },
  EC: { pais: 'EC', nombre: 'Ecuador',      moneda: 'USD', simbolo: '$',   locale: 'es-EC', consumo: { nombre: 'IVA',                tasa: 0.15,  acreditable: true,  periodicidad: 'Mensual' } },
  GT: { pais: 'GT', nombre: 'Guatemala',    moneda: 'GTQ', simbolo: 'Q',   locale: 'es-GT', consumo: { nombre: 'IVA',                tasa: 0.12,  acreditable: true,  periodicidad: 'Mensual' } },
  PA: { pais: 'PA', nombre: 'Panamá',       moneda: 'USD', simbolo: '$',   locale: 'es-PA', consumo: { nombre: 'ITBM',               tasa: 0.07,  acreditable: true,  periodicidad: 'Mensual' } },
  CR: { pais: 'CR', nombre: 'Costa Rica',   moneda: 'CRC', simbolo: '₡',   locale: 'es-CR', consumo: { nombre: 'IVA',                tasa: 0.13,  acreditable: true,  periodicidad: 'Mensual' } },
  HN: { pais: 'HN', nombre: 'Honduras',     moneda: 'HNL', simbolo: 'L',   locale: 'es-HN', consumo: { nombre: 'ISV',                tasa: 0.15,  acreditable: true,  periodicidad: 'Mensual' } },
  SV: { pais: 'SV', nombre: 'El Salvador',  moneda: 'USD', simbolo: '$',   locale: 'es-SV', consumo: { nombre: 'IVA',                tasa: 0.13,  acreditable: true,  periodicidad: 'Mensual' } },
  NI: { pais: 'NI', nombre: 'Nicaragua',    moneda: 'NIO', simbolo: 'C$',  locale: 'es-NI', consumo: { nombre: 'IVA',                tasa: 0.15,  acreditable: true,  periodicidad: 'Mensual' } },
  BZ: { pais: 'BZ', nombre: 'Belice',       moneda: 'BZD', simbolo: 'BZ$', locale: 'en-BZ', consumo: { nombre: 'GST',                tasa: 0.125, acreditable: true,  periodicidad: 'Monthly' } },
  VE: { pais: 'VE', nombre: 'Venezuela',    moneda: 'VES', simbolo: 'Bs.', locale: 'es-VE', consumo: { nombre: 'IVA',                tasa: 0.16,  acreditable: true,  periodicidad: 'Mensual' } },
  BO: { pais: 'BO', nombre: 'Bolivia',      moneda: 'BOB', simbolo: 'Bs.', locale: 'es-BO', consumo: { nombre: 'IVA',                tasa: 0.13,  acreditable: true,  periodicidad: 'Mensual' } },
  UY: { pais: 'UY', nombre: 'Uruguay',      moneda: 'UYU', simbolo: '$U',  locale: 'es-UY', consumo: { nombre: 'IVA',                tasa: 0.22,  acreditable: true,  periodicidad: 'Mensual' } },
  PY: { pais: 'PY', nombre: 'Paraguay',     moneda: 'PYG', simbolo: '₲',   locale: 'es-PY', consumo: { nombre: 'IVA',                tasa: 0.10,  acreditable: true,  periodicidad: 'Mensual' } },
};

export function getTaxConfig(pais: string | null | undefined): TaxConfig {
  return CONFIGS[(pais || 'MX').toUpperCase()] ?? CONFIGS['MX'];
}

export function calcularImpuesto(subtotal: number, pais: string): {
  subtotal: number;
  impuesto_monto: number;
  impuesto_tasa: number;
  impuesto_nombre: string;
  total: number;
} {
  const cfg = getTaxConfig(pais);
  const subtotalRedondeado = r2(subtotal);
  const impuesto = r2(subtotalRedondeado * cfg.consumo.tasa);
  return {
    subtotal: subtotalRedondeado,
    impuesto_monto: impuesto,
    impuesto_tasa: cfg.consumo.tasa,
    impuesto_nombre: cfg.consumo.nombre,
    total: r2(subtotalRedondeado + impuesto),
  };
}
