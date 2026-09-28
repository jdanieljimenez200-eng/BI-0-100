'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Minus,
  Package,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  X,
  Settings2,
  CheckCircle2,
  DollarSign,
  Filter,
  Download,
} from 'lucide-react';
import api, { hayRespuestaDelServidor, nuevaClaveIdempotencia } from '@/lib/api';
import { getTaxConfig } from '@/lib/taxConfig';
import ProductoGate from '@/components/herramientas/ProductoGate';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import type { ProductoActivo } from '@/lib/productoActivo';
import { modalVariants, backdropVariants } from '@/lib/motion/tokens';
import { Breadcrumbs, SearchInput } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Insumo {
  id: string;
  nombre: string;
  categoria: string | null;
  unidad: string;
  stock_actual: number | string;
  stock_minimo: number | string;
  costo_promedio: number | string;
  proveedor_default: string | null;
  ubicacion: string | null;
  emoji: string | null;
  activo: boolean;
  negocio_id: string | null;
}

interface MovimientoInv {
  id: string;
  insumo_id: string;
  tipo: 'entrada' | 'salida' | 'ajuste' | 'merma';
  cantidad: number | string;
  costo_unitario: number | string;
  costo_total: number | string;
  stock_resultante: number | string;
  fecha: string;
  motivo: string | null;
  proveedor: string | null;
  movimiento_contable_id: string | null;
  insumo?: { nombre: string; unidad: string; emoji: string | null } | null;
}

interface ResumenInv {
  total_insumos: number;
  insumos_bajo_minimo: number;
  insumos_agotados: number;
  valor_total_inventario: number;
}

type ModalOp = null | { tipo: 'entrada' | 'salida' | 'merma' | 'ajuste'; insumo: Insumo };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v: unknown) => Number(v ?? 0);

