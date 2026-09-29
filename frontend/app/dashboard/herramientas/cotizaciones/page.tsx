'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Plus,
  Copy,
  Printer,
  Share2,
  Trash2,
  Edit3,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Clock,
  FileText,
  Percent,
  X,
  Send,
  Download,
  ShoppingCart,
} from 'lucide-react';
import api, { hayRespuestaDelServidor, nuevaClaveIdempotencia } from '../../../../lib/api';
import CustomSelect from '../../../../components/ui/CustomSelect';
import ProductoGate from '@/components/herramientas/ProductoGate';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import { ProductoActivo } from '@/lib/productoActivo';
import { getTaxConfig } from '@/lib/taxConfig';
import { enlaceWhatsApp } from '@/lib/whatsapp';
import { MotionModal } from '@/components/motion/MotionModal';
import { Breadcrumbs, SearchInput, Toast } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Item {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface Cotizacion {
  id: string;
  numero: string;
  cliente_nombre: string;
  cliente_empresa: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  items: Item[];
  subtotal: number;
  descuento_pct: number;
  descuento_monto: number;
  impuesto_tasa: number;
  impuesto_nombre: string;
  impuesto_monto: number;
  total: number;
  moneda: string;
  estado: 'borrador' | 'enviada' | 'aceptada' | 'rechazada';
  fecha_vencimiento: string | null;
  notas: string | null;
  negocio_id: string | null;
  producto_id: string | null;
  cliente_id?: string | null;
  marca_nombre: string | null;
  marca_color: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
  /** Venta vigente creada desde esta cotización (null si aún no se vende o se canceló). */
  venta_id?: string | null;
  venta_ticket?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTADOS = [
  { value: 'borrador',  label: 'Borrador',  cls: 'bg-white/8 text-white/50 border-white/15' },
  { value: 'enviada',   label: 'Enviada',   cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'aceptada',  label: 'Aceptada',  cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { value: 'rechazada', label: 'Rechazada', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
];
const MONEDAS = ['USD', 'MXN', 'COP', 'PEN', 'ARS', 'CLP', 'BRL', 'EUR'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

function fmtDateLong(s: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return s; }
}

function estadoChip(estado: Cotizacion['estado']) {
  const e = ESTADOS.find(s => s.value === estado)!;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${e.cls}`}>{e.label}</span>;
}

function calcItem(item: Omit<Item, 'subtotal'>): Item {
  return { ...item, subtotal: Math.round(item.cantidad * item.precio_unitario * 100) / 100 };
}

function clamp(n: number, min: number, max: number): number {
  if (!isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}



// ─── Print Modal (PDF via window.print) ───────────────────────────────────────

function PrintModal({ cot, onClose }: { cot: Cotizacion; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const acento = cot.marca_color || '#3B82F6';

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    // Validate accent color to prevent CSS injection — only allow hex colors
    const safeAcento = /^#[0-9A-Fa-f]{3,8}$/.test(acento) ? acento : '#3B82F6';
    // Set title via property, not innerHTML, to avoid XSS
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title></title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 48px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
        .brand-name { font-size: 24px; font-weight: 700; color: ${safeAcento}; letter-spacing: -0.3px; }
        .brand-sub { font-size: 11px; color: #999; margin-top: 3px; }
        .cot-num { text-align: right; }
        .cot-num h2 { font-size: 20px; font-weight: 700; color: #111; }
        .cot-num p { font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }
        .divider { border: none; border-top: 1.5px solid ${safeAcento}; opacity: 0.25; margin: 0 0 24px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 28px; }
        .meta-label { font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 4px; }
        .meta-value { font-size: 13px; font-weight: 600; color: #111; }
        .meta-light { font-size: 12px; color: #555; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; }
        thead { background: ${safeAcento}; }
        thead th { color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; }
        thead th:not(:first-child) { text-align: right; }
        tbody tr:nth-child(even) { background: #f9f9fc; }
        td { padding: 8px 10px; font-size: 12px; color: #333; }
        td:not(:first-child) { text-align: right; }
        .totals { margin-top: 20px; display: flex; justify-content: flex-end; }
        .totals-box { width: 220px; }
        .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #666; }
        .total-final { background: ${safeAcento}; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; margin-top: 8px; }
        .total-final span { font-size: 14px; font-weight: 700; color: #fff; }
        .notes { margin-top: 32px; padding: 14px; background: #f8f8fc; border-radius: 8px; border-left: 3px solid ${safeAcento}; }
        .notes-label { font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
        .notes-text { font-size: 12px; color: #555; line-height: 1.6; }
        .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 10px; color: #ccc; border-top: 1px solid #eee; padding-top: 12px; }
        @media print { body { padding: 24px; } }
      </style>
    </head><body></body></html>`);
    win.document.close();
    // Set title and body content via DOM API — avoids HTML injection
    win.document.title = cot.numero;
    win.document.body.innerHTML = content;
    win.focus();
    win.addEventListener('load', () => { win.print(); }, { once: true });
    // Fallback for already-loaded windows
    setTimeout(() => { if (win.document.readyState === 'complete') { win.print(); } }, 400);
  }

  const subtotal = Number(cot.subtotal);
  const descMonto = Number(cot.descuento_monto);
  const impMonto = Number(cot.impuesto_monto);
  const total = Number(cot.total);

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-2xl">
      <div className="relative w-full bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700">{cot.numero} · Vista previa</span>
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors text-white"
              style={{ background: acento }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Descargar PDF</span>
            </button>
            <button onClick={onClose} aria-label="Cerrar vista previa"
              className="px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-200 transition-colors flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="overflow-y-auto flex-1 p-6 bg-gray-100">
          <div ref={printRef} className="bg-white rounded-xl shadow-sm p-10 text-gray-800 min-h-full">

            {/* Header */}
            <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
              <div>
                <div className="brand-name" style={{ fontSize: 24, fontWeight: 700, color: acento }}>{cot.marca_nombre || 'Mi Negocio'}</div>
                <div className="brand-sub" style={{ fontSize: 11, color: '#999', marginTop: 3 }}>Cotización Comercial</div>
              </div>
              <div className="cot-num" style={{ textAlign: 'right' }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{cot.numero}</h2>
                <p style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 2 }}>Número de cotización</p>
              </div>
            </div>

            <hr className="divider" style={{ border: 'none', borderTop: `1.5px solid ${acento}`, opacity: 0.25, marginBottom: 24 }} />

            {/* Meta */}
            <div className="meta" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 28 }}>
              <div>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>Cliente</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{cot.cliente_nombre}</div>
                {cot.cliente_empresa && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{cot.cliente_empresa}</div>}
                {cot.cliente_email && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{cot.cliente_email}</div>}
                {cot.cliente_telefono && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{cot.cliente_telefono}</div>}
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>Fecha de emisión</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{fmtDateLong(cot.fecha_creacion)}</div>
                {cot.fecha_vencimiento && (
                  <>
                    <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.7px', marginTop: 10, marginBottom: 4 }}>Válida hasta</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{fmtDateLong(cot.fecha_vencimiento)}</div>
                  </>
                )}
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>Moneda</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{cot.moneda}</div>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.7px', marginTop: 10, marginBottom: 4 }}>Estado</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{cot.estado.charAt(0).toUpperCase() + cot.estado.slice(1)}</div>
              </div>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: acento }}>
                  {['Descripción', 'Cant.', 'Precio unit.', 'Subtotal'].map((h, i) => (
                    <th key={h} style={{ color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cot.items.map((item, i) => (
                  <tr key={i} style={{ background: i % 2 === 1 ? '#f9f9fc' : '#fff' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#333' }}>{item.descripcion}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#333', textAlign: 'right' }}>{item.cantidad}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#333', textAlign: 'right' }}>{cot.moneda} ${Number(item.precio_unitario).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#333', textAlign: 'right' }}>{cot.moneda} ${Number(item.subtotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, color: '#666' }}>
                  <span>Subtotal</span><span>{cot.moneda} ${subtotal.toFixed(2)}</span>
                </div>
                {Number(cot.descuento_pct) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, color: '#666' }}>
                    <span>Descuento ({Number(cot.descuento_pct).toFixed(0)}%)</span>
                    <span>- {cot.moneda} ${descMonto.toFixed(2)}</span>
                  </div>
                )}
                {Number(cot.impuesto_tasa) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, color: '#666' }}>
                    <span>{cot.impuesto_nombre} ({Number(cot.impuesto_tasa).toFixed(0)}%)</span>
                    <span>{cot.moneda} ${impMonto.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ background: acento, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>TOTAL</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{cot.moneda} ${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {cot.notas && (
              <div style={{ marginTop: 32, padding: 14, background: '#f8f8fc', borderRadius: 8, borderLeft: `3px solid ${acento}` }}>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>Notas y condiciones</div>
                <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{cot.notas}</div>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#ccc', borderTop: '1px solid #eee', paddingTop: 12 }}>
              <span>{cot.marca_nombre || 'Mi Negocio'} · {cot.numero}</span>
              <span>Generado con BI 0 A 100</span>
            </div>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, onChange, onRemove }: {
  item: Item;
  onChange: (updated: Item) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col sm:grid sm:grid-cols-[1fr_60px_88px_88px_32px] gap-2 items-stretch sm:items-center bg-white/[0.02] sm:bg-transparent p-2.5 sm:p-0 rounded-xl sm:rounded-none border border-white/5 sm:border-0">
      <input value={item.descripcion}
        onChange={e => onChange(calcItem({ ...item, descripcion: e.target.value }))}
        placeholder="Descripción del producto o servicio"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-9 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/40"
      />
      <div className="flex items-center gap-2 sm:contents">
        <div className="flex-1 sm:flex-initial">
          <span className="text-[10px] text-white/40 sm:hidden block mb-0.5">Cant.</span>
          <input type="number" min="1" value={item.cantidad}
            onChange={e => onChange(calcItem({ ...item, cantidad: Math.max(1, Number(e.target.value) || 1) }))}
            className="w-full sm:w-auto bg-white/5 border border-white/10 rounded-xl px-2 h-9 text-sm text-white text-center focus:outline-none focus:border-blue-500/40"
          />
        </div>
        <div className="flex-1 sm:flex-initial">
          <span className="text-[10px] text-white/40 sm:hidden block mb-0.5">Precio</span>
          <input type="number" min="0" step="0.01" value={item.precio_unitario}
            onChange={e => onChange(calcItem({ ...item, precio_unitario: Math.max(0, Number(e.target.value) || 0) }))}
            className="w-full sm:w-auto bg-white/5 border border-white/10 rounded-xl px-2 h-9 text-sm text-white text-right focus:outline-none focus:border-blue-500/40 font-mono"
          />
        </div>
        <div className="flex-1 sm:flex-initial">
          <span className="text-[10px] text-white/40 sm:hidden block mb-0.5">Subtotal</span>
          <div className="h-9 rounded-xl bg-blue-500/8 border border-blue-500/15 flex items-center justify-end px-3 text-sm text-blue-300 font-medium font-mono">
            {item.subtotal.toFixed(2)}
          </div>
        </div>
        <button type="button" onClick={onRemove} aria-label="Eliminar ítem" className="shrink-0 text-white/40 hover:text-red-400 transition-colors text-lg leading-none p-2 sm:p-0">×</button>
      </div>
    </div>
  );
}

// ─── Modal: Crear / Editar ────────────────────────────────────────────────────

/** Cliente del CRM con el que se abre una cotización nueva (`?cliente=<id>`). */
interface ClientePrefill {
  id: string;
  nombre: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
}

function CotizacionModal({ cotizacion, clientePrefill, negocioId, productoId, monedaCuenta, impuestoCuenta, onClose, onSaved }: {
  /** Con `id` vacío es un duplicado: se crea una cotización nueva a partir de ella. */
  cotizacion: Cotizacion | null;
  clientePrefill?: ClientePrefill | null;
  negocioId: string | null;
  productoId: string;
  /** Moneda del país del producto (MXN en México). */
  monedaCuenta: string;
  /** Impuesto al consumo del país (IVA 16 % en México), en porcentaje. */
  impuestoCuenta: { nombre: string; tasaPct: number };
  onClose: () => void;
  onSaved: (c: Cotizacion) => void;
}) {
  const emptyItem = (): Item => ({ descripcion: '', cantidad: 1, precio_unitario: 0, subtotal: 0 });
  const esEdicion = Boolean(cotizacion?.id);

  const [clienteNombre,  setClienteNombre]  = useState(cotizacion?.cliente_nombre ?? clientePrefill?.nombre ?? '');
  const [clienteEmpresa, setClienteEmpresa] = useState(cotizacion?.cliente_empresa ?? clientePrefill?.empresa ?? '');
  const [clienteEmail,   setClienteEmail]   = useState(cotizacion?.cliente_email ?? clientePrefill?.email ?? '');
  const [clienteTel,     setClienteTel]     = useState(cotizacion?.cliente_telefono ?? clientePrefill?.telefono ?? '');
  const [items,          setItems]          = useState<Item[]>(cotizacion?.items?.length ? cotizacion.items : [emptyItem()]);
  const [descuentoPct,   setDescuentoPct]   = useState(Number(cotizacion?.descuento_pct ?? 0));
  // Una cotización nueva arranca con el impuesto del país, como el POS: con 0 %
  // el total salía sin IVA y el negocio cotizaba de menos si no lo notaba.
  const [impuestoTasa,   setImpuestoTasa]   = useState(Number(cotizacion?.impuesto_tasa ?? impuestoCuenta.tasaPct));
  const [impuestoNombre, setImpuestoNombre] = useState(cotizacion?.impuesto_nombre ?? impuestoCuenta.nombre);
  // La del país del producto, no 'USD' fijo: el formulario siempre manda la
  // moneda, así que el backend nunca llegaba a aplicar monedaDeCuenta() y una
  // cotización de un negocio mexicano salía en dólares.
  const [moneda,         setMoneda]         = useState(cotizacion?.moneda ?? monedaCuenta);
  const [estado,         setEstado]         = useState<Cotizacion['estado']>(cotizacion?.estado ?? 'borrador');
  const [fechaVenc,      setFechaVenc]      = useState(cotizacion?.fecha_vencimiento ?? '');
  const [notas,          setNotas]          = useState(cotizacion?.notas ?? '');
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  const subtotal  = items.reduce((s, i) => s + i.subtotal, 0);
  const descMonto = Math.round(subtotal * (descuentoPct / 100) * 100) / 100;
  const baseImp   = subtotal - descMonto;
  const impMonto  = Math.round(baseImp * (impuestoTasa / 100) * 100) / 100;
  const total     = Math.round((baseImp + impMonto) * 100) / 100;

  function updateItem(i: number, updated: Item) {
    setItems(prev => { const next = [...prev]; next[i] = updated; return next; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteNombre.trim()) { setError('El nombre del cliente es requerido'); return; }
    if (items.length === 0)    { setError('Agrega al menos un ítem'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        cliente_nombre:   clienteNombre.trim(),
        cliente_empresa:  clienteEmpresa.trim() || null,
        cliente_email:    clienteEmail.trim() || null,
        cliente_telefono: clienteTel.trim() || null,
        items,
        descuento_pct:    descuentoPct,
        impuesto_tasa:    impuestoTasa,
        impuesto_nombre:  impuestoNombre,
        moneda, estado,
        fecha_vencimiento: fechaVenc || null,
        notas: notas.trim() || null,
        negocio_id:  negocioId,
        producto_id: productoId,
        // Vínculo con el expediente del CRM (solo al crear; editar no lo cambia).
        ...(esEdicion ? {} : { cliente_id: clientePrefill?.id ?? cotizacion?.cliente_id ?? null }),
      };
      // Un duplicado trae los datos de otra cotización pero sin id: se crea.
      const r = esEdicion
        ? await api.patch(`/cotizaciones/${cotizacion!.id}`, payload)
        : await api.post('/cotizaciones', payload);
      onSaved(r.data);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg || 'No se pudo guardar la cotización. Revisa tu conexión e inténtalo de nuevo.');
    }
    finally   { setSaving(false); }
  }

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-2xl">
      <div className="relative w-full bg-[#0b1421] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">
            {esEdicion ? `Editar ${cotizacion!.numero}` : 'Nueva cotización'}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/40 hover:text-white/70 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Cliente */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Datos del cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-white/40 mb-1 block">Nombre *</label>
                <input required value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Juan Pérez"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500/40" />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Empresa</label>
                <input value={clienteEmpresa} onChange={e => setClienteEmpresa(e.target.value)} placeholder="Empresa S.A."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500/40" />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Teléfono (WhatsApp)</label>
                <input type="tel" value={clienteTel} onChange={e => setClienteTel(e.target.value)} placeholder="+52 55 1234 5678"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500/40" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-white/40 mb-1 block">Email</label>
                <input type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="juan@empresa.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500/40" />
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Ítems / Servicios</p>
            <div className="hidden sm:grid sm:grid-cols-[1fr_60px_88px_88px_32px] gap-2 mb-2">
              {['Descripción', 'Cant.', 'Precio', 'Subtotal', ''].map(h => (
                <span key={h} className="text-xs text-white/40 text-right first:text-left">{h}</span>
              ))}
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <ItemRow key={i} item={item} onChange={u => updateItem(i, u)} onRemove={() => setItems(p => p.filter((_, idx) => idx !== i))} />
              ))}
            </div>
            <button type="button" onClick={() => setItems(p => [...p, emptyItem()])}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors">
              <span className="text-lg leading-none">+</span> Agregar ítem
            </button>
          </div>

          {/* Descuento + Impuesto */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Descuento (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={descuentoPct} onChange={e => setDescuentoPct(clamp(Number(e.target.value), 0, 100))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white focus:outline-none focus:border-blue-500/40" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Impuesto (%)</label>
              <input type="number" min="0" max="99" step="0.1" value={impuestoTasa} onChange={e => setImpuestoTasa(clamp(Number(e.target.value), 0, 99))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white focus:outline-none focus:border-blue-500/40" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Nombre impuesto</label>
              <input value={impuestoNombre} onChange={e => setImpuestoNombre(e.target.value)} placeholder="IVA"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500/40" />
            </div>
          </div>

          {/* Resumen vivo */}
          <div className="rounded-2xl bg-white/3 border border-white/8 p-4 space-y-2">
            {[
              { label: 'Subtotal', value: subtotal.toFixed(2) },
              ...(descuentoPct > 0 ? [{ label: `Descuento ${descuentoPct}%`, value: `-${descMonto.toFixed(2)}` }] : []),
              ...(impuestoTasa > 0 ? [{ label: `${impuestoNombre} ${impuestoTasa}%`, value: impMonto.toFixed(2) }] : []),
            ].map(row => (
              <div key={row.label} className="flex justify-between text-sm text-white/50">
                <span>{row.label}</span><span>{moneda} ${row.value}</span>
              </div>
            ))}
            <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-white/10">
              <span>Total</span><span>{moneda} ${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Config */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Moneda</label>
              <CustomSelect
                value={moneda}
                onChange={setMoneda}
                options={(MONEDAS.includes(monedaCuenta) ? MONEDAS : [monedaCuenta, ...MONEDAS]).map(m => ({ value: m, label: m }))}
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Estado</label>
              <CustomSelect
                value={estado}
                onChange={v => setEstado(v as Cotizacion['estado'])}
                options={ESTADOS.map(s => ({ value: s.value, label: s.label }))}
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Válida hasta</label>
              <input type="date" value={fechaVenc} onChange={e => setFechaVenc(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white/70 focus:outline-none" style={{ colorScheme: 'dark' }} />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Notas / Condiciones</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
              placeholder="Vigencia de la cotización, términos de pago, garantías…"
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
            className="flex-1 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear cotización'}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}

// ─── Convertir en venta ───────────────────────────────────────────────────────

const METODOS_PAGO = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'tarjeta',       label: 'Tarjeta' },
  { value: 'otro',          label: 'Otro' },
] as const;

type MetodoPago = typeof METODOS_PAGO[number]['value'];

function ConvertirVentaModal({ cot, onClose, onConvertida }: {
  cot: Cotizacion;
  onClose: () => void;
  onConvertida: (venta: { id: string; numero_ticket: string }) => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Una clave por intento: si la red se corta, el reintento no crea otra venta.
  const clave = useRef(nuevaClaveIdempotencia());

  async function convertir() {
    setGuardando(true);
    setError('');
    try {
      const { data } = await api.post(
        `/cotizaciones/${cot.id}/convertir-venta`,
        { metodo_pago: metodo },
        { headers: { 'Idempotency-Key': clave.current } },
      );
      onConvertida(data.venta);
    } catch (err) {
      if (hayRespuestaDelServidor(err)) clave.current = nuevaClaveIdempotencia();
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'No se pudo registrar la venta. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-md">
      <div className="relative w-full bg-[#0b1421] border border-white/10 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">Convertir {cot.numero} en venta</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/40 hover:text-white/70 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-white/70">
            Se registra la venta a <span className="text-white font-semibold">{cot.cliente_nombre}</span> por{' '}
            <span className="text-white font-semibold font-mono">{cot.moneda} ${Number(cot.total).toFixed(2)}</span> con fecha de hoy:
            el ticket aparece en el Punto de Venta y el ingreso en Contabilidad.
          </p>
          <p className="text-xs text-white/40">
            Los conceptos de la cotización no son artículos del catálogo, así que no descuentan almacén.
          </p>

          <div>
            <p className="text-xs text-white/40 mb-2" id="metodo-pago-cot">Método de pago</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="metodo-pago-cot">
              {METODOS_PAGO.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={metodo === m.value}
                  onClick={() => setMetodo(m.value)}
                  className={`h-10 rounded-xl border text-sm transition-colors ${
                    metodo === m.value
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs" role="alert">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-white/8">
          <button type="button" onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60 hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={convertir} disabled={guardando}
            className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {guardando ? 'Registrando…' : 'Registrar venta'}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}

// ─── Inner (con producto global) ──────────────────────────────────────────────

function CotizacionesInner({ producto, cambiarProducto }: { producto: ProductoActivo; cambiarProducto: () => void }) {
  const router = useRouter();
  const [allCots, setAllCots] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [searchCotizaciones, setSearchCotizaciones] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editando, setEditando] = useState<Cotizacion | null>(null);
  const [printTarget, setPrintTarget] = useState<Cotizacion | null>(null);
  const [convirtiendo, setConvirtiendo] = useState<Cotizacion | null>(null);
  const [clientePrefill, setClientePrefill] = useState<ClientePrefill | null>(null);
  const [toast, setToast] = useState('');

  // Solo las del producto activo: sin filtro, la página de 200 se llenaba con
  // las de otros productos y las de este dejaban de verse.
  // `vigente` descarta la respuesta de un producto anterior si se cambia rápido.
  useEffect(() => {
    let vigente = true;
    api.get('/cotizaciones', { params: { producto_id: producto.id } })
      .then((r) => { if (vigente) setAllCots(r.data); })
      .catch(() => { if (vigente) setToast('Error al cargar cotizaciones'); })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [producto.id]);

  // «Crear cotización» desde la ficha de un cliente llega con ?cliente=<id>: se
  // abre el formulario con sus datos y la cotización queda ligada al expediente.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('cliente');
    if (!id) return;
    window.history.replaceState(null, '', window.location.pathname);
    api.get(`/clientes/${id}`)
      .then(({ data }) => {
        setClientePrefill({ id: data.id, nombre: data.nombre, empresa: data.empresa ?? null, email: data.email ?? null, telefono: data.telefono ?? null });
        setEditando(null);
        setModalNuevo(true);
      })
      .catch(() => setToast('No se encontró el cliente'));
  }, []);

  function handleSaved(saved: Cotizacion) {
    setAllCots((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setModalNuevo(false);
    setEditando(null);
    setClientePrefill(null);
    setToast(editando?.id ? 'Cotización actualizada' : `${saved.numero} creada`);
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta cotización?')) return;
    try {
      await api.delete(`/cotizaciones/${id}`);
      setAllCots((prev) => prev.filter((c) => c.id !== id));
      setToast('Cotización eliminada');
    } catch {
      setToast('Error al eliminar');
    }
  }

  async function handleWhatsApp(cot: Cotizacion) {
    try {
      const r = await api.post(`/cotizaciones/${cot.id}/whatsapp`, {});
      const { whatsapp_url, cotizacion: updated } = r.data;
      setAllCots((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      window.open(whatsapp_url, '_blank', 'noopener');
    } catch {
      const msg = `Hola ${cot.cliente_nombre || ''}. Te comparto los detalles de tu cotización *${cot.numero}* por un monto de *${cot.moneda} $${Number(cot.total).toFixed(2)}*.\n\nQuedo a tu disposición para confirmar el inicio de tu proyecto.`;
      window.open(enlaceWhatsApp(cot.cliente_telefono, producto.pais, msg), '_blank', 'noopener');
    }
  }

  function handleDuplicate(cot: Cotizacion) {
    setEditando({
      ...cot,
      id: '',
      numero: 'Borrador',
      estado: 'borrador',
      venta_id: null,
      venta_ticket: null,
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString(),
    });
  }

  async function handleQuickStatus(cot: Cotizacion, nuevoEstado: Cotizacion['estado']) {
    try {
      const { data } = await api.patch(`/cotizaciones/${cot.id}`, { estado: nuevoEstado });
      setAllCots((prev) => prev.map((c) => (c.id === cot.id ? (data as Cotizacion) : c)));
      setToast(`Cotización actualizada a "${nuevoEstado}"`);
    } catch {
      setToast('No se pudo actualizar el estado');
    }
  }

  const cotizaciones = useMemo(() => allCots.filter((c) => c.producto_id === producto.id), [allCots, producto.id]);

  const visibles = useMemo(() => {
    return cotizaciones.filter((c) => {
      if (filtroEstado && c.estado !== filtroEstado) return false;
      const q = searchCotizaciones.toLowerCase().trim();
      if (!q) return true;
      return (
        c.numero.toLowerCase().includes(q) ||
        c.cliente_nombre.toLowerCase().includes(q) ||
        (c.cliente_empresa && c.cliente_empresa.toLowerCase().includes(q)) ||
        (c.cliente_email && c.cliente_email.toLowerCase().includes(q))
      );
    });
  }, [cotizaciones, filtroEstado, searchCotizaciones]);

  const stats = useMemo(() => {
    const total = cotizaciones.length;
    const enviadas = cotizaciones.filter((c) => c.estado === 'enviada').length;
    const aceptadas = cotizaciones.filter((c) => c.estado === 'aceptada').length;
    const rechazadas = cotizaciones.filter((c) => c.estado === 'rechazada').length;
    const borradores = cotizaciones.filter((c) => c.estado === 'borrador').length;
    const valorTotal = cotizaciones.reduce((s, c) => s + Number(c.total || 0), 0);
    const valorGanado = cotizaciones.filter((c) => c.estado === 'aceptada').reduce((s, c) => s + Number(c.total || 0), 0);
    const tasaConversion = total > 0 ? Math.round((aceptadas / total) * 100) : 0;

    return { total, enviadas, aceptadas, rechazadas, borradores, valorTotal, valorGanado, tasaConversion };
  }, [cotizaciones]);

  const exportarCotizacionesCsv = () => {
    if (visibles.length === 0) {
      alert('No hay cotizaciones para exportar con los filtros actuales.');
      return;
    }

    const headers = [
      'Folio',
      'Cliente',
      'Empresa',
      'Email',
      'Telefono',
      'Subtotal',
      'Descuento %',
      'Descuento Monto',
      'Impuesto Nombre',
      'Impuesto Tasa',
      'Impuesto Monto',
      'Total',
      'Moneda',
      'Estado',
      'Vencimiento',
      'Fecha Creacion',
      'Notas',
    ];

    const rows = visibles.map((c) => [
      `"${c.numero}"`,
      `"${(c.cliente_nombre || '').replace(/"/g, '""')}"`,
      `"${(c.cliente_empresa || '').replace(/"/g, '""')}"`,
      `"${(c.cliente_email || '').replace(/"/g, '""')}"`,
      `"${(c.cliente_telefono || '').replace(/"/g, '""')}"`,
      Number(c.subtotal || 0).toFixed(2),
      Number(c.descuento_pct || 0).toFixed(2),
      Number(c.descuento_monto || 0).toFixed(2),
      `"${c.impuesto_nombre || ''}"`,
      Number(c.impuesto_tasa || 0).toFixed(2),
      Number(c.impuesto_monto || 0).toFixed(2),
      Number(c.total || 0).toFixed(2),
      `"${c.moneda || 'USD'}"`,
      `"${c.estado}"`,
      `"${c.fecha_vencimiento || ''}"`,
      `"${c.fecha_creacion || ''}"`,
      `"${(c.notas || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `cotizaciones-${(producto.nombre || 'catalogo').toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative px-4 sm:px-6 py-8 max-w-7xl mx-auto pb-24 text-white">
      {/* Ambient glows */}
      <div className="fixed top-[-10%] right-[-8%] w-[45vh] h-[45vh] bg-blue-500/8 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-12%] left-[-10%] w-[35vh] h-[35vh] bg-emerald-500/5 rounded-full blur-[110px] pointer-events-none" />

      {/* Breadcrumb */}
      <Breadcrumbs
        showBack
        backHref="/dashboard/herramientas"
        backLabel="Herramientas"
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Herramientas', href: '/dashboard/herramientas' },
          { label: 'Cotizaciones' },
        ]}
        className="mb-6"
      />

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Ventas & Propuestas
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Cotizaciones & Propuestas PDF</h1>
          <p className="text-sm text-white/50 mt-1">
            Diseña presupuestos profesionales, compártelos por WhatsApp y acelera el cierre de tratos.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Catálogo Asociado</p>
              <p className="text-sm font-semibold text-white truncate max-w-[180px]">{producto.nombre}</p>
            </div>
            <button
              onClick={cambiarProducto}
              className="text-[11px] font-semibold text-blue-300 border border-blue-500/30 rounded-lg px-2.5 py-1 hover:bg-blue-500/10 transition-colors"
            >
              Cambiar
            </button>
          </div>

          <button
            onClick={exportarCotizacionesCsv}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 font-semibold text-xs transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>

          <button
            onClick={() => { setEditando(null); setModalNuevo(true); }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Nueva Cotización
          </button>
        </div>
      </div>

      {/* Conversion KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#0F1C2A] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Cotizado</span>
            <FileText className="w-4 h-4 text-white/30" />
          </div>
          <p className="text-2xl font-bold text-white my-1 font-mono tabular-nums">
            ${stats.valorTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-white/40">{stats.total} propuestas generadas</p>
        </div>

        <div className="bg-[#0F1C2A] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Ganado</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-300 my-1 font-mono tabular-nums">
            ${stats.valorGanado.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-emerald-400/80">{stats.aceptadas} cotizaciones aceptadas</p>
        </div>

        <div className="bg-[#0F1C2A] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Tasa de Cierre</span>
            <Percent className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-300 my-1 font-mono tabular-nums">{stats.tasaConversion}%</p>
          <p className="text-[10px] text-white/40">Conversión sobre total</p>
        </div>

        <div className="bg-[#0F1C2A] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">En Seguimiento</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-300 my-1 font-mono tabular-nums">{stats.enviadas + stats.borradores}</p>
          <p className="text-[10px] text-white/40">{stats.enviadas} enviadas · {stats.borradores} borradores</p>
        </div>
      </div>

      {/* Filters & Search bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        <div className="w-full sm:max-w-sm">
          <SearchInput
            value={searchCotizaciones}
            onChange={setSearchCotizaciones}
            placeholder="Buscar cotización, cliente o empresa..."
            shortcutKey="f"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { value: '', label: 'Todas', count: stats.total },
            { value: 'borrador', label: 'Borrador', count: stats.borradores },
            { value: 'enviada', label: 'Enviada', count: stats.enviadas },
            { value: 'aceptada', label: 'Aceptada', count: stats.aceptadas },
            { value: 'rechazada', label: 'Rechazada', count: stats.rechazadas },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setFiltroEstado(s.value)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${
                filtroEstado === s.value
                  ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                  : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white'
              }`}
            >
              <span>{s.label}</span>
              <span className={`text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.2 rounded-full ${
                filtroEstado === s.value ? 'bg-blue-500/40 text-blue-100' : 'bg-white/10 text-white/40'
              }`}>
                {s.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-20 rounded-2xl bg-white/[0.03] border border-white/8 animate-pulse" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 bg-[#0F1C2A]/60 border border-white/10 rounded-3xl">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <FileText className="w-7 h-7" />
          </div>
          <p className="text-white/60 text-sm font-semibold">
            {searchCotizaciones || filtroEstado ? 'No se encontraron cotizaciones con los filtros actuales' : 'Sin cotizaciones aún'}
          </p>
          <p className="text-white/40 text-xs mt-1 max-w-sm mx-auto">
            {searchCotizaciones || filtroEstado
              ? 'Intenta restablecer la búsqueda o seleccionar otra categoría.'
              : 'Empieza cotizando a tu primer cliente potencial con un PDF profesional.'}
          </p>
          <button
            onClick={() => {
              if (searchCotizaciones || filtroEstado) {
                setSearchCotizaciones('');
                setFiltroEstado('');
              } else {
                setEditando(null);
                setModalNuevo(true);
              }
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors"
          >
            {searchCotizaciones || filtroEstado ? 'Restablecer Filtros' : 'Crear Cotización'}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibles.map((cot) => (
            <div
              key={cot.id}
              className="relative flex flex-col sm:flex-row sm:items-center gap-3 bg-[#0F1C2A] border border-white/8 rounded-2xl px-5 py-4 hover:border-blue-500/30 transition-all group overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.08] before:to-transparent"
            >
              <div className="flex-shrink-0 sm:w-32">
                <p className="text-sm font-mono font-bold text-white">{cot.numero}</p>
                <div className="mt-1">{estadoChip(cot.estado)}</div>
                {cot.venta_ticket && (
                  <p className="mt-1 text-[11px] text-emerald-300/80 font-mono" title="Venta registrada en el Punto de Venta">
                    Vendida · {cot.venta_ticket}
                  </p>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{cot.cliente_nombre}</p>
                <p className="text-xs text-white/40 truncate">
                  {cot.cliente_empresa ? `${cot.cliente_empresa} · ` : ''}
                  {cot.items?.length ?? 0} concepto(s)
                  {cot.fecha_vencimiento && ` · Vence: ${fmtDate(cot.fecha_vencimiento)}`}
                </p>
              </div>

              <div className="text-left sm:text-right flex-shrink-0">
                <p className="text-base font-bold text-white font-mono tabular-nums">
                  {cot.moneda} ${Number(cot.total).toFixed(2)}
                </p>
                <p className="text-[11px] text-white/40 font-mono tabular-nums">{fmtDate(cot.fecha_creacion)}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-wrap pt-2 sm:pt-0 border-t sm:border-t-0 border-white/8">
                {cot.estado !== 'aceptada' && (
                  <button
                    onClick={() => handleQuickStatus(cot, 'aceptada')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/25 transition-colors font-semibold"
                    title="Marcar como ganada / aceptada"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Aceptar</span>
                  </button>
                )}

                {!cot.venta_id && cot.estado !== 'rechazada' && (
                  <button
                    onClick={() => setConvirtiendo(cot)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600/80 border border-emerald-500/40 text-xs text-white hover:bg-emerald-500 transition-colors font-semibold"
                    title="Registrar la venta en el Punto de Venta y el ingreso en Contabilidad"
                    aria-label={`Convertir ${cot.numero} en venta`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Vender</span>
                  </button>
                )}

                {cot.estado === 'borrador' && (
                  <button
                    onClick={() => handleQuickStatus(cot, 'enviada')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs text-blue-300 hover:bg-blue-500/25 transition-colors font-semibold"
                    title="Marcar como enviada al cliente"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Enviada</span>
                  </button>
                )}

                <button
                  onClick={() => setPrintTarget(cot)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title="Vista previa e imprimir PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>

                <button
                  onClick={() => handleWhatsApp(cot)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                  title="Compartir por WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>

                <button
                  onClick={() => handleDuplicate(cot)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  title="Duplicar como nueva cotización"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setEditando(cot)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  title="Editar cotización"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDelete(cot.id)}
                  className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                  title="Eliminar cotización"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(modalNuevo || editando) && (
        <CotizacionModal cotizacion={editando} clientePrefill={editando ? null : clientePrefill} negocioId={producto.negocio_id} productoId={producto.id} monedaCuenta={getTaxConfig(producto.pais).moneda} impuestoCuenta={{ nombre: getTaxConfig(producto.pais).consumo.nombre, tasaPct: Math.round(getTaxConfig(producto.pais).consumo.tasa * 10000) / 100 }} onClose={() => { setModalNuevo(false); setEditando(null); setClientePrefill(null); }} onSaved={handleSaved} />
      )}

      {printTarget && (
        <PrintModal cot={printTarget} onClose={() => setPrintTarget(null)} />
      )}

      {convirtiendo && (
        <ConvertirVentaModal
          cot={convirtiendo}
          onClose={() => setConvirtiendo(null)}
          onConvertida={(venta) => {
            const id = convirtiendo.id;
            setAllCots((prev) => prev.map((c) => (c.id === id
              ? { ...c, estado: 'aceptada', venta_id: venta.id, venta_ticket: venta.numero_ticket }
              : c)));
            setConvirtiendo(null);
            setToast(`Venta ${venta.numero_ticket} registrada`);
          }}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CotizacionesPage() {
  return (
    <HerramientaGate herramienta="cotizaciones" nombre="Cotizaciones PDF" acento="blue">
    <ProductoGate herramienta="Cotizaciones PDF" acento="blue">
      {({ producto, cambiarProducto }) => (
        <CotizacionesInner producto={producto} cambiarProducto={cambiarProducto} />
      )}
    </ProductoGate>
    </HerramientaGate>
  );
}