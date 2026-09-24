'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  Sparkles,
  UserX,
  Search,
  Plus,
  Trash2,
  Edit3,
  Phone,
  Mail,
  MapPin,
  Calendar,
  MessageSquare,
  Building2,
  Clock,
  X,
  Share2,
  FileText,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Download,
} from 'lucide-react';
import api from '../../../../lib/api';
import CustomSelect from '../../../../components/ui/CustomSelect';
import ProductoGate from '@/components/herramientas/ProductoGate';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import { ProductoActivo } from '@/lib/productoActivo';
import CamposExpediente, { CampoExpediente } from './CamposExpediente';
import { MotionModal } from '@/components/motion/MotionModal';
import { Breadcrumbs, SearchInput, Toast } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cliente {
  id: string;
  nombre: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  categoria: string | null;
  emoji: string | null;
  estado: 'lead' | 'cliente' | 'inactivo';
  fecha_ultimo_contacto: string | null;
  activo: boolean;
  negocio_id: string | null;
  producto_id: string | null;
  atributos_extra: Record<string, unknown> | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

interface ClienteForm {
  nombre: string;
  empresa: string;
  email: string;
  telefono: string;
  direccion: string;
  notas: string;
  categoria: string;
  emoji: string;
  estado: 'lead' | 'cliente' | 'inactivo';
  fecha_ultimo_contacto: string;
}

const EMPTY_FORM: ClienteForm = {
  nombre: '',
  empresa: '',
  email: '',
  telefono: '',
  direccion: '',
  notas: '',
  categoria: '',
  emoji: '',
  estado: 'cliente',
  fecha_ultimo_contacto: '',
};

const ESTADOS: { value: Cliente['estado']; label: string; color: string }[] = [
  { value: 'cliente',  label: 'Cliente',  color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { value: 'lead',     label: 'Lead',     color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'inactivo', label: 'Inactivo', color: 'bg-white/10 text-white/50 border-white/15' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function normalizeCategoria(raw: string): string {
  return toTitleCase(raw.trim());
}

function buildCategoriasUnicas(clientes: Cliente[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of clientes) {
    if (!c.categoria) continue;
    const key = c.categoria.toLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(c.categoria); }
  }
  return result.sort();
}

function estadoChip(estado: Cliente['estado']) {
  const e = ESTADOS.find(s => s.value === estado)!;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${e.color}`}>
      {e.label}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function buildWhatsAppUrl(telefono: string, nombre: string): string {
  const digits = telefono.replace(/[^\d]/g, '');
  const msg = encodeURIComponent(`Hola ${nombre.split(' ')[0]}.`);
  return digits ? `https://wa.me/${digits}?text=${msg}` : `https://wa.me/?text=${msg}`;
}



// ─── Modal: Crear / Editar ────────────────────────────────────────────────────

function ClienteModal({
  cliente,
  categoriasExistentes,
  producto,
  onClose,
  onSaved,
}: {
  cliente: Cliente | null;
  categoriasExistentes: string[];
  producto: ProductoActivo;
  onClose: () => void;
  onSaved: (c: Cliente) => void;
}) {
  const [form, setForm] = useState<ClienteForm>(
    cliente
      ? {
          nombre:               cliente.nombre,
          empresa:              cliente.empresa ?? '',
          email:                cliente.email ?? '',
          telefono:             cliente.telefono ?? '',
          direccion:            cliente.direccion ?? '',
          notas:                cliente.notas ?? '',
          categoria:            cliente.categoria ?? '',
          emoji:                cliente.emoji ?? '',
          estado:               cliente.estado,
          fecha_ultimo_contacto: cliente.fecha_ultimo_contacto ?? '',
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof ClienteForm, val: string) => setForm(f => ({ ...f, [key]: val }));

  // ─── Ficha de expediente (atributos_extra según el vertical del usuario) ──────
  const [vertical, setVertical] = useState<string | null>(null);
  const [campos, setCampos] = useState<CampoExpediente[]>([]);
  const [atributos, setAtributos] = useState<Record<string, unknown>>(
    cliente?.atributos_extra ?? {}
  );
  const setAtributo = (key: string, val: string) =>
    setAtributos(a => ({ ...a, [key]: val }));

  useEffect(() => {
    let cancelado = false;
    api
      .get('/clientes/expediente/campos')
      .then(r => {
        if (cancelado) return;
        setVertical(r.data.vertical ?? null);
        setCampos(r.data.campos ?? []);
      })
      .catch(() => {
        /* Sin vertical o error de red: la ficha simplemente no se muestra. */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const CATS_SUGERIDAS = ['VIP', 'Mayorista', 'Lead Caliente', 'Cliente Recurrente', 'Agencia'];
  const todasCats = Array.from(new Set([...categoriasExistentes, ...CATS_SUGERIDAS]));

  function pickCategoria(cat: string) {
    // Case-insensitive reuse of existing canonical form
    const existing = categoriasExistentes.find(e => e.toLowerCase() === cat.toLowerCase());
    set('categoria', existing ?? normalizeCategoria(cat));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return; }
    // Validación de la ficha de expediente: los campos marcados como requeridos
    // por el vertical deben tener valor antes de guardar.
    const faltante = campos.find(c => {
      if (!c.requerido) return false;
      const v = atributos[c.key];
      return v == null || String(v).trim() === '';
    });
    if (faltante) { setError(`El campo "${faltante.label}" es requerido`); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        nombre:               form.nombre.trim(),
        empresa:              form.empresa.trim() || null,
        email:                form.email.trim() || null,
        telefono:             form.telefono.trim() || null,
        direccion:            form.direccion.trim() || null,
        notas:                form.notas.trim() || null,
        categoria:            form.categoria ? normalizeCategoria(form.categoria) : null,
        emoji:                form.emoji || null,
        estado:               form.estado,
        fecha_ultimo_contacto: form.fecha_ultimo_contacto || null,
        negocio_id:           producto.negocio_id,
        producto_id:          producto.id,
        atributos_extra:      atributos,
      };
      let saved: Cliente;
      if (cliente) {
        const r = await api.patch(`/clientes/${cliente.id}`, payload);
        saved = r.data;
      } else {
        const r = await api.post('/clientes', payload);
        saved = r.data;
      }
      onSaved(saved);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-lg">
      <div className="relative w-full bg-[#0b1421] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">
            {cliente ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors p-1" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Negocio activo (informativo) */}
          <div className="flex items-center gap-2 text-xs text-white/45 bg-white/4 border border-white/8 rounded-xl px-3 py-2">
            <span className="text-white/35">Negocio:</span>
            <span className="text-white/70 font-medium">{producto.nombre}</span>
          </div>

          {/* Badge + Nombre */}
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <label className="text-xs text-white/40 mb-1 block">Badge</label>
              <input
                value={form.emoji}
                onChange={e => set('emoji', e.target.value)}
                placeholder="CLI"
                maxLength={4}
                className="w-14 h-10 text-center bg-white/5 border border-white/10 rounded-xl text-xs font-mono uppercase text-violet-300 focus:outline-none focus:border-violet-500/50"
                title="Iniciales o código corto del cliente"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/40 mb-1 block">Nombre *</label>
              <input
                required value={form.nombre} onChange={e => set('nombre', e.target.value)}
                placeholder="Juan Pérez"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50"
              />
              <label className="text-xs text-white/40 mt-2 mb-1 block">Estado</label>
              <div className="flex gap-2">
                {ESTADOS.map(s => (
                  <button key={s.value} type="button"
                    onClick={() => set('estado', s.value)}
                    className={`px-3 py-1 rounded-full text-xs border transition-all ${form.estado === s.value ? s.color : 'border-white/10 text-white/40 bg-white/5'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Empresa */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Empresa / Negocio</label>
            <input value={form.empresa} onChange={e => set('empresa', e.target.value)}
              placeholder="Empresa S.A."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Email + Teléfono */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="juan@ejemplo.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Teléfono (WhatsApp)</label>
              <input type="tel" value={form.telefono} onChange={e => set('telefono', e.target.value)}
                placeholder="+52 55 1234 5678"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Categoría</label>
            <input
              list="cats-list"
              value={form.categoria}
              onChange={e => set('categoria', e.target.value)}
              placeholder="VIP, Mayorista…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50"
            />
            <datalist id="cats-list">
              {todasCats.map(c => <option key={c} value={c} />)}
            </datalist>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {todasCats.map(cat => {
                const isExisting = categoriasExistentes.some(e => e.toLowerCase() === cat.toLowerCase());
                const isSelected = form.categoria.toLowerCase() === cat.toLowerCase();
                return (
                  <button key={cat} type="button" onClick={() => pickCategoria(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                      isSelected
                        ? 'bg-violet-500/30 border-violet-500/60 text-violet-200'
                        : isExisting
                        ? 'bg-white/8 border-white/20 text-white/60 hover:border-violet-400/40'
                        : 'bg-transparent border-dashed border-white/15 text-white/40 hover:border-violet-400/40'
                    }`}>
                    {isExisting ? cat : `+ ${cat}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Último contacto */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Último contacto</label>
            <input type="date" value={form.fecha_ultimo_contacto} onChange={e => set('fecha_ultimo_contacto', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/70 focus:outline-none focus:border-violet-500/50" style={{ colorScheme: 'dark' }}
            />
          </div>

          {/* Dirección */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Dirección</label>
            <input value={form.direccion} onChange={e => set('direccion', e.target.value)}
              placeholder="Calle, Ciudad, País"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Notas</label>
            <textarea value={form.notas} onChange={e => set('notas', e.target.value)}
              rows={3} placeholder="Intereses, preferencias, contexto de compra…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 resize-none"
            />
          </div>

          {/* Ficha de expediente específica del vertical */}
          <CamposExpediente
            vertical={vertical}
            campos={campos}
            valores={atributos}
            onChange={setAtributo}
          />

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-white/8">
          <button type="button" onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60 hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving}
            className="flex-1 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}

// ─── Modal: Detalle ───────────────────────────────────────────────────────────

function ClienteDetalle({
  cliente,
  onClose,
  onEdit,
  onDelete,
  onWhatsApp,
}: {
  cliente: Cliente;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onWhatsApp: () => void;
}) {
  const router = useRouter();

  const handleAgendar = () => {
    onClose();
    router.push('/dashboard/herramientas/calendario');
  };

  const handleCotizar = () => {
    onClose();
    router.push('/dashboard/herramientas/cotizaciones');
  };

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-md">
      <div className="relative w-full bg-[#0b1421] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-sm font-bold text-violet-300 flex-shrink-0">
                {cliente.emoji ? (
                  <span>{cliente.emoji}</span>
                ) : (
                  <Users className="w-6 h-6 text-violet-400" />
                )}
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">{cliente.nombre}</h2>
                {cliente.empresa && (
                  <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-white/40" />
                    <span>{cliente.empresa}</span>
                  </p>
                )}
                <div className="mt-1.5">{estadoChip(cliente.estado)}</div>
              </div>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors p-1" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          {cliente.telefono && (
            <div className="flex items-center gap-2.5 text-sm">
              <Phone className="w-4 h-4 text-emerald-400/70 flex-shrink-0" />
              <a href={`tel:${cliente.telefono}`} className="text-white/80 hover:text-emerald-300 transition-colors">
                {cliente.telefono}
              </a>
            </div>
          )}
          {cliente.email && (
            <div className="flex items-center gap-2.5 text-sm">
              <Mail className="w-4 h-4 text-blue-400/70 flex-shrink-0" />
              <a href={`mailto:${cliente.email}`} className="text-violet-400 hover:text-violet-300 transition-colors truncate">
                {cliente.email}
              </a>
            </div>
          )}
          {cliente.direccion && (
            <div className="flex items-start gap-2.5 text-sm">
              <MapPin className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />
              <span className="text-white/60">{cliente.direccion}</span>
            </div>
          )}
          {cliente.categoria && (
            <div className="flex items-center gap-2.5 text-sm">
              <Sparkles className="w-4 h-4 text-violet-400/70 flex-shrink-0" />
              <span className="px-2.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-medium">
                {cliente.categoria}
              </span>
            </div>
          )}
          {cliente.fecha_ultimo_contacto && (
            <div className="flex items-center gap-2.5 text-sm">
              <Clock className="w-4 h-4 text-white/40 flex-shrink-0" />
              <span className="text-white/50 text-xs">Último contacto: {formatDate(cliente.fecha_ultimo_contacto)}</span>
            </div>
          )}
          {cliente.notas && (
            <div className="mt-3 p-3.5 rounded-2xl bg-white/4 border border-white/8">
              <p className="text-xs font-medium text-white/40 mb-1">Notas del cliente</p>
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{cliente.notas}</p>
            </div>
          )}
          <p className="text-[11px] text-white/25 pt-1">Registrado el {formatDate(cliente.fecha_creacion)}</p>
        </div>

        {/* Quick Inter-tool Navigation Actions */}
        <div className="px-6 py-2 border-t border-white/6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleAgendar}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 text-xs font-medium transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Agendar Cita</span>
          </button>
          <button
            type="button"
            onClick={handleCotizar}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 text-xs font-medium transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Crear Cotización</span>
          </button>
        </div>

        {/* Primary Contact & Manage Actions */}
        <div className="px-6 py-4 border-t border-white/8 grid grid-cols-4 gap-2">
          {cliente.telefono ? (
            <button onClick={onWhatsApp}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-300 transition-colors">
              <MessageSquare className="w-4 h-4" />
              <span className="text-[11px] font-medium">WhatsApp</span>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-white/3 border border-white/5 text-white/20">
              <MessageSquare className="w-4 h-4" />
              <span className="text-[11px]">WhatsApp</span>
            </div>
          )}
          {cliente.email ? (
            <a href={`mailto:${cliente.email}`}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 text-blue-300 transition-colors">
              <Mail className="w-4 h-4" />
              <span className="text-[11px] font-medium">Email</span>
            </a>
          ) : (
            <div className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-white/3 border border-white/5 text-white/20">
              <Mail className="w-4 h-4" />
              <span className="text-[11px]">Email</span>
            </div>
          )}
          <button onClick={onEdit}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <Edit3 className="w-4 h-4" />
            <span className="text-[11px] font-medium">Editar</span>
          </button>
          <button onClick={onDelete}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
            <span className="text-[11px] font-medium">Eliminar</span>
          </button>
        </div>
      </div>
    </MotionModal>
  );
}

// ─── Herramienta (con producto activo ya resuelto) ─────────────────────────────

function ClientesTool({ producto, cambiarProducto }: { producto: ProductoActivo; cambiarProducto: () => void }) {
  const router = useRouter();
  const [allClientes,     setAllClientes]     = useState<Cliente[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [q,               setQ]               = useState('');
  const [filtroEstado,    setFiltroEstado]    = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [modalNuevo,      setModalNuevo]      = useState(false);
  const [editando,        setEditando]        = useState<Cliente | null>(null);
  const [detalle,         setDetalle]         = useState<Cliente | null>(null);
  const [toast,           setToast]           = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchClientes = useCallback(async (search?: string, estado?: string, categoria?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { producto_id: producto.id };
      if (search) params.q = search;
      if (estado) params.estado = estado;
      if (categoria) params.categoria = categoria;
      const r = await api.get('/clientes', { params });
      setAllClientes(r.data);
    } catch {
      setToast('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }, [producto.id]);

  useEffect(() => {
    void fetchClientes();
  }, [fetchClientes]);

  function handleSearch(val: string) {
    setQ(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => fetchClientes(val, filtroEstado, filtroCategoria), 320);
  }

  function handleClearSearch() {
    setQ('');
    fetchClientes('', filtroEstado, filtroCategoria);
  }

  function handleFiltroEstado(val: string) {
    const next = filtroEstado === val ? '' : val;
    setFiltroEstado(next);
    fetchClientes(q, next, filtroCategoria);
  }

  function handleFiltroCategoria(val: string) {
    const next = filtroCategoria === val ? '' : val;
    setFiltroCategoria(next);
    fetchClientes(q, filtroEstado, next);
  }

  // El backend ya devuelve solo los clientes del producto activo (params.producto_id).
  const clientes = allClientes;
  const categoriasUnicas = buildCategoriasUnicas(clientes);

  function handleSaved(saved: Cliente) {
    const isEdit = allClientes.some(c => c.id === saved.id);
    setAllClientes(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setModalNuevo(false);
    setEditando(null);
    setDetalle(null);
    setToast(isEdit ? 'Cliente actualizado' : 'Cliente creado');
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
      await api.delete(`/clientes/${id}`);
      setAllClientes(prev => prev.filter(c => c.id !== id));
      setDetalle(null);
      setToast('Cliente eliminado');
    } catch {
      setToast('Error al eliminar');
    }
  }

  async function handleWhatsApp(cliente: Cliente) {
    try {
      const r = await api.post(`/clientes/${cliente.id}/whatsapp`, {});
      const { whatsapp_url, cliente: updated } = r.data;
      setAllClientes(prev => prev.map(c => c.id === updated.id ? updated : c));
      if (detalle?.id === updated.id) setDetalle(updated);
      window.open(whatsapp_url, '_blank', 'noopener');
    } catch {
      // Fallback: open wa.me directly
      if (cliente.telefono) window.open(buildWhatsAppUrl(cliente.telefono, cliente.nombre), '_blank', 'noopener');
    }
  }

  const stats = {
    total:     clientes.length,
    clientes:  clientes.filter(c => c.estado === 'cliente').length,
    leads:     clientes.filter(c => c.estado === 'lead').length,
    inactivos: clientes.filter(c => c.estado === 'inactivo').length,
  };

  const statusPills = [
    { id: '', label: 'Todos', count: stats.total },
    { id: 'cliente', label: 'Clientes', count: stats.clientes },
    { id: 'lead', label: 'Leads', count: stats.leads },
    { id: 'inactivo', label: 'Inactivos', count: stats.inactivos },
  ];

  const exportarCsvClientes = () => {
    if (clientes.length === 0) return;
    const headers = ['Nombre', 'Empresa', 'Email', 'Teléfono', 'Estado', 'Categoría', 'Dirección', 'Último Contacto', 'Notas'];
    const rows = clientes.map(c => [
      `"${(c.nombre || '').replace(/"/g, '""')}"`,
      `"${(c.empresa || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.telefono || '').replace(/"/g, '""')}"`,
      `"${c.estado}"`,
      `"${(c.categoria || '').replace(/"/g, '""')}"`,
      `"${(c.direccion || '').replace(/"/g, '""')}"`,
      `"${c.fecha_ultimo_contacto || ''}"`,
      `"${(c.notas || '').replace(/"/g, '""')}"`,
    ].join(','));
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_${producto.nombre.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#060e18] text-white">
      {/* Header */}
      <div className="border-b border-white/8 bg-[#060e18]/95 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Herramientas', href: '/dashboard/herramientas' },
              { label: 'Clientes & CRM' },
            ]}
          />
          <div className="flex-1" />
          <button
            onClick={exportarCsvClientes}
            disabled={clientes.length === 0}
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors disabled:opacity-40"
            title="Exportar directorio a archivo CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
          <button onClick={() => setModalNuevo(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors shadow-lg shadow-violet-600/20 active:scale-[0.98]">
            <Plus className="w-4 h-4" />
            <span>Nuevo cliente</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header: title + producto activo */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Directorio de Clientes</h1>
            <p className="text-white/45 text-sm mt-1">CRM sin complicaciones. Contactos, notas e historial en un solo lugar.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 min-w-[240px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-2">Negocio activo</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-white truncate">{producto.nombre}</span>
              <button onClick={cambiarProducto}
                className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border border-white/15 text-white/55 hover:border-violet-400/50 hover:text-violet-300 transition-all">
                Cambiar
              </button>
            </div>
            <p className="text-[11px] text-violet-400/90 mt-2">directorio de clientes · CRM</p>
          </div>
        </div>

        {/* KPI Strip (Clickable to filter) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: '', label: 'Total Contactos', value: stats.total, icon: Users, color: 'text-white', activeClass: 'border-white/30 bg-white/10' },
            { id: 'cliente', label: 'Clientes Activos', value: stats.clientes, icon: UserCheck, color: 'text-emerald-300', activeClass: 'border-emerald-500/40 bg-emerald-500/10' },
            { id: 'lead', label: 'Leads / Prospectos', value: stats.leads, icon: Sparkles, color: 'text-blue-300', activeClass: 'border-blue-500/40 bg-blue-500/10' },
            { id: 'inactivo', label: 'Inactivos', value: stats.inactivos, icon: UserX, color: 'text-white/40', activeClass: 'border-white/20 bg-white/5' },
          ].map(k => {
            const Icon = k.icon;
            const isSelected = filtroEstado === k.id;
            return (
              <button
                key={k.label}
                type="button"
                onClick={() => handleFiltroEstado(k.id)}
                className={`text-left rounded-2xl p-4 border transition-all cursor-pointer ${
                  isSelected ? k.activeClass : 'bg-white/4 border-white/8 hover:border-white/15 hover:bg-white/6'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-white/40">{k.label}</p>
                  <Icon className={`w-4 h-4 ${k.color}`} />
                </div>
                <p className={`text-2xl font-bold ${k.color} font-mono tabular-nums`}>{k.value}</p>
              </button>
            );
          })}
        </div>

        {/* Search + Status Pills */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <SearchInput
                value={q}
                onChange={handleSearch}
                placeholder="Buscar por nombre, empresa, email o teléfono…"
                shortcutKey="f"
              />
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {statusPills.map(p => {
                const active = filtroEstado === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleFiltroEstado(p.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      active
                        ? 'bg-violet-600/30 border-violet-500/60 text-violet-200'
                        : 'bg-white/4 border-white/8 text-white/60 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <span>{p.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold tabular-nums ${
                      active ? 'bg-violet-500/40 text-violet-100' : 'bg-white/10 text-white/50'
                    }`}>
                      {p.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category Filter Pills */}
          {categoriasUnicas.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-white/30 text-[11px] font-medium mr-1 uppercase tracking-wider">Categoría:</span>
              <button
                type="button"
                onClick={() => handleFiltroCategoria('')}
                className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                  filtroCategoria === ''
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-200'
                    : 'bg-white/3 border-white/8 text-white/50 hover:text-white hover:border-white/15'
                }`}
              >
                Todas
              </button>
              {categoriasUnicas.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleFiltroCategoria(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                    filtroCategoria === cat
                      ? 'bg-violet-500/25 border-violet-500/50 text-violet-200'
                      : 'bg-white/3 border-white/8 text-white/50 hover:text-white hover:border-white/15'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : clientes.length === 0 ? (
          <div className="text-center py-20 bg-white/2 border border-white/6 rounded-3xl p-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Users className="w-8 h-8" />
            </div>
            <p className="text-white/60 font-medium text-sm">
              {q || filtroEstado || filtroCategoria ? 'Sin resultados para los filtros seleccionados' : 'Aún no tienes clientes registrados.'}
            </p>
            <p className="text-white/40 text-xs mt-1">
              {q || filtroEstado || filtroCategoria ? 'Prueba ajustando el término de búsqueda o limpia los filtros.' : 'Comienza registrando tu primer cliente o prospecto.'}
            </p>
            {!q && !filtroEstado && !filtroCategoria ? (
              <button onClick={() => setModalNuevo(true)}
                className="mt-4 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors inline-flex items-center gap-2 shadow-lg shadow-violet-600/20">
                <Plus className="w-4 h-4" />
                <span>Agregar primer cliente</span>
              </button>
            ) : (
              <button
                onClick={() => { setQ(''); setFiltroEstado(''); setFiltroCategoria(''); fetchClientes('', '', ''); }}
                className="mt-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-white/70 transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clientes.map(c => (
              <div
                key={c.id}
                onClick={() => setDetalle(c)}
                className="group relative bg-[#0F1C2A]/70 border border-white/8 hover:border-violet-500/40 rounded-2xl p-4 hover:bg-[#0F1C2A] transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Top row: Avatar + Name + Estado */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-xs font-bold text-violet-300 flex-shrink-0">
                      {c.emoji ? (
                        <span>{c.emoji}</span>
                      ) : (
                        <Users className="w-5 h-5 text-violet-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white truncate group-hover:text-violet-200 transition-colors">
                          {c.nombre}
                        </span>
                        {estadoChip(c.estado)}
                      </div>
                      {c.empresa && (
                        <p className="text-xs text-white/45 mt-0.5 truncate flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-white/30 shrink-0" />
                          <span>{c.empresa}</span>
                        </p>
                      )}
                      {c.categoria && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300/80 text-[11px] font-medium">
                          {c.categoria}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contact details row */}
                  <div className="mt-3 space-y-1 text-xs text-white/40">
                    {c.telefono && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Phone className="w-3.5 h-3.5 text-white/30 shrink-0" />
                        <span className="truncate">{c.telefono}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-white/30 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.direccion && (
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-white/30 shrink-0" />
                        <span className="truncate">{c.direccion}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer action bar */}
                <div className="mt-4 pt-3 border-t border-white/6 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-white/30 truncate">
                    {c.fecha_ultimo_contacto ? `Último: ${formatDate(c.fecha_ultimo_contacto)}` : 'Sin contacto reciente'}
                  </span>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {c.telefono && (
                      <button
                        type="button"
                        onClick={() => handleWhatsApp(c)}
                        title="Abrir WhatsApp"
                        className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {c.telefono && (
                      <a
                        href={`tel:${c.telefono}`}
                        title="Llamar"
                        className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => router.push('/dashboard/herramientas/calendario')}
                      title="Agendar Cita"
                      className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/dashboard/herramientas/cotizaciones')}
                      title="Crear Cotización"
                      className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {(modalNuevo || editando) && (
        <ClienteModal
          cliente={editando}
          categoriasExistentes={categoriasUnicas}
          producto={producto}
          onClose={() => { setModalNuevo(false); setEditando(null); }}
          onSaved={handleSaved}
        />
      )}

      {detalle && !editando && (
        <ClienteDetalle
          cliente={detalle}
          onClose={() => setDetalle(null)}
          onEdit={() => { setEditando(detalle); setDetalle(null); }}
          onDelete={() => handleDelete(detalle.id)}
          onWhatsApp={() => handleWhatsApp(detalle)}
        />
      )}

      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientesPage() {
  return (
    <HerramientaGate herramienta="clientes" nombre="Directorio de Clientes" acento="violet">
    <ProductoGate herramienta="Directorio de Clientes" acento="violet">
      {({ producto, cambiarProducto }) => (
        <ClientesTool producto={producto} cambiarProducto={cambiarProducto} />
      )}
    </ProductoGate>
    </HerramientaGate>
  );
}