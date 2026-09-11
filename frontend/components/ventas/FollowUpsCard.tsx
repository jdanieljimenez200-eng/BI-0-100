'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';

interface MensajeFollowUp {
  momento: string;
  mensaje: string;
}

interface Props {
  analisisId: string;
  bloqueado: boolean;
}

function IconLock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconSend(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  );
}

/**
 * Extiende el tip gratuito de "da seguimiento en 48h" con mensajes reales
 * listos para copiar y pegar, en 3 momentos. Se genera bajo demanda y se
 * cachea en el backend — no se dispara sin que el usuario lo pida.
 */
export default function FollowUpsCard({ analisisId, bloqueado }: Props) {
  const [mensajes, setMensajes] = useState<MensajeFollowUp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ followups: MensajeFollowUp[] }>(`/ventas/${analisisId}/followups`);
      setMensajes(res.data.followups);
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo generar la secuencia de seguimiento.');
      setError(info.mensaje);
    } finally {
      setLoading(false);
    }
  }

  if (bloqueado) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 p-5">
        <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] opacity-30 space-y-2">
          <div className="h-4 w-1/3 rounded-full bg-white/10" />
          <div className="h-16 rounded-xl bg-white/[0.05]" />
        </div>
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0A0F17]/85 px-6 text-center">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-400">
            <IconLock className="w-4 h-4" />
          </div>
          <p className="text-sm font-bold text-white">Secuencia de Seguimiento</p>
          <p className="max-w-xs text-xs text-white/45">Mensajes listos para enviar en 3 momentos. Plan Pro+.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300 mb-1">Secuencia de Seguimiento</p>
          <p className="text-xs text-white/45">Mensajes listos para copiar y enviar: inmediato, 48h y 1 semana.</p>
        </div>
        {!mensajes && (
          <button
            onClick={generar}
            disabled={loading}
            className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-xs font-bold text-[#05131F] transition-all hover:brightness-110 disabled:opacity-40"
          >
            {loading ? 'Generando...' : 'Generar secuencia'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-white/40 hover:text-white ml-2 text-sm font-bold">×</button>
        </div>
      )}

      {mensajes && (
        <div className="mt-4 space-y-3">
          {mensajes.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5"
            >
              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                <IconSend className="w-3 h-3" />
                <span>{m.momento}</span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed">{m.mensaje}</p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
