'use client';

import { Briefcase, CalendarRange, UserX, Users, Wallet } from 'lucide-react';
import type { AreaPersonal } from './tipos';
import { Aviso, Kpis, Seccion, Tabla, TIPO_PAGO_LABEL, useFormato } from './ui';

export default function AreaPersonalView({ d }: { d: AreaPersonal }) {
  const f = useFormato();
  const p = d.plantilla;
  const masa = p.masa_salarial_mensual.map((m) => f.moneda(m.importe, m.moneda)).join(' + ') || '—';
  const pagado = d.pagado.por_moneda.map((m) => f.moneda(m.total, m.moneda)).join(' + ') || f.moneyCorto(0);
  const variasMonedas = new Set([...p.masa_salarial_mensual.map((m) => m.moneda), ...d.pagado.por_moneda.map((m) => m.moneda)]).size > 1;

  return (
    <div className="space-y-5">
      <Kpis
        items={[
          { label: 'Personal activo', valor: f.num(p.activos), sub: `${p.inactivos} inactivo(s) · ${p.altas_periodo} alta(s) en el periodo` },
          { label: 'Masa salarial mensual', valor: masa, sub: 'semanal y quincenal llevados a mes', color: 'text-rose-300' },
          { label: 'Pagado en el periodo', valor: pagado, sub: `${d.pagado.por_moneda.reduce((s, m) => s + m.pagos, 0)} pago(s)`, color: 'text-amber-300' },
          { label: 'Nómina sobre ventas', valor: f.pct(d.pagado.sobre_ventas_pct), sub: 'pagado ÷ facturado del periodo', color: 'text-sky-300' },
        ]}
      />

      {variasMonedas && (
        <Aviso tono="sky">Hay sueldos en más de una moneda: los importes se muestran por separado y el % sobre ventas es solo orientativo.</Aviso>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Por cargo" icono={Briefcase} color="text-rose-400">
          <Tabla
            filas={d.por_cargo}
            clave={(x) => `${x.cargo}-${x.moneda}`}
            vacio="Sin personal activo."
            columnas={[
              { titulo: 'Cargo', valor: (x) => x.cargo, className: 'text-white/85 font-medium' },
              { titulo: 'Personas', valor: (x) => f.num(x.personas), derecha: true },
              { titulo: 'Masa mensual', valor: (x) => f.moneda(x.masa_mensual, x.moneda), derecha: true, className: 'text-rose-300' },
            ]}
          />
        </Seccion>

        <Seccion titulo="Pagos por mes" icono={CalendarRange} color="text-amber-400">
          <Tabla
            filas={d.por_mes}
            clave={(x) => `${x.mes}-${x.moneda}`}
            vacio="Sin pagos de nómina en el periodo."
            columnas={[
              { titulo: 'Mes', valor: (x) => x.mes, className: 'text-white/85' },
              { titulo: 'Pagos', valor: (x) => f.num(x.pagos), derecha: true },
              { titulo: 'Total', valor: (x) => f.moneda(x.total, x.moneda), derecha: true, className: 'text-amber-300' },
            ]}
          />
        </Seccion>
      </div>

      <Seccion titulo="Pagado por persona" icono={Wallet} color="text-amber-400">
        <Tabla
          filas={d.por_empleado}
          clave={(x) => `${x.empleado}-${x.moneda}`}
          vacio="Sin pagos de nómina en el periodo."
          columnas={[
            { titulo: 'Persona', valor: (x) => x.empleado, className: 'text-white/85 font-medium' },
            { titulo: 'Cargo', valor: (x) => x.cargo ?? '—' },
            { titulo: 'Pagos', valor: (x) => f.num(x.pagos), derecha: true },
            { titulo: 'Total', valor: (x) => f.moneda(x.total, x.moneda), derecha: true, className: 'text-amber-300 font-semibold' },
            { titulo: 'Último pago', valor: (x) => f.fecha(x.ultimo_pago), derecha: true },
          ]}
        />
      </Seccion>

      <Seccion
        titulo="Activos sin pago en el periodo"
        icono={UserX}
        color="text-rose-400"
        descripcion="Si el periodo es más corto que su ciclo de pago puede ser normal; revisa la columna de ciclo."
      >
        <Tabla
          filas={d.sin_pago_en_periodo}
          clave={(x) => x.id}
          vacio="Todo el personal activo recibió pago en el periodo."
          columnas={[
            { titulo: 'Persona', valor: (x) => x.nombre, className: 'text-white/85 font-medium' },
            { titulo: 'Cargo', valor: (x) => x.cargo ?? '—' },
            { titulo: 'Ciclo', valor: (x) => TIPO_PAGO_LABEL[x.tipo_pago] ?? x.tipo_pago },
            { titulo: 'Sueldo', valor: (x) => f.moneda(x.salario, x.moneda), derecha: true },
            { titulo: 'Último pago', valor: (x) => f.fecha(x.ultimo_pago), derecha: true },
          ]}
        />
      </Seccion>

      {p.activos === 0 && (
        <Aviso tono="sky">
          <Users className="mr-1 inline h-3.5 w-3.5" />
          Aún no hay personal registrado. Da de alta a tu equipo en la herramienta Nómina.
        </Aviso>
      )}
    </div>
  );
}
