'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const ETAPAS = [
  'Leyendo el contexto de tu producto',
  'Generando tips de negociación',
  'Componiendo una historia ilustrativa para tu rubro',
  'Mapeando por qué fracasan negocios como el tuyo',
  'Empaquetando tu plan de acción',
];

const MENSAJES = [
  'Los mejores vendedores preparan antes de improvisar…',
  'Cruce de datos con benchmarks de tu categoría…',
  'Armando un ejemplo aplicado a tu tipo de negocio…',
  'El 82% de los negocios muere por errores evitables…',
  'Últimos detalles, casi listo…',
];

export default function CargaAnalisisVentas({ producto, done }: { producto?: string | null; done?: boolean }) {
  const [segundos, setSegundos] = useState(0);
  const [mensajeIdx, setMensajeIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const m = setInterval(() => setMensajeIdx((i) => (i + 1) % MENSAJES.length), 2600);
    return () => clearInterval(m);
  }, []);

  const progreso = done ? 100 : Math.min(95, 6 + segundos * 3.2);
  const etapaActual = done ? ETAPAS.length : Math.min(ETAPAS.length - 1, Math.floor(segundos / 7));

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070B12]">
      {/* Fondo */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '42px 42px' }} />
      <div className="pointer-events-none absolute -top-48 -left-48 h-[480px] w-[480px] rounded-full bg-emerald-500/15 blur-[160px]" />
      <div className="pointer-events-none absolute -right-48 top-1/3 h-[420px] w-[420px] rounded-full bg-cyan-500/10 blur-[150px]" />

      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16">
        {/* Gráfica animada */}
        <div className="relative mb-10 h-36 w-full max-w-md">
          <svg viewBox="0 0 400 140" className="h-full w-full" fill="none">
            <defs>
              <linearGradient id="vLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#34D399" />
                <stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
              <linearGradient id="vArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[28, 62, 96].map((y) => (
              <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />
            ))}
            <path d="M0,120 C50,118 70,100 110,98 C150,96 170,80 210,72 C250,64 280,44 330,30 L400,14 L400,140 L0,140 Z" fill="url(#vArea)" opacity="0.9" />
            <motion.path
              d="M0,120 C50,118 70,100 110,98 C150,96 170,80 210,72 C250,64 280,44 330,30 L400,14"
              stroke="url(#vLine)"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 }}
            />
            <motion.circle
              cx="400"
              cy="14"
              r="5"
              fill="#22D3EE"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.4, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 0.8 }}
            />
          </svg>
          <span className="absolute -top-2 right-0 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-cyan-300">
            VENTAS ↑
          </span>
        </div>

        {/* Progreso */}
        <div className="mb-2 flex items-end gap-2">
          <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-5xl font-black tabular-nums text-transparent">
            {Math.floor(progreso)}%
          </span>
          <span className="pb-1.5 text-xs font-medium uppercase tracking-widest text-white/35">generando</span>
        </div>

        <h2 className="mb-1 text-center text-lg font-semibold text-white">
          Analizando las ventas{producto ? ` de ${producto}` : ''}
        </h2>
        <p className="mb-8 h-5 text-center text-sm text-white/45">
          <AnimatePresence mode="wait">
            <motion.span
              key={mensajeIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
              className="inline-block"
            >
              {MENSAJES[mensajeIdx]}
            </motion.span>
          </AnimatePresence>
        </p>

        {/* Barra */}
        <div className="mb-8 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
            animate={{ width: `${progreso}%` }}
            transition={{ ease: 'easeOut', duration: 0.8 }}
          />
        </div>

        {/* Checklist de etapas */}
        <ul className="w-full max-w-md space-y-2.5">
          {ETAPAS.map((etapa, i) => {
            const done = i < etapaActual;
            const activa = i === etapaActual;
            return (
              <li
                key={etapa}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors duration-500 ${
                  done
                    ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200'
                    : activa
                      ? 'border-cyan-400/35 bg-cyan-400/[0.08] text-cyan-100'
                      : 'border-white/[0.07] bg-white/[0.02] text-white/35'
                }`}
              >
                {done ? (
                  <svg className="h-4 w-4 shrink-0 text-emerald-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                ) : activa ? (
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-300" />
                ) : (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-white/20" />
                )}
                <span className="truncate">{etapa}</span>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-xs text-white/30">Toma 30–60 s · también te avisamos por email cuando termine</p>
      </div>
    </div>
  );
}
