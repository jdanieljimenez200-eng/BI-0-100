'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { estaBloqueada } from '@/lib/gating';
import { useAuth } from '@/hooks/useAuth';
import { useAnalysisLoaderGate } from '@/app/hooks/useAnalysisLoaderGate';
import gsap from 'gsap';
import { motion } from 'framer-motion';
import CargaAnalisisVentas from '@/components/ventas/CargaAnalisisVentas';
import PerfilClientePanel, { type PerfilCliente } from '@/components/ventas/PerfilClientePanel';
import ScriptScorerPanel from '@/components/ventas/ScriptScorerPanel';
import FollowUpsCard from '@/components/ventas/FollowUpsCard';
import CompetitorIntelPanel from '@/components/ventas/CompetitorIntelPanel';
import AvisoEstimacion from '@/components/ui/AvisoEstimacion';

interface TipNegociacion {
  titulo: string;
  descripcion: string;
  ejemplo_practico: string;
  error_comun: string;
}

interface HistoriaEmprendedor {
  nombre: string;
  industria: string;
  pais: string;
  como_lo_logro: string;
  mentalidad_clave: string;
  obstaculo_principal: string;
  estrategia_marketing: string;
  metricas: string;
  leccion_aplicable: string;
  fecha: string;
}

interface RazonFracaso {
  titulo: string;
  descripcion: string;
  senales_alerta: string[];
  como_evitarlo: string;
}

interface PorqueFallan {
  patron_comun: string;
  razones: RazonFracaso[];
}

interface AnalisisVentas {
  id: string;
  estado_analisis: 'procesando' | 'completado' | 'error';
  error_mensaje?: string | null;
  tips_data?: TipNegociacion[] | null;
  historia_data?: HistoriaEmprendedor | null;
  porque_fallan_data?: PorqueFallan | null;
  perfil_cliente_data?: PerfilCliente | null;
  secciones_bloqueadas?: string[] | null;
  resultado_estimado?: boolean;
  nombre_producto?: string;
  categoria?: string;
  pais?: string;
}

type TabId = 'tips' | 'historia' | 'fallan' | 'icp' | 'guiones' | 'competidores' | 'completo';

// ─── Vector Icons (0 Emojis) ──────────────────────────────────────────────────

function IconLightbulb(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
      <path d="M9 18h6"/><path d="M10 22h4"/>
    </svg>
  );
}

function IconBook(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
      <path d="M6 6h10"/><path d="M6 10h10"/>
    </svg>
  );
}

function IconShieldRisk(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function IconCrosshair(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>
    </svg>
  );
}

function IconGauge(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>
    </svg>
  );
}

function IconRadar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12 21.5 8.5"/><path d="M12 6a6 6 0 1 0 6 6"/><path d="M12 12h.01"/>
    </svg>
  );
}

function IconLock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconCheckCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

function IconXCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
}

function IconMapPin(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function IconLayers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
    </svg>
  );
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'tips', label: 'Protocolos de Cierre', icon: <IconLightbulb className="w-4 h-4" /> },
  { id: 'historia', label: 'Historia ilustrativa', icon: <IconBook className="w-4 h-4" /> },
  { id: 'fallan', label: 'Matriz Post-Mortem', icon: <IconShieldRisk className="w-4 h-4" /> },
  { id: 'icp', label: 'Perfil ICP', icon: <IconCrosshair className="w-4 h-4" /> },
  { id: 'guiones', label: 'Evaluador de Pitch', icon: <IconGauge className="w-4 h-4" /> },
  { id: 'competidores', label: 'Radar Competitivo', icon: <IconRadar className="w-4 h-4" /> },
  { id: 'completo', label: 'Vista Completa', icon: <IconLayers className="w-4 h-4" /> },
];

