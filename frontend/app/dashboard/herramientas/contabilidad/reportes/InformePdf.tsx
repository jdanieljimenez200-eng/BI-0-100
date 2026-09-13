'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import type { ReporteCompleto } from './areas/tipos';
import { AREAS } from './areas/tipos';
import { AREA_INFO, DIAS_SEMANA, ESTADO_LABEL, FUENTE_LABEL, TIPO_PAGO_LABEL, useFormato } from './areas/ui';

interface Props {
  params: { producto_id: string; desde: string; hasta: string };
  ambitoNombre: string;
  onClose: () => void;
}

/**
 * Informe completo para imprimir o guardar como PDF.
 *
 * Mismo mecanismo que las cotizaciones: el documento se monta aquí en claro y se
 * copia a una ventana nueva con su propia hoja de estilos, así el tema oscuro del
 * panel no se cuela en el papel. Nada de gráficas SVG: tablas y barras en CSS,
 * que imprimen igual en cualquier navegador.
 */
export default function InformePdf({ params, ambitoNombre, onClose }: Props) {
  const docRef = useRef<HTMLDivElement>(null);
  const [datos, setDatos] = useState<ReporteCompleto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .get('/reportes/completo', { params })
      .then(({ data }) => vivo && setDatos(data as ReporteCompleto))
      .catch((e: { response?: { data?: { error?: string } } }) =>
        vivo && setError(e.response?.data?.error ?? 'No se pudo generar el informe'),
      );
    return () => {
      vivo = false;
    };
  }, [params]);

  const imprimir = () => {
    const html = docRef.current?.innerHTML;
    if (!html || !datos) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title></title><style>${ESTILOS}</style></head><body></body></html>`);
    win.document.close();
    win.document.title = `Reporte ${datos.periodo.desde} a ${datos.periodo.hasta}`;
    win.document.body.innerHTML = html;
    win.focus();
    win.addEventListener('load', () => win.print(), { once: true });
    setTimeout(() => {
      if (win.document.readyState === 'complete') win.print();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3">
          <p className="text-sm font-semibold text-gray-700">Vista previa del informe</p>
          <div className="flex items-center gap-2">
            <button
              onClick={imprimir}
              disabled={!datos}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Guardar como PDF
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-200" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto">
          {error && <p className="p-10 text-center text-sm text-rose-600">{error}</p>}
          {!datos && !error && (
            <p className="flex items-center justify-center gap-2 p-16 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Reuniendo todas las áreas…
            </p>
          )}
          {datos && (
            <>
              <style>{ESTILOS_PREVIA}</style>
              <div ref={docRef} className="informe-previa">
                <Documento d={datos} ambitoNombre={ambitoNombre} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Documento ────────────────────────────────────────────────────────────────

function Documento({ d, ambitoNombre }: { d: ReporteCompleto; ambitoNombre: string }) {
  const f = useFormato();
  const k = d.panorama.kpis;
  const contratadas = AREAS.filter((a) => d.panorama.areas[a]);
  const noContratadas = AREAS.filter((a) => !d.panorama.areas[a]);

  return (
    <div className="doc">
      <header className="portada">
        <div>
          <p className="eyebrow">Reporte del negocio</p>
          <h1>{ambitoNombre}</h1>
          <p className="muted">
            Del {f.fecha(d.periodo.desde)} al {f.fecha(d.periodo.hasta)}
          </p>
        </div>
        <div className="derecha">
          <p className="muted">Generado</p>
          <p>{new Date(d.generado_en).toLocaleString(f.locale)}</p>
          <p className="muted small">Áreas incluidas: {contratadas.map((a) => AREA_INFO[a].label).join(', ') || '—'}</p>
        </div>
      </header>

      <h2>Resumen</h2>
      <div className="kpis">
        {k.ventas && <K l="Facturado" v={f.money(k.ventas.importe)} s={deltaTxt(k.ventas.importe_pct)} />}
        {k.ventas && <K l="Tickets" v={f.num(k.ventas.num_ventas)} s={`Ticket prom. ${f.money(k.ventas.ticket_promedio)}`} />}
        {k.contabilidad && <K l="Utilidad neta" v={f.money(k.contabilidad.utilidad_neta)} s={`Margen ${f.pct(k.contabilidad.margen_neto_pct)}`} />}
        {k.inventario && <K l="Valor inventario" v={f.money(k.inventario.valor)} s={`${k.inventario.bajo_minimo} bajo mínimo`} />}
        {k.cotizaciones && <K l="Cotizaciones" v={f.num(k.cotizaciones.emitidas)} s={`Aceptación ${f.pct(k.cotizaciones.tasa_conversion_pct)}`} />}
        {k.clientes && <K l="Cartera" v={f.num(k.clientes.cartera)} s={`${k.clientes.nuevos} altas`} />}
        {k.citas && <K l="Citas" v={f.num(k.citas.total)} s={`Cancelación ${f.pct(k.citas.tasa_cancelacion_pct)}`} />}
        {k.personal && <K l="Personal activo" v={f.num(k.personal.activos)} s={`Nómina ${f.pct(k.personal.sobre_ventas_pct)} de ventas`} />}
      </div>

      {d.panorama.alertas.length > 0 && (
        <>
          <h3>Qué pide atención</h3>
          <ul className="alertas">
            {d.panorama.alertas.map((a) => (
              <li key={a.mensaje} className={a.nivel}>
                <strong>{AREA_INFO[a.area].label}:</strong> {a.mensaje}
              </li>
            ))}
          </ul>
        </>
      )}

      {noContratadas.length > 0 && (
        <p className="muted small">
          No incluidas (herramienta no contratada o sin permiso): {noContratadas.map((a) => AREA_INFO[a].label).join(', ')}.
        </p>
      )}

      {d.ventas && <VentasDoc d={d.ventas} />}
      {d.inventario && <InventarioDoc d={d.inventario} />}
      {d.cotizaciones && <CotizacionesDoc d={d.cotizaciones} />}
      {d.clientes && <ClientesDoc d={d.clientes} />}
      {d.citas && <CitasDoc d={d.citas} />}
      {d.personal && <PersonalDoc d={d.personal} />}
      {d.contabilidad && <ContabilidadDoc d={d.contabilidad} />}

      <footer>Cifras calculadas a partir de los registros de cada herramienta en el periodo indicado.</footer>
    </div>
  );
}

const deltaTxt = (v: number | null) => (v === null ? 'sin periodo previo' : `${v >= 0 ? '+' : ''}${v}% vs. periodo anterior`);

function K({ l, v, s }: { l: string; v: string; s?: string }) {
  return (
    <div className="kpi">
      <p className="kl">{l}</p>
      <p className="kv">{v}</p>
      {s && <p className="ks">{s}</p>}
    </div>
  );
}

function Area({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="area">
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

function T<R>({ titulo, filas, cols, vacio = 'Sin datos en el periodo.' }: { titulo?: string; filas: R[]; cols: [string, (r: R) => ReactNode, boolean?][]; vacio?: string }) {
  return (
    <div className="bloque">
      {titulo && <h3>{titulo}</h3>}
      {filas.length === 0 ? (
        <p className="muted small">{vacio}</p>
      ) : (
        <table>
          <thead>
            <tr>
              {cols.map(([t, , der]) => (
                <th key={t} className={der ? 'r' : ''}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => (
              <tr key={i}>
                {cols.map(([t, fn, der]) => (
                  <td key={t} className={der ? 'r' : ''}>
                    {fn(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function B({ titulo, items, vacio = 'Sin datos en el periodo.' }: { titulo: string; items: { e: string; v: number; t: string }[]; vacio?: string }) {
  const max = Math.max(0, ...items.map((i) => i.v));
  return (
    <div className="bloque">
      <h3>{titulo}</h3>
      {items.length === 0 || max <= 0 ? (
        <p className="muted small">{vacio}</p>
      ) : (
        items.map((i) => (
          <div key={i.e} className="barra">
            <div className="bt">
              <span>{i.e}</span>
              <span>{i.t}</span>
            </div>
            <div className="bf">
              <div style={{ width: `${(Math.max(0, i.v) / max) * 100}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function VentasDoc({ d }: { d: NonNullable<ReporteCompleto['ventas']> }) {
  const f = useFormato();
  const t = d.totales;
  return (
    <Area titulo="Ventas">
      <div className="kpis">
        <K l="Facturado" v={f.money(t.importe)} s={deltaTxt(d.comparativa.importe_pct)} />
        <K l="Tickets" v={f.num(t.num_ventas)} s={`${t.dias_con_venta} días con venta`} />
        <K l="Ticket promedio" v={f.money(t.ticket_promedio)} s={deltaTxt(d.comparativa.ticket_promedio_pct)} />
        <K l="Promedio diario" v={f.money(t.promedio_diario)} />
        <K l="Utilidad bruta" v={t.margen_pct === null ? 'Sin costos' : f.money(t.utilidad_bruta)} s={`Margen ${f.pct(t.margen_pct)} · cobertura ${f.pct(t.cobertura_pct)}`} />
        <K l="Costo de lo vendido" v={f.money(t.costo_ventas)} s={`Impuestos ${f.money(t.impuestos)}`} />
        <K l="Canceladas" v={f.num(t.canceladas)} s={f.money(t.importe_cancelado)} />
        <K l="Desde cotización" v={f.num(t.desde_cotizacion)} s={f.money(t.importe_desde_cotizacion)} />
      </div>
      <T
        titulo={`Evolución por ${d.serie.granularidad}`}
        filas={d.serie.puntos.filter((p) => p.num_ventas > 0)}
        cols={[
          ['Periodo', (p) => f.fecha(p.periodo)],
          ['Tickets', (p) => f.num(p.num_ventas), true],
          ['Importe', (p) => f.money(p.importe), true],
        ]}
      />
      <T
        titulo="Productos vendidos"
        filas={d.productos}
        cols={[
          ['Producto', (p) => p.nombre],
          ['Uds.', (p) => f.num(p.unidades, 2), true],
          ['Importe', (p) => f.money(p.importe), true],
          ['Costo', (p) => (p.costo === null ? 'sin receta' : f.money(p.costo)), true],
          ['Utilidad', (p) => (p.utilidad === null ? '—' : f.money(p.utilidad)), true],
          ['Margen', (p) => f.pct(p.margen_pct), true],
        ]}
      />
      <div className="dos">
        <B titulo="Por categoría" items={d.por_categoria.map((c) => ({ e: c.categoria, v: c.importe, t: `${f.money(c.importe)} · ${f.pct(c.participacion_pct)}` }))} />
        <B titulo="Métodos de pago" items={d.metodos_pago.map((m) => ({ e: m.metodo_pago, v: m.importe, t: `${f.money(m.importe)} · ${m.num_ventas}` }))} />
      </div>
      <div className="dos">
        <T
          titulo="Por vendedor"
          filas={d.por_vendedor}
          cols={[
            ['Vendedor', (v) => v.vendedor],
            ['Tickets', (v) => f.num(v.num_ventas), true],
            ['Importe', (v) => f.money(v.importe), true],
            ['%', (v) => f.pct(v.participacion_pct), true],
          ]}
        />
        <B titulo="Tamaño de ticket" items={d.rangos_ticket.map((r) => ({ e: `${f.simbolo}${r.rango}`, v: r.num_ventas, t: `${r.num_ventas} · ${f.money(r.importe)}` }))} />
      </div>
      <B
        titulo="Ventas por día de la semana"
        items={DIAS_SEMANA.map((dia, i) => {
          const celdas = d.horarios.celdas.filter((c) => c.dia_semana === i);
          const importe = celdas.reduce((s, c) => s + c.importe, 0);
          return { e: dia, v: importe, t: `${f.money(importe)} · ${celdas.reduce((s, c) => s + c.num_ventas, 0)} tickets` };
        })}
      />
    </Area>
  );
}

function InventarioDoc({ d }: { d: NonNullable<ReporteCompleto['inventario']> }) {
  const f = useFormato();
  return (
    <Area titulo="Inventario">
      <div className="kpis">
        <K l="Valor del inventario" v={f.money(d.valuacion.valor_total)} s={`${d.valuacion.insumos_activos} insumos`} />
        <K l="Compras" v={f.money(d.consumo.compras)} />
        <K l="Consumo por ventas" v={f.money(d.consumo.por_ventas)} s={`Manual ${f.money(d.consumo.salidas_manuales)}`} />
        <K l="Mermas" v={f.money(d.consumo.mermas)} s={`${f.pct(d.consumo.mermas_sobre_consumo_pct)} del consumo`} />
      </div>
      <T
        titulo="Movimiento por insumo"
        filas={d.por_insumo}
        cols={[
          ['Insumo', (i) => i.nombre],
          ['Entradas', (i) => `${f.num(i.entradas, 2)} ${i.unidad}`, true],
          ['Salidas', (i) => `${f.num(i.salidas, 2)} ${i.unidad}`, true],
          ['Mermas', (i) => `${f.num(i.mermas, 2)} ${i.unidad}`, true],
          ['Valor salidas', (i) => f.money(i.valor_salidas), true],
        ]}
      />
      <T
        titulo="Bajo mínimo"
        filas={d.bajo_minimo}
        vacio="Ninguno."
        cols={[
          ['Insumo', (i) => i.nombre],
          ['Stock', (i) => `${f.num(i.stock_actual, 2)} ${i.unidad}`, true],
          ['Mínimo', (i) => `${f.num(i.stock_minimo, 2)} ${i.unidad}`, true],
        ]}
      />
      <T
        titulo="Días de cobertura"
        filas={d.cobertura}
        vacio="Sin consumo en el periodo."
        cols={[
          ['Insumo', (i) => i.nombre],
          ['Consumo/día', (i) => `${f.num(i.consumo_diario, 2)} ${i.unidad}`, true],
          ['Stock', (i) => f.num(i.stock_actual, 2), true],
          ['Días', (i) => (i.dias_cobertura === null ? '—' : f.num(i.dias_cobertura)), true],
        ]}
      />
      <div className="dos">
        <B titulo="Valor por categoría" items={d.valuacion.por_categoria.map((c) => ({ e: c.categoria, v: c.valor, t: f.money(c.valor) }))} />
        <B titulo="Mermas por motivo" items={d.mermas_por_motivo.map((m) => ({ e: m.motivo, v: m.valor, t: `${f.money(m.valor)} · ${m.veces}` }))} />
      </div>
      <T
        titulo="Compras por proveedor"
        filas={d.por_proveedor}
        cols={[
          ['Proveedor', (p) => p.proveedor],
          ['Compras', (p) => f.num(p.compras), true],
          ['Insumos', (p) => f.num(p.insumos), true],
          ['Valor', (p) => f.money(p.valor), true],
        ]}
      />
      <T
        titulo="Capital parado (sin movimiento en el periodo)"
        filas={d.sin_movimiento}
        vacio="Ninguno."
        cols={[
          ['Insumo', (i) => i.nombre],
          ['Stock', (i) => `${f.num(i.stock_actual, 2)} ${i.unidad}`, true],
          ['Valor', (i) => f.money(i.valor), true],
          ['Último mov.', (i) => f.fecha(i.ultimo_movimiento), true],
        ]}
      />
    </Area>
  );
}

function CotizacionesDoc({ d }: { d: NonNullable<ReporteCompleto['cotizaciones']> }) {
  const f = useFormato();
  return (
    <Area titulo="Cotizaciones">
      <div className="kpis">
        <K l="Emitidas" v={f.num(d.emitidas)} s={f.money(d.importe_emitido)} />
        <K l="Aceptadas" v={f.num(d.aceptadas)} s={f.money(d.importe_aceptado)} />
        <K l="Aceptación" v={f.pct(d.tasa_conversion_pct)} s={`${d.rechazadas} rechazadas · ${d.abiertas} abiertas`} />
        <K l="Ticket promedio" v={f.money(d.ticket_promedio)} />
        <K l="Cobradas en POS" v={f.num(d.conversion_a_venta.convertidas)} s={f.money(d.conversion_a_venta.importe_vendido)} />
        <K l="Días hasta cobrar" v={d.conversion_a_venta.dias_promedio === null ? '—' : f.num(d.conversion_a_venta.dias_promedio, 1)} />
        <K l="Descuentos" v={f.money(d.descuentos.total)} s={`Medio ${f.pct(d.descuentos.descuento_medio_pct)}`} />
        <K l="Vencidas hoy" v={f.num(d.vencidas.cantidad)} s={f.money(d.vencidas.importe)} />
      </div>
      <div className="dos">
        <B titulo="Por estado" items={d.por_estado.map((e) => ({ e: ESTADO_LABEL[e.estado] ?? e.estado, v: e.importe, t: `${e.cantidad} · ${f.money(e.importe)}` }))} />
        <T
          titulo="Por mes"
          filas={d.por_mes}
          cols={[
            ['Mes', (m) => m.mes],
            ['Emitidas', (m) => f.num(m.emitidas), true],
            ['Aceptadas', (m) => f.num(m.aceptadas), true],
            ['Importe', (m) => f.money(m.importe), true],
          ]}
        />
      </div>
      <T
        titulo="Por cliente"
        filas={d.por_cliente}
        cols={[
          ['Cliente', (c) => c.cliente],
          ['Cotizaciones', (c) => f.num(c.cotizaciones), true],
          ['Aceptadas', (c) => f.num(c.aceptadas), true],
          ['Conversión', (c) => f.pct(c.conversion_pct), true],
          ['Importe', (c) => f.money(c.importe), true],
        ]}
      />
      <T
        titulo="Vencidas sin respuesta"
        filas={d.vencidas.lista}
        vacio="Ninguna."
        cols={[
          ['Folio', (c) => c.numero],
          ['Cliente', (c) => c.cliente ?? '—'],
          ['Venció', (c) => f.fecha(c.fecha_vencimiento), true],
          ['Días', (c) => f.num(c.dias_vencida), true],
          ['Total', (c) => f.money(c.total), true],
        ]}
      />
    </Area>
  );
}

function ClientesDoc({ d }: { d: NonNullable<ReporteCompleto['clientes']> }) {
  const f = useFormato();
  const s = d.seguimiento;
  return (
    <Area titulo="Clientes">
      <div className="kpis">
        <K l="Cartera" v={f.num(d.cartera.total)} s={`${d.cartera.clientes} clientes · ${d.cartera.leads} leads`} />
        <K l="Altas del periodo" v={f.num(d.cartera.nuevos_periodo)} />
        <K l="Compradores nuevos" v={f.num(d.segmentos.nuevos)} s={`${d.segmentos.recurrentes} recurrentes`} />
        <K l="Lead → cliente" v={f.pct(d.cartera.conversion_lead_cliente_pct)} />
        <K l="Ventas sin cliente" v={f.num(d.cobertura.ventas_sin_cliente)} s={f.money(d.cobertura.importe_sin_cliente)} />
      </div>
      <T
        titulo="Mejores clientes"
        filas={d.top}
        cols={[
          ['Cliente', (x) => x.nombre],
          ['Compras', (x) => f.num(x.compras), true],
          ['Ticket prom.', (x) => f.money(x.ticket_promedio), true],
          ['Importe', (x) => f.money(x.importe), true],
          ['Última', (x) => f.fecha(x.ultima_compra), true],
        ]}
      />
      <div className="dos">
        <B
          titulo="Último contacto (a hoy)"
          items={[
            { e: '≤ 30 días', v: s.hasta_30_dias, t: String(s.hasta_30_dias) },
            { e: '31 – 60 días', v: s.de_31_a_60_dias, t: String(s.de_31_a_60_dias) },
            { e: '61 – 90 días', v: s.de_61_a_90_dias, t: String(s.de_61_a_90_dias) },
            { e: '> 90 días', v: s.mas_de_90_dias, t: String(s.mas_de_90_dias) },
            { e: 'Sin registro', v: s.sin_contacto_registrado, t: String(s.sin_contacto_registrado) },
          ]}
        />
        <B titulo="Por categoría" items={d.por_categoria.map((c) => ({ e: c.categoria, v: c.cantidad, t: String(c.cantidad) }))} />
      </div>
      <T
        titulo="Clientes dormidos (más de 60 días sin comprar)"
        filas={d.dormidos}
        vacio="Ninguno."
        cols={[
          ['Cliente', (x) => x.nombre],
          ['Teléfono', (x) => x.telefono ?? '—'],
          ['Histórico', (x) => f.money(x.importe_historico), true],
          ['Días', (x) => f.num(x.dias_sin_comprar), true],
        ]}
      />
      <T
        titulo="Cotizados sin compra"
        filas={d.cotizados_sin_compra}
        vacio="Ninguno."
        cols={[
          ['Cliente', (x) => x.nombre],
          ['Cotizaciones', (x) => f.num(x.cotizaciones), true],
          ['Cotizado', (x) => f.money(x.importe_cotizado), true],
        ]}
      />
    </Area>
  );
}

function CitasDoc({ d }: { d: NonNullable<ReporteCompleto['citas']> }) {
  const f = useFormato();
  const t = d.totales;
  return (
    <Area titulo="Citas">
      <div className="kpis">
        <K l="Citas" v={f.num(t.total)} s={`${f.num(t.promedio_diario, 1)} por día`} />
        <K l="Completadas" v={f.num(t.completadas)} s={f.pct(t.tasa_completadas_pct)} />
        <K l="Canceladas" v={f.num(t.canceladas)} s={f.pct(t.tasa_cancelacion_pct)} />
        <K l="Duración media" v={t.duracion_promedio_min === null ? '—' : `${t.duracion_promedio_min} min`} />
        <K l="Pendientes" v={f.num(t.pendientes)} s={`${t.confirmadas} confirmadas`} />
        <K l="Clientes distintos" v={f.num(t.clientes_distintos)} />
        <K l="Con venta ese día" v={f.num(d.conversion_a_venta.completadas_con_venta)} s={f.money(d.conversion_a_venta.importe)} />
      </div>
      <div className="dos">
        <B titulo="Por día de la semana" items={d.por_dia_semana.map((x) => ({ e: DIAS_SEMANA[x.dia_semana], v: x.citas, t: `${x.citas} · ${x.canceladas} canc.` }))} />
        <B titulo="Por hora de inicio" items={d.por_hora.map((x) => ({ e: `${String(x.hora).padStart(2, '0')}:00`, v: x.citas, t: String(x.citas) }))} />
      </div>
      <T
        titulo="Por cliente"
        filas={d.por_cliente}
        cols={[
          ['Cliente', (x) => x.cliente],
          ['Citas', (x) => f.num(x.citas), true],
          ['Completadas', (x) => f.num(x.completadas), true],
          ['Canceladas', (x) => f.num(x.canceladas), true],
        ]}
      />
      <T
        titulo="Próximos 7 días"
        filas={d.proximas}
        vacio="Nada agendado."
        cols={[
          ['Fecha', (x) => `${f.fecha(x.fecha)} ${x.hora}`],
          ['Cita', (x) => x.titulo],
          ['Cliente', (x) => x.cliente ?? '—'],
          ['Estado', (x) => ESTADO_LABEL[x.estado] ?? x.estado, true],
        ]}
      />
    </Area>
  );
}

function PersonalDoc({ d }: { d: NonNullable<ReporteCompleto['personal']> }) {
  const f = useFormato();
  const p = d.plantilla;
  return (
    <Area titulo="Personal y nómina">
      <div className="kpis">
        <K l="Activos" v={f.num(p.activos)} s={`${p.inactivos} inactivos · ${p.altas_periodo} altas`} />
        <K l="Masa salarial mensual" v={p.masa_salarial_mensual.map((m) => f.moneda(m.importe, m.moneda)).join(' + ') || '—'} />
        <K l="Pagado en el periodo" v={d.pagado.por_moneda.map((m) => f.moneda(m.total, m.moneda)).join(' + ') || '—'} />
        <K l="Nómina sobre ventas" v={f.pct(d.pagado.sobre_ventas_pct)} />
      </div>
      <div className="dos">
        <T
          titulo="Por cargo"
          filas={d.por_cargo}
          cols={[
            ['Cargo', (x) => x.cargo],
            ['Personas', (x) => f.num(x.personas), true],
            ['Masa mensual', (x) => f.moneda(x.masa_mensual, x.moneda), true],
          ]}
        />
        <T
          titulo="Por mes"
          filas={d.por_mes}
          cols={[
            ['Mes', (x) => x.mes],
            ['Pagos', (x) => f.num(x.pagos), true],
            ['Total', (x) => f.moneda(x.total, x.moneda), true],
          ]}
        />
      </div>
      <T
        titulo="Pagado por persona"
        filas={d.por_empleado}
        cols={[
          ['Persona', (x) => x.empleado],
          ['Cargo', (x) => x.cargo ?? '—'],
          ['Pagos', (x) => f.num(x.pagos), true],
          ['Total', (x) => f.moneda(x.total, x.moneda), true],
          ['Último pago', (x) => f.fecha(x.ultimo_pago), true],
        ]}
      />
      <T
        titulo="Activos sin pago en el periodo"
        filas={d.sin_pago_en_periodo}
        vacio="Ninguno."
        cols={[
          ['Persona', (x) => x.nombre],
          ['Ciclo', (x) => TIPO_PAGO_LABEL[x.tipo_pago] ?? x.tipo_pago],
          ['Sueldo', (x) => f.moneda(x.salario, x.moneda), true],
          ['Último pago', (x) => f.fecha(x.ultimo_pago), true],
        ]}
      />
    </Area>
  );
}

function ContabilidadDoc({ d }: { d: NonNullable<ReporteCompleto['contabilidad']> }) {
  const f = useFormato();
  return (
    <Area titulo="Contabilidad">
      <div className="kpis">
        <K l="Ingresos" v={f.money(d.flujo.ingresos)} s={deltaTxt(d.comparativa.ingresos_pct)} />
        <K l="Egresos" v={f.money(d.flujo.egresos)} s={deltaTxt(d.comparativa.egresos_pct)} />
        <K l="Utilidad neta" v={f.money(d.flujo.utilidad_neta)} s={`Antes ${f.money(d.comparativa.utilidad_anterior)}`} />
        <K l="Margen neto" v={f.pct(d.flujo.margen_neto_pct)} />
        <K l="Egresos con CFDI" v={f.money(d.fiscal.egresos_con_cfdi)} s={`Deducible ${f.pct(d.fiscal.egresos_deducibles_pct)}`} />
        <K l="Egresos sin CFDI" v={f.money(d.fiscal.egresos_sin_cfdi)} s={`${d.fiscal.movimientos_sin_cfdi} movimientos`} />
        <K l="Ingresos facturados" v={f.money(d.fiscal.ingresos_con_cfdi)} />
        <K l="Movimientos" v={f.num(d.origen.automaticos + d.origen.manuales)} s={`${d.origen.automaticos} automáticos`} />
      </div>
      <T
        titulo={`Flujo por ${d.serie.granularidad}`}
        filas={d.serie.puntos.filter((p) => p.ingresos || p.egresos)}
        cols={[
          ['Periodo', (p) => f.fecha(p.periodo)],
          ['Ingresos', (p) => f.money(p.ingresos), true],
          ['Egresos', (p) => f.money(p.egresos), true],
          ['Neto', (p) => f.money(p.neto), true],
          ['Acumulado', (p) => f.money(p.acumulado), true],
        ]}
      />
      <div className="dos">
        <B titulo="Ingresos por categoría" items={d.ingresos_por_categoria.map((c) => ({ e: c.categoria, v: c.total, t: `${f.money(c.total)} · ${f.pct(c.participacion_pct)}` }))} />
        <B titulo="Egresos por categoría" items={d.egresos_por_categoria.map((c) => ({ e: c.categoria, v: c.total, t: `${f.money(c.total)} · ${f.pct(c.participacion_pct)}` }))} />
      </div>
      <T
        titulo="Por origen"
        filas={d.por_fuente}
        cols={[
          ['Origen', (x) => FUENTE_LABEL[x.fuente] ?? x.fuente],
          ['Movimientos', (x) => f.num(x.movimientos), true],
          ['Ingresos', (x) => f.money(x.ingresos), true],
          ['Egresos', (x) => f.money(x.egresos), true],
        ]}
      />
      <T
        titulo="Egresos más grandes"
        filas={d.top_egresos}
        cols={[
          ['Fecha', (x) => f.fecha(x.fecha)],
          ['Descripción', (x) => x.descripcion],
          ['Categoría', (x) => x.categoria],
          ['CFDI', (x) => (x.tiene_cfdi ? 'Sí' : 'No')],
          ['Monto', (x) => f.money(x.monto), true],
        ]}
      />
    </Area>
  );
}

// ─── Estilos del papel ────────────────────────────────────────────────────────

const BASE = `
  .doc { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1e293b; }
  .doc h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin: 2px 0; }
  .doc h2 { font-size: 15px; font-weight: 800; color: #047857; margin: 22px 0 10px; padding-bottom: 4px; border-bottom: 2px solid #d1fae5; }
  .doc h3 { font-size: 11px; font-weight: 700; color: #334155; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: .4px; }
  .doc p { margin: 0; }
  .doc .portada { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 14px; border-bottom: 3px solid #059669; }
  .doc .derecha { text-align: right; }
  .doc .eyebrow { font-size: 10px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 1px; }
  .doc .muted { color: #64748b; }
  .doc .small { font-size: 10px; margin-top: 6px; }
  .doc .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .doc .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 9px; break-inside: avoid; }
  .doc .kl { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .4px; }
  .doc .kv { font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px; }
  .doc .ks { font-size: 9px; color: #94a3b8; margin-top: 1px; }
  .doc .alertas { margin: 0; padding-left: 16px; }
  .doc .alertas li { margin: 2px 0; }
  .doc .alertas li.alta { color: #be123c; }
  .doc .area { break-before: page; page-break-before: always; }
  .doc .bloque { break-inside: avoid; margin-top: 4px; }
  .doc .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .doc table { width: 100%; border-collapse: collapse; }
  .doc th { font-size: 9px; text-transform: uppercase; color: #64748b; text-align: left; padding: 4px 6px; border-bottom: 1px solid #cbd5e1; }
  .doc td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; }
  .doc tr { break-inside: avoid; }
  .doc .r { text-align: right; font-variant-numeric: tabular-nums; }
  .doc .barra { margin: 4px 0; }
  .doc .bt { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; }
  .doc .bf { height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-top: 2px; }
  .doc .bf div { height: 100%; background: #10b981; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; }
`;

const ESTILOS = `* { box-sizing: border-box; } body { margin: 0; padding: 32px; background: #fff; } @page { margin: 14mm; } @media print { body { padding: 0; } } ${BASE}`;

/** En la vista previa no se fuerzan saltos de página: se lee de corrido. */
const ESTILOS_PREVIA = `.informe-previa { padding: 32px; background: #fff; } ${BASE.replace(/\.doc/g, '.informe-previa .doc')} .informe-previa .doc .area { break-before: auto; page-break-before: auto; margin-top: 28px; }`;
