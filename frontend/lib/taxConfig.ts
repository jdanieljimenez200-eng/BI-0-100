export interface TaxConsumo {
  nombre: string;
  tasa: number;
  acreditable: boolean;
  periodicidad: string;
  nota?: string;
}

export interface TaxRenta {
  nombre: string;
  descripcion: string;
  tasa_estimada: number;
  periodicidad: string;
}

export interface TaxLaboral {
  nombre: string;
  tasa_patron: number;
  periodicidad: string;
  autoridad: string;
}

export interface TaxConfig {
  pais: string;
  nombre: string;
  moneda: string;
  simbolo: string;
  locale: string;
  autoridad: string;
  modo: 'detallado_mx' | 'simplificado';
  consumo: TaxConsumo;
  renta: TaxRenta;
  laboral: TaxLaboral | null;
  notas: string[];
  /**
   * Nombre local del comprobante fiscal de venta/gasto (CFDI en MX, Nota Fiscal
   * en BR, e-Factura en UY...). Opcional: usa `comprobanteNombre()` para leerlo
   * con fallback en lugar de accederlo directo.
   */
  comprobante?: string;
}

const CONFIGS: Record<string, TaxConfig> = {
  MX: {
    pais: 'MX', nombre: 'México', moneda: 'MXN', simbolo: '$', locale: 'es-MX',
    autoridad: 'SAT', modo: 'detallado_mx', comprobante: 'CFDI',
    consumo: { nombre: 'IVA', tasa: 0.16, acreditable: true, periodicidad: 'Mensual', nota: 'Art. 1 LIVA' },
    renta: { nombre: 'ISR RESICO', descripcion: 'Régimen Simplificado de Confianza (Art. 113-E LISR)', tasa_estimada: 0.02, periodicidad: 'Mensual' },
    laboral: { nombre: 'IMSS + INFONAVIT', tasa_patron: 0.17, periodicidad: 'Bimestral', autoridad: 'IMSS / SUA' },
    notas: ['IVA acreditable si tienes CFDI de tus gastos.', 'RESICO aplica si ingresos anuales ≤ $3.5M.'],
  },
  BR: {
    pais: 'BR', nombre: 'Brasil', moneda: 'BRL', simbolo: 'R$', locale: 'pt-BR',
    autoridad: 'Receita Federal', modo: 'simplificado', comprobante: 'Nota Fiscal',
    consumo: { nombre: 'ICMS + ISS + PIS/COFINS', tasa: 0.12, acreditable: false, periodicidad: 'Mensal', nota: 'Varia por estado y tipo de actividad' },
    renta: { nombre: 'IRPJ / CSLL', descripcion: 'Imposto de Renda Pessoa Jurídica + Contribuição Social', tasa_estimada: 0.15, periodicidad: 'Trimestral' },
    laboral: { nombre: 'INSS Patronal', tasa_patron: 0.20, periodicidad: 'Mensal', autoridad: 'Previdência Social' },
    notas: ['La carga tributaria real varía significativamente por régimen: Simples Nacional, Lucro Presumido o Lucro Real.', 'Simples Nacional puede reducir la carga total para pequeños negocios (ME/EPP).', 'Consulta un contador certificado (contabilista) para tu situación específica.'],
  },
  CO: {
    pais: 'CO', nombre: 'Colombia', moneda: 'COP', simbolo: '$', locale: 'es-CO',
    autoridad: 'DIAN', modo: 'simplificado', comprobante: 'Factura Electrónica',
    consumo: { nombre: 'IVA', tasa: 0.19, acreditable: true, periodicidad: 'Bimestral' },
    renta: { nombre: 'Impuesto de Renta', descripcion: 'Tarifa general personas jurídicas 35%', tasa_estimada: 0.35, periodicidad: 'Anual (anticipos bimestrales)' },
    laboral: { nombre: 'Aportes Parafiscales', tasa_patron: 0.21, periodicidad: 'Mensual', autoridad: 'SENA / ICBF / EPS / ARL' },
    notas: ['IVA 19% bimestral para responsables del régimen común.', 'Aportes parafiscales ~21% sobre nómina (salud 8.5%, pensión 12%, ARL, SENA, ICBF).', 'Régimen Simple de Tributación disponible para personas con ingresos hasta $3.527M COP anuales.'],
  },
  AR: {
    pais: 'AR', nombre: 'Argentina', moneda: 'ARS', simbolo: '$', locale: 'es-AR',
    autoridad: 'AFIP', modo: 'simplificado', comprobante: 'Factura Electrónica',
    consumo: { nombre: 'IVA', tasa: 0.21, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'Ganancias (3.ª Categoría)', descripcion: 'Impuesto a las Ganancias — empresas y monotributistas', tasa_estimada: 0.35, periodicidad: 'Mensual (anticipos)' },
    laboral: { nombre: 'Contribuciones Patronales', tasa_patron: 0.245, periodicidad: 'Mensual', autoridad: 'AFIP / ANSES' },
    notas: ['IVA general 21%; reducido 10.5% para algunos sectores.', 'Monotributo disponible para facturación anual hasta el tope vigente (consultar AFIP).', 'Tener en cuenta alícuotas de Ingresos Brutos (IIBB) provinciales, que varían por provincia.'],
  },
  CL: {
    pais: 'CL', nombre: 'Chile', moneda: 'CLP', simbolo: '$', locale: 'es-CL',
    autoridad: 'SII', modo: 'simplificado', comprobante: 'Boleta / Factura',
    consumo: { nombre: 'IVA', tasa: 0.19, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'PPM / Impuesto Primera Categoría', descripcion: 'Pagos Provisionales Mensuales (~1-3% sobre ventas netas)', tasa_estimada: 0.02, periodicidad: 'Mensual' },
    laboral: { nombre: 'Cotizaciones Previsionales', tasa_patron: 0.0, periodicidad: 'Mensual', autoridad: 'AFP / ISAPRE / AFC' },
    notas: ['IVA 19%, acreditable contra IVA débito fiscal.', 'PPM provisional: tasa ajustada anualmente por el SII según renta presunta.', 'Impuesto Primera Categoría sobre utilidades (27% grandes empresas, 25% PYME).'],
  },
  PE: {
    pais: 'PE', nombre: 'Perú', moneda: 'PEN', simbolo: 'S/', locale: 'es-PE',
    autoridad: 'SUNAT', modo: 'simplificado', comprobante: 'Comprobante de Pago',
    consumo: { nombre: 'IGV', tasa: 0.18, acreditable: true, periodicidad: 'Mensual', nota: 'IGV 16% + IPM 2%' },
    renta: { nombre: 'Impuesto a la Renta 3.ª Categoría', descripcion: 'Tasa general 29.5%; pagos a cuenta mensuales 1.5%', tasa_estimada: 0.295, periodicidad: 'Mensual (pagos a cuenta)' },
    laboral: { nombre: 'EsSalud + ONP', tasa_patron: 0.09, periodicidad: 'Mensual', autoridad: 'SUNAT / EsSalud' },
    notas: ['IGV 18% (IGV 16% + IPM 2%), acreditable con comprobantes de pago.', 'Pagos a cuenta de renta: 1.5% de ingresos netos mensuales.', 'Régimen MYPE Tributario disponible para ingresos hasta 1,700 UIT anuales.'],
  },
  EC: {
    pais: 'EC', nombre: 'Ecuador', moneda: 'USD', simbolo: '$', locale: 'es-EC',
    autoridad: 'SRI', modo: 'simplificado', comprobante: 'Factura Electrónica',
    consumo: { nombre: 'IVA', tasa: 0.15, acreditable: true, periodicidad: 'Mensual o Semestral', nota: 'IVA 15% desde Ley de Emergencia Económica 2024' },
    renta: { nombre: 'Impuesto a la Renta', descripcion: 'Tarifa sociedades 25%; personas naturales progresivo', tasa_estimada: 0.25, periodicidad: 'Anual (anticipos semestrales)' },
    laboral: { nombre: 'IESS Patronal', tasa_patron: 0.1115, periodicidad: 'Mensual', autoridad: 'IESS' },
    notas: ['IVA 15% desde 2024 (antes 12%).', 'IVA mensual si ingresos > $100k anuales; semestral si son menores.', 'Régimen RIMPE disponible para negocios populares y emprendedores.'],
  },
  GT: {
    pais: 'GT', nombre: 'Guatemala', moneda: 'GTQ', simbolo: 'Q', locale: 'es-GT',
    autoridad: 'SAT', modo: 'simplificado', comprobante: 'FEL (Factura Electrónica en Línea)',
    consumo: { nombre: 'IVA', tasa: 0.12, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'ISR (Opcional Simplificado)', descripcion: '5% sobre ingresos brutos o 25% sobre utilidades', tasa_estimada: 0.05, periodicidad: 'Mensual o Trimestral' },
    laboral: { nombre: 'Cuotas IGSS', tasa_patron: 0.1067, periodicidad: 'Mensual', autoridad: 'IGSS' },
    notas: ['IVA 12% acreditable.', 'ISR: Régimen Opcional Simplificado 5% sobre ingresos (trimestral) o Régimen General 25% sobre utilidades.'],
  },
  PA: {
    pais: 'PA', nombre: 'Panamá', moneda: 'USD', simbolo: '$', locale: 'es-PA',
    autoridad: 'DGI', modo: 'simplificado', comprobante: 'Factura Fiscal',
    consumo: { nombre: 'ITBM', tasa: 0.07, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'Impuesto Sobre la Renta', descripcion: 'Personas jurídicas: 25% sobre renta neta gravable', tasa_estimada: 0.25, periodicidad: 'Anual (adelantos trimestrales)' },
    laboral: { nombre: 'CSS Patronal', tasa_patron: 0.1275, periodicidad: 'Mensual', autoridad: 'CSS' },
    notas: ['ITBM (Impuesto de Transferencia de Bienes Muebles y Servicios) 7%.', 'Panamá tiene tratados de doble tributación con varios países.', 'SEM (Sede de Empresa Multinacional) ofrece beneficios fiscales especiales.'],
  },
  CR: {
    pais: 'CR', nombre: 'Costa Rica', moneda: 'CRC', simbolo: '₡', locale: 'es-CR',
    autoridad: 'Ministerio de Hacienda', modo: 'simplificado', comprobante: 'Factura Electrónica',
    consumo: { nombre: 'IVA', tasa: 0.13, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'Impuesto sobre la Renta', descripcion: 'PYMES: tasas escalonadas 5–30% según utilidad', tasa_estimada: 0.20, periodicidad: 'Anual (pagos parciales trimestrales)' },
    laboral: { nombre: 'Cargas Sociales (CCSS)', tasa_patron: 0.265, periodicidad: 'Mensual', autoridad: 'CCSS' },
    notas: ['IVA 13% desde julio 2020.', 'Cargas sociales patronales ~26.5% sobre salario bruto (CCSS, INS, IMAS, INA).', 'PYMES pueden aplicar al Régimen Simplificado si califican.'],
  },
  HN: {
    pais: 'HN', nombre: 'Honduras', moneda: 'HNL', simbolo: 'L', locale: 'es-HN',
    autoridad: 'SAR', modo: 'simplificado', comprobante: 'Factura (CAI)',
    consumo: { nombre: 'ISV', tasa: 0.15, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'Impuesto Sobre la Renta', descripcion: '25% sobre utilidad imponible', tasa_estimada: 0.25, periodicidad: 'Anual (pagos trimestrales)' },
    laboral: { nombre: 'Cotizaciones IHSS / RAP', tasa_patron: 0.05, periodicidad: 'Mensual', autoridad: 'IHSS / INJUPEMP' },
    notas: ['ISV (Impuesto Sobre Ventas) 15%; 18% para bebidas alcohólicas y tabaco.', 'Aportación solidaria de 5% sobre ISR para rentas altas.'],
  },
  SV: {
    pais: 'SV', nombre: 'El Salvador', moneda: 'USD', simbolo: '$', locale: 'es-SV',
    autoridad: 'DGII', modo: 'simplificado', comprobante: 'DTE (Factura Electrónica)',
    consumo: { nombre: 'IVA', tasa: 0.13, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'Impuesto Sobre la Renta', descripcion: 'Personas jurídicas: 30%', tasa_estimada: 0.30, periodicidad: 'Anual (pagos a cuenta mensuales 1.75%)' },
    laboral: { nombre: 'Cotizaciones ISSS / AFP', tasa_patron: 0.075, periodicidad: 'Mensual', autoridad: 'ISSS / AFP' },
    notas: ['IVA 13% acreditable con facturas.', 'Pagos a cuenta de renta: 1.75% sobre ingresos brutos mensuales.'],
  },
  NI: {
    pais: 'NI', nombre: 'Nicaragua', moneda: 'NIO', simbolo: 'C$', locale: 'es-NI',
    autoridad: 'DGI', modo: 'simplificado', comprobante: 'Factura',
    consumo: { nombre: 'IVA', tasa: 0.15, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'IR Anual / Pago Mínimo Definitivo', descripcion: '30% IR o 1% PMD sobre ingresos brutos (el mayor)', tasa_estimada: 0.01, periodicidad: 'Mensual (PMD anticipado)' },
    laboral: { nombre: 'Aportes INSS Patronal', tasa_patron: 0.19, periodicidad: 'Mensual', autoridad: 'INSS' },
    notas: ['IVA 15%.', 'Pago Mínimo Definitivo (PMD): 1% de ingresos brutos mensuales (algunos sectores exentos).'],
  },
  BZ: {
    pais: 'BZ', nombre: 'Belice', moneda: 'BZD', simbolo: 'BZ$', locale: 'en-BZ',
    autoridad: 'IRD', modo: 'simplificado', comprobante: 'Invoice / GST Receipt',
    consumo: { nombre: 'GST', tasa: 0.125, acreditable: true, periodicidad: 'Monthly' },
    renta: { nombre: 'Income Tax / Business Tax', descripcion: 'General rate 25%; business tax varies by sector', tasa_estimada: 0.25, periodicidad: 'Quarterly' },
    laboral: null,
    notas: ['GST (General Sales Tax) 12.5%.', 'Business tax may apply at lower rates for specific industries.', 'Consult a local accountant for sector-specific rates.'],
  },
  VE: {
    pais: 'VE', nombre: 'Venezuela', moneda: 'VES', simbolo: 'Bs.', locale: 'es-VE',
    autoridad: 'SENIAT', modo: 'simplificado', comprobante: 'Factura Fiscal',
    consumo: { nombre: 'IVA', tasa: 0.16, acreditable: true, periodicidad: 'Mensual', nota: 'Alícuota puede variar por decreto' },
    renta: { nombre: 'ISLR', descripcion: 'Impuesto Sobre la Renta: 15–34% según enriquecimiento neto', tasa_estimada: 0.34, periodicidad: 'Anual (anticipos)' },
    laboral: { nombre: 'IVSS + LPH', tasa_patron: 0.10, periodicidad: 'Mensual', autoridad: 'IVSS' },
    notas: ['IVA 16% (alícuota general). Puede variar por decreto gubernamental.', 'Consulta tasas actualizadas en SENIAT dado el contexto económico cambiante.'],
  },
  BO: {
    pais: 'BO', nombre: 'Bolivia', moneda: 'BOB', simbolo: 'Bs.', locale: 'es-BO',
    autoridad: 'SIN', modo: 'simplificado', comprobante: 'Factura',
    consumo: { nombre: 'IVA', tasa: 0.13, acreditable: true, periodicidad: 'Mensual', nota: 'IT (Impuesto a las Transacciones) 3% adicional sobre ingresos brutos' },
    renta: { nombre: 'IUE', descripcion: 'Impuesto sobre las Utilidades de las Empresas: 25%', tasa_estimada: 0.25, periodicidad: 'Anual' },
    laboral: { nombre: 'Aportes a la Seguridad Social', tasa_patron: 0.145, periodicidad: 'Mensual', autoridad: 'AFP / CNS' },
    notas: ['IVA 13%. Además, IT (Impuesto a las Transacciones) 3% sobre ingresos brutos.', 'IUE 25% sobre utilidades. Se acredita contra IT pagado.'],
  },
  UY: {
    pais: 'UY', nombre: 'Uruguay', moneda: 'UYU', simbolo: '$U', locale: 'es-UY',
    autoridad: 'DGI', modo: 'simplificado', comprobante: 'e-Factura',
    consumo: { nombre: 'IVA', tasa: 0.22, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'IRAE', descripcion: 'Impuesto a la Renta de las Actividades Económicas: 25%', tasa_estimada: 0.25, periodicidad: 'Anual (anticipos mensuales)' },
    laboral: { nombre: 'BPS Patronal', tasa_patron: 0.075, periodicidad: 'Mensual', autoridad: 'BPS' },
    notas: ['IVA 22% (tasa básica); 10% (tasa mínima para algunos sectores).', 'IRAE 25% sobre utilidades fiscales. Monotributo disponible para pequeños contribuyentes.'],
  },
  PY: {
    pais: 'PY', nombre: 'Paraguay', moneda: 'PYG', simbolo: '₲', locale: 'es-PY',
    autoridad: 'SET', modo: 'simplificado', comprobante: 'Factura',
    consumo: { nombre: 'IVA', tasa: 0.10, acreditable: true, periodicidad: 'Mensual' },
    renta: { nombre: 'IRE', descripcion: 'Impuesto a la Renta Empresarial: 10%', tasa_estimada: 0.10, periodicidad: 'Anual' },
    laboral: { nombre: 'IPS Patronal', tasa_patron: 0.165, periodicidad: 'Mensual', autoridad: 'IPS' },
    notas: ['Paraguay tiene una de las cargas impositivas más bajas de la región.', 'IVA 10%, IRE 10% — régimen simplificado RESIMPLE disponible para MIPYMES.'],
  },
};

export function getTaxConfig(pais: string): TaxConfig {
  return CONFIGS[pais] ?? CONFIGS['MX'];
}

/** Nombre local del comprobante fiscal, con fallback genérico. */
export function comprobanteNombre(cfg: TaxConfig): string {
  return cfg.comprobante ?? 'Factura';
}