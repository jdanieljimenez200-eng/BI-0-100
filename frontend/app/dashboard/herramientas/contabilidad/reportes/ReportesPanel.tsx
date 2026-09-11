'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Clock,
  Download,
  FileText,
  Loader2,
  Package,
  Receipt,
  RefreshCw,
  Users,
} from 'lucide-react';
import api from '@/lib/api';
import SerieVentasChart from './SerieVentasChart';
import HeatmapHorarios from './HeatmapHorarios';
import type { Granularidad, PanelReportes } from './tipos';

interface TaxCfg {
  simbolo: string;
  locale: string;
}

interface Props {
  productoId: string;
  productoNombre: string;
  taxCfg: TaxCfg;
}

type RangoPreset = 'hoy' | '7d' | '30d' | 'mes' | 'trimestre' | 'anio' | 'custom';

const PRESETS: { key: RangoPreset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'anio', label: 'Año' },
];

const GRANULARIDADES: { key: Granularidad; label: string }[] = [
  { key: 'dia', label: 'Día' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'anio', label: 'Año' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Rango de fechas de cada preset, calculado en hora local del navegador. */
function rangoDePreset(preset: RangoPreset): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = iso(hoy);
  switch (preset) {
    case 'hoy':
      return { desde: hasta, hasta };
    case '7d':
      return { desde: iso(new Date(hoy.getTime() - 6 * 86400000)), hasta };
    case '30d':
      return { desde: iso(new Date(hoy.getTime() - 29 * 86400000)), hasta };
    case 'mes':
      return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
    case 'trimestre': {
      const inicioTrim = new Date(hoy.getFullYear(), Math.floor(hoy.getMonth() / 3) * 3, 1);
      return { desde: iso(inicioTrim), hasta };
    }
    case 'anio':
      return { desde: iso(new Date(hoy.getFullYear(), 0, 1)), hasta };
    default:
      return { desde: iso(new Date(hoy.getTime() - 29 * 86400000)), hasta };
  }
}

/** Granularidad razonable según el largo del rango, para no pintar 365 barras. */
function granularidadSugerida(desde: string, hasta: string): Granularidad {
  const dias = (new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000;
  if (dias <= 62) return 'dia';
  if (dias <= 210) return 'semana';
  if (dias <= 1100) return 'mes';
  return 'anio';
}

export default function ReportesPanel({ productoId, productoNombre, taxCfg }: Props) {
  const [preset, setPreset] = useState<RangoPreset>('30d');
  const [rango, setRango] = useState(() => rangoDePreset('30d'));
  const [granularidad, setGranularidad] = useState<Granularidad>('dia');
  // 'todos' = consolidado de la cuenta, no solo el producto activo.
  const [ambito, setAmbito] = useState<'producto' | 'todos'>('producto');

  const [datos, setDatos] = useState<PanelReportes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const money = useCallback(
    (v: number) =>
      `${taxCfg.simbolo}${new Intl.NumberFormat(taxCfg.locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v)}`,
    [taxCfg],
  );

  const moneyCorto = useCallback(
    (v: number) =>
      `${taxCfg.simbolo}${new Intl.NumberFormat(taxCfg.locale, { maximumFractionDigits: 0 }).format(v)}`,
    [taxCfg],
  );

  /** Conteos (tickets, clientes): número puro, sin símbolo de moneda. */
  const num = useCallback(
    (v: number) => new Intl.NumberFormat(taxCfg.locale, { maximumFractionDigits: 0 }).format(v),
    [taxCfg],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/reportes/panel', {
        params: {
          producto_id: ambito === 'todos' ? 'todos' : productoId,
          desde: rango.desde,
          hasta: rango.hasta,
          granularidad,
        },
      });
      setDatos(data as PanelReportes);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudieron cargar los reportes');
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [ambito, productoId, rango.desde, rango.hasta, granularidad]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const aplicarPreset = (p: RangoPreset) => {
    const nuevo = rangoDePreset(p);
    setPreset(p);
    setRango(nuevo);
    setGranularidad(granularidadSugerida(nuevo.desde, nuevo.hasta));
  };

  const exportarCSV = () => {
    if (!datos) return;
    const filas = [
      ['Periodo', 'Tickets', 'Importe'],
      ...datos.serie.puntos.map((p) => [p.periodo, String(p.num_ventas), String(p.importe)]),
      [],
      ['Producto', 'Unidades', 'Importe', 'Costo', 'Utilidad', 'Margen %'],
      ...datos.productos.map((p) => [
        `"${p.nombre.replace(/"/g, '""')}"`,
        String(p.unidades),
        String(p.importe),
        p.costo === null ? 'sin costo' : String(p.costo),
        p.utilidad === null ? 'sin costo' : String(p.utilidad),
        p.margen_pct === null ? 'sin costo' : String(p.margen_pct),
      ]),
    ];
    const csv = filas.map((f) => f.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte_${rango.desde}_${rango.hasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const kpis = useMemo(() => {
    if (!datos) return [];
    const { ventas, margen, flujo, comparativa } = datos.resumen;
    return [
      {
        label: 'Ventas',
        valor: num(ventas.num_ventas),
        sub: `${num(comparativa.num_ventas_anterior)} tickets antes`,
        delta: comparativa.num_ventas_pct,
        color: 'text-white',
      },
      {
        label: 'Facturado',
        valor: money(ventas.importe),
        sub: `Antes: ${moneyCorto(comparativa.importe_anterior)}`,
        delta: comparativa.importe_pct,
        color: 'text-emerald-300',
      },
      {
        label: 'Ticket promedio',
        valor: money(ventas.ticket_promedio),
        sub: `${num(ventas.num_ventas)} ticket(s)`,
        delta: comparativa.ticket_promedio_pct,
        color: 'text-sky-300',
      },
      {
        label: 'Utilidad bruta',
        valor: margen.margen_pct === null ? 'Sin costos' : money(margen.utilidad_bruta),
        sub:
          margen.margen_pct === null
            ? 'Configura recetas en el POS'
            : `Margen ${margen.margen_pct}% · cobertura ${margen.cobertura_pct}%`,
        delta: null,
        color: margen.margen_pct === null ? 'text-white/40' : 'text-violet-300',
      },
      {
        label: 'Utilidad neta',
        valor: money(flujo.utilidad_neta),
        sub: `${moneyCorto(flujo.ingresos)} − ${moneyCorto(flujo.egresos)}`,
        delta: null,
        color: flujo.utilidad_neta >= 0 ? 'text-emerald-300' : 'text-rose-300',
      },
    ];
  }, [datos, money, moneyCorto, num]);

  return (
    <div className="space-y-5">
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2" data-print="hide">
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => aplicarPreset(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                preset === p.key
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
          <input
            type="date"
            value={rango.desde}
            max={rango.hasta}
            onChange={(e) => {
              setPreset('custom');
              setRango((r) => ({ ...r, desde: e.target.value }));
            }}
            className="bg-transparent text-xs text-white/70 outline-none"
          />
          <span className="text-white/25">→</span>
          <input
            type="date"
            value={rango.hasta}
            min={rango.desde}
            onChange={(e) => {
              setPreset('custom');
              setRango((r) => ({ ...r, hasta: e.target.value }));
            }}
            className="bg-transparent text-xs text-white/70 outline-none"
          />
        </div>

        <select
          value={ambito}
          onChange={(e) => setAmbito(e.target.value as 'producto' | 'todos')}
          className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/70 outline-none focus:border-emerald-500/40"
        >
          <option value="producto" className="bg-[#0F1C2A]">
            {productoNombre}
          </option>
          <option value="todos" className="bg-[#0F1C2A]">
            Todos mis productos
          </option>
        </select>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => void cargar()}
            disabled={cargando}
            className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={exportarCSV}
            disabled={!datos}
            className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {cargando && !datos && (
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculando reportes…
        </div>
      )}

      {datos && (
        <>
          {/* ── KPIs ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="rounded-2xl border border-white/8 bg-[#0D131F] p-4"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">
                  {k.label}
                </p>
                <p className={`mt-1 text-xl font-extrabold tabular-nums ${k.color}`}>{k.valor}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  {k.delta !== null && k.delta !== undefined && (
                    <span
                      className={`flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
                        k.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {k.delta >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(k.delta)}%
                    </span>
                  )}
                  <span className="truncate text-[10px] text-white/30">{k.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Aviso de fiabilidad del margen. Un catálogo a medio configurar
              produce un margen altísimo que parece real. */}
          {datos.resumen.margen.margen_pct !== null &&
            datos.resumen.margen.cobertura_pct < 80 && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-xs leading-relaxed text-amber-100/80">
                  Solo el <strong>{datos.resumen.margen.cobertura_pct}%</strong> de lo vendido tiene
                  costo conocido, así que el margen mostrado es parcial. Define la receta de tus
                  productos en el POS para que el cálculo sea real.
                </p>
              </div>
            )}

          {/* ── Serie temporal ────────────────────────────────────────── */}
          <section className="rounded-2xl border border-white/8 bg-[#0D131F] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Receipt className="h-4 w-4 text-emerald-400" />
                Evolución de ventas
              </h3>
              <div className="flex gap-1 rounded-lg border border-white/8 bg-white/[0.03] p-0.5" data-print="hide">
                {GRANULARIDADES.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setGranularidad(g.key)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      granularidad === g.key
                        ? 'bg-white/10 text-white'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <SerieVentasChart
              puntos={datos.serie.puntos}
              granularidad={datos.serie.granularidad}
              simbolo={taxCfg.simbolo}
              locale={taxCfg.locale}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── Más vendidos ───────────────────────────────────────── */}
            <section className="rounded-2xl border border-white/8 bg-[#0D131F] p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
                <Package className="h-4 w-4 text-sky-400" />
                Lo que más se vende
              </h3>
              {datos.productos.length === 0 ? (
                <p className="py-8 text-center text-xs text-white/40">
                  Sin ventas registradas en este periodo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8 text-left text-[10px] uppercase tracking-wide text-white/35">
                        <th className="pb-2 font-medium">Producto</th>
                        <th className="pb-2 text-right font-medium">Uds.</th>
                        <th className="pb-2 text-right font-medium">Importe</th>
                        <th className="pb-2 text-right font-medium">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.productos.map((p) => (
                        <tr key={p.nombre} className="border-b border-white/[0.04]">
                          <td className="py-2 pr-2 font-medium text-white/85">{p.nombre}</td>
                          <td className="py-2 text-right tabular-nums text-white/60">{p.unidades}</td>
                          <td className="py-2 text-right font-semibold tabular-nums text-emerald-300">
                            {moneyCorto(p.importe)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {p.margen_pct === null ? (
                              <span className="text-[10px] text-white/25">sin costo</span>
                            ) : (
                              <span className={p.margen_pct >= 0 ? 'text-violet-300' : 'text-rose-300'}>
                                {p.margen_pct}%{p.costo_parcial && <span className="text-white/25">*</span>}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {datos.productos.some((p) => p.costo_parcial) && (
                    <p className="mt-2 text-[10px] text-white/30">
                      * margen calculado solo sobre las unidades con receta definida.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── Almacén ────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-white/8 bg-[#0D131F] p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
                <Boxes className="h-4 w-4 text-amber-400" />
                Movimiento de almacén
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: 'Entradas',
                    uds: datos.almacen.totales.entradas_unidades,
                    valor: datos.almacen.totales.entradas_valor,
                    color: 'text-emerald-300',
                  },
                  {
                    label: 'Salidas',
                    uds: datos.almacen.totales.salidas_unidades,
                    valor: datos.almacen.totales.salidas_valor,
                    color: 'text-sky-300',
                  },
                  {
                    label: 'Mermas',
                    uds: datos.almacen.totales.mermas_unidades,
                    valor: datos.almacen.totales.mermas_valor,
                    color: 'text-rose-300',
                  },
                ].map((b) => (
                  <div key={b.label} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                    <p className="text-[10px] uppercase tracking-wide text-white/35">{b.label}</p>
                    <p className={`mt-0.5 text-base font-extrabold tabular-nums ${b.color}`}>{b.uds}</p>
                    <p className="text-[10px] tabular-nums text-white/30">{moneyCorto(b.valor)}</p>
                  </div>
                ))}
              </div>

              {datos.almacen.totales.salidas_por_venta > 0 && (
                <p className="mt-2 text-[10px] text-white/35">
                  {datos.almacen.totales.salidas_por_venta} salida(s) generadas automáticamente por
                  ventas del POS.
                </p>
              )}

              {datos.almacen.bajo_minimo.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Bajo mínimo ({datos.almacen.bajo_minimo.length})
                  </p>
                  <div className="space-y-1">
                    {datos.almacen.bajo_minimo.slice(0, 5).map((i) => (
                      <div
                        key={i.id}
                        className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="truncate text-white/80">{i.nombre}</span>
                        <span className="shrink-0 tabular-nums text-amber-200">
                          {i.stock_actual} / {i.stock_minimo} {i.unidad}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {datos.almacen.por_insumo.length === 0 &&
                datos.almacen.bajo_minimo.length === 0 && (
                  <p className="py-6 text-center text-xs text-white/40">
                    Sin movimientos de almacén en este periodo.
                  </p>
                )}
            </section>

            {/* ── Clientes ───────────────────────────────────────────── */}
            <section className="rounded-2xl border border-white/8 bg-[#0D131F] p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
                <Users className="h-4 w-4 text-violet-400" />
                Clientes
              </h3>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <p className="text-[10px] uppercase tracking-wide text-white/35">Nuevos</p>
                  <p className="text-base font-extrabold tabular-nums text-emerald-300">
                    {datos.clientes.segmentos.nuevos}
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <p className="text-[10px] uppercase tracking-wide text-white/35">Recurrentes</p>
                  <p className="text-base font-extrabold tabular-nums text-violet-300">
                    {datos.clientes.segmentos.recurrentes}
                  </p>
                </div>
              </div>

              {/* Cuánta información se está perdiendo por no identificar al
                  cliente. Es accionable: cada venta anónima es un dato menos. */}
              {datos.clientes.cobertura.ventas_sin_cliente > 0 && (
                <p className="mb-3 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2 text-[11px] leading-relaxed text-white/45">
                  {datos.clientes.cobertura.ventas_sin_cliente} venta(s) por{' '}
                  {moneyCorto(datos.clientes.cobertura.importe_sin_cliente)} se cobraron sin
                  identificar al cliente. Asígnalo al cobrar para medir recurrencia.
                </p>
              )}

              {datos.clientes.top.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">
                  Todavía no hay ventas con cliente identificado.
                </p>
              ) : (
                <div className="space-y-1">
                  {datos.clientes.top.slice(0, 6).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white/85">{c.nombre}</p>
                        <p className="text-[10px] text-white/35">
                          {c.compras} compra(s) · última {c.ultima_compra ?? '—'}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-emerald-300">
                        {moneyCorto(c.importe)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Métodos de pago y cotizaciones ─────────────────────── */}
            <section className="rounded-2xl border border-white/8 bg-[#0D131F] p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
                <FileText className="h-4 w-4 text-teal-400" />
                Cobro y cotizaciones
              </h3>

              {datos.metodos_pago.length === 0 ? (
                <p className="py-4 text-center text-xs text-white/40">Sin cobros en el periodo.</p>
              ) : (
                <div className="mb-4 space-y-1.5">
                  {datos.metodos_pago.map((m) => {
                    const total = datos.metodos_pago.reduce((a, x) => a + x.importe, 0);
                    const pctBarra = total > 0 ? (m.importe / total) * 100 : 0;
                    return (
                      <div key={m.metodo_pago}>
                        <div className="mb-0.5 flex justify-between text-[11px]">
                          <span className="capitalize text-white/70">{m.metodo_pago}</span>
                          <span className="tabular-nums text-white/50">
                            {moneyCorto(m.importe)} · {Math.round(pctBarra)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-teal-400/70"
                            style={{ width: `${pctBarra}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-white/35">
                  Cotizaciones del periodo
                </p>
                {datos.cotizaciones.emitidas === 0 ? (
                  <p className="text-xs text-white/40">Ninguna emitida.</p>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-extrabold tabular-nums text-white">
                      {datos.cotizaciones.tasa_conversion_pct ?? 0}%
                    </span>
                    <span className="text-[11px] text-white/40">
                      {datos.cotizaciones.aceptadas} de {datos.cotizaciones.emitidas} aceptadas ·{' '}
                      {moneyCorto(datos.cotizaciones.importe_aceptado)}
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ── Horarios ──────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-white/8 bg-[#0D131F] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
              <Clock className="h-4 w-4 text-emerald-400" />
              A qué horas vendes
            </h3>
            <HeatmapHorarios
              datos={datos.horarios}
              simbolo={taxCfg.simbolo}
              locale={taxCfg.locale}
            />
          </section>
        </>
      )}
    </div>
  );
}
