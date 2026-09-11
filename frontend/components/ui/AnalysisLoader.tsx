'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export interface LoaderStep {
  label: string;
  sub?: string;
  icon?: ReactNode;
}

interface AnalysisLoaderProps {
  modulo?: string;
  steps?: LoaderStep[];
  currentStep?: number;
  title?: string;
  subtitle?: string;
  footnote?: string;
  /**
   * true cuando el análisis ya está listo y el loader está a punto de ceder el
   * paso al informe: cierra la barra en 100 % y marca todas las etapas.
   * Lo entrega `useAnalysisLoaderGate` como `loaderDone`.
   */
  done?: boolean;
}

/**
 * Paleta por módulo. Las clases se escriben COMPLETAS (no concatenadas) para que
 * el JIT de Tailwind las detecte en el bundle de producción.
 */
interface Accent {
  badge: string;
  lineFrom: string;
  lineTo: string;
  numberText: string;
  bar: string;
  barGlow: string;
  glowA: string;
  glowB: string;
  badgeChip: string;
  done: string;
  active: string;
  dot: string;
  check: string;
  hints: string[];
}

const ACCENTS: Record<string, Accent> = {
  mercado: {
    badge: 'ANÁLISIS DE MERCADO',
    lineFrom: '#22D3EE',
    lineTo: '#3B82F6',
    numberText: 'bg-gradient-to-r from-cyan-400 to-blue-500',
    bar: 'bg-gradient-to-r from-cyan-400 to-blue-500',
    barGlow: 'shadow-[0_0_18px_rgba(34,211,238,0.55)]',
    glowA: 'bg-cyan-500/15',
    glowB: 'bg-blue-500/10',
    badgeChip: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300',
    done: 'border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-100',
    active: 'border-blue-400/35 bg-blue-400/[0.08] text-blue-100',
    dot: 'bg-cyan-300',
    check: 'text-cyan-400',
    hints: [
      'Rastreando competidores activos en tu categoría…',
      'Cruzando volumen de búsquedas con estacionalidad…',
      'Midiendo el hueco de mercado que nadie está cubriendo…',
      'Cerrando el score de viabilidad…',
    ],
  },
  marketing: {
    badge: 'ESTRATEGIA DE MARKETING',
    lineFrom: '#E879F9',
    lineTo: '#A78BFA',
    numberText: 'bg-gradient-to-r from-fuchsia-400 to-violet-400',
    bar: 'bg-gradient-to-r from-fuchsia-400 to-violet-400',
    barGlow: 'shadow-[0_0_18px_rgba(232,121,249,0.55)]',
    glowA: 'bg-fuchsia-500/15',
    glowB: 'bg-violet-500/10',
    badgeChip: 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300',
    done: 'border-fuchsia-400/25 bg-fuchsia-400/[0.08] text-fuchsia-100',
    active: 'border-violet-400/35 bg-violet-400/[0.08] text-violet-100',
    dot: 'bg-fuchsia-300',
    check: 'text-fuchsia-400',
    hints: [
      'Perfilando a quién le hablas y con qué tono…',
      'Escribiendo copies listos para publicar…',
      'Cuadrando el calendario de contenido…',
      'Afinando métricas y llamadas a la acción…',
    ],
  },
  finanzas: {
    badge: 'PROYECCIÓN FINANCIERA',
    lineFrom: '#34D399',
    lineTo: '#22D3EE',
    numberText: 'bg-gradient-to-r from-emerald-400 to-cyan-400',
    bar: 'bg-gradient-to-r from-emerald-400 to-cyan-400',
    barGlow: 'shadow-[0_0_18px_rgba(52,211,153,0.55)]',
    glowA: 'bg-emerald-500/15',
    glowB: 'bg-cyan-500/10',
    badgeChip: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
    done: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200',
    active: 'border-cyan-400/35 bg-cyan-400/[0.08] text-cyan-100',
    dot: 'bg-cyan-300',
    check: 'text-emerald-400',
    hints: [
      'Ordenando costos fijos y variables…',
      'Proyectando doce meses de ingresos…',
      'Buscando tu punto de equilibrio…',
      'Comprobando el margen de contribución…',
    ],
  },
  legal: {
    badge: 'ANÁLISIS LEGAL',
    lineFrom: '#FBBF24',
    lineTo: '#FB923C',
    numberText: 'bg-gradient-to-r from-amber-400 to-orange-400',
    bar: 'bg-gradient-to-r from-amber-400 to-orange-400',
    barGlow: 'shadow-[0_0_18px_rgba(251,191,36,0.55)]',
    glowA: 'bg-amber-500/15',
    glowB: 'bg-orange-500/10',
    badgeChip: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
    done: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-100',
    active: 'border-orange-400/35 bg-orange-400/[0.08] text-orange-100',
    dot: 'bg-amber-300',
    check: 'text-amber-400',
    hints: [
      'Identificando tu giro y régimen aplicable…',
      'Listando permisos y licencias obligatorias…',
      'Revisando obligaciones fiscales y laborales…',
      'Preparando tu checklist de cumplimiento…',
    ],
  },
  brief: {
    badge: 'BRIEF EJECUTIVO',
    lineFrom: '#A78BFA',
    lineTo: '#22D3EE',
    numberText: 'bg-gradient-to-r from-violet-400 to-cyan-400',
    bar: 'bg-gradient-to-r from-violet-400 to-cyan-400',
    barGlow: 'shadow-[0_0_18px_rgba(167,139,250,0.55)]',
    glowA: 'bg-violet-500/15',
    glowB: 'bg-cyan-500/10',
    badgeChip: 'border-violet-400/30 bg-violet-500/10 text-violet-300',
    done: 'border-violet-400/25 bg-violet-400/[0.08] text-violet-100',
    active: 'border-cyan-400/35 bg-cyan-400/[0.08] text-cyan-100',
    dot: 'bg-violet-300',
    check: 'text-violet-400',
    hints: [
      'Reuniendo las conclusiones de cada módulo…',
      'Resolviendo contradicciones entre análisis…',
      'Priorizando los siguientes pasos…',
      'Redactando el brief ejecutivo…',
    ],
  },
};

