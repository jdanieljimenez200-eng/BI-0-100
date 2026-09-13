'use client';

import { useEffect, useState } from 'react';
import {
  CATEGORIAS,
  NOMBRE_CATEGORIA,
  errorLegible,
  type CategoriaExperto,
  type DatosFicha,
  type FichaPropia,
} from '@/lib/network';

/**
 * Formulario de la ficha de experto, compartido entre el alta y la edición.
 *
 * Dos cosas que el formulario dice en voz alta porque el usuario las tiene que
 * saber antes de escribir:
 *
 *  - Todo pasa por revisión. Rellenar campos no acredita a nadie, y la insignia
 *    de verificado no se puede pedir desde aquí: la concede quien revisa.
 *  - El teléfono y el email no se publican salvo que se marque la casilla.
 */

const CAMPOS_QUE_VUELVEN_A_REVISION = [
  'nombre_comercial',
  'nombre_display',
  'categoria',
  'especialidad',
] as const;

/** Mismos límites que el backend: rechazarlo aquí ahorra subir 8 MB para nada. */
const DOCUMENTO_MAX = 8 * 1024 * 1024;
const DOCUMENTO_TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const AVATAR_MAX = 3 * 1024 * 1024;
const AVATAR_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Ficheros elegidos en el formulario. Se suben DESPUÉS de guardar la ficha. */
export interface FicherosFicha {
  documento?: File;
  avatar?: File;
}

type Formulario = {
  nombre_comercial: string;
  nombre_display: string;
  categoria: CategoriaExperto;
  especialidad: string;
  bio_corta: string;
  bio_larga: string;
  sub_especialidades: string;
  ciudad: string;
  pais: string;
  email_contacto: string;
  telefono: string;
  mostrar_contacto: boolean;
  sitio_web: string;
  video_url: string;
  tarifa_desde: string;
  moneda: string;
  ofrece_consulta_gratis: boolean;
};

function aFormulario(ficha?: FichaPropia): Formulario {
  return {
    nombre_comercial: ficha?.nombre_comercial ?? '',
    nombre_display: ficha?.nombre_display ?? '',
    categoria: ficha?.categoria ?? 'legal',
    especialidad: ficha?.especialidad ?? '',
    bio_corta: ficha?.bio_corta ?? '',
    bio_larga: ficha?.bio_larga ?? '',
    sub_especialidades: (ficha?.sub_especialidades ?? []).join(', '),
    ciudad: ficha?.ciudad ?? '',
    pais: ficha?.pais ?? '',
    email_contacto: ficha?.email_contacto ?? '',
    telefono: ficha?.telefono ?? '',
    mostrar_contacto: ficha?.mostrar_contacto ?? false,
    sitio_web: ficha?.sitio_web ?? '',
    video_url: ficha?.video_url ?? '',
    tarifa_desde: ficha?.tarifa_desde === null || ficha?.tarifa_desde === undefined
      ? ''
      : String(ficha.tarifa_desde),
    moneda: ficha?.moneda ?? 'USD',
    ofrece_consulta_gratis: ficha?.ofrece_consulta_gratis ?? false,
  };
}

/**
 * Convierte el formulario en el cuerpo de la petición.
 *
 * Un campo vacío se manda como `null`, no como cadena vacía ni como 0: vaciar la
 * tarifa tiene que significar "no digo mi tarifa", nunca "cobro cero".
 */
function aDatos(f: Formulario): DatosFicha {
  const texto = (v: string) => v.trim();
  const opcional = (v: string) => (v.trim() === '' ? null : v.trim());

  return {
    nombre_comercial: texto(f.nombre_comercial),
    nombre_display: texto(f.nombre_display) || texto(f.nombre_comercial),
    categoria: f.categoria,
    especialidad: texto(f.especialidad),
    bio_corta: texto(f.bio_corta),
    bio_larga: opcional(f.bio_larga),
    sub_especialidades: f.sub_especialidades
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10),
    ciudad: texto(f.ciudad),
    pais: opcional(f.pais)?.toUpperCase() ?? null,
    email_contacto: opcional(f.email_contacto),
    telefono: opcional(f.telefono),
    mostrar_contacto: f.mostrar_contacto,
    sitio_web: opcional(f.sitio_web),
    video_url: opcional(f.video_url),
    tarifa_desde: f.tarifa_desde.trim() === '' ? null : Number(f.tarifa_desde),
    moneda: texto(f.moneda) || 'USD',
    ofrece_consulta_gratis: f.ofrece_consulta_gratis,
  };
}

