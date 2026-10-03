'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  crearBorradorPrompt,
  descartarBorradorPrompt,
  guardarBorradorPrompt,
  leerPrompt,
  pedirCodigoTotp,
  probarPrompt,
  publicarPrompt,
  usarRepositorioPrompt,
  type DetallePrompt,
  type SeccionExtraDef,
  type VersionPrompt,
} from '@/lib/admin';
import TransparenciaIA, { type Transparencia } from '@/components/analisis/TransparenciaIA';
import SeccionesExtra, { type SeccionExtra } from '@/components/analisis/SeccionesExtra';

/**
 * Editor de una clave de prompt: borrador, prueba con casos LATAM, diferencias
 * contra lo que está en uso, publicación con código fresco e historial con
 * restauración.
 */

const FECHA = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const ESTADO_CLASE: Record<VersionPrompt['estado'], string> = {
  publicado: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  borrador: 'text-sky-300 bg-sky-500/10 border-sky-500/25',
  archivado: 'text-white/50 bg-white/5 border-white/10',
};

// ─── Diferencias por líneas (LCS) ────────────────────────────────────────────

type LineaDiff = { tipo: 'igual' | 'mas' | 'menos'; texto: string };

function diffLineas(antes: string, despues: string): LineaDiff[] {
  const a = antes.split('\n');
  const b = despues.split('\n');
  const n = a.length;
  const m = b.length;
  const t = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * (m + 1) + j] =
        a[i] === b[j] ? t[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(t[(i + 1) * (m + 1) + j], t[i * (m + 1) + j + 1]);
    }
  }
  const out: LineaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ tipo: 'igual', texto: a[i] });
      i++;
      j++;
    } else if (t[(i + 1) * (m + 1) + j] >= t[i * (m + 1) + j + 1]) {
      out.push({ tipo: 'menos', texto: a[i++] });
    } else {
      out.push({ tipo: 'mas', texto: b[j++] });
    }
  }
  while (i < n) out.push({ tipo: 'menos', texto: a[i++] });
  while (j < m) out.push({ tipo: 'mas', texto: b[j++] });
  return out;
}

