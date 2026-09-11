'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { PuntoSerie, Granularidad } from './tipos';

interface Props {
  puntos: PuntoSerie[];
  granularidad: Granularidad;
  simbolo: string;
  locale: string;
}

const ETIQUETA_GRANULARIDAD: Record<Granularidad, string> = {
  dia: 'día',
  semana: 'semana',
  mes: 'mes',
  anio: 'año',
};

/**
 * Formatea la etiqueta del eje según la granularidad.
 *
 * Se construye con `Date.UTC` a partir de las partes de la fecha en vez de
 * `new Date('2026-03-01')`: esa forma se interpreta como UTC y al pintarla en
 * hora local puede retroceder un día, que es justo el error que hace que una
 * gráfica diaria empiece un día antes de lo que dice el filtro.
 */
function etiqueta(periodo: string, granularidad: Granularidad, locale: string): string {
  const [y, m, d] = periodo.split('-').map(Number);
  // Una fecha que no venga como YYYY-MM-DD se muestra cruda en vez de reventar:
  // `Intl.DateTimeFormat` lanza con un Date inválido y eso tumbaría toda la
  // página de reportes por una sola etiqueta del eje.
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return periodo;
  const fecha = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  if (Number.isNaN(fecha.getTime())) return periodo;
  const opts: Intl.DateTimeFormatOptions =
    granularidad === 'anio'
      ? { year: 'numeric', timeZone: 'UTC' }
      : granularidad === 'mes'
        ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
        : { day: '2-digit', month: 'short', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, opts).format(fecha);
}

export default function SerieVentasChart({ puntos, granularidad, simbolo, locale }: Props) {
  const datos = useMemo(
    () => puntos.map((p) => ({ ...p, etiqueta: etiqueta(p.periodo, granularidad, locale) })),
    [puntos, granularidad, locale],
  );

  const totalVentas = datos.reduce((acc, p) => acc + p.num_ventas, 0);

  // Un periodo sin ninguna venta no se dibuja: una línea plana en cero se lee
  // como un dato real y no lo es.
  if (totalVentas === 0) {
    return (
      <div className="flex h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-center">
        <p className="text-sm font-semibold text-white/70">Sin ventas en este periodo</p>
        <p className="mt-1 max-w-xs text-xs text-white/40">
          Cuando cobres desde el POS, aquí verás la evolución por {ETIQUETA_GRANULARIDAD[granularidad]}.
        </p>
      </div>
    );
  }

  const money = (v: number) =>
    `${simbolo}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v)}`;

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="gradImporte" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="etiqueta"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => money(v)}
            width={70}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{
              background: '#0F1C2A',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            formatter={(value, name) => {
              const num = Number(value ?? 0);
              return name === 'importe' ? [money(num), 'Importe'] : [String(num), 'Tickets'];
            }}
          />
          <Bar dataKey="num_ventas" fill="rgba(255,255,255,0.12)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Area
            type="monotone"
            dataKey="importe"
            stroke="#34d399"
            strokeWidth={2}
            fill="url(#gradImporte)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
