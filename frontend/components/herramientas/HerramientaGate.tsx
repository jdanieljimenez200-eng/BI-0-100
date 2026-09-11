'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import api from '@/lib/api';

/**
 * Gate de ACCESO POR PLAN a una herramienta. Se monta POR ENCIMA de
 * <ProductoGate> (que es un gate de PRODUCTO, no de plan) para que entrar por
 * URL directa a /dashboard/herramientas/* no renderice la herramienta completa
 * y falle recién en el primer request.
 *
 * Fuente de verdad: GET /api/herramientas. No se recalcula el plan en cliente;
 * se usa el `estado` que ya resuelve el backend (computeHerramientasAbribles):
 *   - abrible       → deja pasar a children
 *   - sin_permiso   → la cuenta la tiene, pero el trabajador no tiene el permiso
 *   - no_contratada → la cuenta no la ha activado (CTA de activar o de mejorar)
 *
 * El bloqueo del cliente es UX, no seguridad: los routers del backend montan
 * requireToolCapability + requireHerramientaAccess.
 */

export type AcentoGate = 'emerald' | 'amber' | 'blue' | 'violet' | 'cyan' | 'rose' | 'teal';

type EstadoHerramienta = 'abrible' | 'sin_permiso' | 'no_contratada';

interface HerramientaEstadoDTO {
  herramienta: string;
  estado: EstadoHerramienta;
  origen: 'incluida' | 'pago' | null;
  label: string;
  precio_mxn: number;
}

interface HerramientasResponseDTO {
  account_role: string;
  plan: string;
  seleccion: { permite: boolean; max: number };
  herramientas: HerramientaEstadoDTO[];
}

interface HerramientaGateProps {
  /** Clave de capacidad del backend: pos, inventario, citas, clientes, cotizaciones, nomina, contabilidad. */
  herramienta: string;
  /** Nombre visible de la herramienta, para los mensajes. */
  nombre: string;
  acento?: AcentoGate;
  children: React.ReactNode;
}

const ACENTO: Record<AcentoGate, { texto: string; borde: string; fondo: string; anillo: string }> = {
  emerald: { texto: 'text-emerald-300', borde: 'border-emerald-500/30', fondo: 'bg-emerald-500/10', anillo: 'focus-visible:ring-emerald-300/60' },
  amber:   { texto: 'text-amber-300',   borde: 'border-amber-500/30',   fondo: 'bg-amber-500/10',   anillo: 'focus-visible:ring-amber-300/60' },
  blue:    { texto: 'text-blue-300',    borde: 'border-blue-500/30',    fondo: 'bg-blue-500/10',    anillo: 'focus-visible:ring-blue-300/60' },
  violet:  { texto: 'text-violet-300',  borde: 'border-violet-500/30',  fondo: 'bg-violet-500/10',  anillo: 'focus-visible:ring-violet-300/60' },
  cyan:    { texto: 'text-cyan-300',    borde: 'border-cyan-500/30',    fondo: 'bg-cyan-500/10',    anillo: 'focus-visible:ring-cyan-300/60' },
  rose:    { texto: 'text-rose-300',    borde: 'border-rose-500/30',    fondo: 'bg-rose-500/10',    anillo: 'focus-visible:ring-rose-300/60' },
  teal:    { texto: 'text-teal-300',    borde: 'border-teal-500/30',    fondo: 'bg-teal-500/10',    anillo: 'focus-visible:ring-teal-300/60' },
};

function mensajeDeError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  return fallback;
}

