'use client';

import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle, Check, CreditCard } from 'lucide-react';
import api from '@/lib/api';
import { hoyLocal } from '@/lib/fechaLocal';

interface MovimientoLiquidacion {
  id: string;
  fecha: string;
  descripcion: string;
  canal_nombre_snapshot?: string | null;
  institucion_snapshot?: string | null;
  monto_bruto?: number | null;
  comision_monto?: number | null;
  comision_iva?: number | null;
  retencion_monto?: number | null;
  monto_neto?: number | null;
  monto: number;
  estado_liquidacion: 'inmediato' | 'pendiente' | 'liquidado';
  fecha_liquidacion?: string | null;
}

interface LiquidacionesKpis {
  total_pendiente_cobro: number;
  total_liquidado: number;
  total_comisiones_deducidas: number;
  conteo_pendientes: number;
}

interface Props {
  productoId: string;
  simboloMoneda?: string;
  locale?: string;
  onMovimientosCambio?: () => void;
}

export default function LiquidacionesPanel({
  productoId,
  simboloMoneda = '$',
  locale = 'es-MX',
  onMovimientosCambio,
}: Props) {
  const [movimientos, setMovimientos] = useState<MovimientoLiquidacion[]>([]);
  const [kpis, setKpis] = useState<LiquidacionesKpis>({
    total_pendiente_cobro: 0,
    total_liquidado: 0,
    total_comisiones_deducidas: 0,
    conteo_pendientes: 0,
  });
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'liquidado'>('todos');
  const [conciliandoId, setConciliandoId] = useState<string | null>(null);

  const fmt = (v: number) =>
    `${simboloMoneda}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

  const cargarDatos = useCallback(async () => {
    if (!productoId) return;
    setCargando(true);
    try {
      const { data } = await api.get(`/contabilidad/${productoId}/liquidaciones`);
      setMovimientos(data.movimientos || []);
      setKpis(data.kpis || {
        total_pendiente_cobro: 0,
        total_liquidado: 0,
        total_comisiones_deducidas: 0,
        conteo_pendientes: 0,
      });
    } catch {
      setMovimientos([]);
    } finally {
      setCargando(false);
    }
  }, [productoId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const marcarComoLiquidado = async (id: string) => {
    setConciliandoId(id);
    try {
      await api.patch(`/contabilidad/liquidaciones/${id}/conciliar`, {
        fecha_liquidacion: hoyLocal(),
      });
      await cargarDatos();
      if (onMovimientosCambio) onMovimientosCambio();
    } catch {
      toast.error('Error al conciliar la liquidación');
    } finally {
      setConciliandoId(null);
    }
  };

  const listaFiltrada = movimientos.filter((m) => {
    if (filtroEstado === 'pendiente') return m.estado_liquidacion === 'pendiente';
    if (filtroEstado === 'liquidado') return m.estado_liquidacion === 'liquidado';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* KPIs de Liquidaciones */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#0F1C2A] border border-amber-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">
              Pendiente por Cobrar
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-amber-300 font-mono">
            {fmt(kpis.total_pendiente_cobro)}
          </p>
          <p className="text-[11px] text-white/40 mt-1">
            {kpis.conteo_pendientes} venta(s) aún en manos de la terminal o app
          </p>
        </div>

        <div className="bg-[#0F1C2A] border border-emerald-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">
              Liquidado en Banco
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-emerald-300 font-mono">
            {fmt(kpis.total_liquidado)}
          </p>
          <p className="text-[11px] text-white/40 mt-1">
            Fondos efectivamente depositados en tu cuenta
          </p>
        </div>

        <div className="bg-[#0F1C2A] border border-rose-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase font-bold text-rose-300 tracking-wider">
              Comisiones Retenidas
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-rose-300 font-mono">
            {fmt(kpis.total_comisiones_deducidas)}
          </p>
          <p className="text-[11px] text-white/40 mt-1">
            Total cobrado por Clip, BBVA, Uber Eats, etc.
          </p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex gap-1.5">
          {(['todos', 'pendiente', 'liquidado'] as const).map((est) => (
            <button
              key={est}
              onClick={() => setFiltroEstado(est)}
              className={`text-xs px-3 py-1.5 rounded-xl font-semibold capitalize transition-all ${
                filtroEstado === est
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {est === 'todos' ? `Todos (${movimientos.length})` : est === 'pendiente' ? `Por cobrar (${kpis.conteo_pendientes})` : 'Liquidados'}
            </button>
          ))}
        </div>
        <span className="text-xs text-white/40">
          Conciliación automática de depósitos bancarios
        </span>
      </div>

      {/* Lista de movimientos */}
      {cargando ? (
        <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center text-xs text-white/40">
          Cargando liquidaciones…
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center">
          <CheckCircle className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-sm font-semibold text-white/70">No hay movimientos en este estado</p>
          <p className="text-xs text-white/40 mt-1">
            Al registrar ventas en el POS o contabilidad seleccionando terminal o app de delivery, aparecerán aquí para su seguimiento y conciliación.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {listaFiltrada.map((m) => {
            const neto = Number(m.monto_neto ?? m.monto ?? 0);
            const bruto = Number(m.monto_bruto ?? m.monto ?? 0);
            const comisionTotal = Number(m.comision_monto ?? 0) + Number(m.comision_iva ?? 0) + Number(m.retencion_monto ?? 0);
            const esPendiente = m.estado_liquidacion === 'pendiente';

            return (
              <div
                key={m.id}
                className={`rounded-2xl border p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  esPendiente
                    ? 'border-amber-500/25 bg-amber-500/4 hover:border-amber-500/40'
                    : 'border-white/8 bg-[#0F1C2A]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl border mt-0.5 ${
                    esPendiente ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/10 text-white/40'
                  }`}>
                    <CreditCard className="w-4 h-4" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{m.descripcion}</span>
                      {m.institucion_snapshot && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70">
                          {m.institucion_snapshot}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        esPendiente
                          ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                          : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      }`}>
                        {esPendiente ? 'Por cobrar en banco' : 'Depositado'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-white/40 mt-1">
                      <span>Fecha venta: {m.fecha}</span>
                      {m.fecha_liquidacion && (
                        <span>· Liquidado: {m.fecha_liquidacion}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Importes y botón de conciliar */}
                <div className="flex items-center justify-between sm:justify-end gap-5 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                  <div className="text-right">
                    <p className="text-xs text-white/40">
                      Bruto: <span className="text-white/60 font-mono">{fmt(bruto)}</span>
                      {comisionTotal > 0 && (
                        <span className="text-rose-300/80 font-mono ml-1.5">−{fmt(comisionTotal)} com.</span>
                      )}
                    </p>
                    <p className="text-base font-extrabold text-emerald-300 font-mono leading-tight">
                      {fmt(neto)}
                    </p>
                  </div>

                  {esPendiente ? (
                    <button
                      onClick={() => marcarComoLiquidado(m.id)}
                      disabled={conciliandoId === m.id}
                      className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                      title="Confirmar que el dinero ya cayó en la cuenta bancaria"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{conciliandoId === m.id ? 'Guardando…' : 'Marcar depositado'}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold px-2 py-1 bg-emerald-500/10 rounded-lg">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Conciliado</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
