'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronsLeft,
  CreditCard,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Palette,
  Plus,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import api from '@/lib/api';
import { cn } from '@/lib/utils';
import ThemeProvider, { useTema } from '@/components/ThemeProvider';
import UpsellSlot from '@/components/ui/UpsellSlot';
import { MotionDrawer } from '@/components/motion/MotionDrawer';
import { MOTION_DURATIONS, MOTION_EASINGS, MOTION_SPRINGS } from '@/lib/motion/tokens';
import { ICON } from '@/components/ui/icons';
import { MODULE_THEME, ORDEN_MODULOS, type ModuloSlug } from '@/lib/moduleTheme';
import {
  IconMercado,
  IconMarketing,
  IconVentas,
  IconFinanzas,
  IconLegal,
} from '@/components/ui/ModuleIcons';
import {
  ElevatedCircularButton,
  SidebarScoopHero,
  MobileCurvedBottomDock,
} from '@/components/dashboard/CurvedScoopDock';

interface Usuario {
  nombre?: string;
  name?: string;
  email: string;
  plan: string;
  role?: string;
  es_admin?: boolean;
  account_role?: string;
  permisos?: Record<string, boolean>;
}

interface AnalisisSnap {
  id: string;
  estado: string;
}

interface ProductoResumen {
  id: string;
  nombre: string;
  analisis: Record<ModuloSlug, AnalisisSnap | null>;
}

/**
 * Navegación de cada módulo. El color NO se declara aquí: sale de
 * `lib/moduleTheme`, la fuente canónica, para que el punto del sidebar y el
 * acento de la pantalla del módulo sean literalmente el mismo valor.
 */
const MODULE_NAV: Record<ModuloSlug, { tag: string; Icon: (p: { className?: string }) => React.ReactElement }> = {
  mercado: { tag: 'Demanda & Competencia', Icon: IconMercado },
  marketing: { tag: 'Estrategia & Copys', Icon: IconMarketing },
  ventas: { tag: 'Canales & Pricing', Icon: IconVentas },
  finanzas: { tag: 'Cash Flow & Payback', Icon: IconFinanzas },
  legal: { tag: 'Normativas & SAT', Icon: IconLegal },
};

const HERRAMIENTAS_ITEMS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/dashboard/herramientas/pos', label: 'Punto de Venta (POS)', Icon: CreditCard },
  { href: '/dashboard/herramientas/inventario', label: 'Control de Inventario', Icon: Package },
  { href: '/dashboard/herramientas/cotizaciones', label: 'Cotizaciones PDF', Icon: FileText },
  { href: '/dashboard/herramientas/clientes', label: 'Clientes (CRM)', Icon: Users },
  { href: '/dashboard/herramientas/calendario', label: 'Agenda & Citas', Icon: Calendar },
  { href: '/dashboard/herramientas/personal', label: 'Personal & Nómina', Icon: Briefcase },
  { href: '/dashboard/herramientas/mantenimientos', label: 'Mantenimientos', Icon: Wrench },
  { href: '/dashboard/herramientas/contabilidad', label: 'Reportes', Icon: BarChart3 },
];

function getModuloLink(modulo: ModuloSlug, productoId: string, snap: AnalisisSnap | null): string {
  if (snap?.estado === 'completado') return `/dashboard/${modulo}/${productoId}/resultado/${snap.id}`;
  return `/dashboard/${modulo}/${productoId}`;
}

const PLAN_BADGE: Record<string, string> = {
  freemium: 'bg-white/[0.04] text-zinc-400 border-white/[0.08]',
  pro: 'bg-emerald-500/[0.08] text-emerald-300 border-emerald-500/20',
  pro_plus: 'bg-purple-500/[0.08] text-purple-300 border-purple-500/20',
  'pro+': 'bg-purple-500/[0.08] text-purple-300 border-purple-500/20',
  business: 'bg-sky-500/[0.08] text-sky-300 border-sky-500/20',
  enterprise: 'bg-amber-500/[0.08] text-amber-300 border-amber-500/20',
};

const PLAN_LABEL: Record<string, string> = {
  freemium: 'Gratis',
  pro: 'Emprendedor',
  pro_plus: 'Negocio',
  'pro+': 'Negocio',
  business: 'Empresa',
  enterprise: 'Enterprise',
};

/** Etiqueta flotante que sustituye al texto cuando el rail está colapsado. */
function RailTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="absolute left-full ml-3 whitespace-nowrap rounded-xl border border-white/10 bg-[#0C101A]/95 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-2xl transition-opacity pointer-events-none group-hover:opacity-100 z-50 backdrop-blur-md"
    >
      {children}
    </span>
  );
}

