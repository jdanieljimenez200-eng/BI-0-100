'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';
import { camposAceptacion } from '@/lib/documentosLegales';

/**
 * Pide aceptar los Términos y el Aviso de Privacidad vigentes a una cuenta que
 * no los tiene aceptados (`/auth/me` → `aceptaciones_pendientes`): cuentas
 * anteriores al registro de aceptaciones, colaboradores dados de alta por el
 * dueño o una versión nueva de los documentos. No se puede cerrar sin aceptar;
 * la alternativa es salir.
 */
export default function AceptacionPendienteModal({
  onAceptado,
  onSalir,
}: {
  onAceptado: () => void;
  onSalir: () => void;
}) {
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const aceptar = async () => {
    if (!acepta) {
      setError('Marca la casilla para continuar.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.post('/auth/aceptaciones', camposAceptacion());
      onAceptado();
    } catch (err) {
      setError(interpretarErrorApi(err, 'No pudimos guardar tu aceptación. Inténtalo de nuevo.').mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aceptacion-titulo"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-md rounded-[24px] border border-white/[0.08] bg-[#1C1C1E] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.7)]">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
            <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <h2 id="aceptacion-titulo" className="text-lg font-bold tracking-tight text-white">
            Revisa nuestros documentos legales
          </h2>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-white/60">
          Para seguir usando BI 0 A 100 necesitamos que aceptes la versión vigente de los Términos y Condiciones y
          del Aviso de Privacidad, donde explicamos cómo tratamos tus datos y los de tu negocio.
        </p>

        <label
          htmlFor="aceptacion-casilla"
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-[#141416] p-3 hover:border-white/15"
        >
          <input
            id="aceptacion-casilla"
            type="checkbox"
            checked={acepta}
            onChange={(e) => {
              setAcepta(e.target.checked);
              if (e.target.checked) setError('');
            }}
            disabled={enviando}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-red-500"
          />
          <span className="text-xs leading-relaxed text-slate-300">
            He leído y acepto los{' '}
            <Link href="/terminos" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
              Términos y Condiciones
            </Link>{' '}
            y el{' '}
            <Link href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
              Aviso de Privacidad
            </Link>
            , y declaro ser mayor de edad.
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSalir}
            disabled={enviando}
            className="text-sm font-medium text-white/50 hover:text-white/80 disabled:opacity-40"
          >
            Cerrar sesión
          </button>
          <button
            type="button"
            onClick={aceptar}
            disabled={enviando}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0A0A0C] hover:bg-white/90 active:scale-[0.98] disabled:opacity-50"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Aceptar y continuar
          </button>
        </div>
      </div>
    </div>
  );
}
