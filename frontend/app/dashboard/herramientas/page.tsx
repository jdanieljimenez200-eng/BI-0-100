'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShoppingCart,
  Boxes,
  FileText,
  Users,
  Calendar,
  UserCheck,
  BarChart3,
  Wrench,
  ArrowRight,
  Lock,
  Sparkles,
  Zap,
  CheckCircle2,
  Layers,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  CreditCard,
  Briefcase,
  TrendingUp,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type EstadoHerramienta = 'abrible' | 'sin_permiso' | 'no_contratada';
type OrigenHerramienta = 'incluida' | 'pago' | null;

interface HerramientaEstado {
  herramienta: string; // cap key del backend
  estado: EstadoHerramienta;
  origen: OrigenHerramienta;
  label: string;
  precio_mxn: number;
}

interface SeleccionInfo {
  permite: boolean;
  max: number; // -1 = ilimitado
}

interface HerramientasResponse {
  account_role: string;
  plan: string;
  seleccion: SeleccionInfo;
  herramientas: HerramientaEstado[];
}

// ─── Meta visual por herramienta (indexado por `cap`) ──────────────────────────

interface HerramientaMeta {
  cap: string;
  categoria: 'finanzas' | 'operaciones' | 'comercial';
  categoriaLabel: string;
  subtitulo: string;
  descripcion: string;
  icono: React.ComponentType<{ className?: string }>;
  acentoTw: string;
  glowTw: string;
  borderTw: string;
  href: string;
  tag?: string;
}

// ─── Meta visual por herramienta (indexado por `cap`) ──────────────────────────

const META: Record<string, HerramientaMeta> = {
  pos: {
    cap: 'pos',
    categoria: 'finanzas',
    categoriaLabel: 'Finanzas & Cobro',
    subtitulo: 'Cobra y registra ventas',
    descripcion: 'Catálogo de productos, tickets por WhatsApp y cada venta alimenta tu flujo de caja automáticamente.',
    icono: ShoppingCart,
    acentoTw: 'text-emerald-300', glowTw: 'bg-emerald-500/12', borderTw: 'border-emerald-500/25',
    href: '/dashboard/herramientas/pos', tag: 'Finanzas sync',
  },
  inventario: {
    cap: 'inventario',
    categoria: 'operaciones',
    categoriaLabel: 'Operaciones & Stock',
    subtitulo: 'Stock e insumos',
    descripcion: 'Controla existencias, recibe alertas de stock bajo y registra compras de mercancía como egresos.',
    icono: Boxes,
    acentoTw: 'text-amber-300', glowTw: 'bg-amber-500/10', borderTw: 'border-amber-500/25',
    href: '/dashboard/herramientas/inventario', tag: 'Finanzas sync',
  },
  cotizaciones: {
    cap: 'cotizaciones',
    categoria: 'comercial',
    categoriaLabel: 'Comercial & Ventas',
    subtitulo: 'PDF profesional',
    descripcion: 'Genera cotizaciones oficiales con los colores de tu marca y compártelas por WhatsApp en segundos.',
    icono: FileText,
    acentoTw: 'text-blue-300', glowTw: 'bg-blue-500/10', borderTw: 'border-blue-500/25',
    href: '/dashboard/herramientas/cotizaciones',
  },
  clientes: {
    cap: 'clientes',
    categoria: 'comercial',
    categoriaLabel: 'CRM & Contactos',
    subtitulo: 'CRM sin Excel',
    descripcion: 'Directorio de contactos con notas e historial. Un click abre WhatsApp con contexto o genera cotización.',
    icono: Users,
    acentoTw: 'text-violet-300', glowTw: 'bg-violet-500/10', borderTw: 'border-violet-500/25',
    href: '/dashboard/herramientas/clientes',
  },
  citas: {
    cap: 'citas',
    categoria: 'comercial',
    categoriaLabel: 'Agenda & Citas',
    subtitulo: 'Agenda visual',
    descripcion: 'Calendario mensual y vista agenda con citas por color. Recordatorios automáticos por WhatsApp.',
    icono: Calendar,
    acentoTw: 'text-cyan-300', glowTw: 'bg-cyan-500/10', borderTw: 'border-cyan-500/25',
    href: '/dashboard/herramientas/calendario',
  },
  nomina: {
    cap: 'nomina',
    categoria: 'operaciones',
    categoriaLabel: 'Equipo & Salarios',
    subtitulo: 'Tu equipo',
    descripcion: 'Gestión de colaboradores y salarios. Cada pago genera comprobante y se registra como egreso.',
    icono: UserCheck,
    acentoTw: 'text-rose-300', glowTw: 'bg-rose-500/10', borderTw: 'border-rose-500/25',
    href: '/dashboard/herramientas/personal', tag: 'Finanzas sync',
  },
  contabilidad: {
    cap: 'contabilidad',
    categoria: 'finanzas',
    categoriaLabel: 'Reportes & Contabilidad',
    subtitulo: 'Todo tu negocio en cifras',
    descripcion: 'Reportes detallados de ventas, inventario, cotizaciones, clientes, citas y personal, con el libro contable y la estimación fiscal. Descarga en PDF.',
    icono: BarChart3,
    acentoTw: 'text-teal-300', glowTw: 'bg-teal-500/10', borderTw: 'border-teal-500/25',
    href: '/dashboard/herramientas/contabilidad', tag: 'Finanzas sync',
  },
  mantenimientos: {
    cap: 'mantenimientos',
    categoria: 'operaciones',
    categoriaLabel: 'Operaciones & Equipos',
    subtitulo: 'Nada se descompone de sorpresa',
    descripcion: 'Registra tanque de gas, refrigerador, parrilla o tijeras y la app te dice cada cuánto darles mantenimiento, con aviso cuando toca.',
    icono: Wrench,
    acentoTw: 'text-orange-300', glowTw: 'bg-orange-500/10', borderTw: 'border-orange-500/25',
    href: '/dashboard/herramientas/mantenimientos', tag: 'Finanzas sync',
  },
};

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  h: HerramientaEstado;
  index: number;
  esOwner: boolean;
  permiteSeleccion: boolean;
  hayCupo: boolean;
  mutando: boolean;
  onSeleccionar: (key: string) => void;
  onDeseleccionar: (key: string) => void;
}