const ACCENT_FALLBACK: Accent = {
  badge: 'ANÁLISIS EN CURSO',
  lineFrom: '#34D399',
  lineTo: '#22D3EE',
  numberText: 'bg-gradient-to-r from-emerald-400 to-cyan-400',
  bar: 'bg-gradient-to-r from-emerald-400 to-cyan-400',
  barGlow: 'shadow-[0_0_18px_rgba(52,211,153,0.55)]',
  glowA: 'bg-emerald-500/15',
  glowB: 'bg-cyan-500/10',
  badgeChip: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  done: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200',
  active: 'border-cyan-400/35 bg-cyan-400/[0.08] text-cyan-100',
  dot: 'bg-cyan-300',
  check: 'text-emerald-400',
  hints: [
    'Cruzando tus datos con benchmarks de la categoría…',
    'Depurando ruido para quedarnos solo con lo accionable…',
    'Contrastando los números antes de cerrar el informe…',
    'Últimos ajustes, casi listo…',
  ],
};

const LINE_PATH =
  'M0,120 C50,118 70,100 110,98 C150,96 170,80 210,72 C250,64 280,44 330,30 L400,14';
const AREA_PATH = `${LINE_PATH} L400,140 L0,140 Z`;

/** Techo del progreso mientras el backend no ha confirmado el resultado. */
const PROGRESS_CAP = 96;
/** Constante de tiempo de la curva: ~39 % a 10 s, ~63 % a 20 s, ~86 % a 40 s. */
const PROGRESS_TAU_S = 20;
/** Refresco del progreso: suficientemente fino para que el contador fluya. */
const TICK_MS = 200;
const HINT_MS = 2800;

