'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanLimites {
  nombre: string;
  precio_mxn: number;
  precio_mxn_anual: number;
  descripcion: string;
  max_productos: number;
  max_analisis_por_modulo: number;
  creditos_ia_mes: number;
  ai_copy: boolean;
}

interface BillingStatus {
  plan: string;
  limites: PlanLimites;
  creditos: { mes: number; usados: number; disponibles: number; renuevan_el: string };
  uso: {
    productos: number;
    analisis: { mercado: number; marketing: number; ventas: number; finanzas: number; total: number };
  };
  stripe_disponible: boolean;
  plan_expires_at: string | null;
  todos_planes: Record<string, PlanLimites>;
  planes_comprables?: string[];
}

// ─── Icon system (replaces emojis) ──────────────────────────────────────────────

type IconName =
  | 'freemium' | 'pro' | 'pro_plus' | 'business' | 'enterprise'
  | 'mercado' | 'marketing' | 'ventas' | 'finanzas'
  | 'productos' | 'tip' | 'warning' | 'check';

const ICON_PATHS: Record<IconName, string> = {
  freemium:
    'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z',
  pro:
    'm3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z',
  pro_plus:
    'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z',
  business:
    'M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  enterprise:
    'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  mercado:
    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
  marketing:
    'M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46',
  ventas:
    'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z',
  finanzas:
    'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
  productos:
    'm21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
  tip:
    'M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
  warning:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.008v.008H12v-.008Z',
  check:
    'M4.5 12.75l6 6 9-13.5',
};

