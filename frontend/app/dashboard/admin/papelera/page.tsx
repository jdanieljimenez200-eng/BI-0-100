'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { listarPapelera, restaurarCuenta, miRolAdmin, pedirCodigoTotp, type CuentaEnPapelera } from '@/lib/admin';

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

function errorDe(e: unknown, porDefecto: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? porDefecto;
}

/**
 * Papelera de cuentas.
 *
 * Lo que está aquí no se ha borrado todavía: nadie puede entrar en esas cuentas
 * ni ver sus fichas, pero se pueden restaurar hasta que se cumplan los 30 días.
 * Después, la purga diaria las borra con todos sus ficheros, sin vuelta atrás.
 */
export default function PapeleraPage() {
  const router = useRouter();
  const [cuentas, setCuentas] = useState<CuentaEnPapelera[] | null>(null);
  const [dias, setDias] = useState(30);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const yo = await miRolAdmin();
      if (!yo.permisos.gestionarPapelera) {
        router.push('/dashboard/admin');
        return;
      }
      const datos = await listarPapelera();
      setCuentas(datos.cuentas);
      setDias(datos.dias);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        router.push('/dashboard/admin');
        return;
      }
      setError('No se pudo cargar la papelera.');
    }
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const restaurar = async (c: CuentaEnPapelera) => {
    const motivo = window.prompt(`Motivo para restaurar ${c.email} (queda en el registro de auditoría):`);
    if (!motivo || !motivo.trim()) return;
    const codigo = pedirCodigoTotp();
    if (!codigo) return;

    setOcupado(c.id);
    setError(null);
    setAviso(null);
    try {
      const r = await restaurarCuenta(c.id, motivo.trim(), codigo);
      setAviso(`${c.email}: ${r.message}`);
      await cargar();
    } catch (e) {
      setError(errorDe(e, 'No se pudo restaurar.'));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="p-6 sm:p-8 max-w-[900px] mx-auto">
      <Link href="/dashboard/admin" className="text-white/40 hover:text-white text-xs font-semibold">
        ← Centro de Control
      </Link>

      <h1 className="text-2xl font-extrabold tracking-tight mt-4 mb-1">Papelera</h1>
      <p className="text-white/40 text-sm mb-6 max-w-2xl">
        Estas cuentas están desactivadas y ocultas, pero todavía existen. Se pueden restaurar durante{' '}
        {dias} días; después se borran definitivamente, con sus ficheros y documentos.
      </p>

      {aviso && (
        <div className="mb-4 rounded-xl border border-white/15 bg-white/[0.04] p-4">
          <p className="text-white/70 text-sm">{aviso}</p>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-rose-300 text-sm">{error}</p>
        </div>
      )}

      {cuentas === null ? (
        <p className="text-white/40 text-sm">Cargando…</p>
      ) : cuentas.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-white/50 text-sm">La papelera está vacía.</p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
          {cuentas.map((c) => {
            const urgente = c.dias_restantes <= 3;
            // Un trabajador vuelve con su dueño, no por separado.
            const vaConSuDueno = Boolean(c.owner_id) && cuentas.some((o) => o.id === c.owner_id);
            return (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 p-4 bg-white/[0.02]">
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {c.email}
                    {c.account_role === 'trabajador' && (
                      <span className="text-white/30 text-xs font-normal"> · trabajador</span>
                    )}
                  </p>
                  <p className="text-white/30 text-xs mt-0.5">
                    Enviada el {FECHA.format(new Date(c.eliminado_en))}
                    {c.eliminado_por_email ? ` por ${c.eliminado_por_email}` : ''}
                  </p>
                  {c.motivo_eliminacion && (
                    <p className="text-white/50 text-xs mt-1.5 border-l-2 border-white/10 pl-2">{c.motivo_eliminacion}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold ${urgente ? 'text-rose-300' : 'text-white/50'}`}>
                    {c.dias_restantes === 0
                      ? 'Se borra en la próxima purga'
                      : `${c.dias_restantes} ${c.dias_restantes === 1 ? 'día' : 'días'}`}
                  </span>
                  {vaConSuDueno ? (
                    <span className="text-white/30 text-xs">Vuelve con su dueño</span>
                  ) : (
                    <button
                      onClick={() => restaurar(c)}
                      disabled={ocupado === c.id}
                      className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      Restaurar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
