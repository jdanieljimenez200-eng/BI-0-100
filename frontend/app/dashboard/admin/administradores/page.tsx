'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  listarAdministradores,
  cambiarRolAdmin,
  buscarUsuarios,
  miRolAdmin,
  NOMBRE_ROL,
  DESCRIPCION_ROL,
  type Administrador,
  type AdminRol,
  type UsuarioBuscado,
} from '@/lib/admin';

const ROLES: AdminRol[] = ['soporte', 'moderador', 'superadmin'];

function errorDe(e: unknown, porDefecto: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? porDefecto;
}

/**
 * Equipo de administración: quién tiene acceso al panel y con qué rol.
 *
 * Cada cambio pide motivo (queda en la auditoría) y el backend impone las reglas
 * que no se pueden saltar desde aquí: nadie cambia su propio rol, y no se puede
 * quedar la plataforma sin superadmin.
 */
export default function AdministradoresPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<Administrador[] | null>(null);
  const [miId, setMiId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<UsuarioBuscado[]>([]);
  const [nuevoRol, setNuevoRol] = useState<AdminRol>('soporte');

  const cargar = useCallback(async () => {
    try {
      const [lista, yo] = await Promise.all([listarAdministradores(), miRolAdmin()]);
      if (!yo.permisos.gestionarRoles) {
        router.push('/dashboard/admin');
        return;
      }
      setMiId(yo.id);
      setAdmins(lista);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        router.push('/dashboard/admin');
        return;
      }
      setError('No se pudo cargar el equipo de administración.');
    }
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Búsqueda con retardo: no una petición por tecla.
  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 3) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      buscarUsuarios(texto)
        .then((u) => setResultados(u.slice(0, 8)))
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cambiar = async (id: string, email: string, rol: AdminRol | null) => {
    const accion = rol ? `dar el rol ${NOMBRE_ROL[rol]} a ${email}` : `retirar el acceso de administración a ${email}`;
    const motivo = window.prompt(`Motivo para ${accion} (queda en el registro de auditoría):`);
    if (!motivo || !motivo.trim()) return;

    setOcupado(id);
    setError(null);
    setAviso(null);
    try {
      const { message } = await cambiarRolAdmin(id, rol, motivo.trim());
      setAviso(`${email}: ${message}`);
      setBusqueda('');
      await cargar();
    } catch (e) {
      setError(errorDe(e, 'No se pudo cambiar el rol.'));
    } finally {
      setOcupado(null);
    }
  };

  const idsAdmin = new Set((admins ?? []).map((a) => a.id));

  return (
    <div className="p-6 sm:p-8 max-w-[900px] mx-auto">
      <Link href="/dashboard/admin" className="text-white/40 hover:text-white text-xs font-semibold">
        ← Centro de Control
      </Link>

      <h1 className="text-2xl font-extrabold tracking-tight mt-4 mb-1">Equipo de administración</h1>
      <p className="text-white/40 text-sm mb-6 max-w-2xl">
        Cada persona debería tener solo el rol que necesita para su trabajo. Una cuenta de soporte
        comprometida no puede cambiar planes ni leer cédulas; una de superadmin, sí.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-white text-sm font-bold">{NOMBRE_ROL[r]}</p>
            <p className="text-white/40 text-xs mt-1 leading-relaxed">{DESCRIPCION_ROL[r]}</p>
          </div>
        ))}
      </div>

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

      {/* ── Dar acceso ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-6">
        <h2 className="text-sm font-bold text-white mb-3">Dar acceso a alguien</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca por email o nombre (mín. 3 letras)"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
          />
          <select
            value={nuevoRol}
            onChange={(e) => setNuevoRol(e.target.value as AdminRol)}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
          >
            {ROLES.map((r) => (
              <option key={r} value={r} className="bg-[#0B1420]">
                {NOMBRE_ROL[r]}
              </option>
            ))}
          </select>
        </div>
        {resultados.length > 0 && (
          <ul className="mt-3 divide-y divide-white/5 rounded-lg border border-white/5">
            {resultados.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="text-white/80 text-sm block truncate">{u.email}</span>
                  <span className="text-white/30 text-xs">{u.nombre}</span>
                </span>
                {idsAdmin.has(u.id) ? (
                  <span className="text-white/30 text-xs">Ya es admin</span>
                ) : (
                  <button
                    onClick={() => cambiar(u.id, u.email, nuevoRol)}
                    disabled={ocupado === u.id}
                    className="px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs font-bold hover:bg-white/5 disabled:opacity-50 flex-shrink-0"
                  >
                    Dar rol {NOMBRE_ROL[nuevoRol]}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Equipo actual ──────────────────────────────────────────────── */}
      {admins === null ? (
        <p className="text-white/40 text-sm">Cargando…</p>
      ) : (
        <ul className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
          {admins.map((a) => {
            const soyYo = a.id === miId;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white/[0.02]">
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {a.email}
                    {soyYo && <span className="text-white/30 text-xs font-normal"> · tú</span>}
                    {!a.activo && <span className="text-rose-300/70 text-xs font-normal"> · desactivada</span>}
                  </p>
                  <p className="text-white/30 text-xs">{a.nombre}</p>
                </div>
                {soyYo ? (
                  // El backend lo rechazaría igual: nadie cambia su propio rol.
                  <span className="text-white/50 text-xs font-bold">{NOMBRE_ROL[a.admin_rol]}</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={a.admin_rol}
                      disabled={ocupado === a.id}
                      onChange={(e) => cambiar(a.id, a.email, e.target.value as AdminRol)}
                      className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="bg-[#0B1420]">
                          {NOMBRE_ROL[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => cambiar(a.id, a.email, null)}
                      disabled={ocupado === a.id}
                      className="px-3 py-1.5 rounded-lg text-rose-300/70 hover:text-rose-300 text-xs font-semibold disabled:opacity-50"
                    >
                      Quitar acceso
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
