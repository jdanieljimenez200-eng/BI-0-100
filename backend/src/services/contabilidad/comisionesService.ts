import { EntityManager } from 'typeorm';
import { CanalCobro, TipoCanalCobro } from '../../models/CanalCobro';
import { MovimientoContable } from '../../models/MovimientoContable';

export interface DesgloseComisionResult {
  montoBruto: number;
  comisionBase: number;
  comisionIva: number;
  retencionIsr: number;
  retencionIva: number;
  totalDeducciones: number;
  montoNeto: number;
  tasaEfectivaPorcentaje: number;
}

export interface CanalConfigLite {
  nombre?: string;
  institucion: string;
  comision_porcentaje: number;
  comision_fija: number;
  aplica_iva_comision: boolean;
  retencion_isr_porcentaje?: number;
  retencion_iva_porcentaje?: number;
  dias_liquidacion?: number;
}

export const PRESETS_CANALES_DEFAULT: Array<{
  nombre: string;
  tipo_canal: TipoCanalCobro;
  institucion: string;
  comision_porcentaje: number;
  comision_fija: number;
  aplica_iva_comision: boolean;
  retencion_isr_porcentaje: number;
  retencion_iva_porcentaje: number;
  dias_liquidacion: number;
  color: string;
  icono: string;
  notas: string;
}> = [
  {
    nombre: 'Clip (Terminal TPV)',
    tipo_canal: 'terminal',
    institucion: 'Clip',
    comision_porcentaje: 0.0360, // 3.6%
    comision_fija: 0,
    aplica_iva_comision: true,
    retencion_isr_porcentaje: 0,
    retencion_iva_porcentaje: 0,
    dias_liquidacion: 1,
    color: '#FF5E00',
    icono: 'credit-card',
    notas: 'Tasa estándar Clip de 3.6% + IVA sobre comisión. Depósito diario.',
  },
  {
    nombre: 'Mercado Pago Point',
    tipo_canal: 'terminal',
    institucion: 'Mercado Pago',
    comision_porcentaje: 0.0350, // 3.5%
    comision_fija: 4.00, // $4 MXN
    aplica_iva_comision: true,
    retencion_isr_porcentaje: 0,
    retencion_iva_porcentaje: 0,
    dias_liquidacion: 0, // Inmediato
    color: '#009EE3',
    icono: 'credit-card',
    notas: 'Liberación inmediata del dinero. 3.5% + $4 MXN + IVA.',
  },
  {
    nombre: 'Terminal Bancaria BBVA',
    tipo_canal: 'terminal',
    institucion: 'BBVA',
    comision_porcentaje: 0.0220, // 2.2%
    comision_fija: 0,
    aplica_iva_comision: true,
    retencion_isr_porcentaje: 0,
    retencion_iva_porcentaje: 0,
    dias_liquidacion: 1,
    color: '#004481',
    icono: 'landmark',
    notas: 'Terminal bancaria tradicional TPV BBVA. Tasa promedio 2.2% + IVA.',
  },
  {
    nombre: 'Uber Eats (Restaurante)',
    tipo_canal: 'delivery',
    institucion: 'Uber Eats',
    comision_porcentaje: 0.3000, // 30%
    comision_fija: 0,
    aplica_iva_comision: true,
    retencion_isr_porcentaje: 0.0100, // 1% retención SAT
    retencion_iva_porcentaje: 0.0800, // 8% retención SAT
    dias_liquidacion: 7, // Depósito semanal los lunes
    color: '#06C167',
    icono: 'bike',
    notas: 'Comisión de marketplace delivery 30% + IVA y retenciones de plataformas tecnológicas.',
  },
  {
    nombre: 'Rappi (Aliado)',
    tipo_canal: 'delivery',
    institucion: 'Rappi',
    comision_porcentaje: 0.2500, // 25%
    comision_fija: 0,
    aplica_iva_comision: true,
    retencion_isr_porcentaje: 0.0100,
    retencion_iva_porcentaje: 0.0800,
    dias_liquidacion: 7,
    color: '#FF441F',
    icono: 'bike',
    notas: 'Comisión promedio Rappi aliados 25% + IVA y retenciones fiscales.',
  },
  {
    nombre: 'Didi Food',
    tipo_canal: 'delivery',
    institucion: 'Didi Food',
    comision_porcentaje: 0.2200, // 22%
    comision_fija: 0,
    aplica_iva_comision: true,
    retencion_isr_porcentaje: 0.0100,
    retencion_iva_porcentaje: 0.0800,
    dias_liquidacion: 7,
    color: '#FF7D00',
    icono: 'bike',
    notas: 'Comisión Didi Food restaurantes 22% + IVA.',
  },
  {
    nombre: 'Stripe Online',
    tipo_canal: 'pasarela_web',
    institucion: 'Stripe',
    comision_porcentaje: 0.0360,
    comision_fija: 3.00,
    aplica_iva_comision: true,
    retencion_isr_porcentaje: 0,
    retencion_iva_porcentaje: 0,
    dias_liquidacion: 7,
    color: '#635BFF',
    icono: 'globe',
    notas: 'Pagos en línea con tarjetas locales e internacionales. 3.6% + $3 MXN + IVA.',
  },
];

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Calcula el desglose exacto de comisiones, impuestos sobre comisiones y retenciones.
 */
