'use client';

import { Crown, Layers, Moon, PhoneCall, Target, Users } from 'lucide-react';
import type { AreaClientes } from './tipos';
import { Aviso, Barras, Desglose, Kpis, Seccion, Tabla, useFormato } from './ui';

export default function AreaClientesView({ d }: { d: AreaClientes }) {
  const f = useFormato();
  const c = d.cartera;
  const s = d.seguimiento;

  return (
    <div className="space-y-5">
      <Kpis
        items={[
          { label: 'Cartera', valor: f.num(c.total), sub: `${c.clientes} cliente(s) · ${c.leads} lead(s)` },
          { label: 'Altas del periodo', valor: f.num(c.nuevos_periodo), sub: `${c.leads_nuevos_periodo} como lead`, color: 'text-emerald-300' },
          { label: 'Compradores nuevos', valor: f.num(d.segmentos.nuevos), sub: `${d.segmentos.recurrentes} recurrente(s)`, color: 'text-violet-300' },
          { label: 'Lead → cliente', valor: f.pct(c.conversion_lead_cliente_pct), sub: 'de la cartera comercial ya compró', color: 'text-sky-300' },
        ]}
      />

      {d.cobertura.ventas_sin_cliente > 0 && (
        <Aviso tono="sky">
          {d.cobertura.ventas_sin_cliente} venta(s) por {f.moneyCorto(d.cobertura.importe_sin_cliente)} se cobraron sin identificar al
          cliente ({d.cobertura.ventas_con_cliente} sí lo tienen). Asignarlo al cobrar mejora la recurrencia y los dormidos.
        </Aviso>
      )}

      <Seccion titulo="Mejores clientes del periodo" icono={Crown} color="text-amber-400">
        <Tabla
          filas={d.top}
          clave={(x) => x.id}
          vacio="Todavía no hay ventas con cliente identificado."
          columnas={[
            { titulo: 'Cliente', valor: (x) => x.nombre, className: 'text-white/85 font-medium' },
            { titulo: 'Categoría', valor: (x) => x.categoria ?? '—' },
            { titulo: 'Compras', valor: (x) => f.num(x.compras), derecha: true },
            { titulo: 'Ticket prom.', valor: (x) => f.moneyCorto(x.ticket_promedio), derecha: true },
            { titulo: 'Importe', valor: (x) => f.moneyCorto(x.importe), derecha: true, className: 'text-emerald-300 font-semibold' },
            { titulo: 'Última', valor: (x) => f.fecha(x.ultima_compra), derecha: true },
          ]}
        />
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Seguimiento" icono={PhoneCall} color="text-sky-400" descripcion="Hace cuánto fue el último contacto con cada cliente, a día de hoy.">
          <Desglose
            items={[
              { label: '≤ 30 días', valor: f.num(s.hasta_30_dias), color: 'text-emerald-300' },
              { label: '31 – 60 días', valor: f.num(s.de_31_a_60_dias) },
              { label: '61 – 90 días', valor: f.num(s.de_61_a_90_dias), color: 'text-amber-300' },
              { label: '> 90 días', valor: f.num(s.mas_de_90_dias), color: s.mas_de_90_dias ? 'text-rose-300' : 'text-white' },
              { label: 'Sin registro', valor: f.num(s.sin_contacto_registrado), color: 'text-white/60' },
              { label: 'Proveedores', valor: f.num(c.proveedores + c.ambos) },
            ]}
          />
        </Seccion>

        <Seccion titulo="Por categoría" icono={Layers} color="text-violet-400">
          <Barras
            colorBarra="bg-violet-400/70"
            items={d.por_categoria.map((x) => ({ etiqueta: x.categoria, valor: x.cantidad, texto: `${x.cantidad}` }))}
            vacio="Sin contactos registrados."
          />
        </Seccion>

        <Seccion titulo="Clientes dormidos" icono={Moon} color="text-white/60" descripcion="Compraron antes, pero llevan más de 60 días sin volver.">
          <Tabla
            filas={d.dormidos}
            clave={(x) => x.id}
            vacio="Ningún cliente dormido."
            columnas={[
              { titulo: 'Cliente', valor: (x) => x.nombre, className: 'text-white/85 font-medium' },
              { titulo: 'Histórico', valor: (x) => f.moneyCorto(x.importe_historico), derecha: true },
              { titulo: 'Última', valor: (x) => f.fecha(x.ultima_compra), derecha: true },
              { titulo: 'Días', valor: (x) => f.num(x.dias_sin_comprar), derecha: true, className: 'text-amber-300' },
            ]}
          />
        </Seccion>

        <Seccion titulo="Cotizados sin compra" icono={Target} color="text-blue-400" descripcion="Les cotizaste en el periodo y todavía no compraron: oportunidades abiertas.">
          <Tabla
            filas={d.cotizados_sin_compra}
            clave={(x) => x.id}
            vacio="No hay oportunidades abiertas."
            columnas={[
              { titulo: 'Cliente', valor: (x) => x.nombre, className: 'text-white/85 font-medium' },
              { titulo: 'Cotizaciones', valor: (x) => f.num(x.cotizaciones), derecha: true },
              { titulo: 'Cotizado', valor: (x) => f.moneyCorto(x.importe_cotizado), derecha: true, className: 'text-blue-300' },
            ]}
          />
        </Seccion>
      </div>

      {d.top.length === 0 && d.cartera.total === 0 && (
        <Aviso tono="sky">
          <Users className="mr-1 inline h-3.5 w-3.5" />
          Aún no hay contactos. Da de alta a tus clientes en la herramienta Clientes para ver este reporte completo.
        </Aviso>
      )}
    </div>
  );
}
