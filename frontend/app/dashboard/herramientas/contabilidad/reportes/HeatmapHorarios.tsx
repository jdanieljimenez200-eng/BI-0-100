'use client';

import { useMemo } from 'react';
import type { HorariosReporte } from './tipos';

interface Props {
  datos: HorariosReporte;
  simbolo: string;
  locale: string;
}

// EXTRACT(DOW) de Postgres: 0 = domingo.
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Heatmap día × hora de las ventas.
 *
 * Hecho con divs y Tailwind, igual que el heatmap del módulo de marketing: una
 * rejilla de 7×24 no necesita una librería de gráficas.
 *
 * Solo se pintan las horas con actividad. Un negocio que abre de 9 a 20 no
 * necesita ver 24 columnas, 13 de ellas vacías.
 */
export default function HeatmapHorarios({ datos, simbolo, locale }: Props) {
  const { horas, mapa, maximo, total } = useMemo(() => {
    const mapa = new Map<string, { num_ventas: number; importe: number }>();
    let maximo = 0;
    let total = 0;
    const horasConDatos = new Set<number>();

    for (const c of datos.celdas) {
      mapa.set(`${c.dia_semana}-${c.hora}`, { num_ventas: c.num_ventas, importe: c.importe });
      if (c.num_ventas > maximo) maximo = c.num_ventas;
      total += c.num_ventas;
      horasConDatos.add(c.hora);
    }

    const lista = Array.from(horasConDatos).sort((a, b) => a - b);
    // Se rellenan los huecos intermedios: saltar de las 10 a las 14 rompería la
    // lectura del eje.
    const horas =
      lista.length > 0
        ? Array.from({ length: lista[lista.length - 1] - lista[0] + 1 }, (_, i) => lista[0] + i)
        : [];

    return { horas, mapa, maximo, total };
  }, [datos]);

  if (total === 0) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-center">
        <p className="text-sm font-semibold text-white/70">Todavía no hay horas que analizar</p>
        <p className="mt-1 max-w-xs text-xs text-white/40">
          Con unas cuantas ventas verás a qué horas vendes más.
        </p>
      </div>
    );
  }

  const money = (v: number) =>
    `${simbolo}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v)}`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="mb-1 flex gap-1 pl-10">
          {horas.map((h) => (
            <div key={h} className="w-7 shrink-0 text-center text-[9px] text-white/30 tabular-nums">
              {h}
            </div>
          ))}
        </div>

        {DIAS.map((dia, idx) => (
          <div key={dia} className="mb-1 flex items-center gap-1">
            <div className="w-9 shrink-0 text-right text-[10px] font-medium text-white/40">{dia}</div>
            {horas.map((h) => {
              const celda = mapa.get(`${idx}-${h}`);
              const intensidad = celda && maximo > 0 ? celda.num_ventas / maximo : 0;
              return (
                <div
                  key={h}
                  title={
                    celda
                      ? `${dia} ${h}:00 — ${celda.num_ventas} venta(s), ${money(celda.importe)}`
                      : `${dia} ${h}:00 — sin ventas`
                  }
                  className="h-7 w-7 shrink-0 rounded-md border border-white/[0.06] transition-transform hover:scale-110"
                  style={{
                    // El 0.12 de piso mantiene visible la celda con una sola
                    // venta; con opacidad proporcional pura sería invisible.
                    backgroundColor: celda
                      ? `rgba(52, 211, 153, ${0.12 + intensidad * 0.78})`
                      : 'rgba(255,255,255,0.02)',
                  }}
                />
              );
            })}
          </div>
        ))}

        <p className="mt-2 text-[10px] text-white/30">
          Horario local ({datos.timezone.replace('_', ' ')}). Más verde = más tickets.
        </p>
      </div>
    </div>
  );
}
