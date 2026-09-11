'use client';

import React, { useState } from 'react';

export interface UnitEconomicsVentasPlus {
  presupuesto_mensual: number;
  cpc_estimado: number;
  clics_proyectados: number;
  tasa_conversion_lead_pct: number;
  leads_proyectados: number;
  cpl_estimado: number;
  tasa_cierre_ventas_pct: number;
  ventas_proyectadas: number;
  ticket_promedio: number;
  ingresos_proyectados: number;
  ganancia_bruta_estimada: number;
  roas_proyectado: number;
  cac_maximo_tolerable: number;
  punto_equilibrio_unidades: number;
}

export interface ScriptWhatsAppVentasPlus {
  paso_1_filtro: { objetivo: string; mensaje_exacto: string };
  paso_2_diagnostico: { objetivo: string; preguntas_clave: string[] };
  paso_3_presentacion: { objetivo: string; pitch_solucion: string };
  paso_4_objeciones: {
    objecion_precio: string;
    objecion_pensarlo: string;
    objecion_competencia: string;
  };
}

export interface SecuenciaSeguimientoVentasPlus {
  dia_1_caso_exito: string;
  dia_3_contenido_valor: string;
  dia_5_ultima_llamada: string;
}

export interface VentasPlusProps {
  unit_economics?: UnitEconomicsVentasPlus;
  script_cierre?: ScriptWhatsAppVentasPlus;
  secuencia_seguimiento?: SecuenciaSeguimientoVentasPlus;
  garantia_irresistible?: string;
  order_bump_sugerido?: string;
  kpis_reales?: Array<{ metrica: string; objetivo: string; como_medir: string }>;
  plan_accion_paso_a_paso?: Array<{ semana: number; accion: string; entregable: string }>;
}

