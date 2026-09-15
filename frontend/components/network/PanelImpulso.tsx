'use client';

import { useEffect, useState } from 'react';
import {
  cotizarImpulso,
  errorLegible,
  pagarImpulso,
  pesosMx,
  tarifasImpulso,
  type AlcanceImpulso,
  type Cotizacion,
  type FichaPropia,
  type Impulso,
  type TarifasImpulso,
} from '@/lib/network';

/**
 * Crear una campaña de impulso, al estilo de «Promocionar» en Meta: dónde, cuántos
 * días y cuánto cuesta, con el precio que calcula el servidor. El pago va a
 * Stripe y la campaña empieza cuando el webhook confirma el cobro.
 */

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });
const PRESETS = [3, 7, 15, 30];

const ESTADO_IMPULSO: Record<Impulso['estado'], { texto: string; clase: string }> = {
  pendiente_pago: { texto: 'Esperando pago', clase: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  activo: { texto: 'En curso', clase: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  terminado: { texto: 'Terminado', clase: 'text-white/60 border-white/15 bg-white/5' },
  cancelado: { texto: 'Cancelado', clase: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
};

export function ListaImpulsos({ impulsos }: { impulsos: Impulso[] }) {
  if (impulsos.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-widest text-white/40">Tus campañas</p>
      {impulsos.map((i) => {
        const est = ESTADO_IMPULSO[i.estado];
        const ctr = i.metricas.impresiones > 0 ? (i.metricas.clics / i.metricas.impresiones) * 100 : null;
        return (
          <div key={i.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-white text-sm font-bold">
                {i.alcance === 'nacional' ? 'Todo el país' : i.ciudad} · {i.dias} días · {pesosMx(i.monto_mxn)}
              </p>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${est.clase}`}>
                {est.texto}
              </span>
            </div>
            {i.fecha_inicio && i.fecha_fin && (
              <p className="text-white/35 text-[11px] mt-1">
                {FECHA.format(new Date(i.fecha_inicio))} – {FECHA.format(new Date(i.fecha_fin))}
              </p>
            )}
            {i.estado === 'cancelado' && i.motivo_cancelacion && (
              <p className="text-rose-200/70 text-[11px] mt-1">Motivo: {i.motivo_cancelacion}</p>
            )}
            {i.fecha_inicio && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  ['Apariciones promocionadas', i.metricas.impresiones],
                  ['Visitas al perfil', i.metricas.vistas],
                  ['Contactos', i.metricas.clics],
                ].map(([t, v]) => (
                  <div key={t as string} className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                    <p className="text-white font-extrabold text-base leading-tight">{(v as number).toLocaleString('es-MX')}</p>
                    <p className="text-white/35 text-[10px] leading-tight">{t}</p>
                  </div>
                ))}
              </div>
            )}
            {ctr !== null && (
              <p className="text-white/30 text-[10px] mt-1.5">
                {ctr.toFixed(1)} % de quienes te vieron promocionado te contactaron.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PanelImpulso({ ficha, impulsos }: { ficha: FichaPropia; impulsos: Impulso[] }) {
  const [tarifas, setTarifas] = useState<TarifasImpulso | null>(null);
  const [alcance, setAlcance] = useState<AlcanceImpulso>(ficha.ciudad ? 'ciudad' : 'nacional');
  const [ciudad, setCiudad] = useState(ficha.ciudad ?? '');
  const [dias, setDias] = useState(7);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tarifasImpulso().then(setTarifas).catch(() => setTarifas(null));
  }, []);

  // Cotiza con una pausa: escribir la ciudad letra a letra no debe lanzar diez peticiones.
  useEffect(() => {
    if (alcance === 'ciudad' && !ciudad.trim()) {
      setCotizacion(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      cotizarImpulso({ experto_id: ficha.id, alcance, ciudad: alcance === 'ciudad' ? ciudad.trim() : null, dias })
        .then((c) => vigente && (setCotizacion(c), setError(null)))
        .catch((e) => vigente && setError(errorLegible(e, 'No pudimos calcular el precio.')));
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [ficha.id, alcance, ciudad, dias]);

  const pagar = async () => {
    setPagando(true);
    setError(null);
    try {
      window.location.href = await pagarImpulso({
        experto_id: ficha.id,
        alcance,
        ciudad: alcance === 'ciudad' ? ciudad.trim() : null,
        dias,
      });
    } catch (e) {
      setError(errorLegible(e, 'No pudimos abrir el pago.'));
      setPagando(false);
    }
  };

  const propios = impulsos.filter((i) => i.experto_id === ficha.id);

  if (ficha.estado !== 'aprobado') {
    return (
      <div className="space-y-4">
        <p className="text-white/50 text-sm">
          Podrás impulsar tu perfil cuando esté aprobado. Mientras está en revisión no aparece en el directorio, así que
          no tendría dónde mostrarse.
        </p>
        <ListaImpulsos impulsos={propios} />
      </div>
    );
  }

  const diasMin = tarifas?.dias_min ?? 3;
  const diasMax = tarifas?.dias_max ?? 30;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-5">
        <div>
          <p className="text-white font-bold">Impulsa tu perfil</p>
          <p className="text-white/45 text-xs mt-1 leading-relaxed">
            Sales arriba del directorio y en los resultados de análisis de negocios de tu categoría, con la etiqueta
            «Promocionado». Pagas una vez por los días que elijas; no se renueva solo.
          </p>
        </div>

        <div>
          <span className="block text-xs font-semibold text-white/50 mb-2">¿Dónde quieres aparecer?</span>
          <div className="grid grid-cols-2 gap-2">
            {(['ciudad', 'nacional'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAlcance(a)}
                aria-pressed={alcance === a}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                  alcance === a ? 'border-amber-400/60 bg-amber-500/10' : 'border-white/10 hover:border-white/25'
                }`}
              >
                <span className="block text-sm font-bold text-white">{a === 'ciudad' ? 'En mi ciudad' : 'Todo el país'}</span>
                <span className="block text-[11px] text-white/40">
                  {tarifas ? `${pesosMx(tarifas.tarifa_dia[a])} por día` : '…'}
                </span>
              </button>
            ))}
          </div>
          {alcance === 'ciudad' && (
            <input
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              maxLength={120}
              placeholder="Ciudad"
              aria-label="Ciudad donde quieres aparecer"
              className="mt-2 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor={`dias-${ficha.id}`} className="text-xs font-semibold text-white/50">
              Duración
            </label>
            <span className="text-white font-bold text-sm">{dias} días</span>
          </div>
          <input
            id={`dias-${ficha.id}`}
            type="range"
            min={diasMin}
            max={diasMax}
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="w-full accent-amber-400"
          />
          <div className="flex gap-2 mt-2">
            {PRESETS.filter((p) => p >= diasMin && p <= diasMax).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDias(p)}
                className={`px-2.5 py-1 rounded-md border text-[11px] font-bold ${
                  dias === p ? 'border-amber-400/60 text-amber-200' : 'border-white/10 text-white/50 hover:text-white/80'
                }`}
              >
                {p} días
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5 flex flex-col">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-200/70">Resumen</p>
        {cotizacion ? (
          <>
            <p className="text-3xl font-extrabold text-white mt-3">{pesosMx(cotizacion.monto_mxn)}</p>
            <p className="text-white/45 text-xs mt-1">
              {pesosMx(cotizacion.tarifa_dia)} × {cotizacion.dias} días · IVA incluido
            </p>
            <p className="text-white/45 text-xs mt-3">
              {alcance === 'nacional' ? 'Todo el país' : ciudad.trim()} ·{' '}
              {cotizacion.disponible
                ? `${cotizacion.cupo - cotizacion.ocupados} de ${cotizacion.cupo} espacios libres`
                : 'Sin espacios libres ahora'}
            </p>
            {!cotizacion.disponible && cotizacion.libera_el && (
              <p className="text-amber-200/70 text-xs mt-1">
                Se libera un espacio el {FECHA.format(new Date(cotizacion.libera_el))}.
              </p>
            )}
          </>
        ) : (
          <p className="text-white/40 text-sm mt-3">
            {alcance === 'ciudad' && !ciudad.trim() ? 'Escribe la ciudad para ver el precio.' : 'Calculando…'}
          </p>
        )}

        <button
          type="button"
          onClick={pagar}
          disabled={pagando || !cotizacion?.disponible}
          className="mt-5 w-full py-3 rounded-xl bg-amber-400 text-[#070E17] font-extrabold text-sm hover:bg-amber-300 disabled:opacity-40 transition-colors"
        >
          {pagando ? 'Abriendo pago…' : 'Pagar e impulsar'}
        </button>
        <p className="text-white/30 text-[10px] mt-2 leading-relaxed">
          Empieza en cuanto se confirma el pago. Si tu perfil vuelve a revisión o se suspende, deja de mostrarse mientras
          tanto y los días siguen corriendo.
        </p>
        {error && <p className="text-rose-300 text-xs mt-2">{error}</p>}
      </div>

      <div className="lg:col-span-2">
        <ListaImpulsos impulsos={propios} />
      </div>
    </div>
  );
}
