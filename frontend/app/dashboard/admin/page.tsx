'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { miRolAdmin, enviarAPapelera, pedirCodigoTotp, NOMBRE_ROL, type Permiso } from '@/lib/admin';

// ─── Types ────────────────────────────────────────────────────────────────────
type Plan = 'freemium' | 'pro' | 'business' | 'enterprise';

interface RecenteUser {
  id: string; email: string; nombre: string; plan: Plan; fecha_creacion: string;
}
interface Stats {
  usuarios:        { total: number; hoy: number; por_plan: { plan: string; total: number }[] };
  productos:       { total: number };
  analisis:        { modulo: string; total: number }[];
  total_analisis:  number;
  conversion_rate: number;
  signups_7d:      { dia: string; total: number }[];
  recientes:       RecenteUser[];
}
interface UsuarioRow {
  id: string; email: string; nombre: string; plan: Plan;
  role: string; activo: boolean; fecha_creacion: string; productos: number;
}
interface UsuariosRes {
  usuarios: UsuarioRow[]; total: number; page: number; pages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAN_BADGE: Record<Plan, string> = {
  freemium:   'bg-white/10 text-white/60',
  pro:        'bg-mercado/10 text-mercado',
  business:   'bg-marketing/10 text-marketing',
  enterprise: 'bg-amber-500/10 text-amber-400',
};
const PLAN_COLOR: Record<Plan, string> = {
  freemium: '#6B7280', pro: '#10B981', business: '#EC4899', enterprise: '#F59E0B',
};
const PLAN_MRR: Record<Plan, number> = {
  freemium: 0, pro: 199, business: 499, enterprise: 1499,
};
const PLANES: Plan[] = ['freemium', 'pro', 'business', 'enterprise'];
const MODULE_COLOR: Record<string, string> = {
   mercado: '#10B981', marketing: '#EC4899', ventas: '#F97316', finanzas: '#3B82F6',
};
const MODULE_LABEL: Record<string, string> = {
   mercado: 'Mercado', marketing: 'Marketing', ventas: 'Ventas', finanzas: 'Finanzas',
};
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const timeAgo = (d: string) => {
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1)   return 'ahora';
  if (min < 60)  return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  const days = Math.floor(min / 1440);
  if (days < 7)  return `${days}d`;
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};
const fmtMXN = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats]             = useState<Stats | null>(null);
  const [usuariosRes, setUsuariosRes] = useState<UsuariosRes | null>(null);
  const [search, setSearch]           = useState('');
  const [planFilter, setPlanFilter]   = useState('');
  const [page, setPage]               = useState(1);
  const [loadingStats, setLoadingStats]       = useState(true);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [changingPlan, setChangingPlan]       = useState<string | null>(null);
  const [miRol, setMiRol] = useState<Awaited<ReturnType<typeof miRolAdmin>> | null>(null);
  const puede = (permiso: Permiso) => Boolean(miRol?.permisos[permiso]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshStats = () => {
    setLoadingStats(true);
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoadingStats(false));
  };

  useEffect(() => {
    refreshStats();
    // Rol de quien mira el panel: decide qué acciones se ofrecen. El backend
    // vuelve a comprobarlo en cada una; esto solo evita botones que fallarían.
    miRolAdmin().then(setMiRol).catch(() => setMiRol(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUsuarios = useCallback(() => {
    setLoadingUsuarios(true);
    const p = new URLSearchParams({ page: String(page), limit: '20' });
    if (search)     p.set('search', search);
    if (planFilter) p.set('plan', planFilter);
    api.get(`/admin/usuarios?${p}`)
      .then(({ data }) => setUsuariosRes(data))
      .catch(() => showToast('Error al cargar la lista de usuarios', false))
      .finally(() => setLoadingUsuarios(false));
  }, [page, search, planFilter]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);
  useEffect(() => { setPage(1); }, [search, planFilter]);

  // El motivo queda en el registro de auditoría: es lo que permite responder
  // después a "¿por qué me cambiaron esto?". El backend lo exige.
  const pedirMotivo = (accion: string): string | null => {
    const motivo = window.prompt(`Motivo para ${accion} (queda en el registro de auditoría):`);
    return motivo && motivo.trim() ? motivo.trim() : null;
  };

  const errorDelServidor = (e: unknown, porDefecto: string) =>
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? porDefecto;

  const handlePlanChange = async (userId: string, plan: Plan) => {
    const motivo = pedirMotivo(`cambiar el plan a ${plan}`);
    if (!motivo) return;
    setChangingPlan(userId);
    try {
      await api.patch(`/admin/usuarios/${userId}/plan`, { plan, motivo });
      showToast(`Plan → ${plan}`);
      fetchUsuarios();
      refreshStats();
    } catch (e) { showToast(errorDelServidor(e, 'Error al cambiar plan'), false); }
    finally  { setChangingPlan(null); }
  };

  /**
   * Envía la cuenta a la papelera. Tres confirmaciones, a propósito: escribir el
   * email (que sea la fila correcta), el motivo (queda en la auditoría) y un
   * código nuevo de la app (que sea quien dice ser).
   */
  const handleEliminar = async (userId: string, email: string) => {
    const confirmacion = window.prompt(
      `Vas a enviar ${email} a la papelera: se desactiva, se cierran sus sesiones y se cancelan sus suscripciones. Se podrá restaurar durante 30 días.\n\nEscribe el email de la cuenta para confirmar:`
    );
    if (confirmacion === null) return;
    if (confirmacion.trim().toLowerCase() !== email.toLowerCase()) {
      showToast('El email no coincide: no se ha eliminado nada', false);
      return;
    }
    const motivo = pedirMotivo('enviar esta cuenta a la papelera');
    if (!motivo) return;
    const codigo = pedirCodigoTotp();
    if (!codigo) return;

    try {
      const r = await enviarAPapelera(userId, motivo, codigo);
      showToast(
        r.suscripciones_sin_cancelar.length
          ? `En la papelera, pero ${r.suscripciones_sin_cancelar.length} suscripción(es) de Stripe NO se pudieron cancelar: revísalas en Stripe`
          : 'Cuenta enviada a la papelera',
        r.suscripciones_sin_cancelar.length === 0
      );
      fetchUsuarios();
    } catch (e) { showToast(errorDelServidor(e, 'No se pudo enviar a la papelera'), false); }
  };

  const handleToggleActivo = async (userId: string, activo: boolean) => {
    // Desactivar exige motivo; reactivar no.
    const motivo = activo ? pedirMotivo('desactivar esta cuenta') : null;
    if (activo && !motivo) return;
    try {
      await api.patch(`/admin/usuarios/${userId}/activo`, { activo: !activo, motivo });
      showToast(activo ? 'Usuario desactivado y sus sesiones cerradas' : 'Usuario activado');
      fetchUsuarios();
    } catch (e) { showToast(errorDelServidor(e, 'Error al actualizar'), false); }
  };

  if (loadingStats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const planMap   = Object.fromEntries((stats?.usuarios.por_plan ?? []).map(p => [p.plan, p.total]));
  const mrr       = PLANES.reduce((s, p) => s + (planMap[p] ?? 0) * PLAN_MRR[p], 0);
  const totalA    = stats?.total_analisis ?? 0;
  const convRate  = stats?.conversion_rate ?? 0;
  const paidCount = (stats?.usuarios.total ?? 0) - (planMap['freemium'] ?? 0);
  const maxS      = Math.max(...(stats?.signups_7d?.map(d => d.total) ?? [0]), 1);

  // Last 7 calendar days with labels
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const iso  = d.toISOString().slice(0, 10);
    const found = stats?.signups_7d?.find(s => s.dia === iso);
    return { label: DIAS[d.getDay()], total: found?.total ?? 0, iso, isToday: i === 6 };
  });

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-6 animate-fade-in pb-16">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl animate-fade-in border ${
          toast.ok
            ? 'bg-[#0a1f16] text-green-300 border-finanzas/30'
            : 'bg-[#1f0a0a] text-red-300 border-brand-accent/30'
        }`}>
          <span className="flex items-center gap-2">
            {toast.ok ? (
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{toast.msg}</span>
          </span>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Centro de Control</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {puede('gestionarRoles') && (
            <Link
              href="/dashboard/admin/administradores"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Administradores
            </Link>
          )}
          {puede('gestionarPapelera') && (
            <Link
              href="/dashboard/admin/papelera"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Papelera
            </Link>
          )}
          {puede('atenderArco') && (
            <Link
              href="/dashboard/admin/arco"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Solicitudes ARCO
            </Link>
          )}
          {puede('verCostos') && (
            <Link
              href="/dashboard/admin/costos-ia"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Costos de IA
            </Link>
          )}
          {puede('gestionarPrompts') && (
            <Link
              href="/dashboard/admin/prompts"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Prompts de IA
            </Link>
          )}
          {puede('verAuditoria') && (
            <Link
              href="/dashboard/admin/auditoria"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Auditoría
            </Link>
          )}
          {puede('moderarRed') && (
            <Link
              href="/dashboard/admin/network"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Red de expertos
              <span aria-hidden="true">→</span>
            </Link>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border bg-brand-accent/10 text-brand-accent border-brand-accent/20">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>{miRol ? NOMBRE_ROL[miRol.rol].toUpperCase() : 'ADMIN'}</span>
          </span>
        </div>
      </div>

      {/* ── KPI Row ───────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Usuarios',     value: stats.usuarios.total.toLocaleString(), sub: `+${stats.usuarios.hoy} hoy`,  color: 'text-white',    subColor: 'text-finanzas' },
            { label: 'Productos',    value: stats.productos.total.toLocaleString(), sub: 'activos',                     color: 'text-white',    subColor: 'text-white/30' },
            { label: 'Análisis',     value: totalA.toLocaleString(),               sub: 'ejecutados',                  color: 'text-white',    subColor: 'text-white/30' },
            { label: 'Conversión',   value: `${convRate}%`,                        sub: 'freemium → pago',             color: convRate >= 10 ? 'text-finanzas' : convRate >= 5 ? 'text-amber-400' : 'text-brand-accent', subColor: 'text-white/30' },
            { label: 'MRR Est.',     value: fmtMXN(mrr),                           sub: 'MXN / mes',                   color: 'text-finanzas', subColor: 'text-white/30' },
            { label: 'Planes pago',  value: paidCount.toLocaleString(),            sub: 'pro + biz + ent.',            color: 'text-amber-400', subColor: 'text-white/30' },
          ].map((k) => (
            <motion.div
              key={k.label}
              whileHover={{ scale: 1.02, y: -2 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              className="kpi-card"
            >
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
              <p className={`text-xs font-medium mt-0.5 ${k.subColor}`}>{k.sub}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Plan funnel + 7-day chart ──────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Plan funnel */}
          <div className="card p-5 space-y-3">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">Distribución de planes</p>
            {PLANES.map((plan) => {
              const count = planMap[plan] ?? 0;
              const pct   = stats.usuarios.total > 0 ? Math.round((count / stats.usuarios.total) * 100) : 0;
              const barW  = Math.max(pct > 0 ? 6 : 0, pct);
              return (
                <div key={plan} className="flex items-center gap-3">
                  <span className="text-xs text-white/50 w-20 flex-shrink-0 capitalize">{plan}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-7 overflow-hidden relative">
                    <div
                      className="h-7 rounded-full flex items-center px-3 transition-all duration-700"
                      style={{
                        width: `${barW}%`,
                        background: PLAN_COLOR[plan] + '2a',
                        border: `1px solid ${PLAN_COLOR[plan]}44`,
                      }}
                    >
                      <span className="text-[11px] font-bold" style={{ color: PLAN_COLOR[plan] }}>{count}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-white/30 w-9 text-right flex-shrink-0">{pct}%</span>
                </div>
              );
            })}
            <div className="pt-2 border-t border-white/10 flex justify-between text-[10px] text-white/30">
              <span>{stats.usuarios.total.toLocaleString()} usuarios totales</span>
              <span className="text-finanzas/70">MRR est. {fmtMXN(mrr)} MXN</span>
            </div>
          </div>

          {/* 7-day signups bar chart */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-4">Registros — últimos 7 días</p>
            <div className="flex items-end gap-1.5" style={{ height: 88 }}>
              {last7.map((d) => {
                const pct = d.total > 0 ? Math.max(6, Math.round((d.total / maxS) * 100)) : 2;
                return (
                  <div key={d.iso} className="flex-1 flex flex-col items-center gap-1">
                    {d.total > 0 && (
                      <span className="text-[9px] text-white/50">{d.total}</span>
                    )}
                    <div className="w-full flex items-end justify-center flex-1">
                      <div
                        className={`w-full rounded-t transition-all duration-700 ${
                          d.isToday ? 'bg-brand-primary' : 'bg-white/15'
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[9px] ${d.isToday ? 'text-brand-primary font-bold' : 'text-white/30'}`}>
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-white/25 mt-3 text-right">
              {last7.reduce((s, d) => s + d.total, 0)} registros esta semana
            </p>
          </div>
        </div>
      )}

      {/* ── Recent signups + Analysis breakdown ───────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Recent signups */}
          <div className="card p-5 space-y-2.5">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Últimos registros</p>
            {(stats.recientes?.length ?? 0) === 0 ? (
              <p className="text-xs text-white/30">Sin registros recientes</p>
            ) : stats.recientes?.map((u) => (
              <div key={u.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/50 flex-shrink-0 border border-white/10">
                  {((u.nombre || u.email)[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate leading-tight">
                    {u.nombre || u.email}
                  </p>
                  {u.nombre && (
                    <p className="text-[10px] text-white/40 truncate">{u.email}</p>
                  )}
                </div>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold capitalize flex-shrink-0 ${PLAN_BADGE[u.plan]}`}>
                  {u.plan}
                </span>
                <span className="text-[10px] text-white/25 flex-shrink-0 w-8 text-right">
                  {timeAgo(String(u.fecha_creacion))}
                </span>
              </div>
            ))}
          </div>

          {/* Analysis breakdown */}
          <div className="card p-5 space-y-3">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1">Análisis por módulo</p>
            {(stats.analisis ?? []).map((a) => {
              const color = MODULE_COLOR[a.modulo] ?? '#6B7280';
              const pct   = totalA > 0 ? Math.max(a.total > 0 ? 4 : 0, Math.round((a.total / totalA) * 100)) : 0;
              return (
                <div key={a.modulo} className="flex items-center gap-3">
                  <span className="text-xs text-white/50 w-24 flex-shrink-0">
                    {MODULE_LABEL[a.modulo] ?? a.modulo}
                  </span>
                  <div className="flex-1 bg-white/5 rounded-full h-7 overflow-hidden">
                    <div
                      className="h-7 rounded-full flex items-center px-3 transition-all duration-700"
                      style={{ width: `${pct}%`, background: color + '2a', border: `1px solid ${color}44` }}
                    >
                      <span className="text-[11px] font-bold" style={{ color }}>{a.total}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-white/30 w-9 text-right flex-shrink-0">{pct}%</span>
                </div>
              );
            })}
            <div className="pt-2 border-t border-white/10 flex justify-between text-[10px] text-white/30">
              <span>Total: {totalA.toLocaleString()} análisis</span>
              <span>{stats.productos.total} productos</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Users table ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h2 className="section-title">Gestión de usuarios</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Buscar email o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input flex-1 sm:w-60 text-xs py-2 bg-white/5 text-white border-white/10 placeholder:text-white/30"
            />
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="input w-auto text-xs py-2 bg-white/5 text-white border-white/10 appearance-none cursor-pointer"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem center', paddingRight: '2rem' }}
            >
              <option value="" className="bg-[#0F1C2A]">Todos</option>
              {PLANES.map((p) => <option key={p} value={p} className="bg-[#0F1C2A]">{p}</option>)}
            </select>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  {['Usuario', 'Plan', 'Productos', 'Registro', 'Cambiar plan', 'Estado'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loadingUsuarios ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-white/30 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-brand-primary/40 border-t-brand-primary animate-spin" />
                        Cargando...
                      </div>
                    </td>
                  </tr>
                ) : usuariosRes?.usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-white/30 text-sm">Sin resultados</td>
                  </tr>
                ) : usuariosRes?.usuarios.map((u, idx) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.025, 0.3) }}
                    className={`hover:bg-white/[.04] transition-colors ${!u.activo ? 'opacity-40' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[11px] font-bold text-white/50 flex-shrink-0">
                          {((u.nombre || u.email)[0] ?? '?').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white leading-tight">{u.nombre || '—'}</p>
                          <p className="text-[10px] text-white/40 truncate">{u.email}</p>
                          {u.role === 'admin' && (
                            <span className="text-[9px] bg-brand-accent/10 text-brand-accent px-1.5 py-0.5 rounded font-bold">ADMIN</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold capitalize ${PLAN_BADGE[u.plan]}`}>
                        {u.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-white/60 text-sm font-medium">{u.productos}</td>
                    <td className="px-4 py-3 text-[10px] text-white/40 whitespace-nowrap">
                      {new Date(u.fecha_creacion).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.plan}
                        disabled={changingPlan === u.id || !puede('cambiarPlan')}
                        title={puede('cambiarPlan') ? undefined : 'Solo un superadmin puede cambiar planes'}
                        onChange={(e) => handlePlanChange(u.id, e.target.value as Plan)}
                        className="border border-white/10 bg-[#0F1C2A] text-white rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary disabled:opacity-40 appearance-none cursor-pointer"
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', paddingRight: '1.75rem' }}
                      >
                        {PLANES.map((p) => <option key={p} value={p} className="bg-[#0F1C2A]">{p}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActivo(u.id, u.activo)}
                        disabled={!puede('gestionarActivo')}
                        title={puede('gestionarActivo') ? undefined : 'Tu rol no permite desactivar cuentas'}
                        className={`disabled:cursor-not-allowed disabled:opacity-60 text-[10px] px-2.5 py-1 rounded-full font-semibold transition border ${
                          u.activo
                            ? 'bg-finanzas/10 text-finanzas border-finanzas/20 hover:bg-brand-accent/10 hover:text-brand-accent hover:border-brand-accent/20'
                            : 'bg-brand-accent/10 text-brand-accent border-brand-accent/20 hover:bg-finanzas/10 hover:text-finanzas hover:border-finanzas/20'
                        }`}
                      >
                        {u.activo ? '● Activo' : '○ Inactivo'}
                      </button>
                      {puede('gestionarPapelera') && u.role !== 'admin' && (
                        <button
                          onClick={() => handleEliminar(u.id, u.email)}
                          className="block mx-auto mt-1 text-[10px] text-rose-300/60 hover:text-rose-300 font-semibold"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {usuariosRes && usuariosRes.pages > 1 && (
            <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between bg-white/[.015]">
              <p className="text-[10px] text-white/40">
                {usuariosRes.total.toLocaleString()} usuarios · Pág. {usuariosRes.page} / {usuariosRes.pages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-outline text-xs py-1.5 px-3 disabled:opacity-30"
                >← Ant.</button>
                <button
                  onClick={() => setPage((p) => Math.min(usuariosRes.pages, p + 1))}
                  disabled={page === usuariosRes.pages}
                  className="btn-outline text-xs py-1.5 px-3 disabled:opacity-30"
                >Sig. →</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Promote hint ──────────────────────────────────────────────────── */}
      <div className="bg-sidebar border border-white/5 rounded-2xl p-5 space-y-2">
        <p className="text-white font-semibold text-sm">¿Cómo promover a admin?</p>
        <code className="text-xs text-white/60 bg-white/[.06] border border-white/5 px-4 py-3 rounded-xl block font-mono leading-relaxed">
          {`UPDATE usuarios SET es_admin = true, account_role = 'owner' WHERE email = 'tu@email.com';`}
        </code>
        <p className="text-white/30 text-xs">Ejecuta en Railway → Data → PostgreSQL</p>
      </div>

    </div>
  );
}
