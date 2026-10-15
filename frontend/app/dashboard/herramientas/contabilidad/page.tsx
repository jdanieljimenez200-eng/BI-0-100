'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Download,
  UploadCloud,
  Search,
  X,
  Plus,
  Filter,
  BarChart3,
  BookOpen,
  Tag,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Users,
  CreditCard,
  Bike,
  Calculator,
  Clock,
  PieChart,
} from 'lucide-react';
import api, { hayRespuestaDelServidor, nuevaClaveIdempotencia } from '@/lib/api';
import { getTaxConfig, comprobanteNombre } from '@/lib/taxConfig';
import { hoyLocal } from '@/lib/fechaLocal';
import ProductoGate from '@/components/herramientas/ProductoGate';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import type { ProductoActivo } from '@/lib/productoActivo';
import { Breadcrumbs, SearchInput } from '@/components/ui';
import CsvImportModal from '../../finanzas/[productoId]/resultado/[analisisId]/CsvImportModal';
import ReportesPanel from './reportes/ReportesPanel';
import CanalesCobroModal, { CanalCobroData } from './CanalesCobroModal';
import SimuladorPreciosComision from './SimuladorPreciosComision';
import LiquidacionesPanel from './LiquidacionesPanel';
import EstadoResultadosPnL from './EstadoResultadosPnL';
import { calcularDesgloseComision, textoPorcentaje } from '@/lib/comisiones';
import { r2 } from '@/lib/dinero';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Movimiento {
  id: string;
  usuario_id: string;
  producto_id: string | null;
  tipo: 'ingreso' | 'egreso';
  descripcion: string;
  categoria: string;
  monto: number | string;
  fecha: string;
  parent_movimiento_id: string | null;
  es_auto_generado: boolean;
  tiene_cfdi: boolean;
  fuente: 'manual' | 'csv_import' | 'pos' | 'inventario' | 'nomina' | 'cotizacion' | 'mantenimiento' | 'delivery' | 'terminal';
  batch_id: string | null;
  canal_cobro_id?: string | null;
  canal_nombre_snapshot?: string | null;
  institucion_snapshot?: string | null;
  monto_bruto?: number | null;
  comision_monto?: number | null;
  comision_iva?: number | null;
  retencion_monto?: number | null;
  monto_neto?: number | null;
  estado_liquidacion?: 'inmediato' | 'pendiente' | 'liquidado';
  fecha_liquidacion?: string | null;
  /** 'venta', 'pago_nomina', 'cotizacion'… o 'ajuste_manual' / null si se capturó aquí. */
  referencia_tipo?: string | null;
}

type TabKey = 'reportes' | 'pnl' | 'movimientos' | 'canales' | 'simulador' | 'liquidaciones' | 'calibracion' | 'fiscal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v: unknown) => Number(v ?? 0);

/** El `error` que manda el backend, o el texto de respaldo. */
function mensajeDeError(err: unknown, respaldo: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? respaldo;
}

/**
 * Asiento que genera otra herramienta (venta, nómina, compra…): se corrige allí,
 * el backend responde 409 si se edita o borra desde Contabilidad.
 */
function esDerivado(m: Movimiento): boolean {
  return Boolean(m.referencia_tipo) && m.referencia_tipo !== 'ajuste_manual';
}

