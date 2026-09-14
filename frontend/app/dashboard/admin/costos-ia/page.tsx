'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { leerCostosIA, type CostosIA } from '@/lib/admin';

const USD = (v: number, decimales = 2) =>
  `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v ?? 0)}`;
const NUM = (v: number) => new Intl.NumberFormat('es-MX').format(v ?? 0);
const PERIODOS = [7, 30, 90];

/**
 * Gasto de IA de la plataforma.
 *
 * Cada llamada a Claude queda registrada con su costo real (tabla `uso_ia`).
 * Aquí se ve qué módulo, qué modelo y qué cuentas gastan, y el margen estimado
 * de cada plan contra su precio.
 */
export default function CostosIAPage() {
  const router = useRouter();
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<CostosIA | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await leerCostosIA(dias));
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        router.push('/dashboard/admin');
        return;
      }
      setError('No se pudieron cargar los costos.');
    }
  }, [dias, router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const maxDia = Math.max(0, ...(datos?.por_dia ?? []).map((d) => d.costo));

  return (
    <div className="p-6 sm:p-8 max-w-[1100px] mx-auto">
      <Link href="/dashboard/admin" className="text-white/40 hover:text-white text-xs font-semibold">
        ← Centro de Control
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3 mt-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Costos de IA</h1>
          <p className="text-white/40 text-sm max-w-2xl">
            Costo real de cada llamada a los modelos. El ingreso por plan es una estimación con el precio de
            lista, no sustituye a Stripe.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {PERIODOS.map((p) => (
            <button
              key={p}
              onClick={() => setDias(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${dias === p ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}
            >
              {p} días
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-rose-300 text-sm mb-4">{error}</p>}
      {!datos && !error && <p className="text-white/40 text-sm">Cargando…</p>}

      {datos && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { l: 'Hoy', v: USD(datos.totales.hoy) },
              { l: 'Este mes', v: USD(datos.totales.mes) },
              { l: `Últimos ${datos.dias} días`, v: USD(datos.totales.periodo) },
              { l: 'Llamadas', v: NUM(datos.totales.llamadas) },
              { l: 'Cuentas con uso', v: NUM(datos.totales.cuentas) },
            ].map((k) => (
              <div key={k.l} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/40">{k.l}</p>
                <p className="text-xl font-extrabold tabular-nums mt-1">{k.v}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold mb-3">Gasto por día</h2>
            {datos.por_dia.length === 0 ? (
              <p className="text-white/40 text-xs">Sin llamadas en el periodo.</p>
            ) : (
              <div className="flex items-end gap-1 h-32" role="img" aria-label="Gasto diario de IA">
                {datos.por_dia.map((d) => (
                  <div
                    key={d.dia}
                    title={`${d.dia}: ${USD(d.costo, 4)} · ${d.llamadas} llamadas`}
                    className="flex-1 min-w-[4px] rounded-t bg-emerald-400/60"
                    style={{ height: `${maxDia > 0 ? Math.max(2, (d.costo / maxDia) * 100) : 0}%` }}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold mb-3">Por plan</h2>
            <Tabla
              columnas={['Plan', 'Cuentas', 'Costo IA', 'Costo por cuenta', 'Ingreso estimado', 'Margen']}
              filas={datos.por_plan.map((p) => [
                p.plan,
                NUM(p.cuentas),
                USD(p.costo, 4),
                USD(p.costo_por_cuenta, 4),
                p.ingreso_estimado > 0 ? USD(p.ingreso_estimado) : '—',
                p.margen_pct === null ? '—' : `${p.margen_pct}%`,
              ])}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-bold mb-3">Por módulo</h2>
              <Tabla
                columnas={['Módulo', 'Análisis', 'Llamadas', 'Costo']}
                filas={datos.por_modulo.map((m) => [m.modulo, NUM(m.analisis), NUM(m.llamadas), USD(m.costo, 4)])}
              />
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-bold mb-3">Por modelo</h2>
              <Tabla
                columnas={['Modelo', 'Tokens entrada', 'Tokens salida', 'De caché', 'Costo']}
                filas={datos.por_modelo.map((m) => [
                  m.modelo,
                  NUM(Number(m.input_tokens)),
                  NUM(Number(m.output_tokens)),
                  NUM(Number(m.cache_read_tokens)),
                  USD(m.costo, 4),
                ])}
              />
            </section>
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold mb-3">Por llamada</h2>
            <Tabla
              columnas={['Sección', 'Modelo', 'Llamadas', 'Entrada media', 'Salida media', 'Costo medio', 'Costo total']}
              filas={datos.por_seccion.map((s) => [
                s.seccion,
                s.modelo,
                NUM(s.llamadas),
                NUM(s.input_medio),
                NUM(s.output_medio),
                USD(s.costo_medio, 4),
                USD(s.costo, 4),
              ])}
            />
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold mb-1">Cuentas con más gasto</h2>
            <p className="text-white/40 text-xs mb-3">Un gasto muy por encima del resto puede ser abuso o una cuenta comprometida.</p>
            <Tabla
              columnas={['Cuenta', 'Plan', 'Llamadas', 'Costo']}
              filas={datos.top_cuentas.map((c) => [c.email ?? c.usuario_id, c.plan ?? '—', NUM(c.llamadas), USD(c.costo, 4)])}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function Tabla({ columnas, filas }: { columnas: string[]; filas: (string | number)[][] }) {
  if (filas.length === 0) return <p className="text-white/40 text-xs">Sin datos en el periodo.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wide text-white/40">
            {columnas.map((c, i) => (
              <th key={c} className={`pb-2 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-white/[0.04]">
              {f.map((v, j) => (
                <td key={j} className={`py-2 pr-3 ${j > 0 ? 'text-right tabular-nums text-white/70' : 'text-white/85'}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
