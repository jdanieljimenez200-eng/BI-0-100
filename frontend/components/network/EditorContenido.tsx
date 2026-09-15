'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  borrarImagenGaleria,
  borrarServicio,
  contenidoFicha,
  crearServicio,
  editarServicio,
  errorLegible,
  ordenarGaleria,
  pesosMx,
  subirImagenGaleria,
  subirPortada,
  type ImagenPerfil,
  type ServicioPerfil,
} from '@/lib/network';

/**
 * Lo que hace que un perfil venda: portada, galería de trabajos y catálogo de
 * servicios. Se guarda al momento, sin botón de «guardar»: cada foto o servicio
 * es una petición propia, y nada de esto devuelve la ficha a revisión.
 */

const IMAGEN_MAX = 5 * 1024 * 1024;
const IMAGEN_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const etiqueta = 'block text-xs font-semibold text-white/50 mb-1.5';
const campo =
  'w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30';

function validarImagen(f: File): string | null {
  if (!IMAGEN_TIPOS.includes(f.type)) return `«${f.name}» no es jpg, png, webp o gif.`;
  if (f.size > IMAGEN_MAX) return `«${f.name}» supera los 5 MB.`;
  return null;
}

type BorradorServicio = { nombre: string; descripcion: string; precio: string; unidad: string };
const VACIO: BorradorServicio = { nombre: '', descripcion: '', precio: '', unidad: '' };

