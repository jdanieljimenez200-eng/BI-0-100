'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Clock, Plus, type LucideIcon } from 'lucide-react';

import api from '@/lib/api';
import { MODULE_THEME, hexARgbTriplete, type ModuloSlug } from '@/lib/moduleTheme';
import { MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motion/tokens';

/* ────────────────────────────────────────────────────────────────────────────
   Tipos — contrato de GET /dashboard/resumen (backend/src/routes/dashboard.ts)
   ────────────────────────────────────────────────────────────────────────── */

export type { ModuloSlug };

type EstadoAnalisis = 'procesando' | 'completado' | 'error';

export interface AnalisisSnap {
  id: string;
  estado: EstadoAnalisis;
  created_at?: string;
}

export interface ProductoResumen {
  id: string;
  nombre: string;
  categoria: string;
  /* El backend devuelve una clave por módulo; puede faltar si aún no existe. */
  analisis?: Partial<Record<ModuloSlug, AnalisisSnap | null>>;
}

/* Un producto sin análisis se agrupa como "pendiente" */
type GrupoKey = 'completado' | 'procesando' | 'error' | 'pendiente';

interface Fila {
  producto: ProductoResumen;
  analisis: AnalisisSnap | null;
  grupo: GrupoKey;
}

export interface ModuloIndexProps {
  /** Clave del módulo dentro de `producto.analisis` y segmento de la URL. */
  slug: ModuloSlug;
  /** Icono del módulo (ver components/ui/ModuleIcons). */
  Icono: (props: { className?: string }) => ReactElement;
  /** Título visible. Por defecto, el de `MODULE_THEME[slug]`. */
  titulo?: string;
  /** Subtítulo descriptivo. Por defecto, el de `MODULE_THEME[slug]`. */
  descripcion?: string;
  /** Acento #RRGGBB. Por defecto, el del módulo en `MODULE_THEME`. */
  hex?: string;
  /**
   * Nombre del análisis en minúscula y masculino, usado dentro de frases:
   * "análisis de mercado", "análisis financiero", "análisis legal"...
   * Por defecto, el de `MODULE_THEME[slug]`.
   */
  nombreAnalisis?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   Constantes de diseño
   ────────────────────────────────────────────────────────────────────────── */

const EASE_OUT = MOTION_EASINGS.easeOutQuart;

const ORDEN_GRUPOS: GrupoKey[] = ['completado', 'procesando', 'error', 'pendiente'];

/**
 * Escala tipográfica de la pantalla. Existe para que no vuelvan a convivir
 * quince tamaños distintos (`text-[11.5px]`, `text-[13.5px]`…): cada rol de
 * texto tiene un único tamaño y todas las pantallas de módulo se leen igual.
 */
const TIPO = {
  /** Antetítulo en versalitas: "MÓDULO", "RESUMEN PREVIO". */
  kicker: 'text-[10px] font-semibold uppercase tracking-[0.22em]',
  /** Metadatos y texto de apoyo. */
  meta: 'text-xs',
  /** Cuerpo por defecto. */
  cuerpo: 'text-sm',
  /** Título de fila o tarjeta. */
  titulo: 'text-sm font-medium tracking-[-0.01em]',
  /** Encabezado de la pantalla. */
  h1: 'text-3xl font-semibold leading-tight tracking-[-0.02em]',
  /** Cifra de una métrica. */
  cifra: 'text-2xl font-semibold leading-none tracking-[-0.02em] tabular-nums',
  /** Cifra protagonista (cobertura). */
  cifraHero: 'text-4xl font-semibold leading-none tracking-[-0.03em] tabular-nums',
} as const;

interface GrupoMeta {
  label: string;
  ayuda: string;
  hex: string;
  accion: string;
}

/**
 * El grupo "completado" adopta el acento del módulo: por eso la barra de
 * cobertura se ve morada en Legal, cian en Mercado, etc. Los demás grupos
 * conservan su color semántico para que "en proceso" (azul) y "con
 * incidencias" (rojo) sigan leyéndose igual en todos los módulos.
 */
function construirMeta(nombreAnalisis: string, acento: string): Record<GrupoKey, GrupoMeta> {
  return {
    completado: {
      label: 'Listos para revisar',
      ayuda: 'Análisis finalizados, con resultados disponibles',
      hex: acento,
      accion: 'Ver resultados',
    },
    procesando: {
      label: 'En proceso',
      ayuda: 'Cada análisis tarda entre 2 y 3 minutos',
      hex: '#60A5FA',
      accion: 'Seguir progreso',
    },
    error: {
      label: 'Con incidencias',
      ayuda: 'No consumen cuota: puedes relanzarlos sin coste',
      hex: '#F87171',
      accion: 'Ver detalle',
    },
    pendiente: {
      label: 'Sin analizar',
      ayuda: `Productos que todavía no tienen ${nombreAnalisis}`,
      hex: '#94A3B8',
      accion: `Lanzar ${nombreAnalisis}`,
    },
  };
}

const GRUPO_ICONO: Record<GrupoKey, LucideIcon> = {
  completado: Check,
  procesando: Clock,
  error: AlertTriangle,
  pendiente: Plus,
};

/* ────────────────────────────────────────────────────────────────────────────
   Utilidades puras
   ────────────────────────────────────────────────────────────────────────── */

function normalizarEstado(estado: string | undefined): EstadoAnalisis {
  if (estado === 'completado' || estado === 'error') return estado;
  return 'procesando';
}

function construirFilas(productos: ProductoResumen[], slug: ModuloSlug): Fila[] {
  return productos.map((producto) => {
    const analisis = producto.analisis?.[slug] ?? null;
    if (!analisis) return { producto, analisis: null, grupo: 'pendiente' };
    return { producto, analisis, grupo: normalizarEstado(analisis.estado) };
  });
}

function agrupar(filas: Fila[]): Record<GrupoKey, Fila[]> {
  const base: Record<GrupoKey, Fila[]> = {
    completado: [],
    procesando: [],
    error: [],
    pendiente: [],
  };
  for (const fila of filas) base[fila.grupo].push(fila);
  return base;
}

function destinoDe(fila: Fila, slug: ModuloSlug): string {
  const { producto, analisis, grupo } = fila;
  if (grupo === 'completado' && analisis) {
    return `/dashboard/${slug}/${producto.id}/resultado/${analisis.id}`;
  }
  return `/dashboard/${slug}/${producto.id}`;
}

function formatearFecha(iso: string | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(fecha);
}

/** Cuadro de icono teñido con el color de un grupo o del módulo. */
function estiloTinte(hex: string) {
  return {
    color: hex,
    backgroundColor: `${hex}1A`,
    borderColor: `${hex}2E`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Variants de movimiento
   ────────────────────────────────────────────────────────────────────────── */

const listaVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const filaVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATIONS.deliberate, ease: EASE_OUT } },
};

/* ────────────────────────────────────────────────────────────────────────────
   Pantalla índice de módulo (compartida por mercado, marketing, ventas,
   finanzas y legal)
   ────────────────────────────────────────────────────────────────────────── */

export function ModuloIndex({
  slug,
  Icono,
  titulo,
  descripcion,
  hex,
  nombreAnalisis,
}: ModuloIndexProps): ReactElement {
  const router = useRouter();
  const reduce = useReducedMotion();

  /* Tema del módulo; los props siguen ganando si se pasan explícitamente. */
  const tema = MODULE_THEME[slug];
  const acento = hex ?? tema.hex;
  const tituloFinal = titulo ?? tema.titulo;
  const descripcionFinal = descripcion ?? tema.descripcion;
  const nombre = nombreAnalisis ?? tema.nombreAnalisis;
  const rgbAcento = useMemo(() => hexARgbTriplete(acento), [acento]);

  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<GrupoKey[]>([]);

  const meta = useMemo(() => construirMeta(nombre, acento), [nombre, acento]);

  useEffect(() => {
    let activo = true;

    api
      .get('/dashboard/resumen')
      .then(({ data }) => {
        if (!activo) return;
        const lista: ProductoResumen[] = Array.isArray(data?.productos) ? data.productos : [];
        setProductos(lista);

        // Abrimos por defecto el primer grupo con contenido: el usuario ve el
        // desglose sin tener que interactuar, pero sin ruido visual.
        const grupos = agrupar(construirFilas(lista, slug));
        const primero = ORDEN_GRUPOS.find((key) => grupos[key].length > 0);
        setAbiertos(primero ? [primero] : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!activo) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          router.push('/auth/login');
          return;
        }
        setError('No hemos podido cargar tu resumen. Vuelve a intentarlo en unos segundos.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [router, slug]);

  const filas = useMemo(() => construirFilas(productos, slug), [productos, slug]);
  const grupos = useMemo(() => agrupar(filas), [filas]);

  const total = filas.length;
  const completados = grupos.completado.length;
  const cobertura = total > 0 ? Math.round((completados / total) * 100) : 0;

  const metricas = useMemo(
    () =>
      [
        { key: 'completado' as GrupoKey, valor: grupos.completado.length },
        { key: 'procesando' as GrupoKey, valor: grupos.procesando.length },
        { key: 'error' as GrupoKey, valor: grupos.error.length },
        { key: 'pendiente' as GrupoKey, valor: grupos.pendiente.length },
      ],
    [grupos],
  );

  const toggleGrupo = (key: GrupoKey) => {
    setAbiertos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const expandirTodo = () => {
    const conContenido = ORDEN_GRUPOS.filter((key) => grupos[key].length > 0);
    setAbiertos((prev) => (prev.length === conContenido.length ? [] : conContenido));
  };

  const todoExpandido =
    abiertos.length > 0 && abiertos.length === ORDEN_GRUPOS.filter((k) => grupos[k].length > 0).length;

  return (
    <div className="mod-scope space-y-10" style={{ '--mod-rgb': rgbAcento } as CSSProperties}>
      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATIONS.slow, ease: EASE_OUT }}
        className="space-y-4"
      >
        <Link
          href="/dashboard"
          className={`inline-flex items-center gap-1.5 rounded-pill text-zinc-500 transition-colors duration-200 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${TIPO.meta}`}
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          Dashboard
        </Link>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-control border"
              style={estiloTinte(acento)}
            >
              <Icono className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1.5">
              <p className={TIPO.kicker} style={{ color: `${acento}B3` }}>
                Módulo
              </p>
              <h1 className={`${TIPO.h1} text-white`}>{tituloFinal}</h1>
              <p className={`max-w-xl leading-relaxed text-zinc-400 ${TIPO.cuerpo}`}>
                {descripcionFinal}
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/nuevo"
            className={`inline-flex shrink-0 items-center gap-2 self-start rounded-pill border border-white/10 bg-white/[0.04] px-5 py-2.5 font-medium text-zinc-300 backdrop-blur-xl transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 sm:self-auto ${TIPO.meta}`}
          >
            <Plus size={14} strokeWidth={2} />
            Nuevo producto
          </Link>
        </div>
      </motion.header>

      {/* ── Estado de carga ─────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="pd-skeleton mod-skeleton h-[188px] rounded-surface" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="pd-skeleton mod-skeleton h-[68px] rounded-control" />
            ))}
          </div>
          <span className="sr-only">Cargando resumen de {nombre}</span>
        </div>
      )}

      {/* ── Error de carga ──────────────────────────────────────────────── */}
      {!loading && error && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION_DURATIONS.deliberate, ease: EASE_OUT }}
          role="alert"
          className="rounded-surface border border-brand-accent/20 bg-brand-accent/[0.06] p-8 text-center"
        >
          <p className={`text-white ${TIPO.titulo}`}>Algo se ha interrumpido</p>
          <p className={`mx-auto mt-2 max-w-sm leading-relaxed text-zinc-400 ${TIPO.cuerpo}`}>{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`mt-5 inline-flex items-center gap-2 rounded-pill bg-brand-accent px-5 py-2.5 font-semibold text-white transition-all duration-200 hover:bg-[#EF5A4A] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${TIPO.meta}`}
          >
            Reintentar
          </button>
        </motion.div>
      )}

      {/* ── Sin productos ───────────────────────────────────────────────── */}
      {!loading && !error && total === 0 && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION_DURATIONS.slow, ease: EASE_OUT }}
          className="rounded-surface border border-white/[0.07] bg-white/[0.02] p-12 text-center backdrop-blur-xl"
        >
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-control border"
            style={estiloTinte(acento)}
          >
            <Icono className="h-5 w-5" />
          </span>
          <p className="mt-5 text-base font-medium text-white">Todavía no hay productos</p>
          <p className={`mx-auto mt-2 max-w-sm leading-relaxed text-zinc-400 ${TIPO.cuerpo}`}>
            Crea tu primer producto para lanzar un {nombre}.
          </p>
          <Link
            href="/dashboard/nuevo"
            className={`mt-6 inline-flex items-center gap-2 rounded-pill px-6 py-3 font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${TIPO.cuerpo}`}
            style={{
              backgroundColor: acento,
              color: '#06101A',
              boxShadow: `0 10px 30px -12px rgb(${rgbAcento} / 0.6)`,
            }}
          >
            <Plus size={14} strokeWidth={2} />
            Crear producto
          </Link>
        </motion.div>
      )}

      {/* ── Resumen previo + desglose plegable ──────────────────────────── */}
      {!loading && !error && total > 0 && (
        <>
          {/* Panel de resumen */}
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION_DURATIONS.slow, ease: EASE_OUT, delay: reduce ? 0 : 0.08 }}
            aria-labelledby="resumen-titulo"
            className="pd-hero relative overflow-hidden rounded-surface p-6 sm:p-7"
          >
            <div className="mod-glow" aria-hidden="true" />

            <div className="relative space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div className="space-y-1.5">
                  <h2 id="resumen-titulo" className={`${TIPO.kicker} text-zinc-500`}>
                    Resumen previo
                  </h2>
                  <p className={`leading-relaxed text-zinc-400 ${TIPO.cuerpo}`}>
                    {completados > 0
                      ? `${completados} de ${total} ${total === 1 ? 'producto' : 'productos'} con ${nombre} listo.`
                      : `Ninguno de tus ${total} ${total === 1 ? 'producto' : 'productos'} tiene el ${nombre} terminado todavía.`}
                  </p>
                </div>

                <div className="flex items-baseline gap-2">
                  <motion.span
                    key={cobertura}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: MOTION_DURATIONS.slow, ease: EASE_OUT }}
                    className={`${TIPO.cifraHero} text-white`}
                  >
                    {cobertura}
                    <span className="text-xl text-zinc-500">%</span>
                  </motion.span>
                  <span className="pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                    Cobertura
                  </span>
                </div>
              </div>

              {/* Barra segmentada */}
              <div
                className="flex h-1.5 w-full gap-1 overflow-hidden rounded-pill bg-white/[0.06]"
                role="img"
                aria-label={`Cobertura de ${nombre}: ${cobertura} por ciento completado`}
              >
                {ORDEN_GRUPOS.map((key) => {
                  const cantidad = grupos[key].length;
                  if (cantidad === 0) return null;
                  return (
                    <motion.span
                      key={key}
                      initial={reduce ? { width: `${(cantidad / total) * 100}%` } : { width: 0 }}
                      animate={{ width: `${(cantidad / total) * 100}%` }}
                      transition={{ duration: reduce ? 0 : 0.9, ease: EASE_OUT, delay: reduce ? 0 : 0.2 }}
                      className="h-full rounded-pill"
                      style={{ backgroundColor: meta[key].hex, opacity: key === 'pendiente' ? 0.42 : 0.9 }}
                    />
                  );
                })}
              </div>

              {/* Métricas desglosadas */}
              <motion.ul
                variants={reduce ? undefined : listaVariants}
                initial={reduce ? false : 'hidden'}
                animate="visible"
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
              >
                {metricas.map(({ key, valor }) => {
                  const item = meta[key];
                  const IconoGrupo = GRUPO_ICONO[key];
                  return (
                    <motion.li
                      key={key}
                      variants={reduce ? undefined : filaVariants}
                      className="rounded-control border border-white/[0.06] bg-white/[0.02] p-4"
                    >
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-lg border"
                        style={estiloTinte(item.hex)}
                      >
                        <IconoGrupo size={14} strokeWidth={1.9} />
                      </span>
                      <p className={`mt-3 ${TIPO.cifra} text-white`}>{valor}</p>
                      <p className={`mt-1.5 leading-snug text-zinc-500 ${TIPO.meta}`}>{item.label}</p>
                    </motion.li>
                  );
                })}
              </motion.ul>
            </div>
          </motion.section>

          {/* Desglose plegable */}
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION_DURATIONS.slow, ease: EASE_OUT, delay: reduce ? 0 : 0.16 }}
            aria-labelledby="desglose-titulo"
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-4 px-1">
              <h2 id="desglose-titulo" className={`${TIPO.kicker} text-zinc-500`}>
                Desglose por estado
              </h2>
              <button
                type="button"
                onClick={expandirTodo}
                className={`rounded-pill px-2.5 py-1 text-zinc-500 transition-colors duration-200 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${TIPO.meta}`}
              >
                {todoExpandido ? 'Contraer todo' : 'Expandir todo'}
              </button>
            </div>

            <div className="space-y-3">
              {ORDEN_GRUPOS.map((key) => {
                const items = grupos[key];
                if (items.length === 0) return null;

                const item = meta[key];
                const IconoGrupo = GRUPO_ICONO[key];
                const abierto = abiertos.includes(key);
                const panelId = `panel-${key}`;
                const botonId = `boton-${key}`;

                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-surface border border-white/[0.07] bg-white/[0.018] backdrop-blur-xl transition-colors duration-500"
                    style={abierto ? { borderColor: `${item.hex}26` } : undefined}
                  >
                    <h3>
                      <button
                        type="button"
                        id={botonId}
                        aria-expanded={abierto}
                        aria-controls={panelId}
                        onClick={() => toggleGrupo(key)}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                          style={estiloTinte(item.hex)}
                        >
                          <IconoGrupo size={14} strokeWidth={1.9} />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={`truncate text-white ${TIPO.titulo}`}>{item.label}</span>
                            <span
                              className="shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                              style={{ color: item.hex, backgroundColor: `${item.hex}1F` }}
                            >
                              {items.length}
                            </span>
                          </span>
                          <span className={`mt-0.5 block truncate text-zinc-500 ${TIPO.meta}`}>
                            {item.ayuda}
                          </span>
                        </span>

                        <motion.span
                          animate={{ rotate: abierto ? 90 : 0 }}
                          transition={{ duration: reduce ? 0 : MOTION_DURATIONS.deliberate, ease: EASE_OUT }}
                          className="shrink-0 text-zinc-600"
                        >
                          <ChevronRight size={16} strokeWidth={1.9} />
                        </motion.span>
                      </button>
                    </h3>

                    <AnimatePresence initial={false}>
                      {abierto && (
                        <motion.div
                          key="panel"
                          id={panelId}
                          role="region"
                          aria-labelledby={botonId}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: reduce ? 0 : MOTION_DURATIONS.deliberate,
                            ease: EASE_OUT,
                            opacity: { duration: reduce ? 0 : MOTION_DURATIONS.base },
                          }}
                          className="overflow-hidden"
                        >
                          <motion.ul
                            variants={reduce ? undefined : listaVariants}
                            initial={reduce ? false : 'hidden'}
                            animate="visible"
                            className="space-y-2 px-3 pb-3 pt-1"
                          >
                            {items.map((fila) => {
                              const fecha = formatearFecha(fila.analisis?.created_at);
                              return (
                                <motion.li key={fila.producto.id} variants={reduce ? undefined : filaVariants}>
                                  <Link
                                    href={destinoDe(fila, slug)}
                                    className="group flex items-center gap-4 rounded-control border border-white/[0.05] bg-white/[0.012] px-4 py-3.5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.045] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                                  >
                                    <span
                                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor: item.hex,
                                        opacity: key === 'pendiente' ? 0.5 : 1,
                                      }}
                                      aria-hidden="true"
                                    />

                                    <span className="min-w-0 flex-1">
                                      <span
                                        className={`block truncate text-zinc-100 transition-colors duration-200 group-hover:text-white ${TIPO.titulo}`}
                                      >
                                        {fila.producto.nombre}
                                      </span>
                                      <span className={`mt-0.5 block truncate text-zinc-500 ${TIPO.meta}`}>
                                        {fila.producto.categoria}
                                        {fecha ? ` · ${fecha}` : ''}
                                      </span>
                                    </span>

                                    <span
                                      className={`hidden shrink-0 items-center gap-1.5 text-zinc-500 transition-colors duration-200 group-hover:text-zinc-300 sm:flex ${TIPO.meta}`}
                                    >
                                      {item.accion}
                                      <ChevronRight
                                        size={12}
                                        strokeWidth={1.9}
                                        className="transition-transform duration-200 group-hover:translate-x-0.5"
                                      />
                                    </span>
                                    <ChevronRight
                                      size={14}
                                      strokeWidth={1.9}
                                      className="shrink-0 text-zinc-600 sm:hidden"
                                    />
                                  </Link>
                                </motion.li>
                              );
                            })}
                          </motion.ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.section>
        </>
      )}
    </div>
  );
}

export default ModuloIndex;