const etiqueta = 'block text-xs font-semibold text-white/50 mb-1.5';
const campo =
  'w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30';

export default function FormularioFicha({
  ficha,
  alGuardar,
  textoBoton,
}: {
  ficha?: FichaPropia;
  alGuardar: (datos: DatosFicha, ficheros: FicherosFicha) => Promise<void>;
  textoBoton: string;
}) {
  const [f, setF] = useState<Formulario>(() => aFormulario(ficha));
  const [documento, setDocumento] = useState<File | undefined>();
  const [avatar, setAvatar] = useState<File | undefined>();
  const [vistaAvatar, setVistaAvatar] = useState<string | null>(null);

  // La vista previa es un objeto en memoria del navegador: se libera al
  // cambiar de imagen o al desmontar, o se acumula en cada selección.
  useEffect(() => {
    if (!avatar) return;
    const url = URL.createObjectURL(avatar);
    setVistaAvatar(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Formulario>(clave: K, valor: Formulario[K]) =>
    setF((previo) => ({ ...previo, [clave]: valor }));

  /** ¿Este cambio va a devolver una ficha ya aprobada a la cola de revisión? */
  const volveraRevision =
    ficha?.estado === 'aprobado' &&
    (Boolean(documento) ||
      CAMPOS_QUE_VUELVEN_A_REVISION.some((clave) => f[clave] !== aFormulario(ficha)[clave]));

  const elegirDocumento = (fichero: File | undefined) => {
    setError(null);
    if (!fichero) return setDocumento(undefined);
    if (!DOCUMENTO_TIPOS.includes(fichero.type)) {
      setError('El documento debe ser un PDF o una imagen (jpg, png, webp).');
      return;
    }
    if (fichero.size > DOCUMENTO_MAX) {
      setError('El documento supera el máximo de 8 MB.');
      return;
    }
    setDocumento(fichero);
  };

  const elegirAvatar = (fichero: File | undefined) => {
    setError(null);
    if (!fichero) return setAvatar(undefined);
    if (!AVATAR_TIPOS.includes(fichero.type)) {
      setError('La foto debe ser una imagen (jpg, png, webp, gif).');
      return;
    }
    if (fichero.size > AVATAR_MAX) {
      setError('La foto supera el máximo de 3 MB.');
      return;
    }
    setAvatar(fichero);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.nombre_comercial.trim()) {
      setError('El nombre comercial es obligatorio.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await alGuardar(aDatos(f), { documento, avatar });
    } catch (err) {
      setError(errorLegible(err, 'No pudimos guardar la ficha.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-6">
      {/* ── Identidad ──────────────────────────────────────────────────── */}
      <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Quién eres
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={etiqueta} htmlFor="nombre_comercial">
              Nombre comercial *
            </label>
            <input
              id="nombre_comercial"
              value={f.nombre_comercial}
              onChange={(e) => set('nombre_comercial', e.target.value)}
              maxLength={160}
              required
              placeholder="Despacho, agencia o tu nombre profesional"
              className={campo}
            />
          </div>
          <div>
            <label className={etiqueta} htmlFor="nombre_display">
              Nombre corto
            </label>
            <input
              id="nombre_display"
              value={f.nombre_display}
              onChange={(e) => set('nombre_display', e.target.value)}
              maxLength={160}
              placeholder="Como quieres que se te llame"
              className={campo}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={etiqueta} htmlFor="categoria">
              Categoría *
            </label>
            <select
              id="categoria"
              value={f.categoria}
              onChange={(e) => set('categoria', e.target.value as CategoriaExperto)}
              className={campo}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c} className="bg-[#0B1420]">
                  {NOMBRE_CATEGORIA[c]}
                </option>
              ))}
            </select>
            <p className="text-white/25 text-[11px] mt-1.5">
              Una ficha por categoría. Si trabajas en dos, preséntalas por separado.
            </p>
          </div>
          <div>
            <label className={etiqueta} htmlFor="especialidad">
              Especialidad
            </label>
            <input
              id="especialidad"
              value={f.especialidad}
              onChange={(e) => set('especialidad', e.target.value)}
              maxLength={120}
              placeholder="Derecho laboral, paid media, distribución…"
              className={campo}
            />
          </div>
        </div>

        <div>
          <label className={etiqueta} htmlFor="sub_especialidades">
            Temas que dominas
          </label>
          <input
            id="sub_especialidades"
            value={f.sub_especialidades}
            onChange={(e) => set('sub_especialidades', e.target.value)}
            placeholder="Separados por comas. Máximo 10."
            className={campo}
          />
        </div>

        <div>
          <label className={etiqueta} htmlFor="bio_corta">
            En una línea ({f.bio_corta.length}/280)
          </label>
          <input
            id="bio_corta"
            value={f.bio_corta}
            onChange={(e) => set('bio_corta', e.target.value)}
            maxLength={280}
            placeholder="Lo que resuelves, en concreto"
            className={campo}
          />
        </div>

        <div>
          <label className={etiqueta} htmlFor="bio_larga">
            Más detalle
          </label>
          <textarea
            id="bio_larga"
            value={f.bio_larga}
            onChange={(e) => set('bio_larga', e.target.value)}
            maxLength={4000}
            rows={5}
            placeholder="Experiencia, tipo de cliente con el que trabajas, cómo trabajas."
            className={`${campo} resize-y`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
          <div>
            <label className={etiqueta} htmlFor="ciudad">
              Ciudad
            </label>
            <input
              id="ciudad"
              value={f.ciudad}
              onChange={(e) => set('ciudad', e.target.value)}
              maxLength={120}
              className={campo}
            />
          </div>
          <div>
            <label className={etiqueta} htmlFor="pais">
              País (2 letras)
            </label>
            <input
              id="pais"
              value={f.pais}
              onChange={(e) => set('pais', e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              placeholder="MX"
              className={campo}
            />
          </div>
        </div>
      </fieldset>

      {/* ── Contacto ───────────────────────────────────────────────────── */}
      <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Cómo te contactan
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={etiqueta} htmlFor="email_contacto">
              Email de contacto
            </label>
            <input
              id="email_contacto"
              type="email"
              value={f.email_contacto}
              onChange={(e) => set('email_contacto', e.target.value)}
              maxLength={180}
              className={campo}
            />
          </div>
          <div>
            <label className={etiqueta} htmlFor="telefono">
              Teléfono
            </label>
            <input
              id="telefono"
              value={f.telefono}
              onChange={(e) => set('telefono', e.target.value)}
              maxLength={40}
              className={campo}
            />
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={f.mostrar_contacto}
            onChange={(e) => set('mostrar_contacto', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5"
          />
          <span className="text-white/60 text-xs leading-relaxed">
            Publicar mi email y teléfono en la ficha.
            <span className="block text-white/30 mt-0.5">
              Si lo dejas sin marcar, nadie verá tus datos: seguirán guardados pero no se mostrarán.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={etiqueta} htmlFor="sitio_web">
              Sitio web
            </label>
            <input
              id="sitio_web"
              value={f.sitio_web}
              onChange={(e) => set('sitio_web', e.target.value)}
              placeholder="https://…"
              className={campo}
            />
          </div>
        </div>

        <p className="text-white/25 text-[11px]">
          La dirección web tiene que empezar por http:// o https://.
        </p>

        <div>
          <span className={etiqueta}>Foto o logo</span>
          <div className="flex items-center gap-4">
            {vistaAvatar || ficha?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vistaAvatar ?? ficha?.avatar_url ?? ''}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-white/10"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl border border-dashed border-white/15 flex items-center justify-center text-white/20 text-[10px]">
                Sin foto
              </div>
            )}
            <label className="px-3 py-2 rounded-lg border border-white/15 text-white/70 text-xs font-bold hover:bg-white/5 cursor-pointer transition-colors">
              {avatar || ficha?.avatar_url ? 'Cambiar foto' : 'Elegir foto'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => elegirAvatar(e.target.files?.[0])}
              />
            </label>
            <span className="text-white/25 text-[11px]">jpg, png, webp · máx. 3 MB</span>
          </div>
        </div>
      </fieldset>

      {/* ── Tarifa ─────────────────────────────────────────────────────── */}
      <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Tarifa
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
          <div>
            <label className={etiqueta} htmlFor="tarifa_desde">
              Desde
            </label>
            <input
              id="tarifa_desde"
              type="number"
              min={0}
              step="1"
              value={f.tarifa_desde}
              onChange={(e) => set('tarifa_desde', e.target.value)}
              placeholder="Déjalo vacío si prefieres no decirlo"
              className={campo}
            />
          </div>
          <div>
            <label className={etiqueta} htmlFor="moneda">
              Moneda
            </label>
            <input
              id="moneda"
              value={f.moneda}
              onChange={(e) => set('moneda', e.target.value.toUpperCase().slice(0, 10))}
              placeholder="USD"
              className={campo}
            />
          </div>
        </div>
        <p className="text-white/25 text-[11px]">
          Vacío significa &laquo;a consultar&raquo;, no gratis.
        </p>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={f.ofrece_consulta_gratis}
            onChange={(e) => set('ofrece_consulta_gratis', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/5"
          />
          <span className="text-white/60 text-xs">Ofrezco una primera consulta gratuita</span>
        </label>
      </fieldset>

      {/* ── Acreditación ───────────────────────────────────────────────── */}
      <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Acreditación
        </legend>

        <div>
          <span className={etiqueta}>Cédula, licencia o acreditación</span>

          <label
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
              documento
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-dashed border-white/15 hover:border-white/30'
            }`}
          >
            <span className="min-w-0 text-xs">
              {documento ? (
                <span className="text-emerald-300 font-semibold truncate block">{documento.name}</span>
              ) : ficha?.tiene_documento ? (
                <span className="text-white/60">
                  Ya enviaste un documento. Elige otro solo si quieres sustituirlo.
                </span>
              ) : (
                <span className="text-white/50">Elige un PDF o una foto del documento</span>
              )}
              <span className="block text-white/25 text-[11px] mt-0.5">pdf, jpg, png · máx. 8 MB</span>
            </span>
            <span className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 text-xs font-bold flex-shrink-0">
              {documento || ficha?.tiene_documento ? 'Cambiar' : 'Elegir'}
            </span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => elegirDocumento(e.target.files?.[0])}
            />
          </label>

          <p className="text-white/30 text-[11px] mt-2 leading-relaxed">
            Este documento <strong className="text-white/50">no se publica nunca</strong>: se guarda
            aparte y solo lo abre quien revisa tu ficha. Sin él puedes salir en el directorio, pero no
            con la insignia de acreditación comprobada.
          </p>
        </div>

        <div>
          <label className={etiqueta} htmlFor="video_url">
            Vídeo de presentación (URL)
          </label>
          <input
            id="video_url"
            value={f.video_url}
            onChange={(e) => set('video_url', e.target.value)}
            placeholder="https://…"
            className={campo}
          />
        </div>
      </fieldset>

      {volveraRevision && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-amber-200/80 text-xs leading-relaxed">
            Estás cambiando datos de identidad (nombre, categoría, especialidad o el documento de
            acreditación). Al guardar, la ficha vuelve a revisión y sale del directorio hasta que se
            apruebe de nuevo.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-rose-300 text-xs">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={guardando}
          className="px-6 py-3 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90 disabled:opacity-50 transition-colors"
        >
          {guardando ? 'Guardando…' : textoBoton}
        </button>
        <p className="text-white/30 text-xs">Todas las fichas pasan por revisión manual.</p>
      </div>
    </form>
  );
}
