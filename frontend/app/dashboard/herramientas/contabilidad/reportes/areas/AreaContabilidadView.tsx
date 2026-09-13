'use client';

import { ArrowDownRight, ArrowUpRight, FileCheck2, GitBranch, LineChart, ListOrdered } from 'lucide-react';
import type { AreaContabilidad } from './tipos';
import SerieMultiple from './SerieMultiple';
import { Aviso, Barras, Desglose, FUENTE_LABEL, Kpis, Seccion, Tabla, useFormato } from './ui';

export default function AreaContabilidadView({ d }: { d: AreaContabilidad }) {
  const f = useFormato();
  const fl = d.flujo;
  const fis = d.fiscal;

  return (
    <div className="space-y-5">
      <Kpis
        items={[
          { label: 'Ingresos', valor: f.money(fl.ingresos), delta: d.comparativa.ingresos_pct, color: 'text-emerald-300' },
          { label: 'Egresos', valor: f.money(fl.egresos), delta: d.comparativa.egresos_pct, invertirDelta: true, color: 'text-rose-300' },
          {
            label: 'Utilidad neta',
            valor: f.money(fl.utilidad_neta),
            sub: `Antes ${f.moneyCorto(d.comparativa.utilidad_anterior)}`,
            color: fl.utilidad_neta >= 0 ? 'text-emerald-300' : 'text-rose-300',
          },
          { label: 'Margen neto', valor: f.pct(fl.margen_neto_pct), sub: 'utilidad ÷ ingresos', color: 'text-teal-300' },
        ]}
      />

      {fis.movimientos_sin_cfdi > 0 && (
        <Aviso>
          {fis.movimientos_sin_cfdi} egreso(s) por {f.moneyCorto(fis.egresos_sin_cfdi)} no tienen CFDI. Sin comprobante, en principio no se
          pueden deducir.
        </Aviso>
      )}

      <Seccion titulo="Flujo del periodo" icono={LineChart} color="text-teal-400" descripcion="Barras: ingresos y egresos. Línea: utilidad acumulada.">
        <SerieMultiple
          puntos={d.serie.puntos}
          granularidad={d.serie.granularidad}
          locale={f.locale}
          formatear={(v) => f.moneyCorto(v)}
          vacio="Sin movimientos contables en este periodo."
          series={[
            { clave: 'ingresos', nombre: 'Ingresos', color: '#34d399', tipo: 'barra' },
            { clave: 'egresos', nombre: 'Egresos', color: '#fb7185', tipo: 'barra' },
            { clave: 'acumulado', nombre: 'Acumulado', color: '#5eead4', tipo: 'linea' },
          ]}
        />
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Ingresos por categoría" icono={ArrowUpRight} color="text-emerald-400">
          <Barras
            items={d.ingresos_por_categoria.map((c) => ({
              etiqueta: c.categoria,
              valor: c.total,
              texto: `${f.moneyCorto(c.total)} · ${f.pct(c.participacion_pct)} · ${c.movimientos} mov.`,
            }))}
            vacio="Sin ingresos en el periodo."
          />
        </Seccion>

        <Seccion titulo="Egresos por categoría" icono={ArrowDownRight} color="text-rose-400">
          <Barras
            colorBarra="bg-rose-400/70"
            items={d.egresos_por_categoria.map((c) => ({
              etiqueta: c.categoria,
              valor: c.total,
              texto: `${f.moneyCorto(c.total)} · ${f.pct(c.participacion_pct)} · ${c.movimientos} mov.`,
            }))}
            vacio="Sin egresos en el periodo."
          />
        </Seccion>

        <Seccion titulo="De dónde vienen los movimientos" icono={GitBranch} color="text-sky-400" descripcion="Cada herramienta que registra en el libro.">
          <Tabla
            filas={d.por_fuente}
            clave={(x) => x.fuente}
            vacio="Sin movimientos en el periodo."
            columnas={[
              { titulo: 'Origen', valor: (x) => FUENTE_LABEL[x.fuente] ?? x.fuente, className: 'text-white/85 font-medium' },
              { titulo: 'Mov.', valor: (x) => f.num(x.movimientos), derecha: true },
              { titulo: 'Ingresos', valor: (x) => f.moneyCorto(x.ingresos), derecha: true, className: 'text-emerald-300' },
              { titulo: 'Egresos', valor: (x) => f.moneyCorto(x.egresos), derecha: true, className: 'text-rose-300' },
            ]}
          />
          <p className="mt-2 text-[10px] text-white/30">
            {d.origen.automaticos} automático(s) · {d.origen.manuales} capturado(s) a mano
          </p>
        </Seccion>

        <Seccion titulo="Fiscal" icono={FileCheck2} color="text-teal-400">
          <Desglose
            items={[
              { label: 'Egresos con CFDI', valor: f.moneyCorto(fis.egresos_con_cfdi), color: 'text-emerald-300' },
              { label: 'Egresos sin CFDI', valor: f.moneyCorto(fis.egresos_sin_cfdi), color: fis.egresos_sin_cfdi ? 'text-amber-300' : 'text-white' },
              { label: 'Deducible', valor: f.pct(fis.egresos_deducibles_pct), color: 'text-teal-300' },
              { label: 'Ingresos facturados', valor: f.moneyCorto(fis.ingresos_con_cfdi) },
              { label: 'Mov. sin CFDI', valor: f.num(fis.movimientos_sin_cfdi) },
            ]}
          />
        </Seccion>
      </div>

      <Seccion titulo="Egresos más grandes" icono={ListOrdered} color="text-rose-400">
        <Tabla
          filas={d.top_egresos}
          clave={(x) => x.id}
          vacio="Sin egresos en el periodo."
          columnas={[
            { titulo: 'Fecha', valor: (x) => f.fecha(x.fecha) },
            { titulo: 'Descripción', valor: (x) => x.descripcion, className: 'text-white/85 font-medium' },
            { titulo: 'Categoría', valor: (x) => x.categoria },
            { titulo: 'Origen', valor: (x) => FUENTE_LABEL[x.fuente] ?? x.fuente },
            { titulo: 'CFDI', valor: (x) => (x.tiene_cfdi ? 'Sí' : 'No'), className: 'text-white/60' },
            { titulo: 'Monto', valor: (x) => f.money(x.monto), derecha: true, className: 'text-rose-300 font-semibold' },
          ]}
        />
      </Seccion>
    </div>
  );
}
