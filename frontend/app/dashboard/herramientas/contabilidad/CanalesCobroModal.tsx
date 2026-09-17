'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Bike,
  Globe,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  X,
  Smartphone,
  Landmark,
} from 'lucide-react';
import api from '@/lib/api';

export interface CanalCobroData {
  id: string;
  nombre: string;
  tipo_canal: 'terminal' | 'delivery' | 'pasarela_web' | 'transferencia' | 'efectivo' | 'otro';
  institucion: string;
  comision_porcentaje: number;
  comision_fija: number;
  aplica_iva_comision: boolean;
  retencion_isr_porcentaje: number;
  retencion_iva_porcentaje: number;
  dias_liquidacion: number;
  activo: boolean;
  color?: string | null;
  icono?: string | null;
  notas?: string | null;
}

interface Props {
  productoId: string;
  canales: CanalCobroData[];
  onActualizar: () => void;
  onClose: () => void;
  simboloMoneda?: string;
}

export default function CanalesCobroModal({
  productoId,
  canales,
  onActualizar,
  onClose,
  simboloMoneda = '$',
}: Props) {
  const [cargandoSeed, setCargandoSeed] = useState(false);
  const [editando, setEditando] = useState<CanalCobroData | null>(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Formulario
  const [form, setForm] = useState<{
    nombre: string;
    tipo_canal: 'terminal' | 'delivery' | 'pasarela_web' | 'transferencia' | 'efectivo' | 'otro';
    institucion: string;
    comision_porcentaje: string; // ej. "3.6" para 3.6%
    comision_fija: string; // ej. "0"
    aplica_iva_comision: boolean;
    retencion_isr_porcentaje: string; // ej. "1" para 1%
    retencion_iva_porcentaje: string; // ej. "8" para 8%
    dias_liquidacion: string;
    notas: string;
  }>({
    nombre: '',
    tipo_canal: 'terminal',
    institucion: '',
    comision_porcentaje: '3.6',
    comision_fija: '0',
    aplica_iva_comision: true,
    retencion_isr_porcentaje: '0',
    retencion_iva_porcentaje: '0',
    dias_liquidacion: '1',
    notas: '',
  });

  const cargarDefaults = async () => {
    try {
      setCargandoSeed(true);
      setErrorMsg(null);
      await api.post(`/contabilidad/${productoId}/canales/seed-defaults`);
      onActualizar();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setErrorMsg(ax.response?.data?.error || 'Error al cargar los canales predeterminados.');
    } finally {
      setCargandoSeed(false);
    }
  };

  const abrirNuevo = () => {
    setEditando(null);
    setForm({
      nombre: '',
      tipo_canal: 'terminal',
      institucion: '',
      comision_porcentaje: '3.6',
      comision_fija: '0',
      aplica_iva_comision: true,
      retencion_isr_porcentaje: '0',
      retencion_iva_porcentaje: '0',
      dias_liquidacion: '1',
      notas: '',
    });
    setCreandoNuevo(true);
    setErrorMsg(null);
  };

  const abrirEditar = (canal: CanalCobroData) => {
    setEditando(canal);
    setForm({
      nombre: canal.nombre,
      tipo_canal: canal.tipo_canal,
      institucion: canal.institucion,
      comision_porcentaje: String((Number(canal.comision_porcentaje) * 100).toFixed(2)),
      comision_fija: String(Number(canal.comision_fija)),
      aplica_iva_comision: canal.aplica_iva_comision,
      retencion_isr_porcentaje: String((Number(canal.retencion_isr_porcentaje) * 100).toFixed(2)),
      retencion_iva_porcentaje: String((Number(canal.retencion_iva_porcentaje) * 100).toFixed(2)),
      dias_liquidacion: String(canal.dias_liquidacion),
      notas: canal.notas || '',
    });
    setCreandoNuevo(true);
    setErrorMsg(null);
  };

  const guardarCanal = async () => {
    if (!form.nombre.trim() || !form.institucion.trim()) {
      setErrorMsg('El nombre y la institución son obligatorios.');
      return;
    }

    const pct = Math.max(0, Number(form.comision_porcentaje) || 0) / 100;
    const fija = Math.max(0, Number(form.comision_fija) || 0);
    const retIsr = Math.max(0, Number(form.retencion_isr_porcentaje) || 0) / 100;
    const retIva = Math.max(0, Number(form.retencion_iva_porcentaje) || 0) / 100;
    const dias = Math.max(0, Number.parseInt(form.dias_liquidacion, 10) || 0);

    setGuardando(true);
    setErrorMsg(null);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        tipo_canal: form.tipo_canal,
        institucion: form.institucion.trim(),
        comision_porcentaje: pct,
        comision_fija: fija,
        aplica_iva_comision: form.aplica_iva_comision,
        retencion_isr_porcentaje: retIsr,
        retencion_iva_porcentaje: retIva,
        dias_liquidacion: dias,
        notas: form.notas.trim() || null,
      };

      if (editando) {
        await api.put(`/contabilidad/${productoId}/canales/${editando.id}`, payload);
      } else {
        await api.post(`/contabilidad/${productoId}/canales`, payload);
      }

      onActualizar();
      setCreandoNuevo(false);
      setEditando(null);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setErrorMsg(ax.response?.data?.error || 'Error al guardar el canal.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarCanal = async (id: string, nombre: string) => {
    if (!confirm(`¿Desactivar el canal "${nombre}"?`)) return;
    try {
      await api.delete(`/contabilidad/${productoId}/canales/${id}`);
      onActualizar();
    } catch {
      alert('No se pudo desactivar el canal.');
    }
  };

  const getIcono = (tipo: string) => {
    switch (tipo) {
      case 'delivery':
        return <Bike className="w-5 h-5 text-emerald-400" />;
      case 'terminal':
        return <Smartphone className="w-5 h-5 text-amber-400" />;
      case 'pasarela_web':
        return <Globe className="w-5 h-5 text-sky-400" />;
      case 'transferencia':
        return <Landmark className="w-5 h-5 text-purple-400" />;
      default:
        return <CreditCard className="w-5 h-5 text-teal-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#0D1926] border border-white/15 rounded-3xl p-6 w-full max-w-3xl my-8 shadow-2xl relative"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-white/40 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Terminales y Canales de Cobro
            </h2>
            <p className="text-xs text-white/50">
              Configura cuánto te cobra cada terminal (Clip, BBVA) o app de delivery (Uber Eats, Rappi) para descontarlo automáticamente.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="my-4 p-3 bg-rose-500/10 border border-rose-500/25 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Acciones superiores */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-6 border-b border-white/8 pb-4">
          <button
            onClick={abrirNuevo}
            className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar nueva terminal o app</span>
          </button>

          {canales.length === 0 && (
            <button
              onClick={cargarDefaults}
              disabled={cargandoSeed}
              className="text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 px-3.5 py-2 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{cargandoSeed ? 'Cargando catálogo…' : 'Cargar Clip, Uber Eats y más presets'}</span>
            </button>
          )}
        </div>

        {/* Formulario Modal Inline si creando/editando */}
        <AnimatePresence>
          {creandoNuevo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#09131F] border border-white/10 rounded-2xl p-5 mb-6 space-y-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {editando ? `Editar ${editando.nombre}` : 'Nueva Terminal / Canal de Cobro'}
                </h3>
                <button
                  onClick={() => setCreandoNuevo(false)}
                  className="text-xs text-white/40 hover:text-white"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">
                    Tipo de Canal *
                  </label>
                  <select
                    value={form.tipo_canal}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tipo_canal: e.target.value as any,
                        // Presets de comision segun tipo
                        comision_porcentaje:
                          e.target.value === 'delivery' ? '30.0' : e.target.value === 'terminal' ? '3.6' : form.comision_porcentaje,
                        retencion_isr_porcentaje: e.target.value === 'delivery' ? '1.0' : '0',
                        retencion_iva_porcentaje: e.target.value === 'delivery' ? '8.0' : '0',
                        dias_liquidacion: e.target.value === 'delivery' ? '7' : '1',
                      })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
                  >
                    <option value="terminal" className="bg-[#0F1C2A]">Terminal Física / TPV (Clip, Mercado Pago, Banco)</option>
                    <option value="delivery" className="bg-[#0F1C2A]">App de Delivery (Uber Eats, Rappi, Didi Food)</option>
                    <option value="pasarela_web" className="bg-[#0F1C2A]">Pasarela Web / E-commerce (Stripe, PayPal)</option>
                    <option value="transferencia" className="bg-[#0F1C2A]">Transferencia Bancaria / SPEI</option>
                    <option value="otro" className="bg-[#0F1C2A]">Otro canal con intermediario</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">
                    Nombre Descriptivo *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Clip Mostrador, Uber Eats Sucursal 1"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">
                    Institución Financiera *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Clip, BBVA, Mercado Pago, Uber"
                    value={form.institucion}
                    onChange={(e) => setForm({ ...form, institucion: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              {/* Parámetros de cobro */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/3 p-3.5 rounded-xl border border-white/5">
                <div>
                  <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">
                    Comisión (%) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="3.6"
                      value={form.comision_porcentaje}
                      onChange={(e) => setForm({ ...form, comision_porcentaje: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-3 pr-7 py-2 text-xs text-white outline-none focus:border-emerald-500/50 font-mono"
                    />
                    <span className="absolute right-2.5 top-2 text-xs text-white/40 pointer-events-none">%</span>
                  </div>
                  <span className="text-[9px] text-white/30 block mt-0.5">Ej. 3.6% Clip, 30% Uber</span>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">
                    Tarifa Fija ({simboloMoneda})
                  </label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    placeholder="0.00"
                    value={form.comision_fija}
                    onChange={(e) => setForm({ ...form, comision_fija: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50 font-mono"
                  />
                  <span className="text-[9px] text-white/30 block mt-0.5">Ej. $4 en Mercado Pago</span>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">
                    Días a Liquidar
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    placeholder="1"
                    value={form.dias_liquidacion}
                    onChange={(e) => setForm({ ...form, dias_liquidacion: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50 font-mono"
                  />
                  <span className="text-[9px] text-white/30 block mt-0.5">0 = Inmediato, 7 = Semanal</span>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.aplica_iva_comision}
                      onChange={(e) => setForm({ ...form, aplica_iva_comision: e.target.checked })}
                      className="accent-emerald-500 rounded"
                    />
                    <span className="text-xs text-white/80 font-medium">Aplica IVA a comisión (16%)</span>
                  </label>
                  <span className="text-[9px] text-emerald-400/70 mt-1">
                    Es IVA acreditable en tu declaración fiscal.
                  </span>
                </div>
              </div>

              {/* Retenciones para Delivery / Plataformas Tecnológicas */}
              {form.tipo_canal === 'delivery' && (
                <div className="grid grid-cols-2 gap-3 bg-amber-500/5 p-3.5 rounded-xl border border-amber-500/20">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block mb-1">
                      Retención ISR Plataforma Digital (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="1.0"
                      value={form.retencion_isr_porcentaje}
                      onChange={(e) => setForm({ ...form, retencion_isr_porcentaje: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500/50 font-mono"
                    />
                    <span className="text-[9px] text-amber-300/60 block mt-0.5">Típicamente 1% a 2.5% según régimen</span>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block mb-1">
                      Retención IVA Plataforma Digital (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="8.0"
                      value={form.retencion_iva_porcentaje}
                      onChange={(e) => setForm({ ...form, retencion_iva_porcentaje: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500/50 font-mono"
                    />
                    <span className="text-[9px] text-amber-300/60 block mt-0.5">Típicamente 8% (50% del IVA)</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreandoNuevo(false)}
                  className="px-4 py-2 text-xs font-semibold text-white/50 hover:text-white rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardarCanal}
                  disabled={guardando}
                  className="px-5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : editando ? 'Actualizar canal' : 'Crear canal'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista de Canales Configurados */}
        {canales.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl p-6">
            <CreditCard className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white/70">No tienes terminales o canales configurados</p>
            <p className="text-xs text-white/40 mt-1 max-w-md mx-auto mb-5">
              Agrega tu terminal bancaria (Clip, Mercado Pago) o tus plataformas de delivery (Uber Eats, Rappi) para que tus utilidades reales y comisiones se calculen al centavo.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={cargarDefaults}
                disabled={cargandoSeed}
                className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Sparkles className="w-4 h-4" />
                <span>Cargar catálogo recomendado</span>
              </button>
              <button
                onClick={abrirNuevo}
                className="text-xs font-bold border border-white/15 hover:bg-white/5 text-white px-4 py-2.5 rounded-xl transition-colors"
              >
                Crear personalizado
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
            {canales.map((canal) => {
              const pctStr = `${(Number(canal.comision_porcentaje) * 100).toFixed(1)}%`;
              const fijaStr = Number(canal.comision_fija) > 0 ? ` + ${simboloMoneda}${Number(canal.comision_fija)}` : '';
              const ivaStr = canal.aplica_iva_comision ? ' + IVA' : '';

              return (
                <div
                  key={canal.id}
                  className="bg-white/4 border border-white/8 hover:border-white/20 rounded-2xl p-4 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          {getIcono(canal.tipo_canal)}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white leading-tight">{canal.nombre}</h4>
                          <span className="text-[10px] text-white/40 font-medium">
                            {canal.institucion} · {canal.tipo_canal.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => abrirEditar(canal)}
                          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => eliminarCanal(canal.id, canal.nombre)}
                          className="p-1.5 rounded-lg text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Desactivar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-white/70 mt-3 pt-3 border-t border-white/5">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-white/40">Comisión comercial:</span>
                        <span className="font-mono font-bold text-amber-300">
                          {pctStr}{fijaStr}{ivaStr}
                        </span>
                      </div>

                      {Number(canal.retencion_isr_porcentaje) > 0 && (
                        <div className="flex justify-between items-center text-rose-300/80">
                          <span className="text-[11px] text-white/40">Retención ISR:</span>
                          <span className="font-mono">{(Number(canal.retencion_isr_porcentaje) * 100).toFixed(1)}%</span>
                        </div>
                      )}

                      {Number(canal.retencion_iva_porcentaje) > 0 && (
                        <div className="flex justify-between items-center text-rose-300/80">
                          <span className="text-[11px] text-white/40">Retención IVA:</span>
                          <span className="font-mono">{(Number(canal.retencion_iva_porcentaje) * 100).toFixed(1)}%</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-white/40">Liquidación en banco:</span>
                        <span className="text-white/80">
                          {canal.dias_liquidacion === 0 ? 'Inmediata' : `${canal.dias_liquidacion} día(s)`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {canal.notas && (
                    <p className="text-[10px] text-white/30 italic mt-2.5 line-clamp-1">
                      {canal.notas}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center">
          <p className="text-[11px] text-white/40">
            {canales.length} canal(es) activo(s) para este producto
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
