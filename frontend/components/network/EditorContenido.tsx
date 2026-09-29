'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, ArrowLeft, ArrowRight, Plus, Video, Play, Link2, X } from 'lucide-react';
import {
  borrarImagenGaleria,
  borrarServicio,
  contenidoFicha,
  crearServicio,
  editarServicio,
  errorLegible,
  esUrlVideo,
  insertarVideoGaleria,
  obtenerMiniaturaVideo,
  ordenarGaleria,
  pesosMx,
  subirImagenGaleria,
  subirPortada,
  type ImagenPerfil,
  type ServicioPerfil,
} from '@/lib/network';

/**
 * Lo que hace que un perfil venda: portada, galería de trabajos y catálogo de
 * servicios. Se guarda al momento, sin botón de «guardar»: cada foto, vídeo o servicio
 * es una petición propia, y nada de esto devuelve la ficha a revisión.
 */

const IMAGEN_MAX = 5 * 1024 * 1024;
const IMAGEN_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MAX = 40 * 1024 * 1024;
const VIDEO_TIPOS = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
const MULTIMEDIA_TIPOS = [...IMAGEN_TIPOS, ...VIDEO_TIPOS];

const etiqueta = 'block text-xs font-semibold text-white/50 mb-1.5';
const campo =
  'w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30';

function validarImagenPortada(f: File): string | null {
  if (!IMAGEN_TIPOS.includes(f.type)) return `«${f.name}» no es jpg, png, webp o gif.`;
  if (f.size > IMAGEN_MAX) return `«${f.name}» supera los 5 MB.`;
  return null;
}

