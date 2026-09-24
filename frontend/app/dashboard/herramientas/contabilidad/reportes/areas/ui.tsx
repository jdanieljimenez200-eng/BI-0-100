'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calendar,
  FileText,
  LayoutDashboard,
  ShoppingCart,
  UserCheck,
  Users,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import type { Area } from './tipos';

// ─── Metadatos de cada área ────────────────────────────────────────────────────

export const AREA_INFO: Record<Area | 'panorama', { label: string; herramienta: string; icono: LucideIcon; color: string }> = {
  panorama: { label: 'Panorama', herramienta: '', icono: LayoutDashboard, color: 'text-emerald-300' },
  ventas: { label: 'Ventas', herramienta: 'Punto de venta', icono: ShoppingCart, color: 'text-emerald-300' },
  inventario: { label: 'Inventario', herramienta: 'Inventario', icono: Boxes, color: 'text-amber-300' },
  cotizaciones: { label: 'Cotizaciones', herramienta: 'Cotizaciones', icono: FileText, color: 'text-blue-300' },
  clientes: { label: 'Clientes', herramienta: 'Clientes', icono: Users, color: 'text-violet-300' },
  citas: { label: 'Citas', herramienta: 'Calendario de citas', icono: Calendar, color: 'text-cyan-300' },
  personal: { label: 'Personal', herramienta: 'Nómina', icono: UserCheck, color: 'text-rose-300' },
  contabilidad: { label: 'Contabilidad', herramienta: 'Contabilidad', icono: BookOpen, color: 'text-teal-300' },
};

export const IconoReportes = BarChart3;

// ─── Formato ──────────────────────────────────────────────────────────────────

export interface Formato {
  money: (v: number) => string;
  moneyCorto: (v: number) => string;
  /** Importe en una moneda concreta (la nómina puede ir en otra). */
  moneda: (v: number, codigo: string) => string;
  num: (v: number, decimales?: number) => string;
  pct: (v: number | null | undefined) => string;
  fecha: (iso: string | null | undefined) => string;
  locale: string;
  simbolo: string;
}

const FormatoCtx = createContext<Formato | null>(null);

export function FormatoProvider({ simbolo, locale, children }: { simbolo: string; locale: string; children: ReactNode }) {
  const valor = useMemo<Formato>(() => {
    const nf2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const nf0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    return {
      locale,
      simbolo,
      money: (v) => `${simbolo}${nf2.format(v)}`,
      moneyCorto: (v) => `${simbolo}${nf0.format(v)}`,
      moneda: (v, codigo) => {
        try {
          return new Intl.NumberFormat(locale, { style: 'currency', currency: codigo, maximumFractionDigits: 2 }).format(v);
        } catch {
          return `${nf2.format(v)} ${codigo}`;
        }
      },
      num: (v, decimales = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: decimales }).format(v),
      pct: (v) => (v === null || v === undefined ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v)}%`),
      fecha: (iso) => {
        if (!iso) return '—';
        const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
        if (!y || !m) return iso;
        return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
          new Date(Date.UTC(y, m - 1, d || 1)),
        );
      },
    };
  }, [simbolo, locale]);
  return <FormatoCtx.Provider value={valor}>{children}</FormatoCtx.Provider>;
}

export function useFormato(): Formato {
  const f = useContext(FormatoCtx);
  if (!f) throw new Error('useFormato fuera de FormatoProvider');
  return f;
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

export function Delta({ valor, invertir = false }: { valor: number | null | undefined; invertir?: boolean }) {
  if (valor === null || valor === undefined) return null;
  // En egresos o cancelaciones subir es malo: `invertir` cambia el color, no la flecha.
  const bueno = invertir ? valor <= 0 : valor >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${bueno ? 'text-emerald-300' : 'text-rose-300'}`}>
      {valor >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(valor)}%
    </span>
  );
}

export interface KpiProps {
  label: string;
  valor: string;
  sub?: string;
  delta?: number | null;
  invertirDelta?: boolean;
  color?: string;
}

export function Kpi({ label, valor, sub, delta, invertirDelta, color = 'text-white' }: KpiProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0D131F] p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">{label}</p>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${color}`}>{valor}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <Delta valor={delta} invertir={invertirDelta} />
        {sub && <span className="truncate text-[10px] text-white/35">{sub}</span>}
      </div>
    </div>
  );
}