function fmtMoney(value: number, simbolo: string, locale: string): string {
  return `${simbolo}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

function fmtNum(value: number, decimales = 2): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimales }).format(value);
}

function toTitleCase(raw: string): string {
  return raw.trim().split(/\s+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ');
}

const UNIDADES_COMUNES = ['pieza', 'kg', 'gramo', 'litro', 'ml', 'caja', 'paquete', 'docena', 'metro', 'cm'];
const CATEGORIAS_SUGERIDAS = ['Comidas', 'Bebidas', 'Materia prima', 'Empaques', 'Limpieza', 'Insumos', 'Otros'];

const TIPO_INFO: Record<'entrada' | 'salida' | 'merma' | 'ajuste', { label: string; color: string; bg: string; sign: string }> = {
  entrada: { label: 'Entrada / Compra',     color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30',   sign: '+' },
  salida:  { label: 'Salida / Consumo',     color: 'text-blue-300',    bg: 'bg-blue-500/15 border-blue-500/30',         sign: '−' },
  merma:   { label: 'Merma / Pérdida',      color: 'text-amber-300',   bg: 'bg-amber-500/15 border-amber-500/30',       sign: '−' },
  ajuste:  { label: 'Ajuste de stock',      color: 'text-violet-300',  bg: 'bg-violet-500/15 border-violet-500/30',     sign: '=' },
};

// ─── Page (wrapper con gate) ───────────────────────────────────────────────────

export default function InventarioPage() {
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
    <HerramientaGate herramienta="inventario" nombre="Inventario" acento="amber">
    <ProductoGate herramienta="Inventario" acento="amber">
      {({ producto, cambiarProducto }) => (
        <InventarioInner producto={producto} cambiarProducto={cambiarProducto} />
      )}
    </ProductoGate>
    </HerramientaGate>
  );
}

// ─── Herramienta (con el producto global ya resuelto) ──────────────────────────

function InventarioInner({
  producto,
  cambiarProducto,
}: {
  producto: ProductoActivo;
  cambiarProducto: () => void;
}) {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [movs, setMovs] = useState<MovimientoInv[]>([]);
  const [resumen, setResumen] = useState<ResumenInv>({ total_insumos: 0, insumos_bajo_minimo: 0, insumos_agotados: 0, valor_total_inventario: 0 });
  const [tab, setTab] = useState<'stock' | 'movimientos' | 'catalogo'>('stock');

  // Filtros y búsquedas
  const [searchStock, setSearchStock] = useState('');
  const [filtroStock, setFiltroStock] = useState<'todos' | 'bajo' | 'agotado'>('todos');
  const [selectedCategoria, setSelectedCategoria] = useState<string>('todas');
  const [searchMovimientos, setSearchMovimientos] = useState('');
  const [filtroTipoMov, setFiltroTipoMov] = useState<'todos' | 'entrada' | 'salida' | 'merma' | 'ajuste'>('todos');
  const [searchCatalogo, setSearchCatalogo] = useState('');

  // Modal form de insumo (alta/edición)
  const [showInsumoForm, setShowInsumoForm] = useState(false);
  const [insumoForm, setInsumoForm] = useState<{
    id?: string;
    nombre: string;
    categoria: string;
    unidad: string;
    stock_actual: string;
    stock_minimo: string;
    costo_promedio: string;
    proveedor_default: string;
    ubicacion: string;
    emoji: string;
  }>({ nombre: '', categoria: '', unidad: 'pieza', stock_actual: '0', stock_minimo: '0', costo_promedio: '0', proveedor_default: '', ubicacion: '', emoji: '' });

  // Modal de operación (entrada/salida/merma/ajuste)
  const [modalOp, setModalOp] = useState<ModalOp>(null);
  const [opForm, setOpForm] = useState<{ cantidad: string; costo_unitario: string; stock_objetivo: string; motivo: string; proveedor: string; registrar_en_finanzas: boolean; }>({
    cantidad: '', costo_unitario: '', stock_objetivo: '', motivo: '', proveedor: '', registrar_en_finanzas: true,
  });
  const [opEnCurso, setOpEnCurso] = useState(false);
  const claveOp = useRef(nuevaClaveIdempotencia());

  const taxCfg = useMemo(() => getTaxConfig(producto.pais ?? 'MX'), [producto.pais]);
  const negocioId = producto.negocio_id;

  // Insumos + movimientos
  const cargarDatos = useCallback(async () => {
    const qs = negocioId ? `?negocio_id=${negocioId}` : '';
    const [iRes, mRes] = await Promise.all([
      api.get(`/inventario/insumos${qs}`).catch(() => ({ data: { insumos: [], resumen: null } })),
      api.get(`/inventario/movimientos`).catch(() => ({ data: [] })),
    ]);
    setInsumos((iRes.data.insumos || []) as Insumo[]);
    if (iRes.data.resumen) setResumen(iRes.data.resumen);
    setMovs((mRes.data || []) as MovimientoInv[]);
  }, [negocioId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const categoriasExistentes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of insumos) {
      const raw = (i.categoria ?? '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, toTitleCase(raw));
    }
    return Array.from(seen.values()).sort();
  }, [insumos]);

  const categoriasPicker = useMemo(() => {
    const exist = new Set(categoriasExistentes.map((c) => c.toLowerCase()));
    return [...categoriasExistentes, ...CATEGORIAS_SUGERIDAS.filter((s) => !exist.has(s.toLowerCase()))];
  }, [categoriasExistentes]);

  // ── CRUD insumos ────────────────────────────────────────────────────────
  const guardarInsumo = useCallback(async () => {
    if (!insumoForm.nombre.trim()) return;
    const rawCat = insumoForm.categoria.trim();
    let categoriaFinal: string | undefined = undefined;
    if (rawCat) {
      const existente = categoriasExistentes.find((c) => c.toLowerCase() === rawCat.toLowerCase());
      categoriaFinal = existente ?? toTitleCase(rawCat);
    }

    const payload = {
      nombre: insumoForm.nombre.trim(),
      categoria: categoriaFinal,
      unidad: insumoForm.unidad.trim() || 'pieza',
      stock_actual: insumoForm.id ? undefined : Number(insumoForm.stock_actual) || 0,
      stock_minimo: Number(insumoForm.stock_minimo) || 0,
      costo_promedio: insumoForm.id ? undefined : Number(insumoForm.costo_promedio) || 0,
      proveedor_default: insumoForm.proveedor_default.trim() || undefined,
      ubicacion: insumoForm.ubicacion.trim() || undefined,
      emoji: insumoForm.emoji || undefined,
      negocio_id: negocioId,
    };

    if (insumoForm.id) {
      const { data } = await api.patch(`/inventario/insumos/${insumoForm.id}`, payload);
      setInsumos((prev) => prev.map((i) => (i.id === insumoForm.id ? (data as Insumo) : i)));
    } else {
      const { data } = await api.post(`/inventario/insumos`, payload);
      setInsumos((prev) => [...prev, data as Insumo]);
    }
    setShowInsumoForm(false);
    setInsumoForm({ nombre: '', categoria: '', unidad: 'pieza', stock_actual: '0', stock_minimo: '0', costo_promedio: '0', proveedor_default: '', ubicacion: '', emoji: '' });
    cargarDatos();
  }, [insumoForm, categoriasExistentes, negocioId, cargarDatos]);

  const editarInsumo = useCallback((i: Insumo) => {
    setInsumoForm({
      id: i.id,
      nombre: i.nombre,
      categoria: i.categoria ?? '',
      unidad: i.unidad,
      stock_actual: String(n(i.stock_actual)),
      stock_minimo: String(n(i.stock_minimo)),
      costo_promedio: String(n(i.costo_promedio)),
      proveedor_default: i.proveedor_default ?? '',
      ubicacion: i.ubicacion ?? '',
      emoji: i.emoji ?? '',
    });
    setShowInsumoForm(true);
  }, []);

  const eliminarInsumo = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este insumo? Si tiene movimientos se archivará para conservar su historial, y saldrá de las recetas.')) return;
    try {
      const { data } = await api.delete(`/inventario/insumos/${id}`);
      // Con movimientos el servidor no lo borra: lo archiva. Desaparece de la
      // lista igual que uno borrado, así que sin decirlo el usuario cree que
      // se perdió su historial.
      if (data?.archivado) {
        alert(data.mensaje ?? 'El insumo tiene movimientos: se archivó y su historial se conserva.');
      }
      setInsumos((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      // Antes el error se tragaba y la fila desaparecía igual, hasta que la
      // recarga la devolvía a su sitio sin explicación.
      const ax = err as { response?: { data?: { error?: string } } };
      alert(`No se pudo eliminar: ${ax.response?.data?.error ?? 'inténtalo de nuevo.'}`);
    }
    cargarDatos();
  }, [cargarDatos]);

  // ── Operaciones (entrada/salida/merma/ajuste) ──────────────────────────
  const abrirOp = useCallback((tipo: 'entrada' | 'salida' | 'merma' | 'ajuste', insumo: Insumo) => {
    setOpForm({ cantidad: '', costo_unitario: String(n(insumo.costo_promedio) || ''), stock_objetivo: String(n(insumo.stock_actual)), motivo: '', proveedor: insumo.proveedor_default ?? '', registrar_en_finanzas: true });
    setModalOp({ tipo, insumo });
  }, []);

  const ejecutarOp = useCallback(async () => {
    if (!modalOp) return;

    // ── Validación de entrada antes de tocar el servidor ──
    const stockActual = n(modalOp.insumo.stock_actual);
    let cantidadNum = 0;
    let objetivoNum = 0;
    if (modalOp.tipo === 'ajuste') {
      objetivoNum = Number(opForm.stock_objetivo);
      if (!Number.isFinite(objetivoNum) || objetivoNum < 0) {
        alert('El stock objetivo debe ser un número válido mayor o igual a 0.');
        return;
      }
    } else {
      cantidadNum = Number(opForm.cantidad);
      if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
        alert('La cantidad debe ser un número mayor que 0.');
        return;
      }
      if ((modalOp.tipo === 'salida' || modalOp.tipo === 'merma') && cantidadNum > stockActual) {
        alert(`No puedes ${modalOp.tipo === 'merma' ? 'registrar una merma' : 'sacar'} más de lo disponible en stock (${fmtNum(stockActual, 3)} ${modalOp.insumo.unidad}).`);
        return;
      }
    }

    let costoNum = 0;
    if (modalOp.tipo === 'entrada') {
      costoNum = Number(opForm.costo_unitario);
      if (!Number.isFinite(costoNum) || costoNum < 0) {
        alert('El costo unitario debe ser un número válido mayor o igual a 0.');
        return;
      }
    }

    setOpEnCurso(true);
    try {
      const body: Record<string, unknown> = {
        insumo_id: modalOp.insumo.id,
        tipo: modalOp.tipo,
        motivo: opForm.motivo || undefined,
        producto_id: producto.id,
        registrar_en_finanzas: opForm.registrar_en_finanzas,
      };
      if (modalOp.tipo === 'ajuste') {
        body.stock_objetivo = objetivoNum;
      } else {
        body.cantidad = cantidadNum;
        if (modalOp.tipo === 'entrada') {
          body.costo_unitario = costoNum;
          body.proveedor = opForm.proveedor || undefined;
        }
      }
      // Una compra genera un egreso: la clave evita que un doble clic o un
      // reintento tras un corte de red la registre dos veces.
      await api.post(`/inventario/movimientos`, body, { headers: { 'Idempotency-Key': claveOp.current } });
      claveOp.current = nuevaClaveIdempotencia();
      await cargarDatos();
      setModalOp(null);
    } catch (err: unknown) {
      if (hayRespuestaDelServidor(err)) claveOp.current = nuevaClaveIdempotencia();
      const ax = err as { response?: { data?: { error?: string } } };
      alert(`Error: ${ax.response?.data?.error ?? (err instanceof Error ? err.message : 'No se pudo aplicar el movimiento')}`);
    } finally {
      setOpEnCurso(false);
    }
  }, [modalOp, opForm, producto.id, cargarDatos]);

  // Insumos filtrados para pestaña Stock
  const insumosFiltrados = useMemo(() => {
    return insumos.filter((i) => {
      const stock = n(i.stock_actual);
      const minimo = n(i.stock_minimo);
      if (filtroStock === 'agotado' && stock > 0) return false;
      if (filtroStock === 'bajo' && (stock <= 0 || minimo <= 0 || stock >= minimo)) return false;
      if (selectedCategoria !== 'todas' && i.categoria?.toLowerCase() !== selectedCategoria.toLowerCase()) return false;
      const query = searchStock.toLowerCase().trim();
      if (!query) return true;
      return (
        i.nombre.toLowerCase().includes(query) ||
        (i.categoria && i.categoria.toLowerCase().includes(query)) ||
        (i.proveedor_default && i.proveedor_default.toLowerCase().includes(query)) ||
        (i.ubicacion && i.ubicacion.toLowerCase().includes(query))
      );
    });
  }, [insumos, filtroStock, selectedCategoria, searchStock]);

  const countsStock = useMemo(() => {
    let bajo = 0;
    let agotado = 0;
    for (const i of insumos) {
      const s = n(i.stock_actual);
      const m = n(i.stock_minimo);
      if (s <= 0) agotado++;
      else if (m > 0 && s < m) bajo++;
    }
    return { todos: insumos.length, bajo, agotado };
  }, [insumos]);

  const exportarCsvInventario = useCallback(() => {
    if (insumos.length === 0) return;
    const headers = ['Insumo', 'Categoría', 'Stock Actual', 'Unidad', 'Stock Mínimo', 'Costo Promedio', 'Valor Total', 'Proveedor Default', 'Ubicación'];
    const rows = insumosFiltrados.map(i => {
      const stock = n(i.stock_actual);
      const cpp = n(i.costo_promedio);
      return [
        `"${(i.nombre || '').replace(/"/g, '""')}"`,
        `"${(i.categoria || '').replace(/"/g, '""')}"`,
        stock,
        `"${i.unidad || ''}"`,
        n(i.stock_minimo),
        cpp,
        (stock * cpp).toFixed(2),
        `"${(i.proveedor_default || '').replace(/"/g, '""')}"`,
        `"${(i.ubicacion || '').replace(/"/g, '""')}"`,
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_${producto.nombre.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [insumos, insumosFiltrados, producto.nombre]);

  // Insumos filtrados para pestaña Catálogo
  const insumosCatalogoFiltrados = useMemo(() => {
    const query = searchCatalogo.toLowerCase().trim();
    if (!query) return insumos;
    return insumos.filter(
      (i) =>
        i.nombre.toLowerCase().includes(query) ||
        (i.categoria && i.categoria.toLowerCase().includes(query)) ||
        (i.proveedor_default && i.proveedor_default.toLowerCase().includes(query))
    );
  }, [insumos, searchCatalogo]);

  // Movimientos filtrados
  const movimientosFiltrados = useMemo(() => {
    return movs.filter((m) => {
      if (!insumos.some((i) => i.id === m.insumo_id)) return false;
      if (filtroTipoMov !== 'todos' && m.tipo !== filtroTipoMov) return false;
      const query = searchMovimientos.toLowerCase().trim();
      if (!query) return true;
      const insumo = insumos.find((i) => i.id === m.insumo_id);
      return (
        (insumo && insumo.nombre.toLowerCase().includes(query)) ||
        (m.motivo && m.motivo.toLowerCase().includes(query)) ||
        (m.proveedor && m.proveedor.toLowerCase().includes(query))
      );
    });
  }, [movs, insumos, filtroTipoMov, searchMovimientos]);

  return (
    <div className="relative px-4 sm:px-6 py-10 max-w-6xl mx-auto pb-24">
      {/* Ambient glows */}
      <div className="fixed top-[-10%] right-[-8%] w-[45vh] h-[45vh] bg-amber-500/8 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-12%] left-[-10%] w-[35vh] h-[35vh] bg-rose-500/5 rounded-full blur-[110px] pointer-events-none" />

      {/* Breadcrumb */}
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Herramientas', href: '/dashboard/herramientas' },
          { label: 'Inventario & Stock' },
        ]}
        className="mb-6"
      />

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Inventario & Materia Prima</h1>
          <p className="text-sm text-white/50 mt-1">Stock en tiempo real, alertas de mínimos y compras que se convierten en egresos automáticamente.</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3 min-w-[280px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-1.5">Asociado a:</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-white text-sm font-semibold truncate">{producto.nombre} · {producto.pais}</p>
            <button
              onClick={cambiarProducto}
              className="flex-shrink-0 text-[11px] font-semibold text-amber-300 border border-amber-500/30 rounded-lg px-2.5 py-1 hover:bg-amber-500/10 transition-colors"
            >
              Cambiar
            </button>
          </div>
          <p className="text-[11px] text-amber-400/90 mt-1.5">
            {taxCfg.nombre} · {taxCfg.moneda} · compras → Finanzas
          </p>
        </div>
      </div>

      {/* Resumen KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Insumos', value: resumen.total_insumos, color: 'text-white', sub: 'en catálogo', icon: Package },
          { label: 'Bajo Mínimo', value: resumen.insumos_bajo_minimo, color: resumen.insumos_bajo_minimo > 0 ? 'text-amber-300' : 'text-white/40', sub: 'requiere compra', icon: AlertTriangle },
          { label: 'Agotados', value: resumen.insumos_agotados, color: resumen.insumos_agotados > 0 ? 'text-red-400' : 'text-white/40', sub: 'sin existencia', icon: AlertCircle },
          { label: 'Valor Inventario', value: fmtMoney(resumen.valor_total_inventario, taxCfg.simbolo, taxCfg.locale), color: 'text-emerald-300', sub: 'valuación al costo', icon: TrendingUp },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-white/10 bg-[#0F1C2A] p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/40 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">{k.label}</span>
                <Icon className="w-4 h-4 text-white/30" />
              </div>
              <p className={`text-2xl font-extrabold ${k.color} font-mono tabular-nums leading-tight my-1`}>{k.value}</p>
              {k.sub && <p className="text-[10px] text-white/40">{k.sub}</p>}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/8">
        {[
          { key: 'stock', label: `Stock (${insumos.length})`, icon: Package },
          { key: 'movimientos', label: `Movimientos (${movimientosFiltrados.length})`, icon: RefreshCw },
          { key: 'catalogo', label: `Catálogo Insumos (${insumos.length})`, icon: Settings2 },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`text-sm px-4 py-3 font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2 ${
                active ? 'text-amber-300 border-amber-400' : 'text-white/40 border-transparent hover:text-white/70'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ══ TAB: STOCK ══ */}
      {tab === 'stock' && (
        <div className="space-y-4">
          {/* Controls: Search + Status filters + Category filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <SearchInput
                value={searchStock}
                onChange={setSearchStock}
                placeholder="Buscar insumo por nombre, proveedor o ubicación..."
                shortcutKey="f"
              />
            </div>

            {/* Status filters & Actions */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              {(['todos', 'bajo', 'agotado'] as const).map((st) => {
                const label = st === 'todos' ? 'Todos' : st === 'bajo' ? 'Bajo Mínimo' : 'Agotados';
                const count = st === 'todos' ? countsStock.todos : st === 'bajo' ? countsStock.bajo : countsStock.agotado;
                return (
                  <button
                    key={st}
                    onClick={() => setFiltroStock(st)}
                    className={`px-3 py-2 rounded-xl border font-medium transition-all capitalize whitespace-nowrap flex items-center gap-1.5 ${
                      filtroStock === st
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      filtroStock === st ? 'bg-amber-500/40 text-amber-100' : 'bg-white/10 text-white/40'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}

              <button
                onClick={exportarCsvInventario}
                disabled={insumosFiltrados.length === 0}
                className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                title="Exportar inventario filtrado a archivo CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          {/* Category Pills */}
          {categoriasExistentes.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedCategoria('todas')}
                className={`px-3 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                  selectedCategoria === 'todas'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                }`}
              >
                Todas las categorías
              </button>
              {categoriasExistentes.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategoria(cat)}
                  className={`px-3 py-1 rounded-lg border text-[11px] font-medium transition-all whitespace-nowrap ${
                    selectedCategoria.toLowerCase() === cat.toLowerCase()
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Insumos List */}
          {insumosFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center bg-white/[0.02]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Package className="w-6 h-6" />
              </div>
              <p className="text-white/60 text-sm font-semibold mb-1">
                {searchStock || filtroStock !== 'todos' || selectedCategoria !== 'todas'
                  ? 'No se encontraron insumos con los filtros actuales'
                  : 'Sin insumos registrados'}
              </p>
              <p className="text-white/40 text-xs mb-4">
                {searchStock || filtroStock !== 'todos' || selectedCategoria !== 'todas'
                  ? 'Intenta restablecer los filtros para ver todos los artículos.'
                  : 'Ve a la pestaña "Catálogo Insumos" para dar de alta tu primer artículo.'}
              </p>
              {searchStock || filtroStock !== 'todos' || selectedCategoria !== 'todas' ? (
                <button
                  onClick={() => { setSearchStock(''); setFiltroStock('todos'); setSelectedCategoria('todas'); }}
                  className="text-xs font-semibold text-amber-300 border border-amber-500/30 px-3.5 py-1.5 rounded-lg hover:bg-amber-500/10"
                >
                  Restablecer filtros
                </button>
              ) : (
                <button
                  onClick={() => setTab('catalogo')}
                  className="text-xs font-bold border border-amber-500/40 text-amber-300 px-4 py-2 rounded-lg hover:bg-amber-500/10"
                >
                  Ir al catálogo →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {insumosFiltrados.map((i) => {
                const stock = n(i.stock_actual);
                const minimo = n(i.stock_minimo);
                const cpp = n(i.costo_promedio);
                const valor = stock * cpp;
                const estado: 'agotado' | 'bajo' | 'ok' = stock <= 0 ? 'agotado' : (minimo > 0 && stock < minimo ? 'bajo' : 'ok');

                return (
                  <div
                    key={i.id}
                    className={`rounded-2xl border bg-[#0F1C2A] p-4 transition-colors ${
                      estado === 'agotado'
                        ? 'border-red-500/30 hover:border-red-500/50'
                        : estado === 'bajo'
                          ? 'border-amber-500/30 hover:border-amber-500/50'
                          : 'border-white/8 hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 text-xs font-mono font-bold">
                        {i.emoji ? i.emoji : <Package className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="font-semibold text-white text-sm">{i.nombre}</p>
                          {i.categoria && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-white/60 border border-white/10">
                              {i.categoria}
                            </span>
                          )}
                          {estado === 'agotado' && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                              Agotado
                            </span>
                          )}
                          {estado === 'bajo' && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Bajo mínimo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/40">
                          {i.ubicacion ? `${i.ubicacion} · ` : ''}
                          Mínimo: {fmtNum(minimo, 3)} {i.unidad} · Costo prom: {fmtMoney(cpp, taxCfg.simbolo, taxCfg.locale)}
                          {i.proveedor_default && ` · Prov: ${i.proveedor_default}`}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className={`text-2xl font-extrabold tabular-nums leading-none ${
                          estado === 'agotado' ? 'text-red-300' : estado === 'bajo' ? 'text-amber-300' : 'text-white'
                        }`}>
                          {fmtNum(stock, 3)}
                        </p>
                        <p className="text-[10px] text-white/40">{i.unidad}</p>
                        <p className="text-[10px] text-emerald-400/80 mt-0.5 font-mono">
                          {fmtMoney(valor, taxCfg.simbolo, taxCfg.locale)}
                        </p>
                      </div>

                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => abrirOp('entrada', i)}
                          className="text-xs font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
                          title="Compra / Entrada de stock (genera egreso opcional)"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Reabastecer
                        </button>
                        <button
                          onClick={() => abrirOp('salida', i)}
                          disabled={stock <= 0}
                          className="text-xs font-semibold border border-blue-500/40 bg-blue-500/10 text-blue-300 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Salida / Consumo operativo"
                        >
                          Salida
                        </button>
                        <button
                          onClick={() => abrirOp('merma', i)}
                          disabled={stock <= 0}
                          className="text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-300 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Merma / Daño"
                        >
                          Merma
                        </button>
                        <button
                          onClick={() => abrirOp('ajuste', i)}
                          className="text-xs font-semibold border border-violet-500/40 bg-violet-500/10 text-violet-300 px-2.5 py-1.5 rounded-lg hover:bg-violet-500/20 transition-colors"
                          title="Ajuste de inventario físico"
                        >
                          Ajuste
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: MOVIMIENTOS ══ */}
      {tab === 'movimientos' && (
        <div className="space-y-4">
          {/* Controls: Search + Type Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <SearchInput
                value={searchMovimientos}
                onChange={setSearchMovimientos}
                placeholder="Buscar por insumo, motivo o proveedor..."
                shortcutKey="f"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {(['todos', 'entrada', 'salida', 'merma', 'ajuste'] as const).map((tp) => (
                <button
                  key={tp}
                  onClick={() => setFiltroTipoMov(tp)}
                  className={`px-3 py-2 rounded-xl border font-medium transition-all capitalize whitespace-nowrap ${
                    filtroTipoMov === tp
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                  }`}
                >
                  {tp === 'todos' ? 'Todos los tipos' : tp}
                </button>
              ))}
            </div>
          </div>

          {movimientosFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center bg-white/[0.02]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <RefreshCw className="w-6 h-6" />
              </div>
              <p className="text-white/60 text-sm font-semibold">Sin movimientos registrados</p>
              <p className="text-white/40 text-xs mt-1">Registra entradas, salidas o ajustes desde la pestaña Stock.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {movimientosFiltrados.map((m) => {
                const info = TIPO_INFO[m.tipo];
                const insumo = insumos.find((i) => i.id === m.insumo_id);
                return (
                  <div key={m.id} className="rounded-xl border border-white/8 bg-[#0F1C2A] p-3 flex items-center gap-3 flex-wrap hover:border-white/15 transition-colors">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border font-semibold ${info.bg} ${info.color}`}>
                      {info.sign} {info.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-semibold truncate flex items-center gap-2">
                        <span className="w-4 h-4 inline-flex items-center justify-center text-amber-400 shrink-0 text-xs font-mono">
                          {insumo?.emoji ? insumo.emoji : <Package className="w-3.5 h-3.5" />}
                        </span>
                        <span>{insumo?.nombre ?? 'Insumo eliminado'}</span>
                      </p>
                      <p className="text-[11px] text-white/40 font-mono tabular-nums">
                        {m.fecha} · {fmtNum(n(m.cantidad), 3)} {insumo?.unidad ?? 'u'} · Stock final: {fmtNum(n(m.stock_resultante), 3)}
                        {m.motivo && ` · "${m.motivo}"`}
                        {m.proveedor && ` · Prov: ${m.proveedor}`}
                      </p>
                    </div>
                    <div className="text-right">
                      {n(m.costo_total) > 0 && (
                        <p className="text-sm font-bold text-emerald-300 font-mono tabular-nums">
                          {fmtMoney(n(m.costo_total), taxCfg.simbolo, taxCfg.locale)}
                        </p>
                      )}
                      {m.movimiento_contable_id && (
                        <p className="text-[10px] text-emerald-400/80 flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Sincronizado en Finanzas</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: CATÁLOGO ══ */}
      {tab === 'catalogo' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="w-full sm:max-w-sm">
              <SearchInput
                value={searchCatalogo}
                onChange={setSearchCatalogo}
                placeholder="Buscar insumo por nombre o categoría..."
                shortcutKey="f"
              />
            </div>
            <button
              onClick={() => {
                setInsumoForm({
                  nombre: '',
                  categoria: '',
                  unidad: 'pieza',
                  stock_actual: '0',
                  stock_minimo: '0',
                  costo_promedio: '0',
                  proveedor_default: '',
                  ubicacion: '',
                  emoji: '',
                });
                setShowInsumoForm(true);
              }}
              className="text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-2 rounded-xl hover:bg-amber-500/20 transition flex items-center justify-center gap-1.5 shadow-[0_2px_12px_rgba(245,158,11,0.15)]"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo Insumo
            </button>
          </div>

          {insumosCatalogoFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center bg-white/[0.02]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Settings2 className="w-6 h-6" />
              </div>
              <p className="text-white/60 text-sm font-semibold">No se encontraron insumos</p>
              <p className="text-white/40 text-xs mt-1">Empieza agregando tu primer insumo o materia prima.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {insumosCatalogoFiltrados.map((i) => (
                <div key={i.id} className="rounded-2xl border border-white/8 bg-[#0F1C2A] p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 text-xs font-mono font-bold">
                        {i.emoji ? i.emoji : <Package className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{i.nombre}</p>
                        {i.categoria && <p className="text-[10px] text-white/40 uppercase tracking-wider">{i.categoria}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div><p className="text-white/40 text-[10px] uppercase">Unidad</p><p className="text-white">{i.unidad}</p></div>
                      <div><p className="text-white/40 text-[10px] uppercase">Mínimo</p><p className="text-white">{fmtNum(n(i.stock_minimo), 3)}</p></div>
                      <div><p className="text-white/40 text-[10px] uppercase">Costo prom.</p><p className="text-emerald-300">{fmtMoney(n(i.costo_promedio), taxCfg.simbolo, taxCfg.locale)}</p></div>
                      <div><p className="text-white/40 text-[10px] uppercase">Stock actual</p><p className="text-white font-bold">{fmtNum(n(i.stock_actual), 3)}</p></div>
                    </div>
                  </div>
                  <div className="flex gap-1 justify-end pt-2 border-t border-white/5">
                    <button onClick={() => editarInsumo(i)} className="text-xs text-white/60 hover:text-white px-2.5 py-1 rounded hover:bg-white/5 transition-colors">Editar</button>
                    <button onClick={() => eliminarInsumo(i.id)} className="text-xs text-red-400/80 hover:text-red-300 px-2.5 py-1 rounded hover:bg-red-500/10 transition-colors">Borrar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* ══ MODAL: form de insumo ══ */}
      <AnimatePresence>
        {showInsumoForm && (
          <motion.div variants={backdropVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowInsumoForm(false)}>
            <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" onClick={(e) => e.stopPropagation()} className="bg-[#0F1C2A] border border-white/15 rounded-3xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">{insumoForm.id ? 'Editar insumo' : 'Nuevo insumo'}</h3>

              <div className="space-y-3">
                <div className="grid grid-cols-[80px_1fr] gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Ref / Código</label>
                    <input type="text" maxLength={6} value={insumoForm.emoji} onChange={(e) => setInsumoForm({ ...insumoForm, emoji: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-center text-sm font-mono focus:border-amber-500/50 outline-none" placeholder="A-01" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Nombre *</label>
                    <input type="text" value={insumoForm.nombre} onChange={(e) => setInsumoForm({ ...insumoForm, nombre: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" placeholder="Carne molida res 80/20" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/40">Categoría</label>
                  <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                    {categoriasPicker.map((cat) => {
                      const sel = insumoForm.categoria.trim().toLowerCase() === cat.toLowerCase();
                      const exist = categoriasExistentes.some((c) => c.toLowerCase() === cat.toLowerCase());
                      return (
                        <button key={cat} type="button" onClick={() => setInsumoForm({ ...insumoForm, categoria: cat })} className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${sel ? 'border-amber-400/60 bg-amber-500/20 text-amber-200 font-semibold' : exist ? 'border-white/15 bg-white/5 text-white/70 hover:border-amber-500/40' : 'border-dashed border-white/15 text-white/40 hover:border-amber-500/40 hover:text-white/70'}`}>
                          {!exist && '+ '}{cat}
                        </button>
                      );
                    })}
                  </div>
                  <input type="text" value={insumoForm.categoria} onChange={(e) => setInsumoForm({ ...insumoForm, categoria: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" placeholder="O escribe nueva" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Unidad *</label>
                    <input type="text" value={insumoForm.unidad} onChange={(e) => setInsumoForm({ ...insumoForm, unidad: e.target.value })} list="unidades-list" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" placeholder="kg" />
                    <datalist id="unidades-list">{UNIDADES_COMUNES.map((u) => <option key={u} value={u} />)}</datalist>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Stock mínimo</label>
                    <input type="number" min="0" step="0.001" value={insumoForm.stock_minimo} onChange={(e) => setInsumoForm({ ...insumoForm, stock_minimo: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
                  </div>
                </div>

                {!insumoForm.id && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/40">Stock inicial</label>
                      <input type="number" min="0" step="0.001" value={insumoForm.stock_actual} onChange={(e) => setInsumoForm({ ...insumoForm, stock_actual: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/40">Costo unit. inicial ({taxCfg.simbolo})</label>
                      <input type="number" min="0" step="0.01" value={insumoForm.costo_promedio} onChange={(e) => setInsumoForm({ ...insumoForm, costo_promedio: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
                    </div>
                    <p className="col-span-2 text-[10px] text-white/40">Stock y costo inicial no generan egreso en Finanzas. Para compras posteriores usa el botón "+ Compra".</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Proveedor</label>
                    <input type="text" value={insumoForm.proveedor_default} onChange={(e) => setInsumoForm({ ...insumoForm, proveedor_default: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" placeholder="Costco" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Ubicación</label>
                    <input type="text" value={insumoForm.ubicacion} onChange={(e) => setInsumoForm({ ...insumoForm, ubicacion: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" placeholder="Bodega A" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowInsumoForm(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-sm font-semibold hover:bg-white/5">Cancelar</button>
                <button onClick={guardarInsumo} disabled={!insumoForm.nombre.trim()} className="flex-1 py-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white font-bold text-sm disabled:opacity-40">
                  {insumoForm.id ? 'Guardar cambios' : 'Crear insumo'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ MODAL: operación (entrada/salida/merma/ajuste) ══ */}
      <AnimatePresence>
        {modalOp && (
          <motion.div variants={backdropVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={() => !opEnCurso && setModalOp(null)}>
            <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" onClick={(e) => e.stopPropagation()} className="bg-[#0F1C2A] border border-white/15 rounded-3xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-white">{TIPO_INFO[modalOp.tipo].label}</h3>
                <span className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400">
                  {modalOp.insumo.emoji ? (
                    <span className="text-xs font-mono">{modalOp.insumo.emoji}</span>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  )}
                </span>
              </div>
              <p className="text-sm text-white/60 mb-1">{modalOp.insumo.nombre}</p>
              <p className="text-xs text-white/40 mb-5">Stock actual: <span className="text-white font-semibold">{fmtNum(n(modalOp.insumo.stock_actual), 3)} {modalOp.insumo.unidad}</span> · Costo prom: {fmtMoney(n(modalOp.insumo.costo_promedio), taxCfg.simbolo, taxCfg.locale)}</p>

              <div className="space-y-3">
                {modalOp.tipo === 'ajuste' ? (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Stock objetivo ({modalOp.insumo.unidad}) *</label>
                    <input type="number" min="0" step="0.001" value={opForm.stock_objetivo} onChange={(e) => setOpForm({ ...opForm, stock_objetivo: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:border-violet-500/50 outline-none font-bold" autoFocus />
                    <p className="text-[10px] text-white/40 mt-1">Esto fija el stock al número exacto. Útil después de un inventario físico.</p>
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">Cantidad ({modalOp.insumo.unidad}) *</label>
                    <input type="number" min="0.001" step="0.001" value={opForm.cantidad} onChange={(e) => setOpForm({ ...opForm, cantidad: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:border-amber-500/50 outline-none font-bold" autoFocus placeholder="0" />
                  </div>
                )}

                {modalOp.tipo === 'entrada' && (
                  <>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/40">Costo unitario ({taxCfg.simbolo}) *</label>
                      <input type="number" min="0" step="0.01" value={opForm.costo_unitario} onChange={(e) => setOpForm({ ...opForm, costo_unitario: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none" />
                      <p className="text-[10px] text-white/40 mt-1">Recalcula el costo promedio ponderado del insumo.</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/40">Proveedor</label>
                      <input type="text" value={opForm.proveedor} onChange={(e) => setOpForm({ ...opForm, proveedor: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none" placeholder="Costco" />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer pt-1">
                      <input type="checkbox" checked={opForm.registrar_en_finanzas} onChange={(e) => setOpForm({ ...opForm, registrar_en_finanzas: e.target.checked })} className="accent-emerald-500" />
                      Registrar como egreso en Finanzas
                    </label>
                  </>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/40">Motivo / Nota</label>
                  <input type="text" value={opForm.motivo} onChange={(e) => setOpForm({ ...opForm, motivo: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" placeholder={modalOp.tipo === 'merma' ? 'Caducó, accidente, robo…' : modalOp.tipo === 'salida' ? 'Consumo del lunes, venta directa…' : 'Conteo físico'} />
                </div>

                {modalOp.tipo === 'entrada' && opForm.cantidad && opForm.costo_unitario && (
                  <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3 text-xs">
                    <div className="flex justify-between text-white/70"><span>Total compra:</span><span className="font-bold text-emerald-300">{fmtMoney(Number(opForm.cantidad) * Number(opForm.costo_unitario), taxCfg.simbolo, taxCfg.locale)}</span></div>
                    <div className="flex justify-between text-white/50 mt-1"><span>Stock final:</span><span>{fmtNum(n(modalOp.insumo.stock_actual) + Number(opForm.cantidad), 3)} {modalOp.insumo.unidad}</span></div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setModalOp(null)} disabled={opEnCurso} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-semibold hover:bg-white/5 disabled:opacity-50">Cancelar</button>
                <button onClick={ejecutarOp} disabled={opEnCurso} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white font-bold text-sm disabled:opacity-50">
                  {opEnCurso ? 'Aplicando…' : `Aplicar ${TIPO_INFO[modalOp.tipo].label.split(' ')[0].toLowerCase()}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}