function validarArchivoGaleria(f: File): string | null {
  const mime = f.type.split(';')[0].trim().toLowerCase();
  if (IMAGEN_TIPOS.includes(mime)) {
    if (f.size > IMAGEN_MAX) return `«${f.name}» supera los 5 MB para imágenes.`;
    return null;
  }
  if (VIDEO_TIPOS.includes(mime) || /\.(mp4|webm|mov|m4v)$/i.test(f.name)) {
    if (f.size > VIDEO_MAX) return `«${f.name}» supera los 40 MB para vídeos.`;
    return null;
  }
  return `«${f.name}» no es un formato permitido (fotos: jpg, png, webp, gif; vídeos: mp4, webm, mov).`;
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
  const [maxImagenes, setMaxImagenes] = useState(15);
  const [maxServicios, setMaxServicios] = useState(15);
  const [portada, setPortada] = useState<string | null>(portadaUrl ?? null);
  const [subiendo, setSubiendo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<BorradorServicio>(VACIO);
  const [editandoServicio, setEditandoServicio] = useState<string | null>(null);
  const [guardandoServicio, setGuardandoServicio] = useState(false);
  const inputGaleria = useRef<HTMLInputElement>(null);

  // Estado para inserción de vídeo por enlace
  const [mostrarFormVideo, setMostrarFormVideo] = useState(false);
  const [urlVideo, setUrlVideo] = useState('');
  const [descripcionVideo, setDescripcionVideo] = useState('');
  const [guardandoVideo, setGuardandoVideo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await contenidoFicha(expertoId);
      setImagenes(d.imagenes);
      setServicios(d.servicios);
      setMaxImagenes(d.max_imagenes || 15);
      setMaxServicios(d.max_servicios || 15);
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
    const mal = validarImagenPortada(f);
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

  const agregarArchivos = async (lista: FileList | null) => {
    if (!lista || !imagenes) return;
    setError(null);
    const libres = maxImagenes - imagenes.length;
    const ficheros = Array.from(lista);
    if (ficheros.length > libres) {
      setError(`Solo caben ${libres} elementos más. Se subirán los primeros.`);
    }
    for (const f of ficheros.slice(0, Math.max(libres, 0))) {
      const mal = validarArchivoGaleria(f);
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

  const agregarVideoPorUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlVideo.trim()) return setError('Ingresa la URL del vídeo.');
    if (imagenes && imagenes.length >= maxImagenes) {
      return setError(`La galería admite hasta ${maxImagenes} elementos.`);
    }
    setError(null);
    setGuardandoVideo(true);
    try {
      const nueva = await insertarVideoGaleria(expertoId, urlVideo.trim(), descripcionVideo.trim());
      setImagenes((prev) => [...(prev ?? []), nueva]);
      setUrlVideo('');
      setDescripcionVideo('');
      setMostrarFormVideo(false);
    } catch (err) {
      setError(errorLegible(err, 'No se pudo insertar el enlace del vídeo. Verifica la URL.'));
    } finally {
      setGuardandoVideo(false);
    }
  };

  const quitarImagen = async (img: ImagenPerfil) => {
    const esVid = esUrlVideo(img.url, img.tipo);
    if (!window.confirm(`¿Quitar este ${esVid ? 'vídeo' : 'elemento'} de tu perfil?`)) return;
    try {
      await borrarImagenGaleria(expertoId, img.id);
      setImagenes((prev) => (prev ?? []).filter((i) => i.id !== img.id));
    } catch (e) {
      setError(errorLegible(e, 'No se pudo quitar el elemento.'));
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
        <label className="group relative block h-36 sm:h-44 rounded-xl overflow-hidden border border-dashed border-white/15 hover:border-emerald-500/40 hover:bg-white/[0.03] cursor-pointer transition-all duration-200">
          {portada ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portada} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center text-white/50 text-xs gap-1.5">
              <ImageIcon className="w-7 h-7 text-emerald-400/80 transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-6" />
              Elige una imagen horizontal que represente tu trabajo
            </span>
          )}
          <span className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-black/70 text-white/80 text-xs font-bold opacity-90 group-hover:opacity-100 group-hover:bg-black/90 transition-all duration-200">
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
        <div className="flex items-center justify-between mb-3 px-1">
          <legend className="text-xs font-bold uppercase tracking-widest text-white/40">
            Galería de trabajos ({imagenes.length}/{maxImagenes})
          </legend>
          {imagenes.length < maxImagenes && (
            <button
              type="button"
              onClick={() => setMostrarFormVideo((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{mostrarFormVideo ? 'Cerrar enlace' : 'Insertar vídeo por URL'}</span>
            </button>
          )}
        </div>

        {mostrarFormVideo && (
          <form
            onSubmit={agregarVideoPorUrl}
            className="mb-4 p-4 rounded-xl bg-white/[0.04] border border-white/15 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-emerald-400" />
                Insertar vídeo por enlace
              </span>
              <button
                type="button"
                onClick={() => setMostrarFormVideo(false)}
                className="text-white/40 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className={etiqueta}>URL del vídeo (YouTube, Vimeo, TikTok o enlace directo .mp4)</label>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=... o https://...video.mp4"
                value={urlVideo}
                onChange={(e) => setUrlVideo(e.target.value)}
                required
                className={campo}
              />
            </div>
            <div>
              <label className={etiqueta}>Descripción corta del trabajo o proyecto (opcional)</label>
              <input
                type="text"
                maxLength={200}
                placeholder="Ej. Recorrido del taller, demostración del servicio..."
                value={descripcionVideo}
                onChange={(e) => setDescripcionVideo(e.target.value)}
                className={campo}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMostrarFormVideo(false)}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoVideo}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {guardandoVideo ? 'Insertando...' : 'Añadir a la galería'}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {imagenes.map((img, i) => {
            const esVid = esUrlVideo(img.url, img.tipo);
            const miniaturaYt = esVid ? obtenerMiniaturaVideo(img.url) : null;
            return (
              <figure
                key={img.id}
                className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-[#141416]"
              >
                {esVid ? (
                  miniaturaYt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={miniaturaYt} alt={img.descripcion} className="w-full h-full object-cover" />
                  ) : (
                    <video
                      src={img.url + '#t=0.5'}
                      preload="metadata"
                      muted
                      playsInline
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  )
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt={img.descripcion} className="w-full h-full object-cover" />
                )}

                {/* Badge indicador de vídeo */}
                {esVid && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 border border-white/20 text-white text-[10px] font-bold flex items-center gap-1 backdrop-blur-sm z-10 pointer-events-none shadow">
                    <Play className="w-2.5 h-2.5 fill-emerald-400 text-emerald-400" />
                    <span>Vídeo</span>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity z-20">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => mover(i, -1)}
                      disabled={i === 0}
                      aria-label="Mover antes"
                      className="w-7 h-7 rounded-md bg-white/20 hover:bg-white/30 active:scale-90 text-white text-xs disabled:opacity-30 flex items-center justify-center cursor-pointer transition-all duration-150"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, 1)}
                      disabled={i === imagenes.length - 1}
                      aria-label="Mover después"
                      className="w-7 h-7 rounded-md bg-white/20 hover:bg-white/30 active:scale-90 text-white text-xs disabled:opacity-30 flex items-center justify-center cursor-pointer transition-all duration-150"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => quitarImagen(img)}
                    aria-label="Quitar elemento"
                    className="px-2.5 h-7 rounded-md bg-rose-500/80 hover:bg-rose-500 active:scale-90 text-white text-[11px] font-bold cursor-pointer transition-all duration-150 shadow-xs"
                  >
                    Quitar
                  </button>
                </div>
              </figure>
            );
          })}

          {imagenes.length < maxImagenes && (
            <label className="group aspect-square rounded-xl border border-dashed border-white/15 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] flex flex-col items-center justify-center gap-2 text-white/50 hover:text-white text-xs font-semibold cursor-pointer transition-all duration-200 active:scale-95 p-2 text-center">
              <Plus className="w-6 h-6 text-emerald-400 transition-transform duration-300 group-hover:scale-125 group-hover:rotate-90" />
              <span>Subir fotos o vídeos</span>
              <span className="text-[10px] text-white/30 font-normal">JPG, PNG, WEBP, MP4, MOV</span>
              <input
                ref={inputGaleria}
                type="file"
                multiple
                accept={MULTIMEDIA_TIPOS.join(',')}
                className="sr-only"
                onChange={(e) => agregarArchivos(e.target.files)}
              />
            </label>
          )}
        </div>
        <p className="text-white/30 text-[11px] mt-3">
          Fotos (máx. 5 MB) y vídeos (máx. 40 MB, o enlaces de YouTube/Vimeo/TikTok). Máximo 15 elementos en total.
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