function VistaDiff({ antes, despues }: { antes: string; despues: string }) {
  const lineas = useMemo(() => diffLineas(antes, despues), [antes, despues]);
  const cambios = lineas.filter((l) => l.tipo !== 'igual');
  if (!cambios.length) return <p className="text-xs text-white/40">Sin cambios de texto.</p>;
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl border border-white/[0.08] bg-black/30 font-mono text-[11px] leading-relaxed">
      {lineas.map((l, i) =>
        l.tipo === 'igual' ? null : (
          <div
            key={i}
            className={`px-3 whitespace-pre-wrap ${l.tipo === 'mas' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}
          >
            {l.tipo === 'mas' ? '+ ' : '− '}
            {l.texto || ' '}
          </div>
        )
      )}
    </div>
  );
}

// ─── Resultado de una prueba ─────────────────────────────────────────────────

type ResultadoPrueba = Awaited<ReturnType<typeof probarPrompt>>;

/** Lo común a cualquier módulo, para pintar la prueba con los mismos componentes. */
interface VistaComun {
  origen: 'ia' | 'plantilla' | 'mixto' | undefined;
  puntaje: { etiqueta: string; valor: number } | null;
  resumen: string | null;
  conteos: [etiqueta: string, valor: number | 'oculta'][];
  transparencia?: Transparencia | null;
  secciones_extra?: SeccionExtra[];
}

const largo = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/**
 * Legal guarda todo en un objeto; Mercado devuelve viabilidad, DAFO, reporte BI
 * y `meta_ia`; Finanzas, el cálculo, los riesgos y `meta_ia`.
 */
function vistaDePrueba(resultado: unknown): VistaComun {
  const r = (resultado ?? {}) as Record<string, unknown>;
  // Marketing: estrategias, copies y calendario.
  if (r.meta_ia && typeof r.meta_ia === 'object' && Array.isArray(r.estrategias)) {
    const meta = r.meta_ia as {
      transparencia?: Transparencia;
      secciones_extra?: SeccionExtra[];
      secciones_ocultas?: string[];
      meta?: { origen?: VistaComun['origen'] };
    };
    const estrategias = r.estrategias as { nombre?: string; recomendada?: boolean }[];
    const recomendada = estrategias.find((e) => e.recomendada) ?? estrategias[0];
    const cal = (r.calendario ?? null) as { semanas?: { dias?: { publicaciones?: unknown[] }[] }[]; tendencias?: unknown[] } | null;
    const publicaciones = (cal?.semanas ?? []).reduce(
      (acc, s) => acc + (s.dias ?? []).reduce((a, d) => a + largo(d.publicaciones), 0),
      0
    );
    return {
      origen: meta.meta?.origen,
      puntaje: null,
      resumen: recomendada?.nombre ? `Estrategia recomendada: ${recomendada.nombre}` : null,
      conteos: [
        ['Estrategias', estrategias.length],
        ['Copies', (meta.secciones_ocultas ?? []).includes('marketing.copies') ? 'oculta' : largo(r.copies)],
        ['Publicaciones del calendario', publicaciones],
        ['Tendencias', largo(cal?.tendencias)],
      ],
      transparencia: meta.transparencia,
      secciones_extra: meta.secciones_extra,
    };
  }
  // Ventas: tips, historia del día y perfil de cliente.
  if (r.meta_ia && typeof r.meta_ia === 'object' && Array.isArray(r.tips)) {
    const meta = r.meta_ia as {
      transparencia?: Transparencia;
      secciones_extra?: SeccionExtra[];
      secciones_ocultas?: string[];
      meta?: { origen?: VistaComun['origen'] };
    };
    const tips = r.tips as { titulo?: string }[];
    const perfil = (r.perfil_cliente ?? null) as { score_afinidad?: number; psicografia?: { objeciones_tipicas?: unknown[] } } | null;
    return {
      origen: meta.meta?.origen,
      puntaje: typeof perfil?.score_afinidad === 'number' ? { etiqueta: 'Afinidad del perfil de cliente', valor: perfil.score_afinidad } : null,
      resumen: tips.map((t) => t.titulo).filter(Boolean).join(' · ') || null,
      conteos: [
        ['Tips', tips.length],
        ['Historia del día', (meta.secciones_ocultas ?? []).includes('ventas.historia') ? 'oculta' : r.historia ? 1 : 0],
        ['Objeciones del perfil', largo(perfil?.psicografia?.objeciones_tipicas)],
      ],
      transparencia: meta.transparencia,
      secciones_extra: meta.secciones_extra,
    };
  }
  if (r.meta_ia && typeof r.meta_ia === 'object' && r.resumen && typeof r.resumen === 'object') {
    const meta = r.meta_ia as {
      transparencia?: Transparencia;
      secciones_extra?: SeccionExtra[];
      secciones_ocultas?: string[];
      meta?: { origen?: VistaComun['origen'] };
    };
    const resumen = r.resumen as { viabilidad?: string; mensaje_viabilidad?: string; alertas?: unknown[]; recomendaciones?: unknown[] };
    const riesgos = (r.riesgos ?? null) as { riesgos?: unknown[] } | null;
    return {
      origen: meta.meta?.origen,
      puntaje: null,
      resumen: resumen.mensaje_viabilidad ? `Viabilidad ${resumen.viabilidad ?? '—'}: ${resumen.mensaje_viabilidad}` : null,
      conteos: [
        ['Riesgos', (meta.secciones_ocultas ?? []).includes('finanzas.riesgos') ? 'oculta' : largo(riesgos?.riesgos)],
        ['Alertas del cálculo', largo(resumen.alertas)],
        ['Recomendaciones', largo(resumen.recomendaciones)],
      ],
      transparencia: meta.transparencia,
      secciones_extra: meta.secciones_extra,
    };
  }
  if (r.meta_ia && typeof r.meta_ia === 'object') {
    const meta = r.meta_ia as {
      transparencia?: Transparencia;
      secciones_extra?: SeccionExtra[];
      secciones_ocultas?: string[];
      meta?: { origen?: VistaComun['origen'] };
    };
    const ocultas = new Set(meta.secciones_ocultas ?? []);
    const viab = (r.viabilidad ?? {}) as { score?: number };
    const dafo = (r.dafo ?? null) as Record<string, unknown> | null;
    const reporte = (r.reporte_bi ?? null) as { resumen_ejecutivo?: string; alertas_ia?: unknown[] } | null;
    const cuadrante = (etiqueta: string, clave: string): [string, number | 'oculta'] => [
      etiqueta,
      ocultas.has('mercado.dafo') ? 'oculta' : largo(dafo?.[clave]),
    ];
    return {
      origen: meta.meta?.origen,
      puntaje: typeof viab.score === 'number' ? { etiqueta: 'Viabilidad', valor: viab.score } : null,
      resumen: reporte?.resumen_ejecutivo ?? null,
      conteos: [
        cuadrante('Fortalezas', 'fortalezas'),
        cuadrante('Debilidades', 'debilidades'),
        cuadrante('Oportunidades', 'oportunidades'),
        cuadrante('Amenazas', 'amenazas'),
        ['Alertas del reporte', ocultas.has('mercado.reporte_bi') ? 'oculta' : largo(reporte?.alertas_ia)],
      ],
      transparencia: meta.transparencia,
      secciones_extra: meta.secciones_extra,
    };
  }
  const meta = r.meta as { origen?: VistaComun['origen'] } | undefined;
  return {
    origen: meta?.origen,
    puntaje: typeof r.puntaje_cumplimiento === 'number' ? { etiqueta: 'Puntaje de cumplimiento', valor: r.puntaje_cumplimiento } : null,
    resumen: typeof r.resumen_ejecutivo === 'string' ? r.resumen_ejecutivo : null,
    conteos: (
      [
        ['Permisos', 'permisos_licencias'],
        ['Fiscales', 'obligaciones_fiscales'],
        ['Laborales', 'obligaciones_laborales'],
        ['Digital', 'regulacion_digital'],
        ['Comercio exterior', 'regulacion_comercio_exterior'],
        ['Alertas', 'alertas'],
        ['Checklist', 'checklist'],
      ] as const
    ).map(([etiqueta, clave]) => [etiqueta, largo(r[clave])]),
    transparencia: r.transparencia as Transparencia | undefined,
    secciones_extra: r.secciones_extra as SeccionExtra[] | undefined,
  };
}

const ORIGEN: Record<NonNullable<VistaComun['origen']>, { texto: string; clase: string }> = {
  ia: { texto: 'Respuesta de la IA', clase: 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10' },
  mixto: { texto: 'Parte de la IA, parte de plantilla', clase: 'text-amber-300 border-amber-500/25 bg-amber-500/10' },
  plantilla: { texto: 'Plantilla (la IA no se usó o falló)', clase: 'text-amber-300 border-amber-500/25 bg-amber-500/10' },
};

function VistaPrueba({ prueba }: { prueba: ResultadoPrueba }) {
  const v = vistaDePrueba(prueba.resultado);
  const origen = ORIGEN[v.origen ?? 'plantilla'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
        <span className="font-semibold text-white/80">{prueba.caso.titulo}</span>
        <span>· {prueba.caso.pais}</span>
        <span>· {(prueba.duracion_ms / 1000).toFixed(1)} s</span>
        <span className={`rounded-full border px-2 py-0.5 font-bold ${origen.clase}`}>{origen.texto}</span>
      </div>
      {prueba.sin_clave_ia && (
        <p className="text-xs text-amber-200/80">Este servidor no tiene clave de IA: la prueba no ejercita el prompt.</p>
      )}
      {v.puntaje && (
        <p className="text-xs text-white/50">
          {v.puntaje.etiqueta}: <span className="font-bold text-white/80">{v.puntaje.valor}/100</span>
        </p>
      )}
      {v.resumen && <p className="text-sm text-white/75 leading-relaxed">{v.resumen}</p>}
      <div className="flex flex-wrap gap-2">
        {v.conteos.map(([etiqueta, valor]) => (
          <span key={etiqueta} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/60">
            {etiqueta}: <span className="font-bold text-white/85">{valor === 'oculta' ? 'oculta' : valor}</span>
          </span>
        ))}
      </div>
      <TransparenciaIA transparencia={v.transparencia} />
      <SeccionesExtra secciones={v.secciones_extra} />
      <details className="rounded-xl border border-white/[0.08] bg-black/20">
        <summary className="cursor-pointer px-3 py-2 text-[11px] text-white/50">Ver JSON completo</summary>
        <pre className="max-h-[360px] overflow-auto px-3 pb-3 text-[10px] text-white/60 whitespace-pre-wrap">
          {JSON.stringify(prueba.resultado, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-white/5 border border-white/10 text-white placeholder-white/25 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/20';

export default function EditorPromptPage() {
  const router = useRouter();
  const params = useParams();
  const clave = decodeURIComponent(String(params?.clave ?? ''));

  const [detalle, setDetalle] = useState<DetallePrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [contenido, setContenido] = useState('');
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [extras, setExtras] = useState<SeccionExtraDef[]>([]);
  const [notas, setNotas] = useState('');
  const [sucio, setSucio] = useState(false);

  const [caso, setCaso] = useState('');
  const [prueba, setPrueba] = useState<ResultadoPrueba | null>(null);
  const [verDiff, setVerDiff] = useState(false);

  const borrador = detalle?.versiones.find((v) => v.estado === 'borrador') ?? null;
  const publicada = detalle?.versiones.find((v) => v.estado === 'publicado') ?? null;
  const textoEnUso = publicada?.contenido ?? detalle?.repositorio ?? '';

  const mensajeDeError = (e: unknown, porDefecto: string) =>
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? porDefecto;

  const cargar = useCallback(async () => {
    try {
      const d = await leerPrompt(clave);
      setDetalle(d);
      const b = d.versiones.find((v) => v.estado === 'borrador');
      if (b) {
        setContenido(b.contenido);
        setOcultas(b.secciones_ocultas ?? []);
        setExtras(b.secciones_extra ?? []);
        setNotas(b.notas ?? '');
        setSucio(false);
      }
      setCaso((c) => c || d.casos[0]?.id || '');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        router.push('/dashboard/admin');
        return;
      }
      setError(mensajeDeError(e, 'No se pudo cargar el prompt.'));
    }
  }, [clave, router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (fn: () => Promise<void>, ok?: string) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await fn();
      if (ok) setAviso(ok);
      await cargar();
    } catch (e) {
      setError(mensajeDeError(e, 'La operación falló.'));
    } finally {
      setOcupado(false);
    }
  };

  const guardar = () =>
    borrador &&
    guardarBorradorPrompt(borrador.id, {
      contenido,
      notas: notas || null,
      ...(detalle?.tipo === 'modo' ? { secciones_ocultas: ocultas, secciones_extra: extras } : {}),
    });

  const probar = async () => {
    if (!borrador || !caso) return;
    setOcupado(true);
    setError(null);
    setPrueba(null);
    try {
      if (sucio) {
        await guardar();
        setSucio(false);
      }
      setPrueba(await probarPrompt(borrador.id, caso));
    } catch (e) {
      setError(mensajeDeError(e, 'La prueba falló.'));
    } finally {
      setOcupado(false);
    }
  };

  const publicar = (version: VersionPrompt) => {
    const esBorrador = version.estado === 'borrador';
    const motivo = esBorrador
      ? notas.trim()
      : (window.prompt(`¿Por qué restauras la versión ${version.version}?`) ?? '').trim();
    if (motivo.length < 5) {
      setError(esBorrador ? 'Escribe en «Notas» qué cambia en esta versión (mínimo 5 caracteres).' : 'Hace falta un motivo.');
      return;
    }
    if (esBorrador && sucio) {
      setError('Guarda los cambios y pruébalos antes de publicar.');
      return;
    }
    const codigo = pedirCodigoTotp();
    if (!codigo) return;
    accion(async () => {
      await publicarPrompt(version.id, motivo, codigo);
    }, esBorrador ? `Versión ${version.version} publicada.` : `Versión ${version.version} restaurada.`);
  };

  const usarRepositorio = () => {
    const motivo = (window.prompt('¿Por qué vuelves al texto del código?') ?? '').trim();
    if (motivo.length < 5) return;
    const codigo = pedirCodigoTotp();
    if (!codigo) return;
    accion(async () => {
      await usarRepositorioPrompt(clave, motivo, codigo);
    }, 'Se volvió al texto del código.');
  };

  const cambiar = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setSucio(true);
  };

  if (!detalle) {
    return (
      <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
        {error ? <p className="text-rose-300 text-sm">{error}</p> : <p className="text-white/40 text-sm">Cargando…</p>}
      </div>
    );
  }

  const ocultables = detalle.secciones_nativas.filter((s) => s.ocultable);

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto space-y-6">
      <Link href="/dashboard/admin/prompts" className="text-white/40 hover:text-white text-xs font-semibold">
        ← Prompts de IA
      </Link>

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{detalle.titulo}</h1>
        <p className="text-[11px] text-white/35 font-mono mt-1">{detalle.clave}</p>
        <p className="text-sm text-white/50 mt-2">
          En uso:{' '}
          <span className="text-white/80 font-semibold">
            {publicada ? `versión ${publicada.version} (publicada ${FECHA(publicada.fecha_publicacion)})` : detalle.repositorio ? 'texto del código' : 'ninguno (país sin ficha)'}
          </span>
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {aviso}
        </p>
      )}

      {/* ── Borrador ─────────────────────────────────────────────────── */}
      {!borrador ? (
        <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/60">No hay borrador. Crea uno a partir de lo que está en uso.</p>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => accion(async () => void (await crearBorradorPrompt(clave)), 'Borrador creado.')}
            className="rounded-xl bg-white text-black px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            Crear borrador
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border border-sky-500/20 bg-[#1C1C1E] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold">
              Borrador · versión {borrador.version}
              {sucio && <span className="ml-2 text-[11px] font-normal text-amber-300">cambios sin guardar</span>}
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setVerDiff((v) => !v)}
                className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white"
              >
                {verDiff ? 'Ocultar diferencias' : 'Ver diferencias con lo que está en uso'}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  if (window.confirm('¿Descartar este borrador? No afecta a lo publicado.')) {
                    accion(() => descartarBorradorPrompt(borrador.id), 'Borrador descartado.');
                  }
                }}
                className="rounded-xl border border-rose-500/25 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Descartar
              </button>
            </div>
          </div>

          {verDiff && <VistaDiff antes={textoEnUso} despues={contenido} />}

          <div>
            <label htmlFor="contenido-prompt" className="block text-xs font-semibold text-white/70 mb-1.5">
              Texto del {detalle.tipo === 'modo' ? 'modo de comportamiento' : 'la ficha de país'}
            </label>
            <textarea
              id="contenido-prompt"
              value={contenido}
              onChange={(e) => cambiar(setContenido)(e.target.value)}
              rows={24}
              spellCheck={false}
              className={`${inputCls} font-mono text-[12px] leading-relaxed`}
            />
            <p className="text-[11px] text-white/30 mt-1 tabular-nums">
              {contenido.length.toLocaleString('es-MX')} caracteres · el formato de salida y las reglas de seguridad se añaden solos
            </p>
          </div>

          {detalle.tipo === 'modo' && ocultables.length > 0 && (
            <fieldset>
              <legend className="text-xs font-semibold text-white/70 mb-2">Secciones ocultas</legend>
              <p className="text-[11px] text-white/35 mb-2">Una sección oculta no se genera ni se muestra en los análisis nuevos.</p>
              <div className="flex flex-wrap gap-2">
                {ocultables.map((s) => {
                  const activa = ocultas.includes(s.clave);
                  return (
                    <label
                      key={s.clave}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${
                        activa ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-white/10 text-white/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={activa}
                        onChange={() =>
                          cambiar(setOcultas)(activa ? ocultas.filter((c) => c !== s.clave) : [...ocultas, s.clave])
                        }
                        className="accent-amber-400"
                      />
                      {s.titulo}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {detalle.tipo === 'modo' && (
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-white/70">Secciones extra</legend>
              <p className="text-[11px] text-white/35">
                Se añaden al resultado en una tarjeta genérica (título, resumen y puntos). Máximo 5.
              </p>
              {extras.map((s, i) => (
                <div key={i} className="rounded-xl border border-white/[0.08] p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      aria-label="Identificador"
                      value={s.slug}
                      onChange={(e) =>
                        cambiar(setExtras)(extras.map((x, j) => (j === i ? { ...x, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') } : x)))
                      }
                      placeholder="identificador_en_minusculas"
                      className={`${inputCls} font-mono text-xs`}
                    />
                    <input
                      aria-label="Título"
                      value={s.titulo}
                      onChange={(e) => cambiar(setExtras)(extras.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
                      placeholder="Título que verá el cliente"
                      className={inputCls}
                    />
                  </div>
                  <textarea
                    aria-label="Instrucciones"
                    value={s.instrucciones}
                    onChange={(e) =>
                      cambiar(setExtras)(extras.map((x, j) => (j === i ? { ...x, instrucciones: e.target.value } : x)))
                    }
                    rows={3}
                    placeholder="Qué debe analizar la IA en esta sección"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => cambiar(setExtras)(extras.filter((_, j) => j !== i))}
                    className="text-[11px] text-rose-300 hover:underline"
                  >
                    Quitar sección
                  </button>
                </div>
              ))}
              {extras.length < 5 && (
                <button
                  type="button"
                  onClick={() => cambiar(setExtras)([...extras, { slug: '', titulo: '', instrucciones: '' }])}
                  className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white"
                >
                  + Añadir sección extra
                </button>
              )}
            </fieldset>
          )}

          <div>
            <label htmlFor="notas-prompt" className="block text-xs font-semibold text-white/70 mb-1.5">
              Notas de la versión (qué cambia y por qué)
            </label>
            <input
              id="notas-prompt"
              value={notas}
              maxLength={500}
              onChange={(e) => cambiar(setNotas)(e.target.value)}
              className={inputCls}
              placeholder="Ej.: se añade la ficha de Guatemala revisada por un contador local"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              disabled={ocupado || !sucio}
              onClick={() => accion(async () => void (await guardar()), 'Borrador guardado.')}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-40"
            >
              Guardar
            </button>
            {detalle.casos.length > 0 && (
              <>
                <select
                  aria-label="Caso de prueba"
                  value={caso}
                  onChange={(e) => setCaso(e.target.value)}
                  className={`${inputCls} w-auto max-w-full`}
                >
                  {detalle.casos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.pais} · {c.titulo}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={ocupado || !caso}
                  onClick={probar}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 disabled:opacity-40"
                >
                  {ocupado ? 'Trabajando…' : 'Probar'}
                </button>
              </>
            )}
            <button
              type="button"
              disabled={ocupado}
              onClick={() => publicar(borrador)}
              className="ml-auto rounded-xl bg-white text-black px-4 py-2 text-sm font-bold disabled:opacity-40"
            >
              Publicar
            </button>
          </div>

          {prueba && (
            <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
              <VistaPrueba prueba={prueba} />
            </div>
          )}
        </section>
      )}

      {/* ── Historial ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 className="text-sm font-bold">Historial</h2>
          {publicada && detalle.repositorio && (
            <button
              type="button"
              disabled={ocupado}
              onClick={usarRepositorio}
              className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white disabled:opacity-40"
            >
              Volver al texto del código
            </button>
          )}
        </div>
        {detalle.versiones.length === 0 ? (
          <p className="px-5 pb-4 text-xs text-white/40">Todavía no hay versiones: se usa el texto del código.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {detalle.versiones.map((v) => (
              <li key={v.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white/85">
                    Versión {v.version}{' '}
                    <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${ESTADO_CLASE[v.estado]}`}>
                      {v.estado}
                    </span>
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {v.notas || 'Sin notas'} · creada {FECHA(v.fecha_creacion)}
                    {v.creado_por ? ` por ${v.creado_por}` : ''}
                    {v.fecha_publicacion ? ` · publicada ${FECHA(v.fecha_publicacion)}${v.publicado_por ? ` por ${v.publicado_por}` : ''}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {v.estado === 'archivado' && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => publicar(v)}
                      className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white disabled:opacity-40"
                    >
                      Restaurar
                    </button>
                  )}
                  {v.estado !== 'borrador' && !borrador && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => accion(async () => void (await crearBorradorPrompt(clave, v.id)), 'Borrador creado.')}
                      className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white disabled:opacity-40"
                    >
                      Borrador desde aquí
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
