'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';
import { MOTION_SPRINGS } from '@/lib/motion/tokens';

// ─── Tipos (espejo de los contratos del backend /api/equipo) ──────────────────
type Grupo = 'analisis' | 'herramientas';

interface CapabilityMeta {
  key: string;
  grupo: Grupo;
  label: string;
  sensible: boolean;
}

interface Trabajador {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  fecha_creacion: string;
  asignaciones_activas: number;
}

interface Invitacion {
  id: string;
  codigo: string;
  email_destino: string | null;
  expira_en: string;
  fecha_creacion: string;
}

interface EquipoData {
  plan: string;
  max_trabajadores: number; // -1 = ilimitado, 0 = sin equipo
  total: number;
  puede_agregar: boolean;
  trabajadores: Trabajador[];
}

interface Asignacion {
  id: string;
  producto_id: string;
  permisos: Record<string, boolean>;
  activo: boolean;
  producto_nombre: string;
}

interface ProductoLite {
  id: string;
  nombre: string;
}

// ─── Switch accesible con física spring ─────────────────────────────────────────
function Switch({
  on,
  sensible,
  onToggle,
  label,
  disabled = false,
}: {
  on: boolean;
  sensible: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      whileTap={disabled || shouldReduce ? undefined : { scale: 0.94 }}
      className={`relative w-10 h-6 p-0.5 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1C2A] focus-visible:ring-brand-accent/60 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${
        on
          ? sensible
            ? 'bg-brand-accent shadow-[0_0_12px_rgba(231,76,60,0.4)]'
            : 'bg-[#22D3EE] shadow-[0_0_12px_rgba(34,211,238,0.4)]'
          : 'bg-white/10'
      }`}
    >
      <motion.span
        animate={{ x: on ? 16 : 0 }}
        transition={shouldReduce ? { duration: 0 } : MOTION_SPRINGS.snappy}
        className="block w-5 h-5 rounded-full bg-white shadow-md pointer-events-none"
      />
    </motion.button>
  );
}