export function Kpis({ items, columnas = 4 }: { items: KpiProps[]; columnas?: 3 | 4 | 5 }) {
  const cols = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }[columnas];
  return (
    <div className={`grid grid-cols-2 gap-3 ${cols}`}>
      {items.map((k) => (
        <Kpi key={k.label} {...k} />
      ))}
    </div>
  );
}

export function Seccion({
  titulo,
  icono: Icono,
  color = 'text-emerald-400',
  descripcion,
  acciones,
  children,
  className = '',
}: {
  titulo: string;
  icono?: LucideIcon;
  color?: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/8 bg-[#0D131F] p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            {Icono && <Icono className={`h-4 w-4 ${color}`} />}
            {titulo}
          </h3>
          {descripcion && <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-white/40">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-white/40">{children}</p>;
}

export function Aviso({ tono = 'amber', children }: { tono?: 'amber' | 'rose' | 'sky'; children: ReactNode }) {
  const estilos = {
    amber: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-100/80',
    rose: 'border-rose-500/25 bg-rose-500/[0.07] text-rose-100/80',
    sky: 'border-sky-500/25 bg-sky-500/[0.07] text-sky-100/80',
  }[tono];
  return <div className={`rounded-2xl border p-3 text-xs leading-relaxed ${estilos}`}>{children}</div>;
}

export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => ReactNode;
  derecha?: boolean;
  className?: string;
}

export function Tabla<T>({
  filas,
  columnas,
  vacio = 'Sin datos en este periodo.',
  clave,
  max,
}: {
  filas: T[];
  columnas: Columna<T>[];
  vacio?: string;
  clave: (fila: T, i: number) => string;
  max?: number;
}) {
  if (filas.length === 0) return <Vacio>{vacio}</Vacio>;
  const visibles = max ? filas.slice(0, max) : filas;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8 text-left text-[10px] uppercase tracking-wide text-white/60">
            {columnas.map((c) => (
              <th key={c.titulo} className={`pb-2 pr-2 font-medium ${c.derecha ? 'text-right' : ''}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibles.map((f, i) => (
            <tr key={clave(f, i)} className="border-b border-white/[0.04]">
              {columnas.map((c) => (
                <td
                  key={c.titulo}
                  className={`py-2 pr-2 ${c.derecha ? 'text-right tabular-nums font-mono' : ''} ${c.className ?? 'text-white/70'}`}
                >
                  {c.valor(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {max && filas.length > max && (
        <p className="mt-2 text-[10px] text-white/30">
          Mostrando {max} de {filas.length}. El PDF incluye la lista completa.
        </p>
      )}
    </div>
  );
}

/** Barras horizontales proporcionales: reparto de un total entre categorías. */
export function Barras({
  items,
  colorBarra = 'bg-emerald-400/70',
  vacio = 'Sin datos en este periodo.',
}: {
  items: { etiqueta: string; valor: number; texto: string }[];
  colorBarra?: string;
  vacio?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.valor));
  if (items.length === 0 || max <= 0) return <Vacio>{vacio}</Vacio>;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.etiqueta}>
          <div className="mb-0.5 flex justify-between gap-3 text-[11px]">
            <span className="truncate text-white/75">{i.etiqueta}</span>
            <span className="shrink-0 tabular-nums text-white/50">{i.texto}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className={`h-full rounded-full ${colorBarra}`} style={{ width: `${(Math.max(0, i.valor) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Pares etiqueta / valor en rejilla, para desgloses cortos. */
export function Desglose({ items }: { items: { label: string; valor: string; color?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/35">{i.label}</p>
          <p className={`mt-0.5 text-base font-extrabold tabular-nums ${i.color ?? 'text-white'}`}>{i.valor}</p>
        </div>
      ))}
    </div>
  );
}

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

export const FUENTE_LABEL: Record<string, string> = {
  manual: 'Manual',
  csv_import: 'CSV / Excel',
  pos: 'Punto de venta',
  inventario: 'Inventario',
  nomina: 'Nómina',
  cotizacion: 'Cotización',
};

export const TIPO_PAGO_LABEL: Record<string, string> = {
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
};