export default function VentasPlusEstrategiaView({
  unit_economics,
  script_cierre,
  secuencia_seguimiento,
  garantia_irresistible,
  order_bump_sugerido,
  kpis_reales,
  plan_accion_paso_a_paso,
}: VentasPlusProps) {
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
    (kpis_reales && kpis_reales.length > 0) ||
    (plan_accion_paso_a_paso && plan_accion_paso_a_paso.length > 0);

  if (!hasAnyData) return null;

  return (
    <div className="mt-8 space-y-6 pt-6 border-t border-amber-500/20">
      {/* Cabecera distintiva de Ventas + */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border border-amber-400/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-lg shadow-lg shadow-amber-500/20 flex-shrink-0">
            🔥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-white tracking-tight">
                Arsenal de Conversión Ventas +
              </h4>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                Máxima Certeza
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
                <span>📊</span> Modelo Financiero y Unit Economics
              </p>
              <h5 className="text-sm font-semibold text-white mt-0.5">
                Embudo Matemático de Adquisición Proyectado
              </h5>
            </div>
            <span className="text-[11px] font-mono text-white/50 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              Presupuesto Base: ${unit_economics.presupuesto_mensual.toLocaleString()}
            </span>
          </div>

          {/* Grilla de métricas clave */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Tráfico / Clics</span>
              <div className="mt-2">
                <p className="text-base font-bold font-mono text-white">{unit_economics.clics_proyectados.toLocaleString()}</p>
                <p className="text-[11px] font-mono text-white/40 mt-0.5">CPC est: ${unit_economics.cpc_estimado}</p>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Leads Cualificados</span>
              <div className="mt-2">
                <p className="text-base font-bold font-mono text-sky-400">{unit_economics.leads_proyectados.toLocaleString()}</p>
                <p className="text-[11px] font-mono text-white/40 mt-0.5">CPL est: ${unit_economics.cpl_estimado} ({unit_economics.tasa_conversion_lead_pct}%)</p>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Clientes / Ventas</span>
              <div className="mt-2">
                <p className="text-base font-bold font-mono text-emerald-400">{unit_economics.ventas_proyectadas}</p>
                <p className="text-[11px] font-mono text-white/40 mt-0.5">Cierre: {unit_economics.tasa_cierre_ventas_pct}% en WhatsApp</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-400/30 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-amber-300 uppercase tracking-wider font-semibold">ROAS Proyectado</span>
              <div className="mt-2">
                <p className="text-xl font-bold font-mono text-amber-300">{unit_economics.roas_proyectado}x</p>
                <p className="text-[11px] font-mono text-white/60 mt-0.5">Ingreso: ${unit_economics.ingresos_proyectados.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Parámetros de seguridad financiera */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                CAC Máximo Tolerable
              </span>
              <p className="text-xs font-semibold text-rose-300 font-mono">
                ${unit_economics.cac_maximo_tolerable.toLocaleString()}
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
              <p className="text-xs font-semibold text-emerald-400 font-mono">
                ${unit_economics.ganancia_bruta_estimada.toLocaleString()}
              </p>
              <p className="text-[10px] text-white/40 mt-1 leading-tight">
                Excedente operativo descontando costos directos y pauta.
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
                <span className="text-lg">🛡️</span>
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
                  {copiedKey === 'garantia' ? '✓ Copiado' : 'Copiar Garantía'}
                </button>
              </div>
            </div>
          )}

          {order_bump_sugerido && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-950/10 p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="text-lg">📦</span>
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
                  {copiedKey === 'orderbump' ? '✓ Copiado' : 'Copiar Oferta'}
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
                <span>💬</span> Protocolo Quirúrgico de Cierre
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
                <p className="text-[11px] text-white/50 mb-2">{script_cierre.paso_1_filtro.objetivo}</p>
                <div className="bg-black/40 p-3 rounded-lg border border-white/[0.06]">
                  <p className="text-xs text-emerald-200/90 leading-relaxed italic">
                    "{script_cierre.paso_1_filtro.mensaje_exacto}"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(script_cierre.paso_1_filtro.mensaje_exacto, 'script-p1')}
                className="w-full text-center text-xs font-medium py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] text-white/70 hover:text-white transition-all"
              >
                {copiedKey === 'script-p1' ? '✓ Mensaje Copiado' : 'Copiar Mensaje'}
              </button>
            </div>

            {/* Paso 2 */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider font-semibold">
                    Paso 2: Diagnóstico
                  </span>
                  <span className="text-xs">🔍 Preguntas</span>
                </div>
                <p className="text-[11px] text-white/50 mb-2">{script_cierre.paso_2_diagnostico.objetivo}</p>
                <div className="bg-black/40 p-3 rounded-lg border border-white/[0.06] space-y-1.5">
                  {script_cierre.paso_2_diagnostico.preguntas_clave.map((q, i) => (
                    <p key={i} className="text-xs text-sky-200/90 leading-relaxed">
                      • {q}
                    </p>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(script_cierre.paso_2_diagnostico.preguntas_clave.join('\n'), 'script-p2')}
                className="w-full text-center text-xs font-medium py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] text-white/70 hover:text-white transition-all"
              >
                {copiedKey === 'script-p2' ? '✓ Preguntas Copiadas' : 'Copiar Preguntas'}
              </button>
            </div>

            {/* Paso 3 */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-semibold">
                    Paso 3: Presentación
                  </span>
                  <span className="text-xs">🎯 Solución</span>
                </div>
                <p className="text-[11px] text-white/50 mb-2">{script_cierre.paso_3_presentacion.objetivo}</p>
                <div className="bg-black/40 p-3 rounded-lg border border-white/[0.06]">
                  <p className="text-xs text-amber-200/90 leading-relaxed italic">
                    "{script_cierre.paso_3_presentacion.pitch_solucion}"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(script_cierre.paso_3_presentacion.pitch_solucion, 'script-p3')}
                className="w-full text-center text-xs font-medium py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] text-white/70 hover:text-white transition-all"
              >
                {copiedKey === 'script-p3' ? '✓ Pitch Copiado' : 'Copiar Pitch'}
              </button>
            </div>
          </div>

          {/* Paso 4: Objeciones con pestañas interactivas */}
          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-300 font-semibold flex items-center gap-1.5">
                <span>🛡️</span> Paso 4: Respuestas a Objeciones Clave
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
                    "{script_cierre.paso_4_objeciones.objecion_precio}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(script_cierre.paso_4_objeciones.objecion_precio, 'obj-precio')}
                  className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 transition-colors whitespace-nowrap"
                >
                  {copiedKey === 'obj-precio' ? '✓ Copiado' : 'Copiar Respuesta'}
                </button>
              </div>
            )}

            {activeObjectionTab === 'pensarlo' && (
              <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[10px] font-mono text-white/40 uppercase block mb-1">Respuesta a "Déjame pensarlo / consultarlo":</span>
                  <p className="text-xs text-white/90 leading-relaxed italic">
                    "{script_cierre.paso_4_objeciones.objecion_pensarlo}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(script_cierre.paso_4_objeciones.objecion_pensarlo, 'obj-pensarlo')}
                  className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 transition-colors whitespace-nowrap"
                >
                  {copiedKey === 'obj-pensarlo' ? '✓ Copiado' : 'Copiar Respuesta'}
                </button>
              </div>
            )}

            {activeObjectionTab === 'competencia' && (
              <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[10px] font-mono text-white/40 uppercase block mb-1">Respuesta a comparación con la competencia:</span>
                  <p className="text-xs text-white/90 leading-relaxed italic">
                    "{script_cierre.paso_4_objeciones.objecion_competencia}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(script_cierre.paso_4_objeciones.objecion_competencia, 'obj-competencia')}
                  className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 transition-colors whitespace-nowrap"
                >
                  {copiedKey === 'obj-competencia' ? '✓ Copiado' : 'Copiar Respuesta'}
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
                <span>🔄</span> Recuperación de Prospectos Indecisos
              </p>
              <h5 className="text-sm font-semibold text-white mt-0.5">
                Protocolo de Seguimiento sin Presión (Día 1, 3 y 5)
              </h5>
            </div>
            <span className="text-[11px] font-mono text-white/40">
              Recupera hasta un 25% de leads fríos
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
                  "{secuencia_seguimiento.dia_1_caso_exito}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(secuencia_seguimiento.dia_1_caso_exito, 'seg-d1')}
                className="text-xs font-mono text-white/70 hover:text-white bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedKey === 'seg-d1' ? '✓ Copiado' : 'Copiar Día 1'}
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
                  "{secuencia_seguimiento.dia_3_contenido_valor}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(secuencia_seguimiento.dia_3_contenido_valor, 'seg-d3')}
                className="text-xs font-mono text-white/70 hover:text-white bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedKey === 'seg-d3' ? '✓ Copiado' : 'Copiar Día 3'}
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
                  "{secuencia_seguimiento.dia_5_ultima_llamada}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(secuencia_seguimiento.dia_5_ultima_llamada, 'seg-d5')}
                className="text-xs font-mono text-white/70 hover:text-white bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedKey === 'seg-d5' ? '✓ Copiado' : 'Copiar Día 5'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Plan de Acción Paso a Paso (4 Semanas) ── */}
      {plan_accion_paso_a_paso && plan_accion_paso_a_paso.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                Cronograma de Ejecución
              </p>
              <h5 className="text-sm font-semibold text-white mt-0.5">
                Plan de Acción de 4 Semanas con Entregables Verificables
              </h5>
            </div>
            <span className="text-[10px] font-mono text-white/40">Sin ambigüedades</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {plan_accion_paso_a_paso.map((p) => (
              <div key={p.semana} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-amber-300 font-bold">
                      Semana {p.semana}
                    </span>
                  </div>
                  <p className="text-xs text-white/90 font-medium mb-2 leading-snug">{p.accion}</p>
                </div>
                <div className="pt-2 border-t border-white/5">
                  <span className="text-[9px] font-mono text-white/40 uppercase block mb-0.5">Entregable:</span>
                  <p className="text-[11px] text-emerald-300/90 font-mono leading-tight">{p.entregable}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. KPIs de Rendimiento Real ── */}
      {kpis_reales && kpis_reales.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-5 sm:p-6 space-y-4">
          <div className="pb-3 border-b border-white/5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">
              Métricas de Control
            </p>
            <h5 className="text-sm font-semibold text-white mt-0.5">
              KPIs de Rendimiento Real para Monitorear Diariamente
            </h5>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/40 font-mono text-[10px] uppercase">
                  <th className="pb-2">Métrica</th>
                  <th className="pb-2">Objetivo Proyectado</th>
                  <th className="pb-2">Cómo Medirlo en Plataforma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {kpis_reales.map((k, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 font-medium text-white pr-4">{k.metrica}</td>
                    <td className="py-2.5 font-mono text-amber-300 font-semibold pr-4">{k.objetivo}</td>
                    <td className="py-2.5 text-white/60 leading-relaxed">{k.como_medir}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
