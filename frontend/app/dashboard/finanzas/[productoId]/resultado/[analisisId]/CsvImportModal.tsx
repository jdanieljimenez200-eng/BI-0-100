'use client';

import { useCallback, useRef, useState } from 'react';
import api from '@/lib/api';
import { MotionModal } from '@/components/motion/MotionModal';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParsedRow {
  fecha: string;
  descripcion: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  categoria: string;
  tiene_cfdi: boolean;
  _fila: number;
}

interface ParseError {
  fila: number;
  mensaje: string;
}

interface ImportResult {
  importados: number;
  saltados: number;
  errores: { fila: number; mensaje: string }[];
  batch_id: string;
  calibracion: {
    ingreso_promedio_mensual: number;
    egreso_promedio_mensual: number;
    costos_fijos_sugeridos: number;
    tasa_crecimiento_mensual: number | null;
    meses_analizados: number;
    rango_fechas: { desde: string; hasta: string };
    confianza: 'alta' | 'media' | 'baja';
    advertencias: string[];
  };
}

// ─── Column alias map for flexible header detection ───────────────────────────
const ALIASES: Record<string, string[]> = {
  fecha:       ['fecha', 'date', 'data', 'dt', 'dia', 'día', 'fecha_movimiento', 'transaction_date', 'posting_date', 'txn_date'],
  descripcion: ['descripcion', 'concepto', 'description', 'desc', 'memo', 'detalle', 'historico', 'narrative', 'reference', 'particulars', 'remarks'],
  tipo:        ['tipo', 'type', 'movimento', 'movement_type', 'transaction_type'],
  monto:       ['monto', 'amount', 'valor', 'value', 'importe', 'total', 'net_amount', 'net'],
  cargo:       ['cargo', 'debito', 'débito', 'debit', 'saida', 'saída', 'egreso', 'out', 'withdrawal', 'charge'],
  abono:       ['abono', 'credito', 'crédito', 'credit', 'entrada', 'ingreso', 'in', 'deposit', 'payment'],
  categoria:   ['categoria', 'category', 'rubro', 'cuenta', 'account', 'class', 'cost_center', 'clasificacion'],
  tiene_cfdi:  ['cfdi', 'factura', 'invoice', 'bill', 'receipt', 'tiene_cfdi', 'has_invoice', 'comprobante'],
};