export function calcularDesgloseComision(
  montoBruto: number,
  canal: CanalConfigLite,
  tasaIvaPais: number = 0.16
): DesgloseComisionResult {
  const bruto = Math.max(0, Number(montoBruto) || 0);
  const pctComision = Math.max(0, Number(canal.comision_porcentaje) || 0);
  const fija = Math.max(0, Number(canal.comision_fija) || 0);

  const comisionBase = r2(bruto * pctComision + fija);
  const comisionIva = canal.aplica_iva_comision ? r2(comisionBase * tasaIvaPais) : 0;

  const pctRetIsr = Math.max(0, Number(canal.retencion_isr_porcentaje) || 0);
  const pctRetIva = Math.max(0, Number(canal.retencion_iva_porcentaje) || 0);

  const retencionIsr = r2(bruto * pctRetIsr);
  const retencionIva = r2(bruto * pctRetIva);

  const totalDeducciones = r2(comisionBase + comisionIva + retencionIsr + retencionIva);
  const montoNeto = r2(Math.max(0, bruto - totalDeducciones));
  const tasaEfectivaPorcentaje = bruto > 0 ? r2((totalDeducciones / bruto) * 100) : 0;

  return {
    montoBruto: bruto,
    comisionBase,
    comisionIva,
    retencionIsr,
    retencionIva,
    totalDeducciones,
    montoNeto,
    tasaEfectivaPorcentaje,
  };
}

/**
 * Simulador de Precios / Markup Inverso:
 * ¿A qué precio bruto debo publicar o vender para obtener exactamente mi monto neto deseado?
 */
export function calcularPrecioObjetivo(
  montoNetoDeseado: number,
  canal: CanalConfigLite,
  tasaIvaPais: number = 0.16
): { precioSugerido: number; desglose: DesgloseComisionResult } {
  const netoDeseado = Math.max(0, Number(montoNetoDeseado) || 0);
  const pctComision = Math.max(0, Number(canal.comision_porcentaje) || 0);
  const fija = Math.max(0, Number(canal.comision_fija) || 0);
  const factorIvaComision = canal.aplica_iva_comision ? 1 + tasaIvaPais : 1;

  const tasaTotal =
    pctComision * factorIvaComision +
    (Number(canal.retencion_isr_porcentaje) || 0) +
    (Number(canal.retencion_iva_porcentaje) || 0);

  const costoFijoTotal = fija * factorIvaComision;

  // Formula: Neto = Bruto * (1 - tasaTotal) - costoFijoTotal
  // Bruto = (Neto + costoFijoTotal) / (1 - tasaTotal)
  let precioSugerido = netoDeseado;
  if (tasaTotal < 1) {
    precioSugerido = r2((netoDeseado + costoFijoTotal) / (1 - tasaTotal));
  }

  const desglose = calcularDesgloseComision(precioSugerido, canal, tasaIvaPais);
  return { precioSugerido, desglose };
}

/**
 * Genera y persiste los asientos contables asociados a una venta o ingreso con comisiones.
 * - Padre: Ingreso bruto de la venta.
 * - Hijo 1: Egreso deducible por comisión bancaria/plataforma.
 * - Hijo 2: Egreso por IVA de la comisión (IVA acreditable).
 * - Hijo 3 y 4: Retenciones de plataformas si aplican.
 */
