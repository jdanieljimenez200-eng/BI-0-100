'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { esPlanDePago } from '@/lib/plans';
import { seccionesBloqueadasDe } from '@/lib/gating';
import { getTaxConfig } from '@/lib/taxConfig';
import TransparenciaIA, { type Transparencia } from '@/components/analisis/TransparenciaIA';
import SeccionesExtra, { type SeccionExtra } from '@/components/analisis/SeccionesExtra';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { AnalysisLoader } from '@/components/ui/AnalysisLoader';
import { AnalysisError } from '@/components/ui/AnalysisError';
import LockedSection, { SkeletonTarjetas } from '@/components/ui/LockedSection';
import { Breadcrumbs } from '@/components/ui';
import { useAnalysisLoaderGate } from '@/app/hooks/useAnalysisLoaderGate';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Check,
  Download,
  FileText,
  Layers,
  Lock,
  Percent,
  SlidersHorizontal,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { MODULE_THEME } from '@/lib/moduleTheme';
import { MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motion/tokens';
import CsvImportModal from './CsvImportModal';
import AvisoEstimacion from '@/components/ui/AvisoEstimacion';
import { hoyLocal } from '@/lib/fechaLocal';

/** Acento del módulo, desde la fuente canónica (lib/moduleTheme). */
const ACENTO = MODULE_THEME.finanzas;

/**
 * Superficie teñida con el acento del módulo. Sustituye a los degradados con
 * hex escritos a mano (`#071a10`, `#0b1421`…) que estaban repartidos por la
 * pantalla: el verde ahora se deriva del acento, así que recolorear el módulo
 * en `moduleTheme` recolorea también este informe.
 */
function fondoAcento(intensidad = 0.1): string {
  return `linear-gradient(135deg, rgb(${ACENTO.rgb} / ${intensidad}) 0%, rgba(11, 20, 33, 0.9) 60%, rgba(13, 17, 23, 0.95) 100%)`;
}

/**
 * Fondo neutro de los paneles del informe. Estaba escrito como el mismo
 * degradado inline en seis bloques distintos; aquí es un solo valor.
 */
const FONDO_PANEL = { background: 'linear-gradient(135deg, #0D1117 0%, #0B1421 100%)' } as const;

/**
 * Revela un bloque al entrar en pantalla.
 *
 * Sustituye al `gsap.fromTo('.reveal', …)` que animaba por selector de clase.
 * Aquel enfoque dejaba los bloques en `opacity: 0` de forma permanente si el
 * timeline no llegaba a ejecutarse — y obligaba a un parche en el CSS de
 * impresión para que el PDF no saliera en blanco.
 */
function Revelar({
  children,
  className,
  style,
  printHide = false,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Marca el bloque como no imprimible (controles interactivos). */
  printHide?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      /* La clase `reveal` ya no anima nada: se conserva porque el bloque
         `@media print` de globals.css la usa para forzar opacidad 1. Sin ella,
         un bloque que aún no hubiera entrado en pantalla saldría en blanco en
         el PDF. */
      className={className ? `reveal ${className}` : 'reveal'}
      style={style}
      data-print={printHide ? 'hide' : undefined}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: MOTION_DURATIONS.deliberate, ease: MOTION_EASINGS.easeOutQuart }}
    >
      {children}
    </motion.div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MesProyeccion {
  mes: number;
  nombre_mes: string;
  unidades: number;
  ingresos: number;
  costo_variable_total: number;
  costos_fijos: number;
  utilidad_bruta: number;
  utilidad_neta: number;
  margen_neto: number;
  acumulado_neto: number;
}

interface ProyeccionAnual {
  meses: MesProyeccion[];
  totales: {
    unidades_totales: number;
    ingresos_totales: number;
    costo_variable_total: number;
    costos_fijos_total: number;
    utilidad_bruta_total: number;
    utilidad_neta_total: number;
    margen_neto_promedio: number;
  };
  mejor_mes: number;
  peor_mes: number;
  /** Caja que hay que aguantar hasta recuperar lo invertido (0 = ninguna). */
  caja_necesaria: number;
  mes_valle: number;
  /** finanzas@2: caja extra por cobrar a crédito (0 sin plazos). */
  capital_de_trabajo: number;
  /** finanzas@2: veces que la utilidad cubre la cuota de deuda; null sin deuda. */
  cobertura_deuda: number | null;
  /** finanzas@2: lo que deja cada venta. null en análisis anteriores. */
  economia_unitaria: EconomiaUnitaria | null;
}

interface EconomiaUnitaria {
  precio_neto: number;
  impuesto_unitario: number;
  comision_unitaria: number;
  costo_variable_efectivo: number;
  margen_unitario: number;
  costos_fijos_efectivos: number;
}

interface EscenarioBreakeven {
  nombre: string;
  descripcion: string;
  unidades_necesarias: number;
  ingresos_necesarios: number;
  diferencia_vs_inicial: number;
}

interface BreakevenData {
  unidades_breakeven_mes: number;
  ingresos_breakeven_mes: number;
  margen_contribucion_unitario: number;
  margen_contribucion_porcentaje: number;
  punto_equilibrio_alcanzado: boolean;
  mes_equilibrio: number | null;
  meses_para_recuperar_inversion: number | null;
  payback_no_disponible: string | null;
  /** finanzas@2: unidades para cubrir también la deuda; null sin deuda. */
  unidades_equilibrio_con_deuda: number | null;
  escenarios: EscenarioBreakeven[];
}

interface ResumenFinanzas {
  viabilidad: 'alta' | 'media' | 'baja';
  color_viabilidad: string;
  mensaje_viabilidad: string;
  roi_anual: number;
  /** Con inversión declarada es ROI de verdad; si no, retorno sobre costos fijos. */
  base_roi: 'inversion_inicial' | 'costos_fijos_anuales';
  payback_meses: number | null;
  payback_no_disponible: 'sin_inversion_declarada' | 'no_se_recupera_en_12_meses' | null;
  ingreso_promedio_mensual: number;
  utilidad_promedio_mensual: number;
  recomendaciones: string[];
  alertas: string[];
}

interface RiesgoFinanciero {
  titulo: string;
  descripcion: string;
  senales_alerta: string[];
  como_evitarlo: string;
}

/** Movido desde Ventas ("por qué fallan"): riesgo financiero, no táctica de venta. */
interface RiesgosNegocio {
  patron_comun: string;
  riesgos: RiesgoFinanciero[];
}

interface Movimiento {
  id: string;
  tipo: 'ingreso' | 'egreso';
  descripcion: string;
  categoria: string;
  monto: number;
  fecha: string;
  es_auto_generado: boolean;
  parent_movimiento_id: string | null;
  tiene_cfdi: boolean;
}

interface MovForm {
  tipo: 'ingreso' | 'egreso';
  descripcion: string;
  categoria: string;
  monto: string;
  fecha: string;
  lleva_factura: boolean;
  es_empresa: boolean;
  tiene_cfdi: boolean;
}

const IMPUESTO_CATS = ['IVA por pagar', 'ISR provisional', 'IMSS', 'INFONAVIT', 'Retención IVA', 'Retención ISR'];
const GATED_CATS    = ['Gasolina', 'Insumos', 'Materiales'];
const MOV_FORM_RESET: Omit<MovForm, 'tipo' | 'fecha'> = { descripcion: '', categoria: '', monto: '', lleva_factura: false, es_empresa: false, tiene_cfdi: false };

// ── Tabla ISR RESICO PF 2024 (Art. 113-E LISR) ───────────────────────────────
const RESICO_TABLA = [
  { hasta: 25_000,    tasa: 0.010 },
  { hasta: 50_000,    tasa: 0.011 },
  { hasta: 83_333,    tasa: 0.015 },
  { hasta: 166_667,   tasa: 0.020 },
  { hasta: 250_000,   tasa: 0.025 },
  { hasta: 333_333,   tasa: 0.030 },
  { hasta: 500_000,   tasa: 0.040 },
  { hasta: 3_500_000, tasa: 0.050 },
];
const getResicotasa = (ingresos: number) =>
  RESICO_TABLA.find((r) => ingresos <= r.hasta)?.tasa ?? 0.050;

interface OverrideValues {
  precio_venta: number;
  costo_variable_unitario: number;
  costos_fijos_mensuales: number;
  unidades_mes_inicial: number;
  tasa_crecimiento_mensual: number;
}

/** Lo que entró al cálculo además de lo editable (finanzas@2; ausente en análisis anteriores). */
interface InputsFinanzas extends OverrideValues {
  precio_incluye_impuesto?: boolean | null;
  tasa_impuesto_consumo?: number;
  comision_venta_pct?: number | null;
  dias_cobro?: number | null;
  dias_pago?: number | null;
  sueldo_dueno_mensual?: number | null;
  pago_deuda_mensual?: number | null;
}

interface AnalisisFinanzas {
  id: string;
  pais: string;
  estado_analisis: string;
  error_mensaje?: string;
  resultado_estimado?: boolean;
  inputs_data: InputsFinanzas;
  overrides_data: OverrideValues | null;
  // Nullables a propósito: al recortar por plan el backend no genera estas
  // secciones y la columna jsonb viaja vacía. Las normalizadoras ya aceptan
  // null, pero lo que devuelven en ese caso son CEROS, no datos: nunca deben
  // pintarse sin consultar antes el gate (resumenTapado / proyeccionTapada).
  proyeccion_data: ProyeccionAnual | null;
  breakeven_data: BreakevenData;
  resumen_data: ResumenFinanzas | null;
  riesgos_data: RiesgosNegocio | null;
  /** Secciones que el backend recortó al generar/servir este análisis. */
  secciones_bloqueadas?: string[] | null;
  /** finanzas@2: confianza, supuestos, datos que faltan y secciones extra u ocultas. */
  meta_ia?: {
    transparencia?: Transparencia | null;
    secciones_extra?: SeccionExtra[];
    secciones_ocultas?: string[];
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtMXN = (n: number) => `$${fmt(n)}`;

// ─── Normalización defensiva de payloads jsonb ───────────────────────────────
// Las columnas *_data son jsonb sin validar: filas antiguas o sembradas a mano
// pueden llegar con una forma parcial (p. ej. sin `totales`, o con `escenarios`
// ausente). Un `?? {}` no protege porque el objeto SÍ existe: lo que falta es
// una clave anidada, y `proy.totales.ingresos_totales` rompe el render entero
// (página en blanco). Estas funciones garantizan la forma completa.
// Nota: el backend puede producir Infinity (márgenes no viables), que JSON
// serializa como null; aquí se degrada a 0 para no imprimir "null".
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const nullableNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function normalizeProyeccion(raw: unknown): ProyeccionAnual {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let acumuladoCorriente = 0;
  const meses: MesProyeccion[] = Array.isArray(r.meses)
    ? (r.meses as Record<string, unknown>[]).map((m, i) => {
        const mesIdx = num(m?.mes) || i + 1;
        const nombre_mes = str(m?.nombre_mes) || NOMBRES_MESES[(mesIdx - 1) % 12] || `Mes ${mesIdx}`;
        const unidades = num(m?.unidades);
        const ingresos = num(m?.ingresos);
        const costo_variable_total = num(m?.costo_variable_total) || num(m?.costos_variables);
        const costos_fijos = num(m?.costos_fijos);
        const utilidad_bruta = num(m?.utilidad_bruta) || (ingresos - costo_variable_total);
        const utilidad_neta = num(m?.utilidad_neta) || (utilidad_bruta - costos_fijos);
        const margen_neto = num(m?.margen_neto) || (ingresos > 0 ? (utilidad_neta / ingresos) * 100 : 0);
        acumuladoCorriente += utilidad_neta;
        const acumulado_neto = m?.acumulado !== undefined && m?.acumulado !== null
          ? num(m.acumulado)
          : m?.acumulado_neto !== undefined && m?.acumulado_neto !== null
          ? num(m.acumulado_neto)
          : acumuladoCorriente;

        return {
          mes: mesIdx,
          nombre_mes,
          unidades,
          ingresos,
          costo_variable_total,
          costos_fijos,
          utilidad_bruta,
          utilidad_neta,
          margen_neto,
          acumulado_neto,
        };
      })
    : [];

  const t = (r.totales ?? r.total_12m) as Record<string, unknown> | undefined;
  const unidades_totales = num(t?.unidades_totales) || num(t?.unidades) || meses.reduce((s, m) => s + m.unidades, 0);
  const ingresos_totales = num(t?.ingresos_totales) || num(t?.ingresos) || meses.reduce((s, m) => s + m.ingresos, 0);
  const costo_variable_total = num(t?.costo_variable_total) || num(t?.costos_variables) || meses.reduce((s, m) => s + m.costo_variable_total, 0);
  const costos_fijos_total = num(t?.costos_fijos_total) || num(t?.costos_fijos) || meses.reduce((s, m) => s + m.costos_fijos, 0);
  const utilidad_bruta_total = num(t?.utilidad_bruta_total) || num(t?.utilidad_bruta) || (ingresos_totales - costo_variable_total);
  const utilidad_neta_total = num(t?.utilidad_neta_total) || num(t?.utilidad_neta) || (utilidad_bruta_total - costos_fijos_total);
  const margen_neto_promedio = num(t?.margen_neto_promedio) || (ingresos_totales > 0 ? (utilidad_neta_total / ingresos_totales) * 100 : 0);

  let mejorMes = num(r.mejor_mes) || 1;
  let peorMes = num(r.peor_mes) || 1;
  if (meses.length > 0 && (!r.mejor_mes || !r.peor_mes)) {
    let maxU = -Infinity;
    let minU = Infinity;
    meses.forEach((m) => {
      if (m.utilidad_neta > maxU) { maxU = m.utilidad_neta; mejorMes = m.mes; }
      if (m.utilidad_neta < minU) { minU = m.utilidad_neta; peorMes = m.mes; }
    });
  }

  return {
    meses,
    totales: {
      unidades_totales,
      ingresos_totales,
      costo_variable_total,
      costos_fijos_total,
      utilidad_bruta_total,
      utilidad_neta_total,
      margen_neto_promedio,
    },
    mejor_mes: mejorMes,
    peor_mes: peorMes,
    caja_necesaria: num(r.caja_necesaria),
    mes_valle: num(r.mes_valle),
    capital_de_trabajo: num(r.capital_de_trabajo),
    cobertura_deuda: nullableNum(r.cobertura_deuda),
    economia_unitaria: normalizeEconomia(r.economia_unitaria),
  };
}

function normalizeEconomia(raw: unknown): EconomiaUnitaria | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  return {
    precio_neto: num(e.precio_neto),
    impuesto_unitario: num(e.impuesto_unitario),
    comision_unitaria: num(e.comision_unitaria),
    costo_variable_efectivo: num(e.costo_variable_efectivo),
    margen_unitario: num(e.margen_unitario),
    costos_fijos_efectivos: num(e.costos_fijos_efectivos),
  };
}

function normalizeBreakeven(raw: unknown): BreakevenData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const uBreakeven = num(r.unidades_breakeven_mes) || num(r.punto_equilibrio_unidades);
  const iBreakeven = num(r.ingresos_breakeven_mes) || num(r.punto_equilibrio_ingresos);
  const mContribUnit = num(r.margen_contribucion_unitario) || num(r.margen_contribucion);
  const mContribPct = num(r.margen_contribucion_porcentaje) || num(r.margen_contribucion_pct);
  const mesEq = nullableNum(r.mes_equilibrio) ?? nullableNum(r.mes_breakeven);
  const alc = r.punto_equilibrio_alcanzado === true || (mesEq !== null && mesEq > 0);
  // El payback NO se sustituye por el mes de equilibrio: cubrir costos fijos no
  // es haber recuperado la inversión. Si el backend no lo calculó, se dice por
  // qué (no hay inversión declarada, o no se recupera en 12 meses).
  const mesesRecup = nullableNum(r.meses_para_recuperar_inversion);
  const paybackNoDisponible =
    typeof r.payback_no_disponible === 'string' ? r.payback_no_disponible : null;

  let escenarios = Array.isArray(r.escenarios) && r.escenarios.length > 0
    ? (r.escenarios as Record<string, unknown>[]).map((e) => ({
        nombre: str(e?.nombre, '—'),
        descripcion: str(e?.descripcion),
        unidades_necesarias: num(e?.unidades_necesarias),
        ingresos_necesarios: num(e?.ingresos_necesarios),
        diferencia_vs_inicial: num(e?.diferencia_vs_inicial),
      }))
    : [];

  if (escenarios.length === 0 && (uBreakeven > 0 || iBreakeven > 0)) {
    const baseU = uBreakeven || 100;
    const baseI = iBreakeven || (baseU * 1000);
    escenarios = [
      {
        nombre: 'Conservador (-15% volumen)',
        descripcion: 'Menor demanda inicial o arranque de ventas más lento',
        unidades_necesarias: Math.round(baseU * 1.18),
        ingresos_necesarios: Math.round(baseI * 1.18),
        diferencia_vs_inicial: 18,
      },
      {
        nombre: 'Realista (Caso base)',
        descripcion: 'Comportamiento esperado según proyección de costos e ingresos',
        unidades_necesarias: baseU,
        ingresos_necesarios: baseI,
        diferencia_vs_inicial: 0,
      },
      {
        nombre: 'Optimista (+15% volumen)',
        descripcion: 'Mejor adopción de clientes y mayor eficiencia comercial',
        unidades_necesarias: Math.round(baseU * 0.85),
        ingresos_necesarios: Math.round(baseI * 0.85),
        diferencia_vs_inicial: -15,
      },
    ];
  }

  return {
    unidades_breakeven_mes: uBreakeven,
    ingresos_breakeven_mes: iBreakeven,
    margen_contribucion_unitario: mContribUnit,
    margen_contribucion_porcentaje: mContribPct,
    punto_equilibrio_alcanzado: alc,
    mes_equilibrio: mesEq,
    meses_para_recuperar_inversion: mesesRecup,
    payback_no_disponible: paybackNoDisponible,
    unidades_equilibrio_con_deuda: nullableNum(r.unidades_equilibrio_con_deuda),
    escenarios,
  };
}

function normalizeResumen(raw: unknown, proy?: ProyeccionAnual, analisis?: AnalisisFinanzas | null): ResumenFinanzas {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const an = (analisis && typeof analisis === 'object' ? analisis : {}) as Record<string, unknown>;

  let viabilidad: ResumenFinanzas['viabilidad'] = 'media';
  const v = r.viabilidad ?? r.veredicto ?? an.veredicto;
  if (v === 'alta' || v === 'viable' || v === 'muy_viable') {
    viabilidad = 'alta';
  } else if (v === 'baja' || v === 'no_viable' || v === 'riesgoso') {
    viabilidad = 'baja';
  } else if (v === 'media' || v === 'viable_con_ajustes' || v === 'moderado') {
    viabilidad = 'media';
  } else {
    const puntaje = num(r.puntaje) || num(an.viabilidad_score) || 70;
    viabilidad = puntaje >= 75 ? 'alta' : puntaje >= 50 ? 'media' : 'baja';
  }

  const color_viabilidad = str(
    r.color_viabilidad,
    viabilidad === 'alta' ? 'emerald' : viabilidad === 'media' ? 'yellow' : 'red'
  );

  const mensaje_viabilidad = str(
    r.mensaje_viabilidad ||
    r.resumen_ejecutivo ||
    an.resumen_ejecutivo ||
    (viabilidad === 'alta'
      ? 'El modelo financiero proyecta una sólida rentabilidad con punto de equilibrio sostenible.'
      : viabilidad === 'media'
      ? 'El proyecto muestra viabilidad financiera con ajustes recomendados en costos y volumen inicial.'
      : 'Se recomienda revisar la estructura de costos y precios antes de comenzar operaciones.')
  );

  const roi_anual = num(r.roi_anual) || num(an.roi_estimado) || (
    proy && proy.totales.costos_fijos_total > 0
      ? Math.round((Math.max(0, proy.totales.utilidad_neta_total) / proy.totales.costos_fijos_total) * 100)
      : 24
  );

  // Sin payback real no se rellena con el mes de equilibrio (ver normalizeBreakeven).
  const payback_meses = nullableNum(r.payback_meses);
  const payback_no_disponible =
    typeof r.payback_no_disponible === 'string'
      ? (r.payback_no_disponible as ResumenFinanzas['payback_no_disponible'])
      : payback_meses === null
        ? 'sin_inversion_declarada'
        : null;

  const ingreso_promedio_mensual = num(r.ingreso_promedio_mensual) || (
    proy ? Math.round(proy.totales.ingresos_totales / 12) : 0
  );

  const utilidad_promedio_mensual = num(r.utilidad_promedio_mensual) || (
    proy ? Math.round(proy.totales.utilidad_neta_total / 12) : 0
  );

  const recomendaciones = Array.isArray(r.recomendaciones)
    ? (r.recomendaciones as unknown[]).filter((rec): rec is string => typeof rec === 'string')
    : [];

  const rawAlertas = Array.isArray(r.alertas)
    ? r.alertas
    : Array.isArray(an.alertas)
    ? an.alertas
    : [];

  const alertas = (rawAlertas as unknown[]).map((alt) => {
    if (typeof alt === 'string') return alt;
    if (alt && typeof alt === 'object') {
      const o = alt as Record<string, unknown>;
      return String(o.mensaje || o.texto || o.titulo || '');
    }
    return String(alt ?? '');
  }).filter((msg) => msg.trim().length > 0);

  return {
    viabilidad,
    color_viabilidad,
    mensaje_viabilidad,
    roi_anual,
    base_roi: r.base_roi === 'inversion_inicial' ? 'inversion_inicial' : 'costos_fijos_anuales',
    payback_meses,
    payback_no_disponible,
    ingreso_promedio_mensual,
    utilidad_promedio_mensual,
    recomendaciones,
    alertas,
  };
}

/** A diferencia de las otras normalizadoras, null es un resultado válido aquí
 * (análisis viejo sin esta sección, o plan sin acceso): no se inventan riesgos. */
function normalizeRiesgos(raw: RiesgosNegocio | null | undefined): RiesgosNegocio | null {
  if (!raw || !Array.isArray(raw.riesgos) || raw.riesgos.length === 0) return null;
  return {
    patron_comun: str(raw.patron_comun),
    riesgos: raw.riesgos.map((r) => ({
      titulo: str(r?.titulo),
      descripcion: str(r?.descripcion),
      senales_alerta: Array.isArray(r?.senales_alerta)
        ? r.senales_alerta.filter((s): s is string => typeof s === 'string')
        : [],
      como_evitarlo: str(r?.como_evitarlo),
    })),
  };
}

function normalizeInputs(raw: OverrideValues | null | undefined): OverrideValues {
  return {
    precio_venta: num(raw?.precio_venta),
    costo_variable_unitario: num(raw?.costo_variable_unitario),
    costos_fijos_mensuales: num(raw?.costos_fijos_mensuales),
    unidades_mes_inicial: num(raw?.unidades_mes_inicial),
    tasa_crecimiento_mensual: num(raw?.tasa_crecimiento_mensual),
  };
}

const CHART_COLORS = {
  ingresos: '#10B981',
  costos:   '#E74C3C',
  utilidad: '#3B82F6',
  acumulado:'#8B5CF6',
};

// Dark-theme chart tooltip
const ChartTooltip = ({ active, payload, label, fmtFn }: { active?: boolean; payload?: {color:string; name:string; value:number}[]; label?: string; fmtFn?: (n:number)=>string }) => {
  if (!active || !payload?.length) return null;
  const doFmt = fmtFn ?? fmtMXN;
  return (
    <div className="bg-gray-900 border border-white/10 rounded-control shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-white mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {doFmt(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── Loading steps ────────────────────────────────────────────────────────────
const LOADING_STEPS = [
  { label: 'Procesando parámetros financieros', sub: 'Validando precio, costos y proyección inicial' },
  { label: 'Calculando proyección a 12 meses', sub: 'Aplicando tasa de crecimiento mensual compuesta' },
  { label: 'Calculando punto de equilibrio', sub: 'Determinando unidades y escenarios de punto de equilibrio' },
  { label: 'Generando análisis de viabilidad', sub: 'Evaluando ROI, periodo de recuperación y recomendaciones' },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function FinanzasResultadoPage() {
  const router = useRouter();
  const { productoId, analisisId } = useParams<{ productoId: string; analisisId: string }>();
  const [analisis, setAnalisis] = useState<AnalisisFinanzas | null>(null);
  const [polling, setPolling] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  // En plan gratuito 'resumen' queda tapado (finanzas.resumen), así que se
  // aterriza en 'breakeven', la única pestaña con datos reales; los planes de
  // pago siguen abriendo en 'resumen'. Se lee localStorage aquí en vez de usar
  // `userPlan` porque ese estado se declara más abajo en este mismo componente.
  const [tab, setTab] = useState<'proyeccion' | 'breakeven' | 'resumen' | 'mando' | 'completo'>(() => {
    try {
      const u = localStorage.getItem('usuario');
      const plan = u ? (JSON.parse(u).plan as string | undefined) : undefined;
      return esPlanDePago(plan) ? 'resumen' : 'breakeven';
    } catch {
      return 'breakeven';
    }
  });
  const [printMode, setPrintMode] = useState(false);
  const [overrides, setOverrides] = useState<OverrideValues | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [movForm, setMovForm] = useState<MovForm>({ tipo: 'ingreso', fecha: hoyLocal(), ...MOV_FORM_RESET });
  const [userPlan] = useState<string>(() => { try { const u = localStorage.getItem('usuario'); return u ? JSON.parse(u).plan || 'freemium' : 'freemium'; } catch { return 'freemium'; } });
  // Gate por sección: plan ACTUAL + espejo estático de lib/gating.ts, unido a lo
  // que el backend declare en secciones_bloqueadas. No se mira el plan a pelo
  // porque un análisis lanzado en gratuito y consultado ya en Pro debe abrirse,
  // y al revés un plan cacheado en localStorage no debe desbloquear nada solo.
  const bloqueadas = useMemo(
    () => seccionesBloqueadasDe(userPlan, 'finanzas', analisis?.secciones_bloqueadas),
    [userPlan, analisis?.secciones_bloqueadas],
  );
  const resumenTapado = bloqueadas.has('finanzas.resumen');
  const proyeccionTapada = bloqueadas.has('finanzas.proyeccion_12m');
  // Se conserva el nombre isPro porque alimenta 6 puntos del Centro de Mando
  // (límite de 3 movimientos, categorías con gate, importación CSV). Lo que
  // cambia es el origen: la sección recortada, no esPlanDePago(userPlan).
  const isPro = !bloqueadas.has('finanzas.centro_mando');
  const [showCsvModal, setShowCsvModal] = useState(false);

  // ── Configuración fiscal y moneda por país ──────────────────────────────────
  const taxCfg = useMemo(() => getTaxConfig(analisis?.pais ?? 'MX'), [analisis?.pais]);
  const fmtCurrency = useCallback((n: number) => {
    const absN = new Intl.NumberFormat(taxCfg.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(n));
    return `${n < 0 ? '-' : ''}${taxCfg.simbolo}${absN}`;
  }, [taxCfg]);
  const shortCurrency = useCallback((n: number) => {
    if (Math.abs(n) >= 1_000_000) return `${taxCfg.simbolo}${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${taxCfg.simbolo}${(n / 1_000).toFixed(0)}k`;
    return `${taxCfg.simbolo}${Math.round(n)}`;
  }, [taxCfg]);

  const [movLoading, setMovLoading] = useState(false);
  const [imssEmpleados, setImssEmpleados] = useState('0');
  const [imbcSbc, setImbcSbc] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const isPreloaded = useRef(false);
  const initialCheckDone = useRef(false);

  useEffect(() => {
    stepIntervalRef.current = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 2500);

    // El intervalo se limpia al desmontar, pero una petición ya en vuelo podía
    // escribir el análisis anterior sobre el que se acaba de abrir.
    let vigente = true;

    const check = async () => {
      try {
        const { data } = await api.get(`/finanzas/${analisisId}/status`);
        if (!vigente) return;
        // GET /api/finanzas/:id/status responde { id, estado, error }.
        // Se acepta estado_analisis como alias por compatibilidad.
        const estado: string | undefined = data?.estado ?? data?.estado_analisis;
        if (estado === 'completado') {
          if (!initialCheckDone.current) {
            isPreloaded.current = true;
          }
          initialCheckDone.current = true;
          const full = await api.get(`/finanzas/${analisisId}`);
          setAnalisis(full.data);
          setOverrides(full.data.overrides_data ?? full.data.inputs_data);
          setPolling(false);
          if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
        } else if (estado === 'error') {
          initialCheckDone.current = true;
          setAnalisis({
            ...(data ?? {}),
            id: data?.id ?? analisisId,
            estado_analisis: 'error',
            error_mensaje: data?.error ?? data?.error_mensaje ?? undefined,
          } as AnalisisFinanzas);
          setPolling(false);
          if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
        } else {
          initialCheckDone.current = true;
        }
      } catch {
        initialCheckDone.current = true;
        setPolling(false);
      }
    };

    check();
    intervalRef.current = setInterval(check, 2000);
    return () => {
      vigente = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    };
  }, [analisisId, router]);

  useEffect(() => {
    if (!polling && intervalRef.current) clearInterval(intervalRef.current);
  }, [polling]);

  // Red de seguridad: si la pestaña activa queda tapada (p. ej. el backend
  // recortó una sección que el espejo estático todavía no declaraba, o el plan
  // de localStorage cambió tras montar) se cae a 'breakeven', la única pestaña
  // cuyos datos nunca se recortan. Sin esto la página quedaría en blanco.
  useEffect(() => {
    const tabTapada =
      (tab === 'resumen' && resumenTapado) ||
      (tab === 'proyeccion' && proyeccionTapada) ||
      (tab === 'mando' && !isPro);
    if (tabTapada) setTab('breakeven');
  }, [tab, resumenTapado, proyeccionTapada, isPro]);

  const handlePrint = () => {
    setPrintMode(true);
    setTimeout(() => {
      window.print();
      window.addEventListener('afterprint', () => setPrintMode(false), { once: true });
    }, 150);
  };

  const handleOverrideChange = useCallback((field: keyof OverrideValues, raw: string) => {
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0) return;
    setOverrides((prev) => {
      const next = { ...(prev!), [field]: val };
      // debounced PATCH
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus('saving');
      saveTimerRef.current = setTimeout(async () => {
        try {
          await api.patch(`/finanzas/${analisisId}/overrides`, next);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        } catch { setSaveStatus('idle'); }
      }, 1500);
      return next;
    });
  }, [analisisId]);

  const handleReset = useCallback(async () => {
    if (!analisis) return;
    const orig = analisis.inputs_data;
    setOverrides(orig);
    setSaveStatus('saving');
    try {
      await api.patch(`/finanzas/${analisisId}/overrides`, orig);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch { setSaveStatus('idle'); }
  }, [analisis, analisisId]);

  // Load movements when mando tab is first activated
  const movLoaded = useRef(false);
  useEffect(() => {
    if ((tab === 'mando' || tab === 'completo') && !movLoaded.current) {
      movLoaded.current = true;
      let vigente = true;
      api.get(`/contabilidad/${productoId}`)
        .then(({ data }) => { if (vigente) setMovimientos(data); })
        .catch(() => {});
      return () => { vigente = false; };
    }
  }, [tab, productoId]);

  const handleAddMovimiento = useCallback(async () => {
    if (!movForm.descripcion.trim() || !movForm.monto || Number(movForm.monto) <= 0) return;
    if (!isPro && movimientos.filter((m) => !m.es_auto_generado).length >= 3) return;
    setMovLoading(true);
    try {
      const monto = Number(movForm.monto);
      const created: Movimiento[] = [];

      const { data: main } = await api.post(`/contabilidad/${productoId}`, {
        tipo: movForm.tipo, descripcion: movForm.descripcion.trim(),
        categoria: movForm.categoria.trim(), monto, fecha: movForm.fecha,
        tiene_cfdi: movForm.tiene_cfdi, es_auto_generado: false, parent_movimiento_id: null,
      });
      created.push(main);

      if (movForm.tipo === 'ingreso' && movForm.lleva_factura) {
        const taxes = [{ label: 'IVA por pagar', monto: Math.round(monto * 0.16 * 100) / 100 }];
        if (movForm.es_empresa) {
          taxes.push({ label: 'Retención ISR', monto: Math.round(monto * 0.10 * 100) / 100 });
          taxes.push({ label: 'Retención IVA', monto: Math.round(monto * 0.16 * (2 / 3) * 100) / 100 });
        }
        for (const t of taxes) {
          const { data: tax } = await api.post(`/contabilidad/${productoId}`, {
            tipo: 'egreso', descripcion: `${t.label} — ${movForm.descripcion.trim()}`,
            categoria: t.label, monto: t.monto, fecha: movForm.fecha,
            tiene_cfdi: false, es_auto_generado: true, parent_movimiento_id: main.id,
          });
          created.push(tax);
        }
      }

      setMovimientos((prev) => [...[...created].reverse(), ...prev]);
      setMovForm((f) => ({ ...f, ...MOV_FORM_RESET }));
    } catch { /* ignore */ }
    setMovLoading(false);
  }, [movForm, productoId, movimientos, isPro]);

  const handleDeleteMovimiento = useCallback(async (id: string) => {
    await api.delete(`/contabilidad/movimiento/${id}`).catch(() => {});
    setMovimientos((prev) => prev.filter((m) => m.id !== id && m.parent_movimiento_id !== id));
  }, []);

  const handleExport = useCallback(() => {
    const totalIngresos  = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
    const totalEgresos   = movimientos.filter((m) => m.tipo === 'egreso' && !IMPUESTO_CATS.includes(m.categoria)).reduce((s, m) => s + Number(m.monto), 0);
    const ivaACobrar     = movimientos.filter((m) => m.categoria === 'IVA por pagar' && m.es_auto_generado).reduce((s, m) => s + Number(m.monto), 0);
    const ivaPagadoExp   = movimientos.filter((m) => m.categoria === 'IVA por pagar' && !m.es_auto_generado).reduce((s, m) => s + Number(m.monto), 0);
    const ivaAcreditable = movimientos.filter((m) => m.tipo === 'egreso' && m.tiene_cfdi && !m.es_auto_generado).reduce((s, m) => s + Math.round(Number(m.monto) * 0.16 * 100) / 100, 0);
    const isrRetenido    = movimientos.filter((m) => m.categoria === 'Retención ISR').reduce((s, m) => s + Number(m.monto), 0);
    const saldo = totalIngresos - totalEgresos - ivaACobrar;
    const lines = [
      `RESUMEN FISCAL — BI 0 A 100`,
      `Generado: ${new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}`,
      '='.repeat(44),
      `Total Ingresos:          ${fmtCurrency(totalIngresos)}`,
      `Total Egresos (operativos): ${fmtCurrency(totalEgresos)}`,
      `Saldo Neto:              ${fmtCurrency(saldo)}`,
      '',
      '--- IMPUESTOS ---',
      `IVA trasladado (cobrado):  ${fmtCurrency(ivaACobrar)}`,
      `IVA acreditable (CFDI):    ${fmtCurrency(ivaAcreditable)}`,
      `IVA pagado al SAT:         ${fmtCurrency(ivaPagadoExp)}`,
      `Saldo IVA pendiente:       ${fmtCurrency(Math.max(0, ivaACobrar - ivaAcreditable - ivaPagadoExp))}`,
      `ISR retenido:              ${fmtCurrency(isrRetenido)}`,
      '',
      '--- MOVIMIENTOS ---',
      ...movimientos.map((m) => `${m.fecha} | ${m.tipo === 'ingreso' ? 'INGRESO' : 'EGRESO '} | ${(m.categoria || 'Sin categoría').padEnd(20)} | ${m.descripcion.padEnd(30)} | ${fmtCurrency(Number(m.monto))}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `resumen-fiscal-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }, [movimientos]);

  const liveMetrics = useMemo(() => {
    if (!overrides) return null;
    const { precio_venta: pv, costo_variable_unitario: cvu, costos_fijos_mensuales: cfDeclarados, unidades_mes_inicial: u1 } = overrides;
    if (pv <= 0) return null;
    // Mismo margen que el backend (economiaUnitaria.ts): sin el impuesto que
    // trae el precio, con la comisión de la plataforma y el sueldo del dueño.
    const extra = analisis?.inputs_data;
    const tasa = extra?.precio_incluye_impuesto ? (extra.tasa_impuesto_consumo ?? taxCfg.consumo.tasa) : 0;
    const pNeto = pv / (1 + tasa);
    const comision = pv * ((extra?.comision_venta_pct ?? 0) / 100);
    const cf = cfDeclarados + (extra?.sueldo_dueno_mensual ?? 0);
    const mc_u = pNeto - cvu - comision;
    const mc_pct = pNeto > 0 ? (mc_u / pNeto) * 100 : 0;
    const u_be = mc_u > 0 ? Math.ceil(cf / mc_u) : Infinity;
    const ingresos_be = u_be * pNeto;
    const utilidad_mes1 = (u1 * mc_u) - cf;
    const viabilidad: 'alta' | 'media' | 'baja' =
      mc_pct >= 30 && u1 >= u_be ? 'alta' :
      mc_pct >= 15 ? 'media' : 'baja';
    return { mc_u, mc_pct, u_be, ingresos_be, utilidad_mes1, viabilidad };
  }, [overrides, analisis?.inputs_data, taxCfg]);

  // Loader: mínimo 700ms si el análisis ya estaba completado, o 4.5s si es una corrida nueva
  const { showLoader, loaderDone } = useAnalysisLoaderGate(
    !!analisis && !polling,
    isPreloaded.current ? 700 : 4500
  );

  if (analisis?.estado_analisis === 'error') {
    return (
      <AnalysisError
        modulo="finanzas"
        title="Fallo en la proyección financiera"
        message={analisis.error_mensaje}
        retryHref={`/dashboard/finanzas/${productoId}`}
      />
    );
  }

  // `|| !analisis` mantiene el estrechamiento de tipos para el resto del render.
  if (showLoader || !analisis) {
    return (
      <AnalysisLoader
        modulo="finanzas"
        steps={LOADING_STEPS}
        currentStep={loadingStep}
        title="Calculando viabilidad financiera"
        subtitle="Proyectando ingresos, costos y punto de equilibrio"
        done={loaderDone}
      />
    );
  }

  // Forma completa garantizada: ningún acceso anidado (proy.totales.*,
  // be.escenarios, res.alertas) puede lanzar aunque el jsonb venga parcial.
  const proy = normalizeProyeccion(analisis.proyeccion_data);
  const be = normalizeBreakeven(analisis.breakeven_data);
  const res = normalizeResumen(analisis.resumen_data, proy, analisis);
  const riesgos = normalizeRiesgos(analisis.riesgos_data);
  const inp = normalizeInputs(analisis.inputs_data);
  // Lo que entró al cálculo además de lo editable (análisis viejos: nada).
  const inputsExtra: InputsFinanzas = analisis.inputs_data ?? inp;
  const eco = proy.economia_unitaria;
  const parametrosExtra: { label: string; value: string }[] = [];
  if (eco && eco.impuesto_unitario > 0) {
    parametrosExtra.push({ label: `Precio sin ${taxCfg.consumo.nombre}`, value: fmtCurrency(eco.precio_neto) });
  }
  if (eco && eco.comision_unitaria > 0) {
    parametrosExtra.push({ label: 'Comisión por venta', value: `${fmtCurrency(eco.comision_unitaria)} (${inputsExtra.comision_venta_pct ?? 0}%)` });
  }
  if ((inputsExtra.sueldo_dueno_mensual ?? 0) > 0) {
    parametrosExtra.push({ label: 'Sueldo del dueño/mes', value: fmtCurrency(inputsExtra.sueldo_dueno_mensual ?? 0) });
  }
  if ((inputsExtra.dias_cobro ?? 0) > 0 || (inputsExtra.dias_pago ?? 0) > 0) {
    parametrosExtra.push({ label: 'Cobro / pago', value: `${inputsExtra.dias_cobro ?? 0} / ${inputsExtra.dias_pago ?? 0} días` });
  }
  if ((inputsExtra.pago_deuda_mensual ?? 0) > 0) {
    parametrosExtra.push({ label: 'Cuota de deuda/mes', value: fmtCurrency(inputsExtra.pago_deuda_mensual ?? 0) });
  }

  // Chart data
  const chartData = (proy?.meses || []).map((m) => ({
    name: m.nombre_mes?.slice(0, 3) ?? '',
    Ingresos: m.ingresos ?? 0,
    Costos: (m.costo_variable_total ?? 0) + (m.costos_fijos ?? 0),
    'Ut. Neta': m.utilidad_neta ?? 0,
    Acumulado: m.acumulado_neto ?? 0,
  }));

  return (
    <div ref={mainRef} className="px-4 sm:px-6 py-10 max-w-5xl mx-auto pb-24 relative">

      {/* Ambient glows */}
      <div className="fixed top-[-15%] right-[-8%] w-[55vh] h-[55vh] bg-emerald-500/10 rounded-pill blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-8%] w-[40vh] h-[40vh] bg-blue-500/8 rounded-pill blur-[110px] pointer-events-none" />
      <div className="fixed top-[40%] right-[20%] w-[30vh] h-[30vh] bg-violet-500/6 rounded-pill blur-[90px] pointer-events-none" />

      {/* Breadcrumb & Retorno */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8" data-print="hide">
        <Breadcrumbs
          showBack
          backHref={`/dashboard/producto/${productoId}`}
          backLabel="Ficha del producto"
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Finanzas', href: `/dashboard/finanzas/${productoId}` },
            { label: 'Resultado' },
          ]}
          className="mb-0"
        />
        <button onClick={handlePrint} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest border border-white/10 text-white/60 px-4 py-2 rounded-control hover:border-white/30 hover:text-white transition-all cursor-pointer">
          <FileText className="w-4 h-4" strokeWidth={1.8} />
          <span>Descargar PDF</span>
        </button>
      </div>

      {/* Print header */}
      <div data-print="show" className="print:block hidden mb-6 pb-4 border-b border-white/10">
        <p className="font-bold text-xl text-white">BI 0 A 100 — Proyección Financiera</p>
        <p className="text-sm text-white/50">{new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}</p>
      </div>

      {/* Hero Banner */}
      <Revelar
        className="mb-8 rounded-surface border border-emerald-500/20 p-7 relative overflow-hidden"
        style={{ background: fondoAcento(0.12) }}
      >
        <div className="absolute top-0 right-0 w-[280px] h-[280px] bg-emerald-500/12 rounded-pill blur-[90px] pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-16 h-16 rounded-surface bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 text-emerald-400">
            <BarChart3 className="w-8 h-8" strokeWidth={1.8} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/90">Análisis Completado</span>
              <span className="w-1 h-1 rounded-pill bg-emerald-400/40" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-white/30">Proyección Financiera IA</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Proyección Financiera</h1>
            <p className="text-sm text-white/40 mt-1">
              {proyeccionTapada
                ? 'Punto de equilibrio · Escenarios de ventas'
                : '12 meses proyectados · Punto de equilibrio · Centro de mando contable'}
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            {/* Con finanzas.resumen recortado, res.viabilidad y res.roi_anual son
                el par 'media' / 0 que fabrica normalizeResumen(null): publicarlo
                aquí sería inventar un dato, así que va el candado en su lugar. */}
            {resumenTapado ? (
              <Link
                href="/dashboard/billing"
                data-print="hide"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold text-amber-300 border border-amber-400/30 bg-amber-500/10 transition-all hover:bg-amber-500/20 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.8} />
                <span>Viabilidad y ROI desde el plan Emprendedor</span>
              </Link>
            ) : (
              <>
                <div className={`text-[11px] font-semibold px-4 py-2 rounded-lg border capitalize ${
                  res.viabilidad === 'alta'  ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' :
                  res.viabilidad === 'media' ? 'text-amber-300 bg-amber-500/15 border-amber-500/30' :
                  'text-red-300 bg-red-500/15 border-red-500/30'
                }`}>Viabilidad {res.viabilidad}</div>
                <div className="text-[10px] font-medium text-emerald-400/60 uppercase tracking-widest">
                  {res.base_roi === 'inversion_inicial' ? 'ROI' : 'Retorno s/ costos fijos'}: {res.roi_anual}% anual
                </div>
              </>
            )}
          </div>
        </div>
      </Revelar>

      <AvisoEstimacion visible={analisis?.resultado_estimado} className="mb-6" />

      {/* KPI row — los cuatro KPIs salen de resumen_data y proyeccion_data, las
          dos secciones que el gratuito no genera. Con cualquiera recortada la
          fila entera se tapa: pintarla mostraría $0 / 0% como si fueran cifras
          calculadas. El punto de equilibrio sí es real y sigue en su pestaña. */}
      {resumenTapado || proyeccionTapada ? (
        <LockedSection
          plan={userPlan}
          className="mb-6"
          titulo="Indicadores anuales desde el plan Emprendedor"
          detalle="Ingresos y utilidad neta del año 1, ROI anual y margen neto promedio. El punto de equilibrio y sus escenarios ya están incluidos en tu plan."
        >
          <SkeletonTarjetas cantidad={4} />
        </LockedSection>
      ) : (
        <Revelar className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Ingresos año 1',
              value: fmtCurrency(proy.totales.ingresos_totales),
              icon: (
                <Banknote className="w-5 h-5 text-emerald-400" strokeWidth={1.8} />
              ),
              color: 'text-emerald-400',
              border: 'border-emerald-500/20',
              glow: 'bg-emerald-500/8'
            },
            {
              // La proyección no descuenta IVA, ISR ni cuotas: decirlo evita
              // que el dueño planee gastando dinero que le debe al fisco.
              label: 'Utilidad antes de impuestos',
              value: fmtCurrency(proy.totales.utilidad_neta_total),
              icon: (
                <TrendingUp className={`w-5 h-5 ${proy.totales.utilidad_neta_total >= 0 ? 'text-emerald-400' : 'text-red-400'}`} strokeWidth={1.8} />
              ),
              color: proy.totales.utilidad_neta_total >= 0 ? 'text-emerald-400' : 'text-red-400',
              border: proy.totales.utilidad_neta_total >= 0 ? 'border-emerald-500/20' : 'border-red-500/20',
              glow: proy.totales.utilidad_neta_total >= 0 ? 'bg-emerald-500/5' : 'bg-red-500/5'
            },
            {
              // Sin inversión declarada esto mide utilidad contra costos fijos,
              // que no es ROI: la etiqueta lo dice en vez de disfrazarlo.
              label: res.base_roi === 'inversion_inicial' ? 'ROI anual' : 'Retorno s/ costos fijos',
              value: `${res.roi_anual}%`,
              icon: (
                <Target className="w-5 h-5 text-blue-400" strokeWidth={1.8} />
              ),
              color: res.roi_anual >= 20 ? 'text-emerald-400' : res.roi_anual >= 10 ? 'text-amber-400' : 'text-red-400',
              border: 'border-blue-500/20',
              glow: 'bg-blue-500/5'
            },
            {
              label: 'Margen neto prom.',
              value: `${Math.round(proy.totales.margen_neto_promedio)}%`,
              icon: (
                <Percent className="w-5 h-5 text-violet-400" strokeWidth={1.8} />
              ),
              color: proy.totales.margen_neto_promedio >= 20 ? 'text-emerald-400' : 'text-amber-400',
              border: 'border-violet-500/20',
              glow: 'bg-violet-500/5'
            },
          ].map((k) => (
            <div key={k.label} className={`rounded-control border ${k.border} p-4 relative overflow-hidden ${k.glow}`}>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="mb-2">{k.icon}</div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{k.label}</p>
              <p className={`font-bold text-xl tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </Revelar>
      )}

      {/* Viabilidad banner — se omite entero si finanzas.resumen está recortado:
          el veredicto 'media' y su mensaje serían el fallback del normalizador,
          no una evaluación del análisis. El candado ya está en el hero. */}
      {!resumenTapado && (
        <Revelar className={`rounded-control border p-4 mb-6 flex gap-3 items-start relative overflow-hidden ${
          res.viabilidad === 'alta'  ? 'border-emerald-500/30 bg-emerald-500/8' :
          res.viabilidad === 'media' ? 'border-amber-500/30 bg-amber-500/8' :
          'border-red-500/30 bg-red-500/8'
        }`}>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <span className={`w-3 h-3 rounded-pill flex-shrink-0 mt-1 shadow-lg ${
            res.viabilidad === 'alta' ? 'bg-emerald-400 shadow-emerald-400/40' :
            res.viabilidad === 'media' ? 'bg-amber-400 shadow-amber-400/40' :
            'bg-red-400 shadow-red-400/40'
          }`} />
          <div>
            <p className={`font-bold capitalize ${
              res.viabilidad === 'alta' ? 'text-emerald-300' : res.viabilidad === 'media' ? 'text-amber-300' : 'text-red-300'
            }`}>Viabilidad {res.viabilidad}</p>
            <p className="text-sm mt-0.5 text-zinc-400">{res.mensaje_viabilidad}</p>
          </div>
        </Revelar>
      )}

      {/* ─── NAVEGACIÓN POR PESTAÑAS (LUJO SILENCIOSO) ─── */}
      <div className="sticky top-4 z-20 mb-6 print:hidden">
        <div className="p-1.5 rounded-2xl bg-[#08101a]/85 border border-white/10 backdrop-blur-xl shadow-2xl flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {([
            { key: 'resumen',    label: 'Resumen',             icon: BarChart3, bloqueada: resumenTapado },
            { key: 'proyeccion', label: 'Proyección 12M',      icon: TrendingUp, bloqueada: proyeccionTapada },
            { key: 'breakeven',  label: 'Punto de Equilibrio', icon: Target, bloqueada: false },
            { key: 'mando',      label: 'Centro de Mando',     icon: SlidersHorizontal, bloqueada: !isPro },
            { key: 'completo',   label: 'Vista Completa',      icon: Layers, bloqueada: false },
          ] as const).map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                disabled={t.bloqueada}
                aria-disabled={t.bloqueada}
                title={t.bloqueada ? 'Esta sección se incluye desde el plan Emprendedor' : undefined}
                onClick={() => { if (t.bloqueada) return; setTab(t.key); }}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                  active
                    ? 'text-white bg-white/[0.08] border border-white/20 shadow-lg shadow-black/20'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03] border border-transparent'
                } ${t.bloqueada ? 'opacity-30 cursor-not-allowed' : ''}`}
              >
                {active && (
                  <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent pointer-events-none" />
                )}
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-emerald-400' : 'text-white/40'}`} />
                <span>{t.label}</span>
                {t.bloqueada && (
                  <Lock className="w-3 h-3 text-amber-400/80 ml-0.5" strokeWidth={1.8} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ TAB: RESUMEN ══ */}
      {/* printMode fuerza el render de todas las pestañas para el PDF, así que
          el gate va aquí también: sin él el PDF del gratuito llevaría los ceros. */}
      {(tab === 'resumen' || tab === 'completo' || printMode) && !resumenTapado && (
        <div className="space-y-5">
          {/* Inputs */}
          <div className="rounded-surface border border-white/8 p-5 relative overflow-hidden" style={FONDO_PANEL}>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-5 rounded-pill bg-white/20 block" />
              <h2 className="text-base font-semibold text-white">Parámetros del análisis</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Precio de venta',     value: fmtCurrency(inp.precio_venta) },
                { label: 'Costo variable/u',    value: fmtCurrency(inp.costo_variable_unitario) },
                { label: 'Costos fijos/mes',    value: fmtCurrency(inp.costos_fijos_mensuales) },
                { label: 'Unidades mes 1',      value: fmt(inp.unidades_mes_inicial) },
                { label: 'Crecimiento mensual', value: `${inp.tasa_crecimiento_mensual}%` },
                { label: 'Margen contribución', value: `${Math.round(be.margen_contribucion_porcentaje)}%` },
                // finanzas@2: lo que se descontó y sumó. Solo si se declaró.
                ...parametrosExtra,
              ].map((i) => (
                <div key={i.label} className="bg-white/3 border border-white/8 rounded-control p-3">
                  <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{i.label}</p>
                  <p className="font-semibold text-white text-sm">{i.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Alertas */}
          {(res.alertas || []).length > 0 && (
            <div className="rounded-surface border border-amber-500/15 bg-amber-500/4 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1 h-5 rounded-pill bg-amber-500/50 block" />
                <h2 className="text-base font-semibold text-white">Alertas</h2>
              </div>
              <ul className="space-y-2">
                {(res.alertas || []).map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/70 bg-white/3 border border-white/8 rounded-control p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recomendaciones */}
          <div className="rounded-surface border border-white/8 p-5" style={FONDO_PANEL}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-5 rounded-pill bg-indigo-400/40 block" />
              <h2 className="text-base font-semibold text-white">Recomendaciones</h2>
            </div>
            <ul className="space-y-2">
              {(res.recomendaciones || []).map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-white/70">
                  <span className="text-indigo-400/70 font-semibold flex-shrink-0">→</span><span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Riesgos del negocio — null si es un análisis viejo sin esta
              sección, o si el plan no la incluye (todo el tab ya está tapado
              por resumenTapado en ese caso, así que aquí null == "no hay"). */}
          {riesgos && (
            <div className="rounded-surface border border-red-500/15 bg-red-500/4 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1 h-5 rounded-pill bg-red-500/50 block" />
                <h2 className="text-base font-semibold text-white">Riesgos del Negocio</h2>
              </div>
              <p className="text-sm text-white/60 mb-4">{riesgos.patron_comun}</p>
              <div className="space-y-3">
                {riesgos.riesgos.map((r, i) => (
                  <div key={i} className="bg-white/3 border border-white/8 rounded-control p-4">
                    <p className="font-semibold text-white text-sm mb-1.5">{r.titulo}</p>
                    <p className="text-sm text-white/60 mb-2">{r.descripcion}</p>
                    {r.senales_alerta.length > 0 && (
                      <ul className="space-y-1 mb-2">
                        {r.senales_alerta.map((s, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-white/50">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400/70 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-emerald-300/80"><span className="font-semibold">Cómo evitarlo: </span>{r.como_evitarlo}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payback + mejor/peor */}
          <div className="grid grid-cols-3 gap-4">
            {/* Payback */}
            {/* Sin inversión declarada no hay payback: se pide el dato en vez
                de enseñar un mes que no significa nada. */}
            <div className={`rounded-surface border p-4 text-center ${
              res.payback_meses && res.payback_meses <= 6 ? 'border-emerald-500/30 bg-emerald-500/8' :
              res.payback_meses ? 'border-amber-500/30 bg-amber-500/8' :
              res.payback_no_disponible === 'sin_inversion_declarada' ? 'border-white/12 bg-white/4' :
              'border-red-500/30 bg-red-500/8'
            }`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Recuperación</p>
              <p className={`text-lg font-bold ${
                res.payback_meses && res.payback_meses <= 6 ? 'text-emerald-300' :
                res.payback_meses ? 'text-amber-300' :
                res.payback_no_disponible === 'sin_inversion_declarada' ? 'text-white/50' : 'text-red-300'
              }`}>
                {res.payback_meses
                  ? `Mes ${res.payback_meses}`
                  : res.payback_no_disponible === 'sin_inversion_declarada'
                    ? 'Sin calcular'
                    : 'No en 12 meses'}
              </p>
              <p className="text-[10px] text-white/35 mt-0.5">
                {res.payback_meses
                  ? 'recuperas la inversión'
                  : res.payback_no_disponible === 'sin_inversion_declarada'
                    ? 'declara tu inversión inicial'
                    : 'recuperación inversión'}
              </p>
            </div>
            {/* Caja necesaria: el punto más bajo del saldo. Un negocio
                rentable en el papel puede quedarse sin dinero antes de llegar. */}
            {proy.caja_necesaria > 0 ? (
              <div className="rounded-surface border border-amber-500/30 bg-amber-500/8 p-4 text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Caja necesaria</p>
                <p className="text-lg font-bold text-amber-300">{fmtCurrency(proy.caja_necesaria)}</p>
                <p className="text-[10px] text-white/35 mt-0.5">
                  {proy.mes_valle > 0 ? `punto más bajo: mes ${proy.mes_valle}` : 'antes de arrancar'}
                </p>
              </div>
            ) : (
            /* Mejor mes */
            <div className="rounded-surface border border-emerald-500/30 bg-emerald-500/8 p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-pill bg-emerald-400" />
                <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Mejor Mes</p>
              </div>
              <p className="text-lg font-bold text-emerald-300">{proy.meses[proy.mejor_mes - 1]?.nombre_mes}</p>
              <p className="text-[10px] text-emerald-400/50 mt-0.5">{fmtCurrency(proy.meses[proy.mejor_mes - 1]?.utilidad_neta)} utilidad</p>
            </div>
            )}
            {/* Peor mes */}
            <div className="rounded-surface border border-red-500/30 bg-red-500/8 p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-pill bg-red-400" />
                <p className="text-[10px] text-red-400/70 uppercase tracking-wider">Peor Mes</p>
              </div>
              <p className="text-lg font-bold text-red-300">{proy.meses[proy.peor_mes - 1]?.nombre_mes}</p>
              <p className="text-[10px] text-red-400/50 mt-0.5">{fmtCurrency(proy.meses[proy.peor_mes - 1]?.utilidad_neta)} utilidad</p>
            </div>
          </div>

          {/* Plazos y deuda: solo si se declararon (finanzas@2). */}
          {(proy.capital_de_trabajo > 0 || proy.cobertura_deuda !== null) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {proy.capital_de_trabajo > 0 && (
                <div className="rounded-surface border border-amber-500/30 bg-amber-500/8 p-4">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Capital de trabajo</p>
                  <p className="text-lg font-bold text-amber-300">{fmtCurrency(proy.capital_de_trabajo)}</p>
                  <p className="text-[11px] text-white/45 mt-0.5">
                    Caja que inmovilizan los plazos: cobras a {inputsExtra.dias_cobro ?? 0} días y pagas a {inputsExtra.dias_pago ?? 0}. Ya está dentro de la caja necesaria.
                  </p>
                </div>
              )}
              {proy.cobertura_deuda !== null && (
                <div className={`rounded-surface border p-4 ${
                  proy.cobertura_deuda >= 1.25 ? 'border-emerald-500/30 bg-emerald-500/8'
                  : proy.cobertura_deuda >= 1 ? 'border-amber-500/30 bg-amber-500/8'
                  : 'border-red-500/30 bg-red-500/8'
                }`}>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Cobertura de deuda</p>
                  <p className={`text-lg font-bold ${
                    proy.cobertura_deuda >= 1.25 ? 'text-emerald-300' : proy.cobertura_deuda >= 1 ? 'text-amber-300' : 'text-red-300'
                  }`}>{proy.cobertura_deuda.toLocaleString('es-MX')}×</p>
                  <p className="text-[11px] text-white/45 mt-0.5">
                    Veces que tu utilidad mensual paga la cuota de {fmtCurrency(inputsExtra.pago_deuda_mensual ?? 0)} (lo sano es 1,25× o más).
                    {be.unidades_equilibrio_con_deuda ? ` Para cubrirla necesitas ${fmt(be.unidades_equilibrio_con_deuda)} unidades al mes.` : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Qué tan confiable es y qué dato lo mejoraría (finanzas@2). */}
          {analisis.meta_ia?.transparencia && (
            <TransparenciaIA transparencia={analisis.meta_ia.transparencia} hrefCompletar={`/dashboard/finanzas/${productoId}`} />
          )}
          {(analisis.meta_ia?.secciones_extra?.length ?? 0) > 0 && (
            <SeccionesExtra secciones={analisis.meta_ia?.secciones_extra} />
          )}
        </div>
      )}

      {/* ══ TAB: PROYECCIÓN 12M ══ */}
      {(tab === 'proyeccion' || tab === 'completo' || printMode) && !proyeccionTapada && (
        <div className="space-y-5">
          {/* Recharts: Ingresos vs Costos */}
          <div className="rounded-surface border border-white/8 p-5" style={{ background: fondoAcento(0.08) }}>
            <div className="flex items-center gap-2 mb-4"><span className="w-1 h-5 rounded-pill bg-emerald-400/40 block" /><h2 className="text-base font-semibold text-white">Ingresos vs Costos — 12 meses</h2></div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={2} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                  <YAxis tickFormatter={shortCurrency} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} width={56} />
                  <Tooltip content={<ChartTooltip fmtFn={fmtCurrency} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                  <Bar dataKey="Ingresos" fill={CHART_COLORS.ingresos} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Costos"   fill={CHART_COLORS.costos}   radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recharts: Utilidad neta + Acumulado */}
          <div className="rounded-surface border border-white/8 p-5" style={FONDO_PANEL}>
            <div className="flex items-center gap-2 mb-4"><span className="w-1 h-5 rounded-pill bg-blue-400/40 block" /><h2 className="text-base font-semibold text-white">Utilidad neta y acumulado</h2></div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                  <YAxis tickFormatter={shortCurrency} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} width={56} />
                  <Tooltip content={<ChartTooltip fmtFn={fmtCurrency} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                  <Bar dataKey="Ut. Neta" fill={CHART_COLORS.utilidad} radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="Acumulado" stroke={CHART_COLORS.acumulado} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-surface border border-white/8 overflow-hidden" style={FONDO_PANEL}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-white/5">
                  <tr>
                    {['Mes', 'Unidades', 'Ingresos', 'Costo Var.', 'Costo Fijo', 'Ut. Bruta', 'Ut. Neta', 'Margen', 'Acumulado'].map((h) => (
                      <th key={h} className="text-left px-3 py-3 font-semibold text-white/50 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(proy?.meses || []).map((m) => (
                    <tr
                      key={m.mes}
                      className={`border-t border-white/5 transition-colors ${
                        m.mes === proy.mejor_mes ? 'bg-emerald-500/12 border-emerald-500/20' :
                        m.mes === proy.peor_mes  ? 'bg-red-500/12 border-red-500/20' :
                        'hover:bg-white/3'
                      }`}
                    >
                      <td className="px-3 py-2 font-semibold whitespace-nowrap flex items-center gap-1.5">
                        {m.mes === proy.mejor_mes && <span className="w-1.5 h-1.5 rounded-pill bg-emerald-400 inline-block" title="Mejor mes" />}
                        {m.mes === proy.peor_mes  && <span className="w-1.5 h-1.5 rounded-pill bg-red-400 inline-block" title="Peor mes" />}
                        <span className={m.mes === proy.mejor_mes ? 'text-emerald-300' : m.mes === proy.peor_mes ? 'text-red-300' : 'text-white'}>{m.nombre_mes}</span>
                      </td>
                      <td className="px-3 py-2 text-white/60">{fmt(m.unidades)}</td>
                      <td className="px-3 py-2 text-finanzas font-medium">{fmtCurrency(m.ingresos)}</td>
                      <td className="px-3 py-2 text-brand-accent">{fmtCurrency(m.costo_variable_total)}</td>
                      <td className="px-3 py-2 text-brand-accent">{fmtCurrency(m.costos_fijos)}</td>
                      <td className="px-3 py-2 text-white/70">{fmtCurrency(m.utilidad_bruta)}</td>
                      <td className={`px-3 py-2 font-semibold ${m.utilidad_neta >= 0 ? 'text-finanzas' : 'text-brand-accent'}`}>
                        {fmtCurrency(m.utilidad_neta)}
                      </td>
                      <td className={`px-3 py-2 font-medium ${
                        m.margen_neto >= 30 ? 'text-emerald-400' : m.margen_neto >= 15 ? 'text-amber-400' : 'text-red-400'
                      }`}>{m.margen_neto.toFixed(1)}%</td>
                      <td className={`px-3 py-2 font-semibold ${m.acumulado_neto >= 0 ? 'text-finanzas' : 'text-brand-accent'}`}>
                        {fmtCurrency(m.acumulado_neto)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-finanzas bg-finanzas/10 font-bold">
                    <td className="px-3 py-2 text-finanzas">TOTAL</td>
                    <td className="px-3 py-2 text-white/80">{fmt(proy.totales.unidades_totales)}</td>
                    <td className="px-3 py-2 text-finanzas">{fmtCurrency(proy.totales.ingresos_totales)}</td>
                    <td className="px-3 py-2 text-brand-accent">{fmtCurrency(proy.totales.costo_variable_total)}</td>
                    <td className="px-3 py-2 text-brand-accent">{fmtCurrency(proy.totales.costos_fijos_total)}</td>
                    <td className="px-3 py-2 text-white/80">{fmtCurrency(proy.totales.utilidad_bruta_total)}</td>
                    <td className={`px-3 py-2 ${proy.totales.utilidad_neta_total >= 0 ? 'text-finanzas' : 'text-brand-accent'}`}>
                      {fmtCurrency(proy.totales.utilidad_neta_total)}
                    </td>
                    <td className="px-3 py-2 text-white/60">{proy.totales.margen_neto_promedio.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-white/50">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: BREAKEVEN ══ */}
      {(tab === 'breakeven' || tab === 'completo' || printMode) && (
        <div className="space-y-5">
          {/* KPIs breakeven */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-surface border border-amber-500/25 bg-amber-500/6 p-4">
              <p className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1">Unidades p.e./mes</p>
              <p className="text-xl font-bold text-amber-300">{fmt(be.unidades_breakeven_mes)}</p>
              <p className="text-[10px] text-white/35 mt-0.5">para cubrir todos los costos</p>
            </div>
            <div className="rounded-surface border border-amber-500/25 bg-amber-500/6 p-4">
              <p className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1">Ingresos p.e./mes</p>
              <p className="text-xl font-bold text-amber-300">{fmtCurrency(be.ingresos_breakeven_mes)}</p>
              <p className="text-[10px] text-white/35 mt-0.5">para punto de equilibrio</p>
            </div>
            <div className={`rounded-surface border p-4 ${
              be.margen_contribucion_porcentaje >= 30 ? 'border-emerald-500/25 bg-emerald-500/6' :
              be.margen_contribucion_porcentaje >= 15 ? 'border-amber-500/25 bg-amber-500/6' :
              'border-red-500/25 bg-red-500/6'
            }`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Margen contr./u</p>
              <p className={`text-xl font-bold ${
                be.margen_contribucion_porcentaje >= 30 ? 'text-emerald-300' :
                be.margen_contribucion_porcentaje >= 15 ? 'text-amber-300' : 'text-red-300'
              }`}>{fmtCurrency(be.margen_contribucion_unitario)}</p>
              <p className="text-[10px] text-white/35 mt-0.5">{be.margen_contribucion_porcentaje.toFixed(1)}% del precio</p>
            </div>
            <div className={`rounded-surface border p-4 ${
              be.punto_equilibrio_alcanzado ? 'border-emerald-500/25 bg-emerald-500/6' : 'border-red-500/25 bg-red-500/6'
            }`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Mes de equilibrio</p>
              <p className={`text-xl font-bold ${
                be.punto_equilibrio_alcanzado ? 'text-emerald-300' : 'text-red-300'
              }`}>
                {be.punto_equilibrio_alcanzado ? `Mes ${be.mes_equilibrio}` : 'No en 12 meses'}
              </p>
              <p className="text-[10px] text-white/35 mt-0.5">{be.punto_equilibrio_alcanzado ? 'con el crecimiento proyectado' : 'ajusta costos o unidades'}</p>
            </div>
          </div>

          {/* Progress bar */}
          {(() => {
            const pct = Math.min(100, (inp.unidades_mes_inicial / be.unidades_breakeven_mes) * 100);
            const sobre = inp.unidades_mes_inicial >= be.unidades_breakeven_mes;
            return (
              <div className={`rounded-surface border p-5 ${ sobre ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5' }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-5 rounded-pill block" style={{ background: sobre ? '#10b981' : '#f59e0b' }} />
                    <h2 className="text-sm font-semibold text-white">Mes 1 vs Punto de Equilibrio</h2>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${ sobre ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300' }`}>
                    {pct.toFixed(0)}% del objetivo
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-pill h-3 overflow-hidden">
                  <div className={`h-3 rounded-pill transition-all duration-700 ${ sobre ? 'bg-emerald-400' : 'bg-amber-400' }`}
                    style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[10px] mt-1.5">
                  <span className="text-white/40">{fmt(inp.unidades_mes_inicial)} u mes 1</span>
                  <span className="text-white/40">objetivo: {fmt(be.unidades_breakeven_mes)} u</span>
                </div>
                <p className={`flex items-center gap-1.5 text-xs mt-2 font-medium ${ sobre ? 'text-emerald-400' : 'text-amber-300' }`}>
                  {sobre ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" strokeWidth={1.8} />
                      <span>Arrancas por encima del punto de equilibrio</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" strokeWidth={1.8} />
                      <span>Faltan {fmt(be.unidades_breakeven_mes - inp.unidades_mes_inicial)} unidades para cubrir costos desde el mes 1</span>
                    </>
                  )}
                </p>
              </div>
            );
          })()}

          {/* Escenarios */}
          <div className="rounded-surface border border-white/8 p-5" style={FONDO_PANEL}>
            <div className="flex items-center gap-2 mb-4"><span className="w-1 h-5 rounded-pill bg-violet-400/40 block" /><h2 className="text-base font-semibold text-white">Escenarios de venta mensual</h2></div>
            <div className="space-y-3">
              {(be.escenarios || []).map((e) => {
                const ok = e.diferencia_vs_inicial <= 0;
                const warn = e.diferencia_vs_inicial > 0 && e.diferencia_vs_inicial <= 50;
                return (
                  <div key={e.nombre} className={`rounded-surface p-4 border ${
                    ok ? 'border-emerald-500/25 bg-emerald-500/6' :
                    warn ? 'border-amber-500/25 bg-amber-500/6' :
                    'border-red-500/25 bg-red-500/6'
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className={`font-semibold text-sm ${ ok ? 'text-emerald-300' : warn ? 'text-amber-300' : 'text-red-300' }`}>{e.nombre}</p>
                        <p className="text-xs text-white/50 mt-0.5">{e.descripcion}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${
                        ok ? 'bg-emerald-500/20 text-emerald-300' : warn ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'
                      }`}>{e.diferencia_vs_inicial > 0 ? '+' : ''}{e.diferencia_vs_inicial}% vs mes 1</span>
                    </div>
                    <div className="flex gap-6">
                      <div><p className="text-[10px] text-white/40">Unidades</p><p className="text-sm font-bold text-white">{fmt(e.unidades_necesarias)}/mes</p></div>
                      <div><p className="text-[10px] text-white/40">Ingresos</p><p className="text-sm font-bold text-white">{fmtCurrency(e.ingresos_necesarios)}/mes</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: CENTRO DE MANDO ══ */}
      {(tab === 'mando' || tab === 'completo') && isPro && overrides && !liveMetrics && (
        <div className="rounded-surface border border-amber-500/20 bg-amber-500/8 p-6 text-center">
          <p className="text-amber-300 font-semibold text-sm">Precio de venta inválido</p>
          <p className="text-white/50 text-xs mt-1">El precio de venta debe ser mayor a 0 para calcular métricas en tiempo real.</p>
        </div>
      )}
      {(tab === 'mando' || tab === 'completo') && isPro && overrides && liveMetrics && (
        <div className="space-y-5">
          {/* Header bar */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Centro de Mando Contable</h2>
              <p className="text-xs text-white/50 mt-0.5">Edita los parámetros y ve el impacto en tiempo real sin reejecutar el análisis.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {saveStatus === 'saving' && <span className="text-xs text-white/40 animate-pulse">Guardando...</span>}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Check className="w-3.5 h-3.5 text-green-400" strokeWidth={1.8} />
                  <span>Guardado</span>
                </span>
              )}
              <button
                onClick={handleReset}
                className="text-xs border border-white/10 text-white/50 px-3 py-1.5 rounded-lg hover:border-white/20 hover:text-white/70 transition"
              >
                Restaurar original
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* LEFT — editable inputs */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wide">Parámetros editables</h3>
              {!isPro && (
                <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-control p-2.5 text-amber-300">
                  <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" strokeWidth={1.8} />
                  <span>Edición de parámetros disponible desde el plan Emprendedor.</span>
                </div>
              )}

              {([
                { field: 'precio_venta',             label: 'Precio de venta', prefix: '$', step: 1 },
                { field: 'costo_variable_unitario',  label: 'Costo variable / u', prefix: '$', step: 1 },
                { field: 'costos_fijos_mensuales',   label: 'Costos fijos / mes', prefix: '$', step: 100 },
                { field: 'unidades_mes_inicial',     label: 'Unidades mes 1', prefix: '', step: 1 },
                { field: 'tasa_crecimiento_mensual', label: 'Crecimiento mensual', prefix: '', suffix: '%', step: 1 },
              ] as { field: keyof OverrideValues; label: string; prefix: string; suffix?: string; step: number }[]).map(({ field, label, prefix, suffix, step }) => {
                const orig = inp[field];
                const cur  = overrides[field];
                const delta = orig !== 0 ? Math.round(((cur - orig) / orig) * 100) : 0;
                return (
                  <div key={field}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-white/70">{label}</label>
                      {cur !== orig && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-pill ${delta > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {delta > 0 ? '+' : ''}{delta}% vs original
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {prefix && <span className="text-white/40 text-sm">{prefix}</span>}
                      <input
                        type="number"
                        defaultValue={cur}
                        key={`${field}-${cur === orig ? 'orig' : 'mod'}`}
                        step={step}
                        min={0}
                        onChange={(e) => handleOverrideChange(field, e.target.value)}
                        disabled={!isPro}
                        className="flex-1 bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finanzas/40 focus:border-finanzas/40 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      {suffix && <span className="text-white/40 text-sm">{suffix}</span>}
                    </div>
                    <p className="text-[10px] text-white/30 mt-0.5">Original: {prefix}{fmt(orig)}{suffix ?? ''}</p>
                  </div>
                );
              })}
            </div>

            {/* RIGHT — live KPIs + semáforo */}
            <div className="space-y-4">
              {/* Semáforo viabilidad */}
              {(() => {
                const STYLES = {
                  alta:  { bg: 'bg-green-500/10 border-green-500/30', dot: 'bg-green-400', text: 'text-green-300', label: 'Viabilidad Alta' },
                  media: { bg: 'bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400', text: 'text-amber-300', label: 'Viabilidad Media' },
                  baja:  { bg: 'bg-red-500/10   border-red-500/30',   dot: 'bg-red-400',   text: 'text-red-300',   label: 'Viabilidad Baja' },
                };
                const s = STYLES[liveMetrics.viabilidad];
                return (
                  <div className={`border rounded-surface p-4 flex items-center gap-3 ${s.bg}`}>
                    <span className={`w-4 h-4 rounded-pill flex-shrink-0 ${s.dot}`} />
                    <div>
                      <p className={`font-bold text-sm ${s.text}`}>{s.label}</p>
                      <p className="text-xs text-white/50 mt-0.5">
                        {liveMetrics.viabilidad === 'alta'  ? 'Margen ≥30% y arrancas sobre el punto de equilibrio' :
                         liveMetrics.viabilidad === 'media' ? 'Margen aceptable pero revisa el volumen inicial' :
                         'Margen insuficiente — ajusta precio o reduce costos'}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Margen contribución', value: `${liveMetrics.mc_pct.toFixed(1)}%`, sub: `${fmtCurrency(liveMetrics.mc_u)} / u`, highlight: liveMetrics.mc_pct >= 30 },
                  { label: 'Punto de equilibrio', value: liveMetrics.u_be === Infinity ? '∞' : `${fmt(liveMetrics.u_be)} u`, sub: fmtCurrency(liveMetrics.ingresos_be) + '/mes', highlight: overrides.unidades_mes_inicial >= liveMetrics.u_be },
                  { label: 'Utilidad mes 1',      value: fmtCurrency(liveMetrics.utilidad_mes1), sub: liveMetrics.utilidad_mes1 >= 0 ? 'positiva' : 'negativa', highlight: liveMetrics.utilidad_mes1 >= 0 },
                  { label: 'Diferencia mes 1 vs P.E.',   value: liveMetrics.u_be === Infinity ? '∞' : `${overrides.unidades_mes_inicial - liveMetrics.u_be > 0 ? '+' : ''}${fmt(overrides.unidades_mes_inicial - liveMetrics.u_be)} u`, sub: overrides.unidades_mes_inicial >= liveMetrics.u_be ? 'sobre equilibrio' : 'bajo equilibrio', highlight: overrides.unidades_mes_inicial >= liveMetrics.u_be },
                ].map((k) => (
                  <div key={k.label} className="kpi-card">
                    <p className="kpi-label">{k.label}</p>
                    <p className={`text-lg font-bold ${k.highlight ? 'text-finanzas' : 'text-brand-accent'}`}>{k.value}</p>
                    <p className="kpi-sub">{k.sub}</p>
                  </div>
                ))}
              </div>

              {/* Margen bar */}
              <div className="card p-4">
                <div className="flex justify-between text-xs text-white/50 mb-2">
                  <span>Margen de contribución</span>
                  <span className={liveMetrics.mc_pct >= 30 ? 'text-green-400' : liveMetrics.mc_pct >= 15 ? 'text-amber-400' : 'text-red-400'}>
                    {liveMetrics.mc_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-pill h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-pill transition-all duration-500 ${liveMetrics.mc_pct >= 30 ? 'bg-gradient-finanzas' : liveMetrics.mc_pct >= 15 ? 'bg-amber-400' : 'bg-brand-accent'}`}
                    style={{ width: `${Math.min(100, liveMetrics.mc_pct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                  <span>0%</span><span className="text-amber-500/60">15% mín.</span><span className="text-green-500/60">30% ópt.</span><span>100%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sensitivity alerts */}
          {(() => {
            const alerts: string[] = [];
            if (overrides.precio_venta !== inp.precio_venta) {
              const diff = overrides.precio_venta - inp.precio_venta;
              alerts.push(`Precio ${diff > 0 ? 'aumentado' : 'reducido'} ${fmtCurrency(Math.abs(diff))} — impacto directo en margen y equilibrio.`);
            }
            if (overrides.costo_variable_unitario !== inp.costo_variable_unitario) {
              alerts.push(`Costo variable ajustado a ${fmtCurrency(overrides.costo_variable_unitario)}/u — margen de contribución recalculado.`);
            }
            if (overrides.costos_fijos_mensuales !== inp.costos_fijos_mensuales) {
              const diff = overrides.costos_fijos_mensuales - inp.costos_fijos_mensuales;
              alerts.push(`Costos fijos ${diff > 0 ? 'incrementados' : 'reducidos'} ${fmtCurrency(Math.abs(diff))}/mes — punto de equilibrio actualizado.`);
            }
            if (liveMetrics.u_be !== Infinity && overrides.unidades_mes_inicial < liveMetrics.u_be) {
              alerts.push(`Con estos parámetros necesitas ${fmt(liveMetrics.u_be - overrides.unidades_mes_inicial)} unidades más en mes 1 para cubrir costos.`);
            }
            if (!alerts.length) return null;
            return (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-amber-300 mb-3">Alertas de sensibilidad</h3>
                <ul className="space-y-2">
                  {alerts.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-control p-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
          {/* ── CONTABILIDAD BÁSICA ── */}
          {(() => {
            const totalIngresos    = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
            // Provisiones auto-generadas (IVA/ISR reservado del ingreso)
            const impuestosAuto    = movimientos.filter((m) => m.tipo === 'egreso' && IMPUESTO_CATS.includes(m.categoria) && m.es_auto_generado).reduce((s, m) => s + Number(m.monto), 0);
            // Pagos reales al SAT (descuentan la provisión, no son egresos adicionales)
            const impuestosPagados = movimientos.filter((m) => m.tipo === 'egreso' && IMPUESTO_CATS.includes(m.categoria) && !m.es_auto_generado).reduce((s, m) => s + Number(m.monto), 0);
            const ahorro_sat       = Math.max(0, impuestosAuto - impuestosPagados);
            // totalEgresos = operativos + provisiones auto (pagos SAT no son egresos adicionales)
            const totalEgresos     = movimientos.filter((m) => m.tipo === 'egreso' && !IMPUESTO_CATS.includes(m.categoria)).reduce((s, m) => s + Number(m.monto), 0) + impuestosAuto;
            const saldoNeto        = totalIngresos - totalEgresos;
            const ingresosProyMs1 = inp.unidades_mes_inicial * inp.precio_venta;
            const egresosOp      = movimientos.filter((m) => m.tipo === 'egreso' && !IMPUESTO_CATS.includes(m.categoria)).reduce((s, m) => s + Number(m.monto), 0);
            const gatedBlocked      = !isPro && GATED_CATS.includes(movForm.categoria);
            const isMovLimitReached = !isPro && movimientos.filter((m) => !m.es_auto_generado).length >= 3;
            const montoN            = Number(movForm.monto);

            return (
              <div className="card p-5 space-y-5">

                {/* Header + export */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wide">Contabilidad básica</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => isPro && setShowCsvModal(true)}
                      disabled={!isPro}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      title={isPro ? 'Importar movimientos desde Excel o CSV' : 'Disponible desde el plan Emprendedor'}
                    >
                      {isPro ? (
                        <span className="flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                          <span>Importar CSV/Excel</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.8} />
                          <span>Importar CSV</span>
                        </span>
                      )}
                    </button>
                    <button onClick={isPro ? handleExport : undefined} disabled={movimientos.length === 0 || !isPro} className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition disabled:opacity-30">
                      {isPro ? (
                        <span className="flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                          <span>Exportar para contador</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.8} />
                          <span>Emprendedor+</span>
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* A. Termómetro */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Ingresos',    value: fmtCurrency(totalIngresos), color: 'text-finanzas',       sub: `${movimientos.filter(m => m.tipo === 'ingreso').length} movs.` },
                    { label: 'Egresos',     value: fmtCurrency(totalEgresos),  color: 'text-brand-accent',   sub: `${movimientos.filter(m => m.tipo === 'egreso').length} movs.` },
                    { label: 'Ahorro SAT',  value: fmtCurrency(ahorro_sat),    color: 'text-amber-400',      sub: 'reserva de impuestos' },
                    { label: 'Saldo neto',  value: fmtCurrency(saldoNeto),     color: saldoNeto >= 0 ? 'text-finanzas' : 'text-brand-accent', sub: saldoNeto >= 0 ? 'positivo' : 'negativo' },
                  ].map((k) => (
                    <div key={k.label} className="bg-white/5 border border-white/10 rounded-control p-3 text-center">
                      <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wide">{k.label}</p>
                      <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{k.sub}</p>
                    </div>
                  ))}
                </div>

                {/* B. Modelo visual — CSS horizontal bars */}
                {movimientos.length > 0 && (() => {
                  const maxVal = Math.max(totalIngresos, egresosOp, ahorro_sat, Math.abs(saldoNeto), 1);
                  const bars = [
                    { label: 'Ingresos',   value: totalIngresos,       color: '#10B981', tag: undefined },
                    { label: 'Egresos',    value: egresosOp,            color: '#E74C3C', tag: undefined },
                    { label: 'Ahorro SAT', value: ahorro_sat,           color: '#F59E0B', tag: 'reserva SAT' },
                    { label: 'Saldo neto', value: Math.abs(saldoNeto),  color: saldoNeto >= 0 ? '#3B82F6' : '#EF4444', tag: saldoNeto < 0 ? 'déficit' : undefined },
                  ];
                  return (
                    <div className="bg-white/5 border border-white/10 rounded-control p-4 space-y-3">
                      <p className="text-xs font-semibold text-white/60">Distribución financiera</p>
                      {bars.map((bar) => {
                        const pct = Math.max(4, (bar.value / maxVal) * 100);
                        return (
                          <div key={bar.label} className="flex items-center gap-3">
                            <span className="text-[11px] text-white/50 w-[76px] flex-shrink-0 text-right leading-tight">{bar.label}</span>
                            <div className="flex-1 bg-white/5 rounded-pill h-7 overflow-hidden relative">
                              <div
                                className="h-7 rounded-pill flex items-center px-3 transition-all duration-700 ease-out"
                                style={{ width: `${pct}%`, background: bar.color + '33', border: `1px solid ${bar.color}55` }}
                              >
                                <span className="text-[11px] font-bold truncate" style={{ color: bar.color }}>
                                  {fmtCurrency(bar.value)}
                                </span>
                              </div>
                            </div>
                            {bar.tag && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-pill flex-shrink-0"
                                style={{ background: bar.color + '22', color: bar.color, border: `1px solid ${bar.color}44` }}>
                                {bar.tag}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {/* Totales rápidos */}
                      <div className="flex justify-between pt-2 border-t border-white/10 text-[10px] text-white/40">
                        <span>{movimientos.length} movimientos registrados</span>
                        <span className={saldoNeto >= 0 ? 'text-[#3B82F6] font-semibold' : 'text-[#EF4444] font-semibold'}>
                          Saldo: {saldoNeto >= 0 ? '+' : '−'}{fmtCurrency(Math.abs(saldoNeto))}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* C. Audit insights vs proyección */}
                {movimientos.length > 0 && (() => {
                  const insights: { msg: string; color: string }[] = [];
                  if (ingresosProyMs1 > 0) {
                    const pct = ((totalIngresos - ingresosProyMs1) / ingresosProyMs1) * 100;
                    if (pct < -10) insights.push({ msg: `Ingresos ${Math.abs(pct).toFixed(0)}% por debajo de la proyección (${fmtCurrency(ingresosProyMs1)} esperado)`, color: 'text-red-300 bg-red-500/10 border-red-500/20' });
                    if (pct >  10) insights.push({ msg: `Ingresos ${pct.toFixed(0)}% por encima de la proyección — excelente ritmo`, color: 'text-green-300 bg-finanzas/10 border-finanzas/20' });
                  }
                  if (inp.costos_fijos_mensuales > 0 && egresosOp > inp.costos_fijos_mensuales * 1.1)
                    insights.push({ msg: `Egresos operativos ${fmtCurrency(egresosOp - inp.costos_fijos_mensuales)} por encima de los costos fijos proyectados`, color: 'text-amber-300 bg-amber-500/10 border-amber-500/20' });
                  if (!insights.length) return null;
                  return (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">Auditoría vs proyección</p>
                      {insights.map((ins, i) => (
                        <div key={i} className={`flex items-center gap-2 text-xs border rounded-control p-3 ${ins.color}`}>
                          <BarChart3 className="w-3.5 h-3.5 flex-shrink-0 opacity-80" strokeWidth={1.8} />
                          <span>{ins.msg}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* D. Formulario guiado */}
                <div className="bg-white/5 border border-white/10 rounded-control p-4 space-y-3">
                  <p className="text-xs font-semibold text-white/60">Nuevo movimiento</p>

                  <div className="flex gap-2">
                    {(['ingreso', 'egreso'] as const).map((t) => (
                      <button key={t} onClick={() => setMovForm((f) => ({ ...f, tipo: t, lleva_factura: false, es_empresa: false, tiene_cfdi: false }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${movForm.tipo === t ? (t === 'ingreso' ? 'bg-finanzas/20 text-green-300 border border-finanzas/40' : 'bg-red-500/20 text-red-300 border border-red-500/40') : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/60'}`}>
                        <span className={`w-1.5 h-1.5 rounded-pill ${t === 'ingreso' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span>{t === 'ingreso' ? 'Ingreso / Venta' : 'Egreso / Gasto'}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 mb-0.5 block">Fecha</label>
                      <input type="date" value={movForm.fecha} onChange={(e) => setMovForm((f) => ({ ...f, fecha: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-finanzas/40" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 mb-0.5 block">Monto (MXN)</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={movForm.monto}
                        onChange={(e) => { const val = e.target.value.replace(/^0+(?=\d)/, ''); setMovForm((f) => ({ ...f, monto: val })); }}
                        onBlur={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) setMovForm((f) => ({ ...f, monto: String(n) })); }}
                        className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-finanzas/40" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 mb-0.5 block">Categoría</label>
                      <input list="categorias-list" placeholder={movForm.tipo === 'ingreso' ? 'Venta directa' : 'Gasolina'} value={movForm.categoria} onChange={(e) => setMovForm((f) => ({ ...f, categoria: e.target.value }))}
                        className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-finanzas/40 ${gatedBlocked ? 'border-red-500/40' : 'border-white/10'}`} />
                      <datalist id="categorias-list">
                        {(movForm.tipo === 'egreso'
                          ? ['Electricidad', 'Transporte', 'Renta', 'Sueldos', 'Publicidad', 'Internet', 'Gasolina', 'Materiales', 'IVA por pagar', 'ISR provisional', 'IMSS', 'INFONAVIT', 'Retención IVA', 'Retención ISR', 'Otros']
                          : ['Venta directa', 'Pago de tercero', 'Anticipo', 'Comisión', 'Reembolso', 'Otros']
                        ).map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 mb-0.5 block">Descripción</label>
                      <input type="text" placeholder="Detalle del concepto" value={movForm.descripcion} onChange={(e) => setMovForm((f) => ({ ...f, descripcion: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-finanzas/40" />
                    </div>
                  </div>

                  {/* Plan gate */}
                  {gatedBlocked && (
                    <div className="flex items-center gap-2 bg-brand-primary/10 border border-brand-primary/30 rounded-control p-3 text-xs text-white/70">
                      <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" strokeWidth={1.8} />
                      <span>La categoría <strong>{movForm.categoria}</strong> requiere un plan de pago para registrarse.</span>
                    </div>
                  )}

                  {/* Preguntas guiadas — INGRESO */}
                  {movForm.tipo === 'ingreso' && montoN > 0 && (
                    <div className="bg-finanzas/5 border border-finanzas/20 rounded-control p-3 space-y-3">
                      <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wide">Impuestos sobre esta venta</p>

                      <label className="flex items-center justify-between gap-3 cursor-pointer rounded-lg px-3 py-2 bg-white/5 border border-white/10">
                        <div>
                          <p className="text-xs font-semibold text-white">¿Esta venta lleva factura (incluye IVA)?</p>
                          <p className="text-[10px] text-white/40">Si facturaste al cliente con IVA trasladado</p>
                        </div>
                        <input type="checkbox" checked={movForm.lleva_factura} onChange={(e) => setMovForm((f) => ({ ...f, lleva_factura: e.target.checked, es_empresa: false }))} className="accent-green-400 w-4 h-4 flex-shrink-0" />
                      </label>

                      {movForm.lleva_factura && (
                        <>
                          <label className="flex items-center justify-between gap-3 cursor-pointer rounded-lg px-3 py-2 bg-white/5 border border-white/10">
                            <div>
                              <p className="text-xs font-semibold text-white">¿Le vendiste a una Empresa (Persona Moral)?</p>
                              <p className="text-[10px] text-white/40">Si tu cliente es empresa, te retiene ISR e IVA</p>
                            </div>
                            <input type="checkbox" checked={movForm.es_empresa} onChange={(e) => setMovForm((f) => ({ ...f, es_empresa: e.target.checked }))} className="accent-amber-400 w-4 h-4 flex-shrink-0" />
                          </label>

                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-control p-3 space-y-1.5 text-xs">
                            <p className="font-semibold text-amber-300 mb-1">Se guardarán automáticamente como Ahorro SAT:</p>
                            <div className="flex justify-between text-white/70"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-pill bg-amber-400" />IVA por pagar (16%)</span><span className="font-bold text-amber-400">-{fmtCurrency(Math.round(montoN * 0.16 * 100) / 100)}</span></div>
                            {movForm.es_empresa && <>
                              <div className="flex justify-between text-white/70"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-pill bg-amber-400" />Retención ISR (10%)</span><span className="font-bold text-amber-400">-{fmtCurrency(Math.round(montoN * 0.10 * 100) / 100)}</span></div>
                              <div className="flex justify-between text-white/70"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-pill bg-amber-400" />Retención IVA (≈10.67%)</span><span className="font-bold text-amber-400">-{fmtCurrency(Math.round(montoN * 0.16 * (2/3) * 100) / 100)}</span></div>
                            </>}
                            <div className="border-t border-amber-500/20 pt-1.5 flex justify-between font-bold"><span className="text-white">Ingreso neto real:</span><span className="text-finanzas">{fmtCurrency(Math.round((montoN - montoN * 0.16 - (movForm.es_empresa ? montoN * 0.10 + montoN * 0.16 * (2/3) : 0)) * 100) / 100)}</span></div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Preguntas guiadas — EGRESO */}
                  {movForm.tipo === 'egreso' && montoN > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-control p-3 space-y-2">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div>
                          <p className="text-xs font-semibold text-white">¿Tienes Factura (CFDI) de este gasto?</p>
                          <p className="text-[10px] text-white/40">El IVA pagado en facturas se acredita contra tu IVA a pagar</p>
                        </div>
                        <input type="checkbox" checked={movForm.tiene_cfdi} onChange={(e) => setMovForm((f) => ({ ...f, tiene_cfdi: e.target.checked }))} className="accent-green-400 w-4 h-4 flex-shrink-0" />
                      </label>
                      {movForm.tiene_cfdi && (
                        <div className="flex items-center gap-2 text-xs text-green-300 bg-finanzas/10 border border-finanzas/20 rounded-lg p-2">
                          <span className="w-1.5 h-1.5 rounded-pill bg-emerald-400 flex-shrink-0" />
                          <span>IVA a tu favor: <strong>{fmtCurrency(Math.round(montoN * 0.16 * 100) / 100)}</strong> — se incluirá en tu resumen fiscal para el contador.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {isMovLimitReached && (
                    <div className="flex items-center gap-2 bg-brand-primary/10 border border-brand-primary/30 rounded-control p-3 text-xs text-white/70">
                      <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" strokeWidth={1.8} />
                      <span>Límite de 3 movimientos en Freemium. Actualiza a un plan de pago para registros ilimitados.</span>
                    </div>
                  )}
                  <button onClick={handleAddMovimiento} disabled={movLoading || !movForm.descripcion.trim() || !movForm.monto || montoN <= 0 || gatedBlocked || isMovLimitReached}
                    className="w-full py-2 rounded-lg text-xs font-semibold bg-finanzas/20 text-green-300 border border-finanzas/30 hover:bg-finanzas/30 transition disabled:opacity-40">
                    {movLoading ? 'Guardando...' : '+ Registrar movimiento'}
                  </button>
                </div>

                {/* E. Declaración Mensual / Estimado Fiscal */}
                {taxCfg.modo === 'detallado_mx' ? (() => {
                  const mesActual = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
                  const hoy = hoyLocal();

                  // ── Datos base desde movimientos ──────────────────────────
                  const ivaTrasladadoAuto  = movimientos.filter((m) => m.categoria === 'IVA por pagar' && m.es_auto_generado).reduce((s, m) => s + Number(m.monto), 0);
                  const ivaAcreditable     = movimientos.filter((m) => m.tipo === 'egreso' && m.tiene_cfdi && !m.es_auto_generado).reduce((s, m) => s + Math.round(Number(m.monto) * 0.16 * 100) / 100, 0);
                  const ivaRetenidoClientes= movimientos.filter((m) => m.categoria === 'Retención IVA').reduce((s, m) => s + Number(m.monto), 0);
                  // Pagos manuales ya realizados al SAT (el usuario registró "Pago IVA")
                  const ivaPagado          = movimientos.filter((m) => m.categoria === 'IVA por pagar' && !m.es_auto_generado).reduce((s, m) => s + Number(m.monto), 0);
                  const ivaNeto            = Math.round((ivaTrasladadoAuto - ivaAcreditable - ivaRetenidoClientes - ivaPagado) * 100) / 100;

                  const ingresosTotales    = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
                  const isrRetenidoPM      = movimientos.filter((m) => m.categoria === 'Retención ISR').reduce((s, m) => s + Number(m.monto), 0);
                  const tasaResico         = getResicotasa(ingresosTotales);
                  const isrCalculado       = Math.round(ingresosTotales * tasaResico * 100) / 100;
                  const isrNeto            = Math.max(0, Math.round((isrCalculado - isrRetenidoPM) * 100) / 100);

                  const numEmp = parseInt(imssEmpleados) || 0;
                  const sbc    = parseFloat(imbcSbc) || 0;
                  const imssPatron    = Math.round(sbc * numEmp * 0.17 * 100) / 100;   // ~17% cuotas patronales
                  const infonavit     = Math.round(sbc * numEmp * 0.05 * 100) / 100;   // 5% aportación

                  // Helper: pre-fill form con monto calculado
                  const prefill = (categoria: string, monto: number, descripcion: string) =>
                    setMovForm((f) => ({ ...f, ...MOV_FORM_RESET, tipo: 'egreso', categoria, descripcion, monto: monto.toFixed(2), fecha: hoy }));

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wide">Declaración mensual — {mesActual}</p>
                        <span className="text-[9px] text-white/30 border border-white/10 px-2 py-0.5 rounded-pill">Basada en tus movimientos registrados</span>
                      </div>

                      {/* ── Panel IVA ── */}
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-control p-4 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-amber-300">IVA Mensual</p>
                          <span className="text-[9px] text-amber-400/60 border border-amber-500/20 px-1.5 py-0.5 rounded-pill">Mensual · SAT</span>
                        </div>
                        <div className="space-y-1 text-xs text-white/70">
                          <div className="flex justify-between"><span>IVA trasladado (cobrado en ventas)</span><span className="font-semibold text-white">{fmtCurrency(ivaTrasladadoAuto)}</span></div>
                          <div className="flex justify-between text-finanzas/80"><span>− IVA acreditable (gastos con CFDI)</span><span>−{fmtCurrency(ivaAcreditable)}</span></div>
                          <div className="flex justify-between text-finanzas/80"><span>− IVA retenido por clientes empresa</span><span>−{fmtCurrency(ivaRetenidoClientes)}</span></div>
                          <div className={`flex justify-between font-bold pt-1 border-t border-amber-500/20 ${ivaNeto >= 0 ? 'text-amber-300' : 'text-finanzas'}`}>
                            <span>{ivaNeto >= 0 ? 'IVA A PAGAR' : 'SALDO A FAVOR'}</span>
                            <span>{fmtCurrency(Math.abs(ivaNeto))}</span>
                          </div>
                        </div>
                        {ivaNeto > 0 && (
                          <button onClick={() => prefill('IVA por pagar', ivaNeto, `Pago IVA mensual ${mesActual}`)}
                            className="w-full mt-1 py-1.5 rounded-lg text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition">
                            Registrar pago IVA → {fmtCurrency(ivaNeto)}
                          </button>
                        )}
                        {ivaNeto < 0 && (
                          <p className="flex items-center gap-1.5 text-[10px] text-finanzas mt-1">
                            <span className="w-1.5 h-1.5 rounded-pill bg-emerald-400" />
                            <span>Saldo a favor: {fmtCurrency(Math.abs(ivaNeto))} — lo puedes compensar el próximo mes.</span>
                          </p>
                        )}
                        {ivaTrasladadoAuto === 0 && <p className="text-[10px] text-white/30 mt-1">Sin ventas con factura registradas aún.</p>}
                      </div>

                      {/* ── Panel ISR RESICO ── */}
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-control p-4 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-blue-300">ISR Provisional (RESICO PF)</p>
                          <span className="text-[9px] text-blue-400/60 border border-blue-500/20 px-1.5 py-0.5 rounded-pill">Mensual · SAT</span>
                        </div>
                        <div className="space-y-1 text-xs text-white/70">
                          <div className="flex justify-between"><span>Ingresos del periodo</span><span className="font-semibold text-white">{fmtCurrency(ingresosTotales)}</span></div>
                          <div className="flex justify-between"><span>Tasa RESICO aplicable (Art. 113-E LISR)</span><span className="font-semibold text-blue-300">{(tasaResico * 100).toFixed(1)}%</span></div>
                          <div className="flex justify-between"><span>ISR calculado</span><span className="font-semibold text-white">{fmtCurrency(isrCalculado)}</span></div>
                          <div className="flex justify-between text-finanzas/80"><span>− ISR retenido por clientes PM (10%)</span><span>−{fmtCurrency(isrRetenidoPM)}</span></div>
                          <div className="flex justify-between font-bold pt-1 border-t border-blue-500/20 text-blue-300">
                            <span>ISR A PAGAR</span><span>{fmtCurrency(isrNeto)}</span>
                          </div>
                        </div>
                        {isrNeto > 0 && (
                          <button onClick={() => prefill('ISR provisional', isrNeto, `Pago ISR provisional ${mesActual}`)}
                            className="w-full mt-1 py-1.5 rounded-lg text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition">
                            Registrar pago ISR → {fmtCurrency(isrNeto)}
                          </button>
                        )}
                        <p className="text-[9px] text-white/25 mt-1">* RESICO PF aplica si tus ingresos anuales no superan $3.5M. Para régimen general consulta a tu contador.</p>
                      </div>

                      {/* ── Panel IMSS + INFONAVIT ── */}
                      <div className="bg-purple-500/5 border border-purple-500/20 rounded-control p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-purple-300">IMSS + INFONAVIT</p>
                          <span className="text-[9px] text-purple-400/60 border border-purple-500/20 px-1.5 py-0.5 rounded-pill">Bimestral · SUA</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-white/50 mb-0.5 block">Núm. empleados</label>
                            <input type="number" min="0" value={imssEmpleados}
                              onChange={(e) => setImssEmpleados(e.target.value.replace(/^0+(?=\d)/, ''))}
                              className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/40" />
                          </div>
                          <div>
                            <label className="text-[10px] text-white/50 mb-0.5 block">SBC promedio (MXN)</label>
                            <input type="number" min="0" placeholder="0.00" value={imbcSbc}
                              onChange={(e) => setImbcSbc(e.target.value.replace(/^0+(?=\d)/, ''))}
                              className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/40" />
                          </div>
                        </div>
                        {numEmp > 0 && sbc > 0 ? (
                          <div className="space-y-1 text-xs text-white/70">
                            <div className="flex justify-between"><span>IMSS patrón (~17% SBC × {numEmp} emp.)</span><span className="font-semibold text-white">{fmtCurrency(imssPatron)}</span></div>
                            <div className="flex justify-between"><span>INFONAVIT (5% SBC × {numEmp} emp.)</span><span className="font-semibold text-white">{fmtCurrency(infonavit)}</span></div>
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => prefill('IMSS', imssPatron, `Cuotas IMSS bimestral ${mesActual}`)}
                                className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition">
                                Registrar IMSS → {fmtCurrency(imssPatron)}
                              </button>
                              <button onClick={() => prefill('INFONAVIT', infonavit, `Aportación INFONAVIT bimestral ${mesActual}`)}
                                className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition">
                                Registrar INFONAVIT → {fmtCurrency(infonavit)}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-white/30">Ingresa número de empleados y SBC para calcular.</p>
                        )}
                      </div>
                    </div>
                  );
                })() : (() => {
                  const totalIngresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
                  const totalEgresos  = movimientos.filter((m) => m.tipo === 'egreso' && !m.es_auto_generado).reduce((s, m) => s + Number(m.monto), 0);
                  const utilidadNeta  = totalIngresos - totalEgresos;
                  const consumoEst    = Math.max(0, utilidadNeta * taxCfg.consumo.tasa);
                  const rentaEst      = Math.max(0, utilidadNeta * taxCfg.renta.tasa_estimada);
                  const mesActual     = new Date().toLocaleDateString(taxCfg.locale, { month: 'long', year: 'numeric' });
                  const numEmp        = parseInt(imssEmpleados) || 0;
                  const salario       = parseFloat(imbcSbc) || 0;

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wide">Estimado fiscal — {mesActual}</p>
                        <span className="text-[9px] text-white/30 border border-white/10 px-2 py-0.5 rounded-pill">Basada en tus movimientos registrados</span>
                      </div>

                      {/* Impuesto al consumo */}
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-control p-4 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-amber-300">{taxCfg.consumo.nombre}</p>
                          <span className="text-[9px] text-amber-400/60 border border-amber-500/20 px-1.5 py-0.5 rounded-pill">{taxCfg.consumo.periodicidad} · {taxCfg.autoridad}</span>
                        </div>
                        <div className="space-y-1 text-xs text-white/70">
                          <div className="flex justify-between"><span>Ingresos del periodo</span><span className="font-semibold text-white">{fmtCurrency(totalIngresos)}</span></div>
                          <div className="flex justify-between text-finanzas/80"><span>− Egresos deducibles</span><span>−{fmtCurrency(totalEgresos)}</span></div>
                          <div className="flex justify-between font-bold pt-1 border-t border-amber-500/20 text-amber-300">
                            <span>{taxCfg.consumo.nombre} ESTIMADO ({(taxCfg.consumo.tasa * 100).toFixed(0)}%)</span>
                            <span>{fmtCurrency(consumoEst)}</span>
                          </div>
                        </div>
                        {taxCfg.consumo.nota && <p className="text-[9px] text-white/25 mt-1">{taxCfg.consumo.nota}</p>}
                        {totalIngresos === 0 && <p className="text-[10px] text-white/30 mt-1">Sin ingresos registrados aún.</p>}
                      </div>

                      {/* Impuesto a la renta */}
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-control p-4 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-blue-300">{taxCfg.renta.nombre}</p>
                          <span className="text-[9px] text-blue-400/60 border border-blue-500/20 px-1.5 py-0.5 rounded-pill">{taxCfg.renta.periodicidad}</span>
                        </div>
                        <p className="text-xs text-white/50">{taxCfg.renta.descripcion}</p>
                        <div className="flex justify-between font-bold pt-1 border-t border-blue-500/20 text-blue-300 text-xs">
                          <span>Estimado ({(taxCfg.renta.tasa_estimada * 100).toFixed(1)}% sobre utilidad)</span>
                          <span>{fmtCurrency(rentaEst)}</span>
                        </div>
                      </div>

                      {/* Cargas laborales */}
                      {taxCfg.laboral && (
                        <div className="bg-purple-500/5 border border-purple-500/20 rounded-control p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-purple-300">{taxCfg.laboral.nombre}</p>
                            <span className="text-[9px] text-purple-400/60 border border-purple-500/20 px-1.5 py-0.5 rounded-pill">{taxCfg.laboral.periodicidad} · {taxCfg.laboral.autoridad}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-white/50 mb-0.5 block">Núm. empleados</label>
                              <input type="number" min="0" value={imssEmpleados}
                                onChange={(e) => setImssEmpleados(e.target.value.replace(/^0+(?=\d)/, ''))}
                                className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/40" />
                            </div>
                            <div>
                              <label className="text-[10px] text-white/50 mb-0.5 block">Salario promedio ({taxCfg.simbolo})</label>
                              <input type="number" min="0" placeholder="0.00" value={imbcSbc}
                                onChange={(e) => setImbcSbc(e.target.value.replace(/^0+(?=\d)/, ''))}
                                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/40" />
                            </div>
                          </div>
                          {numEmp > 0 && salario > 0 && (
                            <div className="flex justify-between font-bold text-purple-300 text-xs pt-1 border-t border-purple-500/20">
                              <span>Carga patronal estimada ({(taxCfg.laboral.tasa_patron * 100).toFixed(1)}%)</span>
                              <span>{fmtCurrency(salario * numEmp * taxCfg.laboral.tasa_patron)}</span>
                            </div>
                          )}
                          {(numEmp === 0 || salario === 0) && <p className="text-[10px] text-white/30">Ingresa número de empleados y salario promedio para calcular.</p>}
                        </div>
                      )}

                      {/* Notas importantes */}
                      {taxCfg.notas.length > 0 && (
                        <div className="bg-white/3 border border-white/8 rounded-control p-3">
                          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-2">Notas importantes</p>
                          {taxCfg.notas.map((nota, i) => (
                            <p key={i} className="text-[10px] text-white/30 mb-1">• {nota}</p>
                          ))}
                          <p className="text-[10px] text-white/20 mt-2">* Las cifras son estimaciones orientativas. Consulta un contador certificado en {taxCfg.nombre} para tu situación específica.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* F. Historial Vivo */}
                {movimientos.length === 0 ? (
                  <p className="text-xs text-white/30 text-center py-2">Sin movimientos registrados.</p>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide pb-1">Historial vivo</p>
                    {movimientos.map((m) => {
                      const statusDotColor = m.tipo === 'ingreso' ? 'bg-emerald-400' : m.es_auto_generado ? 'bg-amber-400' : 'bg-red-400';
                      const amountColor = m.tipo === 'ingreso' ? 'text-finanzas' : m.es_auto_generado ? 'text-amber-400' : 'text-brand-accent';
                      const rowBg = m.tipo === 'ingreso' ? 'bg-finanzas/5 border-finanzas/15' : m.es_auto_generado ? 'bg-amber-500/5 border-amber-500/15' : 'bg-red-500/5 border-red-500/15';
                      return (
                        <div key={m.id} className={`flex items-center gap-2 border rounded-control px-3 py-2 ${rowBg}`}>
                          <span className={`w-2 h-2 rounded-pill flex-shrink-0 ${statusDotColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{m.descripcion}{m.tiene_cfdi && <span className="ml-1 text-[9px] text-green-400 bg-finanzas/20 px-1 rounded">CFDI</span>}</p>
                            <p className="text-[10px] text-white/40">{m.fecha}{m.categoria ? ` · ${m.categoria}` : ''}{m.es_auto_generado ? ' · automático' : ''}</p>
                          </div>
                          <span className={`text-sm font-bold flex-shrink-0 ${amountColor}`}>
                            {m.tipo === 'egreso' ? '-' : '+'}{fmtCurrency(Number(m.monto))}
                          </span>
                          {!m.es_auto_generado && (
                            <button onClick={() => handleDeleteMovimiento(m.id)} className="text-white/20 hover:text-red-400 transition text-xs flex-shrink-0 p-1" title="Eliminar (también borra impuestos vinculados)">
                              <X className="w-3.5 h-3.5" strokeWidth={1.8} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* CTA */}
      <div className="mt-8 rounded-surface border border-white/8 p-8 text-center relative overflow-hidden" style={FONDO_PANEL}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="absolute top-0 right-0 w-[250px] h-[250px] bg-indigo-500/5 rounded-pill blur-[100px] pointer-events-none" />
        <div className="relative z-10">
          <div className="w-14 h-14 rounded-surface bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-emerald-400">
            <BarChart3 className="w-7 h-7" strokeWidth={1.8} />
          </div>
          <h3 className="font-bold text-2xl text-white mb-2">Proyección Lista</h3>
          <p className="text-sm text-white/40 mb-6 max-w-sm mx-auto">Ya tienes tu análisis financiero completo. Continúa explorando los otros módulos.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={`/dashboard/producto/${productoId}`} className="bg-white/10 border border-white/15 text-white px-7 py-3 rounded-control font-semibold text-sm hover:bg-white/15 transition-all w-full sm:w-auto">
              Ver todos los módulos →
            </Link>
            <Link href={`/dashboard/finanzas/${productoId}`} className="border border-white/8 text-white/50 px-7 py-3 rounded-control text-sm font-medium hover:bg-white/5 hover:text-white/70 transition w-full sm:w-auto">
              + Nuevo análisis
            </Link>
            <Link href="/dashboard" className="border border-white/8 text-white/50 px-7 py-3 rounded-control text-sm font-medium hover:bg-white/5 hover:text-white/70 transition w-full sm:w-auto">
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      {showCsvModal && (
        <CsvImportModal
          productoId={productoId}
          onClose={() => setShowCsvModal(false)}
          onImported={() => {
            api.get(`/contabilidad/${productoId}`).then(({ data }) => setMovimientos(data)).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