function HerramientaCard({
  h, index, esOwner, permiteSeleccion, hayCupo, mutando, onSeleccionar, onDeseleccionar,
}: CardProps) {
  const router = useRouter();
  const meta = META[h.herramienta];
  if (!meta) return null;

  const IconComponent = meta.icono;
  const esSinPermiso = h.estado === 'sin_permiso';
  const esIncluida = h.origen === 'incluida';
  // En planes por selección, 'no_contratada' = herramienta NO activada por el dueño.
  const noActivada = h.estado === 'no_contratada';
  // ¿Esta card puede activarse a elección? (dueño, plan por selección, no activada).
  const activable = permiteSeleccion && esOwner && noActivada;
  // ¿El dueño puede desactivarla? (plan por selección, ya activada).
  const desactivable = permiteSeleccion && esOwner && h.estado === 'abrible';
  const bloqueada = h.estado !== 'abrible';

  const onClick = () => {
    if (mutando) return;
    if (h.estado === 'abrible') { router.push(meta.href); return; }
    if (activable) {
      if (hayCupo) onSeleccionar(h.herramienta);
      else router.push('/pricing');
      return;
    }
    if (noActivada) { router.push('/pricing'); return; }
    // sin_permiso: no navega (el trabajador debe pedir acceso al dueño).
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={bloqueada ? undefined : { y: -3 }}
      className={`group relative rounded-2xl border p-5 overflow-hidden
        bg-gradient-to-br from-[#0d1117] via-[#0b1421] to-[#0d1117]
        transition-all duration-300 flex flex-col justify-between
        ${meta.borderTw}
        ${esSinPermiso ? 'opacity-55' : 'hover:border-white/20 shadow-lg shadow-black/40'}`}
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-500 ${meta.glowTw}`} />

      <button
        type="button"
        onClick={onClick}
        disabled={esSinPermiso || mutando}
        className={`relative z-10 w-full text-left flex flex-col h-full gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-lg
          ${esSinPermiso || (noActivada && !activable) ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className={`w-11 h-11 rounded-xl border ${meta.borderTw} ${meta.glowTw} flex items-center justify-center ${meta.acentoTw} transition-transform duration-300 group-hover:scale-105 shrink-0`}>
            <IconComponent className="w-5 h-5" />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {meta.tag && (
              <span className="text-[9px] font-bold text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" />
                Sync
              </span>
            )}
            {/* Badge de estado */}
            {h.estado === 'abrible' && esIncluida && (
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-300 bg-emerald-500/12 border border-emerald-500/25 rounded-full px-2 py-0.5">
                Activa
              </span>
            )}
            {noActivada && activable && (
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/40 border border-white/12 rounded-full px-2 py-0.5">
                {hayCupo ? 'Disponible' : 'Sin cupo'}
              </span>
            )}
            {noActivada && !activable && (
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/40 border border-white/12 rounded-full px-2 py-0.5 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                ${h.precio_mxn}/mes
              </span>
            )}
            {esSinPermiso && (
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30 border border-white/10 rounded-full px-2 py-0.5">
                Sin acceso
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{meta.subtitulo}</span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-[9px] font-medium text-white/40 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{meta.categoriaLabel}</span>
          </div>
          <h3 className="text-base font-bold text-white leading-snug mb-1.5">{h.label}</h3>
          <p className="text-xs text-white/50 leading-relaxed">{meta.descripcion}</p>
        </div>

        {/* CTA según estado */}
        <div className="mt-auto pt-2 flex items-center gap-1.5">
          {h.estado === 'abrible' && (
            <span className={`text-xs font-semibold ${meta.acentoTw} flex items-center gap-1.5 transition-transform duration-200 group-hover:translate-x-1`}>
              Abrir
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          )}
          {activable && (
            <span className="text-xs font-semibold text-white/70 flex items-center gap-1.5 transition-transform duration-200 group-hover:translate-x-1">
              {mutando ? 'Activando…' : hayCupo ? 'Activar herramienta' : 'Mejora tu plan para más cupo'}
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          )}
          {noActivada && !activable && (
            <span className="text-xs font-semibold text-white/70 flex items-center gap-1.5 transition-transform duration-200 group-hover:translate-x-1">
              Mejorar plan para desbloquear
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          )}
          {esSinPermiso && (
            <span className="text-xs font-medium text-white/35">Pide acceso al dueño</span>
          )}
        </div>
      </button>

      {desactivable && (
        <button
          type="button"
          onClick={() => !mutando && onDeseleccionar(h.herramienta)}
          disabled={mutando}
          className="relative z-10 mt-3 w-full text-center text-[11px] font-medium text-white/35 hover:text-rose-300 border-t border-white/8 pt-2.5 transition-colors disabled:opacity-50"
        >
          {mutando ? 'Procesando…' : 'Desactivar'}
        </button>
      )}
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HerramientasPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [herramientas, setHerramientas] = useState<HerramientaEstado[]>([]);
  const [accountRole, setAccountRole] = useState('');
  const [plan, setPlan] = useState('');
  const [seleccion, setSeleccion] = useState<SeleccionInfo>({ permite: false, max: -1 });
  const [filtroCategoria, setFiltroCategoria] = useState<'todas' | 'finanzas' | 'operaciones' | 'comercial'>('todas');
  const [error, setError] = useState(false);
  const [mutandoKey, setMutandoKey] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await api.get<HerramientasResponse>('/herramientas');
    setHerramientas(data.herramientas);
    setAccountRole(data.account_role);
    setPlan(data.plan || '');
    setSeleccion(data.seleccion ?? { permite: false, max: -1 });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('usuario')) { router.push('/auth/login'); return; }

    let cancelado = false;
    (async () => {
      try {
        await cargar();
      } catch {
        if (!cancelado) setError(true);
      } finally {
        if (!cancelado) setReady(true);
      }
    })();
    return () => { cancelado = true; };
  }, [router, cargar]);

  const seleccionadas = herramientas.filter((h) => h.estado !== 'no_contratada').length;
  const hayCupo = seleccion.max === -1 || seleccionadas < seleccion.max;

  const abribles = useMemo(() => herramientas.filter((h) => h.estado === 'abrible'), [herramientas]);
  const finanzasSyncCount = useMemo(() => herramientas.filter((h) => META[h.herramienta]?.tag === 'Finanzas sync' && h.estado === 'abrible').length, [herramientas]);
  const comercialCount = useMemo(() => herramientas.filter((h) => META[h.herramienta]?.categoria === 'comercial' && h.estado === 'abrible').length, [herramientas]);

  const conteosCategorias = useMemo(() => {
    return {
      todas: herramientas.length,
      finanzas: herramientas.filter((h) => META[h.herramienta]?.categoria === 'finanzas').length,
      operaciones: herramientas.filter((h) => META[h.herramienta]?.categoria === 'operaciones').length,
      comercial: herramientas.filter((h) => META[h.herramienta]?.categoria === 'comercial').length,
    };
  }, [herramientas]);

  const herramientasFiltradas = useMemo(() => {
    if (filtroCategoria === 'todas') return herramientas;
    return herramientas.filter((h) => META[h.herramienta]?.categoria === filtroCategoria);
  }, [herramientas, filtroCategoria]);

  const seleccionar = async (key: string) => {
    setMutandoKey(key);
    setAviso(null);
    try {
      await api.post('/herramientas/seleccionar', { herramienta_key: key });
      await cargar();
    } catch (err: any) {
      setAviso(err?.response?.data?.error ?? 'No pudimos activar la herramienta.');
    } finally {
      setMutandoKey(null);
    }
  };

  const deseleccionar = async (key: string) => {
    setMutandoKey(key);
    setAviso(null);
    try {
      await api.delete('/herramientas/deseleccionar', { data: { herramienta_key: key } });
      await cargar();
    } catch (err: any) {
      setAviso(err?.response?.data?.error ?? 'No pudimos desactivar la herramienta.');
    } finally {
      setMutandoKey(null);
    }
  };

  if (!ready) return null;

  return (
    <div className="relative px-4 sm:px-6 py-10 max-w-6xl mx-auto pb-24">
      {/* Ambient backgrounds */}
      <div className="fixed top-[-15%] right-[-8%] w-[50vh] h-[50vh] bg-emerald-500/7 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-8%] w-[38vh] h-[38vh] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm mb-8">
        <Link href="/dashboard" className="text-white/35 hover:text-white/70 transition-colors">Dashboard</Link>
        <span className="text-white/20">›</span>
        <span className="text-white/70 font-medium">Herramientas</span>
      </div>

      {/* Hero title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mb-8"
      >
        <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-semibold text-emerald-300 tracking-wide">{abribles.length} herramientas operativas activas</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
          Sistema Operativo del Negocio
        </h1>
        <p className="text-sm text-white/45 max-w-2xl leading-relaxed">
          Suite unificada para punto de venta, control de inventario, cotizaciones PDF, CRM de clientes, calendario de citas, nómina y contabilidad. Todas sincronizadas automáticamente con Finanzas.
        </p>

        {/* Contador de cupo — solo en planes por selección */}
        {seleccion.permite && seleccion.max !== -1 && (
          <div className="mt-4 inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/4 border border-white/10">
            <span className="text-xs text-white/50">Herramientas seleccionadas</span>
            <span className="text-xs font-bold text-white tabular-nums">
              {seleccionadas} <span className="text-white/30">/</span> {seleccion.max}
            </span>
            {!hayCupo && (
              <Link href="/pricing" className="text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 transition-colors">
                Ampliar cupo →
              </Link>
            )}
          </div>
        )}
      </motion.div>

      {/* ══ Centro de Mando Ejecutivo (KPIs Banner) ══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="rounded-2xl border border-white/8 bg-[#0F1C2A] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Herramientas</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Boxes className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-white tabular-nums leading-tight">{abribles.length} <span className="text-sm font-normal text-white/30">/ {herramientas.length}</span></p>
          <p className="text-[11px] text-white/40 mt-1">Activas para tu equipo</p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#0F1C2A] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Sync Finanzas</span>
            <div className="w-6 h-6 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <RefreshCw className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-cyan-300 tabular-nums leading-tight">{finanzasSyncCount} <span className="text-sm font-normal text-cyan-400/50">servicios</span></p>
          <p className="text-[11px] text-white/40 mt-1">Flujo de caja automático</p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#0F1C2A] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Suite Comercial</span>
            <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-violet-300 tabular-nums leading-tight">{comercialCount} <span className="text-sm font-normal text-violet-400/50">servicios</span></p>
          <p className="text-[11px] text-white/40 mt-1">Cotizaciones, CRM y Citas</p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#0F1C2A] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Plan Actual</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-amber-300 tracking-wide uppercase leading-tight truncate">{plan || 'Business'}</p>
          <p className="text-[11px] text-white/40 mt-1">Capacidades completas</p>
        </div>
      </div>

      {/* ══ Filtro por Categorías ══ */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none mb-6">
        {([
          { key: 'todas', label: 'Todas', count: conteosCategorias.todas, icon: Layers },
          { key: 'finanzas', label: 'Finanzas & Cobro', count: conteosCategorias.finanzas, icon: CreditCard },
          { key: 'operaciones', label: 'Operaciones & Stock', count: conteosCategorias.operaciones, icon: Boxes },
          { key: 'comercial', label: 'Comercial & Clientes', count: conteosCategorias.comercial, icon: Briefcase },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const activo = filtroCategoria === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFiltroCategoria(tab.key)}
              className={`text-xs px-3.5 py-2 rounded-xl border font-semibold transition-all shrink-0 flex items-center gap-2 ${
                activo
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30'
                  : 'border-white/8 bg-[#0F1C2A] text-white/50 hover:border-white/20 hover:text-white/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activo ? 'bg-emerald-500/30 text-emerald-200 font-bold' : 'bg-white/5 text-white/40'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {aviso && (
        <div className="mb-6 rounded-xl bg-rose-500/8 border border-rose-500/25 px-4 py-3">
          <p className="text-sm text-rose-200/90">{aviso}</p>
        </div>
      )}

      {error ? (
        <div className="rounded-2xl bg-white/3 border border-white/8 px-5 py-8 text-center">
          <p className="text-sm text-white/45">No pudimos cargar tus herramientas. Recarga la página en un momento.</p>
        </div>
      ) : herramientasFiltradas.length === 0 ? (
        <div className="rounded-2xl bg-white/3 border border-white/8 px-5 py-8 text-center">
          <p className="text-sm text-white/45">
            No se encontraron herramientas en esta categoría.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {herramientasFiltradas.map((h, i) => (
            <HerramientaCard
              key={h.herramienta}
              h={h}
              index={i}
              esOwner={accountRole === 'owner'}
              permiteSeleccion={seleccion.permite}
              hayCupo={hayCupo}
              mutando={mutandoKey === h.herramienta}
              onSeleccionar={seleccionar}
              onDeseleccionar={deseleccionar}
            />
          ))}
        </div>
      )}

      {/* Sincronización Automática Banner */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-10 flex items-center gap-3.5 px-5 py-3.5 rounded-2xl bg-[#0F1C2A]/70 border border-white/8"
      >
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center flex-shrink-0 text-emerald-400">
          <RefreshCw className="w-4 h-4" />
        </div>
        <p className="text-xs text-white/45 leading-relaxed">
          <span className="text-white/70 font-semibold">POS, Inventario, Nómina y Contabilidad</span> crean movimientos en Finanzas automáticamente — eliminando la doble captura y manteniendo tu flujo de caja proyectado siempre al día.
        </p>
      </motion.div>
    </div>
  );
}
