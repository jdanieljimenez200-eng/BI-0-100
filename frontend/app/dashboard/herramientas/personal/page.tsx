'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserCheck,
  UserX,
  DollarSign,
  CreditCard,
  Calendar,
  Phone,
  Mail,
  MessageSquare,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  ArrowLeft,
  Edit3,
  Trash2,
  X,
  Share2,
  ToggleLeft,
  ToggleRight,
  Check,
  Building2,
  Briefcase,
  ExternalLink,
  Download,
} from 'lucide-react';
import api, { hayRespuestaDelServidor, nuevaClaveIdempotencia } from '../../../../lib/api';
import CustomSelect from '../../../../components/ui/CustomSelect';
import MotionModal from '@/components/motion/MotionModal';
import ProductoGate from '@/components/herramientas/ProductoGate';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import { ProductoActivo } from '@/lib/productoActivo';
import { getTaxConfig } from '@/lib/taxConfig';
import { enlaceWhatsApp, telefonoWhatsApp } from '@/lib/whatsapp';
import { fechaLocal, hoyLocal } from '@/lib/fechaLocal';
import { Breadcrumbs, SearchInput, Toast } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Empleado {
  id: string;
  nombre: string;
  cargo: string | null;
  salario: number;
  tipo_pago: 'semanal' | 'quincenal' | 'mensual';
  moneda: string;
  telefono: string | null;
  email: string | null;
  fecha_inicio: string | null;
  notas: string | null;
  activo: boolean;
  negocio_id: string | null;
  producto_id: string | null;
}

