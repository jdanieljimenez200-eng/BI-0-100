'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Search,
  MapPin,
  Plus,
  User,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Briefcase,
  Users,
} from 'lucide-react';
import ExpertoCard from '@/components/network/ExpertoCard';
import {
  listarExpertos,
  CATEGORIAS,
  NOMBRE_CATEGORIA,
  type CategoriaExperto,
  type ExpertoPublico,
} from '@/lib/network';
import { ENTRADA_SEGURA, MOTION_SPRINGS } from '@/lib/motion/tokens';

const POR_PAGINA = 12;

function esCategoria(v: string | null): v is CategoriaExperto {
  return CATEGORIAS.includes(v as CategoriaExperto);
}

function DirectorioNet0Content() {
  const router = useRouter();
  const params = useSearchParams();
  const shouldReduce = useReducedMotion();

  const categoriaUrl = params.get('categoria');
  const [categoria, setCategoria] = useState<CategoriaExperto | ''>(
    esCategoria(categoriaUrl) ? categoriaUrl : ''
  );
  const [ciudad, setCiudad] = useState(params.get('ciudad') ?? '');
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const [busqueda, setBusqueda] = useState(params.get('q') ?? '');

  const [expertos, setExpertos] = useState<ExpertoPublico[]>([]);
  const [promocionados, setPromocionados] = useState<ExpertoPublico[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await listarExpertos({
        categoria: categoria || undefined,
        ciudad: ciudad.trim() || undefined,
        q: busqueda.trim() || undefined,
        pagina,
        limite: POR_PAGINA,
      });
      const promo = datos.promocionados ?? [];
      const ids = new Set(promo.map((e) => e.id));
      setPromocionados(promo);
      setExpertos(datos.expertos.filter((e) => !ids.has(e.id)));
      setTotal(datos.total);
    } catch {
      setError('No pudimos cargar el directorio de Net0. Vuelve a intentarlo en un momento.');
      setPromocionados([]);
      setExpertos([]);
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [categoria, ciudad, busqueda, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (categoria) qs.set('categoria', categoria);
    if (ciudad.trim()) qs.set('ciudad', ciudad.trim());
    if (busqueda.trim()) qs.set('q', busqueda.trim());
    const cadena = qs.toString();
    router.replace(cadena ? `/dashboard/net0?${cadena}` : '/dashboard/net0', { scroll: false });
  }, [categoria, ciudad, busqueda, router]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="w-full space-y-8 pb-16">
      {/* ── 1. Encabezado Maestro de Net0 con Transición de Entrada ── */}
      <motion.div
        {...ENTRADA_SEGURA}
        initial={shouldReduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOTION_SPRINGS.gentle}
        className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#131926]/90 via-[#0B101B]/85 to-[#070B12]/90 backdrop-blur-xl p-6 sm:p-8 lg:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/[0.07] rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-red-500/[0.05] rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-sans font-medium tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Red de Profesiones, Oficios y Consultores Verificados</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-extrabold tracking-tight text-white leading-tight">
              Net0 <span className="text-zinc-500 font-light">|</span> Directorio Operativo
            </h1>

            <p className="text-zinc-300/85 text-xs sm:text-sm font-sans font-normal leading-relaxed">
              Abogados, contadores, albañiles, plomeros, diseñadores, técnicos, proveedores y consultores. Contacto directo vía WhatsApp sin intermediarios ni comisiones sobre tus acuerdos.
            </p>
          </div>

          {/* Acciones principales de Net0 */}
          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            <Link
              href="/dashboard/net0/registro"
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-sans font-semibold text-[#070E17] bg-white hover:bg-slate-100 active:scale-95 transition-all shadow-[0_2px_10px_rgba(255,255,255,0.2)] whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#070E17]" />
              <span>Ofrecer mis servicios</span>
            </Link>

            <Link
              href="/dashboard/net0/mis-fichas"
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-sans font-medium text-white/80 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 active:scale-95 transition-all whitespace-nowrap cursor-pointer"
            >
              <User className="w-4 h-4 text-zinc-400" />
              <span>Mis perfiles</span>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ── 2. Barra de Filtros y Búsqueda Interactiva ── */}
      <motion.div
        {...ENTRADA_SEGURA}
        initial={shouldReduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...MOTION_SPRINGS.gentle, delay: 0.05 }}
        className="rounded-2xl border border-white/[0.08] bg-[#090E17]/85 backdrop-blur-xl p-4 sm:p-5 shadow-[0_4px_24px_rgba(0,0,0,0.3)] space-y-4"
      >
        {/* Chips de Categorías */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => {
              setCategoria('');
              setPagina(1);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-sans font-semibold whitespace-nowrap transition-all cursor-pointer ${
              categoria === ''
                ? 'bg-white text-[#070E17] shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06]'
            }`}
          >
            Todas las especialidades
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategoria(c);
                setPagina(1);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-sans font-semibold whitespace-nowrap transition-all cursor-pointer ${
                categoria === c
                  ? 'bg-white text-[#070E17] shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06]'
              }`}
            >
              {NOMBRE_CATEGORIA[c]}
            </button>
          ))}
        </div>

        {/* Input de Búsqueda y Ciudad */}
        <form
          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            setBusqueda(texto);
            setPagina(1);
          }}
        >
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por oficio, nombre, especialidad…"
              className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/15 focus:border-white/30 focus:bg-white/[0.06] text-xs sm:text-sm text-white placeholder-zinc-500 outline-none transition-all font-sans"
            />
          </div>

          <div className="relative">
            <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={ciudad}
              onChange={(e) => {
                setCiudad(e.target.value);
                setPagina(1);
              }}
              placeholder="Ciudad o territorio…"
              className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/15 focus:border-white/30 focus:bg-white/[0.06] text-xs sm:text-sm text-white placeholder-zinc-500 outline-none transition-all font-sans"
            />
          </div>

          <button
            type="submit"
            className="h-10 px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white font-sans font-semibold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Buscar</span>
          </button>
        </form>
      </motion.div>

      {/* ── 3. Resultados y Fichas con Animación Stagger ── */}
      <motion.div
        {...ENTRADA_SEGURA}
        initial={shouldReduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...MOTION_SPRINGS.gentle, delay: 0.1 }}
      >
        {cargando ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-16 text-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto" />
            <p className="text-zinc-400 text-xs sm:text-sm font-sans">
              Cargando directorio de profesionales y oficios Net0…
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-10 text-center space-y-3">
            <p className="text-rose-300 text-sm font-sans font-medium">{error}</p>
            <button
              type="button"
              onClick={cargar}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/15 text-white/80 hover:text-white text-xs font-sans font-semibold hover:bg-white/5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reintentar</span>
            </button>
          </div>
        ) : expertos.length === 0 && promocionados.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center max-w-xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mx-auto text-zinc-400">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-white font-sans font-bold text-base sm:text-lg">
              No se encontraron fichas coincidentes
            </h3>
            <p className="text-zinc-400 text-xs sm:text-sm font-sans leading-relaxed">
              {busqueda || ciudad || categoria
                ? 'Ningún perfil aprobado coincide con los criterios de búsqueda. Intenta limpiar los filtros o ampliar la ciudad.'
                : 'La red Net0 se encuentra abierta para postulaciones. Registra tu perfil profesional o de oficio para comenzar a recibir solicitudes directas.'}
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/net0/registro"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-sans font-bold text-xs sm:text-sm hover:bg-slate-100 transition-all shadow-md"
              >
                <span>Publicar mi ficha en Net0</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Destacados / Promocionados */}
            {promocionados.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-300/80 text-xs font-sans font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Profesionales destacados{ciudad.trim() ? ` en ${ciudad.trim()}` : ''}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {promocionados.map((e) => (
                    <ExpertoCard key={e.id} experto={e} basePath="/dashboard/net0" />
                  ))}
                </div>
              </div>
            )}

            {/* Contador y lista orgánica */}
            <div className="flex items-center justify-between text-xs text-zinc-400 font-sans px-1">
              <span>
                {total} {total === 1 ? 'perfil registrado' : 'perfiles registrados'}
                {categoria ? ` en ${NOMBRE_CATEGORIA[categoria]}` : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {expertos.map((e) => (
                <ExpertoCard key={e.id} experto={e} basePath="/dashboard/net0" />
              ))}
            </div>

            {/* Paginación */}
            {paginas > 1 && (
              <div className="flex items-center justify-center gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  className="px-4 py-2 rounded-xl border border-white/10 text-xs font-sans font-medium text-white/70 disabled:opacity-30 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Anterior
                </button>
                <span className="text-zinc-400 text-xs font-sans">
                  Página {pagina} de {paginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
                  disabled={pagina >= paginas}
                  className="px-4 py-2 rounded-xl border border-white/10 text-xs font-sans font-medium text-white/70 disabled:opacity-30 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function DirectorioNet0Page() {
  return (
    <Suspense
      fallback={
        <div className="w-full py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          <span className="text-xs font-sans">Cargando Net0…</span>
        </div>
      }
    >
      <DirectorioNet0Content />
    </Suspense>
  );
}
