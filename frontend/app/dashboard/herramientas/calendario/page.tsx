'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  List,
  Clock,
  User,
  Users,
  Phone,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Check,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Edit3,
  Trash2,
  X,
} from 'lucide-react';
import api from '../../../../lib/api';
import CustomSelect from '../../../../components/ui/CustomSelect';
import MotionModal from '@/components/motion/MotionModal';
import ProductoGate from '@/components/herramientas/ProductoGate';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import { ProductoActivo } from '@/lib/productoActivo';
import GoogleCalendarCard from '@/components/herramientas/GoogleCalendarCard';
import { Breadcrumbs, SearchInput, Toast } from '@/components/ui';
import FilaHoy from './FilaHoy';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cita {
  id: string;
  titulo: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  /** FK real al CRM; null si el contacto se escribió a mano. */
  cliente_id: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada';
  notas: string | null;
  color: string;
  negocio_id: string | null;
  producto_id: string | null;
  /** Copia en Google Calendar; null si la cuenta no lo tiene conectado. */
  google_sync_estado?: 'pendiente' | 'sincronizada' | 'error' | null;
  google_sync_error?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTADOS_CITA = [
  { value: 'pendiente',   label: 'Pendiente',   cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { value: 'confirmada',  label: 'Confirmada',  cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { value: 'cancelada',   label: 'Cancelada',   cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  { value: 'completada',  label: 'Completada',  cls: 'bg-white/10 text-white/45 border-white/15' },
];

const COLORES = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4', '#F43F5E', '#84CC16',
];

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtHora(h: string) { return h.slice(0, 5); }

function estadoChip(estado: Cita['estado'], small = false, cita?: Pick<Cita, 'google_sync_estado' | 'google_sync_error'>) {
  const e = ESTADOS_CITA.find(s => s.value === estado)!;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center rounded-full border ${e.cls} ${small ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'}`}>
        {e.label}
      </span>
      {cita?.google_sync_estado && <GoogleSyncDot estado={cita.google_sync_estado} error={cita.google_sync_error ?? null} />}
    </span>
  );
}

const SYNC_GOOGLE = {
  sincronizada: { cls: 'bg-emerald-400', texto: 'En Google Calendar' },
  pendiente:    { cls: 'bg-cyan-400 animate-pulse', texto: 'Enviando a Google Calendar…' },
  error:        { cls: 'bg-amber-400', texto: 'No se pudo copiar a Google Calendar' },
} as const;

function GoogleSyncDot({ estado, error }: { estado: keyof typeof SYNC_GOOGLE; error: string | null }) {
  const s = SYNC_GOOGLE[estado];
  const titulo = error && estado === 'error' ? `${s.texto}: ${error}` : s.texto;
  return (
    <span title={titulo} aria-label={titulo} role="img" className={`inline-block w-1.5 h-1.5 rounded-full ${s.cls}`} />
  );
}

// Builds the days grid for a given month (Mon-start, with padding nulls)
function buildGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  // Convert Sun=0 to Mon=0 offset
  const offset = (firstDay + 6) % 7;
  const grid: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  // Pad to complete last row
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}



// ─── Modal: Crear / Editar ────────────────────────────────────────────────────

function CitaModal({ cita, defaultFecha, negocioId, productoId, onClose, onSaved }: {
  cita: Cita | null;
  defaultFecha: string;
  negocioId: string | null;
  productoId: string;
  onClose: () => void;
  onSaved: (c: Cita) => void;
}) {
  const [titulo,      setTitulo]      = useState(cita?.titulo ?? '');
  const [fecha,       setFecha]       = useState(cita?.fecha ?? defaultFecha);
  const [horaInicio,  setHoraInicio]  = useState(cita?.hora_inicio?.slice(0,5) ?? '09:00');
  const [horaFin,     setHoraFin]     = useState(cita?.hora_fin?.slice(0,5) ?? '10:00');
  // Vínculo real con el CRM. null = contacto escrito a mano: la cita se guarda
  // igual, pero no alimenta el historial del cliente.
  const [clienteId, setClienteId] = useState<string | null>(cita?.cliente_id ?? null);
  const [crmClientes, setCrmClientes] = useState<{ id: string; nombre: string; telefono: string | null }[]>([]);
  const [altaCliente, setAltaCliente] = useState<{ nombre: string; telefono: string } | null>(null);
  const [clienteNombre, setClienteNombre] = useState(cita?.cliente_nombre ?? '');
  const [clienteTel,  setClienteTel]  = useState(cita?.cliente_telefono ?? '');
  const [clienteEmail,setClienteEmail]= useState(cita?.cliente_email ?? '');
  const [estado,      setEstado]      = useState<Cita['estado']>(cita?.estado ?? 'pendiente');
  const [notas,       setNotas]       = useState(cita?.notas ?? '');
  const [color,       setColor]       = useState(cita?.color ?? '#3B82F6');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    api
      .get('/clientes')
      .then(({ data }) => {
        const lista = Array.isArray(data) ? data : (data?.clientes ?? []);
        setCrmClientes(lista.map((c: { id: string; nombre: string; telefono?: string | null }) => ({
          id: c.id, nombre: c.nombre, telefono: c.telefono ?? null,
        })));
      })
      .catch(() => setCrmClientes([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) { setError('El título es requerido'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        titulo: titulo.trim(), fecha, hora_inicio: horaInicio, hora_fin: horaFin,
        cliente_nombre: clienteNombre.trim() || null,
        cliente_telefono: clienteTel.trim() || null,
        cliente_email: clienteEmail.trim() || null,
        estado, notas: notas.trim() || null, color,
        negocio_id:  negocioId,
        producto_id: productoId,
        // Excluyentes: o un cliente que ya existe, o uno nuevo creado aquí.
        cliente_id: clienteId ?? undefined,
        crear_cliente:
          !clienteId && altaCliente?.nombre.trim()
            ? { nombre: altaCliente.nombre.trim(), telefono: altaCliente.telefono.trim() || undefined }
            : undefined,
      };
      const r = cita
        ? await api.patch(`/calendario/${cita.id}`, payload)
        : await api.post('/calendario', payload);
      onSaved(r.data);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg || 'Error al guardar');
    }
    finally   { setSaving(false); }
  }

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-md">
      <div className="relative w-full bg-[#0b1421] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">{cita ? 'Editar cita' : 'Nueva cita'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/40 hover:text-white/70 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Color + Título */}
          <div className="flex gap-3 items-start">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Color</label>
              <div className="flex flex-wrap gap-1.5 w-[72px]">
                {COLORES.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-[#0b1421] ring-white/60' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/40 mb-1 block">Título *</label>
              <input required value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="Consultoría, Revisión de diseño…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-cyan-500/40"
              />
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/80 focus:outline-none focus:border-cyan-500/40"
              style={{ colorScheme: 'dark' }}
            />
          </div>

          {/* Horas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Hora inicio</label>
              <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/80 focus:outline-none focus:border-cyan-500/40"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Hora fin</label>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/80 focus:outline-none focus:border-cyan-500/40"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Cliente — vinculado al CRM */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-white/40">Cliente</label>
              {(clienteId || altaCliente) && (
                <button
                  type="button"
                  onClick={() => { setClienteId(null); setAltaCliente(null); setClienteNombre(''); setClienteTel(''); }}
                  className="text-[10px] text-white/40 hover:text-rose-400"
                >
                  Quitar
                </button>
              )}
            </div>

            {!clienteId && !altaCliente && crmClientes.length > 0 && (
              <div className="flex gap-1.5 mb-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const c = crmClientes.find((x) => x.id === e.target.value);
                    if (!c) return;
                    setClienteId(c.id);
                    setClienteNombre(c.nombre);
                    if (c.telefono) setClienteTel(c.telefono);
                  }}
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/70 focus:outline-none focus:border-cyan-500/40"
                >
                  <option value="" disabled className="bg-[#0F1C2A]">Elegir del CRM…</option>
                  {crmClientes.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0F1C2A]">
                      {c.nombre}{c.telefono ? ` (${c.telefono})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setAltaCliente({ nombre: '', telefono: '' })}
                  className="shrink-0 px-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/25 transition-colors"
                >
                  + Nuevo
                </button>
              </div>
            )}

            {altaCliente && (
              <div className="mb-2 space-y-1.5 rounded-xl border border-cyan-500/30 bg-white/[0.04] p-2">
                <input
                  autoFocus
                  value={altaCliente.nombre}
                  onChange={(e) => setAltaCliente({ ...altaCliente, nombre: e.target.value })}
                  placeholder="Nombre del cliente *"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/40"
                />
                <input
                  value={altaCliente.telefono}
                  onChange={(e) => setAltaCliente({ ...altaCliente, telefono: e.target.value })}
                  placeholder="Teléfono (opcional)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/40"
                />
                <p className="text-[10px] text-white/40">Se guardará en tu CRM al crear la cita.</p>
              </div>
            )}

            <label className="text-xs text-white/40 mb-1 block">
              {clienteId ? 'Cliente vinculado' : 'Nombre del cliente'}
            </label>
            <input value={clienteNombre} onChange={e => { setClienteNombre(e.target.value); setClienteId(null); }}
              placeholder="Juan Pérez (opcional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-cyan-500/40"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Teléfono (WhatsApp)</label>
              <input type="tel" value={clienteTel} onChange={e => setClienteTel(e.target.value)}
                placeholder="+52 55..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-cyan-500/40"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Email</label>
              <input type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)}
                placeholder="juan@..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-cyan-500/40"
              />
            </div>
          </div>

          {/* Estado */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Estado</label>
            <div className="flex gap-2 flex-wrap">
              {ESTADOS_CITA.map(s => (
                <button key={s.value} type="button" onClick={() => setEstado(s.value as Cita['estado'])}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-all ${estado === s.value ? s.cls : 'border-white/10 text-white/40 bg-white/4'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Indicaciones, dirección, preparativos…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </form>

        <div className="flex gap-3 px-6 py-4 border-t border-white/8">
          <button type="button" onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60 hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving}
            className="flex-1 h-10 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: color }}>
            {saving ? 'Guardando…' : cita ? 'Guardar cambios' : 'Crear cita'}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────

function DayPanel({ fecha, citas, onAdd, onEdit, onDelete, onWhatsApp, onUpdateEstado, onClose }: {
  fecha: string;
  citas: Cita[];
  onAdd: () => void;
  onEdit: (c: Cita) => void;
  onDelete: (id: string) => void;
  onWhatsApp: (c: Cita) => void;
  onUpdateEstado: (c: Cita, estado: Cita['estado']) => void;
  onClose: () => void;
}) {
  const [d, m, y] = fecha.split('-').reverse();
  const label = `${parseInt(d)} de ${MESES[parseInt(m) - 1]} ${y}`;

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-md">
      <div className="relative w-full bg-[#0b1421] border border-white/10 rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Agenda del Día</p>
            <h3 className="text-base font-semibold text-white">{label}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              <span>Cita</span>
            </button>
            <button onClick={onClose} aria-label="Cerrar" className="text-white/40 hover:text-white/70 transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {citas.length === 0 ? (
            <div className="text-center py-10 bg-white/2 border border-white/6 rounded-2xl">
              <CalendarIcon className="w-8 h-8 text-white/20 mx-auto mb-2" />
              <p className="text-white/40 text-sm">Sin citas programadas para este día</p>
              <button onClick={onAdd} className="mt-3 inline-flex items-center gap-1.5 text-cyan-400 text-xs font-medium hover:text-cyan-300 transition-colors">
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar primera cita</span>
              </button>
            </div>
          ) : citas.map(c => (
            <div key={c.id} className="group rounded-2xl border border-white/8 bg-[#0F1C2A] p-4 hover:border-cyan-500/30 transition-all space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ background: c.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{c.titulo}</span>
                    {estadoChip(c.estado, true, c)}
                  </div>
                  <p className="text-xs text-white/50 mt-1 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-cyan-400/80 shrink-0" />
                    <span>{fmtHora(c.hora_inicio)} – {fmtHora(c.hora_fin)}</span>
                  </p>
                  {c.cliente_nombre && (
                    <p className="text-xs text-white/45 mt-1 flex items-center gap-1.5">
                      <User className="w-3 h-3 text-white/40 shrink-0" />
                      <span>{c.cliente_nombre}</span>
                    </p>
                  )}
                  {c.notas && (
                    <p className="text-xs text-white/35 mt-2 p-2 rounded-xl bg-white/4 border border-white/6 leading-relaxed">
                      {c.notas}
                    </p>
                  )}
                </div>
              </div>

              {/* Quick Status Changers */}
              <div className="flex items-center gap-1.5 pt-2 border-t border-white/6 flex-wrap">
                {c.estado !== 'confirmada' && c.estado !== 'completada' && (
                  <button
                    type="button"
                    onClick={() => onUpdateEstado(c, 'confirmada')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Confirmar</span>
                  </button>
                )}
                {c.estado !== 'completada' && (
                  <button
                    type="button"
                    onClick={() => onUpdateEstado(c, 'completada')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/25 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20 transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    <span>Completar</span>
                  </button>
                )}
                {c.estado !== 'cancelada' && (
                  <button
                    type="button"
                    onClick={() => onUpdateEstado(c, 'cancelada')}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/4 border border-white/8 text-[11px] text-white/40 hover:text-red-300 hover:border-red-500/30 transition-colors ml-auto"
                  >
                    <XCircle className="w-3 h-3" />
                    <span>Cancelar</span>
                  </button>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-white/6">
                <div className="flex items-center gap-2">
                  {c.cliente_telefono && (
                    <button onClick={() => onWhatsApp(c)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/12 border border-emerald-500/25 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors font-medium">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Recordar por WA</span>
                    </button>
                  )}
                  {c.cliente_telefono && (
                    <a href={`tel:${c.cliente_telefono}`}
                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white transition-colors"
                      title="Llamar">
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => onEdit(c)} aria-label="Editar cita"
                    className="p-1.5 rounded-lg bg-white/6 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(c.id)} aria-label="Eliminar cita"
                    className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MotionModal>
  );
}

// ─── Inner (con producto global) ──────────────────────────────────────────────

function CalendarioInner({ producto, cambiarProducto }: { producto: ProductoActivo; cambiarProducto: () => void }) {
  const router = useRouter();
  const now = new Date();
  const [year,        setYear]        = useState(now.getFullYear());
  const [month,       setMonth]       = useState(now.getMonth() + 1);
  const [allCitas,    setAllCitas]    = useState<Cita[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [modalNuevo,  setModalNuevo]  = useState(false);
  const [editando,    setEditando]    = useState<Cita | null>(null);
  const [toast,       setToast]       = useState('');
  const [viewMode,    setViewMode]    = useState<'mes' | 'agenda' | 'fila'>('mes');
  const [searchAgenda, setSearchAgenda] = useState('');
  const [filtroEstadoAgenda, setFiltroEstadoAgenda] = useState<string>('');

  useEffect(() => { loadCitas(); }, [year, month]);

  async function loadCitas() {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { year, month };
      const r = await api.get('/calendario', { params });
      setAllCitas(r.data);
    } catch { setToast('Error al cargar citas'); }
    finally   { setLoading(false); }
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function citasForDay(day: number) {
    const iso = toIsoDate(year, month, day);
    return citas.filter(c => c.fecha === iso);
  }

  function handleSaved(saved: Cita) {
    const isEdit = allCitas.some(c => c.id === saved.id);
    setAllCitas(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));
    });
    setModalNuevo(false);
    setEditando(null);
    setToast(isEdit ? 'Cita actualizada' : 'Cita creada');
  }

  async function handleUpdateEstado(cita: Cita, nuevoEstado: Cita['estado']) {
    try {
      const r = await api.patch(`/calendario/${cita.id}`, { estado: nuevoEstado });
      setAllCitas(prev => prev.map(c => c.id === cita.id ? r.data : c));
      setToast(`Cita marcada como ${nuevoEstado}`);
    } catch {
      setToast('Error al actualizar estado');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta cita?')) return;
    try {
      await api.delete(`/calendario/${id}`);
      setAllCitas(prev => prev.filter(c => c.id !== id));
      setToast('Cita eliminada');
    } catch { setToast('Error al eliminar'); }
  }

  async function handleWhatsApp(cita: Cita) {
    try {
      const r = await api.post(`/calendario/${cita.id}/whatsapp`, {});
      window.open(r.data.whatsapp_url, '_blank', 'noopener');
    } catch { setToast('El cliente no tiene teléfono registrado'); }
  }

  const citas = allCitas.filter(c => c.producto_id === producto.id);
  const grid = buildGrid(year, month);
  // Fecha local: con toISOString() (UTC) por la noche en México «hoy» ya era mañana.
  const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const selectedCitas = selectedDay ? citas.filter(c => c.fecha === selectedDay) : [];

  // Stats
  const totalMes = citas.length;
  const confirmadas = citas.filter(c => c.estado === 'confirmada').length;
  const pendientes  = citas.filter(c => c.estado === 'pendiente').length;
  const completadas = citas.filter(c => c.estado === 'completada').length;

  const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 1 + i;
    return { value: String(y), label: String(y) };
  });

  // Filtered Agenda list
  const citasAgenda = useMemo(() => {
    return citas.filter(c => {
      const matchEstado = !filtroEstadoAgenda || c.estado === filtroEstadoAgenda;
      const q = searchAgenda.toLowerCase().trim();
      const matchSearch = !q ||
        c.titulo.toLowerCase().includes(q) ||
        (c.cliente_nombre && c.cliente_nombre.toLowerCase().includes(q)) ||
        (c.cliente_telefono && c.cliente_telefono.includes(q)) ||
        (c.notas && c.notas.toLowerCase().includes(q));
      return matchEstado && matchSearch;
    }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));
  }, [citas, filtroEstadoAgenda, searchAgenda]);

  const agendaStatusPills = [
    { id: '', label: 'Todas', count: citas.length },
    { id: 'confirmada', label: 'Confirmadas', count: confirmadas },
    { id: 'pendiente', label: 'Pendientes', count: pendientes },
    { id: 'completada', label: 'Completadas', count: completadas },
  ];

  return (
    <div className="min-h-screen bg-[#060e18] text-white">
      {/* Header */}
      <div className="border-b border-white/8 bg-[#060e18]/95 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Herramientas', href: '/dashboard/herramientas' },
              { label: 'Reservas & Citas' },
            ]}
          />
          <div className="flex-1" />

          {/* Dual-View Switcher Pills */}
          <div className="flex items-center gap-1 bg-white/4 border border-white/8 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setViewMode('mes')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'mes'
                  ? 'bg-cyan-600/30 border border-cyan-500/50 text-cyan-200'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Vista Mes</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'agenda'
                  ? 'bg-cyan-600/30 border border-cyan-500/50 text-cyan-200'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Agenda</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('fila')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'fila'
                  ? 'bg-cyan-600/30 border border-cyan-500/50 text-cyan-200'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Fila de hoy</span>
            </button>
          </div>

          <button onClick={() => { setSelectedDay(today); setModalNuevo(true); }}
            className="flex items-center gap-2 px-4 h-9 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-sm font-medium transition-colors shadow-lg shadow-cyan-600/20 active:scale-[0.98]">
            <Plus className="w-4 h-4" />
            <span>Nueva cita</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Reservas & Citas</h1>
            <p className="text-white/45 text-sm mt-1">Agenda visual y recordatorios directos por WhatsApp para tus clientes.</p>
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

        {/* La copia en Google y los KPIs del mes son de la agenda: en la fila
            de hoy solo estorban. */}
        {viewMode !== 'fila' && <GoogleCalendarCard onAviso={setToast} onSincronizado={loadCitas} />}

        {/* ═══ VISTA 3: FILA DE HOY (quien llega sin cita) ═══ */}
        {viewMode === 'fila' && <FilaHoy producto={producto} onAviso={setToast} />}

        {/* KPIs (Clickable to switch to agenda filtered) */}
        {viewMode !== 'fila' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: '', label: 'Citas del Mes', value: totalMes, icon: CalendarIcon, color: 'text-white' },
            { id: 'confirmada', label: 'Confirmadas', value: confirmadas, icon: CheckCircle2, color: 'text-emerald-300' },
            { id: 'pendiente', label: 'Pendientes', value: pendientes, icon: AlertCircle, color: 'text-amber-300' },
            { id: 'completada', label: 'Completadas', value: completadas, icon: Check, color: 'text-cyan-300' },
          ].map(k => {
            const Icon = k.icon;
            return (
              <button
                key={k.label}
                type="button"
                onClick={() => {
                  setViewMode('agenda');
                  setFiltroEstadoAgenda(k.id);
                }}
                className="text-left bg-white/4 border border-white/8 hover:border-cyan-500/30 hover:bg-white/6 rounded-2xl p-4 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-white/40">{k.label}</p>
                  <Icon className={`w-4 h-4 ${k.color}`} />
                </div>
                <p className={`text-2xl font-bold ${k.color} font-mono tabular-nums`}>{k.value}</p>
              </button>
            );
          })}
        </div>
        )}

        {/* ═══ VISTA 1: CALENDARIO MENSUAL ═══ */}
        {viewMode === 'mes' && (
          <div className="space-y-6">
            <div className="bg-[#0b1421] border border-white/8 rounded-3xl overflow-hidden shadow-xl">
              {/* Nav */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <button onClick={prevMonth}
                  className="w-9 h-9 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-white">{MESES[month - 1]}</h2>
                  <CustomSelect
                    value={String(year)}
                    onChange={v => setYear(Number(v))}
                    options={YEAR_OPTIONS}
                    className="w-24"
                  />
                </div>
                <button onClick={nextMonth}
                  className="w-9 h-9 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-white/6 bg-white/2">
                {DIAS.map(d => (
                  <div key={d} className="py-2.5 text-center text-xs font-semibold text-white/40 uppercase tracking-wide">
                    {d}
                  </div>
                ))}
              </div>

              {/* Grid */}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-7 h-7 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {grid.map((day, i) => {
                    if (day === null) {
                      return <div key={`e${i}`} className="min-h-[85px] border-r border-b border-white/4 last:border-r-0 bg-black/10" />;
                    }
                    const iso = toIsoDate(year, month, day);
                    const dayCitas = citasForDay(day);
                    const isToday = iso === today;
                    const isSelected = iso === selectedDay;

                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelectedDay(iso)}
                        className={`min-h-[85px] border-r border-b border-white/4 last:border-r-0 p-2 text-left transition-colors cursor-pointer
                          ${isSelected ? 'bg-cyan-500/10' : 'hover:bg-white/4'}
                          ${(i + 1) % 7 === 0 ? 'border-r-0' : ''}`}
                      >
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold mb-1
                          ${isToday ? 'bg-cyan-500 text-white font-bold' : 'text-white/60'}`}>
                          {day}
                        </span>

                        <div className="space-y-1">
                          {dayCitas.slice(0, 2).map(c => (
                            <div key={c.id} className="flex items-center gap-1 rounded-md px-1.5 py-0.5"
                              style={{ background: `${c.color}20`, borderLeft: `2px solid ${c.color}` }}>
                              <span className="text-[10px] text-white/90 truncate leading-tight font-medium">
                                {fmtHora(c.hora_inicio)} {c.titulo}
                              </span>
                            </div>
                          ))}
                          {dayCitas.length > 2 && (
                            <p className="text-[10px] text-cyan-300/60 pl-1 font-medium">+{dayCitas.length - 2} más</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Day details */}
            {selectedDay && (
              <div className="bg-[#0b1421] border border-cyan-500/25 rounded-3xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Citas para el {selectedDay} ({selectedCitas.length})
                    </h3>
                  </div>
                  <button
                    onClick={() => { setModalNuevo(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agendar en esta fecha</span>
                  </button>
                </div>

                {selectedCitas.length === 0 ? (
                  <p className="text-xs text-white/40 italic py-2">
                    No hay citas programadas para este día. Haz clic en &quot;Agendar en esta fecha&quot; para registrar una.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedCitas.map(c => (
                      <div key={c.id}
                        className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-2xl px-4 py-3 hover:border-cyan-500/30 transition-all">
                        <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: c.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{c.titulo}</p>
                          <p className="text-xs text-white/45 mt-0.5">
                            {fmtHora(c.hora_inicio)}–{fmtHora(c.hora_fin)}
                            {c.cliente_nombre ? ` · ${c.cliente_nombre}` : ''}
                            {c.notas ? ` · ${c.notas}` : ''}
                          </p>
                        </div>
                        {estadoChip(c.estado, false, c)}
                        <div className="flex items-center gap-1.5">
                          {c.cliente_telefono && (
                            <button onClick={() => handleWhatsApp(c)}
                              className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                              title="Recordar por WhatsApp">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => setEditando(c)}
                            className="p-1.5 rounded-lg bg-white/6 border border-white/10 text-white/50 hover:text-white transition-colors"
                            title="Editar cita">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Upcoming list */}
            {citas.filter(c => c.fecha >= today && c.estado !== 'cancelada').slice(0, 5).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>Próximas citas programadas</span>
                </h3>
                <div className="space-y-2">
                  {citas.filter(c => c.fecha >= today && c.estado !== 'cancelada').slice(0, 5).map(c => (
                    <div key={c.id}
                      className="flex items-center gap-3 bg-[#0F1C2A] border border-white/8 rounded-2xl px-4 py-3 hover:border-cyan-500/30 transition-all group">
                      <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: c.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{c.titulo}</p>
                        <p className="text-xs text-white/45 mt-0.5">
                          {c.fecha} · {fmtHora(c.hora_inicio)}–{fmtHora(c.hora_fin)}
                          {c.cliente_nombre ? ` · ${c.cliente_nombre}` : ''}
                        </p>
                      </div>
                      {estadoChip(c.estado, false, c)}
                      <div className="flex gap-1.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        {c.cliente_telefono && (
                          <button onClick={() => handleWhatsApp(c)} aria-label="Enviar WhatsApp"
                            className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                            title="Recordar por WhatsApp">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => setEditando(c)} aria-label="Editar cita"
                          className="p-1.5 rounded-lg bg-white/6 border border-white/10 text-white/50 hover:text-white transition-colors">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ VISTA 2: AGENDA (LISTA FILTRABLE) ═══ */}
        {viewMode === 'agenda' && (
          <div className="space-y-4">
            {/* Search + Status Pills */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <SearchInput
                  value={searchAgenda}
                  onChange={setSearchAgenda}
                  placeholder="Buscar por título, cliente, teléfono o notas…"
                  shortcutKey="f"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                {agendaStatusPills.map(p => {
                  const active = filtroEstadoAgenda === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFiltroEstadoAgenda(active ? '' : p.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                        active
                          ? 'bg-cyan-600/30 border-cyan-500/60 text-cyan-200'
                          : 'bg-white/4 border-white/8 text-white/60 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <span>{p.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold tabular-nums ${
                        active ? 'bg-cyan-500/40 text-cyan-100' : 'bg-white/10 text-white/50'
                      }`}>
                        {p.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List */}
            {citasAgenda.length === 0 ? (
              <div className="text-center py-16 bg-white/2 border border-white/6 rounded-3xl p-8">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <CalendarIcon className="w-7 h-7" />
                </div>
                <p className="text-white/60 font-medium text-sm">
                  {searchAgenda || filtroEstadoAgenda ? 'No se encontraron citas con estos filtros' : 'Sin citas programadas para este mes'}
                </p>
                <p className="text-white/40 text-xs mt-1">
                  {searchAgenda || filtroEstadoAgenda ? 'Prueba ajustando el texto o limpiando los filtros.' : 'Comienza creando una nueva cita para tu cliente.'}
                </p>
                {!searchAgenda && !filtroEstadoAgenda ? (
                  <button
                    onClick={() => { setSelectedDay(today); setModalNuevo(true); }}
                    className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear cita</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { setSearchAgenda(''); setFiltroEstadoAgenda(''); }}
                    className="mt-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/10 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {citasAgenda.map(c => (
                  <div
                    key={c.id}
                    className="bg-[#0F1C2A] border border-white/8 hover:border-cyan-500/30 rounded-2xl p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-1.5 h-12 rounded-full flex-shrink-0 mt-0.5" style={{ background: c.color }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate">{c.titulo}</span>
                          {estadoChip(c.estado, true, c)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-white/45 mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3 text-cyan-400/80" />
                            <span>{c.fecha}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-white/30" />
                            <span>{fmtHora(c.hora_inicio)} – {fmtHora(c.hora_fin)}</span>
                          </span>
                          {c.cliente_nombre && (
                            <span className="flex items-center gap-1 text-white/60">
                              <User className="w-3 h-3 text-white/30" />
                              <span>{c.cliente_nombre}</span>
                            </span>
                          )}
                        </div>
                        {c.notas && (
                          <p className="text-xs text-white/35 mt-1.5 line-clamp-1">{c.notas}</p>
                        )}
                      </div>
                    </div>

                    {/* Actions on card */}
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap border-t sm:border-t-0 pt-2 sm:pt-0 border-white/6">
                      {/* Quick Status */}
                      {c.estado === 'pendiente' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateEstado(c, 'confirmada')}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors font-medium flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Confirmar</span>
                        </button>
                      )}
                      {c.estado === 'confirmada' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateEstado(c, 'completada')}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-xs text-blue-300 hover:bg-blue-500/20 transition-colors font-medium flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          <span>Completar</span>
                        </button>
                      )}

                      {/* WhatsApp Reminder */}
                      {c.cliente_telefono && (
                        <button
                          type="button"
                          onClick={() => handleWhatsApp(c)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/25 transition-colors font-medium"
                          title="Enviar recordatorio por WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Recordar</span>
                        </button>
                      )}

                      {c.cliente_telefono && (
                        <a
                          href={`tel:${c.cliente_telefono}`}
                          className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                          title="Llamar"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditando(c)}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals & Panels */}
      <AnimatePresence>
        {selectedDay && !modalNuevo && !editando && (
          <DayPanel
            key="day-panel"
            fecha={selectedDay}
            citas={selectedCitas}
            onAdd={() => setModalNuevo(true)}
            onEdit={c => setEditando(c)}
            onDelete={handleDelete}
            onWhatsApp={handleWhatsApp}
            onUpdateEstado={handleUpdateEstado}
            onClose={() => setSelectedDay(null)}
          />
        )}

        {(modalNuevo || editando) && (
          <CitaModal
            key="cita-modal"
            cita={editando}
            defaultFecha={selectedDay ?? today}
            negocioId={producto.negocio_id}
            productoId={producto.id}
            onClose={() => { setModalNuevo(false); setEditando(null); }}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>

      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarioPage() {
  return (
    <HerramientaGate herramienta="citas" nombre="Reservas & Citas" acento="cyan">
    <ProductoGate herramienta="Reservas & Citas" acento="cyan">
      {({ producto, cambiarProducto }) => (
        <CalendarioInner producto={producto} cambiarProducto={cambiarProducto} />
      )}
    </ProductoGate>
    </HerramientaGate>
  );
}