export default function HerramientaGate({
  herramienta,
  nombre,
  acento = 'emerald',
  children,
}: HerramientaGateProps) {
  const [datos, setDatos] = useState<HerramientasResponseDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [mutando, setMutando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(false);
    setAviso(null);
    try {
      const { data } = await api.get<HerramientasResponseDTO>('/herramientas');
      setDatos(data);
    } catch (err) {
      // El 401 lo gestiona el interceptor de lib/api (refresh o login).
      setFallo(true);
      setAviso(mensajeDeError(err, 'No pudimos verificar tu acceso a esta herramienta.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const c = ACENTO[acento] ?? ACENTO.emerald;

  if (cargando) {
    return (
      <div role="status" className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-5">
        <div className={`w-9 h-9 rounded-xl border ${c.borde} ${c.fondo} animate-pulse`} aria-hidden="true" />
        <div className="w-40 h-3 rounded-full bg-white/[.08] animate-pulse" aria-hidden="true" />
        <span className="sr-only">Verificando tu acceso a {nombre}…</span>
      </div>
    );
  }

  if (fallo || !datos) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-[14px] font-bold text-white/85">No pudimos verificar tu acceso</p>
        <p aria-live="polite" className="text-[12px] text-white/45 max-w-[42ch] leading-relaxed">
          {aviso ?? 'Inténtalo de nuevo en unos segundos.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => void cargar()}
            className={`inline-flex items-center px-3.5 py-2 rounded-xl text-[12px] font-bold text-white/80 border border-white/15 bg-white/[.04] transition-colors duration-200 hover:bg-white/[.08] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 ${c.anillo}`}
          >
            Reintentar
          </button>
          <Link
            href="/dashboard/herramientas"
            className="inline-flex items-center px-3.5 py-2 rounded-xl text-[12px] font-bold text-white/55 border border-white/10 transition-colors duration-200 hover:text-white/80 hover:bg-white/[.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Volver a herramientas
          </Link>
        </div>
      </div>
    );
  }

  const lista = datos.herramientas ?? [];
  const entrada = lista.find((h) => h.herramienta === herramienta) ?? null;

  // Sin entrada en el catálogo la tratamos como bloqueada: nunca abrimos por defecto.
  if (entrada?.estado === 'abrible') return <>{children}</>;

  const esOwner = datos.account_role === 'owner';
  const permiteSeleccion = !!datos.seleccion?.permite;
  const max = datos.seleccion?.max ?? -1;
  const activadas = lista.filter((h) => h.estado !== 'no_contratada').length;
  const hayCupo = max === -1 || activadas < max;
  const sinPermiso = entrada?.estado === 'sin_permiso';
  const activable = !sinPermiso && permiteSeleccion && esOwner;

  const activar = async () => {
    if (mutando) return;
    setMutando(true);
    setAviso(null);
    try {
      await api.post('/herramientas/seleccionar', { herramienta_key: herramienta });
      await cargar();
    } catch (err) {
      setAviso(mensajeDeError(err, 'No pudimos activar la herramienta. Inténtalo de nuevo.'));
    } finally {
      setMutando(false);
    }
  };

  const titulo = sinPermiso
    ? `No tienes acceso a ${nombre}`
    : `${nombre} no está activada`;

  const detalle = sinPermiso
    ? esOwner
      ? 'Tu cuenta incluye esta herramienta, pero no tiene permisos asignados para este producto. Puedes habilitarla desde el panel de Equipo.'
      : 'Tu cuenta tiene esta herramienta, pero el dueño no te ha asignado permiso para usarla en este producto. Pídele que active la casilla correspondiente en la vista de Equipo.'
    : activable
      ? hayCupo
        ? `Tu plan te deja elegir qué herramientas usar. Actívala ahora y empieza a trabajar${max === -1 ? '' : ` (usas ${activadas} de ${max})`}.`
        : `Ya usas las ${max} herramienta${max === 1 ? '' : 's'} que incluye tu plan. Desactiva una desde Herramientas o mejora tu plan para tener más.`
      : esOwner
        ? 'Tu plan no incluye esta herramienta. Mejora tu plan para desbloquearla.'
        : 'La cuenta no tiene esta herramienta activada. Pídele al dueño que la active.';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-5 py-10">
      <div
        className={`w-full max-w-md rounded-2xl border ${c.borde} bg-white/[.02] p-6 sm:p-7 text-center`}
      >
        <span
          aria-hidden="true"
          className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border ${c.borde} ${c.fondo} text-white/80`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>

        <h1 className="mt-4 text-[16px] sm:text-[17px] font-bold text-white/90 tracking-tight leading-snug break-words">
          {titulo}
        </h1>
        <p className="mt-2 text-[12.5px] text-white/45 leading-relaxed break-words">
          {detalle}
        </p>

        {aviso && (
          <p
            role="alert"
            className="mt-3 text-[12px] text-rose-300/90 leading-relaxed break-words"
          >
            {aviso}
          </p>
        )}

        <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
          {sinPermiso && esOwner && (
            <Link
              href="/dashboard/equipo"
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12.5px] font-bold ${c.texto} border ${c.borde} ${c.fondo} transition-all duration-200 hover:brightness-125 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 ${c.anillo}`}
            >
              Gestionar permisos en Equipo
            </Link>
          )}

          {activable && hayCupo && (
            <button
              type="button"
              onClick={() => void activar()}
              disabled={mutando}
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12.5px] font-bold ${c.texto} border ${c.borde} ${c.fondo} transition-all duration-200 hover:brightness-125 active:scale-[.97] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 ${c.anillo}`}
            >
              {mutando ? 'Activando…' : `Activar ${nombre}`}
            </button>
          )}

          {(!activable || !hayCupo) && !sinPermiso && esOwner && (
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12.5px] font-bold text-amber-300 border border-amber-400/30 bg-amber-500/10 transition-all duration-200 hover:bg-amber-500/20 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
            >
              Mejorar plan
            </Link>
          )}

          <Link
            href="/dashboard/herramientas"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-[12.5px] font-bold text-white/55 border border-white/10 transition-colors duration-200 hover:text-white/80 hover:bg-white/[.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Volver a herramientas
          </Link>
        </div>
      </div>
    </div>
  );
}