interface Pago {
  id: string;
  empleado_id: string;
  empleado_nombre: string;
  monto: number;
  moneda: string;
  periodo_inicio: string;
  periodo_fin: string;
  fecha_pago: string;
  notas: string | null;
  movimiento_id: string | null;
  fecha_creacion: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPOS_PAGO = [
  { value: 'semanal',    label: 'Semanal' },
  { value: 'quincenal',  label: 'Quincenal' },
  { value: 'mensual',    label: 'Mensual' },
];
const MONEDAS = ['USD', 'MXN', 'COP', 'PEN', 'ARS', 'CLP', 'BRL', 'EUR'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—';
  try { return new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

// Día local, no UTC: un pago hecho el 30 por la tarde quedaba con fecha del 1
// (y su egreso en el mes siguiente de Contabilidad).
const today = hoyLocal;

function periodoPorTipo(tipo: Empleado['tipo_pago']): { inicio: string; fin: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (tipo === 'mensual') {
    return { inicio: fechaLocal(new Date(y, m, 1)), fin: fechaLocal(new Date(y, m + 1, 0)) };
  }
  if (tipo === 'quincenal') {
    const d = now.getDate();
    if (d <= 15) return { inicio: fechaLocal(new Date(y, m, 1)), fin: fechaLocal(new Date(y, m, 15)) };
    return { inicio: fechaLocal(new Date(y, m, 16)), fin: fechaLocal(new Date(y, m + 1, 0)) };
  }
  // semanal: lunes a domingo
  const day = now.getDay() || 7;
  const lunes = new Date(now); lunes.setDate(now.getDate() - day + 1);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  return { inicio: fechaLocal(lunes), fin: fechaLocal(domingo) };
}



// ─── Modal: Empleado ──────────────────────────────────────────────────────────

function EmpleadoModal({ empleado, negocioId, productoId, monedaCuenta, onClose, onSaved }: {
  empleado: Empleado | null;
  negocioId: string | null;
  productoId: string;
  /** Moneda del país del producto (MXN en México). */
  monedaCuenta: string;
  onClose: () => void;
  onSaved: (e: Empleado) => void;
}) {
  const [nombre,      setNombre]     = useState(empleado?.nombre ?? '');
  const [cargo,       setCargo]      = useState(empleado?.cargo ?? '');
  const [salario,     setSalario]    = useState(String(empleado?.salario ?? ''));
  const [tipoPago,    setTipoPago]   = useState<Empleado['tipo_pago']>(empleado?.tipo_pago ?? 'mensual');
  // La del país del producto, no 'USD' fijo: el formulario siempre la manda y
  // un negocio mexicano daba de alta los sueldos en dólares.
  const [moneda,      setMoneda]     = useState(empleado?.moneda ?? monedaCuenta);
  const [telefono,    setTelefono]   = useState(empleado?.telefono ?? '');
  const [email,       setEmail]      = useState(empleado?.email ?? '');
  const [fechaInicio, setFechaInicio]= useState(empleado?.fecha_inicio ?? '');
  const [notas,       setNotas]      = useState(empleado?.notas ?? '');
  const [saving,      setSaving]     = useState(false);
  const [error,       setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { setError('El nombre es requerido'); return; }
    const sal = parseFloat(salario);
    if (!sal || sal <= 0) { setError('El salario debe ser mayor a 0'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        nombre: nombre.trim(), cargo: cargo.trim() || null, salario: sal,
        tipo_pago: tipoPago, moneda,
        telefono: telefono.trim() || null, email: email.trim() || null,
        fecha_inicio: fechaInicio || null, notas: notas.trim() || null,
        negocio_id:  negocioId,
        producto_id: productoId,
      };
      const r = empleado
        ? await api.patch(`/nomina/empleados/${empleado.id}`, payload)
        : await api.post('/nomina/empleados', payload);
      onSaved(r.data);
    } catch { setError('Error al guardar'); }
    finally   { setSaving(false); }
  }

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-md">
      <div className="relative w-full bg-[#0b1421] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">{empleado ? 'Editar empleado' : 'Nuevo empleado'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/40 hover:text-white/70 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-white/40 mb-1 block">Nombre *</label>
            <input required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="María García"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40" />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1 block">Cargo / Puesto</label>
            <input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Vendedor, Cocinero, Cajero…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40" />
          </div>

          {/* Salario + Moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Salario *</label>
              <input type="number" min="0" step="0.01" value={salario} onChange={e => setSalario(e.target.value)} placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white focus:outline-none focus:border-rose-500/40" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Moneda</label>
              <CustomSelect value={moneda} onChange={setMoneda} options={(MONEDAS.includes(monedaCuenta) ? MONEDAS : [monedaCuenta, ...MONEDAS]).map(m => ({ value: m, label: m }))} />
            </div>
          </div>

          {/* Tipo pago */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Frecuencia de pago</label>
            <div className="flex gap-2">
              {TIPOS_PAGO.map(t => (
                <button key={t.value} type="button" onClick={() => setTipoPago(t.value as Empleado['tipo_pago'])}
                  className={`flex-1 py-2 rounded-xl text-xs border transition-all ${tipoPago === t.value ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'border-white/10 text-white/40 bg-white/4 hover:border-white/20'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contacto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Teléfono</label>
              <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+52 55..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria@..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40" />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Fecha de ingreso</label>
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/70 focus:outline-none"
              style={{ colorScheme: 'dark' }} />
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Beneficios, banco, CLABE…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none resize-none" />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </form>

        <div className="flex gap-3 px-6 py-4 border-t border-white/8">
          <button type="button" onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60 hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving}
            className="flex-1 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : empleado ? 'Guardar cambios' : 'Agregar empleado'}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}

// ─── Modal: Pagar nómina ──────────────────────────────────────────────────────

function PagoModal({ empleado, onClose, onPagado }: {
  empleado: Empleado;
  onClose: () => void;
  onPagado: (p: Pago) => void;
}) {
  const periodo = periodoPorTipo(empleado.tipo_pago);
  const [monto,         setMonto]        = useState(String(empleado.salario));
  const [periodoInicio, setPeriodoInicio] = useState(periodo.inicio);
  const [periodoFin,    setPeriodoFin]   = useState(periodo.fin);
  const [fechaPago,     setFechaPago]    = useState(today());
  const [notas,         setNotas]        = useState('');
  const [saving,        setSaving]       = useState(false);
  const [error,         setError]        = useState('');
  const clavePago = useRef(nuevaClaveIdempotencia());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const m = parseFloat(monto);
    if (!m || m <= 0) { setError('El monto debe ser mayor a 0'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/nomina/pagos', {
        empleado_id: empleado.id, monto: m,
        periodo_inicio: periodoInicio, periodo_fin: periodoFin,
        fecha_pago: fechaPago, notas: notas.trim() || null,
      }, { headers: { 'Idempotency-Key': clavePago.current } });
      clavePago.current = nuevaClaveIdempotencia();
      onPagado(r.data.pago);
    } catch (err) {
      // Sin respuesta (corte de red) se reintenta con la misma clave: no duplica el pago.
      if (hayRespuestaDelServidor(err)) clavePago.current = nuevaClaveIdempotencia();
      setError('Error al registrar pago');
    }
    finally   { setSaving(false); }
  }

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-sm">
      <div className="relative w-full bg-[#0b1421] border border-white/10 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <h2 className="text-base font-semibold text-white">Registrar pago</h2>
            <p className="text-xs text-white/40 mt-0.5">{empleado.nombre}{empleado.cargo ? ` · ${empleado.cargo}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/40 hover:text-white/70 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Info box */}
          <div className="rounded-2xl bg-rose-500/8 border border-rose-500/20 p-3 flex items-center justify-between">
            <span className="text-xs text-rose-300/70">Salario base</span>
            <span className="text-sm font-bold text-rose-300">{empleado.moneda} ${Number(empleado.salario).toFixed(2)}</span>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Monto a pagar</label>
            <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white focus:outline-none focus:border-rose-500/40" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Período inicio</label>
              <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/70 focus:outline-none"
                style={{ colorScheme: 'dark' }} />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Período fin</label>
              <input type="date" value={periodoFin} onChange={e => setPeriodoFin(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/70 focus:outline-none"
                style={{ colorScheme: 'dark' }} />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Fecha de pago</label>
            <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/70 focus:outline-none"
              style={{ colorScheme: 'dark' }} />
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Método de pago, banco…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/20 focus:outline-none" />
          </div>

          <p className="text-xs text-white/30">Este pago se registrará automáticamente como egreso en <span className="text-white/50">Finanzas → Nómina</span>.</p>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60 hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? 'Registrando…' : 'Confirmar pago'}
            </button>
          </div>
        </form>
      </div>
    </MotionModal>
  );
}

// ─── Inner (con producto global) ──────────────────────────────────────────────

function PersonalInner({ producto, cambiarProducto }: { producto: ProductoActivo; cambiarProducto: () => void }) {
  const router = useRouter();
  const [tab,          setTab]          = useState<'equipo' | 'pagos'>('equipo');
  const [allEmpleados, setAllEmpleados] = useState<Empleado[]>([]);
  const [allPagos,     setAllPagos]     = useState<Pago[]>([]);
  const [loadingEmp,   setLoadingEmp]   = useState(true);
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [modalNuevo,   setModalNuevo]   = useState(false);
  const [editando,     setEditando]     = useState<Empleado | null>(null);
  const [pagando,      setPagando]      = useState<Empleado | null>(null);
  const [toast,        setToast]        = useState('');
  const [soloActivos,  setSoloActivos]  = useState(true);

  useEffect(() => { loadEmpleados(); }, []);

  useEffect(() => { if (tab === 'pagos' && allPagos.length === 0) loadPagos(); }, [tab]);

  async function loadEmpleados() {
    setLoadingEmp(true);
    try {
      // Fetch ALL employees (no activo filter) so the pagos join always
      // resolves producto_id even for inactive employees (M4 fix).
      const r = await api.get('/nomina/empleados', {});
      setAllEmpleados(r.data);
    } catch { setToast('Error al cargar empleados'); }
    finally   { setLoadingEmp(false); }
  }

  async function loadPagos() {
    setLoadingPagos(true);
    try {
      const r = await api.get('/nomina/pagos', {});
      setAllPagos(r.data);
    } catch { setToast('Error al cargar pagos'); }
    finally   { setLoadingPagos(false); }
  }

  function handleSavedEmpleado(saved: Empleado) {
    setAllEmpleados(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
    setModalNuevo(false); setEditando(null);
    setToast(editando ? 'Empleado actualizado' : 'Empleado agregado');
  }

  async function handleToggleActivo(emp: Empleado) {
    try {
      const r = await api.patch(`/nomina/empleados/${emp.id}`, { activo: !emp.activo });
      setAllEmpleados(prev => prev.map(e => e.id === emp.id ? r.data : e));
    } catch { setToast('Error al actualizar'); }
  }

  async function handleDeleteEmpleado(id: string) {
    if (!confirm('¿Eliminar este empleado? Si ya tiene pagos, se desactivará para conservar su historial de nómina.')) return;
    try {
      const { data } = await api.delete(`/nomina/empleados/${id}`);
      if (data?.archivado) {
        // Con pagos no se borra: queda inactivo y su historial se conserva.
        setAllEmpleados(prev => prev.map(e => (e.id === id ? { ...e, activo: false } : e)));
        setToast('El empleado tiene pagos: se desactivó y su historial se conserva');
      } else {
        setAllEmpleados(prev => prev.filter(e => e.id !== id));
        setToast('Empleado eliminado');
      }
    } catch { setToast('Error al eliminar'); }
  }

  function handlePagado(pago: Pago) {
    setAllPagos(prev => [pago, ...prev]);
    setPagando(null);
    setToast(`Pago de ${pago.empleado_nombre} registrado → Finanzas actualizado`);
  }

  async function handleDeletePago(id: string) {
    if (!confirm('¿Eliminar este pago? También se eliminará el egreso en Finanzas.')) return;
    try {
      await api.delete(`/nomina/pagos/${id}`);
      setAllPagos(prev => prev.filter(p => p.id !== id));
      setToast('Pago eliminado');
    } catch { setToast('Error al eliminar'); }
  }

  const empleadosProducto = allEmpleados.filter(e => e.producto_id === producto.id);
  const empleadoIds = new Set(empleadosProducto.map(e => e.id));
  const pagos = allPagos.filter(p => empleadoIds.has(p.empleado_id));

  // Search & Filter state
  const [searchEmp, setSearchEmp] = useState('');
  const [filtroTipoPago, setFiltroTipoPago] = useState<string>('');
  const [filtroEstadoEmp, setFiltroEstadoEmp] = useState<'todos' | 'activos' | 'inactivos'>('activos');
  const [searchPagos, setSearchPagos] = useState('');

  const empleadosFiltrados = useMemo(() => {
    return empleadosProducto.filter(e => {
      if (filtroEstadoEmp === 'activos' && !e.activo) return false;
      if (filtroEstadoEmp === 'inactivos' && e.activo) return false;
      if (filtroTipoPago && e.tipo_pago !== filtroTipoPago) return false;
      if (searchEmp.trim()) {
        const q = searchEmp.toLowerCase().trim();
        const match = e.nombre.toLowerCase().includes(q) ||
          (e.cargo && e.cargo.toLowerCase().includes(q)) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.telefono && e.telefono.includes(q)) ||
          (e.notas && e.notas.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [empleadosProducto, filtroEstadoEmp, filtroTipoPago, searchEmp]);

  const pagosFiltrados = useMemo(() => {
    if (!searchPagos.trim()) return pagos;
    const q = searchPagos.toLowerCase().trim();
    return pagos.filter(p =>
      p.empleado_nombre.toLowerCase().includes(q) ||
      (p.notas && p.notas.toLowerCase().includes(q))
    );
  }, [pagos, searchPagos]);

  const activos = empleadosProducto.filter(e => e.activo);
  // Normaliza cada salario a su equivalente mensual según la frecuencia de pago
  const FACTOR_MENSUAL: Record<Empleado['tipo_pago'], number> = { semanal: 52 / 12, quincenal: 2, mensual: 1 };
  const nomiMensual = activos.reduce((s, e) => s + Number(e.salario) * (FACTOR_MENSUAL[e.tipo_pago] ?? 1), 0);
  const pagosMes = pagos.filter(p => p.fecha_pago.startsWith(new Date().toISOString().slice(0, 7)));

  function handleSharePagoWhatsApp(p: Pago) {
    const emp = allEmpleados.find(e => e.id === p.empleado_id);
    const tel = telefonoWhatsApp(emp?.telefono, producto.pais);
    const msg = `Hola ${p.empleado_nombre}. Te compartimos el comprobante de pago de tu nómina por ${p.moneda} $${Number(p.monto).toFixed(2)} correspondiente al periodo ${fmtDate(p.periodo_inicio)} al ${fmtDate(p.periodo_fin)}. Fecha de pago: ${fmtDate(p.fecha_pago)}. ¡Gracias por tu dedicación!`;
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="min-h-screen bg-[#060e18] text-white">
      {/* Header */}
      <div className="border-b border-white/8 bg-[#060e18]/95 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Herramientas', href: '/dashboard/herramientas' },
              { label: 'Personal & Nómina' },
            ]}
          />
          <div className="flex-1" />
          {tab === 'equipo' && (
            <button onClick={() => setModalNuevo(true)}
              className="flex items-center gap-2 px-4 h-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-medium transition-colors shadow-lg shadow-rose-600/20 active:scale-[0.98]">
              <Plus className="w-4 h-4" />
              <span>Nuevo empleado</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Personal & Nómina</h1>
            <p className="text-white/45 text-sm mt-1">Gestión de equipo y salarios. Cada pago se registra automáticamente en Finanzas.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Producto</p>
              <p className="text-sm font-semibold text-white">{producto.nombre}</p>
            </div>
            <button onClick={cambiarProducto}
              className="px-3 py-1.5 rounded-xl border border-white/15 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors">
              Cambiar
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Nómina mensual', value: `$${nomiMensual.toFixed(0)}`, icon: DollarSign, color: 'text-rose-300' },
            { label: 'Empleados activos', value: activos.length, icon: Users, color: 'text-white' },
            { label: 'Pagos este mes', value: pagosMes.length, icon: CreditCard, color: 'text-emerald-300' },
            { label: 'Pagado en el mes', value: `$${pagosMes.reduce((s, p) => s + Number(p.monto), 0).toFixed(0)}`, icon: CheckCircle2, color: 'text-emerald-300' },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-[#0F1C2A] border border-white/8 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-white/40">{k.label}</p>
                  <Icon className={`w-4 h-4 ${k.color}`} />
                </div>
                <p className={`text-2xl font-bold ${k.color} font-mono tabular-nums`}>{k.value}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/4 border border-white/8 rounded-2xl p-1 w-fit">
          {[
            {
              value: 'equipo',
              label: `Equipo (${empleadosProducto.length})`,
              icon: <Users className="w-4 h-4 shrink-0" />,
            },
            {
              value: 'pagos',
              label: `Historial de Pagos (${pagos.length})`,
              icon: <CreditCard className="w-4 h-4 shrink-0" />,
            },
          ].map(t => (
            <button key={t.value} onClick={() => setTab(t.value as typeof tab)}
              className={`relative flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t.value ? 'text-white' : 'text-white/45 hover:text-white/70'}`}>
              {tab === t.value && (
                <motion.div
                  layoutId="personal-tab-pill"
                  className="absolute inset-0 bg-white/10 border border-white/15 rounded-xl -z-0"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {t.icon}
                <span>{t.label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* ── Equipo Tab ── */}
        {tab === 'equipo' && (
          <div className="space-y-4">
            {/* Search + Status Pills + Frequency */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <SearchInput
                    value={searchEmp}
                    onChange={setSearchEmp}
                    placeholder="Buscar por nombre, cargo, teléfono o notas…"
                    shortcutKey="f"
                  />
                </div>

                {/* Status Pills */}
                <div className="flex items-center gap-1.5">
                  {(['activos', 'todos', 'inactivos'] as const).map(st => {
                    const active = filtroEstadoEmp === st;
                    const label = st === 'activos' ? 'Activos' : st === 'todos' ? 'Todos' : 'Inactivos';
                    const count = st === 'activos' ? activos.length : st === 'todos' ? empleadosProducto.length : empleadosProducto.length - activos.length;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setFiltroEstadoEmp(st)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                          active
                            ? 'bg-rose-600/30 border-rose-500/60 text-rose-200'
                            : 'bg-white/4 border-white/8 text-white/60 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <span>{label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold tabular-nums ${
                          active ? 'bg-rose-500/40 text-rose-100' : 'bg-white/10 text-white/50'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Frequency Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-white/30 text-[11px] font-medium mr-1 uppercase tracking-wider">Pago:</span>
                <button
                  type="button"
                  onClick={() => setFiltroTipoPago('')}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                    filtroTipoPago === ''
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                      : 'bg-white/3 border-white/8 text-white/50 hover:text-white hover:border-white/15'
                  }`}
                >
                  Todas
                </button>
                {TIPOS_PAGO.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setFiltroTipoPago(filtroTipoPago === t.value ? '' : t.value)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                      filtroTipoPago === t.value
                        ? 'bg-rose-500/25 border-rose-500/50 text-rose-200'
                        : 'bg-white/3 border-white/8 text-white/50 hover:text-white hover:border-white/15'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {loadingEmp ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
              </div>
            ) : empleadosFiltrados.length === 0 ? (
              <div className="text-center py-16 bg-white/2 border border-white/6 rounded-3xl p-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <Users className="w-8 h-8" />
                </div>
                <p className="text-white/60 font-medium text-sm">
                  {searchEmp || filtroTipoPago || filtroEstadoEmp !== 'activos' ? 'Sin empleados que coincidan con los filtros' : 'Aún no tienes empleados registrados.'}
                </p>
                <p className="text-white/40 text-xs mt-1">
                  {searchEmp || filtroTipoPago ? 'Prueba cambiando el texto o limpiando los filtros.' : 'Registra al personal de tu negocio y automatiza tus pagos en Finanzas.'}
                </p>
                {!searchEmp && !filtroTipoPago ? (
                  <button onClick={() => setModalNuevo(true)}
                    className="mt-4 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-medium transition-colors inline-flex items-center gap-2 shadow-lg shadow-rose-600/20">
                    <Plus className="w-4 h-4" />
                    <span>Agregar empleado</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { setSearchEmp(''); setFiltroTipoPago(''); setFiltroEstadoEmp('activos'); }}
                    className="mt-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {empleadosFiltrados.map(emp => (
                  <div key={emp.id}
                    className={`bg-[#0F1C2A] border rounded-2xl p-4 transition-all flex flex-col justify-between ${
                      emp.activo ? 'border-white/8 hover:border-rose-500/30' : 'border-white/4 opacity-60'
                    }`}>
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white truncate">{emp.nombre}</p>
                            <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${
                              emp.activo ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300' : 'bg-white/5 border-white/10 text-white/40'
                            }`}>
                              {emp.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                          {emp.cargo && (
                            <p className="text-xs text-white/50 mt-1 flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-white/35 shrink-0" />
                              <span>{emp.cargo}</span>
                            </p>
                          )}
                          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-rose-300 tabular-nums">
                              {emp.moneda} ${Number(emp.salario).toFixed(2)}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50 font-medium">
                              {TIPOS_PAGO.find(t => t.value === emp.tipo_pago)?.label}
                            </span>
                          </div>

                          {/* Contact information */}
                          <div className="mt-3 space-y-1 text-xs text-white/40">
                            {emp.telefono && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3 h-3 text-white/30 shrink-0" />
                                <a href={`tel:${emp.telefono}`} className="text-white/60 hover:text-white transition-colors">
                                  {emp.telefono}
                                </a>
                              </div>
                            )}
                            {emp.email && (
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-3 h-3 text-white/30 shrink-0" />
                                <a href={`mailto:${emp.email}`} className="text-white/60 hover:text-white transition-colors truncate">
                                  {emp.email}
                                </a>
                              </div>
                            )}
                            {emp.fecha_inicio && (
                              <p className="text-xs text-white/30 flex items-center gap-1 pt-0.5">
                                <Calendar className="w-3 h-3 text-white/25 shrink-0" />
                                <span>Desde {fmtDate(emp.fecha_inicio)}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/6">
                      {emp.activo && (
                        <button onClick={() => setPagando(emp)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/25 transition-colors font-medium">
                          <CreditCard className="w-3.5 h-3.5 shrink-0" />
                          <span>Pagar</span>
                        </button>
                      )}

                      {emp.telefono && (
                        <a
                          href={enlaceWhatsApp(emp.telefono, producto.pais)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          title="WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button onClick={() => setEditando(emp)} aria-label="Editar empleado"
                        className="p-2 rounded-xl bg-white/6 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button onClick={() => handleToggleActivo(emp)}
                        className="p-2 rounded-xl bg-white/6 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                        title={emp.activo ? 'Desactivar empleado' : 'Activar empleado'}>
                        {emp.activo ? (
                          <ToggleRight className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-4 h-4 text-white/40" />
                        )}
                      </button>

                      <button onClick={() => handleDeleteEmpleado(emp.id)} aria-label="Eliminar empleado"
                        className="p-2 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/18 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Historial de Pagos Tab ── */}
        {tab === 'pagos' && (
          <div className="space-y-4">
            {/* Search payments & Export */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={searchPagos}
                  onChange={e => setSearchPagos(e.target.value)}
                  placeholder="Buscar pagos por empleado o nota…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/50 transition-colors"
                />
                {searchPagos && (
                  <button
                    type="button"
                    onClick={() => setSearchPagos('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/70 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (pagos.length === 0) return;
                  const headers = ['Fecha Pago', 'Empleado', 'Monto', 'Moneda', 'Periodo Inicio', 'Periodo Fin', 'Notas'];
                  const rows = pagosFiltrados.map(p => [
                    `"${p.fecha_pago || ''}"`,
                    `"${(p.empleado_nombre || '').replace(/"/g, '""')}"`,
                    p.monto,
                    `"${p.moneda || ''}"`,
                    `"${p.periodo_inicio || ''}"`,
                    `"${p.periodo_fin || ''}"`,
                    `"${(p.notas || '').replace(/"/g, '""')}"`,
                  ].join(','));
                  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `pagos_nomina_${producto.nombre.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={pagosFiltrados.length === 0}
                className="flex items-center justify-center gap-1.5 px-3.5 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors disabled:opacity-40 whitespace-nowrap"
                title="Exportar historial de pagos a CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Pagos CSV</span>
              </button>
            </div>

            {loadingPagos ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
              </div>
            ) : pagosFiltrados.length === 0 ? (
              <div className="text-center py-16 bg-white/2 border border-white/6 rounded-3xl p-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <CreditCard className="w-8 h-8" />
                </div>
                <p className="text-white/60 font-medium text-sm">
                  {searchPagos ? 'No hay pagos con este criterio de búsqueda' : 'Sin pagos registrados todavía.'}
                </p>
                <p className="text-white/40 text-xs mt-1">
                  {searchPagos ? 'Prueba con otro nombre.' : 'Los pagos registrados aparecerán aquí y se sincronizarán con Finanzas.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pagosFiltrados.map(p => (
                  <div key={p.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0F1C2A] border border-white/8 rounded-2xl px-5 py-3.5 hover:border-rose-500/30 transition-all group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{p.empleado_nombre}</p>
                        {p.movimiento_id && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" title="Registrado como egreso en Finanzas">
                            <Check className="w-3 h-3" />
                            <span>Finanzas sync</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/40 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-white/30 shrink-0" />
                        <span>Período: {fmtDate(p.periodo_inicio)} – {fmtDate(p.periodo_fin)}</span>
                      </p>
                      {p.notas && <p className="text-xs text-white/30 mt-1 italic">{p.notas}</p>}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/6">
                      <div className="text-left sm:text-right flex-shrink-0">
                        <p className="text-base font-bold text-rose-300 tabular-nums">
                          {p.moneda} ${Number(p.monto).toFixed(2)}
                        </p>
                        <p className="text-xs text-white/35">Pagado: {fmtDate(p.fecha_pago)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 1-Click WhatsApp Receipt Share */}
                        <button
                          type="button"
                          onClick={() => handleSharePagoWhatsApp(p)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors font-medium"
                          title="Compartir comprobante por WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Recibo WA</span>
                        </button>

                        <button onClick={() => handleDeletePago(p.id)} aria-label="Eliminar pago"
                          className="p-1.5 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/18 transition-all flex items-center justify-center">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {(modalNuevo || editando) && (
          <EmpleadoModal empleado={editando} negocioId={producto.negocio_id} productoId={producto.id} monedaCuenta={getTaxConfig(producto.pais).moneda} onClose={() => { setModalNuevo(false); setEditando(null); }} onSaved={handleSavedEmpleado} />
        )}
        {pagando && (
          <PagoModal empleado={pagando} onClose={() => setPagando(null)} onPagado={handlePagado} />
        )}
      </AnimatePresence>

      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PersonalPage() {
  return (
    <HerramientaGate herramienta="nomina" nombre="Personal & Nómina" acento="rose">
    <ProductoGate herramienta="Personal & Nómina" acento="rose">
      {({ producto, cambiarProducto }) => (
        <PersonalInner producto={producto} cambiarProducto={cambiarProducto} />
      )}
    </ProductoGate>
    </HerramientaGate>
  );
}