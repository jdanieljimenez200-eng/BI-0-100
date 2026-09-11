'use client';

import { useMemo } from 'react';

/* ── Tipos (espejo de backend/src/services/marketing/types.ts) ─────────────── */

export type FuenteReporteAds = 'google_ads' | 'meta' | 'tiktok' | 'linkedin' | 'generico';

export interface AlertaReporteAds {
  tipo: 'gasto_sin_conversion' | 'ctr_bajo' | 'cpa_alto' | 'concentracion_gasto' | 'anomalia';
  nivel: 'warning' | 'danger' | 'info';
  titulo: string;
  descripcion: string;
  campana?: string;
}

export interface CampanaAgregada {
  nombre: string;
  gasto: number;
  impresiones: number;
  clics: number;
  conversiones: number;
  ingresos?: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas?: number;
}

export interface TotalesReporteAds {
  gasto_total: number;
  impresiones_total: number;
  clics_total: number;
  conversiones_total: number;
  ingresos_total?: number;
  ctr_promedio: number;
  cpc_promedio: number;
  cpa_promedio: number;
  roas_promedio?: number;
}

export interface RecomendacionPriorizada {
  titulo: string;
  accion: string;
  impacto_estimado: 'ALTO' | 'MEDIO' | 'BAJO';
  canal_sugerido?: string;
}

export interface ReporteAdsProcesado {
  fuente: FuenteReporteAds;
  rango_fechas?: { inicio?: string; fin?: string };
  totales: TotalesReporteAds;
  campanas: CampanaAgregada[];
  alertas: AlertaReporteAds[];
  diagnostico_ia: {
    resumen_ejecutivo: string;
    puntos_fuertes: string[];
    fugas_presupuesto: string[];
    recomendaciones_priorizadas: RecomendacionPriorizada[];
  };
}

interface Props {
  reporte?: ReporteAdsProcesado | null;
  /** Ruta al formulario, para el estado vacío. */
  productoId: string;
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const FUENTE_LABEL: Record<FuenteReporteAds, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
  generico: 'Reporte genérico',
};

const NIVEL_ESTILO: Record<AlertaReporteAds['nivel'], string> = {
  danger: 'border-rose-500/30 bg-rose-500/[0.07] text-rose-200',
  warning: 'border-amber-500/30 bg-amber-500/[0.07] text-amber-100',
  info: 'border-sky-500/30 bg-sky-500/[0.07] text-sky-100',
};

const IMPACTO_ESTILO: Record<RecomendacionPriorizada['impacto_estimado'], string> = {
  ALTO: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  MEDIO: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  BAJO: 'bg-white/5 border-white/15 text-white/50',
};

const n = (v: unknown) => Number(v ?? 0);

const money = (v: number) =>
  `$${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(v)}`;

