'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Lock } from 'lucide-react';
import type { Area, Panorama } from './tipos';
import { AREAS } from './tipos';
import { AREA_INFO, Delta, useFormato } from './ui';

/** Una tarjeta por área: sus cifras clave y acceso al detalle. */
export default function PanoramaView({ d, abrir }: { d: Panorama; abrir: (a: Area) => void }) {
  const f = useFormato();
  const k = d.kpis;

  const cifras: Record<Area, { label: string; valor: string; extra?: ReactNode }[] | null> = {
    ventas: k.ventas && [
      { label: 'Facturado', valor: f.moneyCorto(k.ventas.importe), extra: <Delta valor={k.ventas.importe_pct} /> },
      { label: 'Tickets', valor: f.num(k.ventas.num_ventas) },
      { label: 'Ticket prom.', valor: f.moneyCorto(k.ventas.ticket_promedio) },
      { label: 'Margen', valor: f.pct(k.ventas.margen_pct) },
    ],
    inventario: k.inventario && [
      { label: 'Valor', valor: f.moneyCorto(k.inventario.valor) },
      { label: 'Compras', valor: f.moneyCorto(k.inventario.compras) },
      { label: 'Mermas', valor: f.moneyCorto(k.inventario.mermas) },
      { label: 'Bajo mínimo', valor: f.num(k.inventario.bajo_minimo) },
    ],
    cotizaciones: k.cotizaciones && [
      { label: 'Emitidas', valor: f.num(k.cotizaciones.emitidas) },
      { label: 'Importe', valor: f.moneyCorto(k.cotizaciones.importe_emitido) },
      { label: 'Aceptación', valor: f.pct(k.cotizaciones.tasa_conversion_pct) },
      { label: 'Vencidas', valor: f.num(k.cotizaciones.vencidas) },
    ],
    clientes: k.clientes && [
      { label: 'Cartera', valor: f.num(k.clientes.cartera) },
      { label: 'Altas', valor: f.num(k.clientes.nuevos) },
      { label: 'Compradores nuevos', valor: f.num(k.clientes.compradores_nuevos) },
      { label: 'Recurrentes', valor: f.num(k.clientes.recurrentes) },
    ],
    citas: k.citas && [
      { label: 'Citas', valor: f.num(k.citas.total) },
      { label: 'Completadas', valor: f.num(k.citas.completadas) },
      { label: 'Cancelación', valor: f.pct(k.citas.tasa_cancelacion_pct) },
    ],
    personal: k.personal && [
      { label: 'Activos', valor: f.num(k.personal.activos) },
      { label: 'Pagado', valor: f.moneyCorto(k.personal.pagado) },
      { label: 'Sobre ventas', valor: f.pct(k.personal.sobre_ventas_pct) },
    ],
    contabilidad: k.contabilidad && [
      { label: 'Ingresos', valor: f.moneyCorto(k.contabilidad.ingresos) },
      { label: 'Egresos', valor: f.moneyCorto(k.contabilidad.egresos) },
      { label: 'Utilidad', valor: f.moneyCorto(k.contabilidad.utilidad_neta) },
      { label: 'Margen neto', valor: f.pct(k.contabilidad.margen_neto_pct) },
    ],
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/8 bg-[#0D131F] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Qué pide atención
        </h3>
        {d.alertas.length === 0 ? (
          <p className="text-xs text-white/45">Nada urgente en las herramientas que tienes activas.</p>
        ) : (
          <ul className="space-y-1.5">
            {d.alertas.map((a) => {
              const Icono = AREA_INFO[a.area].icono;
              return (
                <li key={`${a.area}-${a.mensaje}`}>
                  <button
                    onClick={() => abrir(a.area)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                      a.nivel === 'alta'
                        ? 'border-rose-500/25 bg-rose-500/[0.07] text-rose-100/90 hover:bg-rose-500/[0.12]'
                        : 'border-amber-500/20 bg-amber-500/[0.06] text-amber-100/85 hover:bg-amber-500/[0.1]'
                    }`}
                  >
                    <Icono className={`h-3.5 w-3.5 shrink-0 ${AREA_INFO[a.area].color}`} />
                    <span className="flex-1">{a.mensaje}</span>
                    <span className="text-[10px] text-white/35">{AREA_INFO[a.area].label}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-white/30" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {AREAS.map((area) => {
          const info = AREA_INFO[area];
          const Icono = info.icono;
          const datos = cifras[area];

          if (!d.areas[area] || !datos) {
            return (
              <div key={area} className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-5">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-white/45">
                    <Icono className="h-4 w-4" />
                    {info.label}
                  </h3>
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/30">
                    <Lock className="h-3 w-3" /> No contratada
                  </span>
                </div>
                <p className="mt-2 text-xs text-white/35">
                  Activa {info.herramienta} para ver aquí su reporte.{' '}
                  <Link href="/dashboard/herramientas" className="font-semibold text-emerald-300 hover:underline">
                    Ver herramientas
                  </Link>
                </p>
              </div>
            );
          }

          return (
            <button
              key={area}
              onClick={() => abrir(area)}
              className="group rounded-2xl border border-white/8 bg-[#0D131F] p-5 text-left transition-colors hover:border-white/20"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Icono className={`h-4 w-4 ${info.color}`} />
                  {info.label}
                </h3>
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-white/35 group-hover:text-white/70">
                  Ver detalle <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                {datos.map((c) => (
                  <div key={c.label}>
                    <p className="text-[10px] uppercase tracking-wide text-white/35">{c.label}</p>
                    <p className="flex items-center gap-1.5 text-sm font-extrabold tabular-nums text-white/90">
                      {c.valor}
                      {c.extra}
                    </p>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
