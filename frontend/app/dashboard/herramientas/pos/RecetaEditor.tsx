'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';

interface InsumoMin {
  id: string;
  nombre: string;
  unidad: string;
  costo_promedio: number;
  stock_actual: number;
}

interface FilaReceta {
  insumo_id: string;
  cantidad: string;
  insumo_nombre?: string;
  unidad?: string;
  costo_promedio?: number;
}

interface Props {
  /** null mientras el item no se ha guardado: la receta necesita su id. */
  itemPosId: string | null;
  simbolo: string;
  locale: string;
}

const n = (v: unknown) => Number(v ?? 0);

/**
 * Editor de la receta (BOM) de un item del catálogo POS.
 *
 * Es lo que conecta el POS con el almacén: al cobrar, cada línea se expande
 * contra esta lista para descontar stock y calcular el costo de la venta.
 *
 * Se guarda por separado del item (PUT completo de la receta) para no mezclar
 * dos operaciones distintas en un mismo botón, y porque un item nuevo todavía
 * no tiene id al que colgarla.
 */
export default function RecetaEditor({ itemPosId, simbolo, locale }: Props) {
  const [insumos, setInsumos] = useState<InsumoMin[]>([]);
  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const money = useCallback(
    (v: number) =>
      `${simbolo}${new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v)}`,
    [simbolo, locale],
  );

  useEffect(() => {
    api
      .get('/inventario/insumos')
      .then(({ data }) => {
        // El endpoint responde { insumos: [...] }, no el array pelado. Se
        // aceptan las dos formas para no depender de ese detalle.
        const lista = Array.isArray(data) ? data : (data?.insumos ?? []);
        setInsumos(lista as InsumoMin[]);
      })
      .catch(() => setInsumos([]));
  }, []);

  useEffect(() => {
    if (!itemPosId) {
      setFilas([]);
      return;
    }
    setCargando(true);
    api
      .get(`/pos/catalogo/${itemPosId}/receta`)
      .then(({ data }) => {
        const receta = (data?.receta || []) as {
          insumo_id: string;
          cantidad: number;
          insumo_nombre: string;
          unidad: string;
          costo_promedio: number;
        }[];
        setFilas(
          receta.map((r) => ({
            insumo_id: r.insumo_id,
            cantidad: String(n(r.cantidad)),
            insumo_nombre: r.insumo_nombre,
            unidad: r.unidad,
            costo_promedio: n(r.costo_promedio),
          })),
        );
      })
      .catch(() => setFilas([]))
      .finally(() => setCargando(false));
  }, [itemPosId]);

  const costoTotal = filas.reduce((acc, f) => {
    const insumo = insumos.find((i) => i.id === f.insumo_id);
    return acc + n(f.cantidad) * n(insumo?.costo_promedio ?? f.costo_promedio);
  }, 0);

  const guardar = async () => {
    if (!itemPosId) return;
    setGuardando(true);
    setAviso(null);
    try {
      await api.put(`/pos/catalogo/${itemPosId}/receta`, {
        insumos: filas
          .filter((f) => f.insumo_id && n(f.cantidad) > 0)
          .map((f) => ({ insumo_id: f.insumo_id, cantidad: n(f.cantidad) })),
      });
      setAviso('Receta guardada');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setAviso(e.response?.data?.error ?? 'No se pudo guardar la receta');
    } finally {
      setGuardando(false);
    }
  };

  if (!itemPosId) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-3">
        <p className="text-[11px] leading-relaxed text-white/40">
          Guarda el producto primero y podrás definir qué insumos consume para que las ventas
          descuenten tu almacén automáticamente.
        </p>
      </div>
    );
  }

  const disponibles = insumos.filter((i) => !filas.some((f) => f.insumo_id === i.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
          Receta (descuenta almacén)
        </label>
        {costoTotal > 0 && (
          <span className="text-[10px] tabular-nums text-amber-300">
            Costo: {money(costoTotal)}
          </span>
        )}
      </div>

      {insumos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-3 text-[11px] leading-relaxed text-white/40">
          No tienes insumos en Inventario todavía. Créalos ahí y podrás enlazarlos aquí.
        </p>
      ) : cargando ? (
        <div className="flex items-center gap-2 py-2 text-[11px] text-white/40">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando receta…
        </div>
      ) : (
        <>
          {filas.map((f, idx) => {
            const insumo = insumos.find((i) => i.id === f.insumo_id);
            return (
              <div key={`${f.insumo_id}-${idx}`} className="flex items-center gap-1.5">
                <select
                  value={f.insumo_id}
                  onChange={(e) =>
                    setFilas((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, insumo_id: e.target.value } : x)),
                    )
                  }
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500/40"
                >
                  {/* La opcion de la fila actual siempre presente: si el insumo
                      ya no esta en la lista, el select caeria en la primera
                      opcion y al guardar cambiaria de insumo sin avisar. */}
                  <option value={f.insumo_id} className="bg-[#0F1C2A]">
                    {insumo?.nombre ?? f.insumo_nombre ?? 'Insumo no disponible'}
                  </option>
                  {disponibles.map((i) => (
                    <option key={i.id} value={i.id} className="bg-[#0F1C2A]">
                      {i.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={f.cantidad}
                  onChange={(e) =>
                    setFilas((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, cantidad: e.target.value } : x)),
                    )
                  }
                  className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right font-mono text-xs text-white outline-none focus:border-emerald-500/40"
                  placeholder="0"
                />
                <span className="w-10 shrink-0 text-[10px] text-white/35">
                  {insumo?.unidad ?? f.unidad ?? ''}
                </span>
                <button
                  type="button"
                  onClick={() => setFilas((prev) => prev.filter((_, i) => i !== idx))}
                  className="shrink-0 rounded-lg p-1.5 text-white/30 transition-colors hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={disponibles.length === 0}
              onClick={() =>
                disponibles[0] &&
                setFilas((prev) => [...prev, { insumo_id: disponibles[0].id, cantidad: '1' }])
              }
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-30"
            >
              <Plus className="h-3 w-3" />
              Insumo
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
            >
              {guardando && <Loader2 className="h-3 w-3 animate-spin" />}
              Guardar receta
            </button>
          </div>

          {aviso && <p className="text-[10px] text-white/45">{aviso}</p>}

          {filas.length === 0 && (
            <p className="text-[10px] leading-relaxed text-white/30">
              Sin receta, este producto se vende pero no descuenta almacén ni aporta margen a los
              reportes.
            </p>
          )}
        </>
      )}
    </div>
  );
}