const entero = (v: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(v);

const dec = (v: number, d = 2) =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

/**
 * Examinador de Estadísticas Pasadas.
 *
 * Muestra el análisis del export de Google Ads / Meta / TikTok que el usuario
 * subió al lanzar el análisis. Todo lo que aparece aquí sale de SUS datos: si no
 * subió archivo, la sección lo dice y no inventa nada.
 */
export default function RendimientoPasadoSection({ reporte, productoId }: Props) {
  const campanasOrdenadas = useMemo(
    () => [...(reporte?.campanas ?? [])].sort((a, b) => n(b.gasto) - n(a.gasto)).slice(0, 10),
    [reporte],
  );

  /* ── Estado vacío: honesto y con salida ─────────────────────────────────── */
  if (!reporte || !reporte.totales) {
    return (
      <section className="reveal bg-[#0A0F17] rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-white tracking-tight">
            Rendimiento de tus campañas anteriores
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            Analiza el export de métricas que ya te dan Google Ads, Meta o TikTok.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-white/[0.12] p-8 text-center">
          <p className="text-sm font-medium text-white/80">
            Este análisis se generó sin datos de campañas
          </p>
          <p className="mt-1.5 mx-auto max-w-md text-xs leading-relaxed text-white/40">
            En tu próximo análisis puedes adjuntar el archivo CSV o Excel que descargas de tu
            plataforma de anuncios. La IA lo interpreta y te dice dónde se está yendo tu
            presupuesto y qué mover.
          </p>
          <a
            href={`/dashboard/marketing/${productoId}`}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-medium text-black transition-all hover:bg-white/90"
          >
            Nuevo análisis con mis métricas
            <span>→</span>
          </a>
        </div>
      </section>
    );
  }

  const { totales, alertas, diagnostico_ia: dx, fuente, rango_fechas } = reporte;
  const hayIngresos = n(totales.ingresos_total) > 0;

  const kpis = [
    { label: 'Inversión', valor: money(n(totales.gasto_total)), tono: 'text-white' },
    { label: 'Clics', valor: entero(n(totales.clics_total)), tono: 'text-sky-300' },
    { label: 'Conversiones', valor: entero(n(totales.conversiones_total)), tono: 'text-emerald-300' },
    { label: 'CTR', valor: `${dec(n(totales.ctr_promedio))}%`, tono: 'text-white/80' },
    { label: 'CPA', valor: money(n(totales.cpa_promedio)), tono: 'text-amber-300' },
    ...(hayIngresos
      ? [{ label: 'ROAS', valor: `${dec(n(totales.roas_promedio))}x`, tono: 'text-violet-300' }]
      : []),
  ];

  return (
    <section className="reveal bg-[#0A0F17] rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">
            Rendimiento de tus campañas anteriores
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            Diagnóstico sobre los datos reales que exportaste de tu plataforma de anuncios.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/60">
            {FUENTE_LABEL[fuente] ?? fuente}
          </span>
          {(rango_fechas?.inicio || rango_fechas?.fin) && (
            <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-white/50">
              {rango_fechas?.inicio ?? '—'} → {rango_fechas?.fin ?? '—'}
            </span>
          )}
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">{k.label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums leading-tight ${k.tono}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      {/* ── Resumen ejecutivo ────────────────────────────────────────────── */}
      {dx?.resumen_ejecutivo && (
        <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-white/40">
            Diagnóstico
          </p>
          <p className="text-sm leading-relaxed text-white/85">{dx.resumen_ejecutivo}</p>
        </div>
      )}

      {/* ── Alertas ──────────────────────────────────────────────────────── */}
      {alertas?.length > 0 && (
        <div className="mb-6 space-y-2">
          {alertas.map((a, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3.5 ${NIVEL_ESTILO[a.nivel] ?? NIVEL_ESTILO.info}`}
            >
              <p className="text-xs font-semibold">{a.titulo}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed opacity-80">{a.descripcion}</p>
              {a.campana && (
                <p className="mt-1 font-mono text-[10px] opacity-60">Campaña: {a.campana}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Fuerzas y fugas ──────────────────────────────────────────────── */}
      {(dx?.puntos_fuertes?.length > 0 || dx?.fugas_presupuesto?.length > 0) && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {dx.puntos_fuertes?.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-emerald-300/80">
                Lo que sí está funcionando
              </p>
              <ul className="space-y-1.5">
                {dx.puntos_fuertes.map((p, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-white/80">
                    <span className="mt-[3px] text-emerald-400">▸</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dx.fugas_presupuesto?.length > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
              <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-rose-300/80">
                Por dónde se va el presupuesto
              </p>
              <ul className="space-y-1.5">
                {dx.fugas_presupuesto.map((p, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-white/80">
                    <span className="mt-[3px] text-rose-400">▸</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Recomendaciones ──────────────────────────────────────────────── */}
      {dx?.recomendaciones_priorizadas?.length > 0 && (
        <div className="mb-6">
          <p className="mb-2.5 text-[10px] font-mono uppercase tracking-wider text-white/40">
            Qué hacer con esto
          </p>
          <div className="space-y-2.5">
            {dx.recomendaciones_priorizadas.map((r, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-white/20"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      IMPACTO_ESTILO[r.impacto_estimado] ?? IMPACTO_ESTILO.BAJO
                    }`}
                  >
                    Impacto {r.impacto_estimado}
                  </span>
                  {r.canal_sugerido && (
                    <span className="text-[10px] font-mono text-white/40">{r.canal_sugerido}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-white/90">{r.titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/55">{r.accion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Campañas ─────────────────────────────────────────────────────── */}
      {campanasOrdenadas.length > 0 && (
        <div>
          <p className="mb-2.5 text-[10px] font-mono uppercase tracking-wider text-white/40">
            Campañas por inversión
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2.5 font-medium">Campaña</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gasto</th>
                  <th className="px-3 py-2.5 text-right font-medium">Clics</th>
                  <th className="px-3 py-2.5 text-right font-medium">Conv.</th>
                  <th className="px-3 py-2.5 text-right font-medium">CPA</th>
                  {hayIngresos && <th className="px-3 py-2.5 text-right font-medium">ROAS</th>}
                </tr>
              </thead>
              <tbody>
                {campanasOrdenadas.map((c, i) => {
                  // Gasto sin una sola conversión: es la fuga más cara y la que
                  // hay que ver de un vistazo.
                  const fuga = n(c.conversiones) === 0 && n(c.gasto) > 0;
                  return (
                    <tr key={i} className="border-b border-white/[0.04] last:border-0">
                      <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-white/85">
                        {c.nombre}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white/70">
                        {money(n(c.gasto))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white/60">
                        {entero(n(c.clics))}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums ${
                          fuga ? 'font-semibold text-rose-300' : 'text-emerald-300'
                        }`}
                      >
                        {entero(n(c.conversiones))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white/60">
                        {fuga ? '—' : money(n(c.cpa))}
                      </td>
                      {hayIngresos && (
                        <td className="px-3 py-2.5 text-right tabular-nums text-violet-300">
                          {c.roas ? `${dec(n(c.roas))}x` : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
