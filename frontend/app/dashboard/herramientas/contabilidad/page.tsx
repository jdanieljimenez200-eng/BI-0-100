'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
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
} from 'lucide-react';
import api from '@/lib/api';
import { getTaxConfig, comprobanteNombre } from '@/lib/taxConfig';
import ProductoGate from '@/components/herramientas/ProductoGate';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import type { ProductoActivo } from '@/lib/productoActivo';
import CsvImportModal from '../../finanzas/[productoId]/resultado/[analisisId]/CsvImportModal';
import ReportesPanel from './reportes/ReportesPanel';

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
  fuente: 'manual' | 'csv_import' | 'pos' | 'inventario' | 'nomina' | 'cotizacion';
  batch_id: string | null;
}

type TabKey = 'reportes' | 'movimientos' | 'calibracion' | 'fiscal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v: unknown) => Number(v ?? 0);

function fmtMoney(value: number, simbolo: string, locale: string): string {
  return `${simbolo}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const pct = (tasa: number, decimales = 0) => `${(tasa * 100).toFixed(decimales)}%`;
const r2 = (v: number) => Math.round(v * 100) / 100;

// Categorías bloqueadas en freemium (espejo de GATED_CATS_FREEMIUM en el backend)
const GATED_CATS_FREEMIUM = ['Gasolina', 'Insumos', 'Materiales'];
const CATEGORIAS_SUGERIDAS = ['Ventas', 'Servicios', 'Renta', 'Sueldos', 'Gasolina', 'Insumos', 'Materiales', 'Marketing', 'Impuestos', 'Otros'];

const FUENTE_INFO: Record<Movimiento['fuente'], { label: string; color: string; badge: string }> = {
  manual:      { label: 'Manual',      color: 'text-white/60', badge: 'bg-white/5 border-white/10 text-white/60' },
  csv_import:  { label: 'CSV / Excel', color: 'text-sky-300', badge: 'bg-sky-500/10 border-sky-500/30 text-sky-300' },
  pos:         { label: 'POS Venta',   color: 'text-violet-300', badge: 'bg-violet-500/10 border-violet-500/30 text-violet-300' },
  inventario:  { label: 'Inventario',  color: 'text-amber-300', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
  nomina:      { label: 'Nómina',      color: 'text-rose-300', badge: 'bg-rose-500/10 border-rose-500/30 text-rose-300' },
  cotizacion:  { label: 'Cotización',  color: 'text-teal-300', badge: 'bg-teal-500/10 border-teal-500/30 text-teal-300' },
};

// Calibración ligera en cliente — mismo criterio que calibracionService (ignora auto-generados)
interface CalibracionLite {
  ingresoPromedio: number;
  egresoPromedio: number;
  mesesAnalizados: number;
  confianza: 'alta' | 'media' | 'baja';
  rango: { desde: string; hasta: string } | null;
}

function calibrar(movs: Movimiento[]): CalibracionLite {
  const byMonth: Record<string, { ingresos: number; egresos: number }> = {};
  for (const m of movs) {
    if (m.es_auto_generado) continue;
    const month = String(m.fecha).substring(0, 7);
    if (!byMonth[month]) byMonth[month] = { ingresos: 0, egresos: 0 };
    if (m.tipo === 'ingreso') byMonth[month].ingresos += n(m.monto);
    else byMonth[month].egresos += n(m.monto);
  }
  const months = Object.keys(byMonth).sort();
  const cnt = months.length;
  if (cnt === 0) {
    return { ingresoPromedio: 0, egresoPromedio: 0, mesesAnalizados: 0, confianza: 'baja', rango: null };
  }
  const ingresoPromedio = months.reduce((a, mth) => a + byMonth[mth].ingresos, 0) / cnt;
  const egresoPromedio = months.reduce((a, mth) => a + byMonth[mth].egresos, 0) / cnt;
  return {
    ingresoPromedio: Math.round(ingresoPromedio),
    egresoPromedio: Math.round(egresoPromedio),
    mesesAnalizados: cnt,
    confianza: cnt >= 6 ? 'alta' : cnt >= 3 ? 'media' : 'baja',
    rango: { desde: months[0] + '-01', hasta: months[cnt - 1] + '-01' },
  };
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
    <HerramientaGate herramienta="contabilidad" nombre="Contabilidad" acento="teal">
    <ProductoGate herramienta="Contabilidad" acento="emerald">
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

  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(false);
  const [tab, setTab] = useState<TabKey>('reportes');

  // Modal de alta
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ tipo: 'ingreso' | 'egreso'; descripcion: string; categoria: string; monto: string; fecha: string; tiene_cfdi: boolean }>({
    tipo: 'ingreso', descripcion: '', categoria: '', monto: '', fecha: todayISO(), tiene_cfdi: false,
  });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Import CSV/Excel — reutiliza el mismo modal que Finanzas (POST /contabilidad/:id/import)
  const [showImport, setShowImport] = useState(false);

  // Edición inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ descripcion: string; monto: string }>({ descripcion: '', monto: '' });

  // Inputs de la pestaña Fiscal (cargas laborales)
  const [empleados, setEmpleados] = useState('0');
  const [salarioPromedio, setSalarioPromedio] = useState('');

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'ingreso' | 'egreso'>('todos');
  const [filtroFuente, setFiltroFuente] = useState<'todos' | 'manual' | 'csv_import' | 'pos' | 'inventario' | 'nomina' | 'cotizacion'>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');

  const taxCfg = useMemo(() => getTaxConfig(producto.pais ?? 'MX'), [producto.pais]);
  const comprobante = useMemo(() => comprobanteNombre(taxCfg), [taxCfg]);
  const money = useCallback((v: number) => fmtMoney(v, taxCfg.simbolo, taxCfg.locale), [taxCfg]);
  const periodoActual = useMemo(
    () => new Date().toLocaleDateString(taxCfg.locale, { month: 'long', year: 'numeric' }),
    [taxCfg.locale],
  );

  // Movimientos del producto activo
  const cargarMovs = useCallback(async () => {
    if (!productoId) { setMovs([]); return; }
    setCargando(true);
    try {
      const { data } = await api.get(`/contabilidad/${productoId}`);
      setMovs((data || []) as Movimiento[]);
    } catch {
      setMovs([]);
    } finally {
      setCargando(false);
    }
  }, [productoId]);

  useEffect(() => { cargarMovs(); }, [cargarMovs]);

  // KPIs
  const kpis = useMemo(() => {
    let ingresos = 0, egresos = 0;
    for (const m of movs) {
      if (m.tipo === 'ingreso') ingresos += n(m.monto);
      else egresos += n(m.monto);
    }
    return { ingresos, egresos, balance: ingresos - egresos, total: movs.length };
  }, [movs]);

  const conteoFuentes = useMemo(() => {
    const counts: Record<string, number> = { todos: movs.length, manual: 0, csv_import: 0, pos: 0, inventario: 0, nomina: 0, cotizacion: 0 };
    for (const m of movs) {
      if (counts[m.fuente] !== undefined) counts[m.fuente]++;
    }
    return counts;
  }, [movs]);

  const conteoTipos = useMemo(() => {
    let ingresos = 0;
    let egresos = 0;
    for (const m of movs) {
      if (m.tipo === 'ingreso') ingresos++;
      else egresos++;
    }
    return { todos: movs.length, ingreso: ingresos, egreso: egresos };
  }, [movs]);

  const movsFiltrados = useMemo(() => {
    return movs.filter((m) => {
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (filtroFuente !== 'todos' && m.fuente !== filtroFuente) return false;
      if (filtroCategoria !== 'todas' && m.categoria?.toLowerCase() !== filtroCategoria.toLowerCase()) return false;
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const matchDesc = m.descripcion?.toLowerCase().includes(q);
        const matchCat = m.categoria?.toLowerCase().includes(q);
        const matchMonto = String(m.monto).includes(q);
        const matchFuente = m.fuente?.toLowerCase().includes(q);
        if (!matchDesc && !matchCat && !matchMonto && !matchFuente) return false;
      }
      return true;
    });
  }, [movs, filtroTipo, filtroFuente, filtroCategoria, busqueda]);

  const exportarCSV = useCallback(() => {
    if (movsFiltrados.length === 0) return;
    const headers = ['ID', 'Fecha', 'Tipo', 'Descripcion', 'Categoria', 'Monto', 'Fuente', 'Comprobante_Fiscal', 'Auto_Generado'];
    const rows = movsFiltrados.map((m) => [
      `"${m.id}"`,
      `"${m.fecha}"`,
      `"${m.tipo}"`,
      `"${(m.descripcion || '').replace(/"/g, '""')}"`,
      `"${(m.categoria || '').replace(/"/g, '""')}"`,
      n(m.monto).toFixed(2),
      `"${m.fuente}"`,
      `"${m.tiene_cfdi ? 'Si' : 'No'}"`,
      `"${m.es_auto_generado ? 'Si' : 'No'}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fechaActual = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `movimientos_contables_${(producto.nombre || 'general').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${fechaActual}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [movsFiltrados, producto.nombre]);

  const manualCount = useMemo(() => movs.filter((m) => !m.es_auto_generado).length, [movs]);
  const calibracion = useMemo(() => calibrar(movs), [movs]);

  // Estimado fiscal país-agnóstico derivado de taxConfig (no asume SAT/IVA/RESICO)
  const fiscal = useMemo(() => {
    const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + n(m.monto), 0);
    const egresos = movs.filter((m) => m.tipo === 'egreso' && !m.es_auto_generado).reduce((a, m) => a + n(m.monto), 0);
    const egresosConComprobante = movs
      .filter((m) => m.tipo === 'egreso' && !m.es_auto_generado && m.tiene_cfdi)
      .reduce((a, m) => a + n(m.monto), 0);

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
  }, [movs, taxCfg, empleados, salarioPromedio]);

  const categoriasExistentes = useMemo(() => {
    const set = new Set<string>();
    for (const m of movs) if (m.categoria?.trim()) set.add(m.categoria.trim());
    return Array.from(set).sort();
  }, [movs]);

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
      });
      await cargarMovs();
      setShowForm(false);
      setForm({ tipo: 'ingreso', descripcion: '', categoria: '', monto: '', fecha: todayISO(), tiene_cfdi: false });
    } catch (err: unknown) {
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
  }, [form, productoId, cargarMovs]);

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
    } catch { /* noop */ }
    setEditId(null);
  }, [editForm]);

  const eliminarMovimiento = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este movimiento? También se borran sus movimientos auto-generados (p. ej. impuestos derivados).')) return;
    await api.delete(`/contabilidad/movimiento/${id}`).catch(() => {});
    await cargarMovs();
  }, [cargarMovs]);

  return (
    <div className="relative px-4 sm:px-6 py-10 max-w-6xl mx-auto pb-24">
      {/* Ambient glows */}
      <div className="fixed top-[-10%] right-[-8%] w-[45vh] h-[45vh] bg-emerald-500/8 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-12%] left-[-10%] w-[35vh] h-[35vh] bg-teal-500/5 rounded-full blur-[110px] pointer-events-none" />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link href="/dashboard" className="text-white/40 hover:text-white">Dashboard</Link>
        <span className="text-white/20">›</span>
        <Link href="/dashboard/herramientas" className="text-white/40 hover:text-white">Herramientas</Link>
        <span className="text-white/20">›</span>
        <span className="text-white/80 font-medium">Contabilidad</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Contabilidad</h1>
          <p className="text-sm text-white/50 mt-1">Libro de ingresos y egresos por producto. Los movimientos alimentan la calibración de Finanzas.</p>
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

      {/* Resumen KPIs interactivos */}
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
              <p className={`text-xl sm:text-2xl font-extrabold ${k.color} tabular-nums leading-tight`}>{k.value}</p>
              {k.sub && <p className="text-[10px] text-white/30 mt-1">{k.sub}</p>}
            </button>
          );
        })}
      </div>

      {/* Tabs y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-white/8 pb-2 sm:pb-0">
        <div className="flex gap-2">
          {([
            { key: 'reportes', label: 'Reportes', icon: BarChart3 },
            { key: 'movimientos', label: `Movimientos (${movs.length})`, icon: BookOpen },
            { key: 'calibracion', label: 'Calibración', icon: TrendingUp },
            { key: 'fiscal', label: 'Fiscal', icon: Receipt },
          ] as const).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-sm px-4 py-3 font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2 ${
                  tab === t.key ? 'text-emerald-300 border-emerald-400' : 'text-white/40 border-transparent hover:text-white/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={exportarCSV}
            disabled={movsFiltrados.length === 0}
            title={movsFiltrados.length === 0 ? 'No hay movimientos para exportar' : 'Descargar archivo CSV'}
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
              setForm({ tipo: 'ingreso', descripcion: '', categoria: '', monto: '', fecha: todayISO(), tiene_cfdi: false });
              setShowForm(true);
            }}
            className="text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3.5 py-2 rounded-lg hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Nuevo movimiento</span>
          </button>
        </div>
      </div>

      {/* ══ TAB: MOVIMIENTOS ══ */}
      {tab === 'reportes' && (
        <ReportesPanel
          productoId={productoId}
          productoNombre={producto.nombre || 'Este producto'}
          taxCfg={taxCfg}
        />
      )}

      {tab === 'movimientos' && (
        <div>
          {cargando ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-white/40 text-sm">Cargando movimientos…</div>
          ) : movs.length === 0 ? (
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
              {/* Barra de Búsqueda y Filtros */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar por concepto, categoría, fuente o monto..."
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      className="w-full bg-[#0F1C2A] border border-white/10 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-white/30 focus:border-emerald-500/50 outline-none transition-colors"
                    />
                    {busqueda && (
                      <button
                        onClick={() => setBusqueda('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
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
                  {(['todos', 'manual', 'pos', 'inventario', 'nomina', 'cotizacion', 'csv_import'] as const).map((fKey) => {
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
                          </div>
                        </div>

                        <div className="text-right">
                          {editando ? (
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={editForm.monto}
                              onChange={(e) => setEditForm({ ...editForm, monto: e.target.value })}
                              className="w-28 bg-white/5 border border-emerald-500/40 rounded-lg px-2 py-1 text-sm text-white text-right outline-none"
                            />
                          ) : (
                            <p className={`text-base font-bold tabular-nums ${esIngreso ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {esIngreso ? '+' : '−'}{fmtMoney(n(m.monto), taxCfg.simbolo, taxCfg.locale)}
                            </p>
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
                                onClick={() => iniciarEdicion(m)}
                                disabled={m.es_auto_generado}
                                title={m.es_auto_generado ? 'Los movimientos auto-generados no se editan directamente' : 'Editar concepto o monto'}
                                className="text-xs text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => eliminarMovimiento(m.id)}
                                title="Borrar movimiento"
                                className="text-xs text-white/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
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

          {movs.length === 0 ? (
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
                    <span>Ingresos registrados</span>
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
                    <span>Utilidad estimada (ingresos − egresos)</span>
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
                  <p className="text-[10px] text-white/30 mt-1">Las categorías marcadas con PRO requieren plan Pro.</p>
                </div>

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