export default function EquipoPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<CapabilityMeta[]>([]);
  const [data, setData] = useState<EquipoData | null>(null);
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);

  // Modos de alta
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<'invitacion' | 'directa'>('invitacion');

  // Formulario alta directa
  const [form, setForm] = useState({ email: '', nombre: '', password: '' });
  const [showWorkerPass, setShowWorkerPass] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Formulario de invitación por código / enlace
  const [invForm, setInvForm] = useState({ email_destino: '', dias_validez: 7 });
  const [inviting, setInviting] = useState(false);
  const [invError, setInvError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Estados de mutación en progreso (prevención de condiciones de carrera)
  const [mutatingKeys, setMutatingKeys] = useState<Set<string>>(new Set());
  const [loadingAsigWorkers, setLoadingAsigWorkers] = useState<Set<string>>(new Set());
  const [assigningWorkerId, setAssigningWorkerId] = useState<string | null>(null);
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);
  const [revokingAsigId, setRevokingAsigId] = useState<string | null>(null);
  const [revokingInvId, setRevokingInvId] = useState<string | null>(null);

  // Asignaciones por trabajador (lazy-load al expandir)
  const [expanded, setExpanded] = useState<string | null>(null);
  const [asignaciones, setAsignaciones] = useState<Record<string, Asignacion[]>>({});
  const [addProductSel, setAddProductSel] = useState<Record<string, string>>({});

  // Carga inicial resiliente
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    setFetchError(null);
    try {
      const [capsRes, eqRes, prodsRes, invRes] = await Promise.all([
        api.get('/equipo/capabilities'),
        api.get('/equipo/trabajadores'),
        api.get('/dashboard/resumen'),
        api.get('/equipo/invitaciones').catch(() => ({ data: [] })),
      ]);

      setCapabilities(capsRes.data as CapabilityMeta[]);
      setData(eqRes.data as EquipoData);
      const listaProductos =
        (prodsRes.data as { productos?: ProductoLite[] } | null)?.productos ?? [];
      setProductos(listaProductos.map((p) => ({ id: p.id, nombre: p.nombre })));
      setInvitaciones(Array.isArray(invRes.data) ? invRes.data : []);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      if (e.response?.status === 403) {
        setForbidden(true);
      } else {
        const info = interpretarErrorApi(err, 'No se pudo cargar la información del equipo.');
        setFetchError(info.mensaje);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const reloadTrabajadores = async () => {
    try {
      const [eqRes, invRes] = await Promise.all([
        api.get('/equipo/trabajadores'),
        api.get('/equipo/invitaciones').catch(() => ({ data: [] })),
      ]);
      setData(eqRes.data as EquipoData);
      if (Array.isArray(invRes.data)) {
        setInvitaciones(invRes.data);
      }
    } catch (err) {
      console.error('[equipo] Error al recargar trabajadores:', err);
    }
  };

  // ─── Alta directa de trabajador ──────────────────────────────────────────
  const handleAddDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAdding(true);
    try {
      await api.post('/equipo/trabajadores', {
        email: form.email.trim(),
        nombre: form.nombre.trim(),
        password: form.password,
      });
      setForm({ email: '', nombre: '', password: '' });
      setShowAdd(false);
      await reloadTrabajadores();
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo crear el trabajador.');
      setAddError(info.mensaje);
    } finally {
      setAdding(false);
    }
  };

  // ─── Creación de Invitación (Código / Enlace) ─────────────────────────────
  const handleCreateInvitacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvError('');
    setInviting(true);
    try {
      const payload: { email_destino?: string; dias_validez?: number } = {
        dias_validez: Number(invForm.dias_validez) || 7,
      };
      if (invForm.email_destino.trim()) {
        payload.email_destino = invForm.email_destino.trim();
      }

      await api.post('/equipo/invitaciones', payload);
      setInvForm({ email_destino: '', dias_validez: 7 });
      await reloadTrabajadores();
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo generar la invitación.');
      setInvError(info.mensaje);
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvitacion = async (invId: string) => {
    if (!window.confirm('¿Revocar esta invitación? El código ya no podrá ser utilizado.')) return;
    setRevokingInvId(invId);
    try {
      await api.delete(`/equipo/invitaciones/${invId}`);
      setInvitaciones((prev) => prev.filter((i) => i.id !== invId));
      await reloadTrabajadores();
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo revocar la invitación.');
      alert(info.mensaje);
    } finally {
      setRevokingInvId(null);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(id);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      alert(`Código: ${text}`);
    }
  };

  const handleDeleteWorker = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar a "${nombre}"? Se revocarán todas sus asignaciones y accesos de inmediato.`)) return;
    setDeletingWorkerId(id);
    try {
      await api.delete(`/equipo/trabajadores/${id}`);
      if (expanded === id) setExpanded(null);
      setAsignaciones((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await reloadTrabajadores();
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo eliminar el trabajador.');
      alert(info.mensaje);
    } finally {
      setDeletingWorkerId(null);
    }
  };

  // ─── Expandir + cargar asignaciones ─────────────────────────────────────────
  const toggleExpand = async (workerId: string) => {
    if (expanded === workerId) {
      setExpanded(null);
      return;
    }
    setExpanded(workerId);
    if (!asignaciones[workerId]) {
      setLoadingAsigWorkers((prev) => new Set(prev).add(workerId));
      try {
        const { data: d } = await api.get(`/equipo/trabajadores/${workerId}/asignaciones`);
        setAsignaciones((prev) => ({ ...prev, [workerId]: d as Asignacion[] }));
      } catch (err) {
        console.error('[equipo] Error al cargar asignaciones:', err);
      } finally {
        setLoadingAsigWorkers((prev) => {
          const next = new Set(prev);
          next.delete(workerId);
          return next;
        });
      }
    }
  };

  // ─── Mutaciones granulares de permisos ─────────────────────────────────────
  const togglePermiso = async (workerId: string, asig: Asignacion, cap: CapabilityMeta) => {
    const mutationKey = `${asig.id}:${cap.key}`;
    if (mutatingKeys.has(mutationKey)) return;

    const on = !!asig.permisos[cap.key];
    if (!on && cap.sensible) {
      const ok = window.confirm(
        `"${cap.label}" da acceso a información financiera o sensible. ¿Conceder este permiso para "${asig.producto_nombre}"?`,
      );
      if (!ok) return;
    }

    const nuevoValor = !on;
    // Actualización optimista
    setAsignaciones((prev) => {
      const list = prev[workerId] ?? [];
      return {
        ...prev,
        [workerId]: list.map((a) => {
          if (a.id !== asig.id) return a;
          const nuevosPermisos = { ...a.permisos };
          if (nuevoValor) nuevosPermisos[cap.key] = true;
          else delete nuevosPermisos[cap.key];
          return { ...a, permisos: nuevosPermisos };
        }),
      };
    });

    setMutatingKeys((prev) => new Set(prev).add(mutationKey));
    try {
      // Envía parche granular: { permisos: { [key]: true/false } }
      await api.patch(`/equipo/asignaciones/${asig.id}`, {
        permisos: { [cap.key]: nuevoValor },
      });
    } catch {
      // Revertir optimismo
      setAsignaciones((prev) => {
        const list = prev[workerId] ?? [];
        return {
          ...prev,
          [workerId]: list.map((a) => {
            if (a.id !== asig.id) return a;
            const revPermisos = { ...a.permisos };
            if (on) revPermisos[cap.key] = true;
            else delete revPermisos[cap.key];
            return { ...a, permisos: revPermisos };
          }),
        };
      });
      alert(`No se pudo actualizar el permiso de "${cap.label}". Intenta de nuevo.`);
    } finally {
      setMutatingKeys((prev) => {
        const next = new Set(prev);
        next.delete(mutationKey);
        return next;
      });
    }
  };

  const toggleActivo = async (workerId: string, asig: Asignacion) => {
    const mutationKey = `activo:${asig.id}`;
    if (mutatingKeys.has(mutationKey)) return;

    const nuevoActivo = !asig.activo;
    setAsignaciones((prev) => {
      const list = prev[workerId] ?? [];
      return {
        ...prev,
        [workerId]: list.map((a) => (a.id === asig.id ? { ...a, activo: nuevoActivo } : a)),
      };
    });

    setMutatingKeys((prev) => new Set(prev).add(mutationKey));
    try {
      await api.patch(`/equipo/asignaciones/${asig.id}`, { activo: nuevoActivo });
      await reloadTrabajadores();
    } catch {
      // Revertir
      setAsignaciones((prev) => {
        const list = prev[workerId] ?? [];
        return {
          ...prev,
          [workerId]: list.map((a) => (a.id === asig.id ? { ...a, activo: asig.activo } : a)),
        };
      });
      alert('No se pudo actualizar el estado de la asignación.');
    } finally {
      setMutatingKeys((prev) => {
        const next = new Set(prev);
        next.delete(mutationKey);
        return next;
      });
    }
  };

  const addAsignacion = async (workerId: string) => {
    const productoId = addProductSel[workerId];
    if (!productoId || assigningWorkerId === workerId) return;

    setAssigningWorkerId(workerId);
    try {
      const { data: d } = await api.post('/equipo/asignaciones', {
        trabajador_id: workerId,
        producto_id: productoId,
        permisos: {},
      });
      const prod = productos.find((p) => p.id === productoId);
      const nueva: Asignacion = {
        id: d.id,
        producto_id: d.producto_id,
        permisos: d.permisos ?? {},
        activo: d.activo,
        producto_nombre: prod?.nombre ?? 'Producto',
      };
      setAsignaciones((prev) => ({
        ...prev,
        [workerId]: [...(prev[workerId] ?? []), nueva],
      }));
      setAddProductSel((prev) => ({ ...prev, [workerId]: '' }));
      await reloadTrabajadores();
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo asignar el producto.');
      alert(info.mensaje);
    } finally {
      setAssigningWorkerId(null);
    }
  };

  const revokeAsignacion = async (workerId: string, asig: Asignacion) => {
    if (!window.confirm(`¿Revocar el acceso a "${asig.producto_nombre}"?`)) return;
    setRevokingAsigId(asig.id);
    try {
      await api.delete(`/equipo/asignaciones/${asig.id}`);
      setAsignaciones((prev) => ({
        ...prev,
        [workerId]: (prev[workerId] ?? []).filter((a) => a.id !== asig.id),
      }));
      await reloadTrabajadores();
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'No se pudo revocar la asignación.');
      alert(info.mensaje);
    } finally {
      setRevokingAsigId(null);
    }
  };

  // ─── Memoización de capacidades por grupo ──────────────────────────────────
  const capsAnalisis = useMemo(
    () => capabilities.filter((c) => c.grupo === 'analisis'),
    [capabilities]
  );
  const capsHerramientas = useMemo(
    () => capabilities.filter((c) => c.grupo === 'herramientas'),
    [capabilities]
  );

  // ─── Estados de carga y error ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div
          role="status"
          aria-label="Cargando equipo"
          className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin"
        />
        <span className="text-xs text-white/50">Cargando panel de equipo...</span>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto animate-fade-in">
        <div className="bg-[#0F1C2A] rounded-2xl p-8 border border-white/10 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-brand-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-11a4 4 0 00-8 0v4h8V6z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white mb-2">Acceso restringido</h1>
          <p className="text-sm text-white/60 mb-6">
            Solo el dueño de la organización puede administrar los miembros del equipo y sus permisos.
          </p>
          <Link
            href="/dashboard"
            className="inline-block text-xs text-brand-primary font-semibold border border-brand-primary/30 rounded-lg px-4 py-2 hover:bg-brand-primary hover:text-white transition"
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto animate-fade-in">
        <div className="bg-[#0F1C2A] rounded-2xl p-8 border border-brand-accent/30 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-brand-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white mb-2">Error al cargar el equipo</h1>
          <p className="text-sm text-white/60 mb-6">
            {fetchError ?? 'No se pudo obtener la información del equipo. Por favor, reintenta.'}
          </p>
          <button
            type="button"
            onClick={loadInitialData}
            className="btn-primary px-5 py-2 text-sm"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const sinEquipoEnPlan = data.max_trabajadores === 0;
  const limitLabel =
    data.max_trabajadores === -1
      ? `${data.total} · ilimitados`
      : `${data.total} / ${data.max_trabajadores}`;

  const renderCapGroup = (
    workerId: string,
    asig: Asignacion,
    titulo: string,
    caps: CapabilityMeta[]
  ) => (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">{titulo}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
        {caps.map((cap) => {
          const on = !!asig.permisos[cap.key];
          const isMutating = mutatingKeys.has(`${asig.id}:${cap.key}`);
          return (
            <div key={cap.key} className="flex items-center justify-between gap-3 p-1.5 rounded-lg hover:bg-white/[0.02] transition">
              <span className="text-sm text-white/80 flex items-center gap-1.5 min-w-0">
                <span className="truncate">{cap.label}</span>
                {cap.sensible && (
                  <span
                    title="Capacidad sensible: requiere confirmación"
                    className="text-[9px] font-bold uppercase tracking-wide text-brand-accent bg-brand-accent/10 border border-brand-accent/30 rounded px-1.5 py-0.5 flex-shrink-0"
                  >
                    Sensible
                  </span>
                )}
              </span>
              <Switch
                on={on}
                sensible={cap.sensible}
                disabled={isMutating}
                label={`${cap.label} para ${asig.producto_nombre}`}
                onToggle={() => togglePermiso(workerId, asig, cap)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto animate-fade-in">
      {/* Breadcrumb */}
      <nav aria-label="Navegación secundaria" className="flex items-center gap-2 text-sm text-white/50 mb-6">
        <Link href="/dashboard" className="hover:text-white transition">
          Dashboard
        </Link>
        <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-white font-medium">Equipo</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Equipo</h1>
          <p className="text-sm text-white/50 mt-1">
            Invita colaboradores y administra sus permisos específicos en cada uno de tus productos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/80 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 flex-shrink-0">
            Trabajadores: {limitLabel}
          </span>
          {invitaciones.length > 0 && (
            <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-1.5 flex-shrink-0">
              {invitaciones.length} pendiente{invitaciones.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Sin equipo en el plan actual */}
      {sinEquipoEnPlan ? (
        <div className="bg-[#0F1C2A] rounded-2xl p-8 border border-white/10 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-white mb-2">Tu plan no incluye colaboradores de equipo</h2>
          <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">
            Actualiza a un plan superior para sumar trabajadores y delegar operaciones con control granular de permisos.
          </p>
          <Link
            href="/dashboard/billing"
            className="inline-block text-sm text-white font-semibold rounded-lg px-5 py-2.5 transition hover:shadow-[0_0_24px_rgba(231,76,60,0.35)]"
            style={{ background: 'linear-gradient(135deg,#E74C3C,#C0392B)' }}
          >
            Ver planes disponibles →
          </Link>
        </div>
      ) : (
        <>
          {/* Alta o Invitación de trabajador */}
          <div className="bg-[#0F1C2A] rounded-2xl border border-white/10 mb-6 overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <div>
                <h2 className="text-base font-bold text-white">Sumar colaborador</h2>
                <p className="text-xs text-white/50 mt-0.5">
                  {data.puede_agregar
                    ? 'Genera un enlace de invitación o crea una cuenta directamente.'
                    : 'Alcanzaste el límite de colaboradores de tu plan actual.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddError('');
                  setInvError('');
                  setShowAdd((v) => !v);
                }}
                disabled={!data.puede_agregar}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {showAdd ? 'Cerrar panel' : 'Nuevo colaborador'}
              </button>
            </div>

            {showAdd && data.puede_agregar && (
              <div className="border-t border-white/5 p-5">
                {/* Selector de modo */}
                <div className="flex items-center gap-2 mb-4 bg-white/5 p-1 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setAddMode('invitacion')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      addMode === 'invitacion'
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Código / Enlace de invitación
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode('directa')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      addMode === 'directa'
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Alta manual directa
                  </button>
                </div>

                {addMode === 'invitacion' ? (
                  <form onSubmit={handleCreateInvitacion} className="space-y-3">
                    <p className="text-xs text-white/50 mb-3">
                      Genera un código de un solo uso. El colaborador se registrará directamente con su propia contraseña.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label htmlFor="inv-email" className="block text-xs font-medium text-white/70 mb-1">
                          Email de destino (opcional)
                        </label>
                        <input
                          id="inv-email"
                          type="email"
                          value={invForm.email_destino}
                          onChange={(e) => setInvForm({ ...invForm, email_destino: e.target.value })}
                          className="input w-full bg-white/5 text-white border-white/10 placeholder:text-white/30"
                          placeholder="colaborador@empresa.com (o vacío para cualquiera)"
                        />
                      </div>
                      <div>
                        <label htmlFor="inv-dias" className="block text-xs font-medium text-white/70 mb-1">
                          Vigencia (días)
                        </label>
                        <select
                          id="inv-dias"
                          value={invForm.dias_validez}
                          onChange={(e) => setInvForm({ ...invForm, dias_validez: Number(e.target.value) })}
                          className="input w-full bg-[#0F1C2A] text-white border-white/10"
                        >
                          <option value={3}>3 días</option>
                          <option value={7}>7 días (recomendado)</option>
                          <option value={15}>15 días</option>
                          <option value={30}>30 días</option>
                        </select>
                      </div>
                    </div>

                    {invError && (
                      <p role="alert" className="text-xs font-semibold text-brand-accent">
                        {invError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={inviting}
                      className="btn-primary px-5 py-2 text-sm disabled:opacity-40"
                    >
                      {inviting ? 'Generando invitación...' : 'Crear invitación'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleAddDirect} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="worker-nombre" className="block text-xs font-medium text-white/70 mb-1">
                          Nombre
                        </label>
                        <input
                          id="worker-nombre"
                          type="text"
                          value={form.nombre}
                          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                          className="input w-full bg-white/5 text-white border-white/10 placeholder:text-white/30"
                          placeholder="Nombre del trabajador"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="worker-email" className="block text-xs font-medium text-white/70 mb-1">
                          Email
                        </label>
                        <input
                          id="worker-email"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          className="input w-full bg-white/5 text-white border-white/10 placeholder:text-white/30"
                          placeholder="trabajador@empresa.com"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="worker-pass" className="block text-xs font-medium text-white/70 mb-1">
                        Contraseña temporal
                      </label>
                      <div className="relative">
                        <input
                          id="worker-pass"
                          type={showWorkerPass ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          className="input w-full bg-white/5 text-white border-white/10 placeholder:text-white/30 pr-10"
                          placeholder="Mín. 8 caracteres, mayúscula, número y símbolo"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowWorkerPass((v) => !v)}
                          aria-label={showWorkerPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer select-none"
                        >
                          {showWorkerPass ? (
                            <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-white/40 mt-1">
                        El colaborador podrá actualizar su contraseña desde su perfil tras iniciar sesión.
                      </p>
                    </div>

                    {addError && (
                      <p role="alert" className="text-xs font-semibold text-brand-accent">
                        {addError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={adding}
                      className="btn-primary px-5 py-2 text-sm disabled:opacity-40"
                    >
                      {adding ? 'Creando cuenta...' : 'Crear colaborador'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Invitaciones pendientes */}
          {invitaciones.length > 0 && (
            <div className="bg-[#0F1C2A] rounded-2xl border border-white/10 mb-6 p-5">
              <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <span>Invitaciones vigentes pendientes</span>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1.5 py-0.5">
                  {invitaciones.length}
                </span>
              </h2>
              <p className="text-xs text-white/50 mb-3">
                Comparte el enlace o código para que el invitado complete su registro en la plataforma.
              </p>

              <div className="space-y-2">
                {invitaciones.map((inv) => {
                  const diasRestantes = Math.max(
                    0,
                    Math.ceil((new Date(inv.expira_en).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  );
                  const signupUrl = typeof window !== 'undefined'
                    ? `${window.location.origin}/auth/signup?codigo=${inv.codigo}`
                    : `/auth/signup?codigo=${inv.codigo}`;

                  return (
                    <div
                      key={inv.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-white/5 bg-white/[0.02]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-bold text-brand-primary bg-brand-primary/10 border border-brand-primary/30 px-2 py-0.5 rounded">
                            {inv.codigo}
                          </code>
                          <span className="text-xs text-white/80 truncate">
                            {inv.email_destino ?? 'Cualquier colaborador'}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/40 mt-1">
                          Vence en {diasRestantes} día{diasRestantes !== 1 ? 's' : ''} ({new Date(inv.expira_en).toLocaleDateString()})
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(signupUrl, inv.id)}
                          className="text-xs font-semibold text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 transition"
                        >
                          {copiedCode === inv.id ? '¡Enlace copiado!' : 'Copiar enlace'}
                        </button>
                        <button
                          type="button"
                          disabled={revokingInvId === inv.id}
                          onClick={() => handleRevokeInvitacion(inv.id)}
                          aria-label={`Revocar invitación con código ${inv.codigo}`}
                          className="text-xs font-semibold text-white/40 hover:text-brand-accent transition px-2 py-1.5 disabled:opacity-40"
                        >
                          {revokingInvId === inv.id ? 'Revocando...' : 'Revocar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lista de trabajadores */}
          {data.trabajadores.length === 0 ? (
            <div className="bg-[#0F1C2A] rounded-2xl p-8 border border-white/10 text-center">
              <p className="text-sm text-white/50">
                Aún no has registrado a ningún colaborador en tu equipo. Utiliza “Nuevo colaborador” para empezar.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.trabajadores.map((t) => {
                const isOpen = expanded === t.id;
                const asigs = asignaciones[t.id] ?? [];
                const productosAsignados = new Set(asigs.map((a) => a.producto_id));
                const disponibles = productos.filter((p) => !productosAsignados.has(p.id));
                const isLoadingAsig = loadingAsigWorkers.has(t.id);
                const isDeleting = deletingWorkerId === t.id;

                return (
                  <div
                    key={t.id}
                    className="bg-[#0F1C2A] rounded-2xl border border-white/10 overflow-hidden transition"
                  >
                    {/* Cabecera del trabajador */}
                    <div className="flex items-center gap-3 p-4">
                      <div className="w-10 h-10 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-brand-primary text-sm font-bold">
                          {t.nombre.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white truncate">{t.nombre}</p>
                          {!t.activo && (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-white/50 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/50 truncate">{t.email}</p>
                      </div>
                      <span className="text-[11px] text-white/50 hidden sm:block flex-shrink-0">
                        {t.asignaciones_activas} producto{t.asignaciones_activas !== 1 ? 's' : ''}
                      </span>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`worker-panel-${t.id}`}
                        onClick={() => toggleExpand(t.id)}
                        className="text-xs font-semibold text-brand-primary border border-brand-primary/30 rounded-lg px-3 py-1.5 hover:bg-brand-primary hover:text-white transition flex-shrink-0"
                      >
                        {isOpen ? 'Cerrar' : 'Permisos'}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteWorker(t.id, t.nombre)}
                        aria-label={`Eliminar a ${t.nombre}`}
                        className="text-white/40 hover:text-brand-accent transition p-1.5 rounded-lg hover:bg-white/5 flex-shrink-0 disabled:opacity-40"
                      >
                        {isDeleting ? (
                          <div className="w-4 h-4 rounded-full border border-brand-accent border-t-transparent animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Panel de asignaciones */}
                    {isOpen && (
                      <div id={`worker-panel-${t.id}`} className="border-t border-white/5 p-4 space-y-4">
                        {/* Añadir asignación */}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <label htmlFor={`select-product-${t.id}`} className="sr-only">
                            Seleccionar producto para asignar a {t.nombre}
                          </label>
                          <select
                            id={`select-product-${t.id}`}
                            aria-label={`Seleccionar producto para asignar a ${t.nombre}`}
                            value={addProductSel[t.id] ?? ''}
                            onChange={(e) =>
                              setAddProductSel((prev) => ({ ...prev, [t.id]: e.target.value }))
                            }
                            disabled={disponibles.length === 0 || assigningWorkerId === t.id}
                            className="input flex-1 bg-[#0F1C2A] text-white border-white/10 disabled:opacity-40 cursor-pointer"
                          >
                            <option value="">
                              {productos.length === 0
                                ? 'No tienes productos creados'
                                : disponibles.length === 0
                                  ? 'Todos los productos ya han sido asignados'
                                  : 'Selecciona un producto para asignar…'}
                            </option>
                            {disponibles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => addAsignacion(t.id)}
                            disabled={!addProductSel[t.id] || assigningWorkerId === t.id}
                            className="btn-primary px-4 py-2 text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                          >
                            {assigningWorkerId === t.id ? (
                              <>
                                <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                <span>Asignando...</span>
                              </>
                            ) : (
                              'Asignar'
                            )}
                          </button>
                        </div>

                        {/* Asignaciones existentes */}
                        {isLoadingAsig ? (
                          <div className="flex items-center justify-center py-6 gap-2">
                            <div className="w-5 h-5 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                            <span className="text-xs text-white/50">Cargando productos asignados...</span>
                          </div>
                        ) : asigs.length === 0 ? (
                          <p className="text-sm text-white/50 text-center py-4">
                            Este colaborador no tiene productos asignados todavía.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {asigs.map((asig) => (
                              <div
                                key={asig.id}
                                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                              >
                                <div className="flex items-center justify-between gap-3 mb-4">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-semibold text-white truncate">
                                      {asig.producto_nombre}
                                    </span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Switch
                                        on={asig.activo}
                                        sensible={false}
                                        disabled={mutatingKeys.has(`activo:${asig.id}`)}
                                        label={`Acceso general a ${asig.producto_nombre}`}
                                        onToggle={() => toggleActivo(t.id, asig)}
                                      />
                                      <span className="text-[11px] text-white/60">
                                        {asig.activo ? 'Activo' : 'Pausado'}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={revokingAsigId === asig.id}
                                    onClick={() => revokeAsignacion(t.id, asig)}
                                    aria-label={`Revocar acceso a ${asig.producto_nombre} para ${t.nombre}`}
                                    className="text-[11px] font-semibold text-white/50 hover:text-brand-accent transition flex-shrink-0 disabled:opacity-40"
                                  >
                                    {revokingAsigId === asig.id ? 'Revocando...' : 'Revocar'}
                                  </button>
                                </div>

                                <div className="space-y-4">
                                  {renderCapGroup(t.id, asig, 'Módulos de Análisis', capsAnalisis)}
                                  {renderCapGroup(t.id, asig, 'Herramientas Operativas', capsHerramientas)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}