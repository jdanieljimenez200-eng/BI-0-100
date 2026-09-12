'use client';

import { useState } from 'react';
import Link from 'next/link';
import { dejarResena, editarResena, borrarResena, errorLegible, type ResenaPublica } from '@/lib/network';
import { useHaySesion } from '@/lib/useSesion';

/**
 * Dejar, cambiar o retirar la reseña propia de un experto.
 *
 * Hace falta una cuenta, y solo se puede dejar una: si ya existe, el formulario
 * la edita en vez de ofrecer un botón que el backend va a rechazar con 409.
 * También un experto puede toparse aquí con el 403 de reseñarse a sí mismo —el
 * mensaje del servidor se muestra tal cual, porque explica el motivo mejor que
 * un "error" genérico.
 */
export default function FormularioResena({
  expertoId,
  miResena,
  alGuardar,
}: {
  expertoId: string;
  miResena: ResenaPublica | null;
  alGuardar: () => void;
}) {
  const haySesion = useHaySesion();

  const [abierto, setAbierto] = useState(false);
  const [puntuacion, setPuntuacion] = useState(miResena?.puntuacion ?? 0);
  const [comentario, setComentario] = useState(miResena?.comentario ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!haySesion) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-white/50 text-xs leading-relaxed">
          ¿Has trabajado con este experto?{' '}
          <Link href="/auth/login" className="text-white font-semibold underline decoration-white/30">
            Entra en tu cuenta
          </Link>{' '}
          para dejar una reseña.
        </p>
      </div>
    );
  }

  if (!abierto) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-3">
        <p className="text-white/50 text-xs">
          {miResena
            ? `Dejaste ${miResena.puntuacion} de 5 estrellas.`
            : '¿Has trabajado con este experto? Cuenta tu experiencia.'}
        </p>
        <button
          onClick={() => {
            setPuntuacion(miResena?.puntuacion ?? 0);
            setComentario(miResena?.comentario ?? '');
            setError(null);
            setAbierto(true);
          }}
          className="px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs font-bold hover:bg-white/5 transition-colors flex-shrink-0"
        >
          {miResena ? 'Cambiar mi reseña' : 'Dejar una reseña'}
        </button>
      </div>
    );
  }

  const guardar = async () => {
    if (puntuacion < 1) {
      setError('Elige cuántas estrellas le das.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if (miResena) {
        await editarResena(miResena.id, puntuacion, comentario);
      } else {
        await dejarResena(expertoId, puntuacion, comentario);
      }
      setAbierto(false);
      alGuardar();
    } catch (e) {
      setError(errorLegible(e, 'No pudimos guardar tu reseña.'));
    } finally {
      setGuardando(false);
    }
  };

  const retirar = async () => {
    if (!miResena) return;
    setGuardando(true);
    setError(null);
    try {
      await borrarResena(miResena.id);
      setAbierto(false);
      alGuardar();
    } catch (e) {
      setError(errorLegible(e, 'No pudimos retirar tu reseña.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/15 bg-white/[0.03] p-4">
      <div className="flex items-center gap-1.5 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setPuntuacion(n)}
            aria-label={`${n} de 5 estrellas`}
            aria-pressed={puntuacion === n}
            className="p-0.5"
          >
            <svg
              className={`w-6 h-6 transition-colors ${n <= puntuacion ? 'text-amber-400' : 'text-white/20 hover:text-white/40'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        ))}
      </div>

      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder="¿Qué le pediste y cómo fue? Lo concreto ayuda más que un adjetivo."
        className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 resize-y"
      />

      {error && <p className="text-rose-300 text-xs mt-2">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          onClick={guardar}
          disabled={guardando}
          className="px-4 py-2 rounded-lg bg-white text-[#070E17] text-xs font-bold hover:bg-white/90 disabled:opacity-50 transition-colors"
        >
          {guardando ? 'Guardando…' : miResena ? 'Guardar cambios' : 'Publicar reseña'}
        </button>
        <button
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          disabled={guardando}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        {miResena && (
          <button
            onClick={retirar}
            disabled={guardando}
            className="ml-auto text-rose-300/70 hover:text-rose-300 text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            Retirar mi reseña
          </button>
        )}
      </div>
    </div>
  );
}