export async function registrarAsientosComisionTransaccional(
  manager: EntityManager,
  params: {
    movPadre: MovimientoContable;
    canal: CanalCobro | CanalConfigLite;
    desglose: DesgloseComisionResult;
    usuarioId: string;
    productoId: string;
    fecha: string;
    creadoPorId?: string | null;
    fuente?: MovimientoContable['fuente'];
    referenciaTipo?: MovimientoContable['referencia_tipo'];
    referenciaId?: string | null;
  }
): Promise<MovimientoContable[]> {
  const { movPadre, canal, desglose, usuarioId, productoId, fecha, creadoPorId, fuente, referenciaTipo, referenciaId } = params;
  const institucion = canal.institucion || 'Terminal / Plataforma';
  const hijos: MovimientoContable[] = [];

  // 1. Egreso: Comisión base
  if (desglose.comisionBase > 0) {
    const egresoComision = manager.create(MovimientoContable, {
      usuario_id: usuarioId,
      creado_por_id: creadoPorId ?? null,
      producto_id: productoId,
      tipo: 'egreso',
      descripcion: `Comisión ${institucion} — ${movPadre.descripcion}`,
      categoria: 'Comisiones Financieras / Plataformas',
      monto: desglose.comisionBase,
      fecha,
      parent_movimiento_id: movPadre.id,
      es_auto_generado: true,
      tiene_cfdi: true,
      fuente: fuente ?? 'manual',
      institucion_snapshot: institucion,
      referencia_tipo: referenciaTipo ?? null,
      referencia_id: referenciaId ?? null,
      estado_liquidacion: 'liquidado',
    });
    hijos.push(egresoComision);
  }

  // 2. Egreso: IVA sobre la comisión
  if (desglose.comisionIva > 0) {
    const egresoIva = manager.create(MovimientoContable, {
      usuario_id: usuarioId,
      creado_por_id: creadoPorId ?? null,
      producto_id: productoId,
      tipo: 'egreso',
      descripcion: `IVA Comisión ${institucion} — ${movPadre.descripcion}`,
      categoria: 'IVA Acreditable / Comisiones',
      monto: desglose.comisionIva,
      fecha,
      parent_movimiento_id: movPadre.id,
      es_auto_generado: true,
      tiene_cfdi: true,
      fuente: fuente ?? 'manual',
      institucion_snapshot: institucion,
      referencia_tipo: referenciaTipo ?? null,
      referencia_id: referenciaId ?? null,
      estado_liquidacion: 'liquidado',
    });
    hijos.push(egresoIva);
  }

  // 3. Retención ISR plataforma digital
  if (desglose.retencionIsr > 0) {
    const egresoRetIsr = manager.create(MovimientoContable, {
      usuario_id: usuarioId,
      creado_por_id: creadoPorId ?? null,
      producto_id: productoId,
      tipo: 'egreso',
      descripcion: `Retención ISR ${institucion} — ${movPadre.descripcion}`,
      categoria: 'Retención ISR Plataformas',
      monto: desglose.retencionIsr,
      fecha,
      parent_movimiento_id: movPadre.id,
      es_auto_generado: true,
      tiene_cfdi: true,
      fuente: fuente ?? 'manual',
      institucion_snapshot: institucion,
      referencia_tipo: referenciaTipo ?? null,
      referencia_id: referenciaId ?? null,
      estado_liquidacion: 'liquidado',
    });
    hijos.push(egresoRetIsr);
  }

  // 4. Retención IVA plataforma digital
  if (desglose.retencionIva > 0) {
    const egresoRetIva = manager.create(MovimientoContable, {
      usuario_id: usuarioId,
      creado_por_id: creadoPorId ?? null,
      producto_id: productoId,
      tipo: 'egreso',
      descripcion: `Retención IVA ${institucion} — ${movPadre.descripcion}`,
      categoria: 'Retención IVA Plataformas',
      monto: desglose.retencionIva,
      fecha,
      parent_movimiento_id: movPadre.id,
      es_auto_generado: true,
      tiene_cfdi: true,
      fuente: fuente ?? 'manual',
      institucion_snapshot: institucion,
      referencia_tipo: referenciaTipo ?? null,
      referencia_id: referenciaId ?? null,
      estado_liquidacion: 'liquidado',
    });
    hijos.push(egresoRetIva);
  }

  if (hijos.length > 0) {
    await manager.save(MovimientoContable, hijos);
  }

  return hijos;
}