function Icon({ name, className = 'w-5 h-5', strokeWidth = 1.7 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Precio en pesos con separador de miles: 1199 → "1,199". */
const pesos = (v: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(v);

const PLAN_ACCENT: Record<string, { text: string; ring: string; tint: string; badge: string; dot: string }> = {
  freemium:   { text: 'text-white/80',  ring: 'ring-white/10',      tint: 'bg-white/[.06]',     badge: 'bg-white/10 text-white/70',          dot: 'bg-white/40' },
  pro:        { text: 'text-mercado',   ring: 'ring-mercado/30',    tint: 'bg-mercado/[.08]',   badge: 'bg-mercado/15 text-mercado',         dot: 'bg-mercado' },
  pro_plus:   { text: 'text-ventas', ring: 'ring-ventas/30', tint: 'bg-ventas/[.08]', badge: 'bg-ventas/15 text-ventas', dot: 'bg-ventas' },
  business:   { text: 'text-marketing', ring: 'ring-marketing/30',  tint: 'bg-marketing/[.08]', badge: 'bg-marketing/15 text-marketing',     dot: 'bg-marketing' },
  enterprise: { text: 'text-amber-400', ring: 'ring-amber-500/30',  tint: 'bg-amber-500/[.08]', badge: 'bg-amber-500/15 text-amber-400',     dot: 'bg-amber-400' },
};

const PLAN_FEATURES: Record<string, { label: string; included: boolean }[]> = {
  freemium: [
    { label: '1 producto activo',             included: true  },
    { label: '1 análisis por módulo',          included: true  },
    { label: '5 créditos de IA al mes',        included: true  },
    { label: 'Resultados completos Mercado',   included: true  },
    { label: 'Competidores identificados',     included: false },
    { label: 'Copy con IA',                    included: false },
    { label: 'Calendario 2 semanas',           included: false },
    { label: 'Exportar PDF',                   included: false },
    { label: 'Contabilidad completa',          included: false },
  ],
  pro: [
    { label: 'Hasta 5 productos activos',      included: true },
    { label: '25 créditos de IA al mes',       included: true },
    { label: 'Competidores identificados',     included: true },
    { label: 'Copy con IA completo',           included: true },
    { label: 'Calendario 2 semanas',           included: true },
    { label: 'Exportar PDF',                   included: true },
    { label: 'Estrategia de ventas completa',included: true },
    { label: 'Contabilidad completa',          included: true },
  ],
  pro_plus: [
    { label: 'Hasta 10 productos activos',     included: true },
    { label: '55 créditos de IA al mes',       included: true },
    { label: 'Elige 4 herramientas',           included: true },
    { label: 'Copy con IA completo',           included: true },
    { label: 'Importación masiva CSV',         included: true },
    { label: 'Alertas automáticas WhatsApp/email', included: true },
    { label: 'Análisis legal-fiscal',          included: true },
    { label: 'Hasta 5 trabajadores',           included: true },
  ],
  business: [
    { label: 'Productos ilimitados',           included: true },
    { label: '120 créditos de IA al mes',      included: true },
    { label: 'Todo lo de Negocio',             included: true },
    { label: 'Contabilidad avanzada',          included: true },
    { label: 'Exportar para contador',         included: true },
    { label: 'Inputs de override financiero',  included: true },
    { label: 'Soporte prioritario',            included: true },
    { label: 'Acceso anticipado a nuevos módulos', included: true },
  ],
  enterprise: [
    { label: '600 créditos de IA al mes',      included: true },
    { label: 'Todo lo de Empresa',             included: true },
    { label: 'Trabajadores ilimitados',        included: true },
    { label: 'White-label completo',           included: true },
    { label: 'Comisión POS mínima (0.9%)',     included: true },
    { label: 'SLA personalizado',              included: true },
    { label: 'Soporte dedicado',               included: true },
    { label: 'Onboarding asistido',            included: true },
  ],
};

const PLAN_ICON: Record<string, IconName> = {
  freemium: 'freemium', pro: 'pro', pro_plus: 'pro_plus', business: 'business', enterprise: 'enterprise',
};

const PLAN_ORDER = ['freemium', 'pro', 'pro_plus', 'business', 'enterprise'] as const;

function UsageRow({
  label, iconName, iconColor, used, max, color, isLast,
}: { label: string; iconName: IconName; iconColor: string; used: number; max: number; color: string; isLast?: boolean }) {
  const unlimited  = max === -1;
  const pct        = unlimited ? 100 : Math.min(100, Math.round((used / max) * 100));
  const atLimit    = !unlimited && used >= max;
  const nearLimit  = !unlimited && !atLimit && pct >= 70;
  const barColor   = unlimited ? 'bg-finanzas' : atLimit ? 'bg-brand-accent' : nearLimit ? 'bg-amber-500' : color;
  const countColor = atLimit ? 'text-brand-accent' : nearLimit ? 'text-amber-400' : 'text-white';

  return (
    <div className={`flex items-center gap-3.5 px-4 py-3.5 ${isLast ? '' : 'border-b border-white/[.06]'}`}>
      <div className={`w-9 h-9 rounded-[11px] bg-white/[.06] flex items-center justify-center flex-shrink-0 shadow-inner shadow-black/20 ${iconColor}`}>
        <Icon name={iconName} className="w-[18px] h-[18px]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium text-white/90 truncate">{label}</p>
          <span className={`text-[15px] font-semibold tabular-nums flex-shrink-0 ${countColor}`}>
            {used}
            {unlimited ? <span className="text-finanzas"> · ∞</span> : <span className="text-white/30 font-normal">/{max}</span>}
          </span>
        </div>

        <div className="mt-2 w-full bg-white/[.08] rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-700 ease-out ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {!unlimited && (
          <p className="mt-1 text-[11px] text-white/35">
            {atLimit ? (
              <span className="inline-flex items-center gap-1 text-brand-accent">
                <Icon name="warning" className="w-3 h-3" strokeWidth={2} /> Límite alcanzado
              </span>
            ) : `${pct}% utilizado`}
          </p>
        )}
      </div>
    </div>
  );
}

function FeatureList({ plan }: { plan: string }) {
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.freemium;
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6">
      {features.map((f) => (
        <li key={f.label} className="flex items-center gap-2.5">
          {f.included ? (
            <span className="w-[18px] h-[18px] rounded-full bg-finanzas flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-[#070E17]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
              </svg>
            </span>
          ) : (
            <span className="w-[18px] h-[18px] rounded-full bg-white/[.08] flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <span className={`text-[13px] ${f.included ? 'text-white/85' : 'text-white/30 line-through'}`}>
            {f.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlanCard({
  planKey, plan, isPopular, isCurrent, ctaLabel, onUpgrade, loading, disabled,
}: {
  planKey: string;
  plan: PlanLimites;
  isPopular?: boolean;
  isCurrent?: boolean;
  ctaLabel?: string;
  onUpgrade: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  const a = PLAN_ACCENT[planKey] ?? PLAN_ACCENT.freemium;
  const btnClass =
    planKey === 'pro'      ? 'bg-gradient-mercado text-white' :
    planKey === 'pro_plus' ? 'bg-gradient-ventas text-white' :
    planKey === 'business' ? 'bg-gradient-marketing text-white' :
                              'bg-amber-500 text-white';

  return (
    <div
      className={`relative rounded-[26px] p-5 flex flex-col gap-4 ring-1 ${a.ring} ${a.tint} backdrop-blur-xl
                  shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] transition-transform duration-200 active:scale-[0.99]
                  ${isCurrent ? 'ring-2 ring-finanzas/40' : isPopular ? 'ring-2' : ''}`}
    >
      {isCurrent ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-finanzas text-[#070E17] text-[10px] font-bold px-3 py-1 rounded-full shadow-lg shadow-finanzas/30 whitespace-nowrap tracking-wide">
            PLAN ACTUAL
          </span>
        </div>
      ) : isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-brand-primary text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg shadow-brand-primary/30 whitespace-nowrap tracking-wide">
            MÁS POPULAR
          </span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-[14px] bg-white/[.07] flex items-center justify-center shadow-inner shadow-black/20 ${a.text}`}>
            <Icon name={PLAN_ICON[planKey] ?? 'productos'} className="w-6 h-6" />
          </div>
          <div>
            <p className={`font-semibold text-[17px] ${a.text}`}>{plan.nombre}</p>
            <p className="text-[12px] text-white/45">{plan.descripcion}</p>
          </div>
        </div>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`text-[34px] font-bold tracking-tight leading-none ${a.text}`}>${pesos(plan.precio_mxn)}</span>
        <span className="text-[13px] text-white/40 font-medium">MXN / mes · IVA incluido</span>
      </div>

      <div className="h-px bg-white/[.08]" />

      <ul className="space-y-2 flex-1">
        {(PLAN_FEATURES[planKey] ?? []).map((f) => (
          <li key={f.label} className="flex items-start gap-2.5">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${f.included ? 'bg-finanzas' : 'bg-white/[.08]'}`}>
              {f.included ? (
                <svg className="w-2 h-2 text-[#070E17]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-2 h-2 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </span>
            <span className={`text-[13px] leading-snug ${f.included ? 'text-white/80' : 'text-white/25'}`}>{f.label}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onUpgrade}
        disabled={loading || disabled}
        className={`w-full py-3 rounded-full text-[15px] font-semibold transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 shadow-lg shadow-black/20 ${btnClass}`}
      >
        {loading ? 'Redirigiendo…' : (ctaLabel ?? `Actualizar a ${plan.nombre}`)}
      </button>
    </div>
  );
}

function BillingContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus]                 = useState<BillingStatus | null>(null);
  const [loading, setLoading]               = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading]   = useState(false);

  const sessionResult = searchParams.get('session');

  useEffect(() => {
    if (sessionResult === 'success') {
      api.get('/auth/me').then(({ data }) => {
        const saved = localStorage.getItem('usuario');
        const parsed = saved ? JSON.parse(saved) : {};
        localStorage.setItem('usuario', JSON.stringify({ ...parsed, plan: data.plan }));
      }).catch((err: unknown) => {
        console.error('[Billing] Error actualizando plan post-checkout:', err);
      });
    }
    let vigente = true;
    api.get('/billing/status')
      .then(({ data }) => { if (vigente) setStatus(data); })
      .catch(console.error)
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [router, sessionResult]);

  const handleUpgrade = async (plan: string) => {
    setCheckoutLoading(plan);
    try {
      const { data } = await api.post('/billing/checkout', { plan });
      window.location.href = data.checkout_url;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; mensaje?: string } } };
      alert(e.response?.data?.mensaje ?? e.response?.data?.error ?? 'Error al iniciar pago');
    } finally { setCheckoutLoading(null); }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await api.post('/billing/portal');
      window.location.href = data.portal_url;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e.response?.data?.error ?? 'Error al abrir portal');
    } finally { setPortalLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!status) return null;

  const isFreemium = status.plan === 'freemium';
  const hasPaidPlan = !isFreemium;
  const a = PLAN_ACCENT[status.plan] ?? PLAN_ACCENT.freemium;
  const totalUso = status.uso.analisis.total;
  const renuevan = new Date(status.creditos.renuevan_el).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

  const planesComprables = status.planes_comprables;
  const sinPrecioStripe = (planKey: string) =>
    Array.isArray(planesComprables) && !planesComprables.includes(planKey);

  return (
    <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto space-y-7 animate-fade-in pb-20">

      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[34px] leading-none font-bold text-white tracking-tight">Facturación</h1>
          <p className="text-white/45 text-[15px] mt-2">Gestiona tu suscripción y uso</p>
        </div>
        <span className={`text-[12px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0 ${a.badge}`}>
          <Icon name={PLAN_ICON[status.plan] ?? 'productos'} className="w-3.5 h-3.5" strokeWidth={2} />
          {status.limites.nombre}
        </span>
      </div>

      {sessionResult === 'success' && (
        <div className="bg-finanzas/10 ring-1 ring-finanzas/25 rounded-[20px] p-4 flex gap-3 items-start animate-fade-in backdrop-blur-xl">
          <svg className="w-5 h-5 text-finanzas flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="font-semibold text-finanzas text-[15px]">¡Pago exitoso!</p>
            <p className="text-finanzas/70 text-[13px] mt-0.5">Tu plan ha sido actualizado. Puede tomar unos segundos en reflejarse.</p>
          </div>
        </div>
      )}
      {sessionResult === 'cancel' && (
        <div className="bg-amber-500/10 ring-1 ring-amber-500/20 rounded-[20px] p-4 flex gap-3 items-center text-amber-400 text-[14px] backdrop-blur-xl">
          <Icon name="warning" className="w-5 h-5 flex-shrink-0" />
          El proceso de pago fue cancelado. Puedes intentarlo de nuevo cuando quieras.
        </div>
      )}

      <div className={`rounded-[28px] p-6 ring-1 ${a.ring} ${a.tint} backdrop-blur-xl shadow-[0_18px_50px_-18px_rgba(0,0,0,0.7)]`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-[20px] bg-white/[.07] flex items-center justify-center flex-shrink-0 shadow-inner shadow-black/30 ${a.text}`}>
              <Icon name={PLAN_ICON[status.plan] ?? 'productos'} className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-1">Plan actual</p>
              <p className={`text-[22px] font-bold tracking-tight ${a.text}`}>{status.limites.nombre}</p>
              <p className="text-[14px] text-white/55 mt-0.5">{status.limites.descripcion}</p>
              {status.plan_expires_at && (
                <p className="text-[12px] text-white/40 mt-1.5">
                  Renueva el {new Date(status.plan_expires_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3 flex-shrink-0">
            {status.limites.precio_mxn > 0 ? (
              <div className="sm:text-right">
                <p className={`text-[32px] font-bold tracking-tight leading-none ${a.text}`}>${pesos(status.limites.precio_mxn)}</p>
                <p className="text-[12px] text-white/40 mt-1">MXN / mes</p>
              </div>
            ) : (
              <p className="text-[14px] text-white/40 font-medium">Gratis</p>
            )}
            {hasPaidPlan && (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="text-[14px] font-semibold text-white bg-white/10 hover:bg-white/15 px-4 py-2 rounded-full transition-all active:scale-[0.97] disabled:opacity-40 whitespace-nowrap"
              >
                {portalLoading ? 'Cargando…' : 'Administrar →'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/[.08]">
          <p className="text-[11px] font-semibold text-white/45 mb-3.5 uppercase tracking-widest">Lo que incluye tu plan</p>
          <FeatureList plan={status.plan} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between px-1 mb-2.5">
          <h2 className="text-[13px] font-semibold text-white/45 uppercase tracking-widest">Uso actual</h2>
          <span className="text-[12px] text-white/40 tabular-nums">{totalUso} análisis totales</span>
        </div>

        <div className="rounded-[22px] ring-1 ring-white/[.08] bg-white/[.04] backdrop-blur-xl overflow-hidden shadow-[0_10px_40px_-16px_rgba(0,0,0,0.6)]">
          <UsageRow
            label="Productos activos"
            iconName="productos"
            iconColor="text-white/70"
            used={status.uso.productos}
            max={status.limites.max_productos}
            color="bg-white/50"
          />
          <UsageRow
            label="Créditos de IA este mes"
            iconName="tip"
            iconColor="text-mercado"
            used={status.creditos.usados}
            max={status.creditos.mes}
            color="bg-mercado"
            isLast
          />
        </div>
        <p className="mt-2 px-1 text-[12px] text-white/40">
          Se renuevan el {renuevan}. Si un análisis falla o sale de plantilla, el crédito se devuelve.
          {status.plan === 'freemium' && ' En el plan gratuito los análisis no gastan créditos: tienes uno por módulo.'}
        </p>

        {isFreemium && (
          <div className="mt-3 flex items-center gap-3 bg-brand-primary/[.07] ring-1 ring-brand-primary/20 rounded-[18px] p-3.5 backdrop-blur-xl">
            <Icon name="tip" className="w-5 h-5 text-brand-primary flex-shrink-0" />
            <p className="text-[13px] text-white/70">
              Con el plan Emprendedor obtienes <span className="text-brand-primary font-semibold">25 créditos de IA al mes</span> para repetir análisis y usar las herramientas con IA.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="px-1">
          <h2 className="text-[20px] font-bold text-white tracking-tight">
            {isFreemium ? 'Actualiza tu plan' : 'Todos los planes'}
          </h2>
          <p className="text-[14px] text-white/45 mt-1">
            {isFreemium
              ? 'Desbloquea más productos, herramientas y créditos de IA para repetir tus análisis.'
              : 'Compara lo que incluye cada plan y mejora cuando lo necesites.'}
          </p>
        </div>

        {!status.stripe_disponible && (
          <div className="bg-amber-500/10 ring-1 ring-amber-500/20 rounded-[18px] p-3.5 text-[13px] text-amber-400 flex gap-2 items-center backdrop-blur-xl">
            <Icon name="warning" className="w-4 h-4 flex-shrink-0" />
            Los pagos aún no están habilitados. Configura <code className="font-mono bg-white/5 px-1 rounded">STRIPE_SECRET_KEY</code> para activarlos.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-2">
          {(['pro', 'pro_plus', 'business'] as const).map((planKey) => {
            const plan = status.todos_planes[planKey];
            if (!plan) return null;
            const isCurrent  = status.plan === planKey;
            const esInferior = PLAN_ORDER.indexOf(planKey) < PLAN_ORDER.indexOf(status.plan as (typeof PLAN_ORDER)[number]);
            const sinPrecio  = sinPrecioStripe(planKey);
            const ctaLabel   = isCurrent
              ? 'Tu plan actual'
              : esInferior
                ? 'Incluido en tu plan'
                : sinPrecio
                  ? 'No disponible aún'
                  : `Actualizar a ${plan.nombre}`;
            return (
              <PlanCard
                key={planKey}
                planKey={planKey}
                plan={plan}
                isPopular={!isCurrent && !esInferior && !sinPrecio && planKey === 'pro_plus'}
                isCurrent={isCurrent}
                ctaLabel={ctaLabel}
                onUpgrade={() => handleUpgrade(planKey)}
                loading={checkoutLoading === planKey}
                disabled={isCurrent || esInferior || sinPrecio || !!checkoutLoading || !status.stripe_disponible}
              />
            );
          })}
        </div>

        <div className="rounded-[24px] ring-1 ring-amber-500/20 bg-amber-500/[.06] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-[14px] bg-white/[.07] flex items-center justify-center text-amber-400 shadow-inner shadow-black/20">
              <Icon name="enterprise" className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-amber-400 text-[15px]">Enterprise</p>
              <p className="text-[13px] text-white/50 mt-0.5">Volumen, SLA personalizado y soporte dedicado</p>
            </div>
          </div>
          <a
            href="mailto:hola@bi0a100.com?subject=Enterprise"
            className="flex-shrink-0 text-[14px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 px-4 py-2.5 rounded-full transition-all active:scale-[0.97]"
          >
            Contactar ventas →
          </a>
        </div>
      </div>

      {hasPaidPlan && (
        <div className="rounded-[22px] ring-1 ring-white/[.08] bg-white/[.04] backdrop-blur-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-white">¿Necesitas cambiar tu plan?</p>
            <p className="text-[13px] text-white/50 mt-0.5">Desde el portal puedes actualizar, cambiar tarjeta o cancelar cuando quieras.</p>
          </div>
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="text-[14px] font-semibold text-white bg-white/10 hover:bg-white/15 px-4 py-2.5 rounded-full transition-all active:scale-[0.97] disabled:opacity-40 flex-shrink-0"
          >
            {portalLoading ? 'Cargando…' : 'Abrir portal de pagos →'}
          </button>
        </div>
      )}

    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}