export default function ResultadoVentasPage() {
  const { analisisId, productoId } = useParams() as { analisisId: string; productoId: string };
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [analisis, setAnalisis] = useState<AnalisisVentas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('tips');
  const [printMode, setPrintMode] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [tieneVideoPitch, setTieneVideoPitch] = useState(false);
  const isPreloaded = useRef(false);
  const initialCheckDone = useRef(false);

  // Independiente del polling del análisis: solo para saber si el Evaluador
  // de Guiones puede ofrecer "Evaluar mi vídeo de pitch".
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ video_url?: string | null }>(`/productos/${productoId}`)
      .then(({ data }) => {
        if (!cancelled) setTieneVideoPitch(Boolean(data.video_url));
      })
      .catch(() => {
        /* opcional: si falla, simplemente no se ofrece la opción de vídeo */
      });
    return () => {
      cancelled = true;
    };
  }, [productoId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }
    if (authLoading) return;

    let cancelled = false;

    const fetchAnalisis = async () => {
      try {
        setLoading(true);
        setError(null);

        // Mientras procesa, solo se pide el estado (liviano); el payload
        // completo se pide una única vez, al terminar (completado o error).
        type EstadoAnalisis = 'procesando' | 'completado' | 'error';
        let estado: EstadoAnalisis | null = null;
        let attempts = 0;
        const maxAttempts = 75;

        while (attempts < maxAttempts && estado !== 'completado' && estado !== 'error') {
          if (cancelled) return;
          try {
            const response = await api.get<{ id: string; estado: EstadoAnalisis; error: string | null }>(
              `/ventas/${analisisId}/status`
            );
            estado = response.data.estado;
            if (estado === 'completado') {
              if (!initialCheckDone.current) {
                isPreloaded.current = true;
              }
              initialCheckDone.current = true;
              break;
            }
            if (estado === 'error') {
              initialCheckDone.current = true;
              break;
            }
            initialCheckDone.current = true;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            attempts++;
          } catch (err: unknown) {
            initialCheckDone.current = true;
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 404) throw err;
            if (attempts >= maxAttempts - 1) throw err;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            attempts++;
          }
        }

        if (cancelled) return;
        if (estado !== 'completado' && estado !== 'error') {
          throw new Error('El análisis está tardando más de lo esperado.');
        }

        const { data } = await api.get<AnalisisVentas>(`/ventas/${analisisId}`);
        if (cancelled) return;
        setAnalisis(data);

        // El worker SÍ persiste `error_mensaje`, pero el polling sale de un
        // estado 'error' con un `break` normal, no con throw: sin esto el estado
        // `error` se queda en null y la tarjeta de fallo nunca se pinta (el
        // usuario ve las tres pestañas vacías con "Intenta nuevamente").
        if (data.estado_analisis === 'error') {
          setError(data.error_mensaje?.trim() || 'El análisis falló. Vuelve a intentarlo.');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar análisis');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAnalisis();
    return () => {
      cancelled = true;
    };
  }, [analisisId, authLoading, user, router, retryKey]);

  // Loader gate: 700ms si el análisis ya estaba completado, o 4.5s si es nuevo
  const { showLoader, loaderDone } = useAnalysisLoaderGate(
    !loading && !!analisis && analisis.estado_analisis === 'completado',
    isPreloaded.current ? 700 : 4500
  );

  useEffect(() => {
    if (!loading && analisis && !showLoader) {
      const el = document.querySelector('.tab-content');
      if (el) {
        gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      }
    }
  }, [activeTab, loading, analisis, showLoader]);

  // printMode monta las tres pestañas a la vez (ver .tab-content abajo): el
  // margen sube a 350ms porque el navegador debe maquetar dos secciones que no
  // estaban en el DOM antes de abrir el diálogo de impresión.
  const handlePrint = () => {
    setPrintMode(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintMode(false), 500);
    }, 350);
  };

  // Auth todavía hidratando → fondo oscuro para evitar flash blanco
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#070B12] flex items-center justify-center">
        <div className="h-1 w-48 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
        </div>
      </div>
    );
  }

  // Error: la fila en 'error' basta para pintar la tarjeta — no dependemos de
  // que además exista el estado local `error` (404 y fallo de red sí lo usan).
  if (analisis?.estado_analisis === 'error' || (error && !analisis)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070B12] p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3">
            <IconShieldRisk className="w-6 h-6" />
          </div>
          <h1 className="mt-2 text-lg font-bold text-red-300">El análisis no pudo completarse</h1>
          <p className="mt-2 text-xs text-white/50">{analisis?.error_mensaje || error}</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            {!analisis && (
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="rounded-xl bg-white/90 px-5 py-2.5 text-xs font-semibold text-[#0F1C2A] transition-colors hover:bg-white"
              >
                Reintentar
              </button>
            )}
            <Link
              href="/dashboard"
              className="inline-block rounded-xl border border-white/15 px-5 py-2.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.05]"
            >
              Volver al dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── PÁGINA DE CARGA DEL ANÁLISIS ──
  if (showLoader || !analisis || loading) {
    return <CargaAnalisisVentas producto={analisis?.nombre_producto} done={loaderDone} />;
  }

  const plan = user.plan;
  const bloqueoFallan = estaBloqueada(plan, 'ventas.porque_fallan', analisis.secciones_bloqueadas ?? []);
  const bloqueoICP = estaBloqueada(plan, 'ventas.perfil_cliente', analisis.secciones_bloqueadas ?? []);
  const bloqueoScorer = estaBloqueada(plan, 'ventas.script_scorer', analisis.secciones_bloqueadas ?? []);
  const bloqueoCompetidores = estaBloqueada(plan, 'ventas.competitor_intel', analisis.secciones_bloqueadas ?? []);

  // Normalización universal de tips de negociación (soporta Array directo y Objeto con clave .tips)
  const rawTips = Array.isArray(analisis.tips_data)
    ? analisis.tips_data
    : (Array.isArray((analisis.tips_data as any)?.tips) ? (analisis.tips_data as any).tips : []);

  const tips: TipNegociacion[] = rawTips
    .filter((tip: any) => tip && typeof tip === 'object' && typeof (tip.titulo || tip.descripcion) === 'string')
    .map((tip: any, idx: number) => ({
      titulo: tip.titulo || `Protocolo de Negociación ${idx + 1}`,
      descripcion: tip.descripcion || '',
      ejemplo_practico: tip.ejemplo_practico || 'Presenta esta solución enfocándote en el retorno tangible para el cliente.',
      error_comun: tip.error_comun || 'Bajar precios antes de defender el valor integral de la propuesta.',
    }));

  // La historia es un personaje COMPUESTO por la IA (ver ventasService.generarHistoria):
  // se presenta siempre como ilustrativa y nunca se rellenan cifras o fechas que
  // no vinieron en los datos, para no hacerla pasar por un caso real.
  const rawHistoria = analisis.historia_data as any;
  const historia: HistoriaEmprendedor | null = rawHistoria && typeof rawHistoria === 'object'
    ? {
        nombre: rawHistoria.nombre || rawHistoria.titulo || 'Historia ilustrativa',
        industria: rawHistoria.industria || analisis.categoria || 'Servicios & Comercial',
        pais: rawHistoria.pais || analisis.pais || 'México',
        como_lo_logro: rawHistoria.como_lo_logro || rawHistoria.contenido || '',
        mentalidad_clave: rawHistoria.mentalidad_clave || rawHistoria.moraleja || 'El posicionamiento y la consistencia visual construyen autoridad.',
        obstaculo_principal: rawHistoria.obstaculo_principal || 'Competencia desleal por precio y resistencia inicial de prospectos.',
        estrategia_marketing: rawHistoria.estrategia_marketing || 'Estrategia de prueba social en redes y venta consultiva.',
        metricas: rawHistoria.metricas || '',
        leccion_aplicable: rawHistoria.leccion_aplicable || rawHistoria.moraleja || 'Diferenciarse por calidad y procesos claros blinda los márgenes.',
        fecha: rawHistoria.fecha || '',
      }
    : null;

  // Deprecado: el análisis de riesgo de negocio ahora vive en Finanzas
  // (services/finanzas/riesgosService.ts) — es contenido financiero, no una
  // táctica de venta. `null` aquí es el estado correcto para análisis nuevos;
  // los análisis viejos con datos guardados lo siguen mostrando tal cual.
  const porqueFallanRaw = analisis.porque_fallan_data ?? null;
  const porqueFallan: PorqueFallan | null = porqueFallanRaw
    ? {
        patron_comun: porqueFallanRaw.patron_comun ?? '',
        razones: Array.isArray(porqueFallanRaw.razones)
          ? porqueFallanRaw.razones.map((razon) => ({
              ...razon,
              senales_alerta: Array.isArray(razon.senales_alerta) ? razon.senales_alerta : [],
            }))
          : [],
      }
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F1B2E] via-[#0A0F17] to-[#070B12]" data-print-mode={printMode ? 'true' : 'false'}>
      {/* Header */}
      <header data-print="hide" className="sticky top-0 z-30 border-b border-white/[0.07] bg-gradient-to-r from-[#0F1B2E]/85 via-[#0A0F17]/85 to-[#070B12]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/[0.09] p-1.5 text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white"
            aria-label="Volver"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-mono font-bold tracking-[0.16em] text-emerald-300 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ARQUITECTURA COMERCIAL · REVOPS
          </span>
          <div className="ml-auto">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Exportar PDF</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-7">
        <AvisoEstimacion visible={analisis?.resultado_estimado} className="mb-6 print:hidden" />
        {/* Chips resumen */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-wrap gap-2 print:hidden"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-500/[0.08] px-3 py-1 text-[11px] font-semibold text-cyan-200">
            <IconLightbulb className="w-3 h-3 text-cyan-400" />
            <span>{tips.length} protocolos de cierre</span>
          </span>
          {historia?.fecha && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/25 bg-purple-500/[0.08] px-3 py-1 text-[11px] font-semibold text-purple-200">
              <IconBook className="w-3 h-3 text-purple-400" />
              <span>Historia ilustrativa · {historia.fecha}</span>
            </span>
          )}
          {porqueFallan && porqueFallan.razones.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/25 bg-red-500/[0.08] px-3 py-1 text-[11px] font-semibold text-red-200">
              <IconShieldRisk className="w-3 h-3 text-red-400" />
              <span>{porqueFallan.razones.length} riesgos tipificados</span>
            </span>
          )}
          {!bloqueoICP && analisis.perfil_cliente_data && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/[0.08] px-3 py-1 text-[11px] font-semibold text-violet-200">
              <IconCrosshair className="w-3 h-3 text-violet-400" />
              <span>ICP Calibrado</span>
            </span>
          )}
          {!bloqueoScorer && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/[0.08] px-3 py-1 text-[11px] font-semibold text-amber-200">
              <IconGauge className="w-3 h-3 text-amber-400" />
              <span>Evaluador de Pitch Activo</span>
            </span>
          )}
          {!bloqueoCompetidores && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-500/[0.08] px-3 py-1 text-[11px] font-semibold text-rose-200">
              <IconRadar className="w-3 h-3 text-rose-400" />
              <span>Radar Competitivo Activo</span>
            </span>
          )}
        </motion.div>

        {/* ─── NAVEGACIÓN POR PESTAÑAS (LUJO SILENCIOSO) ─── */}
        <div data-print="hide" className="sticky top-16 z-20 mb-6">
          <div className="p-1.5 rounded-2xl bg-[#08101a]/90 border border-white/10 backdrop-blur-xl shadow-2xl flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {TABS.filter((tab) => tab.id !== 'fallan' || bloqueoFallan || !!porqueFallan).map((tab) => {
              const isActive = activeTab === tab.id;
              const isLocked = (tab.id === 'fallan' && bloqueoFallan) ||
                               (tab.id === 'icp' && bloqueoICP) ||
                               (tab.id === 'guiones' && bloqueoScorer) ||
                               (tab.id === 'competidores' && bloqueoCompetidores);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                    isActive
                      ? 'text-white bg-white/[0.08] border border-white/20 shadow-lg shadow-black/20'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03] border border-transparent'
                  }`}
                >
                  {isActive && (
                    <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-transparent pointer-events-none" />
                  )}
                  <span className={`flex items-center ${isActive ? 'text-emerald-400' : 'text-white/40'}`}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                  {isLocked && (
                    <IconLock className="w-3 h-3 text-amber-400/80 ml-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="tab-content space-y-6">
          {/* ── TIPS ── */}
          {(printMode || activeTab === 'tips' || activeTab === 'completo') && (
            <div className="print-section space-y-3.5">
              <h2 className="print-only mb-4 text-lg">Protocolos y Tácticas de Cierre</h2>
              {tips.length > 0 ? (
                tips.map((tip, idx) => (
                  <motion.article
                    key={idx}
                    initial={printMode ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="vc-card group relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-white/[0.03] p-5 transition-colors hover:border-cyan-400/50"
                  >
                    <span className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-emerald-400 to-cyan-400" />
                    <div className="mb-2.5 flex items-start gap-3 pl-1.5">
                      <span className="font-mono text-xl font-black text-emerald-400/40">{String(idx + 1).padStart(2, '0')}</span>
                      <h3 className="pt-0.5 text-base font-bold leading-snug text-white">{tip.titulo}</h3>
                    </div>
                    <p className="pl-1.5 text-sm leading-relaxed text-white/60">{tip.descripcion}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3.5">
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                          <IconCheckCircle className="w-3.5 h-3.5" />
                          <span>Protocolo de Argumentación</span>
                        </div>
                        <p className="text-sm italic leading-relaxed text-white/70">“{tip.ejemplo_practico}”</p>
                      </div>
                      <div className="rounded-xl border border-red-400/15 bg-red-400/[0.04] p-3.5">
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-widest text-red-300">
                          <IconXCircle className="w-3.5 h-3.5" />
                          <span>Fricción Crítica a Evitar</span>
                        </div>
                        <p className="text-sm leading-relaxed text-white/60">{tip.error_comun}</p>
                      </div>
                    </div>
                  </motion.article>
                ))
              ) : (
                <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/[0.05] p-5 text-sm text-yellow-200/80">
                  No hay protocolos disponibles en este momento.
                </div>
              )}
              {!printMode && <FollowUpsCard analisisId={analisisId} bloqueado={bloqueoScorer} />}
            </div>
          )}

          {/* ── HISTORIA DEL DÍA ── */}
          {(printMode || activeTab === 'historia' || activeTab === 'completo') && (
            <div className="print-section">
              <h2 className="print-only mb-4 text-lg">Historia ilustrativa (generada con IA)</h2>
              {historia ? (
                <motion.article
                  initial={printMode ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="vc-card overflow-hidden rounded-2xl border border-purple-400/15 bg-white/[0.02]"
                >
                  <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-indigo-600 to-violet-700 px-6 py-6">
                    <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                    <p className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-white/70">
                      Historia ilustrativa{historia.fecha ? ` · ${historia.fecha}` : ''}
                    </p>
                    <h3 className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl">{historia.nombre}</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white">{historia.industria}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white">
                        <IconMapPin className="w-3 h-3 text-white/80" />
                        <span>{historia.pais}</span>
                      </span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-white/75">
                      Personaje y cifras compuestos por IA a partir de patrones de pequeños negocios. No es un caso real ni verificado: úsalo como ejemplo, no como referencia de resultados.
                    </p>
                  </div>

                  <div className="space-y-5 p-6">
                    <section>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-purple-300/90">Estrategia de Penetración y Crecimiento</p>
                      <p className="text-[15px] leading-relaxed text-white/75">{historia.como_lo_logro}</p>
                    </section>

                    <div className="grid gap-3.5 md:grid-cols-2">
                      <section className="rounded-xl border border-purple-400/15 bg-purple-400/[0.05] p-4">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-purple-300">Principio Estratégico</p>
                        <p className="text-sm italic leading-relaxed text-white/70">“{historia.mentalidad_clave}”</p>
                      </section>
                      <section className="rounded-xl border border-orange-400/15 bg-orange-400/[0.05] p-4">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-orange-300">Fricción Crítica Superada</p>
                        <p className="text-sm leading-relaxed text-white/70">{historia.obstaculo_principal}</p>
                      </section>
                    </div>

                    <section>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300/90">Canal de Adquisición & Go-To-Market</p>
                      <p className="text-sm leading-relaxed text-white/70">{historia.estrategia_marketing}</p>
                    </section>

                    <div className="grid gap-3.5 md:grid-cols-2">
                      {historia.metricas && (
                        <div className="rounded-xl border border-blue-400/15 bg-blue-400/[0.05] p-4">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-blue-300">Métricas & Tracción (ilustrativas)</p>
                          <p className="text-sm font-semibold text-white/85">{historia.metricas}</p>
                        </div>
                      )}
                      <div className="rounded-xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.09] to-cyan-400/[0.05] p-4">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Principio Transferible a tu Operación</p>
                        <p className="text-sm font-medium leading-relaxed text-white/85">{historia.leccion_aplicable}</p>
                      </div>
                    </div>
                  </div>
                </motion.article>
              ) : (
                <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/[0.05] p-5 text-sm text-yellow-200/80">
                  La historia ilustrativa no está disponible actualmente.
                </div>
              )}
            </div>
          )}

          {(printMode || activeTab === 'fallan' || activeTab === 'completo') && (bloqueoFallan || !!porqueFallan) && (
            <div className="print-section">
              <h2 className="print-only mb-4 text-lg">Matriz Post-Mortem & Mitigación</h2>
              {bloqueoFallan ? (
                <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30">
                  <div aria-hidden="true" className="pointer-events-none select-none space-y-3.5 p-5 blur-[6px] opacity-35">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
                        <div className="mb-3 h-4 w-2/5 rounded-full bg-white/10" />
                        <div className="mb-2 h-3 w-full rounded-full bg-white/[0.07]" />
                        <div className="h-3 w-4/6 rounded-full bg-white/[0.07]" />
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0A0F17]/60 via-[#0A0F17]/85 to-[#0A0F17]/95 px-6 text-center">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 text-red-400">
                      <IconLock className="w-5 h-5" />
                    </div>
                    <h3 className="max-w-md text-lg font-bold leading-snug text-white">
                      Matriz de Riesgo y Causas de Mortalidad Comercial
                    </h3>
                    <p className="max-w-md text-sm leading-relaxed text-white/45">
                      Causas empíricas de quiebre para tu industria, canal y ticket — con señales de alerta temprana y
                      protocolos de mitigación preventiva.
                    </p>
                    <Link
                      href="/dashboard/billing"
                      className="mt-1 inline-block rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-2.5 text-sm font-bold text-[#05221B] shadow-[0_6px_24px_rgba(52,211,153,0.25)] transition-all hover:brightness-110"
                    >
                      Desbloquear con Pro
                    </Link>
                  </div>
                </div>
              ) : porqueFallan ? (
                <motion.div initial={printMode ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                  <div className="relative overflow-hidden rounded-2xl border border-red-400/20 bg-gradient-to-br from-red-500/[0.12] to-transparent p-6">
                    <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/60 to-transparent" />
                    <p className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-red-300/90">
                      <IconShieldRisk className="w-3.5 h-3.5 text-red-400" />
                      <span>Patrón Crítico de Falla Comercial</span>
                    </p>
                    <p className="text-[15px] leading-relaxed text-white/80">{porqueFallan.patron_comun}</p>
                  </div>

                  {porqueFallan.razones.map((razon, idx) => (
                    <motion.article
                      key={idx}
                      initial={printMode ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      className="vc-card relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-white/[0.03] p-5"
                    >
                      <span className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-red-400 to-orange-400" />
                      <h3 className="pl-2 text-base font-bold text-white">
                        <span className="mr-1.5 font-mono text-red-400/50">{String(idx + 1).padStart(2, '0')}</span>
                        {razon.titulo}
                      </h3>
                      <p className="mb-4 mt-1.5 pl-2 text-sm leading-relaxed text-white/60">{razon.descripcion}</p>

                      <div className="grid gap-3.5 md:grid-cols-2">
                        <div className="rounded-xl border border-red-400/15 bg-red-400/[0.04] p-4">
                          <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-red-300">
                            <IconShieldRisk className="w-3.5 h-3.5" />
                            <span>Señales de Alerta Temprana</span>
                          </div>
                          <ul className="space-y-1.5">
                            {razon.senales_alerta.map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm text-white/65">
                                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rotate-45 bg-red-400/80" />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.09] to-transparent p-4">
                          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                            <IconCheckCircle className="w-3.5 h-3.5" />
                            <span>Protocolo de Mitigación</span>
                          </div>
                          <p className="text-sm font-medium leading-relaxed text-white/80">{razon.como_evitarlo}</p>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </motion.div>
              ) : null}
            </div>
          )}

          {/* ── ICP TRACKER ── */}
          {(activeTab === 'icp' || activeTab === 'completo') && (
            <div className="print-section">
              <PerfilClientePanel
                analisisId={analisisId}
                perfil={analisis.perfil_cliente_data ?? null}
                bloqueado={bloqueoICP}
                onUpdate={(p) => setAnalisis(prev => prev ? { ...prev, perfil_cliente_data: p } : prev)}
              />
            </div>
          )}

          {/* ── SCRIPT SCORER ── */}
          {(activeTab === 'guiones' || activeTab === 'completo') && (
            <div className="print-section">
              <ScriptScorerPanel
                analisisId={analisisId}
                bloqueado={bloqueoScorer}
                tieneVideoPitch={tieneVideoPitch}
              />
            </div>
          )}

          {/* ── COMPETITOR INTEL ── */}
          {(activeTab === 'competidores' || activeTab === 'completo') && (
            <div className="print-section">
              <CompetitorIntelPanel
                analisisId={analisisId}
                bloqueado={bloqueoCompetidores}
                miProductoNombre={analisis.nombre_producto ?? 'Mi producto'}
              />
            </div>
          )}
        </div>
      </div>


    </div>
  );
}

