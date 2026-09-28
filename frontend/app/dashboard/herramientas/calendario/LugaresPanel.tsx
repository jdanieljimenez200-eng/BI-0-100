'use client';

import { useState } from 'react';
import { MapPin, Plus, Pencil, Archive, X, Users, Check } from 'lucide-react';
import api from '@/lib/api';
import MotionModal from '@/components/motion/MotionModal';
import { Lugar, desdeHace } from './tiposFila';

/**
 * Catálogo de lugares de atención y su ocupación en vivo.
 *
 * «Lugar» es deliberadamente genérico: mesa, silla, consultorio, bahía… El
 * negocio los nombra como quiera.
 */
export default function LugaresPanel({
  lugares,
  productoId,
  onCambio,
  onAviso,
}: {
  lugares: Lugar[];
  productoId: string;
  onCambio: () => void;
  onAviso: (msg: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [editando, setEditando] = useState<Lugar | null>(null);
  const [guardando, setGuardando] = useState(false);

  const libres = lugares.filter((l) => !l.ocupado_por).length;

  function limpiar() {
    setNombre('');
    setCapacidad('');
    setEditando(null);
  }

  async function guardar() {
    const limpio = nombre.trim();
    if (!limpio || guardando) return;
    setGuardando(true);
    try {
      const cuerpo = {
        nombre: limpio,
        capacidad: capacidad.trim() ? Number(capacidad) : null,
        ...(editando ? {} : { producto_id: productoId }),
      };
      if (editando) await api.patch(`/calendario/lugares/${editando.id}`, cuerpo);
      else await api.post('/calendario/lugares', cuerpo);
      limpiar();
      onCambio();
      onAviso(editando ? 'Lugar actualizado' : 'Lugar agregado');
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      onAviso(e.response?.data?.error || 'No se pudo guardar el lugar');
    } finally {
      setGuardando(false);
    }
  }

  async function archivar(lugar: Lugar) {
    if (lugar.ocupado_por) {
      onAviso('Ese lugar está ocupado: libéralo antes de quitarlo');
      return;
    }
    if (!confirm(`¿Quitar «${lugar.nombre}» de la lista?`)) return;
    try {
      const r = await api.delete(`/calendario/lugares/${lugar.id}`);
      onCambio();
      onAviso(r.data?.archivado ? 'El lugar tiene historial: se archivó' : 'Lugar eliminado');
    } catch {
      onAviso('No se pudo quitar el lugar');
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-semibold text-white">Lugares</h3>
          <span className="text-xs text-white/40">
            {lugares.length === 0 ? 'sin configurar' : `${libres} de ${lugares.length} libres`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="px-3 py-1.5 rounded-xl border border-white/15 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          Configurar
        </button>
      </div>

      {lugares.length === 0 ? (
        <p className="text-xs text-white/45">
          Da de alta tus mesas, sillas, consultorios o bahías para poder asignarlos a quien esperas.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {lugares.map((l) => (
            <div
              key={l.id}
              className={`rounded-xl border px-3 py-2 ${
                l.ocupado_por
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-emerald-500/25 bg-emerald-500/5'
              }`}
            >
              <p className="text-sm font-medium text-white truncate">{l.nombre}</p>
              {l.ocupado_por ? (
                <p className="text-[11px] text-amber-200/80 truncate">
                  {l.ocupado_por.cliente_nombre} · {desdeHace(l.ocupado_por.desde)}
                </p>
              ) : (
                <p className="text-[11px] text-emerald-300/80">
                  Libre{l.capacidad ? ` · ${l.capacidad} personas` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <MotionModal isOpen={abierto} onClose={() => { setAbierto(false); limpiar(); }} maxWidth="max-w-lg">
        <div className="bg-[#0b1522] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Tus lugares</h3>
            <button type="button" aria-label="Cerrar" onClick={() => { setAbierto(false); limpiar(); }} className="text-white/40 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }}
              placeholder="Mesa 4, Silla 2, Consultorio B…"
              aria-label="Nombre del lugar"
              maxLength={60}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
            />
            <input
              value={capacidad}
              onChange={(e) => setCapacidad(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="Cupo"
              aria-label="Cupo (personas)"
              inputMode="numeric"
              className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              type="button"
              onClick={guardar}
              disabled={!nombre.trim() || guardando}
              aria-label={editando ? 'Guardar nombre' : 'Añadir lugar'}
              title={editando ? 'Guardar nombre' : 'Añadir lugar'}
              className="px-3 h-10 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {editando ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-white/35 -mt-2 mb-4">
            El cupo es opcional: sirve en un restaurante, no tanto en una barbería.
          </p>

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {lugares.length === 0 && <p className="text-sm text-white/40">Todavía no tienes lugares.</p>}
            {lugares.map((l) => (
              <div key={l.id} className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                <span className="flex-1 text-sm text-white truncate">{l.nombre}</span>
                {l.capacidad && (
                  <span className="flex items-center gap-1 text-[11px] text-white/40">
                    <Users className="w-3 h-3" />
                    {l.capacidad}
                  </span>
                )}
                {l.ocupado_por && <span className="text-[11px] text-amber-300/80">ocupado</span>}
                <button
                  type="button"
                  title="Renombrar"
                  onClick={() => { setEditando(l); setNombre(l.nombre); setCapacidad(l.capacidad ? String(l.capacidad) : ''); }}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Quitar"
                  onClick={() => archivar(l)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </MotionModal>
    </div>
  );
}