/**
 * Entrada de navegación del sidebar.
 * Diseño minimalista "lujo discreto" con estado activo refinado y tipografía clara.
 */
function SidebarLink({
  href,
  label,
  Icon,
  active,
  collapsed,
  onNavigate,
  badge,
  externo,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  badge?: string;
  externo?: boolean;
}) {
  const estaActivo = externo ? false : active;
  const contenido = (
    <>
      {estaActivo && (
        <motion.span
          layoutId="sidebar-active-pill"
          transition={MOTION_SPRINGS.pill}
          className={cn(
            'pointer-events-none absolute inset-0 rounded-xl',
            collapsed
              ? 'bg-white/[0.08] border border-white/15 shadow-[0_0_12px_rgba(255,255,255,0.06)]'
              : 'bg-gradient-to-r from-emerald-500/10 via-white/[0.04] to-transparent border border-emerald-500/20 shadow-sm'
          )}
        />
      )}

      {estaActivo && !collapsed && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-emerald-400 to-teal-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
      )}

      <span
        className={cn(
          'relative z-10 shrink-0 transition-transform duration-200 group-hover:scale-110',
          estaActivo ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-zinc-200'
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={estaActivo ? 2.2 : 1.8} />
      </span>

      {!collapsed && <span className="relative z-10 flex-1 truncate">{label}</span>}

      {!collapsed && badge && (
        <span className="relative z-10 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400 border border-white/10 bg-white/[0.04]">
          {badge}
        </span>
      )}

      {!collapsed && externo && (
        <ExternalLink className="relative z-10 h-3 w-3 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300" strokeWidth={1.8} />
      )}

      {collapsed && <RailTooltip>{label}</RailTooltip>}
    </>
  );

  const className = cn(
    'group relative flex items-center transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F17]',
    collapsed
      ? 'h-10 w-10 mx-auto justify-center p-0 shrink-0 rounded-xl'
      : 'w-full gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium',
    estaActivo ? 'text-white font-semibold' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
  );

  if (externo) {
    return (
      <a
        href={href}
        target="net0"
        onClick={onNavigate}
        title={collapsed ? label : undefined}
        className={className}
      >
        {contenido}
      </a>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={estaActivo ? 'page' : undefined}
      className={className}
    >
      {contenido}
    </Link>
  );
}

/** Encabezado de grupo del sidebar con micro-etiqueta sutil. */
function SidebarSection({
  titulo,
  meta,
  collapsed,
  children,
}: {
  titulo: string;
  meta?: React.ReactNode;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-0.5', collapsed && 'w-full flex flex-col items-center')}>
      {!collapsed ? (
        <div className="flex items-center justify-between px-2.5 pt-3 pb-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{titulo}</p>
          {meta}
        </div>
      ) : (
        <div className="w-5 h-px bg-white/[0.08] mx-auto my-1.5 shrink-0" />
      )}
      <div className={cn('space-y-0.5 w-full', collapsed && 'flex flex-col items-center space-y-1.5')}>{children}</div>
    </div>
  );
}

/** Submenú plegable limpio y compacto. */
function SidebarAccordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: 'auto',
            opacity: 1,
            transition: { duration: MOTION_DURATIONS.base, ease: MOTION_EASINGS.easeOutQuart },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASINGS.easeInCubic },
          }}
          className="overflow-hidden"
        >
          <div className="my-0.5 ml-4 space-y-0.5 border-l border-white/[0.06] pl-2.5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Botón que pliega/despliega un submenú. */