export default function EditorContenido({
  expertoId,
  portadaUrl,
}: {
  expertoId: string;
  portadaUrl?: string | null;
}) {
  const [imagenes, setImagenes] = useState<ImagenPerfil[] | null>(null);
  const [servicios, setServicios] = useState<ServicioPerfil[]>([]);
  const [maxImagenes, setMaxImagenes] = useState(12);
  const [maxServicios, setMaxServicios] = useState(15);
  const [portada, setPortada] = useState<string | null>(portadaUrl ?? null);
  const [subiendo, setSubiendo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<BorradorServicio>(VACIO);
  const [editandoServicio, setEditandoServicio] = useState<string | null>(null);
  const [guardandoServicio, setGuardandoServicio] = useState(false);
  const inputGaleria = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await contenidoFicha(expertoId);
      setImagenes(d.imagenes);
      setServicios(d.servicios);
      setMaxImagenes(d.max_imagenes);
      setMaxServicios(d.max_servicios);
    } catch (e) {
      setImagenes([]);
      setError(errorLegible(e, 'No pudimos cargar tus fotos y servicios.'));
    }
  }, [expertoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarPortada = async (f?: File) => {
    if (!f) return;
    const mal = validarImagen(f);
    if (mal) return setError(mal);
    setError(null);
    setSubiendo((n) => n + 1);
    try {
      setPortada(await subirPortada(expertoId, f));
    } catch (e) {
      setError(errorLegible(e, 'No se pudo subir la portada.'));
    } finally {
      setSubiendo((n) => n - 1);
    }
  };

  const agregarImagenes = async (lista: FileList | null) => {
    if (!lista || !imagenes) return;
    setError(null);
    const libres = maxImagenes - imagenes.length;
    const ficheros = Array.from(lista);
    if (ficheros.length > libres) {
      setError(`Solo caben ${libres} fotos más. Se subirán las primeras.`);
    }
    // Una a una: el servidor comprueba el límite en cada subida y así cada fallo
    // se dice por su nombre en vez de perder el lote entero.
    for (const f of ficheros.slice(0, Math.max(libres, 0))) {
      const mal = validarImagen(f);
      if (mal) {
        setError(mal);
        continue;
      }
      setSubiendo((n) => n + 1);
      try {
        const nueva = await subirImagenGaleria(expertoId, f);
        setImagenes((prev) => [...(prev ?? []), nueva]);
      } catch (e) {
        setError(errorLegible(e, `No se pudo subir «${f.name}».`));
      } finally {
        setSubiendo((n) => n - 1);
      }
    }
    if (inputGaleria.current) inputGaleria.current.value = '';
  };

  const quitarImagen = async (img: ImagenPerfil) => {
    if (!window.confirm('¿Quitar esta foto de tu perfil?')) return;
    try {
      await borrarImagenGaleria(expertoId, img.id);
      setImagenes((prev) => (prev ?? []).filter((i) => i.id !== img.id));
    } catch (e) {
      setError(errorLegible(e, 'No se pudo quitar la foto.'));
    }
  };

  const mover = async (indice: number, delta: -1 | 1) => {
    if (!imagenes) return;
    const destino = indice + delta;
    if (destino < 0 || destino >= imagenes.length) return;
    const nuevo = [...imagenes];
    [nuevo[indice], nuevo[destino]] = [nuevo[destino], nuevo[indice]];
    setImagenes(nuevo);
    try {
      await ordenarGaleria(expertoId, nuevo.map((i) => i.id));
    } catch (e) {
      setError(errorLegible(e, 'No se guardó el nuevo orden.'));
      cargar();
    }
  };

  const guardarServicio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (borrador.nombre.trim().length < 2) return setError('El servicio necesita un nombre.');
    const precio = borrador.precio.trim() === '' ? null : Number(borrador.precio);
    if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return setError('El precio no es válido.');
    setError(null);
    setGuardandoServicio(true);
    const datos = {
      nombre: borrador.nombre.trim(),
      descripcion: borrador.descripcion.trim(),
      precio_desde: precio,
      unidad: borrador.unidad.trim(),
    };
    try {
      if (editandoServicio) {
        const s = await editarServicio(expertoId, editandoServicio, datos);
        setServicios((prev) => prev.map((x) => (x.id === s.id ? s : x)));
      } else {
        const s = await crearServicio(expertoId, datos);
        setServicios((prev) => [...prev, s]);
      }
      setBorrador(VACIO);
      setEditandoServicio(null);
    } catch (err) {
      setError(errorLegible(err, 'No se pudo guardar el servicio.'));
    } finally {
      setGuardandoServicio(false);
    }
  };

  const quitarServicio = async (s: ServicioPerfil) => {
    if (!window.confirm(`¿Quitar «${s.nombre}»?`)) return;
    try {
      await borrarServicio(expertoId, s.id);
      setServicios((prev) => prev.filter((x) => x.id !== s.id));
      if (editandoServicio === s.id) {
        setEditandoServicio(null);
        setBorrador(VACIO);
      }
    } catch (e) {
      setError(errorLegible(e, 'No se pudo quitar el servicio.'));
    }
  };

  if (imagenes === null) return <p className="text-white/40 text-sm">Cargando fotos y servicios…</p>;

  return (
    <div className="space-y-6">
      {/* ── Portada ─────────────────────────────────────────────────────── */}
      <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <legend className="px-2 text-xs font-bold uppercase tracking-widest text-white/40">Portada</legend>
        <label className="group relative block h-36 sm:h-44 rounded-xl overflow-hidden border border-dashed border-white/15 hover:border-white/30 cursor-pointer transition-colors">
          {portada ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portada} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center text-white/35 text-xs gap-1">
              <span className="text-2xl" aria-hidden="true">🖼️</span>
              Elige una imagen horizontal que represente tu trabajo
            </span>
          )}
          <span className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-black/60 text-white/80 text-xs font-bold opacity-90 group-hover:opacity-100">
            {portada ? 'Cambiar portada' : 'Subir portada'}
          </span>
          <input
            type="file"
            accept={IMAGEN_TIPOS.join(',')}
            className="sr-only"
            onChange={(e) => cambiarPortada(e.target.files?.[0])}
          />
        </label>
        <p className="text-white/25 text-[11px] mt-2">Se ve arriba de tu perfil y en tu tarjeta del directorio. Máx. 5 MB.</p>
      </fieldset>

      {/* ── Galería ─────────────────────────────────────────────────────── */}
      <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <legend className="px-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Galería de trabajos ({imagenes.length}/{maxImagenes})
        </legend>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {imagenes.map((img, i) => (
            <figure key={img.id} className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.descripcion} className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    aria-label="Mover antes"
                    className="w-7 h-7 rounded-md bg-white/15 text-white text-xs disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === imagenes.length - 1}
                    aria-label="Mover después"
                    className="w-7 h-7 rounded-md bg-white/15 text-white text-xs disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => quitarImagen(img)}
                  aria-label="Quitar foto"
                  className="px-2 h-7 rounded-md bg-rose-500/80 text-white text-[11px] font-bold"
                >
                  Quitar
                </button>
              </div>
            </figure>
          ))}

          {imagenes.length < maxImagenes && (
            <label className="aspect-square rounded-xl border border-dashed border-white/15 hover:border-white/35 flex flex-col items-center justify-center gap-1 text-white/40 hover:text-white/70 text-xs font-semibold cursor-pointer transition-colors">
              <span className="text-2xl leading-none" aria-hidden="true">+</span>
              Añadir fotos
              <input
                ref={inputGaleria}
                type="file"
                multiple
                accept={IMAGEN_TIPOS.join(',')}
                className="sr-only"
                onChange={(e) => agregarImagenes(e.target.files)}
              />
            </label>
          )}
        </div>
        <p className="text-white/25 text-[11px] mt-3">
          Trabajos reales, tu local, tu equipo o productos. La primera foto es la que más se ve. Máx. 5 MB cada una.
        </p>
      </fieldset>

      {/* ── Servicios ───────────────────────────────────────────────────── */}
      <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Servicios ({servicios.length}/{maxServicios})
        </legend>

        {servicios.length > 0 && (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
            {servicios.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold">{s.nombre}</p>
                  {s.descripcion && <p className="text-white/45 text-xs mt-0.5 whitespace-pre-line">{s.descripcion}</p>}
                  <p className="text-white/35 text-[11px] mt-1">
                    {s.precio_desde !== null ? `Desde ${pesosMx(s.precio_desde)}` : 'Precio a consultar'}
                    {s.unidad ? ` · por ${s.unidad}` : ''}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoServicio(s.id);
                      setBorrador({
                        nombre: s.nombre,
                        descripcion: s.descripcion,
                        precio: s.precio_desde === null ? '' : String(s.precio_desde),
                        unidad: s.unidad,
                      });
                    }}
                    className="px-2.5 py-1 rounded-md border border-white/15 text-white/70 text-[11px] font-bold hover:bg-white/5"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => quitarServicio(s)}
                    className="px-2.5 py-1 rounded-md text-rose-300/70 hover:text-rose-300 text-[11px] font-semibold"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {(servicios.length < maxServicios || editandoServicio) && (
          <form onSubmit={guardarServicio} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <p className="text-white/60 text-xs font-bold">
              {editandoServicio ? 'Editar servicio' : servicios.length === 0 ? 'Agrega tu primer servicio' : 'Agregar otro servicio'}
            </p>
            <div>
              <label className={etiqueta} htmlFor="srv-nombre">Nombre *</label>
              <input
                id="srv-nombre"
                value={borrador.nombre}
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                maxLength={120}
                placeholder="Registro de marca ante IMPI"
                className={campo}
              />
            </div>
            <div>
              <label className={etiqueta} htmlFor="srv-desc">Qué incluye</label>
              <textarea
                id="srv-desc"
                value={borrador.descripcion}
                onChange={(e) => setBorrador({ ...borrador, descripcion: e.target.value })}
                maxLength={1000}
                rows={3}
                placeholder="Búsqueda fonética, solicitud y seguimiento hasta el título."
                className={`${campo} resize-y`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta} htmlFor="srv-precio">Desde (MXN)</label>
                <input
                  id="srv-precio"
                  type="number"
                  min={0}
                  value={borrador.precio}
                  onChange={(e) => setBorrador({ ...borrador, precio: e.target.value })}
                  placeholder="A consultar"
                  className={campo}
                />
              </div>
              <div>
                <label className={etiqueta} htmlFor="srv-unidad">Por</label>
                <input
                  id="srv-unidad"
                  value={borrador.unidad}
                  onChange={(e) => setBorrador({ ...borrador, unidad: e.target.value })}
                  maxLength={40}
                  placeholder="proyecto, hora, mes…"
                  className={campo}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={guardandoServicio}
                className="px-4 py-2 rounded-lg bg-white text-[#070E17] text-xs font-bold hover:bg-white/90 disabled:opacity-50"
              >
                {guardandoServicio ? 'Guardando…' : editandoServicio ? 'Guardar cambios' : 'Agregar servicio'}
              </button>
              {editandoServicio && (
                <button
                  type="button"
                  onClick={() => {
                    setEditandoServicio(null);
                    setBorrador(VACIO);
                  }}
                  className="px-4 py-2 rounded-lg border border-white/15 text-white/60 text-xs font-bold"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}
      </fieldset>

      {subiendo > 0 && <p className="text-white/50 text-xs">Subiendo {subiendo} {subiendo === 1 ? 'imagen' : 'imágenes'}…</p>}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
          <p className="text-rose-300 text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
