'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import ExpertoCard from '@/components/network/ExpertoCard';
import {
  listarExpertos,
  CATEGORIAS,
  NOMBRE_CATEGORIA,
  type CategoriaExperto,
  type ExpertoPublico,
} from '@/lib/network';

const POR_PAGINA = 12;

function esCategoria(v: string | null): v is CategoriaExperto {
  return CATEGORIAS.includes(v as CategoriaExperto);
}

function DirectorioNetworkContent() {
  const router = useRouter();
  const params = useSearchParams();

  const categoriaUrl = params.get('categoria');
  const [categoria, setCategoria] = useState<CategoriaExperto | ''>(
    esCategoria(categoriaUrl) ? categoriaUrl : ''
  );
  const [ciudad, setCiudad] = useState(params.get('ciudad') ?? '');
  const [texto, setTexto] = useState(params.get('q') ?? '');
  /** Lo que se ha enviado de verdad al backend; `texto` es lo que se escribe. */
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
      // Un impulsado ya sale arriba etiquetado: no se repite en la lista orgánica.
      const promo = datos.promocionados ?? [];
      const ids = new Set(promo.map((e) => e.id));
      setPromocionados(promo);
      setExpertos(datos.expertos.filter((e) => !ids.has(e.id)));
      setTotal(datos.total);
    } catch {
      setError('No pudimos cargar el directorio. Vuelve a intentarlo en un momento.');
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

  /** Refleja los filtros en la URL para que el enlace se pueda compartir. */
  useEffect(() => {
    const qs = new URLSearchParams();
    if (categoria) qs.set('categoria', categoria);
    if (ciudad.trim()) qs.set('ciudad', ciudad.trim());
    if (busqueda.trim()) qs.set('q', busqueda.trim());
    const cadena = qs.toString();
    router.replace(cadena ? `/network?${cadena}` : '/network', { scroll: false });
  }, [categoria, ciudad, busqueda, router]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <main className="min-h-screen bg-[#070E17] text-white">
      <Navbar />

      <section className="pt-32 pb-10 px-6">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">
            0 a 100 Network
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Directorio de expertos
          </h1>
          <p className="text-white/50 max-w-2xl leading-relaxed">
            Abogados, contadores, agencias, diseñadores, proveedores y más, revisados uno a uno
            antes de aparecer aquí. Los contactas directo por WhatsApp: la plataforma no cobra la
            consulta ni interviene en el acuerdo.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/network/registro"
              className="px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90 transition-colors"
            >
              Ofrecer mis servicios
            </Link>
            <Link
              href="/network/mis-fichas"
              className="px-5 py-2.5 rounded-xl border border-white/15 text-white/70 font-semibold text-sm hover:bg-white/5 transition-colors"
            >
              Mi perfil
            </Link>
          </div>
        </div>
      </section>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <section className="px-6 pb-6">
        <div className="max-w-[1200px] mx-auto rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              onClick={() => {
                setCategoria('');
                setPagina(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                categoria === ''
                  ? 'bg-white text-[#070E17]'
                  : 'text-white/50 hover:text-white border border-white/10'
              }`}
            >
              Todas
            </button>
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCategoria(c);
                  setPagina(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  categoria === c
                    ? 'bg-white text-[#070E17]'
                    : 'text-white/50 hover:text-white border border-white/10'
                }`}
              >
                {NOMBRE_CATEGORIA[c]}
              </button>
            ))}
          </div>

          <form
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBusqueda(texto);
              setPagina(1);
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Especialidad, nombre, palabra clave…"
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
            <input
              value={ciudad}
              onChange={(e) => {
                setCiudad(e.target.value);
                setPagina(1);
              }}
              placeholder="Ciudad"
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl border border-white/15 text-white font-bold text-sm hover:bg-white/10 transition-colors"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {/* ── Resultados ──────────────────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-[1200px] mx-auto">
          {cargando ? (
            <p className="text-white/40 text-sm py-12 text-center">Cargando expertos…</p>
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center">
              <p className="text-rose-300 text-sm">{error}</p>
              <button
                onClick={cargar}
                className="mt-4 px-4 py-2 rounded-lg border border-white/15 text-white/70 text-xs font-bold hover:bg-white/5"
              >
                Reintentar
              </button>
            </div>
          ) : expertos.length === 0 && promocionados.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
              <p className="text-white font-bold mb-2">Todavía no hay nadie aquí</p>
              <p className="text-white/40 text-sm max-w-md mx-auto">
                {busqueda || ciudad || categoria
                  ? 'Ningún experto aprobado coincide con esa búsqueda. Prueba a quitar algún filtro.'
                  : 'La red está empezando. Si ofreces servicios a negocios, crea tu perfil y pasa por la revisión.'}
              </p>
              <Link
                href="/network/registro"
                className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90 transition-colors"
              >
                Ofrecer mis servicios
              </Link>
            </div>
          ) : (
            <>
              {promocionados.length > 0 && (
                <div className="mb-8">
                  <p className="text-amber-200/60 text-[11px] font-bold uppercase tracking-widest mb-4">
                    Promocionados{ciudad.trim() ? ` en ${ciudad.trim()}` : ''}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {promocionados.map((e) => (
                      <ExpertoCard key={e.id} experto={e} />
                    ))}
                  </div>
                </div>
              )}
              <p className="text-white/30 text-xs mb-5">
                {total} {total === 1 ? 'experto' : 'expertos'}
                {categoria ? ` en ${NOMBRE_CATEGORIA[categoria]}` : ''}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {expertos.map((e) => (
                  <ExpertoCard key={e.id} experto={e} />
                ))}
              </div>

              {paginas > 1 && (
                <div className="flex items-center justify-center gap-3 mt-10">
                  <button
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={pagina === 1}
                    className="px-4 py-2 rounded-lg border border-white/10 text-xs font-bold text-white/60 disabled:opacity-30 hover:bg-white/5"
                  >
                    Anterior
                  </button>
                  <span className="text-white/40 text-xs">
                    Página {pagina} de {paginas}
                  </span>
                  <button
                    onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
                    disabled={pagina >= paginas}
                    className="px-4 py-2 rounded-lg border border-white/10 text-xs font-bold text-white/60 disabled:opacity-30 hover:bg-white/5"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default function DirectorioNetworkPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080d14] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
      </div>
    }>
      <DirectorioNetworkContent />
    </Suspense>
  );
}