function formatElapsed(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Sigue un valor objetivo con suavizado exponencial y devuelve solo el entero.
 * El re-render ocurre únicamente cuando cambia el número mostrado, así el
 * contador sube fluido sin repintar en cada frame.
 */
function useSmoothInteger(target: number, reduceMotion: boolean): number {
  const [shown, setShown] = useState(() => Math.floor(target));
  const targetRef = useRef(target);
  const valueRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (reduceMotion) {
      valueRef.current = targetRef.current;
      setShown(Math.floor(targetRef.current));
      return;
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // dt acotado: al volver de una pestaña en background el salto sería enorme.
      const dt = Math.min(now - last, 120);
      last = now;

      const diff = targetRef.current - valueRef.current;
      valueRef.current =
        Math.abs(diff) < 0.05
          ? targetRef.current
          : valueRef.current + diff * (1 - Math.exp(-dt / 220));

      const next = Math.floor(valueRef.current);
      setShown((prev) => (prev === next ? prev : next));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  return shown;
}

export function AnalysisLoader({
  modulo,
  steps,
  currentStep = 0,
  title,
  subtitle,
  footnote,
  done = false,
}: AnalysisLoaderProps) {
  const lista = useMemo<LoaderStep[]>(() => (Array.isArray(steps) ? steps : []), [steps]);
  const accent = ACCENTS[(modulo ?? '').toLowerCase()] ?? ACCENT_FALLBACK;
  const gradId = useId().replace(/:/g, '');
  const reduceMotion = useReducedMotion() ?? false;

  const [segundos, setSegundos] = useState(0);
  const [progreso, setProgreso] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);

  // Inicialización perezosa: `useRef(Date.now())` evaluaba el reloj en CADA
  // render (useRef ignora el valor a partir del segundo) y el React Compiler lo
  // marca como impureza en render. Con el inicializador de useState se calcula
  // una sola vez.
  const [inicio] = useState(() => Date.now());
  const stepRef = useRef(currentStep);
  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  const total = lista.length;

  // Progreso monótono: nunca baja (currentStep puede reciclarse con módulo en
  // algunas páginas) y se queda por debajo de PROGRESS_CAP hasta que el backend
  // confirma. Al confirmar, `done` lo lleva a 100 y el contador lo alcanza
  // durante el handoff del gate.
  useEffect(() => {
    if (done) {
      setProgreso(100);
      return;
    }

    const tick = () => {
      const t = (Date.now() - inicio) / 1000;
      setSegundos(Math.floor(t));
      const porTiempo = 100 * (1 - Math.exp(-t / PROGRESS_TAU_S));
      const porPasos =
        total > 0 ? ((Math.min(Math.max(stepRef.current, 0), total - 1) + 1) / total) * 88 : 0;
      setProgreso((prev) => Math.min(PROGRESS_CAP, Math.max(prev, porTiempo, porPasos)));
    };

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [done, total]);

  useEffect(() => {
    if (done || accent.hints.length <= 1) return;
    const id = setInterval(() => setHintIdx((i) => (i + 1) % accent.hints.length), HINT_MS);
    return () => clearInterval(id);
  }, [done, accent.hints.length]);

  const numero = useSmoothInteger(progreso, reduceMotion);

  // El índice puede quedar fuera de rango si cambia el módulo en caliente.
  const hint = done ? 'Informe listo, abriendo…' : accent.hints[hintIdx % accent.hints.length] ?? '';

  // Con `done` todas las etapas quedan marcadas como completadas.
  const pasoActivo = done ? total : total > 0 ? Math.min(Math.max(currentStep, 0), total - 1) : -1;

  return (
    <div
      role="status"
      aria-busy={!done}
      aria-live="polite"
      className="relative min-h-screen overflow-hidden bg-[#070B12]"
    >
      {/* Fondo: rejilla + halos */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-48 -left-48 h-[420px] w-[420px] rounded-full blur-[150px] transition-opacity duration-700 sm:h-[480px] sm:w-[480px] sm:blur-[160px] ${accent.glowA} ${done ? 'opacity-60' : 'opacity-100'}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-48 top-1/3 h-[360px] w-[360px] rounded-full blur-[140px] transition-opacity duration-700 sm:h-[420px] sm:w-[420px] sm:blur-[150px] ${accent.glowB} ${done ? 'opacity-60' : 'opacity-100'}`}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-5 py-14 sm:px-6 sm:py-16">
        {/* Gráfica animada */}
        <div className="relative mb-8 h-28 w-full max-w-md sm:mb-10 sm:h-36">
          <svg viewBox="0 0 400 140" className="h-full w-full" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id={`line-${gradId}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={accent.lineFrom} />
                <stop offset="100%" stopColor={accent.lineTo} />
              </linearGradient>
              <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent.lineFrom} stopOpacity="0.25" />
                <stop offset="100%" stopColor={accent.lineFrom} stopOpacity="0" />
              </linearGradient>
            </defs>

            {[28, 62, 96].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="400"
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="4 6"
              />
            ))}

            <path d={AREA_PATH} fill={`url(#area-${gradId})`} opacity="0.9" />

            {reduceMotion || done ? (
              <path
                d={LINE_PATH}
                stroke={`url(#line-${gradId})`}
                strokeWidth="3"
                strokeLinecap="round"
              />
            ) : (
              <motion.path
                d={LINE_PATH}
                stroke={`url(#line-${gradId})`}
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 }}
              />
            )}

            {reduceMotion || done ? (
              <circle cx="400" cy="14" r="5" fill={accent.lineTo} />
            ) : (
              <motion.circle
                cx="400"
                cy="14"
                r="5"
                fill={accent.lineTo}
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.4, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 0.8 }}
              />
            )}
          </svg>

          <span
            className={`absolute -top-2 right-0 rounded-full border px-2.5 py-0.5 text-[9px] font-bold tracking-[0.16em] sm:text-[10px] ${accent.badgeChip}`}
          >
            {done ? 'COMPLETADO' : accent.badge}
          </span>
        </div>

        {/* Porcentaje */}
        <div className="mb-2 flex items-end gap-2">
          <motion.span
            className={`bg-clip-text text-4xl font-black tabular-nums text-transparent sm:text-5xl ${accent.numberText}`}
            animate={reduceMotion ? undefined : { scale: done ? [1, 1.06, 1] : 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {numero}%
          </motion.span>
          <span className="pb-1 text-[10px] font-medium uppercase tracking-widest text-white/35 sm:pb-1.5 sm:text-xs">
            {done ? 'listo' : 'generando'}
          </span>
        </div>

        {title && (
          <h2 className="mb-1 text-balance text-center text-base font-semibold text-white sm:text-lg">
            {title}
          </h2>
        )}

        {subtitle && (
          <p className="mb-4 max-w-md text-center text-xs text-white/45 sm:text-sm">{subtitle}</p>
        )}

        {/* Micro-copy rotativo por módulo */}
        <p className="mb-6 h-5 max-w-md text-center text-xs text-white/35 sm:mb-8 sm:text-sm">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={hint}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.35 }}
              className="inline-block"
            >
              {hint}
            </motion.span>
          </AnimatePresence>
        </p>

        {/* Barra de progreso */}
        <div
          className="mb-6 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/[0.07] sm:mb-8"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={numero}
          aria-label="Progreso del análisis"
        >
          <motion.div
            className={`h-full rounded-full ${accent.bar} ${done ? accent.barGlow : ''}`}
            initial={false}
            animate={{ width: `${progreso}%` }}
            transition={{ ease: 'easeOut', duration: reduceMotion ? 0 : done ? 0.5 : 0.8 }}
          />
        </div>

        {/* Checklist de etapas */}
        {total > 0 && (
          <ol className="w-full max-w-md space-y-2 sm:space-y-2.5">
            {lista.map((s, i) => {
              const stepDone = i < pasoActivo;
              const activa = i === pasoActivo;
              return (
                <li
                  key={`${s.label}-${i}`}
                  aria-current={activa ? 'step' : undefined}
                  className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-xs transition-colors duration-500 sm:px-4 sm:text-sm ${
                    stepDone
                      ? accent.done
                      : activa
                        ? accent.active
                        : 'border-white/[0.07] bg-white/[0.02] text-white/35'
                  }`}
                >
                  {stepDone ? (
                    <svg
                      className={`h-4 w-4 shrink-0 ${accent.check}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : activa ? (
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${reduceMotion ? '' : 'animate-pulse'} ${accent.dot}`}
                    />
                  ) : (
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-white/20" />
                  )}

                  {s.icon && <span className="shrink-0">{s.icon}</span>}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.label}</span>
                    {s.sub && <span className="block truncate text-[11px] opacity-70">{s.sub}</span>}
                  </span>

                  <span className="sr-only">
                    {stepDone ? 'completado' : activa ? 'en curso' : 'pendiente'}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {/* Pie: tiempo transcurrido + nota */}
        <p className="mt-6 text-center text-[11px] text-white/30 sm:mt-8 sm:text-xs">
          <span className="tabular-nums">{formatElapsed(segundos)}</span>
          {' · '}
          {done
            ? 'Análisis completado'
            : (footnote ?? 'Suele tardar 30–60 s · también te avisamos por email cuando termine')}
        </p>
      </div>
    </div>
  );
}

export default AnalysisLoader;