'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cancelarImpulso, errorLegible, impulsosAdmin, NOMBRE_CATEGORIA, pesosMx, type Impulso } from '@/lib/network';

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

/**
 * Campañas de impulso: qué se está promocionando, dónde y cuánto rinde.
 *
 * Cortar una campaña exige motivo y queda en la auditoría. No devuelve el dinero:
 * el reembolso se hace en Stripe, y por eso se avisa aquí mismo.
 */
export default function ModeracionImpulsos() {
  const [impulsos, setImpulsos] = useState<Impulso[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setImpulsos(await impulsosAdmin());
    } catch (e) {
      setImpulsos([]);
      setError(errorLegible(e, 'No se pudieron cargar las campañas.'));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cortar = async (i: Impulso) => {
    const motivo = window.prompt(
      `Motivo para cortar el impulso de «${i.nombre_comercial}» (queda en la auditoría y lo verá el experto):`
    );
    if (!motivo?.trim()) return;
    setOcupado(i.id);
    setError(null);
    try {
      await cancelarImpulso(i.id, motivo.trim());
      setAviso(`Impulso cortado. Si corresponde reembolso (${pesosMx(i.monto_mxn)}), hazlo desde Stripe.`);
      await cargar();
    } catch (e) {
      setError(errorLegible(e, 'No se pudo cortar el impulso.'));
    } finally {
      setOcupado(null);
    }
  };

  if (impulsos === null) return <p className="text-white/40 text-sm">Cargando…</p>;

  const vigentes = impulsos.filter((i) => i.estado === 'activo');
  const ingreso = impulsos
    .filter((i) => i.estado !== 'pendiente_pago')
    .reduce((s, i) => s + i.monto_mxn, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-white/40 text-[11px]">En curso</p>
          <p className="text-white text-xl font-extrabold">{vigentes.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-white/40 text-[11px]">Cobrado (últimas 200)</p>
          <p className="text-white text-xl font-extrabold">{pesosMx(ingreso)}</p>
        </div>
      </div>

      {aviso && <p className="text-white/70 text-sm">{aviso}</p>}
      {error && <p className="text-rose-300 text-sm">{error}</p>}

      {impulsos.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-white/50 text-sm">Todavía no hay campañas.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="text-white/40 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="p-3">Perfil</th>
                <th className="p-3">Dónde</th>
                <th className="p-3">Periodo</th>
                <th className="p-3 text-right">Monto</th>
                <th className="p-3 text-right">Apar. / visitas / contactos</th>
                <th className="p-3">Estado</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {impulsos.map((i) => (
                <tr key={i.id} className="text-white/70">
                  <td className="p-3">
                    <Link href={`/network/${i.experto_id}`} className="font-bold text-white hover:underline">
                      {i.nombre_comercial}
                    </Link>
                    <span className="block text-white/35">{NOMBRE_CATEGORIA[i.categoria]}</span>
                  </td>
                  <td className="p-3">{i.alcance === 'nacional' ? 'Nacional' : i.ciudad}</td>
                  <td className="p-3 whitespace-nowrap">
                    {i.fecha_inicio && i.fecha_fin
                      ? `${FECHA.format(new Date(i.fecha_inicio))} – ${FECHA.format(new Date(i.fecha_fin))}`
                      : `${i.dias} días`}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">{pesosMx(i.monto_mxn)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {i.metricas.impresiones} / {i.metricas.vistas} / {i.metricas.clics}
                  </td>
                  <td className="p-3">
                    {i.estado}
                    {i.motivo_cancelacion && <span className="block text-rose-300/70">{i.motivo_cancelacion}</span>}
                  </td>
                  <td className="p-3 text-right">
                    {i.estado === 'activo' && (
                      <button
                        onClick={() => cortar(i)}
                        disabled={ocupado === i.id}
                        className="px-2.5 py-1 rounded-md border border-rose-500/30 text-rose-300 font-bold hover:bg-rose-500/10 disabled:opacity-40"
                      >
                        Cortar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