function fmtMoney(value: number, simbolo: string, locale: string): string {
  return `${simbolo}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

// Día local: en UTC, un gasto capturado por la tarde quedaba con fecha de mañana.
const todayISO = hoyLocal;

const pct = (tasa: number, decimales = 0) => `${(tasa * 100).toFixed(decimales)}%`;

// Categorías bloqueadas en freemium (espejo de GATED_CATS_FREEMIUM en el backend)
const GATED_CATS_FREEMIUM = ['Gasolina', 'Insumos', 'Materiales'];
const CATEGORIAS_SUGERIDAS = ['Ventas', 'Servicios', 'Renta', 'Sueldos', 'Gasolina', 'Insumos', 'Materiales', 'Marketing', 'Comisiones Financieras / Plataformas', 'Impuestos', 'Otros'];

const FUENTE_INFO: Record<Movimiento['fuente'], { label: string; color: string; badge: string }> = {
  manual:      { label: 'Manual',      color: 'text-white/60', badge: 'bg-white/5 border-white/10 text-white/60' },
  csv_import:  { label: 'CSV / Excel', color: 'text-sky-300', badge: 'bg-sky-500/10 border-sky-500/30 text-sky-300' },
  pos:         { label: 'POS Venta',   color: 'text-violet-300', badge: 'bg-violet-500/10 border-violet-500/30 text-violet-300' },
  inventario:  { label: 'Inventario',  color: 'text-amber-300', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
  nomina:      { label: 'Nómina',      color: 'text-rose-300', badge: 'bg-rose-500/10 border-rose-500/30 text-rose-300' },
  cotizacion:  { label: 'Cotización',  color: 'text-teal-300', badge: 'bg-teal-500/10 border-teal-500/30 text-teal-300' },
  mantenimiento: { label: 'Mantenimiento', color: 'text-orange-300', badge: 'bg-orange-500/10 border-orange-500/30 text-orange-300' },
  delivery:    { label: 'Delivery App', color: 'text-emerald-300', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
  terminal:    { label: 'Terminal TPV', color: 'text-amber-300', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
};

// Calibración (la calcula el servidor: GET /contabilidad/:id/resumen)
interface ResumenContable {
  kpis: { ingresos: number; egresos: number; balance: number; total: number };
  conteo_fuentes: Record<string, number>;
  conteo_tipos: { todos: number; ingreso: number; egreso: number };
  manuales: number;
  categorias: string[];
  fiscal_base: { ingresos: number; egresos_no_auto: number; egresos_con_comprobante: number };
  calibracion: {
    ingreso_promedio_mensual: number;
    egreso_promedio_mensual: number;
    meses_analizados: number;
    confianza: 'alta' | 'media' | 'baja';
    rango_fechas: { desde: string; hasta: string };
  };
}

interface CalibracionLite {
  ingresoPromedio: number;
  egresoPromedio: number;
  mesesAnalizados: number;
  confianza: 'alta' | 'media' | 'baja';
  rango: { desde: string; hasta: string } | null;
}

// ─── Page (wrapper con gate) ───────────────────────────────────────────────────

export default function ContabilidadPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('usuario')) {
      router.push('/auth/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <HerramientaGate herramienta="contabilidad" nombre="Reportes" acento="teal">
    <ProductoGate herramienta="Reportes" acento="emerald">
      {({ producto, cambiarProducto }) => (
        <ContabilidadInner producto={producto} cambiarProducto={cambiarProducto} />
      )}
    </ProductoGate>
    </HerramientaGate>
  );
}

// ─── Herramienta (con el producto global ya resuelto) ──────────────────────────

function ContabilidadInner({
  producto,
  cambiarProducto,
}: {
  producto: ProductoActivo;
  cambiarProducto: () => void;
}) {
  const productoId = producto.id;

  // Solo la página cargada: el historial completo ya no viaja al navegador.
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [resumen, setResumen] = useState<ResumenContable | null>(null);
  const [exportando, setExportando] = useState(false);
  const [canales, setCanales] = useState<CanalCobroData[]>([]);
  const [showCanalesModal, setShowCanalesModal] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [tab, setTab] = useState<TabKey>('reportes');

  // Modal de alta
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    tipo: 'ingreso' | 'egreso';
    descripcion: string;
    categoria: string;
    monto: string;
    fecha: string;
    tiene_cfdi: boolean;
    canal_cobro_id: string;
    desglosar_comision: boolean;
  }>({
    tipo: 'ingreso',
    descripcion: '',
    categoria: '',
    monto: '',
    fecha: todayISO(),
    tiene_cfdi: false,
    canal_cobro_id: '',
    desglosar_comision: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Import CSV/Excel — reutiliza el mismo modal que Finanzas (POST /contabilidad/:id/import)
  const [showImport, setShowImport] = useState(false);

  // Edición inline
  const [editId, setEditId] = useState<string | null>(null);
  // Avisos de la lista (borrar, editar, exportar). `aviso` solo se ve dentro del
  // formulario de alta, y un 409 al borrar pasaba sin que el usuario supiera por qué.
  const [avisoLista, setAvisoLista] = useState<string | null>(null);
  const claveMov = useRef(nuevaClaveIdempotencia());
  const [editForm, setEditForm] = useState<{ descripcion: string; monto: string }>({ descripcion: '', monto: '' });

  // Inputs de la pestaña Fiscal (cargas laborales)
  const [empleados, setEmpleados] = useState('0');
  const [salarioPromedio, setSalarioPromedio] = useState('');

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'ingreso' | 'egreso'>('todos');
  const [filtroFuente, setFiltroFuente] = useState<'todos' | Movimiento['fuente']>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');

  const taxCfg = useMemo(() => getTaxConfig(producto.pais ?? 'MX'), [producto.pais]);
  const comprobante = useMemo(() => comprobanteNombre(taxCfg), [taxCfg]);
  const money = useCallback((v: number) => fmtMoney(v, taxCfg.simbolo, taxCfg.locale), [taxCfg]);
  const periodoActual = useMemo(
    () => new Date().toLocaleDateString(taxCfg.locale, { month: 'long', year: 'numeric' }),
    [taxCfg.locale],
  );

  // Filtros que se mandan al servidor. La búsqueda espera a que se deje de teclear.
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const parametrosFiltro = useMemo(() => {
    const p: Record<string, string> = {};
    if (filtroTipo !== 'todos') p.tipo = filtroTipo;
    if (filtroFuente !== 'todos') p.fuente = filtroFuente;
    if (filtroCategoria !== 'todas') p.categoria = filtroCategoria;
    if (busquedaAplicada) p.q = busquedaAplicada;
    return p;
  }, [filtroTipo, filtroFuente, filtroCategoria, busquedaAplicada]);

  // Primera página de movimientos con los filtros actuales
  const cargarMovs = useCallback(async () => {
    if (!productoId) { setMovs([]); setSiguiente(null); return; }
    setCargando(true);
    try {
      const { data } = await api.get(`/contabilidad/${productoId}`, { params: { ...parametrosFiltro, limite: 100 } });
      setMovs((data?.movimientos || []) as Movimiento[]);
      setSiguiente(data?.siguiente ?? null);
    } catch {
      setMovs([]);
      setSiguiente(null);
    } finally {
      setCargando(false);
    }
  }, [productoId, parametrosFiltro]);

  const cargarMas = useCallback(async () => {
    if (!productoId || !siguiente) return;
    setCargandoMas(true);
    try {
      const { data } = await api.get(`/contabilidad/${productoId}`, {
        params: { ...parametrosFiltro, limite: 100, antes: siguiente },
      });
      setMovs((prev) => [...prev, ...((data?.movimientos || []) as Movimiento[])]);
      setSiguiente(data?.siguiente ?? null);
    } catch { /* se puede reintentar con el botón */ }
    finally { setCargandoMas(false); }
  }, [productoId, siguiente, parametrosFiltro]);

  // KPIs, conteos, categorías, calibración y base fiscal de TODO el historial
  const cargarResumen = useCallback(async () => {
    if (!productoId) { setResumen(null); return; }
    try {
      const { data } = await api.get(`/contabilidad/${productoId}/resumen`);
      setResumen(data as ResumenContable);
    } catch {
      setResumen(null);
    }
  }, [productoId]);

  const refrescar = useCallback(async () => {
    await Promise.all([cargarMovs(), cargarResumen()]);
  }, [cargarMovs, cargarResumen]);

  const cargarCanales = useCallback(async () => {
    if (!productoId) { setCanales([]); return; }
    try {
      const { data } = await api.get(`/contabilidad/${productoId}/canales`);
      setCanales((data || []) as CanalCobroData[]);
    } catch {
      setCanales([]);
    }
  }, [productoId]);

  useEffect(() => { cargarMovs(); }, [cargarMovs]);
  useEffect(() => {
    cargarResumen();
    cargarCanales();
  }, [cargarResumen, cargarCanales]);

  const totalMovimientos = resumen?.kpis.total ?? movs.length;

  // KPIs
  const kpis = useMemo(
    () => resumen?.kpis ?? { ingresos: 0, egresos: 0, balance: 0, total: 0 },
    [resumen],
  );

  const conteoFuentes = useMemo(() => resumen?.conteo_fuentes ?? { todos: 0 }, [resumen]);

  const conteoTipos = useMemo(
    () => resumen?.conteo_tipos ?? { todos: 0, ingreso: 0, egreso: 0 },
    [resumen],
  );

  // El servidor ya filtra: la lista es la página cargada.
  const movsFiltrados = movs;

  const exportarCSV = useCallback(async () => {
    if (!productoId || totalMovimientos === 0) return;
    setExportando(true);
    try {
      const { data } = await api.get(`/contabilidad/${productoId}/exportar`, {
        params: parametrosFiltro,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `movimientos_contables_${(producto.nombre || 'general').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${todayISO()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setAvisoLista('No se pudo exportar. Inténtalo de nuevo.');
    } finally {
      setExportando(false);
    }
  }, [productoId, totalMovimientos, parametrosFiltro, producto.nombre]);

  const manualCount = resumen?.manuales ?? 0;
  const calibracion = useMemo<CalibracionLite>(() => {
    const c = resumen?.calibracion;
    if (!c || c.meses_analizados === 0) {
      return { ingresoPromedio: 0, egresoPromedio: 0, mesesAnalizados: 0, confianza: 'baja', rango: null };
    }
    return {
      ingresoPromedio: c.ingreso_promedio_mensual,
      egresoPromedio: c.egreso_promedio_mensual,
      mesesAnalizados: c.meses_analizados,
      confianza: c.confianza,
      rango: c.rango_fechas,
    };
  }, [resumen]);

  // Estimado fiscal país-agnóstico derivado de taxConfig (no asume SAT/IVA/RESICO)
  const fiscal = useMemo(() => {
    const ingresos = resumen?.fiscal_base.ingresos ?? 0;
    const egresos = resumen?.fiscal_base.egresos_no_auto ?? 0;
    const egresosConComprobante = resumen?.fiscal_base.egresos_con_comprobante ?? 0;

    const utilidad = ingresos - egresos;
    const tasa = taxCfg.consumo.tasa;
    const consumoCobrado = ingresos * tasa;
    const consumoAcreditable = taxCfg.consumo.acreditable ? egresosConComprobante * tasa : 0;
    const consumoNeto = consumoCobrado - consumoAcreditable;
    const renta = Math.max(0, utilidad * taxCfg.renta.tasa_estimada);

    const empleadosNum = Math.max(0, Number.parseInt(empleados, 10) || 0);
    const salarioNum = Math.max(0, Number.parseFloat(salarioPromedio) || 0);
    const cargaPatronal = taxCfg.laboral ? salarioNum * empleadosNum * taxCfg.laboral.tasa_patron : 0;

    return {
      ingresos: r2(ingresos),
      egresos: r2(egresos),
      egresosConComprobante: r2(egresosConComprobante),
      utilidad: r2(utilidad),
      consumoCobrado: r2(consumoCobrado),
      consumoAcreditable: r2(consumoAcreditable),
      consumoNeto: r2(consumoNeto),
      renta: r2(renta),
      empleadosNum,
      salarioNum,
      cargaPatronal: r2(cargaPatronal),
    };
  }, [resumen, taxCfg, empleados, salarioPromedio]);

  const categoriasExistentes = useMemo(() => resumen?.categorias ?? [], [resumen]);

  const categoriasPicker = useMemo(() => {
    const exist = new Set(categoriasExistentes.map((c) => c.toLowerCase()));
    return [...categoriasExistentes, ...CATEGORIAS_SUGERIDAS.filter((s) => !exist.has(s.toLowerCase()))];
  }, [categoriasExistentes]);

  // ── Crear movimiento ────────────────────────────────────────────────────
  const guardarMovimiento = useCallback(async () => {
    if (!form.descripcion.trim() || !productoId) return;
    const montoNum = Number(form.monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) { setAviso('El monto debe ser un número mayor que 0.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) { setAviso('La fecha debe tener formato YYYY-MM-DD.'); return; }

    setGuardando(true);
    setAviso(null);
    try {
      await api.post(`/contabilidad/${productoId}`, {
        tipo: form.tipo,
        descripcion: form.descripcion.trim(),
        categoria: form.categoria.trim() || undefined,
        monto: montoNum,
        fecha: form.fecha,
        tiene_cfdi: form.tiene_cfdi,
        canal_cobro_id: form.tipo === 'ingreso' && form.canal_cobro_id ? form.canal_cobro_id : undefined,
        desglosar_comision: form.tipo === 'ingreso' ? form.desglosar_comision : undefined,
      }, { headers: { 'Idempotency-Key': claveMov.current } });
      claveMov.current = nuevaClaveIdempotencia();
      await refrescar();
      setShowForm(false);
      setForm({
        tipo: 'ingreso',
        descripcion: '',
        categoria: '',
        monto: '',
        fecha: todayISO(),
        tiene_cfdi: false,
        canal_cobro_id: '',
        desglosar_comision: true,
      });
    } catch (err: unknown) {
      // Sin respuesta (corte de red) se reintenta con la misma clave: no duplica el movimiento.
      if (hayRespuestaDelServidor(err)) claveMov.current = nuevaClaveIdempotencia();
      const ax = err as { response?: { status?: number; data?: { error?: string; upgrade_required?: boolean } } };
      const data = ax.response?.data;
      if (data?.upgrade_required) {
        setAviso(`${data.error ?? 'Función disponible en un plan superior'}. Mejora tu plan para continuar.`);
      } else {
        setAviso(data?.error ?? (err instanceof Error ? err.message : 'No se pudo guardar el movimiento.'));
      }
    } finally {
      setGuardando(false);
    }
  }, [form, productoId, refrescar]);

  // ── Editar inline ─────────────────────────────────────────────────────────
  const iniciarEdicion = useCallback((m: Movimiento) => {
    setEditId(m.id);
    setEditForm({ descripcion: m.descripcion, monto: String(n(m.monto)) });
  }, []);

  const guardarEdicion = useCallback(async (id: string) => {
    const montoNum = Number(editForm.monto);
    if (!editForm.descripcion.trim() || !Number.isFinite(montoNum) || montoNum <= 0) { setEditId(null); return; }
    try {
      const { data } = await api.patch(`/contabilidad/movimiento/${id}`, {
        descripcion: editForm.descripcion.trim(),
        monto: montoNum,
      });
      setMovs((prev) => prev.map((m) => (m.id === id ? (data as Movimiento) : m)));
      cargarResumen();
      setAvisoLista(null);
    } catch (err) {
      setAvisoLista(mensajeDeError(err, 'No se pudo guardar el cambio.'));
    }
    setEditId(null);
  }, [editForm, cargarResumen]);

  const eliminarMovimiento = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este movimiento? También se borran sus movimientos auto-generados (p. ej. impuestos derivados).')) return;
    try {
      await api.delete(`/contabilidad/movimiento/${id}`);
      setAvisoLista(null);
    } catch (err) {
      setAvisoLista(mensajeDeError(err, 'No se pudo eliminar el movimiento.'));
    }
    await refrescar();
  }, [refrescar]);

  return (
    <div className="relative px-4 sm:px-6 py-10 max-w-6xl mx-auto pb-24">
      {/* Ambient glows */}
      <div className="fixed top-[-10%] right-[-8%] w-[45vh] h-[45vh] bg-emerald-500/8 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-12%] left-[-10%] w-[35vh] h-[35vh] bg-teal-500/5 rounded-full blur-[110px] pointer-events-none" />

      {/* Breadcrumb */}
      <Breadcrumbs
        showBack
        backHref="/dashboard/herramientas"
        backLabel="Herramientas"
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Herramientas', href: '/dashboard/herramientas' },
          { label: 'Reportes & Contabilidad' },
        ]}
        className="mb-6"
      />

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Reportes & Contabilidad</h1>
          <p className="text-sm text-white/50 mt-1">Lo que pasa en cada herramienta, con detalle por área. El libro contable y la parte fiscal sincronizados en tiempo real.</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3 min-w-[280px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-1.5">Asociado a:</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-white text-sm font-semibold truncate">{producto.nombre} · {producto.pais}</p>
            <button
              onClick={cambiarProducto}
              className="flex-shrink-0 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30 rounded-lg px-2.5 py-1 hover:bg-emerald-500/10 transition-colors"
            >
              Cambiar
            </button>
          </div>
          <p className="text-[11px] text-emerald-400/90 mt-1.5">{taxCfg.nombre} · {taxCfg.moneda} · {taxCfg.autoridad}</p>
        </div>
      </div>

      {/* Resumen KPIs interactivos del libro: en Reportes cada área trae los suyos. */}
      {tab !== 'reportes' && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: 'Ingresos',
            value: fmtMoney(kpis.ingresos, taxCfg.simbolo, taxCfg.locale),
            color: 'text-emerald-300',
            sub: `${conteoTipos.ingreso} registro(s)`,
            icon: TrendingUp,
            active: filtroTipo === 'ingreso',
            onClick: () => setFiltroTipo((prev) => (prev === 'ingreso' ? 'todos' : 'ingreso')),
          },
          {
            label: 'Egresos',
            value: fmtMoney(kpis.egresos, taxCfg.simbolo, taxCfg.locale),
            color: 'text-rose-300',
            sub: `${conteoTipos.egreso} registro(s)`,
            icon: TrendingDown,
            active: filtroTipo === 'egreso',
            onClick: () => setFiltroTipo((prev) => (prev === 'egreso' ? 'todos' : 'egreso')),
          },
          {
            label: 'Balance',
            value: fmtMoney(kpis.balance, taxCfg.simbolo, taxCfg.locale),
            color: kpis.balance >= 0 ? 'text-emerald-300' : 'text-rose-300',
            sub: 'ingresos − egresos',
            icon: Wallet,
            active: false,
            onClick: () => { setFiltroTipo('todos'); setFiltroFuente('todos'); setFiltroCategoria('todas'); setBusqueda(''); },
          },
          {
            label: 'Movimientos',
            value: String(kpis.total),
            color: 'text-white',
            sub: `${manualCount} manual(es)`,
            icon: BookOpen,
            active: filtroTipo === 'todos' && filtroFuente === 'todos' && filtroCategoria === 'todas',
            onClick: () => { setFiltroTipo('todos'); setFiltroFuente('todos'); setFiltroCategoria('todas'); setBusqueda(''); },
          },
        ].map((k) => {
          const IconComponent = k.icon;
          return (
            <button
              key={k.label}
              type="button"
              onClick={k.onClick}
              className={`rounded-2xl border p-4 text-left transition-all group ${
                k.active
                  ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                  : 'border-white/8 bg-[#0F1C2A] hover:border-white/20 hover:bg-[#122336]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">{k.label}</span>
                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-white/50 group-hover:text-white/80 transition-colors">
                  <IconComponent className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className={`text-xl sm:text-2xl font-extrabold ${k.color} font-mono tabular-nums leading-tight`}>{k.value}</p>
              {k.sub && <p className="text-[10px] text-white/30 mt-1">{k.sub}</p>}
            </button>
          );
        })}
      </div>
      )}

      {/* Tabs y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-white/8 pb-2 sm:pb-0">
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {([
            { key: 'reportes', label: 'Reportes', icon: BarChart3 },
            { key: 'pnl', label: 'P&L (Resultados)', icon: PieChart },
            { key: 'movimientos', label: `Movimientos (${totalMovimientos})`, icon: BookOpen },
            { key: 'canales', label: `Terminales & Delivery (${canales.length})`, icon: CreditCard },
            { key: 'simulador', label: 'Simulador Precios', icon: Calculator },
            { key: 'liquidaciones', label: 'Liquidaciones', icon: Clock },
            { key: 'calibracion', label: 'Calibración', icon: TrendingUp },
            { key: 'fiscal', label: 'Fiscal', icon: Receipt },
          ] as const).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-xs sm:text-sm px-3.5 py-3 font-semibold transition-colors border-b-2 -mb-px flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  tab === t.key ? 'text-emerald-300 border-emerald-400' : 'text-white/40 border-transparent hover:text-white/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        {tab !== 'reportes' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowCanalesModal(true)}
            className="text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5"
            title="Configurar comisiones de terminales y delivery"
          >
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            <span>Configurar Canales</span>
          </button>
          <button
            onClick={exportarCSV}
            disabled={totalMovimientos === 0 || exportando}
            title={totalMovimientos === 0 ? 'No hay movimientos para exportar' : 'Descargar archivo CSV'}
            className="text-xs font-bold border border-white/15 bg-white/5 text-white/75 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Exportar CSV</span>
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="text-xs font-bold border border-sky-500/40 bg-sky-500/10 text-sky-300 px-3 py-2 rounded-lg hover:bg-sky-500/20 transition-colors flex items-center gap-1.5"
          >
            <UploadCloud className="w-3.5 h-3.5 shrink-0" />
            <span>Importar CSV / Excel</span>
          </button>
          <button
            onClick={() => {
              setAviso(null);
              setForm({
                tipo: 'ingreso',
                descripcion: '',
                categoria: '',
                monto: '',
                fecha: todayISO(),
                tiene_cfdi: false,
                canal_cobro_id: '',
                desglosar_comision: true,
              });
              setShowForm(true);
            }}
            className="text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3.5 py-2 rounded-lg hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Nuevo movimiento</span>
          </button>
        </div>
        )}
      </div>

      {/* ══ TAB: REPORTES ══ */}
      {tab === 'reportes' && (
        <ReportesPanel
          productoId={productoId}
          productoNombre={producto.nombre || 'Este producto'}
          taxCfg={taxCfg}
        />
      )}

      {/* ══ TAB: P&L (ESTADO DE RESULTADOS) ══ */}
      {tab === 'pnl' && (
        <EstadoResultadosPnL
          productoId={productoId}
          simboloMoneda={taxCfg.simbolo}
          locale={taxCfg.locale}
        />
      )}

      {/* ══ TAB: CANALES & TERMINALES ══ */}
      {tab === 'canales' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0F1C2A] border border-white/10 rounded-2xl p-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Terminales TPV & Plataformas de Delivery</span>
              </h3>
              <p className="text-xs text-white/50 mt-0.5">
                Configura cuánto te cobra cada institución (Clip, BBVA, Mercado Pago, Uber Eats, Rappi) para descontarlo automáticamente en cada venta.
              </p>
            </div>
            <button
              onClick={() => setShowCanalesModal(true)}
              className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Administrar / Agregar Canal</span>
            </button>
          </div>

          {canales.length === 0 ? (
            <div className="p-10 border border-dashed border-white/10 rounded-2xl text-center">
              <CreditCard className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-sm font-semibold text-white/70">No tienes terminales ni apps configuradas</p>
              <p className="text-xs text-white/40 mt-1 max-w-md mx-auto mb-4">
                Configura tus canales de cobro para deducir comisiones e impuestos en tiempo real.
              </p>
              <button
                onClick={() => setShowCanalesModal(true)}
                className="text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-4 py-2 rounded-xl hover:bg-emerald-500/30 transition-colors"
              >
                Abrir catálogo de canales
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {canales.map((c) => (
                <div
                  key={c.id}
                  className="bg-[#0F1C2A] border border-white/8 hover:border-white/20 rounded-2xl p-4 space-y-2.5 transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-bold text-white">{c.nombre}</h4>
                      <p className="text-[10px] text-white/40 font-medium">
                        {c.institucion} · {c.tipo_canal.toUpperCase()}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                      {textoPorcentaje(c.comision_porcentaje, taxCfg.locale)} {c.aplica_iva_comision ? '+ IVA' : ''}
                    </span>
                  </div>

                  <div className="text-xs text-white/60 space-y-1 pt-2 border-t border-white/5">
                    {Number(c.comision_fija) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-white/40">Tarifa fija:</span>
                        <span className="font-mono text-white/80">{taxCfg.simbolo}{Number(c.comision_fija).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(c.retencion_isr_porcentaje) > 0 && (
                      <div className="flex justify-between text-rose-300">
                        <span className="text-white/40">Retención ISR:</span>
                        <span className="font-mono">{(Number(c.retencion_isr_porcentaje) * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    {Number(c.retencion_iva_porcentaje) > 0 && (
                      <div className="flex justify-between text-rose-300">
                        <span className="text-white/40">Retención IVA:</span>
                        <span className="font-mono">{(Number(c.retencion_iva_porcentaje) * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-white/40">Depósito en banco:</span>
                      <span className="text-emerald-400 font-semibold">
                        {c.dias_liquidacion === 0 ? 'Mismo día' : `En ${c.dias_liquidacion} día(s)`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: SIMULADOR DE PRECIOS ══ */}
      {tab === 'simulador' && (
        <SimuladorPreciosComision
          canales={canales}
          simboloMoneda={taxCfg.simbolo}
          locale={taxCfg.locale}
          tasaIva={taxCfg.consumo.tasa}
          precioIncluyeImpuesto={producto.cobra_impuesto_consumo !== false}
        />
      )}

      {/* ══ TAB: LIQUIDACIONES Y CONCILIACIÓN ══ */}
      {tab === 'liquidaciones' && (
        <LiquidacionesPanel
          productoId={productoId}
          simboloMoneda={taxCfg.simbolo}
          locale={taxCfg.locale}
          onMovimientosCambio={cargarMovs}
        />
      )}

      {tab === 'movimientos' && (
        <div>
          {cargando ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-white/40 text-sm">Cargando movimientos…</div>
          ) : totalMovimientos === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <BookOpen className="w-6 h-6" />
              </div>
              <p className="text-white/60 text-sm font-semibold mb-1">Sin movimientos aún</p>
              <p className="text-white/40 text-xs mb-4">Registra tu primer ingreso o egreso para empezar a construir el libro contable.</p>
              <button
                onClick={() => setShowForm(true)}
                className="text-xs font-bold border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-lg hover:bg-emerald-500/10"
              >
                + Nuevo movimiento
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {avisoLista && (
                <div role="alert" className="flex items-start justify-between gap-3 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                  <span>{avisoLista}</span>
                  <button type="button" onClick={() => setAvisoLista(null)} aria-label="Cerrar aviso" className="text-amber-200/60 hover:text-amber-100">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {/* Barra de Búsqueda y Filtros */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <SearchInput
                      value={busqueda}
                      onChange={setBusqueda}
                      placeholder="Buscar por concepto, categoría, fuente o monto..."
                      shortcutKey="f"
                    />
                  </div>

                  {categoriasExistentes.length > 0 && (
                    <div className="sm:w-52">
                      <select
                        value={filtroCategoria}
                        onChange={(e) => setFiltroCategoria(e.target.value)}
                        className="w-full bg-[#0F1C2A] border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
                      >
                        <option value="todas">Todas las categorías</option>
                        {categoriasExistentes.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Filtros de Tipo y Fuente */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-white/30 mr-1 flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    Tipo:
                  </span>
                  {(['todos', 'ingreso', 'egreso'] as const).map((tipoKey) => {
                    const activo = filtroTipo === tipoKey;
                    const label = tipoKey === 'todos' ? 'Todos' : tipoKey === 'ingreso' ? 'Ingresos' : 'Egresos';
                    const count = conteoTipos[tipoKey];
                    return (
                      <button
                        key={tipoKey}
                        type="button"
                        onClick={() => setFiltroTipo(tipoKey)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1.5 ${
                          activo
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                            : 'border-white/8 bg-[#0F1C2A] text-white/50 hover:border-white/20 hover:text-white/80'
                        }`}
                      >
                        <span>{label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activo ? 'bg-emerald-500/30 text-emerald-200 font-bold' : 'bg-white/5 text-white/40'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}

                  <span className="text-white/20 mx-1">|</span>

                  <span className="text-[10px] uppercase font-bold tracking-wider text-white/30 mr-1">Fuente:</span>
                  {(['todos', 'manual', 'pos', 'terminal', 'delivery', 'inventario', 'nomina', 'mantenimiento', 'cotizacion', 'csv_import'] as const).map((fKey) => {
                    const activo = filtroFuente === fKey;
                    const label = fKey === 'todos' ? 'Todas' : FUENTE_INFO[fKey]?.label ?? fKey;
                    const count = conteoFuentes[fKey] ?? 0;
                    if (count === 0 && fKey !== 'todos') return null;
                    return (
                      <button
                        key={fKey}
                        type="button"
                        onClick={() => setFiltroFuente(fKey)}
                        className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all flex items-center gap-1 ${
                          activo
                            ? 'border-white/30 bg-white/10 text-white font-semibold'
                            : 'border-white/5 bg-[#0F1C2A]/60 text-white/40 hover:border-white/15 hover:text-white/70'
                        }`}
                      >
                        <span>{label}</span>
                        <span className="text-[9px] px-1 rounded-full bg-white/5 text-white/40">{count}</span>
                      </button>
                    );
                  })}

                  {(busqueda || filtroTipo !== 'todos' || filtroFuente !== 'todos' || filtroCategoria !== 'todas') && (
                    <button
                      onClick={() => {
                        setBusqueda('');
                        setFiltroTipo('todos');
                        setFiltroFuente('todos');
                        setFiltroCategoria('todas');
                      }}
                      className="text-[11px] text-white/40 hover:text-rose-300 ml-auto flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Limpiar filtros
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de Movimientos */}
              <div className="space-y-2">
                {movsFiltrados.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                    <p className="text-white/60 text-sm font-semibold mb-1">No hay movimientos con los filtros aplicados</p>
                    <p className="text-white/40 text-xs mb-3">Prueba ajustando el término de búsqueda o cambiando los filtros seleccionados.</p>
                    <button
                      onClick={() => { setBusqueda(''); setFiltroTipo('todos'); setFiltroFuente('todos'); setFiltroCategoria('todas'); }}
                      className="text-xs text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10"
                    >
                      Ver todos los movimientos
                    </button>
                  </div>
                ) : (
                  movsFiltrados.map((m) => {
                    const esIngreso = m.tipo === 'ingreso';
                    const fuente = FUENTE_INFO[m.fuente] ?? FUENTE_INFO.manual;
                    const editando = editId === m.id;
                    return (
                      <div
                        key={m.id}
                        className="rounded-xl border border-white/8 bg-[#0F1C2A] p-3.5 flex items-center gap-3.5 flex-wrap hover:border-white/15 transition-colors"
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          esIngreso ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}>
                          {esIngreso ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          {editando ? (
                            <input
                              type="text"
                              value={editForm.descripcion}
                              aria-label="Concepto"
                              onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
                              className="w-full bg-white/5 border border-emerald-500/40 rounded-lg px-2.5 py-1 text-sm text-white outline-none"
                              autoFocus
                            />
                          ) : (
                            <p className="text-sm text-white font-semibold truncate">{m.descripcion}</p>
                          )}
                          <div className="text-[11px] text-white/40 flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="flex items-center gap-1 text-white/50">
                              <Calendar className="w-3 h-3 text-white/30" />
                              {m.fecha}
                            </span>
                            {m.categoria && (
                              <>
                                <span className="text-white/20">·</span>
                                <span className="flex items-center gap-1 text-white/60">
                                  <Tag className="w-3 h-3 text-white/30" />
                                  {m.categoria}
                                </span>
                              </>
                            )}
                            <span className="text-white/20">·</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${fuente.badge}`}>
                              {fuente.label}
                            </span>
                            {m.es_auto_generado && (
                              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/8 text-white/50 border border-white/10">
                                auto
                              </span>
                            )}
                            {m.tiene_cfdi && (
                              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 flex items-center gap-1" title={`Movimiento con ${comprobante}`}>
                                <ShieldCheck className="w-3 h-3" />
                                {comprobante}
                              </span>
                            )}
                            {m.institucion_snapshot && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                                {m.institucion_snapshot}
                              </span>
                            )}
                            {m.monto_neto !== undefined && m.monto_neto !== null && Number(m.monto_neto) !== Number(m.monto) && (
                              <span className="text-[10px] text-emerald-400 font-mono font-medium">
                                (Neto en banco: {fmtMoney(Number(m.monto_neto), taxCfg.simbolo, taxCfg.locale)})
                              </span>
                            )}
                            {m.estado_liquidacion && m.tipo === 'ingreso' && (m.canal_cobro_id || m.monto_bruto) && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                m.estado_liquidacion === 'pendiente'
                                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                                  : 'bg-white/5 border border-white/10 text-white/40'
                              }`}>
                                {m.estado_liquidacion === 'pendiente' ? 'Por cobrar en banco' : 'Depositado'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          {editando ? (
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={editForm.monto}
                              aria-label="Monto"
                              onChange={(e) => setEditForm({ ...editForm, monto: e.target.value })}
                              className="w-28 bg-white/5 border border-emerald-500/40 rounded-lg px-2 py-1 text-sm text-white text-right outline-none"
                            />
                          ) : (
                            <div>
                              <p className={`text-base font-bold tabular-nums ${esIngreso ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {esIngreso ? '+' : '−'}{fmtMoney(n(m.monto), taxCfg.simbolo, taxCfg.locale)}
                              </p>
                              {m.comision_monto !== undefined && m.comision_monto !== null && Number(m.comision_monto) > 0 && (
                                <p className="text-[10px] text-rose-300/80 font-mono">
                                  −{fmtMoney(Number(m.comision_monto) + Number(m.comision_iva ?? 0) + Number(m.retencion_monto ?? 0), taxCfg.simbolo, taxCfg.locale)} com.
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {editando ? (
                            <>
                              <button
                                onClick={() => guardarEdicion(m.id)}
                                className="text-xs font-bold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 rounded-lg hover:bg-emerald-500/20"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => setEditId(null)}
                                className="text-xs text-white/40 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(m)}
                                disabled={m.es_auto_generado || esDerivado(m)}
                                title={
                                  esDerivado(m)
                                    ? 'Lo genera otra herramienta (venta, nómina, compra…): corrígelo ahí'
                                    : m.es_auto_generado ? 'Los movimientos auto-generados no se editan directamente' : 'Editar concepto o monto'
                                }
                                aria-label="Editar movimiento"
                                className="text-xs text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarMovimiento(m.id)}
                                disabled={esDerivado(m)}
                                title={esDerivado(m) ? 'Lo genera otra herramienta (venta, nómina, compra…): corrígelo ahí' : 'Borrar movimiento'}
                                aria-label="Borrar movimiento"
                                className="text-xs text-white/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:text-white/40 disabled:hover:bg-transparent transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                {siguiente && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={cargarMas}
                      disabled={cargandoMas}
                      className="text-xs font-semibold text-emerald-300 border border-emerald-500/30 px-4 py-2 rounded-lg hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      {cargandoMas ? 'Cargando…' : `Cargar más (${movs.length} de ${totalMovimientos})`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: CALIBRACIÓN ══ */}
      {tab === 'calibracion' && (
        <div className="max-w-2xl">
          {calibracion.mesesAnalizados === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <p className="text-white/60 text-sm">Aún no hay movimientos manuales suficientes para calibrar.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-[#0F1C2A] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Promedios mensuales</h3>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border font-semibold ${
                  calibracion.confianza === 'alta' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : calibracion.confianza === 'media' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-white/8 border-white/15 text-white/50'
                }`}>
                  Confianza {calibracion.confianza}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Ingreso prom. mensual</p>
                  <p className="text-2xl font-extrabold text-emerald-300 tabular-nums">{fmtMoney(calibracion.ingresoPromedio, taxCfg.simbolo, taxCfg.locale)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Egreso prom. mensual</p>
                  <p className="text-2xl font-extrabold text-rose-300 tabular-nums">{fmtMoney(calibracion.egresoPromedio, taxCfg.simbolo, taxCfg.locale)}</p>
                </div>
              </div>

              <div className="border-t border-white/8 pt-4 text-xs text-white/50 space-y-1">
                <p>Meses analizados: <span className="text-white/80 font-semibold">{calibracion.mesesAnalizados}</span></p>
                {calibracion.rango && <p>Rango: <span className="text-white/80">{calibracion.rango.desde}</span> → <span className="text-white/80">{calibracion.rango.hasta}</span></p>}
                {calibracion.mesesAnalizados < 6 && (
                  <p className="text-amber-300/80 pt-1">Con 6 o más meses de datos la calibración es más precisa.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: FISCAL ══ */}
      {tab === 'fiscal' && (
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wide">
              Estimado fiscal — {periodoActual}
            </p>
            <span className="text-[9px] text-white/30 border border-white/10 px-2 py-0.5 rounded-full">
              {taxCfg.nombre} · {taxCfg.autoridad}
            </span>
          </div>

          {totalMovimientos === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Receipt className="w-6 h-6" />
              </div>
              <p className="text-white/60 text-sm font-semibold mb-1">Sin datos para estimar</p>
              <p className="text-white/40 text-xs">Registra ingresos y egresos para ver tu carga fiscal aproximada en {taxCfg.nombre}.</p>
            </div>
          ) : (
            <>
              {/* Impuesto al consumo */}
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 shrink-0" />
                    <span>{taxCfg.consumo.nombre}</span>
                  </p>
                  <span className="text-[9px] text-amber-400/60 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                    {taxCfg.consumo.periodicidad} · {taxCfg.autoridad}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-white/70">
                  <div className="flex justify-between gap-3">
                    <span>Ingresos sin {taxCfg.consumo.nombre}</span>
                    <span className="font-semibold text-white tabular-nums">{money(fiscal.ingresos)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>{taxCfg.consumo.nombre} cobrado ({pct(taxCfg.consumo.tasa, 1)})</span>
                    <span className="font-semibold text-white tabular-nums">{money(fiscal.consumoCobrado)}</span>
                  </div>
                  {taxCfg.consumo.acreditable && (
                    <div className="flex justify-between gap-3 text-emerald-300/80">
                      <span>− Acreditable (egresos con {comprobante})</span>
                      <span className="tabular-nums">−{money(fiscal.consumoAcreditable)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between gap-3 font-bold pt-1 border-t border-amber-500/20 ${fiscal.consumoNeto >= 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                    <span>{fiscal.consumoNeto >= 0 ? 'ESTIMADO A PAGAR' : 'SALDO A FAVOR'}</span>
                    <span className="tabular-nums">{money(Math.abs(fiscal.consumoNeto))}</span>
                  </div>
                </div>
                {taxCfg.consumo.nota && <p className="text-[10px] text-white/30">{taxCfg.consumo.nota}</p>}
                {!taxCfg.consumo.acreditable && (
                  <p className="text-[10px] text-white/30">En {taxCfg.nombre} este impuesto no se acredita de forma directa; la carga real depende de tu régimen.</p>
                )}
              </div>

              {/* Impuesto a la renta */}
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>{taxCfg.renta.nombre}</span>
                  </p>
                  <span className="text-[9px] text-blue-400/60 border border-blue-500/20 px-1.5 py-0.5 rounded-full">
                    {taxCfg.renta.periodicidad}
                  </span>
                </div>
                <p className="text-[11px] text-white/50">{taxCfg.renta.descripcion}</p>
                <div className="space-y-1 text-xs text-white/70">
                  <div className="flex justify-between gap-3">
                    <span>Utilidad estimada (ingresos − gastos, nómina incluida)</span>
                    <span className={`font-semibold tabular-nums ${fiscal.utilidad >= 0 ? 'text-white' : 'text-rose-300'}`}>{money(fiscal.utilidad)}</span>
                  </div>
                  <div className="flex justify-between gap-3 font-bold pt-1 border-t border-blue-500/20 text-blue-300">
                    <span>Estimado ({pct(taxCfg.renta.tasa_estimada, 1)} sobre utilidad)</span>
                    <span className="tabular-nums">{money(fiscal.renta)}</span>
                  </div>
                </div>
                {fiscal.utilidad <= 0 && (
                  <p className="text-[10px] text-white/30">Sin utilidad en el periodo: el estimado de renta es {money(0)}.</p>
                )}
              </div>

              {/* Cargas laborales */}
              {taxCfg.laboral ? (
                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>{taxCfg.laboral.nombre}</span>
                    </p>
                    <span className="text-[9px] text-purple-400/60 border border-purple-500/20 px-1.5 py-0.5 rounded-full">
                      {taxCfg.laboral.periodicidad} · {taxCfg.laboral.autoridad}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="fiscal-empleados" className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5 block">Núm. empleados</label>
                      <input
                        id="fiscal-empleados"
                        type="number"
                        min="0"
                        step="1"
                        value={empleados}
                        onChange={(e) => setEmpleados(e.target.value.replace(/^0+(?=\d)/, ''))}
                        className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="fiscal-salario" className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5 block">Salario promedio ({taxCfg.simbolo})</label>
                      <input
                        id="fiscal-salario"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={salarioPromedio}
                        onChange={(e) => setSalarioPromedio(e.target.value.replace(/^0+(?=\d)/, ''))}
                        className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-purple-500/50"
                      />
                    </div>
                  </div>
                  {fiscal.empleadosNum > 0 && fiscal.salarioNum > 0 ? (
                    <div className="flex justify-between gap-3 font-bold text-purple-300 text-xs pt-1 border-t border-purple-500/20">
                      <span>Carga patronal estimada ({pct(taxCfg.laboral.tasa_patron, 1)})</span>
                      <span className="tabular-nums">{money(fiscal.cargaPatronal)}</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-white/30">Ingresa número de empleados y salario promedio para calcular.</p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
                  <p className="text-xs text-white/50">
                    No hay una carga patronal estándar configurada para {taxCfg.nombre}. Consulta las tarifas vigentes con {taxCfg.autoridad}.
                  </p>
                </div>
              )}

              {taxCfg.modo === 'detallado_mx' && (
                <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-3">
                  <p className="text-[11px] text-sky-200">
                    Para la declaración mensual detallada (IVA acreditable, ISR RESICO y IMSS/INFONAVIT con retenciones) usa el Centro de Mando en el resultado de Finanzas.
                  </p>
                </div>
              )}

              {taxCfg.notas.length > 0 && (
                <div className="rounded-2xl border border-white/8 bg-white/3 p-3">
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-2">Notas importantes</p>
                  {taxCfg.notas.map((nota, i) => (
                    <p key={i} className="text-[10px] text-white/30 mb-1">• {nota}</p>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-white/20">
                * Cifras orientativas calculadas sobre tus movimientos manuales. Consulta un contador certificado en {taxCfg.nombre} para tu situación específica.
              </p>
            </>
          )}
        </div>
      )}

      {/* ══ MODAL: nuevo movimiento ══ */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !guardando && setShowForm(false)}>
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(e) => e.stopPropagation()} className="bg-[#0F1C2A] border border-white/15 rounded-3xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-white mb-4">Nuevo movimiento</h3>

              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button type="button" onClick={() => setForm({ ...form, tipo: 'ingreso' })} className={`py-2.5 rounded-xl border text-sm font-bold transition-all ${form.tipo === 'ingreso' ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200' : 'border-white/10 text-white/50 hover:border-emerald-500/30'}`}>
                  + Ingreso
                </button>
                <button type="button" onClick={() => setForm({ ...form, tipo: 'egreso' })} className={`py-2.5 rounded-xl border text-sm font-bold transition-all ${form.tipo === 'egreso' ? 'border-rose-400/60 bg-rose-500/20 text-rose-200' : 'border-white/10 text-white/50 hover:border-rose-500/30'}`}>
                  − Egreso
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/40">Descripción *</label>
                  <input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none" placeholder={form.tipo === 'ingreso' ? 'Venta del día' : 'Pago de renta'} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Monto ({taxCfg.simbolo}) *</label>
                    <input type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Fecha *</label>
                    <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/40">Categoría</label>
                  <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                    {categoriasPicker.map((cat) => {
                      const sel = form.categoria.trim().toLowerCase() === cat.toLowerCase();
                      const gated = GATED_CATS_FREEMIUM.includes(cat);
                      return (
                        <button key={cat} type="button" onClick={() => setForm({ ...form, categoria: cat })} className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${sel ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 font-semibold' : 'border-white/15 bg-white/5 text-white/70 hover:border-emerald-500/40'}`} title={gated ? 'Categoría premium (Pro)' : undefined}>
                          <span>{cat}</span>
                          {gated && <span className="ml-1 text-[9px] font-bold text-amber-400">PRO</span>}
                        </button>
                      );
                    })}
                  </div>
                  <input type="text" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none" placeholder="O escribe una nueva" />
                  <p className="text-[10px] text-white/30 mt-1">Las categorías marcadas con PRO requieren un plan de pago.</p>
                </div>

                {/* Selector de Canal / Terminal / Delivery si es Ingreso */}
                {form.tipo === 'ingreso' && (
                  <div className="bg-white/4 border border-white/8 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                        Canal / Terminal de Cobro
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowCanalesModal(true)}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Gestionar canales</span>
                      </button>
                    </div>

                    <select
                      value={form.canal_cobro_id}
                      onChange={(e) => setForm({ ...form, canal_cobro_id: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
                    >
                      <option value="" className="bg-[#0F1C2A]">Directo / Efectivo (Sin comisión descontada)</option>
                      {canales.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#0F1C2A]">
                          {c.nombre} ({c.institucion} · {textoPorcentaje(c.comision_porcentaje, taxCfg.locale)}{c.aplica_iva_comision ? ' + IVA' : ''})
                        </option>
                      ))}
                    </select>

                    {/* Previsualización en vivo de comisiones */}
                    {form.canal_cobro_id && Number(form.monto) > 0 && (() => {
                      const canalSel = canales.find((c) => c.id === form.canal_cobro_id);
                      if (!canalSel) return null;
                      const bruto = Number(form.monto);
                      // La misma cuenta que hace el servidor al guardar (lib/comisiones.ts):
                      // IVA de la comisión con la tasa del país (antes 16 % fijo) y
                      // retenciones sobre la venta sin el IVA que ya trae el precio.
                      const tasa = taxCfg.consumo.tasa;
                      const ivaDentro = producto.cobra_impuesto_consumo !== false && tasa > 0 ? r2(bruto - bruto / (1 + tasa)) : 0;
                      const des = calcularDesgloseComision(bruto, canalSel, tasa, ivaDentro);
                      const comBase = des.comisionBase;
                      const comIva = des.comisionIva;
                      const retIsr = des.retencionIsr;
                      const retIva = des.retencionIva;
                      const neto = des.montoNeto;

                      return (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-[11px] space-y-1.5 mt-2">
                          <div className="flex justify-between text-white/50">
                            <span>Venta bruta:</span>
                            <span className="font-mono">{taxCfg.simbolo}{bruto.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-rose-300">
                            <span>Comisión {canalSel.institucion}{comIva > 0 ? ' con IVA' : ''}:</span>
                            <span className="font-mono">−{taxCfg.simbolo}{r2(comBase + comIva).toFixed(2)}</span>
                          </div>
                          {(retIsr + retIva) > 0 && (
                            <div className="flex justify-between text-amber-300">
                              <span>Retenciones de impuestos de la app:</span>
                              <span className="font-mono">−{taxCfg.simbolo}{r2(retIsr + retIva).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-emerald-300 font-bold pt-1 border-t border-emerald-500/20">
                            <span>Neto real a recibir:</span>
                            <span className="font-mono text-xs">{taxCfg.simbolo}{neto.toFixed(2)}</span>
                          </div>

                          <label className="flex items-center gap-2 pt-1 text-[10px] text-white/70 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.desglosar_comision}
                              onChange={(e) => setForm({ ...form, desglosar_comision: e.target.checked })}
                              className="accent-emerald-500 rounded"
                            />
                            <span>Crear egresos automáticos de comisión e IVA deducible</span>
                          </label>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <label className="flex items-start gap-2 text-xs text-white/70 cursor-pointer pt-1">
                  <input type="checkbox" checked={form.tiene_cfdi} onChange={(e) => setForm({ ...form, tiene_cfdi: e.target.checked })} className="accent-emerald-500 mt-0.5" />
                  <span>
                    Tiene {comprobante}
                    {taxCfg.consumo.acreditable && (
                      <span className="block text-[10px] text-white/35">
                        El {taxCfg.consumo.nombre} de gastos con {comprobante} se acredita en tu estimado fiscal.
                      </span>
                    )}
                  </span>
                </label>

                {aviso && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-200">{aviso}</div>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowForm(false)} disabled={guardando} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-sm font-semibold hover:bg-white/5 disabled:opacity-50">Cancelar</button>
                <button onClick={guardarMovimiento} disabled={guardando || !form.descripcion.trim()} className="flex-1 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-sm disabled:opacity-40">
                  {guardando ? 'Guardando…' : 'Registrar movimiento'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ MODAL: Canales de Cobro / Terminales / Delivery ══ */}
      {showCanalesModal && productoId && (
        <CanalesCobroModal
          productoId={productoId}
          canales={canales}
          onActualizar={() => {
            cargarCanales();
            cargarMovs();
          }}
          onClose={() => setShowCanalesModal(false)}
          simboloMoneda={taxCfg.simbolo}
          pais={producto.pais ?? 'MX'}
          tasaIva={taxCfg.consumo.tasa}
          locale={taxCfg.locale}
        />
      )}

      {/* ══ MODAL: importar CSV / Excel ══ */}
      {showImport && productoId && (
        <CsvImportModal
          productoId={productoId}
          onClose={() => setShowImport(false)}
          onImported={() => { cargarMovs(); }}
        />
      )}
    </div>
  );
}