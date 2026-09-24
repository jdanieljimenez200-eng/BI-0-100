'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { esPlanDePago } from '../../lib/plans';

/**
 * Slot de publicidad interna para cuentas del plan gratuito.
 *
 * Decisiones deliberadas:
 * - Solo se renderiza si el plan NO es de pago (`esPlanDePago`, espejo de
 *   PLAN_LIMITES del backend). Nunca molesta a un cliente que ya paga.
 * - Sin scripts ni iframes de terceros: en pantalla hay datos de negocio del
 *   usuario (márgenes, canales de venta, proyecciones) y un tag externo leería el DOM
 *   y la URL. Todas las creatividades son propias.
 * - `data-print="hide"`: globals.css lo oculta en @media print, así que no
 *   aparece en el PDF que generan las páginas de resultado.
 * - Descartable: al ocultarlo no vuelve durante 7 días (localStorage).
 */

const STORAGE_KEY = 'bi_upsell_dismissed_until';
const DIAS_OCULTO = 7;
const MS_DIA = 86_400_000;

type Creatividad = {
  id: string;
  eyebrow: string;
  titulo: string;
  texto: string;
  cta: string;
  href: string;
  color: string;
};

// Cada afirmación corresponde a un límite real del plan freemium.
const CREATIVIDADES: readonly Creatividad[] = [
  {
    id: 'analisis',
    eyebrow: 'Créditos de IA',
    titulo: 'Repite tus análisis cuando cambie tu idea',
    texto:
      'El plan gratuito incluye un análisis por módulo y producto. Con créditos de IA mensuales repites mercado, marketing, finanzas y ventas cada vez que lo necesites.',
    cta: 'Ver planes',
    href: '/dashboard/billing',
    color: '#3B82F6',
  },
  {
    id: 'legal',
    eyebrow: 'Plan Negocio',
    titulo: 'Validación legal de tu producto',
    texto:
      'Permisos, licencias y riesgos regulatorios revisados antes de invertir. El módulo legal se desbloquea desde el plan Negocio.',
    cta: 'Desbloquear módulo legal',
    href: '/dashboard/billing',
    color: '#A78BFA',
  },
  {
    id: 'herramientas',
    eyebrow: 'Planes de pago',
    titulo: 'Herramientas sin tope de movimientos',
    texto:
      'En el plan gratuito cada herramienta admite 2 movimientos. En cualquier plan de pago operas punto de venta, inventario y reportes sin límite.',
    cta: 'Comparar planes',
    href: '/dashboard/billing',
    color: '#06B6D4',
  },
  {
    id: 'alertas',
    eyebrow: 'Plan Negocio',
    titulo: 'Resumen con IA de tus alertas',
    texto:
      'Un resumen claro de lo que pide atención en tu negocio: margen, caja, inventario y clientes, en un solo vistazo.',
    cta: 'Ver plan Negocio',
    href: '/dashboard/billing',
    color: '#10B981',
  },
];

/** Marca de tiempo hasta la que el slot está oculto (0 = visible). */
function leerOcultoHasta(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    // Modo privado o storage bloqueado: se considera visible.
    return 0;
  }
}

export interface UpsellSlotProps {
  /** Plan de la cuenta tal cual llega de /auth/me o localStorage. */
  plan: string | null | undefined;
  /** `inline` para el cuerpo de una página, `compact` para el sidebar. */
  variant?: 'inline' | 'compact';
  className?: string;
}

export default function UpsellSlot({ plan, variant = 'inline', className = '' }: UpsellSlotProps) {
  // Arranca oculto y se decide tras montar: localStorage no existe en el
  // render del servidor y compararlo provocaría desajuste de hidratación.
  const [visible, setVisible] = useState(false);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    const ahora = Date.now();
    setVisible(leerOcultoHasta() <= ahora);
    // Rotación diaria estable: no cambia entre renders del mismo día.
    setIndice(Math.floor(ahora / MS_DIA) % CREATIVIDADES.length);
  }, []);

  const ocultar = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now() + DIAS_OCULTO * MS_DIA));
    } catch {
      // Sin storage: se oculta solo durante esta sesión.
    }
  }, []);

  if (esPlanDePago(plan) || !visible) return null;

  const c = CREATIVIDADES[indice] ?? CREATIVIDADES[0];
  const cerrarLabel = `Ocultar esta sugerencia durante ${DIAS_OCULTO} días`;

  const BotonCerrar = (
    <button
      type="button"
      onClick={ocultar}
      title={cerrarLabel}
      aria-label={cerrarLabel}
      className="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-lg text-white/25 hover:text-white/70 hover:bg-white/[.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );

  if (variant === 'compact') {
    return (
      <aside
        data-print="hide"
        aria-label="Sugerencia de plan"
        className={`relative rounded-xl border border-white/[.07] bg-white/[.02] p-3 pr-8 ${className}`}
      >
        {BotonCerrar}
        <p
          className="text-[9px] font-bold uppercase tracking-[0.16em] mb-1"
          style={{ color: c.color }}
        >
          {c.eyebrow}
        </p>
        <p className="text-[12px] font-semibold text-white/70 leading-snug mb-2 break-words">
          {c.titulo}
        </p>
        <Link
          href={c.href}
          className="inline-flex items-center gap-1 text-[11px] font-bold rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          style={{ color: c.color }}
        >
          {c.cta}
          <ChevronRight className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        </Link>
      </aside>
    );
  }

  return (
    <aside
      data-print="hide"
      aria-label="Sugerencia de plan"
      className={`relative rounded-2xl border border-white/[.08] bg-white/[.02] overflow-hidden ${className}`}
    >
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: c.color }} aria-hidden="true" />
      {BotonCerrar}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 pl-6 pr-10">
        <div className="min-w-0 flex-1">
          <p
            className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5"
            style={{ color: c.color }}
          >
            {c.eyebrow}
          </p>
          <h3 className="text-[15px] font-bold text-white/85 tracking-tight leading-snug mb-1 break-words">
            {c.titulo}
          </h3>
          <p className="text-[12.5px] text-white/60 leading-relaxed break-words">{c.texto}</p>
        </div>
        <Link
          href={c.href}
          className="inline-flex items-center justify-center gap-1.5 flex-shrink-0 px-4 py-2.5 rounded-xl text-[12.5px] font-bold border transition-all duration-200 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          style={{ color: c.color, borderColor: `${c.color}40`, background: `${c.color}12` }}
        >
          {c.cta}
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}