function ChevronToggle({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: (e: React.MouseEvent) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F17]"
    >
      <ChevronDown
        className={cn('w-3.5 h-3.5 transition-transform duration-200', open && 'rotate-180')}
      />
    </button>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </ThemeProvider>
  );
}

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<ModuloSlug>>(new Set());
  const [herramientasExpanded, setHerramientasExpanded] = useState(false);
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const { tema } = useTema();

  useEffect(() => {
    const saved = localStorage.getItem('usuario');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUsuario({
          ...parsed,
          nombre: parsed.nombre ?? parsed.name,
          name: parsed.name ?? parsed.nombre,
        });
      } catch {
        localStorage.removeItem('usuario');
      }
    }

    api
      .get('/auth/me')
      .then(({ data }) => {
        const current = localStorage.getItem('usuario');
        let parsed: Record<string, unknown> = {};
        try {
          parsed = current ? JSON.parse(current) : {};
        } catch {
          parsed = {};
        }
        const updated: Usuario = {
          ...parsed,
          nombre:
            data.name ??
            data.nombre ??
            (parsed as { nombre?: string }).nombre ??
            (parsed as { name?: string }).name ??
            '',
          name: data.name ?? data.nombre ?? '',
          email: data.email ?? (parsed as { email?: string }).email ?? '',
          plan: data.plan,
          role: data.role,
          es_admin: Boolean(data.es_admin || data.role === 'admin'),
          account_role: data.account_role,
          permisos: data.permisos ?? {},
        };
        localStorage.setItem('usuario', JSON.stringify(updated));
        setUsuario(updated);
      })
      .catch(() => {});

    api
      .get('/dashboard/resumen')
      .then(({ data }) => setProductos(data.productos ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tema?.ui_config) setCollapsed(tema.ui_config.sidebar_collapsed);
  }, [tema]);

  // Auto-expand active module or tools on route change only when visiting a specific deep sub-item
  useEffect(() => {
    const currentMod = ORDEN_MODULOS.find((k) => pathname.startsWith(`/dashboard/${k}/`));
    if (currentMod) {
      setExpandedModules((prev) => new Set(prev).add(currentMod));
    }
    if (pathname.startsWith('/dashboard/herramientas/')) {
      setHerramientasExpanded(true);
    }
  }, [pathname]);

  const handleLogout = () => {
    api.post('/auth/logout', {}).catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('usuario');
    router.push('/');
  };

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const puedeNuevoAnalisis =
    usuario?.account_role !== 'trabajador' || ORDEN_MODULOS.some((k) => usuario?.permisos?.[k]);

  const toggleModule = (mod: ModuloSlug) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const cerrarDrawer = () => setSidebarOpen(false);

  // ── Render Sidebar Content ──────────────────────────────────────────────────
  const renderSidebar = (col = false) => (
    <aside
      className={cn(
        'group/sidebar relative flex h-full flex-col rounded-[26px] border border-white/[0.08] bg-[#0A0E17]/95 backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)] transition-all duration-300 overflow-hidden',
        col ? 'w-full px-1.5 py-3' : 'w-full px-3 py-3'
      )}
    >
      {/* ── Brand Header ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          'relative z-10 w-full pb-3 border-b border-white/[0.06] flex items-center justify-between',
          col ? 'px-1 justify-center' : 'px-1.5'
        )}
      >
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="group flex items-center gap-2.5 outline-none cursor-pointer"
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-white via-slate-100 to-slate-300 shadow-[0_2px_12px_rgba(255,255,255,0.3)] transition-transform duration-200 group-hover:scale-105 active:scale-95">
            <span className="text-[12px] text-[#070E17] font-black leading-none tracking-tight font-sans select-none">
              BI
            </span>
          </div>

          {!col && (
            <div className="min-w-0 text-left">
              <span className="block truncate text-[13px] font-bold tracking-tight text-white group-hover:text-zinc-200 transition-colors">
                {tema?.nombre_sistema || 'BI 0 A 100'}
              </span>
              <span className="block truncate text-[10px] font-normal tracking-wide text-zinc-500">
                Sistema Operativo
              </span>
            </div>
          )}
        </button>

        {!col && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Colapsar menú"
            className="hidden lg:flex p-1.5 text-zinc-500 hover:text-white hover:bg-white/[0.08] active:scale-90 rounded-lg transition-all duration-150 cursor-pointer"
            title="Colapsar menú lateral"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Action Scoop: Elevated circular button with scoop notch ── */}
      {puedeNuevoAnalisis && (
        col ? (
          <div className="py-2.5 flex justify-center relative group w-full shrink-0">
            <ElevatedCircularButton
              href="/dashboard/nuevo"
              onClick={cerrarDrawer}
              icon={Plus}
              label="Nuevo Análisis"
              size="sm"
            />
            <RailTooltip>Nuevo Análisis</RailTooltip>
          </div>
        ) : (
          <div className="pt-4 pb-1">
            <SidebarScoopHero onNavigate={cerrarDrawer} />
          </div>
        )
      )}

      {/* ── Scrollable Navigation Container ───────────────────────────────── */}
      <nav
        className={cn(
          'relative z-10 flex-1 overflow-x-hidden',
          col
            ? 'no-scrollbar overflow-y-auto w-full py-2 space-y-1.5 flex flex-col items-center'
            : 'custom-scrollbar overflow-y-auto space-y-3 px-1.5 py-2'
        )}
      >

        {/* ── 1. Visión General ── */}
        <SidebarSection titulo="Principal" collapsed={col}>
          <SidebarLink
            href="/dashboard"
            label="Dashboard"
            Icon={LayoutDashboard}
            active={isActive('/dashboard', true)}
            collapsed={col}
            onNavigate={cerrarDrawer}
          />
          <SidebarLink
            href="/dashboard/progreso"
            label="Progreso"
            Icon={TrendingUp}
            active={isActive('/dashboard/progreso', false)}
            collapsed={col}
            onNavigate={cerrarDrawer}
          />
        </SidebarSection>

        {/* ── 2. Cerebros Artificiales (5 Módulos de IA) ── */}
        <SidebarSection
          titulo="Cerebros IA"
          collapsed={col}
        >
          {ORDEN_MODULOS.filter(
            (mod) => usuario?.account_role !== 'trabajador' || usuario?.permisos?.[mod]
          ).map((mod) => {
            const theme = MODULE_THEME[mod];
            const active = pathname.startsWith(`/dashboard/${mod}`);
            const isExpanded = expandedModules.has(mod);
            const NavIcon = MODULE_NAV[mod].Icon;

            return (
              <div key={mod} className={cn('relative', col ? 'w-full flex justify-center shrink-0' : '')}>
                <div
                  className={cn(
                    'group relative flex items-center transition-all duration-150',
                    col
                      ? 'w-10 h-10 justify-center rounded-xl p-0'
                      : 'w-full justify-between rounded-xl',
                    active
                      ? col
                        ? 'bg-white/[0.08] text-white border border-white/15 shadow-[0_0_12px_rgba(255,255,255,0.06)]'
                        : 'bg-gradient-to-r from-white/[0.08] to-white/[0.03] text-white font-semibold shadow-sm border border-white/[0.08]'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                  )}
                >
                  {active && !col && (
                    <span
                      className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full shadow-[0_0_8px_currentColor]"
                      style={{ backgroundColor: theme.hex, color: theme.hex }}
                    />
                  )}

                  <Link
                    href={`/dashboard/${mod}`}
                    onClick={cerrarDrawer}
                    title={col ? theme.short : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center text-[13px]',
                      col
                        ? 'w-10 h-10 justify-center p-0'
                        : 'min-w-0 flex-1 gap-2.5 px-2.5 py-2'
                    )}
                  >
                    <span
                      className="shrink-0 transition-transform duration-200 group-hover:scale-110"
                      style={active ? { color: theme.hex } : undefined}
                    >
                      <NavIcon className="h-4 w-4" />
                    </span>

                    {!col && (
                      <span className="truncate text-left font-medium">
                        {theme.short}
                      </span>
                    )}
                  </Link>

                  {!col && productos.length > 0 && (
                    <div className="pr-1.5">
                      <ChevronToggle
                        open={isExpanded}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleModule(mod);
                        }}
                        label={isExpanded ? `Ocultar proyectos de ${theme.short}` : `Ver proyectos de ${theme.short}`}
                      />
                    </div>
                  )}

                  {col && <RailTooltip>{theme.short}</RailTooltip>}
                </div>

                {!col && (
                  <SidebarAccordion open={isExpanded}>
                    {productos.length === 0 ? (
                      <Link
                        href="/dashboard/nuevo"
                        onClick={cerrarDrawer}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                      >
                        <Plus className="h-3 w-3" />
                        Crear primer proyecto
                      </Link>
                    ) : (
                      productos.map((p) => {
                        const snap = p.analisis?.[mod] ?? null;
                        const isProjActive = pathname.startsWith(`/dashboard/${mod}/${p.id}`);

                        return (
                          <Link
                            key={p.id}
                            href={getModuloLink(mod, p.id, snap)}
                            onClick={cerrarDrawer}
                            className={cn(
                              'group/sub flex items-center justify-between gap-2 truncate rounded-md px-2 py-1 text-[12px] transition-colors duration-150',
                              isProjActive
                                ? 'bg-white/[0.08] font-medium text-white'
                                : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                            )}
                          >
                            <span className="flex-1 truncate">
                              {p.nombre}
                            </span>
                            {snap?.estado === 'completado' && (
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.hex }} />
                            )}
                            {snap?.estado === 'procesando' && (
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                            )}
                          </Link>
                        );
                      })
                    )}
                  </SidebarAccordion>
                )}
              </div>
            );
          })}
        </SidebarSection>

        {/* ── 3. Operación & Herramientas ── */}
        <SidebarSection titulo="Operación & Negocio" collapsed={col}>
          <div className={cn('relative', col ? 'w-full flex justify-center shrink-0' : '')}>
            <div
              className={cn(
                'group relative flex items-center transition-all duration-150',
                col
                  ? 'w-10 h-10 justify-center rounded-xl p-0'
                  : 'w-full justify-between rounded-xl',
                isActive('/dashboard/herramientas', false)
                  ? col
                    ? 'bg-white/[0.08] text-white border border-white/15 shadow-[0_0_12px_rgba(255,255,255,0.06)]'
                    : 'bg-gradient-to-r from-white/[0.08] to-white/[0.03] text-white font-semibold shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
              )}
            >
              {isActive('/dashboard/herramientas', false) && !col && (
                <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
              )}

              <Link
                href="/dashboard/herramientas"
                onClick={cerrarDrawer}
                title={col ? 'Herramientas' : undefined}
                className={cn(
                  'flex items-center text-[13px] font-medium',
                  col
                    ? 'w-10 h-10 justify-center p-0'
                    : 'min-w-0 flex-1 gap-2.5 px-2.5 py-2',
                  isActive('/dashboard/herramientas', false) ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'
                )}
              >
                <Wrench className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" strokeWidth={1.8} />
                {!col && <span className="flex-1 truncate font-medium">Herramientas</span>}
              </Link>

              {!col && (
                <div className="pr-1.5">
                  <ChevronToggle
                    open={herramientasExpanded}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setHerramientasExpanded((v) => !v);
                    }}
                    label="Ver suite de herramientas"
                  />
                </div>
              )}

              {col && <RailTooltip>Herramientas Operativas</RailTooltip>}
            </div>

            {!col && (
              <SidebarAccordion open={herramientasExpanded}>
                {HERRAMIENTAS_ITEMS.map((tool) => (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    onClick={cerrarDrawer}
                    className={cn(
                      'group/tool flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F17]',
                      pathname === tool.href
                        ? 'bg-white/[0.08] font-medium text-white'
                        : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                    )}
                  >
                    <tool.Icon
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-colors',
                        pathname === tool.href ? 'text-white' : 'text-zinc-500 group-hover/tool:text-zinc-300'
                      )}
                      strokeWidth={1.8}
                    />
                    <span className="flex-1 truncate">{tool.label}</span>
                  </Link>
                ))}
              </SidebarAccordion>
            )}
          </div>

          <SidebarLink
            href="/dashboard/marca"
            label="Kit de Marca"
            Icon={Palette}
            active={isActive('/dashboard/marca', false)}
            collapsed={col}
            onNavigate={cerrarDrawer}
          />

          <SidebarLink
            href="/net0"
            label="Net0"
            Icon={Users}
            externo
            active={false}
            collapsed={col}
            onNavigate={cerrarDrawer}
          />
        </SidebarSection>

        {/* ── 4. Configuración & Cuenta ── */}
        <SidebarSection titulo="Configuración" collapsed={col}>
          <SidebarLink
            href="/dashboard/billing"
            label="Facturación & Plan"
            Icon={CreditCard}
            active={isActive('/dashboard/billing', false)}
            collapsed={col}
            onNavigate={cerrarDrawer}
          />
          {usuario?.account_role === 'owner' && (
            <SidebarLink
              href="/dashboard/equipo"
              label="Gestión de Equipo"
              Icon={Users}
              active={isActive('/dashboard/equipo', false)}
              collapsed={col}
              onNavigate={cerrarDrawer}
            />
          )}
          {(usuario?.role === 'admin' || usuario?.es_admin) && (
            <SidebarLink
              href="/dashboard/admin"
              label="Admin Panel"
              Icon={ShieldCheck}
              active={isActive('/dashboard/admin', false)}
              collapsed={col}
              onNavigate={cerrarDrawer}
            />
          )}
        </SidebarSection>
      </nav>

      {/* ── Upsell Slot (Freemium only) ───────────────────────────────────── */}
      {usuario && !col && (
        <div className="relative z-10 px-3 pb-2">
          <UpsellSlot plan={usuario.plan} variant="compact" />
        </div>
      )}

      {/* ── User Profile & Footer ─────────────────────────────────────────── */}
      <div
        className={cn(
          'relative z-10 border-t border-white/[0.06] bg-[#070B12]/80 backdrop-blur-md',
          col ? 'pt-3 pb-2 px-1 flex flex-col items-center gap-2.5 w-full shrink-0' : 'pt-3 pb-1 px-1.5'
        )}
      >
        {col ? (
          <>
            {usuario && (
              <Link
                href="/dashboard/perfil"
                className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-white/90 hover:border-emerald-400/40 hover:bg-white/[0.08] active:scale-95 transition-all shadow-xs"
                title={usuario.nombre || usuario.name || 'Perfil'}
              >
                {(usuario.nombre || usuario.name || 'U').charAt(0).toUpperCase()}
                <RailTooltip>{usuario.nombre || usuario.name || 'Perfil'}</RailTooltip>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expandir menú"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg active:scale-90 transition-all outline-none cursor-pointer"
              title="Expandir menú lateral"
            >
              <ChevronsLeft className="h-4 w-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg active:scale-90 transition-all outline-none cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/dashboard/perfil"
              onClick={cerrarDrawer}
              className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 transition-all hover:bg-white/[0.05]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-bold text-white/90 group-hover:border-emerald-400/40 group-hover:scale-105 transition-all shadow-xs">
                {(usuario?.nombre || usuario?.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">
                    {usuario?.nombre || usuario?.name || 'Usuario'}
                  </p>
                  {usuario?.plan && (
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider border',
                        PLAN_BADGE[usuario.plan] ?? PLAN_BADGE.freemium
                      )}
                    >
                      {PLAN_LABEL[usuario.plan] ?? usuario.plan}
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] text-zinc-500 font-normal">
                  {usuario?.email || ''}
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 active:scale-90 rounded-lg transition-all cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  const tieneWallpaper = !!(tema?.wallpaper_url || tema?.wallpaper_preset);

  return (
    <div
      className={cn(
        'relative flex min-h-screen overflow-hidden font-sans selection:bg-brand-accent/30 selection:text-white',
        tieneWallpaper ? 'bg-transparent' : 'bg-[#070E17]'
      )}
    >
      {/* Subtle background tech grid */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] opacity-[0.02]"
        style={{ backgroundSize: '32px 32px' }}
      />

      {/* Desktop floating sidebar dock */}
      <div
        className={cn(
          'z-30 hidden transition-all duration-300 ease-in-out lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-shrink-0 lg:flex-col lg:p-3 pointer-events-none',
          collapsed ? 'lg:w-[88px]' : 'lg:w-[280px]'
        )}
      >
        <div className="w-full h-full pointer-events-auto">
          {renderSidebar(collapsed)}
        </div>
      </div>

      {/* Mobile drawer with smooth spring and backdrop blur */}
      <MotionDrawer isOpen={sidebarOpen} onClose={cerrarDrawer} side="left" width="w-[280px]">
        <div className="w-full h-full p-2.5">
          {renderSidebar(false)}
        </div>
      </MotionDrawer>

      {/* Main content viewport */}
      <div
        className={cn(
          'relative z-10 flex w-full flex-1 flex-col min-h-screen transition-all duration-300 ease-in-out pb-24 lg:pb-0',
          collapsed ? 'lg:pl-[88px]' : 'lg:pl-[280px]'
        )}
      >
        {/* Mobile topbar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#0B0F17]/90 px-4 py-2.5 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-white/10 p-1.5 text-white/70 transition-colors hover:bg-white/5 hover:text-white cursor-pointer"
              aria-label="Abrir menú"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-b from-white to-slate-200 shadow-[0_2px_6px_rgba(255,255,255,0.25)]">
                <span className="text-[10px] text-[#070E17] font-black leading-none tracking-tight font-sans select-none">BI</span>
              </div>
              <span className="text-xs font-semibold tracking-tight text-white/90">
                {tema?.nombre_sistema || 'BI 0 A 100'}
              </span>
            </div>
          </div>

          {usuario && (
            <Link href="/dashboard/perfil" className="flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[10px] font-medium text-white/90">
                {(usuario.nombre || usuario.name || 'U').charAt(0).toUpperCase()}
              </div>
            </Link>
          )}
        </header>

        {/* Page content */}
        <main className="w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 md:px-8 lg:px-10">
          {children}
        </main>
      </div>

      {/* Floating Bottom Scoop Dock for Mobile Viewports (exact to reference image) */}
      <MobileCurvedBottomDock onOpenDrawer={() => setSidebarOpen(true)} />
    </div>
  );
}