function findAlias(headers: string[], field: string): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[\s\-\.]/g, '_'));
  for (const alias of ALIASES[field]) {
    const idx = normalized.findIndex((h) => h.includes(alias));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// ─── Date normalization: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, Excel serial ────
function normalizeDate(raw: string | number): string {
  if (typeof raw === 'number') {
    // Excel serial date (days since 1900-01-00)
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const slashParts = s.split('/');
  if (slashParts.length === 3) {
    const [a, b, c] = slashParts.map((x) => x.padStart(2, '0'));
    // Heuristic: if first part > 12 → DD/MM/YYYY
    return parseInt(a) > 12
      ? `${c}-${b}-${a}`
      : `${c}-${a}-${b}`;
  }
  const dashParts = s.split('-');
  if (dashParts.length === 3 && dashParts[0].length <= 2) {
    const [d2, m, y] = dashParts.map((x) => x.padStart(2, '0'));
    return `${y}-${m}-${d2}`;
  }
  return s;
}

function normalizeTipo(raw: string): 'ingreso' | 'egreso' | null {
  const v = String(raw).trim().toLowerCase();
  if (['ingreso', 'entrada', 'credit', 'crédito', 'credito', 'credit', 'abono', 'in', 'deposit', 'receita'].includes(v)) return 'ingreso';
  if (['egreso', 'salida', 'saída', 'debit', 'débito', 'debito', 'cargo', 'out', 'withdrawal', 'despesa'].includes(v)) return 'egreso';
  return null;
}

function normalizeBool(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  return ['true', 'si', 'sí', 'yes', '1', 'x', 'sim'].includes(s);
}

// ─── Main parser: receives sheet rows (from xlsx library) ─────────────────────
function parseSheetRows(rawRows: Record<string, unknown>[]): { rows: ParsedRow[]; errors: ParseError[] } {
  if (!rawRows.length) return { rows: [], errors: [{ fila: 1, mensaje: 'El archivo no contiene filas de datos.' }] };

  const headers = Object.keys(rawRows[0]);
  const col = {
    fecha:       findAlias(headers, 'fecha'),
    descripcion: findAlias(headers, 'descripcion'),
    tipo:        findAlias(headers, 'tipo'),
    monto:       findAlias(headers, 'monto'),
    cargo:       findAlias(headers, 'cargo'),
    abono:       findAlias(headers, 'abono'),
    categoria:   findAlias(headers, 'categoria'),
    tiene_cfdi:  findAlias(headers, 'tiene_cfdi'),
  };

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  rawRows.forEach((raw, i) => {
    const fila = i + 2; // fila 1 = encabezado

    // Fecha
    const rawFecha = col.fecha ? raw[col.fecha] : null;
    if (!rawFecha) { errors.push({ fila, mensaje: 'No se encontró columna de fecha' }); return; }
    const fecha = normalizeDate(rawFecha as string | number);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(Date.parse(fecha))) {
      errors.push({ fila, mensaje: `Fecha no reconocida: "${rawFecha}"` }); return;
    }

    // Descripción
    const descripcion = col.descripcion ? String(raw[col.descripcion] ?? '').trim() : '';
    if (!descripcion) { errors.push({ fila, mensaje: 'Descripción vacía' }); return; }

    // Tipo + Monto: soporta formato A (tipo+monto) y formato B (cargo+abono)
    let tipo: 'ingreso' | 'egreso' | null = null;
    let monto = 0;

    if (col.cargo || col.abono) {
      const cargo = parseFloat(String(raw[col.cargo ?? ''] ?? '').replace(/[^0-9.-]/g, '')) || 0;
      const abono = parseFloat(String(raw[col.abono ?? ''] ?? '').replace(/[^0-9.-]/g, '')) || 0;
      if (abono > 0) { tipo = 'ingreso'; monto = abono; }
      else if (cargo > 0) { tipo = 'egreso'; monto = cargo; }
      // Si hay columna tipo también, la usamos de respaldo
      if (!tipo && col.tipo) tipo = normalizeTipo(String(raw[col.tipo] ?? ''));
    } else {
      if (col.tipo) tipo = normalizeTipo(String(raw[col.tipo] ?? ''));
      if (col.monto) monto = Math.abs(parseFloat(String(raw[col.monto] ?? '').replace(/[^0-9.-]/g, '')) || 0);
      // Monto negativo → egreso (si no hay tipo explícito)
      if (!tipo && col.monto) {
        const rawMonto = parseFloat(String(raw[col.monto] ?? '').replace(/[^0-9.-]/g, ''));
        if (!isNaN(rawMonto)) tipo = rawMonto < 0 ? 'egreso' : 'ingreso';
      }
    }

    if (!tipo) { errors.push({ fila, mensaje: 'No se pudo determinar si es ingreso o egreso' }); return; }
    if (!monto || monto <= 0) { errors.push({ fila, mensaje: `Monto inválido o cero` }); return; }

    rows.push({
      fecha,
      descripcion,
      tipo,
      monto: Math.round(monto * 100) / 100,
      categoria:   col.categoria   ? String(raw[col.categoria] ?? '').trim() : '',
      tiene_cfdi:  col.tiene_cfdi  ? normalizeBool(raw[col.tiene_cfdi]) : false,
      _fila:       fila,
    });
  });

  return { rows, errors };
}

// ─── Template CSV content ─────────────────────────────────────────────────────
const TEMPLATE_CSV = `fecha,descripcion,tipo,monto,categoria,tiene_cfdi
2025-01-05,Venta a cliente A,ingreso,15000.00,Ventas,false
2025-01-10,Renta del local,egreso,8000.00,Renta,false
2025-01-15,Compra de insumos,egreso,3500.50,Insumos,true
2025-01-20,Factura cliente B,ingreso,22000.00,Ventas,true
2025-01-25,Pago nómina,egreso,12000.00,Nómina,false
`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'plantilla-libro-contable.csv'; a.click();
  URL.revokeObjectURL(url);
}

const fmtMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  productoId: string;
  onClose: () => void;
  onImported: () => void;
}

export default function CsvImportModal({ productoId, onClose, onImported }: Props) {
  const [step, setStep]                   = useState<1 | 2 | 3>(1);
  const [parsedRows, setParsedRows]       = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors]     = useState<ParseError[]>([]);
  const [omitirDups, setOmitirDups]       = useState(true);
  const [loading, setLoading]             = useState(false);
  const [importResult, setImportResult]   = useState<ImportResult | null>(null);
  const [showLeyenda, setShowLeyenda]     = useState(false);
  const [dragOver, setDragOver]           = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      // Interop CJS/ESM: en dev (Turbopack) el módulo xlsx del CDN puede llegar
      // con sus exports bajo `.default`; en el build quedan aplanados. Tomamos
      // el que tenga `read` disponible para que funcione en ambos entornos.
      const xlsxMod = await import('xlsx');
      const XLSX = ('read' in xlsxMod
        ? xlsxMod
        : (xlsxMod as unknown as { default: typeof xlsxMod }).default) as typeof xlsxMod;
      if (typeof XLSX.read !== 'function') {
        throw new Error('La librería de hojas de cálculo no se cargó correctamente.');
      }
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const { rows, errors } = parseSheetRows(raw);
      setParsedRows(rows);
      setParseErrors(errors);
      setStep(2);
    } catch (err) {
      const detalle = err instanceof Error ? ` (${err.message})` : '';
      setParseErrors([{ fila: 0, mensaje: `No se pudo leer el archivo. Verifica que no esté dañado o protegido.${detalle}` }]);
      setStep(2);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleImport = useCallback(async () => {
    if (!parsedRows.length) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/contabilidad/${productoId}/import`, {
        rows: parsedRows.map(({ _fila: _f, ...r }) => r),
        omitir_duplicados: omitirDups,
      });
      setImportResult(data);
      setStep(3);
      onImported();
    } catch {
      setParseErrors([{ fila: 0, mensaje: 'Error al importar. Intenta de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  }, [parsedRows, productoId, omitirDups, onImported]);

  // Summary stats for step 2
  const totalIngresos = parsedRows.filter((r) => r.tipo === 'ingreso').reduce((s, r) => s + r.monto, 0);
  const totalEgresos  = parsedRows.filter((r) => r.tipo === 'egreso').reduce((s, r) => s + r.monto, 0);
  const fechas        = parsedRows.map((r) => r.fecha).sort();
  const cal           = importResult?.calibracion;

  return (
    <MotionModal isOpen={true} onClose={onClose} maxWidth="max-w-2xl">
      <div className="relative w-full max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 flex flex-col shadow-2xl"
        style={{ background: 'linear-gradient(160deg,#0a1219 0%,#0d1b2a 100%)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-finanzas/20 border border-finanzas/30 flex items-center justify-center text-finanzas">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Importar libro contable</p>
              <p className="text-[10px] text-white/40">
                {step === 1 ? 'Sube tu archivo' : step === 2 ? 'Revisa los datos' : 'Importación completada'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Step dots */}
            <div className="flex gap-1.5">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`w-2 h-2 rounded-full transition-all ${step >= s ? 'bg-finanzas' : 'bg-white/15'}`} />
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition" aria-label="Cerrar">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* ── STEP 1: Upload + Leyenda ── */}
          {step === 1 && (
            <>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-finanzas/60 bg-finanzas/8' : 'border-white/15 hover:border-finanzas/40 hover:bg-white/3'
                }`}
              >
                <input ref={fileInputRef} type="file"
                  accept=".csv,.xlsx,.xls,.ods,.txt,.tsv"
                  className="hidden" onChange={handleFileInput} />
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-finanzas border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-white/60">Procesando archivo…</p>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 text-white/50">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-white mb-1">Arrastra tu archivo aquí o haz clic para seleccionarlo</p>
                    <p className="text-[11px] text-white/40 mb-3">Formatos compatibles: CSV · Excel (.xlsx, .xls) · LibreOffice (.ods) · TXT · TSV</p>
                    <p className="text-[10px] text-white/25">Máx. 5,000 filas por importación</p>
                  </>
                )}
              </div>

              {/* Plantilla */}
              <div className="flex items-center justify-between">
                <button onClick={downloadTemplate}
                  className="text-xs text-finanzas/80 hover:text-finanzas transition flex items-center gap-1.5 border border-finanzas/20 px-3 py-1.5 rounded-lg hover:bg-finanzas/8">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Descargar plantilla de ejemplo (.csv)</span>
                </button>
                <button onClick={() => setShowLeyenda((v) => !v)}
                  className="text-xs text-white/50 hover:text-white/80 transition flex items-center gap-1.5">
                  <svg className={`w-3.5 h-3.5 transition-transform ${showLeyenda ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span>¿Qué debe tener mi archivo?</span>
                </button>
              </div>

              {/* ── LEYENDA ── */}
              {showLeyenda && (
                <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-4 text-xs">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-finanzas" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <p className="font-bold text-white/80 text-sm">Guía de formato</p>
                  </div>

                  <p className="text-white/50 text-[11px]">
                    El sistema detecta automáticamente los nombres de las columnas en
                    <span className="text-white/70"> Español · Português · English</span> y formatos bancarios comunes.
                    No importa el orden de las columnas.
                  </p>

                  {/* Tabla de columnas */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-white/40 uppercase tracking-wide">
                          <th className="text-left py-1.5 pr-3">Columna</th>
                          <th className="text-center py-1.5 pr-3">¿Requerida?</th>
                          <th className="text-left py-1.5 pr-3">Nombres aceptados</th>
                          <th className="text-left py-1.5">Ejemplo</th>
                        </tr>
                      </thead>
                      <tbody className="text-white/60">
                        {[
                          { col: 'Fecha',            req: 'Sí',       names: 'fecha, date, data, dt',             ej: '2025-01-15  /  15/01/2025' },
                          { col: 'Descripción',      req: 'Sí',       names: 'descripcion, concepto, memo, desc', ej: '"Venta a cliente X"' },
                          { col: 'Tipo',             req: 'A o B',    names: 'tipo, type, movimento',             ej: 'ingreso / egreso / credit' },
                          { col: 'Monto',            req: 'A o B',    names: 'monto, amount, valor, importe',     ej: '5000.00' },
                          { col: 'Cargo (débito)',   req: 'A o B',    names: 'cargo, débito, debit, saída',       ej: '3500.00' },
                          { col: 'Abono (crédito)',  req: 'A o B',    names: 'abono, crédito, credit, entrada',   ej: '15000.00' },
                          { col: 'Categoría',        req: 'Opcional', names: 'categoria, category, rubro',        ej: 'Ventas, Renta, Insumos' },
                          { col: 'Factura / CFDI',   req: 'Opcional', names: 'cfdi, factura, invoice',            ej: 'true / false / sí' },
                        ].map((r) => (
                          <tr key={r.col} className="border-b border-white/5">
                            <td className="py-1.5 pr-3 font-semibold text-white/75">{r.col}</td>
                            <td className="py-1.5 pr-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${
                                r.req === 'Sí' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                r.req === 'A o B' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                                'bg-white/5 text-white/40 border border-white/10'
                              }`}>
                                {r.req}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3 text-white/40 font-mono">{r.names}</td>
                            <td className="py-1.5 text-white/50">{r.ej}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Formatos soportados */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-finanzas/5 border border-finanzas/15 rounded-xl p-3">
                      <p className="font-semibold text-finanzas/80 mb-1">Formato A — tipo + monto</p>
                      <p className="text-white/40 font-mono text-[9px] leading-relaxed">
                        fecha, descripcion, <span className="text-finanzas/70">tipo</span>, <span className="text-finanzas/70">monto</span><br />
                        2025-01-10, Renta, egreso, 8000
                      </p>
                    </div>
                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3">
                      <p className="font-semibold text-amber-400/80 mb-1">Formato B — cargo + abono</p>
                      <p className="text-white/40 font-mono text-[9px] leading-relaxed">
                        fecha, descripcion, <span className="text-amber-400/70">cargo</span>, <span className="text-amber-400/70">abono</span><br />
                        2025-01-10, Renta, 8000,
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 text-[10px] text-blue-300/80">
                    <svg className="w-3.5 h-3.5 mt-0.5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <div>
                      <span className="font-semibold text-blue-200">Extractos bancarios: </span>
                      <span>Si descargaste el extracto de tu banco (BBVA, Banorte, etc.), el sistema intenta mapear automáticamente las columnas. Si hay errores, ajusta los encabezados de tu archivo para que coincidan con los nombres listados arriba.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 bg-purple-500/5 border border-purple-500/15 rounded-xl p-3 text-[10px] text-purple-300/80">
                    <svg className="w-3.5 h-3.5 mt-0.5 text-purple-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <div>
                      <span className="font-semibold text-purple-200">Privacidad: </span>
                      <span>Tu archivo se procesa localmente en tu navegador. Sólo los datos ya parseados se envían al servidor — nunca el archivo original.</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Preview ── */}
          {step === 2 && (
            <>
              {parsedRows.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-finanzas/8 border border-finanzas/20 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Filas válidas</p>
                    <p className="text-xl font-bold text-finanzas">{parsedRows.length}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Ingresos</p>
                    <p className="text-sm font-bold text-emerald-300">${fmtMXN(totalIngresos)}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Egresos</p>
                    <p className="text-sm font-bold text-red-300">${fmtMXN(totalEgresos)}</p>
                  </div>
                </div>
              )}

              {fechas.length > 0 && (
                <p className="text-[10px] text-white/35 text-center">
                  Rango de fechas: {fechas[0]} → {fechas[fechas.length - 1]}
                </p>
              )}

              {/* Errors */}
              {parseErrors.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                    <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>{parseErrors.length} fila{parseErrors.length !== 1 ? 's' : ''} con error (no se importarán)</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                    {parseErrors.map((e, i) => (
                      <p key={i} className="text-[10px] text-red-300/70">
                        {e.fila > 0 ? `Fila ${e.fila}: ` : ''}{e.mensaje}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {parsedRows.length === 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center">
                  <p className="text-sm text-amber-300">No se encontraron filas válidas.</p>
                  <p className="text-xs text-white/40 mt-1">Revisa que tu archivo tenga las columnas correctas y vuelve a intentarlo.</p>
                </div>
              )}

              {/* Preview table */}
              {parsedRows.length > 0 && (
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <p className="text-[10px] text-white/40 px-3 py-2 border-b border-white/8 bg-white/3">
                    Previsualización — primeras {Math.min(parsedRows.length, 10)} de {parsedRows.length} filas
                  </p>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-[10px]">
                      <thead className="bg-white/3 text-white/40 uppercase tracking-wide">
                        <tr>
                          {['Fecha', 'Descripción', 'Tipo', 'Monto', 'Categoría'].map((h) => (
                            <th key={h} className="text-left px-3 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-t border-white/5">
                            <td className="px-3 py-1.5 text-white/60">{r.fecha}</td>
                            <td className="px-3 py-1.5 text-white max-w-[160px] truncate">{r.descripcion}</td>
                            <td className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${r.tipo === 'ingreso' ? 'bg-finanzas/20 text-finanzas' : 'bg-red-500/15 text-red-400'}`}>
                                {r.tipo}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-semibold text-white">${fmtMXN(r.monto)}</td>
                            <td className="px-3 py-1.5 text-white/40">{r.categoria || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Options */}
              {parsedRows.length > 0 && (
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="checkbox" checked={omitirDups} onChange={(e) => setOmitirDups(e.target.checked)}
                    className="w-4 h-4 accent-finanzas rounded" />
                  <span className="text-xs text-white/60 group-hover:text-white/80 transition">
                    Omitir duplicados automáticamente <span className="text-white/30">(compara fecha + monto + descripción)</span>
                  </span>
                </label>
              )}
            </>
          )}

          {/* ── STEP 3: Result + Calibration ── */}
          {step === 3 && importResult && (
            <>
              {/* Import result */}
              <div className="bg-finanzas/8 border border-finanzas/25 rounded-2xl p-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-finanzas/20 border border-finanzas/30 flex items-center justify-center mx-auto mb-2 text-finanzas">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-bold text-white text-lg">{importResult.importados} movimientos importados</p>
                {importResult.saltados > 0 && (
                  <p className="text-xs text-white/40 mt-1">{importResult.saltados} omitidos por ser duplicados</p>
                )}
                {importResult.errores.length > 0 && (
                  <p className="text-xs text-amber-400/70 mt-1">{importResult.errores.length} filas con error no importadas</p>
                )}
              </div>

              {/* Calibration */}
              {cal && cal.meses_analizados >= 1 && (
                <div className="border border-white/10 rounded-2xl overflow-hidden">
                  <div className="bg-white/5 px-4 py-3 border-b border-white/8 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-finanzas" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                      <p className="text-sm font-bold text-white">Calibración con datos reales</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      cal.confianza === 'alta'  ? 'bg-finanzas/20 text-finanzas' :
                      cal.confianza === 'media' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      Confianza {cal.confianza} · {cal.meses_analizados} mes{cal.meses_analizados !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-finanzas/5 border border-finanzas/15 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-white/40 mb-1">Ingreso promedio/mes</p>
                        <p className="text-base font-bold text-finanzas">${fmtMXN(cal.ingreso_promedio_mensual)}</p>
                      </div>
                      <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-white/40 mb-1">Egreso promedio/mes</p>
                        <p className="text-base font-bold text-red-300">${fmtMXN(cal.egreso_promedio_mensual)}</p>
                      </div>
                      <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-white/40 mb-1">Costos fijos sugeridos</p>
                        <p className="text-base font-bold text-white">${fmtMXN(cal.costos_fijos_sugeridos)}</p>
                      </div>
                      <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-white/40 mb-1">Crecimiento mensual real</p>
                        <p className="text-base font-bold text-white">
                          {cal.tasa_crecimiento_mensual !== null
                            ? `${(cal.tasa_crecimiento_mensual * 100).toFixed(1)}%`
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {cal.advertencias.length > 0 && (
                      <div className="text-[10px] text-amber-400/80 space-y-1">
                        {cal.advertencias.map((a, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <svg className="w-3 h-3 mt-0.5 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <span>{a}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 text-[11px] text-blue-300/80">
                      <p className="font-semibold mb-1">¿Quieres recalibrar tu análisis con estos datos reales?</p>
                      <p className="text-blue-300/50">
                        Ve al tab <strong>Mando → Centro de Mando</strong> y ajusta manualmente los campos de costos fijos
                        y unidades con los valores sugeridos arriba. El análisis se recalculará en tiempo real.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 flex items-center justify-between flex-shrink-0">
          <button
            onClick={step === 1 ? onClose : step === 2 ? () => { setStep(1); setParsedRows([]); setParseErrors([]); } : onClose}
            className="text-xs text-white/50 hover:text-white/80 transition border border-white/10 px-4 py-2 rounded-xl hover:bg-white/5"
          >
            {step === 3 ? 'Cerrar' : step === 2 ? '← Volver' : 'Cancelar'}
          </button>

          {step === 2 && parsedRows.length > 0 && (
            <button onClick={handleImport} disabled={loading}
              className="flex items-center gap-2 text-xs font-semibold bg-finanzas/20 text-finanzas border border-finanzas/30 px-5 py-2 rounded-xl hover:bg-finanzas/30 transition disabled:opacity-50">
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-finanzas border-t-transparent rounded-full animate-spin" />
                  <span>Importando…</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Importar {parsedRows.length} movimientos</span>
                </>
              )}
            </button>
          )}

          {step === 2 && parsedRows.length === 0 && (
            <button onClick={() => { setStep(1); setParsedRows([]); setParseErrors([]); }}
              className="text-xs font-semibold text-white/60 border border-white/15 px-4 py-2 rounded-xl hover:bg-white/5 transition">
              Intentar con otro archivo
            </button>
          )}
        </div>
      </div>
    </MotionModal>
  );
}
