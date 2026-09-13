'use client';

import { AlertTriangle, Clock, CreditCard, Layers, Package, Receipt, TrendingDown, TrendingUp, UserCheck } from 'lucide-react';
import SerieVentasChart from '../SerieVentasChart';
import HeatmapHorarios from '../HeatmapHorarios';
import type { AreaVentas } from './tipos';
import type { ProductoReporte } from '../tipos';
import { Aviso, Barras, Kpis, Seccion, Tabla, useFormato } from './ui';

export default function AreaVentasView({ d }: { d: AreaVentas }) {
  const f = useFormato();
  const t = d.totales;
  const totalMetodos = d.metodos_pago.reduce((s, m) => s + m.importe, 0);

  const margenCols = [
    { titulo: 'Producto', valor: (p: ProductoReporte) => p.nombre, className: 'text-white/85 font-medium' },
    { titulo: 'Importe', valor: (p: ProductoReporte) => f.moneyCorto(p.importe), derecha: true },
    { titulo: 'Margen', valor: (p: ProductoReporte) => f.pct(p.margen_pct), derecha: true, className: 'text-violet-300' },
  ];

  return (
    <div className="space-y-5">
      <Kpis
        columnas={4}
        items={[
          { label: 'Facturado', valor: f.money(t.importe), delta: d.comparativa.importe_pct, sub: `Antes ${f.moneyCorto(d.comparativa.importe_anterior)}`, color: 'text-emerald-300' },
          { label: 'Tickets', valor: f.num(t.num_ventas), delta: d.comparativa.num_ventas_pct, sub: `${t.dias_con_venta} día(s) con venta` },
          { label: 'Ticket promedio', valor: f.money(t.ticket_promedio), delta: d.comparativa.ticket_promedio_pct, color: 'text-sky-300' },
          { label: 'Promedio diario', valor: f.money(t.promedio_diario), sub: 'sobre todos los días del periodo' },
          {
            label: 'Utilidad bruta',
            valor: t.margen_pct === null ? 'Sin costos' : f.money(t.utilidad_bruta),
            sub: t.margen_pct === null ? 'Define recetas en el POS' : `Margen ${f.pct(t.margen_pct)} · cobertura ${f.pct(t.cobertura_pct)}`,
            color: t.margen_pct === null ? 'text-white/40' : 'text-violet-300',
          },
          { label: 'Costo de lo vendido', valor: f.money(t.costo_ventas), sub: `Impuestos cobrados ${f.moneyCorto(t.impuestos)}` },
          { label: 'Canceladas', valor: f.num(t.canceladas), sub: f.moneyCorto(t.importe_cancelado), color: t.canceladas ? 'text-rose-300' : 'text-white' },
          { label: 'Desde cotización', valor: f.num(t.desde_cotizacion), sub: f.moneyCorto(t.importe_desde_cotizacion), color: 'text-blue-300' },
        ]}
      />

      {t.margen_pct !== null && t.cobertura_pct < 80 && (
        <Aviso>
          Solo el <strong>{f.pct(t.cobertura_pct)}</strong> de lo vendido tiene costo conocido: el margen es parcial.
          {d.productos_sin_costo.length > 0 && ` Sin receta: ${d.productos_sin_costo.slice(0, 6).join(', ')}${d.productos_sin_costo.length > 6 ? '…' : ''}.`}
        </Aviso>
      )}

      <Seccion titulo="Evolución de ventas" icono={Receipt} descripcion={`Agrupado por ${d.serie.granularidad}. Barras: tickets; área: importe.`}>
        <SerieVentasChart puntos={d.serie.puntos} granularidad={d.serie.granularidad} simbolo={f.simbolo} locale={f.locale} />
      </Seccion>

      <Seccion titulo="Productos vendidos" icono={Package} color="text-sky-400">
        <Tabla
          filas={d.productos}
          clave={(p) => p.nombre}
          vacio="Sin ventas registradas en este periodo."
          columnas={[
            { titulo: 'Producto', valor: (p) => p.nombre, className: 'text-white/85 font-medium' },
            { titulo: 'Uds.', valor: (p) => f.num(p.unidades, 2), derecha: true },
            { titulo: 'Tickets', valor: (p) => f.num(p.tickets), derecha: true },
            { titulo: 'Importe', valor: (p) => f.moneyCorto(p.importe), derecha: true, className: 'text-emerald-300 font-semibold' },
            { titulo: 'Costo', valor: (p) => (p.costo === null ? 'sin receta' : f.moneyCorto(p.costo)), derecha: true },
            { titulo: 'Utilidad', valor: (p) => (p.utilidad === null ? '—' : f.moneyCorto(p.utilidad)), derecha: true },
            {
              titulo: 'Margen',
              valor: (p) => (p.margen_pct === null ? '—' : `${f.pct(p.margen_pct)}${p.costo_parcial ? '*' : ''}`),
              derecha: true,
              className: 'text-violet-300',
            },
          ]}
        />
        {d.productos.some((p) => p.costo_parcial) && (
          <p className="mt-2 text-[10px] text-white/30">* margen calculado solo sobre las unidades con receta.</p>
        )}
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Mejores márgenes" icono={TrendingUp} color="text-emerald-400">
          <Tabla filas={d.mejores_margenes} clave={(p) => p.nombre} columnas={margenCols} vacio="Ningún producto tiene receta con costo." />
        </Seccion>
        <Seccion titulo="Peores márgenes" icono={TrendingDown} color="text-rose-400" descripcion="Candidatos a revisar precio o receta.">
          <Tabla filas={d.peores_margenes} clave={(p) => p.nombre} columnas={margenCols} vacio="Ningún producto tiene receta con costo." />
        </Seccion>

        <Seccion titulo="Por categoría" icono={Layers} color="text-amber-400">
          <Barras
            colorBarra="bg-amber-400/70"
            items={d.por_categoria.map((c) => ({
              etiqueta: c.categoria,
              valor: c.importe,
              texto: `${f.moneyCorto(c.importe)} · ${f.pct(c.participacion_pct)} · ${f.num(c.unidades)} uds.`,
            }))}
          />
        </Seccion>

        <Seccion titulo="Métodos de pago" icono={CreditCard} color="text-teal-400">
          <Barras
            colorBarra="bg-teal-400/70"
            items={d.metodos_pago.map((m) => ({
              etiqueta: m.metodo_pago,
              valor: m.importe,
              texto: `${f.moneyCorto(m.importe)} · ${m.num_ventas} ticket(s) · ${f.pct(totalMetodos ? (m.importe / totalMetodos) * 100 : null)}`,
            }))}
          />
        </Seccion>

        <Seccion titulo="Por vendedor" icono={UserCheck} color="text-rose-400" descripcion="Quién registró cada venta en el POS.">
          <Tabla
            filas={d.por_vendedor}
            clave={(v) => v.vendedor}
            columnas={[
              { titulo: 'Vendedor', valor: (v) => v.vendedor, className: 'text-white/85 font-medium' },
              { titulo: 'Tickets', valor: (v) => f.num(v.num_ventas), derecha: true },
              { titulo: 'Ticket prom.', valor: (v) => f.moneyCorto(v.ticket_promedio), derecha: true },
              { titulo: 'Importe', valor: (v) => f.moneyCorto(v.importe), derecha: true, className: 'text-emerald-300' },
              { titulo: '%', valor: (v) => f.pct(v.participacion_pct), derecha: true },
            ]}
          />
        </Seccion>

        <Seccion titulo="Tamaño de ticket" icono={Receipt} color="text-sky-400" descripcion="Cuántas ventas caen en cada rango de importe.">
          <Barras
            colorBarra="bg-sky-400/70"
            items={d.rangos_ticket.map((r) => ({
              etiqueta: `${f.simbolo}${r.rango}`,
              valor: r.num_ventas,
              texto: `${r.num_ventas} venta(s) · ${f.moneyCorto(r.importe)}`,
            }))}
          />
        </Seccion>
      </div>

      <Seccion titulo="A qué horas vendes" icono={Clock}>
        <HeatmapHorarios datos={d.horarios} simbolo={f.simbolo} locale={f.locale} />
      </Seccion>

      {d.productos_sin_costo.length > 0 && t.margen_pct === null && (
        <Aviso>
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          Ninguna venta del periodo tiene costo: define la receta de tus productos en el POS para ver márgenes.
        </Aviso>
      )}
    </div>
  );
}
