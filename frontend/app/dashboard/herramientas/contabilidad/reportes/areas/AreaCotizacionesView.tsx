'use client';

import { AlarmClock, CalendarRange, FileText, Percent, Users } from 'lucide-react';
import type { AreaCotizaciones } from './tipos';
import { Aviso, Barras, Desglose, ESTADO_LABEL, Kpis, Seccion, Tabla, useFormato } from './ui';

export default function AreaCotizacionesView({ d }: { d: AreaCotizaciones }) {
  const f = useFormato();
  const conv = d.conversion_a_venta;

  return (
    <div className="space-y-5">
      <Kpis
        items={[
          { label: 'Emitidas', valor: f.num(d.emitidas), sub: f.moneyCorto(d.importe_emitido) },
          { label: 'Aceptadas', valor: f.num(d.aceptadas), sub: f.moneyCorto(d.importe_aceptado), color: 'text-emerald-300' },
          { label: 'Tasa de aceptación', valor: f.pct(d.tasa_conversion_pct), sub: `${d.rechazadas} rechazada(s) · ${d.abiertas} abierta(s)`, color: 'text-blue-300' },
          { label: 'Ticket promedio', valor: f.money(d.ticket_promedio), sub: 'por cotización' },
        ]}
      />

      {d.vencidas.cantidad > 0 && (
        <Aviso>
          <strong>{d.vencidas.cantidad}</strong> cotización(es) vencidas sin respuesta por {f.moneyCorto(d.vencidas.importe)}. Es dinero que
          se enfría: vale la pena llamar hoy.
        </Aviso>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="De cotización a venta" icono={Percent} color="text-emerald-400" descripcion="Cotizaciones del periodo que terminaron cobradas en el POS.">
          <Desglose
            items={[
              { label: 'Convertidas en venta', valor: f.num(conv.convertidas), color: 'text-emerald-300' },
              { label: 'Importe cobrado', valor: f.moneyCorto(conv.importe_vendido) },
              { label: 'Días hasta cobrar', valor: conv.dias_promedio === null ? '—' : f.num(conv.dias_promedio, 1) },
            ]}
          />
        </Seccion>

        <Seccion titulo="Descuentos" icono={Percent} color="text-amber-400">
          <Desglose
            items={[
              { label: 'Total descontado', valor: f.moneyCorto(d.descuentos.total), color: 'text-amber-300' },
              { label: 'Con descuento', valor: f.num(d.descuentos.cotizaciones_con_descuento) },
              { label: 'Descuento medio', valor: f.pct(d.descuentos.descuento_medio_pct) },
            ]}
          />
        </Seccion>

        <Seccion titulo="Por estado" icono={FileText} color="text-blue-400">
          <Barras
            colorBarra="bg-blue-400/70"
            items={d.por_estado.map((e) => ({
              etiqueta: ESTADO_LABEL[e.estado] ?? e.estado,
              valor: e.importe,
              texto: `${e.cantidad} · ${f.moneyCorto(e.importe)}`,
            }))}
            vacio="Ninguna cotización emitida en el periodo."
          />
        </Seccion>

        <Seccion titulo="Por mes" icono={CalendarRange} color="text-blue-400">
          <Tabla
            filas={d.por_mes}
            clave={(m) => m.mes}
            vacio="Ninguna cotización emitida en el periodo."
            columnas={[
              { titulo: 'Mes', valor: (m) => m.mes, className: 'text-white/85' },
              { titulo: 'Emitidas', valor: (m) => f.num(m.emitidas), derecha: true },
              { titulo: 'Aceptadas', valor: (m) => f.num(m.aceptadas), derecha: true, className: 'text-emerald-300' },
              { titulo: 'Importe', valor: (m) => f.moneyCorto(m.importe), derecha: true },
            ]}
          />
        </Seccion>
      </div>

      <Seccion titulo="Por cliente" icono={Users} color="text-violet-400">
        <Tabla
          filas={d.por_cliente}
          clave={(c) => c.cliente}
          vacio="Ninguna cotización emitida en el periodo."
          columnas={[
            { titulo: 'Cliente', valor: (c) => c.cliente, className: 'text-white/85 font-medium' },
            { titulo: 'Cotizaciones', valor: (c) => f.num(c.cotizaciones), derecha: true },
            { titulo: 'Aceptadas', valor: (c) => f.num(c.aceptadas), derecha: true },
            { titulo: 'Conversión', valor: (c) => f.pct(c.conversion_pct), derecha: true, className: 'text-blue-300' },
            { titulo: 'Importe', valor: (c) => f.moneyCorto(c.importe), derecha: true, className: 'text-emerald-300' },
          ]}
        />
      </Seccion>

      <Seccion titulo="Vencidas sin respuesta" icono={AlarmClock} color="text-rose-400" descripcion="A día de hoy, sin importar el periodo elegido.">
        <Tabla
          filas={d.vencidas.lista}
          clave={(c) => c.id}
          vacio="No hay cotizaciones vencidas pendientes."
          columnas={[
            { titulo: 'Folio', valor: (c) => c.numero, className: 'text-white/85 font-medium' },
            { titulo: 'Cliente', valor: (c) => c.cliente ?? '—' },
            { titulo: 'Estado', valor: (c) => ESTADO_LABEL[c.estado] ?? c.estado },
            { titulo: 'Venció', valor: (c) => f.fecha(c.fecha_vencimiento), derecha: true },
            { titulo: 'Días', valor: (c) => f.num(c.dias_vencida), derecha: true, className: 'text-rose-300' },
            { titulo: 'Total', valor: (c) => f.moneyCorto(c.total), derecha: true },
          ]}
        />
      </Seccion>
    </div>
  );
}
