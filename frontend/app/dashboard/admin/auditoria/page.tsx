'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { leerAuditoria, type RegistroAuditoria } from '@/lib/admin';

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'medium' });

/** Nombre legible de cada acción. Lo que no esté aquí se muestra tal cual. */
const ACCIONES: Record<string, string> = {
  'usuario.desactivado': 'Desactivó una cuenta',
  'usuario.reactivado': 'Reactivó una cuenta',
  'usuario.plan_cambiado': 'Cambió un plan',
  'experto.aprobado': 'Aprobó una ficha',
  'experto.rechazado': 'Rechazó una ficha',
  'experto.suspendido': 'Suspendió una ficha',
  'experto.pendiente': 'Devolvió una ficha a revisión',
  'resena.ocultada': 'Ocultó una reseña',
  'resena.publicada': 'Volvió a publicar una reseña',
  'documento.abierto': 'Abrió una cédula',
};

const FILTROS = [
  { valor: '', texto: 'Todo' },
  { valor: 'usuario.', texto: 'Cuentas' },
  { valor: 'experto.', texto: 'Fichas' },
  { valor: 'resena.', texto: 'Reseñas' },
  { valor: 'documento.', texto: 'Cédulas abiertas' },
];

/** Muestra el cambio como "clave: antes → después", solo en lo que cambió. */
function Cambio({ antes, despues }: { antes: RegistroAuditoria['antes']; despues: RegistroAuditoria['despues'] }) {
  if (!antes && !despues) return null;
  const claves = Array.from(new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]));
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
      {claves.map((k) => {
        const a = antes?.[k];
        const d = despues?.[k];
        if (JSON.stringify(a) === JSON.stringify(d)) return null;
        return (
          <span key={k} className="text-[11px] font-mono text-white/50">
            {k}: <span className="text-rose-300/70">{a === undefined ? '—' : String(a)}</span>
            {' → '}
            <span className="text-emerald-300/80">{d === undefined ? '—' : String(d)}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Registro de auditoría de las acciones de administración.
 *
 * Solo lectura, y no por decisión de la interfaz: la base rechaza cualquier
 * cambio sobre la tabla. Lo que se ve aquí es lo que pasó.
 */
export default function AuditoriaPage() {
  const router = useRouter();
  const [accion, setAccion] = useState('');
  const [recurso, setRecurso] = useState('');
  const [page, setPage] = useState(1);
  const [datos, setDatos] = useState<{ registros: RegistroAuditoria[]; total: number; pages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(
        await leerAuditoria({
          accion: accion || undefined,
          recurso_id: recurso.trim() || undefined,
          page,
        })
      );
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        router.push('/dashboard');
        return;
      }
      setError('No se pudo cargar el registro.');
    }
  }, [accion, recurso, page, router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="p-6 sm:p-8 max-w-[1100px] mx-auto">
      <Link href="/dashboard/admin" className="text-white/40 hover:text-white text-xs font-semibold">
        ← Centro de Control
      </Link>

      <h1 className="text-2xl font-extrabold tracking-tight mt-4 mb-1">Registro de auditoría</h1>
      <p className="text-white/40 text-sm mb-6 max-w-2xl">
        Cada acción de administración, con quién la hizo, qué cambió y por qué. Este registro no se
        puede editar ni borrar: ni desde aquí ni desde la aplicación.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => {
              setAccion(f.valor);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              accion === f.valor ? 'bg-white text-[#070E17]' : 'text-white/50 hover:text-white border border-white/10'
            }`}
          >
            {f.texto}
          </button>
        ))}
        <input
          value={recurso}
          onChange={(e) => {
            setRecurso(e.target.value);
            setPage(1);
          }}
          placeholder="ID del usuario, ficha o reseña"
          className="ml-auto w-full sm:w-72 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 font-mono"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-rose-300 text-sm">{error}</p>
        </div>
      )}

      {datos === null ? (
        <p className="text-white/40 text-sm">Cargando…</p>
      ) : datos.registros.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-white/50 text-sm">No hay acciones registradas con ese filtro.</p>
        </div>
      ) : (
        <>
          <p className="text-white/30 text-xs mb-3">{datos.total} registros</p>
          <ul className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
            {datos.registros.map((r) => (
              <li key={r.id} className="p-4 bg-white/[0.02]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm">
                    <span className="text-white font-semibold">{r.admin_email}</span>{' '}
                    <span className="text-white/30 text-[10px] uppercase tracking-widest">{r.admin_rol}</span>{' '}
                    <span className="text-white/70">{ACCIONES[r.accion] ?? r.accion}</span>
                  </p>
                  <time className="text-white/30 text-xs" dateTime={r.fecha}>
                    {FECHA.format(new Date(r.fecha))}
                  </time>
                </div>
                <p className="text-white/30 text-[11px] font-mono mt-0.5">
                  {r.recurso_tipo} {r.recurso_id}
                  {r.ip ? ` · ${r.ip}` : ''}
                </p>
                <Cambio antes={r.antes} despues={r.despues} />
                {r.motivo && (
                  <p className="text-white/60 text-xs mt-2 border-l-2 border-white/10 pl-3">{r.motivo}</p>
                )}
              </li>
            ))}
          </ul>

          {datos.pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-lg border border-white/10 text-xs font-bold text-white/60 disabled:opacity-30"
              >
                Anterior
              </button>
              <span className="text-white/40 text-xs">
                Página {page} de {datos.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(datos.pages, p + 1))}
                disabled={page >= datos.pages}
                className="px-4 py-2 rounded-lg border border-white/10 text-xs font-bold text-white/60 disabled:opacity-30"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
