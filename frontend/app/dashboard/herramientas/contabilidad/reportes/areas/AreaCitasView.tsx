'use client';

import { CalendarCheck, CalendarClock, CalendarDays, Clock, Users } from 'lucide-react';
import type { AreaCitas } from './tipos';
import SerieMultiple from './SerieMultiple';
import { Barras, DIAS_SEMANA, Desglose, ESTADO_LABEL, Kpis, Seccion, Tabla, useFormato } from './ui';

export default function AreaCitasView({ d }: { d: AreaCitas }) {
  const f = useFormato();
  const t = d.totales;

  return (
    <div className="space-y-5">
      <Kpis
        items={[
          { label: 'Citas', valor: f.num(t.total), sub: `${f.num(t.promedio_diario, 1)} por día` },
          { label: 'Completadas', valor: f.num(t.completadas), sub: f.pct(t.tasa_completadas_pct), color: 'text-emerald-300' },
          { label: 'Canceladas', valor: f.num(t.canceladas), sub: f.pct(t.tasa_cancelacion_pct), color: t.canceladas ? 'text-rose-300' : 'text-white' },
          {
            label: 'Duración media',
            valor: t.duracion_promedio_min === null ? '—' : `${t.duracion_promedio_min} min`,
            sub: `${t.clientes_distintos} cliente(s) distintos`,
            color: 'text-cyan-300',
          },
        ]}
      />

      <Seccion titulo="Evolución" icono={CalendarDays} color="text-cyan-400">
        <SerieMultiple
          puntos={d.serie.puntos}
          granularidad={d.serie.granularidad}
          locale={f.locale}
          formatear={(v) => f.num(v)}
          vacio="Sin citas en este periodo."
          series={[
            { clave: 'completadas', nombre: 'Completadas', color: '#34d399', tipo: 'barra' },
            { clave: 'canceladas', nombre: 'Canceladas', color: '#fb7185', tipo: 'barra' },
            { clave: 'citas', nombre: 'Total', color: '#67e8f9', tipo: 'linea' },
          ]}
        />
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Estado de la agenda" icono={CalendarCheck} color="text-cyan-400">
          <Desglose
            items={[
              { label: 'Pendientes', valor: f.num(t.pendientes), color: 'text-amber-300' },
              { label: 'Confirmadas', valor: f.num(t.confirmadas), color: 'text-sky-300' },
              { label: 'Completadas', valor: f.num(t.completadas), color: 'text-emerald-300' },
              { label: 'Canceladas', valor: f.num(t.canceladas), color: 'text-rose-300' },
              { label: 'Con venta ese día', valor: f.num(d.conversion_a_venta.completadas_con_venta) },
              { label: 'Vendido tras cita', valor: f.moneyCorto(d.conversion_a_venta.importe), color: 'text-emerald-300' },
            ]}
          />
          <p className="mt-2 text-[10px] text-white/30">
            {f.pct(d.conversion_a_venta.tasa_pct)} de las citas completadas terminaron en una venta al mismo cliente ese día.
          </p>
        </Seccion>

        <Seccion titulo="Por día de la semana" icono={CalendarDays} color="text-cyan-400">
          <Barras
            colorBarra="bg-cyan-400/70"
            items={d.por_dia_semana.map((x) => ({
              etiqueta: DIAS_SEMANA[x.dia_semana] ?? String(x.dia_semana),
              valor: x.citas,
              texto: `${x.citas} cita(s)${x.canceladas ? ` · ${x.canceladas} cancelada(s)` : ''}`,
            }))}
            vacio="Sin citas en este periodo."
          />
        </Seccion>

        <Seccion titulo="Por hora de inicio" icono={Clock} color="text-cyan-400" descripcion="Sin contar las canceladas.">
          <Barras
            colorBarra="bg-cyan-400/70"
            items={d.por_hora.map((x) => ({ etiqueta: `${String(x.hora).padStart(2, '0')}:00`, valor: x.citas, texto: `${x.citas}` }))}
            vacio="Sin citas en este periodo."
          />
        </Seccion>

        <Seccion titulo="Por cliente" icono={Users} color="text-violet-400">
          <Tabla
            filas={d.por_cliente}
            clave={(x) => x.cliente}
            vacio="Sin citas en este periodo."
            columnas={[
              { titulo: 'Cliente', valor: (x) => x.cliente, className: 'text-white/85 font-medium' },
              { titulo: 'Citas', valor: (x) => f.num(x.citas), derecha: true },
              { titulo: 'Completadas', valor: (x) => f.num(x.completadas), derecha: true, className: 'text-emerald-300' },
              { titulo: 'Canceladas', valor: (x) => f.num(x.canceladas), derecha: true, className: 'text-rose-300' },
            ]}
          />
        </Seccion>
      </div>

      <Seccion titulo="Próximos 7 días" icono={CalendarClock} color="text-amber-400" descripcion="Pendientes y confirmadas, desde hoy.">
        <Tabla
          filas={d.proximas}
          clave={(x) => x.id}
          vacio="Nada agendado para la próxima semana."
          columnas={[
            { titulo: 'Fecha', valor: (x) => f.fecha(x.fecha), className: 'text-white/85' },
            { titulo: 'Hora', valor: (x) => x.hora },
            { titulo: 'Cita', valor: (x) => x.titulo, className: 'text-white/85 font-medium' },
            { titulo: 'Cliente', valor: (x) => x.cliente ?? '—' },
            { titulo: 'Estado', valor: (x) => ESTADO_LABEL[x.estado] ?? x.estado, derecha: true },
          ]}
        />
      </Seccion>
    </div>
  );
}
