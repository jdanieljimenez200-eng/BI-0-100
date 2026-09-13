'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { resenasAdmin, moderarResena, errorLegible, type ResenaAdmin } from '@/lib/network';

type ResenaModerable = ResenaAdmin & {
  experto_nombre: string;
  autor_nombre: string | null;
  autor_email: string;
};

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

const FILTROS: { clave: 'publicada' | 'oculta' | undefined; texto: string }[] = [
  { clave: undefined, texto: 'Todas' },
  { clave: 'publicada', texto: 'Publicadas' },
  { clave: 'oculta', texto: 'Ocultas' },
];

/**
 * Moderación de reseñas.
 *
 * Ocultar no borra: la reseña deja de verse y deja de contar para el rating, pero
 * el registro se conserva y se puede volver a publicar. Borrar sería perder la
 * prueba de qué se retiró si el autor reclama.
 *
 * Las reseñas de 1 y 2 estrellas se resaltan, porque es donde se concentran
 * tanto las quejas legítimas como los ataques de la competencia, y distinguir
 * unas de otros es exactamente el trabajo de esta pantalla.
 */
export default function ModeracionResenas() {
  const [filtro, setFiltro] = useState<'publicada' | 'oculta' | undefined>(undefined);
  const [resenas, setResenas] = useState<ResenaModerable[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setResenas((await resenasAdmin(filtro)) as ResenaModerable[]);
    } catch (e) {
      setResenas([]);
      setError(errorLegible(e, 'No se pudieron cargar las reseñas.'));
    }
  }, [filtro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiar = async (r: ResenaModerable) => {
    setOcupado(r.id);
    setError(null);
    try {
      await moderarResena(r.id, r.estado === 'publicada' ? 'oculta' : 'publicada');
      await cargar();
    } catch (e) {
      setError(errorLegible(e, 'No se pudo cambiar la reseña.'));
    } finally {
      setOcupado(null);
    }
  };

  // Agrupar por autor para detectar a quien reseña en masa: una misma cuenta
  // dejando 1 estrella a varios expertos de la misma categoría es la señal más
  // clara de un ataque.
  const porAutor = new Map<string, number>();
  for (const r of resenas ?? []) porAutor.set(r.usuario_id, (porAutor.get(r.usuario_id) ?? 0) + 1);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTROS.map((f) => (
          <button
            key={f.texto}
            onClick={() => {
              setResenas(null);
              setFiltro(f.clave);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filtro === f.clave
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:text-white border border-white/10'
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-rose-300 text-sm">{error}</p>
        </div>
      )}

      {resenas === null ? (
        <p className="text-white/40 text-sm">Cargando…</p>
      ) : resenas.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-white/50 text-sm">No hay reseñas en este filtro.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {resenas.map((r) => {
            const baja = r.puntuacion <= 2;
            const enMasa = (porAutor.get(r.usuario_id) ?? 0) >= 3;
            return (
              <li
                key={r.id}
                className={`rounded-2xl border p-4 ${
                  r.estado === 'oculta'
                    ? 'border-white/5 bg-white/[0.01] opacity-60'
                    : baja
                      ? 'border-rose-500/20 bg-rose-500/[0.03]'
                      : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${baja ? 'text-rose-300' : 'text-amber-400'}`}>
                        {'★'.repeat(r.puntuacion)}
                        <span className="text-white/15">{'★'.repeat(5 - r.puntuacion)}</span>
                      </span>
                      <span className="text-white/30 text-xs">sobre</span>
                      <Link
                        href={`/network/${r.experto_id}`}
                        target="_blank"
                        className="text-white/80 text-sm font-semibold hover:text-white"
                      >
                        {r.experto_nombre} ↗
                      </Link>
                      {r.estado === 'oculta' && (
                        <span className="px-2 py-0.5 rounded-full border border-white/15 text-white/50 text-[10px] font-bold uppercase tracking-widest">
                          Oculta
                        </span>
                      )}
                    </div>

                    <p className="text-white/40 text-xs mt-1">
                      {r.autor_nombre || 'Sin nombre'} · {r.autor_email} ·{' '}
                      {FECHA.format(new Date(r.fecha_creacion))}
                    </p>

                    {enMasa && (
                      <p className="text-amber-300/80 text-[11px] mt-1 font-semibold">
                        Esta cuenta tiene {porAutor.get(r.usuario_id)} reseñas en la lista: revisa si
                        está reseñando en masa.
                      </p>
                    )}

                    {r.comentario ? (
                      <p className="text-white/60 text-sm leading-relaxed mt-2 whitespace-pre-line">
                        {r.comentario}
                      </p>
                    ) : (
                      <p className="text-white/25 text-xs mt-2 italic">Sin comentario</p>
                    )}
                  </div>

                  <button
                    onClick={() => cambiar(r)}
                    disabled={ocupado === r.id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex-shrink-0 ${
                      r.estado === 'publicada'
                        ? 'border border-rose-500/30 text-rose-300 hover:bg-rose-500/10'
                        : 'border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                    }`}
                  >
                    {r.estado === 'publicada' ? 'Ocultar' : 'Volver a publicar'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-white/25 text-[11px] mt-5 leading-relaxed">
        Ocultar no borra la reseña: deja de verse y de contar para el rating, y se puede volver a
        publicar.
      </p>
    </div>
  );
}
