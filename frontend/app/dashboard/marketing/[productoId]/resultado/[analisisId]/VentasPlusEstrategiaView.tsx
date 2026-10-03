'use client';

import React, { useState } from 'react';
import { Flame, BarChart3, ShieldCheck, Package, MessageSquare, Search, Target, ShieldAlert, RefreshCw, Check } from 'lucide-react';

/**
 * Espejo de backend/src/services/marketing/types.ts.
 *
 * Esta vista pedía otros nombres (`roas_proyectado`, `clics_proyectados`,
 * `paso_1_filtro`, `dia_1_caso_exito`) que el backend NUNCA ha emitido: todo el
 * tablero de unit economics salía en 0 y el guion de WhatsApp, vacío. Si
 * cambias un campo en el backend, cámbialo aquí.
 */
export interface UnitEconomicsVentasPlus {
  presupuesto_simulado: number;
  clics_estimados: number;
  cpc_promedio: number;
  leads_o_conversaciones: number;
  tasa_conversion_prospecto: number;
  ventas_cerradas: number;
  tasa_cierre: number;
  ingreso_proyectado: number;
  roas_estimado: number;
  /** false = con estos supuestos la campaña pierde dinero. */
  rentable?: boolean;
  /** De dónde salen CPC y tasas. */
  origen_supuestos?: 'tus_datos' | 'benchmark';
  cac_maximo_tolerable: number;
  ticket_promedio_con_bump: number;
  punto_equilibrio_unidades: number;
}

export interface ScriptWhatsAppVentasPlus {
  paso1_filtro: { objetivo: string; pregunta: string };
  paso2_diagnostico: { objetivo: string; mensaje: string };
  paso3_presentacion: { objetivo: string; audio_o_texto: string };
  paso4_cierre_objeciones: {
    objecion_precio: string;
    objecion_pensarlo: string;
    objecion_consultarlo: string;
  };
}

export interface SecuenciaSeguimientoVentasPlus {
  dia1_caso_exito: string;
  dia3_beneficio_clave: string;
  dia5_despedida_urgencia: string;
}

/** Igual que `kpis_reales` de EstrategiaMarketing en el backend (marketing/types.ts): se mueven juntos. */
export interface KpisRealesVentasPlus {
  metrica_norte: string;
  benchmark_industria: string;
  frecuencia_revision: string;
}

export interface VentasPlusProps {
  unit_economics?: UnitEconomicsVentasPlus;
  script_cierre?: ScriptWhatsAppVentasPlus;
  secuencia_seguimiento?: SecuenciaSeguimientoVentasPlus;
  garantia_irresistible?: string;
  order_bump_sugerido?: string;
  kpis_reales?: KpisRealesVentasPlus;
  /** Pasos en orden, como texto («1. …»): así los manda el backend. */
  plan_accion_paso_a_paso?: string[];
  /** Moneda del país del producto: la simulación usa el CPC de referencia de ese país. */
  moneda?: string;
}

