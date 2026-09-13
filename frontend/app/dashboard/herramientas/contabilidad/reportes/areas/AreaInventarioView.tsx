'use client';

import { AlertTriangle, Archive, Boxes, Hourglass, Layers, Recycle, Truck } from 'lucide-react';
import type { AreaInventario } from './tipos';
import { Aviso, Barras, Desglose, Kpis, Seccion, Tabla, useFormato } from './ui';

export default function AreaInventarioView({ d }: { d: AreaInventario }) {
  const f = useFormato();
  const v = d.valuacion;
  const c = d.consumo;

  return (
    <div className="space-y-5">
      <Kpis
        items={[
          { label: 'Valor del inventario', valor: f.money(v.valor_total), sub: `${v.insumos_activos} insumo(s) activos`, color: 'text-amber-300' },
          { label: 'Compras del periodo', valor: f.money(c.compras), sub: `${d.totales.entradas_unidades} uds. recibidas`, color: 'text-emerald-300' },
          { label: 'Consumo por ventas', valor: f.money(c.por_ventas), sub: `${d.totales.salidas_por_venta} salida(s) automáticas` },
          {
            label: 'Mermas',
            valor: f.money(c.mermas),
            sub: `${f.pct(c.mermas_sobre_consumo_pct)} de todo lo consumido`,
            color: c.mermas ? 'text-rose-300' : 'text-white',
          },
        ]}
      />

      {(v.sin_stock > 0 || v.bajo_minimo > 0) && (
        <Aviso tono={v.sin_stock ? 'rose' : 'amber'}>
          {v.sin_stock > 0 && <strong>{v.sin_stock} insumo(s) sin existencias. </strong>}
          {v.bajo_minimo > 0 && `${v.bajo_minimo} por debajo del mínimo configurado.`}
        </Aviso>
      )}

      <Seccion titulo="Movimiento de almacén" icono={Boxes} color="text-amber-400">
        <Desglose
          items={[
            { label: 'Entradas', valor: `${f.num(d.totales.entradas_unidades, 2)} · ${f.moneyCorto(d.totales.entradas_valor)}`, color: 'text-emerald-300' },
            { label: 'Salidas', valor: `${f.num(d.totales.salidas_unidades, 2)} · ${f.moneyCorto(d.totales.salidas_valor)}`, color: 'text-sky-300' },
            { label: 'Mermas', valor: `${f.num(d.totales.mermas_unidades, 2)} · ${f.moneyCorto(d.totales.mermas_valor)}`, color: 'text-rose-300' },
            { label: 'Salidas manuales', valor: f.moneyCorto(c.salidas_manuales) },
            { label: 'Ajustes (uds.)', valor: f.num(d.totales.ajustes_unidades, 2) },
            { label: 'Sin stock', valor: f.num(v.sin_stock), color: v.sin_stock ? 'text-rose-300' : 'text-white' },
          ]}
        />
      </Seccion>

      <Seccion titulo="Por insumo" icono={Boxes} color="text-amber-400" descripcion="Entradas, salidas y mermas de cada insumo en el periodo.">
        <Tabla
          filas={d.por_insumo}
          clave={(i) => i.id}
          max={25}
          vacio="Sin movimientos de almacén en este periodo."
          columnas={[
            { titulo: 'Insumo', valor: (i) => i.nombre, className: 'text-white/85 font-medium' },
            { titulo: 'Entradas', valor: (i) => `${f.num(i.entradas, 2)} ${i.unidad}`, derecha: true },
            { titulo: 'Salidas', valor: (i) => `${f.num(i.salidas, 2)} ${i.unidad}`, derecha: true },
            { titulo: 'Mermas', valor: (i) => `${f.num(i.mermas, 2)} ${i.unidad}`, derecha: true, className: 'text-rose-300' },
            { titulo: 'Valor salidas', valor: (i) => f.moneyCorto(i.valor_salidas), derecha: true },
          ]}
        />
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Bajo mínimo" icono={AlertTriangle} color="text-amber-400">
          <Tabla
            filas={d.bajo_minimo}
            clave={(i) => i.id}
            vacio="Ningún insumo por debajo de su mínimo."
            columnas={[
              { titulo: 'Insumo', valor: (i) => i.nombre, className: 'text-white/85 font-medium' },
              { titulo: 'Stock / mínimo', valor: (i) => `${f.num(i.stock_actual, 2)} / ${f.num(i.stock_minimo, 2)} ${i.unidad}`, derecha: true, className: 'text-amber-200' },
              { titulo: 'Reponer (aprox.)', valor: (i) => f.moneyCorto(Math.max(0, i.stock_minimo - i.stock_actual) * i.costo_promedio), derecha: true },
            ]}
          />
        </Seccion>

        <Seccion titulo="Días de cobertura" icono={Hourglass} color="text-sky-400" descripcion="Con el consumo medio del periodo, cuánto dura lo que hay.">
          <Tabla
            filas={[...d.cobertura].sort((a, b) => (a.dias_cobertura ?? 1e9) - (b.dias_cobertura ?? 1e9))}
            clave={(i) => i.id}
            max={12}
            vacio="Sin consumo registrado en el periodo."
            columnas={[
              { titulo: 'Insumo', valor: (i) => i.nombre, className: 'text-white/85 font-medium' },
              { titulo: 'Consumo/día', valor: (i) => `${f.num(i.consumo_diario, 2)} ${i.unidad}`, derecha: true },
              { titulo: 'Stock', valor: (i) => `${f.num(i.stock_actual, 2)}`, derecha: true },
              {
                titulo: 'Días',
                valor: (i) => (i.dias_cobertura === null ? '—' : f.num(i.dias_cobertura)),
                derecha: true,
                className: 'font-semibold text-sky-300',
              },
            ]}
          />
        </Seccion>

        <Seccion titulo="Valor por categoría" icono={Layers} color="text-amber-400">
          <Barras
            colorBarra="bg-amber-400/70"
            items={v.por_categoria.map((x) => ({
              etiqueta: x.categoria,
              valor: x.valor,
              texto: `${f.moneyCorto(x.valor)} · ${f.pct(x.participacion_pct)} · ${x.insumos} insumo(s)`,
            }))}
            vacio="Sin insumos activos."
          />
        </Seccion>

        <Seccion titulo="Compras por proveedor" icono={Truck} color="text-emerald-400">
          <Tabla
            filas={d.por_proveedor}
            clave={(p) => p.proveedor}
            vacio="Sin compras en el periodo."
            columnas={[
              { titulo: 'Proveedor', valor: (p) => p.proveedor, className: 'text-white/85 font-medium' },
              { titulo: 'Compras', valor: (p) => f.num(p.compras), derecha: true },
              { titulo: 'Insumos', valor: (p) => f.num(p.insumos), derecha: true },
              { titulo: 'Valor', valor: (p) => f.moneyCorto(p.valor), derecha: true, className: 'text-emerald-300' },
            ]}
          />
        </Seccion>

        <Seccion titulo="Mermas por motivo" icono={Recycle} color="text-rose-400">
          <Barras
            colorBarra="bg-rose-400/70"
            items={d.mermas_por_motivo.map((m) => ({ etiqueta: m.motivo, valor: m.valor, texto: `${f.moneyCorto(m.valor)} · ${m.veces} vez/veces` }))}
            vacio="Sin mermas en el periodo."
          />
        </Seccion>

        <Seccion titulo="Capital parado" icono={Archive} color="text-white/60" descripcion="Insumos con existencias que no se movieron en el periodo.">
          <Tabla
            filas={d.sin_movimiento}
            clave={(i) => i.id}
            max={10}
            vacio="Todo lo que tiene existencias se movió."
            columnas={[
              { titulo: 'Insumo', valor: (i) => i.nombre, className: 'text-white/85 font-medium' },
              { titulo: 'Stock', valor: (i) => `${f.num(i.stock_actual, 2)} ${i.unidad}`, derecha: true },
              { titulo: 'Valor', valor: (i) => f.moneyCorto(i.valor), derecha: true },
              { titulo: 'Último mov.', valor: (i) => f.fecha(i.ultimo_movimiento), derecha: true },
            ]}
          />
        </Seccion>
      </div>
    </div>
  );
}
