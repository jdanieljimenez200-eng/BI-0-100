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
  RotateCcw,
  Users,
  ArrowRight,
} from 'lucide-react';
import Net0StoriesBar from '@/components/net0/Net0StoriesBar';
import Net0ViewToggle from '@/components/net0/Net0ViewToggle';
import Net0GridCard from '@/components/net0/Net0GridCard';
import Net0ReelCard from '@/components/net0/Net0ReelCard';
import {
  listarExpertos,
  CATEGORIAS,
  NOMBRE_CATEGORIA,
  type CategoriaExperto,
  type ExpertoPublico,
} from '@/lib/network';
import { ENTRADA_SEGURA, MOTION_SPRINGS } from '@/lib/motion/tokens';

const POR_PAGINA = 12;
const VISTA_STORAGE_KEY = 'net0_vista_preferida';

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

  const [vista, setVista] = useState<'grid' | 'feed'>('grid');
  const [expertos, setExpertos] = useState<ExpertoPublico[]>([]);
  const [promocionados, setPromocionados] = useState<ExpertoPublico[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Leer vista guardada en localStorage al montar
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(VISTA_STORAGE_KEY);
      if (guardada === 'grid' || guardada === 'feed') {
        setVista(guardada);
      }
    } catch {
      // Ignorar errores en navegadores restrictivos
    }
  }, []);

  const cambiarVista = (nuevaVista: 'grid' | 'feed') => {
    setVista(nuevaVista);
    try {
      localStorage.setItem(VISTA_STORAGE_KEY, nuevaVista);
    } catch {
      // Ignorar
    }
  };

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
    router.replace(cadena ? `/net0?${cadena}` : '/net0', { scroll: false });
  }, [categoria, ciudad, busqueda, router]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="w-full space-y-6 sm:space-y-8 pb-16">
      {/* ── 1. Encabezado Maestro Studio Dark ── */}
      <motion.div
        {...ENTRADA_SEGURA}
        initial={shouldReduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOTION_SPRINGS.gentle}
        className="rounded-3xl border border-white/[0.08] bg-[#141416] p-6 sm:p-8 lg:p-9 shadow-sm"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-sans font-medium tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Red de Profesiones, Oficios y Consultores Verificados</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-black tracking-tight text-white leading-tight">
              Net0 <span className="text-zinc-600 font-light">·</span> Directorio
            </h1>

            <p className="text-zinc-400 text-xs sm:text-sm font-sans font-normal leading-relaxed">
              Descubre y contrata directamente abogados, contadores, carpinteros, plomeros, diseñadores, técnicos y consultores. Acuerdos directos vía WhatsApp sin comisiones intermedias.
            </p>
          </div>

          {/* Acciones principales de Net0 */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <Link
              href="/net0/registro"
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-sans font-semibold text-[#0A0A0C] bg-white hover:bg-zinc-200 active:scale-95 transition-all shadow-sm whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#0A0A0C]" />
              <span>Ofrecer mis servicios</span>
            </Link>

            <Link
              href="/net0/mis-fichas"
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-sans font-medium text-white/80 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 active:scale-95 transition-all whitespace-nowrap cursor-pointer"
            >
              <User className="w-4 h-4 text-zinc-400" />
              <span>Mis perfiles</span>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ── 2. Barra de Historias / Highlights Estilo Instagram ── */}
      <motion.div
        {...ENTRADA_SEGURA}
        initial={shouldReduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...MOTION_SPRINGS.gentle, delay: 0.05 }}
      >
        <Net0StoriesBar
          categoriaSeleccionada={categoria}
          onSeleccionarCategoria={(cat) => {
            setCategoria(cat);
            setPagina(1);
          }}
          destacados={promocionados}
        />
      </motion.div>

      {/* ── 3. Barra de Búsqueda y Selector de Vista ── */}
      <motion.div
        {...ENTRADA_SEGURA}
        initial={shouldReduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...MOTION_SPRINGS.gentle, delay: 0.08 }}
        className="rounded-2xl border border-white/[0.08] bg-[#141416] p-3.5 sm:p-4 shadow-sm space-y-3"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Formulario de búsqueda */}
          <form
            className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2"
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
                placeholder="Buscar por oficio, nombre, rubro…"
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
              className="h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white font-sans font-semibold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center"
            >
              Buscar
            </button>
          </form>

          {/* Selector de Vista (Mosaico vs Feed) */}
          <Net0ViewToggle vista={vista} onCambiarVista={cambiarVista} />
        </div>

        {/* Indicador de categoría activa con opción de limpiar */}
        {categoria && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-zinc-500 text-xs font-sans">Filtrando por:</span>
            <button
              type="button"
              onClick={() => {
                setCategoria('');
                setPagina(1);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sans font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              <span>{NOMBRE_CATEGORIA[categoria]}</span>
              <span className="text-[10px] text-emerald-400/60 font-bold">✕</span>
            </button>
          </div>
        )}
      </motion.div>

      {/* ── 4. Resultados del Directorio ── */}
      <motion.div
        {...ENTRADA_SEGURA}
        initial={shouldReduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...MOTION_SPRINGS.gentle, delay: 0.12 }}
      >
        {cargando ? (
          <div className="rounded-3xl border border-white/[0.08] bg-[#141416] p-16 text-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto" />
            <p className="text-zinc-400 text-xs sm:text-sm font-sans">
              Cargando catálogo de profesionales y oficios Net0…
            </p>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-10 text-center space-y-3">
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
          <div className="rounded-3xl border border-white/[0.08] bg-[#141416] p-12 text-center max-w-xl mx-auto space-y-4">
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
                href="/net0/registro"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#0A0A0C] font-sans font-bold text-xs sm:text-sm hover:bg-zinc-200 transition-all shadow-md"
              >
                <span>Publicar mi ficha en Net0</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Contador de resultados */}
            <div className="flex items-center justify-between text-xs text-zinc-400 font-sans px-1">
              <span>
                {total} {total === 1 ? 'perfil disponible' : 'perfiles disponibles'}
                {categoria ? ` en ${NOMBRE_CATEGORIA[categoria]}` : ''}
              </span>
            </div>

            {/* ── Renderizado según el Modo de Vista ── */}
            {vista === 'grid' ? (
              /* Mosaico Explore (Instagram) */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* Promocionados primero */}
                {promocionados.map((e) => (
                  <Net0GridCard key={e.id} experto={e} />
                ))}
                {/* Orgánicos */}
                {expertos.map((e) => (
                  <Net0GridCard key={e.id} experto={e} />
                ))}
              </div>
            ) : (
              /* Feed Inmersivo (TikTok / Reels) */
              <div className="space-y-6 max-w-xl mx-auto">
                {/* Promocionados primero */}
                {promocionados.map((e) => (
                  <Net0ReelCard key={e.id} experto={e} />
                ))}
                {/* Orgánicos */}
                {expertos.map((e) => (
                  <Net0ReelCard key={e.id} experto={e} />
                ))}
              </div>
            )}

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
