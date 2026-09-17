'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Calculator,
  ArrowRight,
  CreditCard,
  Bike,
  Sparkles,
  TrendingUp,
  Percent,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import type { CanalCobroData } from './CanalesCobroModal';

interface Props {
  canales: CanalCobroData[];
  simboloMoneda?: string;
  locale?: string;
}

export default function SimuladorPreciosComision({
  canales,
  simboloMoneda = '$',
  locale = 'es-MX',
}: Props) {
  const [montoDeseado, setMontoDeseado] = useState<string>('200');
  const [tasaIva, setTasaIva] = useState<number>(0.16);

  const fmt = (v: number) =>
    `${simboloMoneda}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

  const netoNum = Math.max(0, Number(montoDeseado) || 0);

  // Calcular precio objetivo para cada canal
  const comparativa = useMemo(() => {
    return canales.map((canal) => {
      const pct = Math.max(0, Number(canal.comision_porcentaje) || 0);
      const fija = Math.max(0, Number(canal.comision_fija) || 0);
      const factorIva = canal.aplica_iva_comision ? 1 + tasaIva : 1;
      const retIsr = Math.max(0, Number(canal.retencion_isr_porcentaje) || 0);
      const retIva = Math.max(0, Number(canal.retencion_iva_porcentaje) || 0);

      const tasaTotal = pct * factorIva + retIsr + retIva;
      const costoFijoTotal = fija * factorIva;

      let precioObjetivo = netoNum;
      if (tasaTotal < 1) {
        precioObjetivo = Math.round(((netoNum + costoFijoTotal) / (1 - tasaTotal)) * 100) / 100;
      }

      const comisionBase = Math.round((precioObjetivo * pct + fija) * 100) / 100;
      const comisionIva = canal.aplica_iva_comision ? Math.round(comisionBase * tasaIva * 100) / 100 : 0;
      const retencionIsrMonto = Math.round(precioObjetivo * retIsr * 100) / 100;
      const retencionIvaMonto = Math.round(precioObjetivo * retIva * 100) / 100;
      const totalDeducciones = Math.round((comisionBase + comisionIva + retencionIsrMonto + retencionIvaMonto) * 100) / 100;
      const netoReal = Math.round((precioObjetivo - totalDeducciones) * 100) / 100;
      const sobreprecioRequerido = precioObjetivo - netoNum;
      const markupPorcentaje = netoNum > 0 ? Math.round((sobreprecioRequerido / netoNum) * 1000) / 10 : 0;

      return {
        canal,
        precioObjetivo,
        comisionBase,
        comisionIva,
        retencionIsrMonto,
        retencionIvaMonto,
        totalDeducciones,
        netoReal,
        sobreprecioRequerido,
        markupPorcentaje,
      };
    });
  }, [canales, netoNum, tasaIva]);

  return (
    <div className="space-y-6">
      {/* Header del simulador */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold mb-3">
            <Calculator className="w-3.5 h-3.5" />
            <span>Calculadora de Markup & Precios de Venta</span>
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight">
            ¿A qué precio publicar en Uber Eats o con Tarjeta para no perder margen?
          </h3>
          <p className="text-xs text-white/60 mt-1">
            Si cobras en terminales o apps de delivery tu precio habitual de mostrador, las comisiones se comen tu utilidad. Esta herramienta te dice el precio exacto al público para que recibas en tu banco tu ganancia íntegra.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <div className="bg-[#09131F] border border-white/15 rounded-2xl p-3 flex items-center gap-3">
              <span className="text-xs text-white/50 font-bold uppercase tracking-wider">
                Ganancia Neta Deseada:
              </span>
              <div className="flex items-center">
                <span className="text-emerald-400 font-bold text-lg mr-1">{simboloMoneda}</span>
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={montoDeseado}
                  onChange={(e) => setMontoDeseado(e.target.value)}
                  className="bg-transparent text-white font-mono font-extrabold text-xl w-28 outline-none border-b border-emerald-500/40 focus:border-emerald-400"
                />
              </div>
            </div>

            {/* Quick chips */}
            <div className="flex items-center gap-1.5">
              {['100', '250', '500', '1000'].map((chip) => (
                <button
                  key={chip}
                  onClick={() => setMontoDeseado(chip)}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all ${
                    montoDeseado === chip
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200 font-bold'
                      : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  {simboloMoneda}{chip}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Resultados lado a lado */}
      {canales.length === 0 ? (
        <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center">
          <p className="text-sm text-white/60">
            Aún no has configurado terminales o apps en la pestaña "Canales & Comisiones".
          </p>
          <p className="text-xs text-white/40 mt-1">
            Configura Clip, Mercado Pago o Uber Eats para ver la comparativa instantánea de precios.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {comparativa.map((item) => {
            const esDelivery = item.canal.tipo_canal === 'delivery';
            return (
              <motion.div
                key={item.canal.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-3xl border p-5 transition-all flex flex-col justify-between ${
                  esDelivery
                    ? 'border-emerald-500/30 bg-gradient-to-b from-[#0F2228] to-[#0A181E]'
                    : 'border-white/10 bg-[#0F1C2A]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                        {item.canal.institucion}
                      </span>
                      <h4 className="text-base font-bold text-white leading-tight">
                        {item.canal.nombre}
                      </h4>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        esDelivery
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-white/10 border-white/15 text-white/70'
                      }`}
                    >
                      +{item.markupPorcentaje}% markup
                    </span>
                  </div>

                  {/* Precio al público sugerido */}
                  <div className="bg-white/4 rounded-2xl p-4 border border-white/5 mb-4">
                    <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                      Debes cobrar al cliente:
                    </p>
                    <p className="text-3xl font-extrabold text-emerald-300 font-mono mt-1">
                      {fmt(item.precioObjetivo)}
                    </p>
                    <p className="text-[11px] text-white/40 mt-1">
                      Para recibir tus <span className="text-white font-semibold">{fmt(netoNum)}</span> limpios en banco
                    </p>
                  </div>

                  {/* Desglose de deducciones */}
                  <div className="space-y-1.5 text-xs text-white/70 pt-2 border-t border-white/8">
                    <div className="flex justify-between">
                      <span className="text-white/40">Comisión comercial:</span>
                      <span className="font-mono text-rose-300">−{fmt(item.comisionBase)}</span>
                    </div>

                    {item.comisionIva > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/40">IVA de comisión (16%):</span>
                        <span className="font-mono text-rose-300/80">−{fmt(item.comisionIva)}</span>
                      </div>
                    )}

                    {item.retencionIsrMonto > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/40">Retención ISR ({((Number(item.canal.retencion_isr_porcentaje) || 0) * 100).toFixed(1)}%):</span>
                        <span className="font-mono text-amber-300">−{fmt(item.retencionIsrMonto)}</span>
                      </div>
                    )}

                    {item.retencionIvaMonto > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/40">Retención IVA ({((Number(item.canal.retencion_iva_porcentaje) || 0) * 100).toFixed(1)}%):</span>
                        <span className="font-mono text-amber-300">−{fmt(item.retencionIvaMonto)}</span>
                      </div>
                    )}

                    <div className="flex justify-between pt-1.5 border-t border-white/5 font-bold">
                      <span className="text-white/60">Total intermediario:</span>
                      <span className="font-mono text-rose-400">−{fmt(item.totalDeducciones)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-xs">
                  <span className="text-white/40">Depósito estimado:</span>
                  <span className="font-semibold text-emerald-400">
                    {item.canal.dias_liquidacion === 0 ? 'Mismo día' : `En ${item.canal.dias_liquidacion} días`}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
