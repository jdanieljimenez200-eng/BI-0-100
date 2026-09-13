'use client';

import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Granularidad } from '../tipos';

export interface SerieDef {
  clave: string;
  nombre: string;
  color: string;
  tipo: 'barra' | 'linea';
}

interface Props {
  puntos: Record<string, number | string>[];
  series: SerieDef[];
  granularidad: Granularidad;
  locale: string;
  formatear: (v: number) => string;
  vacio: string;
}

/** Misma construcción de etiqueta que SerieVentasChart: por partes, sin desfase UTC. */
function etiqueta(periodo: string, granularidad: Granularidad, locale: string) {
  const [y, m, d] = periodo.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return periodo;
  const fecha = new Date(Date.UTC(y, m - 1, d || 1));
  const opts: Intl.DateTimeFormatOptions =
    granularidad === 'mes' || granularidad === 'anio'
      ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
      : { day: '2-digit', month: 'short', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, opts).format(fecha);
}

/** Serie temporal con varias medidas: barras para volúmenes, línea para acumulados. */
export default function SerieMultiple({ puntos, series, granularidad, locale, formatear, vacio }: Props) {
  const datos = useMemo(
    (): Record<string, number | string>[] =>
      puntos.map((p) => ({ ...p, etiqueta: etiqueta(String(p.periodo), granularidad, locale) })),
    [puntos, granularidad, locale],
  );

  const hayDatos = datos.some((p) => series.some((s) => Number(p[s.clave] ?? 0) !== 0));
  if (!hayDatos) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-xs text-white/40">
        {vacio}
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
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
            tickFormatter={(v: number) => formatear(v)}
            width={72}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ background: '#0F1C2A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            formatter={(value, name) => [formatear(Number(value ?? 0)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} />
          {series.map((s) =>
            s.tipo === 'barra' ? (
              <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={26} />
            ) : (
              <Line key={s.clave} dataKey={s.clave} name={s.nombre} stroke={s.color} strokeWidth={2} dot={false} type="monotone" />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
