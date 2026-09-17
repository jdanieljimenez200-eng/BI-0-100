'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Calendar,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import api from '@/lib/api';

interface PnLData {
  periodo: string;
  pnl: {
    ingresos_brutos: number;
    comisiones_pasarelas_delivery: number;
    ingreso_neto_operativo: number;
    costo_ventas_cogs: number;
    utilidad_bruta: number;
    margen_bruto_porcentaje: number;
    gastos_operativos_opex: number;
    utilidad_operativa_ebitda: number;
    margen_operativo_porcentaje: number;
    impuestos: number;
    utilidad_neta: number;
    margen_neto_porcentaje: number;
  };
}

interface CanalAnalisis {
  institucion: string;
  canal_nombre: string;
  transacciones: number;
  total_bruto: number;
  total_comisiones: number;
  total_deducciones: number;
  total_neto: number;
  porcentaje_fuga: number;
}

interface Props {
  productoId: string;
  simboloMoneda?: string;
  locale?: string;
}

export default function EstadoResultadosPnL({
  productoId,
  simboloMoneda = '$',
  locale = 'es-MX',
}: Props) {
  const [data, setData] = useState<PnLData | null>(null);
  const [canalesAnalisis, setCanalesAnalisis] = useState<CanalAnalisis[]>([]);
  const [fugaGlobal, setFugaGlobal] = useState<number>(0);
  const [cargando, setCargando] = useState(true);

  // Selector de mes (default mes actual YYYY-MM)
  const mesActual = new Date().toISOString().slice(0, 7);
  const [mesSeleccionado, setMesSeleccionado] = useState<string>('');

  const fmt = (v: number) =>
    `${simboloMoneda}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

  const cargarPnL = useCallback(async () => {
    if (!productoId) return;
    setCargando(true);
    try {
      const params = mesSeleccionado ? { mes: mesSeleccionado } : {};
      const [resPnL, resCanales] = await Promise.all([
        api.get(`/contabilidad/${productoId}/pnl`, { params }),
        api.get(`/contabilidad/${productoId}/analisis-canales`),
      ]);
      setData(resPnL.data);
      setCanalesAnalisis(resCanales.data.canales || []);
      setFugaGlobal(resCanales.data.totales?.porcentaje_fuga_global || 0);
    } catch {
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [productoId, mesSeleccionado]);

  useEffect(() => {
    cargarPnL();
  }, [cargarPnL]);

  const p = data?.pnl;

  return (
    <div className="space-y-6">
      {/* Barra de Filtro de Periodo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0F1C2A] border border-white/10 rounded-2xl p-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <PieChart className="w-4 h-4 text-emerald-400" />
            <span>Estado de Resultados (P&L Gerencial)</span>
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            Vista financiera estructurada desde las ventas brutas hasta la utilidad neta real después de comisiones de pago.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-1.5 text-xs outline-none focus:border-emerald-500/50"
          />
          {mesSeleccionado && (
            <button
              onClick={() => setMesSeleccionado('')}
              className="text-xs text-white/40 hover:text-white px-2 py-1 rounded-lg"
            >
              Ver todo
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="p-12 border border-dashed border-white/10 rounded-3xl text-center text-white/40 text-sm">
          Calculando Estado de Resultados…
        </div>
      ) : !p ? (
        <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center text-xs text-white/40">
          No hay datos disponibles para el periodo seleccionado.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tarjeta de Alerta de Fuga por Comisiones si supera 4% */}
          {p.comisiones_pasarelas_delivery > 0 && (
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-200">
                    Fugas por Comisiones Financieras y Plataformas
                  </h4>
                  <p className="text-xs text-amber-200/70 mt-0.5">
                    Has pagado un total de <span className="font-bold text-white">{fmt(p.comisiones_pasarelas_delivery)}</span> en comisiones de terminales y delivery en este periodo, lo que representa el{' '}
                    <span className="font-bold text-amber-300">
                      {p.ingresos_brutos > 0
                        ? `${((p.comisiones_pasarelas_delivery / p.ingresos_brutos) * 100).toFixed(1)}%`
                        : '0%'}
                    </span>{' '}
                    de tus ventas brutas.
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-white/40 block">Total retenido:</span>
                <span className="text-xl font-extrabold text-rose-300 font-mono">
                  −{fmt(p.comisiones_pasarelas_delivery)}
                </span>
              </div>
            </div>
          )}

          {/* Cascada de Estado de Resultados */}
          <div className="bg-[#0F1C2A] border border-white/10 rounded-3xl p-6 space-y-4">
            {/* 1. Ingresos Brutos */}
            <div className="flex justify-between items-center pb-3 border-b border-white/8">
              <div>
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span>Ingresos Brutos por Ventas</span>
                </p>
                <p className="text-[11px] text-white/40">Total facturado o cobrado a clientes</p>
              </div>
              <span className="text-lg font-extrabold text-emerald-300 font-mono">
                {fmt(p.ingresos_brutos)}
              </span>
            </div>

            {/* 2. Deducción de comisiones */}
            <div className="flex justify-between items-center pl-6 pb-3 border-b border-white/5">
              <div>
                <p className="text-xs text-white/70 font-semibold flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                  <span>(−) Comisiones de Terminales y Plataformas Delivery</span>
                </p>
                <p className="text-[10px] text-white/30">Clip, BBVA, Mercado Pago, Uber Eats, Rappi</p>
              </div>
              <span className="text-sm font-mono text-rose-300 font-semibold">
                −{fmt(p.comisiones_pasarelas_delivery)}
              </span>
            </div>

            {/* 3. Ingreso Neto Operativo */}
            <div className="flex justify-between items-center bg-white/3 px-4 py-2.5 rounded-xl border border-white/5">
              <div>
                <p className="text-xs font-bold text-white/90">(=) Ingreso Neto Operativo</p>
                <p className="text-[10px] text-white/40">Dinero real que ingresa a tus cuentas</p>
              </div>
              <span className="text-base font-bold text-white font-mono">
                {fmt(p.ingreso_neto_operativo)}
              </span>
            </div>

            {/* 4. Costo de Ventas COGS */}
            <div className="flex justify-between items-center pl-6 pb-3 border-b border-white/5">
              <div>
                <p className="text-xs text-white/70 font-semibold flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                  <span>(−) Costo de Mercancía e Insumos (COGS)</span>
                </p>
                <p className="text-[10px] text-white/30">Materias primas, insumos consumidos de almacén</p>
              </div>
              <span className="text-sm font-mono text-rose-300 font-semibold">
                −{fmt(p.costo_ventas_cogs)}
              </span>
            </div>

            {/* 5. Utilidad Bruta */}
            <div className="flex justify-between items-center bg-white/4 px-4 py-2.5 rounded-xl border border-white/10">
              <div>
                <p className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                  <span>(=) Utilidad Bruta</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    {p.margen_bruto_porcentaje}% margen
                  </span>
                </p>
                <p className="text-[10px] text-white/40">Ingreso neto menos costo directo de venta</p>
              </div>
              <span className="text-base font-extrabold text-emerald-300 font-mono">
                {fmt(p.utilidad_bruta)}
              </span>
            </div>

            {/* 6. Gastos Operativos OPEX */}
            <div className="flex justify-between items-center pl-6 pb-3 border-b border-white/5">
              <div>
                <p className="text-xs text-white/70 font-semibold flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                  <span>(−) Gastos Operativos Fijos y Variables (OPEX)</span>
                </p>
                <p className="text-[10px] text-white/30">Nómina, rentas, publicidad, luz, servicios, gasolina</p>
              </div>
              <span className="text-sm font-mono text-rose-300 font-semibold">
                −{fmt(p.gastos_operativos_opex)}
              </span>
            </div>

            {/* 7. EBITDA */}
            <div className="flex justify-between items-center bg-white/3 px-4 py-2.5 rounded-xl border border-white/5">
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-2">
                  <span>(=) Utilidad Operativa (EBITDA)</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                    {p.margen_operativo_porcentaje}% operativo
                  </span>
                </p>
                <p className="text-[10px] text-white/40">Resultado operativo antes de impuestos</p>
              </div>
              <span className={`text-base font-bold font-mono ${p.utilidad_operativa_ebitda >= 0 ? 'text-white' : 'text-rose-300'}`}>
                {fmt(p.utilidad_operativa_ebitda)}
              </span>
            </div>

            {/* 8. Impuestos */}
            <div className="flex justify-between items-center pl-6 pb-3 border-b border-white/5">
              <div>
                <p className="text-xs text-white/70 font-semibold flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5 text-amber-400" />
                  <span>(−) Impuestos Provisionales / Estimados</span>
                </p>
                <p className="text-[10px] text-white/30">IVA por pagar, ISR y cargas patronales registradas</p>
              </div>
              <span className="text-sm font-mono text-amber-300 font-semibold">
                −{fmt(p.impuestos)}
              </span>
            </div>

            {/* 9. Utilidad Neta Real */}
            <div className="flex justify-between items-center bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent p-4 rounded-2xl border border-emerald-500/40 mt-2">
              <div>
                <p className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>(=) UTILIDAD NETA FINAL</span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    p.utilidad_neta >= 0
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  }`}>
                    {p.margen_neto_porcentaje}% margen neto
                  </span>
                </p>
                <p className="text-[11px] text-white/50 mt-0.5">
                  Ganancia líquida real disponible para el dueño del negocio
                </p>
              </div>
              <span className={`text-2xl font-black font-mono ${p.utilidad_neta >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                {fmt(p.utilidad_neta)}
              </span>
            </div>
          </div>

          {/* Desglose de Fugas por Institución */}
          {canalesAnalisis.length > 0 && (
            <div className="bg-[#0F1C2A] border border-white/10 rounded-3xl p-6">
              <h4 className="text-sm font-bold text-white mb-1">
                Desglose de Comisiones por Plataforma / Terminal
              </h4>
              <p className="text-xs text-white/40 mb-4">
                Dónde se está yendo el dinero de intermediación financiera y logística.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {canalesAnalisis.map((item) => (
                  <div
                    key={item.institucion}
                    className="bg-white/4 border border-white/8 rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{item.institucion}</span>
                      <span className="text-[10px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                        {item.porcentaje_fuga}% de costo
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-white/60 pt-2 border-t border-white/5">
                      <div className="flex justify-between">
                        <span>Ventas brutas:</span>
                        <span className="font-mono text-white/80">{fmt(item.total_bruto)}</span>
                      </div>
                      <div className="flex justify-between text-rose-300 font-semibold">
                        <span>Comisiones deducidas:</span>
                        <span className="font-mono">−{fmt(item.total_deducciones)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-300 font-bold pt-1 border-t border-white/5">
                        <span>Neto depositado:</span>
                        <span className="font-mono">{fmt(item.total_neto)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