export default function VentasPlusEstrategiaView({
  unit_economics,
  script_cierre,
  secuencia_seguimiento,
  garantia_irresistible,
  order_bump_sugerido,
  kpis_reales,
  plan_accion_paso_a_paso,
  moneda = 'MXN',
}: VentasPlusProps) {
  const dinero = (v: number) => `${v.toLocaleString('es-MX', { maximumFractionDigits: v < 100 ? 2 : 0 })} ${moneda}`;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeObjectionTab, setActiveObjectionTab] = useState<'precio' | 'pensarlo' | 'competencia'>('precio');

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    });
  };

  const hasAnyData =
    unit_economics ||
    script_cierre ||
    secuencia_seguimiento ||
    garantia_irresistible ||
    order_bump_sugerido ||
    Boolean(kpis_reales?.metrica_norte) ||
    (plan_accion_paso_a_paso && plan_accion_paso_a_paso.length > 0);

  if (!hasAnyData) return null;

  return (
    <div className="mt-8 space-y-6 pt-6 border-t border-amber-500/20">
      {/* Cabecera distintiva de Ventas + */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border border-amber-400/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-lg shadow-lg shadow-amber-500/20 flex-shrink-0">
            <Flame className="w-5 h-5 text-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-white tracking-tight">
                Arsenal de Conversión Ventas +
              </h4>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                Listo para ejecutar
              </span>
            </div>
            <p className="text-xs text-white/60">
              Unit Economics matemáticos, oferta irresistible y guiones de cierre listos para ejecutar.
            </p>
          </div>
        </div>
      </div>

      {/* ── 1. Tablero de Unit Economics Proyectados ── */}
      {unit_economics && (
        <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                <span>Modelo Financiero y Unit Economics</span>
              </p>
              <h5 className="text-sm font-semibold text-white mt-0.5">
                Embudo Matemático de Adquisición Proyectado
              </h5>
            </div>
            <span className="text-[11px] font-mono text-white/50 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              Presupuesto base: {unit_economics.presupuesto_simulado != null ? dinero(unit_economics.presupuesto_simulado) : '—'}
            </span>
          </div>

          {/* Grilla de métricas clave */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Tráfico / Clics</span>
              <div className="mt-2">
                <p className="text-base font-bold font-mono text-white">{(unit_economics.clics_estimados ?? 0).toLocaleString()}</p>
                <p className="text-[11px] font-mono text-white/40 mt-0.5">CPC est: {unit_economics.cpc_promedio != null ? dinero(unit_economics.cpc_promedio) : '—'}</p>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Leads Cualificados</span>
              <div className="mt-2">
                <p className="text-base font-bold font-mono text-sky-400">{(unit_economics.leads_o_conversaciones ?? 0).toLocaleString()}</p>
                {/* El CPL sale del presupuesto entre los leads: el backend no
                    lo manda aparte y antes salía siempre «—». */}
                <p className="text-[11px] font-mono text-white/40 mt-0.5">
                  CPL est: {unit_economics.leads_o_conversaciones > 0
                    ? dinero(Math.round(unit_economics.presupuesto_simulado / unit_economics.leads_o_conversaciones))
                    : '—'} ({unit_economics.tasa_conversion_prospecto ?? 0}%)
                </p>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Clientes / Ventas</span>
              <div className="mt-2">
                <p className="text-base font-bold font-mono text-emerald-400">{unit_economics.ventas_cerradas ?? "—"}</p>
                <p className="text-[11px] font-mono text-white/40 mt-0.5">Cierre: {unit_economics.tasa_cierre ?? 0}% en WhatsApp</p>
              </div>
            </div>

            {/* Un ROAS bajo 1 significa perder dinero, y hasta ahora no podía
                mostrarse: el backend lo forzaba a un mínimo de 1.2. */}
            <div className={`bg-gradient-to-br rounded-xl p-3.5 flex flex-col justify-between ${
              unit_economics.rentable === false
                ? 'from-red-500/10 to-rose-500/10 border border-red-400/40'
                : 'from-amber-500/10 to-orange-500/10 border border-amber-400/30'
            }`}>
              <span className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                unit_economics.rentable === false ? 'text-red-300' : 'text-amber-300'
              }`}>ROAS Simulado</span>
              <div className="mt-2">
                <p className={`text-xl font-bold font-mono ${
                  unit_economics.rentable === false ? 'text-red-300' : 'text-amber-300'
                }`}>{unit_economics.roas_estimado ?? 0}x</p>
                <p className="text-[11px] font-mono text-white/60 mt-0.5">Ingreso: {dinero(unit_economics.ingreso_proyectado ?? 0)}</p>
              </div>
            </div>
          </div>

          {unit_economics.rentable === false && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3">
              <p className="text-xs text-red-200 leading-relaxed">
                <span className="font-semibold">Con estos supuestos la campaña pierde dinero.</span>{' '}
                Por cada 1 {moneda} de pauta vuelven {unit_economics.roas_estimado} {moneda}. Sube el ticket, mejora el cierre
                o baja el presupuesto antes de invertir.
              </p>
            </div>
          )}

          <p className="text-[10px] text-white/35 leading-relaxed">
            {unit_economics.origen_supuestos === 'tus_datos'
              ? 'Simulación con el CPC real de tu reporte de anuncios.'
              : 'Simulación con supuestos de referencia de tu país (CPC, conversión y cierre). Sube tu reporte de anuncios para usar tus números reales.'}
          </p>

          {/* Parámetros de seguridad financiera */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                CAC Máximo Tolerable
              </span>
              <p className="text-xs font-semibold text-rose-300 font-mono">
                {dinero(unit_economics.cac_maximo_tolerable ?? 0)}
              </p>
              <p className="text-[10px] text-white/40 mt-1 leading-tight">
                Límite de costo por cliente antes de comprometer el margen neto.
              </p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                Punto de Equilibrio (Breakeven)
              </span>
              <p className="text-xs font-semibold text-white font-mono">
                {unit_economics.punto_equilibrio_unidades} unidades / clientes
              </p>
              <p className="text-[10px] text-white/40 mt-1 leading-tight">
                Ventas mínimas para amortizar al 100% la inversión de pauta.
              </p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                Ganancia Bruta Proyectada
              </span>
              {/* Ingreso menos la pauta simulada: el backend no manda una
                  «ganancia bruta» y este bloque reventaba con undefined. */}
              <p className={`text-xs font-semibold font-mono ${
                unit_economics.ingreso_proyectado - unit_economics.presupuesto_simulado >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {dinero(unit_economics.ingreso_proyectado - unit_economics.presupuesto_simulado)}
              </p>
              <p className="text-[10px] text-white/40 mt-1 leading-tight">
                Ingreso proyectado menos la inversión en pauta (sin descontar costo del producto).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Oferta Grand Slam (Garantía Irresistible + Order Bump) ── */}
      {(garantia_irresistible || order_bump_sugerido) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {garantia_irresistible && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-emerald-400">
                  Garantía Irresistible (Riesgo Cero)
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-normal">
                {garantia_irresistible}
              </p>
              <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between">
                <span className="text-[10px] font-mono text-emerald-400/70 uppercase">
                  Reduce fricción de compra
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(garantia_irresistible, 'garantia')}
                  className="text-[10px] font-mono text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 transition-colors"
                >
                  {copiedKey === 'garantia' ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Copiado</span> : 'Copiar Garantía'}
                </button>
              </div>
            </div>
          )}

          {order_bump_sugerido && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-950/10 p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                  Order Bump / Acelerador de Ticket
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-normal">
                {order_bump_sugerido}
              </p>
              <div className="pt-2 border-t border-amber-400/20 flex items-center justify-between">
                <span className="text-[10px] font-mono text-amber-400/70 uppercase">
                  Incrementa el AOV (Ticket Promedio)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(order_bump_sugerido, 'orderbump')}
                  className="text-[10px] font-mono text-amber-300 hover:text-amber-200 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-400/20 transition-colors"
                >
                  {copiedKey === 'orderbump' ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Copiado</span> : 'Copiar Oferta'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3. Guión de Conversión WhatsApp / DM (4 Pasos) ── */}
      {script_cierre && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Protocolo Quirúrgico de Cierre</span>
              </p>
              <h5 className="text-sm font-semibold text-white mt-0.5">
                Guiones para WhatsApp y Mensajes Directos (4 Pasos)
              </h5>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
              Cierre Conversacional
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Paso 1 */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
                    Paso 1: Filtro Rápido
                  </span>
                  <span className="text-xs">⏱️ &lt;5 min</span>
                </div>
                <p className="text-[11px] text-white/50 mb-2">{script_cierre.paso1_filtro.objetivo}</p>
                <div className="bg-black/40 p-3 rounded-lg border border-white/[0.06]">
                  <p className="text-xs text-emerald-200/90 leading-relaxed italic">
                    "{script_cierre.paso1_filtro.pregunta}"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(script_cierre.paso1_filtro.pregunta, 'script-p1')}
                className="w-full text-center text-xs font-medium py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] text-white/70 hover:text-white transition-all flex items-center justify-center gap-1.5"
              >
                {copiedKey === 'script-p1' ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Mensaje Copiado</> : 'Copiar Mensaje'}
              </button>
            </div>

            {/* Paso 2 */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider font-semibold">
                    Paso 2: Diagnóstico
                  </span>
                  <span className="text-xs flex items-center gap-1 text-sky-300">
                    <Search className="w-3 h-3 text-sky-400" />
                    Preguntas
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mb-2">{script_cierre.paso2_diagnostico.objetivo}</p>
                <div className="bg-black/40 p-3 rounded-lg border border-white/[0.06]">
                  <p className="text-xs text-sky-200/90 leading-relaxed italic">
                    &quot;{script_cierre.paso2_diagnostico.mensaje}&quot;
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(script_cierre.paso2_diagnostico.mensaje, 'script-p2')}
                className="w-full text-center text-xs font-medium py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] text-white/70 hover:text-white transition-all flex items-center justify-center gap-1.5"
              >
                {copiedKey === 'script-p2' ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Preguntas Copiadas</> : 'Copiar Preguntas'}
              </button>
            </div>

            {/* Paso 3 */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-semibold">
                    Paso 3: Presentación
                  </span>
                  <span className="text-xs flex items-center gap-1 text-amber-300">
                    <Target className="w-3 h-3 text-amber-400" />
                    Solución
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mb-2">{script_cierre.paso3_presentacion.objetivo}</p>
                <div className="bg-black/40 p-3 rounded-lg border border-white/[0.06]">
                  <p className="text-xs text-amber-200/90 leading-relaxed italic">
                    "{script_cierre.paso3_presentacion.audio_o_texto}"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(script_cierre.paso3_presentacion.audio_o_texto, 'script-p3')}
                className="w-full text-center text-xs font-medium py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] text-white/70 hover:text-white transition-all flex items-center justify-center gap-1.5"
              >
                {copiedKey === 'script-p3' ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Pitch Copiado</> : 'Copiar Pitch'}
              </button>
            </div>
          </div>

          {/* Paso 4: Objeciones con pestañas interactivas */}
          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-300 font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-300" />
                <span>Paso 4: Respuestas a Objeciones Clave</span>
              </span>
              <div className="flex gap-1.5">
                {(['precio', 'pensarlo', 'competencia'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveObjectionTab(tab)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-mono capitalize transition-all ${
                      activeObjectionTab === tab
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'text-white/40 hover:text-white bg-white/[0.02]'
                    }`}
                  >
                    {tab === 'pensarlo' ? '"Lo voy a pensar"' : tab === 'precio' ? '"Está muy caro"' : '"La competencia"'}
                  </button>
                ))}
              </div>
            </div>

            {activeObjectionTab === 'precio' && (
              <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[10px] font-mono text-white/40 uppercase block mb-1">Respuesta exacta a objeción de precio:</span>
                  <p className="text-xs text-white/90 leading-relaxed italic">
                    "{script_cierre.paso4_cierre_objeciones.objecion_precio}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(script_cierre.paso4_cierre_objeciones.objecion_precio, 'obj-precio')}
                  className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 transition-colors whitespace-nowrap"
                >
                  {copiedKey === 'obj-precio' ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Copiado</span> : 'Copiar Respuesta'}
                </button>
              </div>
            )}

            {activeObjectionTab === 'pensarlo' && (
              <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[10px] font-mono text-white/40 uppercase block mb-1">Respuesta a "Déjame pensarlo / consultarlo":</span>
                  <p className="text-xs text-white/90 leading-relaxed italic">
                    "{script_cierre.paso4_cierre_objeciones.objecion_pensarlo}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(script_cierre.paso4_cierre_objeciones.objecion_pensarlo, 'obj-pensarlo')}
                  className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 transition-colors whitespace-nowrap"
                >
                  {copiedKey === 'obj-pensarlo' ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Copiado</span> : 'Copiar Respuesta'}
                </button>
              </div>
            )}

            {activeObjectionTab === 'competencia' && (
              <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[10px] font-mono text-white/40 uppercase block mb-1">Respuesta a comparación con la competencia:</span>
                  <p className="text-xs text-white/90 leading-relaxed italic">
                    "{script_cierre.paso4_cierre_objeciones.objecion_consultarlo}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(script_cierre.paso4_cierre_objeciones.objecion_consultarlo, 'obj-competencia')}
                  className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 transition-colors whitespace-nowrap"
                >
                  {copiedKey === 'obj-competencia' ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Copiado</span> : 'Copiar Respuesta'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Secuencia de Seguimiento y Recuperación (5 Días) ── */}
      {secuencia_seguimiento && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Recuperación de Prospectos Indecisos</span>
              </p>
              <h5 className="text-sm font-semibold text-white mt-0.5">
                Protocolo de Seguimiento sin Presión (Día 1, 3 y 5)
              </h5>
            </div>
            <span className="text-[11px] font-mono text-white/40">
              Para quien no respondió al primer mensaje
            </span>
          </div>

          <div className="space-y-3">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded">
                    Día 1
                  </span>
                  <span className="text-xs font-semibold text-white">Caso de Éxito / Prueba Social</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed italic">
                  "{secuencia_seguimiento.dia1_caso_exito}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(secuencia_seguimiento.dia1_caso_exito, 'seg-d1')}
                className="text-xs font-mono text-white/70 hover:text-white bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedKey === 'seg-d1' ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Copiado</span> : 'Copiar Día 1'}
              </button>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-sky-400 font-bold uppercase bg-sky-500/10 px-2 py-0.5 rounded">
                    Día 3
                  </span>
                  <span className="text-xs font-semibold text-white">Micro-Victoria / Contenido de Alto Valor</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed italic">
                  "{secuencia_seguimiento.dia3_beneficio_clave}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(secuencia_seguimiento.dia3_beneficio_clave, 'seg-d3')}
                className="text-xs font-mono text-white/70 hover:text-white bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedKey === 'seg-d3' ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Copiado</span> : 'Copiar Día 3'}
              </button>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-rose-300 font-bold uppercase bg-rose-500/10 px-2 py-0.5 rounded">
                    Día 5
                  </span>
                  <span className="text-xs font-semibold text-white">Última Llamada / Cierre Amable</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed italic">
                  "{secuencia_seguimiento.dia5_despedida_urgencia}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(secuencia_seguimiento.dia5_despedida_urgencia, 'seg-d5')}
                className="text-xs font-mono text-white/70 hover:text-white bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedKey === 'seg-d5' ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Copiado</span> : 'Copiar Día 5'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Plan de Acción Paso a Paso ── */}
      {plan_accion_paso_a_paso && plan_accion_paso_a_paso.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                Cronograma de Ejecución
              </p>
              <h5 className="text-sm font-semibold text-white mt-0.5">
                Plan de Acción Paso a Paso
              </h5>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {plan_accion_paso_a_paso.map((texto, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                <span className="text-[11px] font-mono text-amber-300 font-bold block mb-2">Paso {i + 1}</span>
                {/* El backend ya numera cada paso («1. …»): se quita para no repetirlo. */}
                <p className="text-xs text-white/90 font-medium leading-snug">{texto.replace(/^\s*\d+[.)]\s*/, '')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. KPIs de Rendimiento Real ── */}
      {kpis_reales?.metrica_norte && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-5 sm:p-6 space-y-4">
          <div className="pb-3 border-b border-white/5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">
              Métricas de Control
            </p>
            <h5 className="text-sm font-semibold text-white mt-0.5">
              KPIs de Rendimiento Real para Monitorear Diariamente
            </h5>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {[
              { etiqueta: 'Métrica principal', valor: kpis_reales.metrica_norte, cls: 'text-white font-medium' },
              { etiqueta: 'Referencia del sector', valor: kpis_reales.benchmark_industria, cls: 'text-amber-300 font-mono' },
              { etiqueta: 'Cada cuánto revisarla', valor: kpis_reales.frecuencia_revision, cls: 'text-white/70' },
            ].map((k) => (
              <div key={k.etiqueta} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5">
                <dt className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-1">{k.etiqueta}</dt>
                <dd className={`leading-relaxed ${k.cls}`}>{k.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
