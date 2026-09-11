'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import AnalysisLoader from '@/components/ui/AnalysisLoader';
import {
  IconObjetivo,
  IconRedaccion,
  IconCalendario,
  IconVideo,
  IconMetricas,
} from '@/components/ui/ModuleIcons';
import AnalysisError from '@/components/ui/AnalysisError';
import LockedSection, { SkeletonBloque } from '@/components/ui/LockedSection';
import { esPlanDePago } from '@/lib/plans';
import { useAnalysisEvents } from '@/app/hooks/useAnalysisEvents';
import { useAnalysisLoaderGate } from '@/app/hooks/useAnalysisLoaderGate';
import TendenciasSection from './TendenciasSection';
import RecomendacionPlataformaSection, {
  RecomendacionPlataformaViral,
} from './RecomendacionPlataformaSection';
import PlanInversionSection from './PlanInversionSection';
import RendimientoPasadoSection, { type ReporteAdsProcesado } from './RendimientoPasadoSection';
import VentasPlusEstrategiaView, {
  type UnitEconomicsVentasPlus,
  type ScriptWhatsAppVentasPlus,
  type SecuenciaSeguimientoVentasPlus,
} from './VentasPlusEstrategiaView';
import {
  PlatformBadge,
  getPlatformMeta,
  IconYouTube,
  IconInstagram,
  IconTikTok,
  IconFacebook,
  IconWhatsApp,
  IconLinkedIn,
  IconTwitterX,
  IconPinterest,
  IconGoogleAds,
} from './MarketingSocialIcons';

/**
 * Centinela con el que el backend BLANQUEA las estrategias secundarias en plan
 * gratuito (`bloquearEstrategia` en backend/src/services/billing/
 * redactAnalisis.ts): la estrategia sigue viajando con su `tipo`,
 * `nivel_inversion` y `riesgo` reales, pero `nombre` / `tagline` / `descripcion`
 * traen ese texto y todos los numéricos van a 0.
 *
 * Se detecta por el centinela y NO por `puntaje_fit === 0` ni por
 * `presupuesto_mensual_sugerido === 0`: un análisis legítimo puede traer esos
 * ceros y confundirlos convertiría datos reales en un candado.
 */
const CANDADO_PRO_PREFIJO = '\uD83D\uDD12';

function esEstrategiaBloqueada(
  e: { nombre?: string | null } | null | undefined
): boolean {
  return !!e && typeof e.nombre === 'string' && (e.nombre.trim().startsWith(CANDADO_PRO_PREFIJO) || e.nombre.includes('Disponible en Plan Pro'));
}
import ExpertosRecomendados from '@/components/network/ExpertosRecomendados';

import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TipoEstrategia = 'SEGUIDORES' | 'RECONOCIMIENTO' | 'VENTAS' | 'VENTAS_PLUS' | 'PREMIUM' | 'VOLUMEN' | 'ESPECIALIZADO';
type DiaSemanaLabel = 'lunes' | 'martes' | 'miércoles' | 'jueves' | 'viernes' | 'sábado' | 'domingo';

interface ROIEstimado {
  alcance: string;
  leads: string;
  descripcion: string;
}

interface EstrategiaMarketing {
  tipo: TipoEstrategia;
  nombre: string;
  tagline: string;
  descripcion: string;
  por_que?: string;
  precio_sugerido: number;
  precio_rango: { min: number; max: number };
  margen_rango?: string;
  margen_estimado?: number;
  publico_objetivo: string;
  edad_rango: string;
  canales_principales: string[];
  ventaja_competitiva: string;
  nivel_inversion: 'BAJO' | 'MEDIO' | 'ALTO';
  presupuesto_mensual_sugerido: number;
  tiempo_resultados: string;
  riesgo: 'BAJO' | 'MEDIO' | 'ALTO';
  puntaje_fit: number;
  roi?: ROIEstimado;
  recomendada: boolean;
  unit_economics?: UnitEconomicsVentasPlus;
  script_cierre?: ScriptWhatsAppVentasPlus;
  secuencia_seguimiento?: SecuenciaSeguimientoVentasPlus;
  garantia_irresistible?: string;
  order_bump_sugerido?: string;
  kpis_reales?: Array<{ metrica: string; objetivo: string; como_medir: string }>;
  plan_accion_paso_a_paso?: Array<{ semana: number; accion: string; entregable: string }>;
}

interface CopyEstrategia {
  tipo: TipoEstrategia;
  headline: string;
  subtitulo: string;
  propuesta_valor: string;
  cta: string;
  copy_facebook: string;
  copy_instagram: string;
  copy_whatsapp: string;
  hashtags: string[];
  es_mock: boolean;
}

interface VideoScript {
  hook: string;
  valor: string;
  cta: string;
}

interface EscenaProduccion {
  segundo_inicio: number;
  segundo_fin: number;
  guion_visual: string;
  guion_verbal: string;
}

interface PublicacionDiaria {
  hora: string;
  plataforma?: string;
  tipo_contenido?: string;
  idea: string;
  copy?: string;
  hashtags?: string[];
  video_script?: VideoScript | null;
  prompt_visual?: string;
  copy_facebook?: string;
  copy_instagram?: string;
  copy_whatsapp?: string;
  pilar?: 'SEGUIDORES' | 'RECONOCIMIENTO' | 'VENTAS' | 'VENTAS_PLUS';
  hook_3_segundos?: {
    visual: string;
    verbal: string;
  };
  desarrollo_escenas?: EscenaProduccion[];
  cta_cierre?: string;
}

interface DiaCalendario {
  dia: DiaSemanaLabel;
  evento_estacional?: string | null;
  publicaciones: PublicacionDiaria[];
  sugerencia_engagement?: string;
}

/**
 * Detecta el stub que devuelve el backend (`soloPlataforma` en
 * backend/src/services/billing/redactAnalisis.ts) cuando el contenido de la
 * publicación está bloqueado por plan: conserva `plataforma` y vacía hora,
 * tipo_contenido, idea, copy y hashtags.
 *
 * Se centraliza aquí porque lo consumen WeekMap y DayCard, y porque el flag
 * `bloqueaContenido` que llega del plan es global mientras el recorte del
 * backend es por semana: con solo `marketing.calendario_semana_2` bloqueada, la
 * semana 1 llega completa y la 2 en stub, así que el criterio tiene que salir
 * del dato, no del plan.
 */
function esPublicacionStub(pub: PublicacionDiaria | undefined): boolean {
  if (!pub) return false;
  return !pub.hora && !pub.idea && !pub.tipo_contenido && !pub.copy;
}

/** Día que sí tiene cadencia asignada pero cuyo contenido está recortado. */
function diaSinContenido(dia: DiaCalendario): boolean {
  return dia.publicaciones.length > 0 && dia.publicaciones.every(esPublicacionStub);
}

/**
 * Los 5 primeros campos son el formato original; el resto lo añade el generador
 * ampliado (backend/src/services/marketing/calendarioService.ts) y falta en los
 * análisis anteriores, de ahí que sea opcional. Lo consume TendenciasSection.
 */
interface TendenciaSocial {
  plataforma: string;
  tendencia: string;
  score: number;
  hashtags: string[];
  justificacion: string;
  nombre?: string;
  plataformas?: string[];
  ambito?: string;
  fecha?: string | null;
  viralidad?: number;
  engagement?: string;
  views?: string;
  descripcion?: string;
  gancho?: string;
  formato?: string;
  cta?: string;
}

interface SemanaCalendario {
  numero: 1 | 2;
  dias: DiaCalendario[];
}

interface CalendarioSemanalMarketing {
  estrategia_tipo: TipoEstrategia;
  tendencias?: TendenciaSocial[];
  semanas?: SemanaCalendario[];
  sugerencia_visual_campana?: string;
  /**
   * Plataformas fuera de las activas del usuario con tendencias aprovechables.
   * Campo DERIVADO de `tendencias` en el backend (calendarioService.ts →
   * alinearConPlataformasActivas): los análisis anteriores no lo traen.
   */
  recomendacion_plataforma?: RecomendacionPlataformaViral[];
  /**
   * Claves de sección que el plan de la cuenta NO incluye, persistidas junto al
   * resultado por el orquestador. Se declara aquí porque los análisis nuevos la
   * traen dentro de `calendario_data`, además del top level de la respuesta.
   */
  secciones_bloqueadas?: string[];
  fases?: unknown[];
}

interface AnalisisMarketing {
  id: string;
  estado_analisis: 'procesando' | 'completado' | 'error';
  error_mensaje?: string;
  voz_marca?: string;
  estrategias_data: unknown;
  copies_data: unknown;
  calendario_data: unknown;
  /** Export de Google Ads / Meta que el usuario adjuntó al lanzar el análisis. */
  reporte_ads_data?: ReporteAdsProcesado | null;
  /** Inyectada por GET /marketing/:id en los tres caminos de la ruta. */
  secciones_bloqueadas?: string[];
}

interface DayCardProps {
  dia: DiaCalendario;
  diaIndex: number;
  semanaIndex: number;
  isPublished: boolean;
  onTogglePublished: () => void;
  /**
   * El día tiene publicación pero su contenido no viaja en este plan: el backend
   * envía solo `plataforma`. Se pinta una tarjeta de cadencia con candado, no un
   * acordeón vacío ni un día de descanso.
   */
  bloqueaContenido?: boolean;
}

// ─── Helpers visuales ─────────────────────────────────────────────────────────

const TIPO_COLOR: Record<TipoEstrategia, {
  border: string; bg: string; badge: string; text: string;
  accent: string; glow: string; gradientFrom: string; gradientTo: string;
}> = {
  SEGUIDORES: { border: 'border-sky-400/30', bg: 'bg-sky-500/5', badge: 'bg-sky-500/10 text-sky-300 border border-sky-400/20', text: 'text-sky-300', accent: 'bg-sky-400', glow: '', gradientFrom: 'from-sky-500/5', gradientTo: 'to-transparent' },
  RECONOCIMIENTO: { border: 'border-purple-400/30', bg: 'bg-purple-500/5', badge: 'bg-purple-500/10 text-purple-300 border border-purple-400/20', text: 'text-purple-300', accent: 'bg-purple-400', glow: '', gradientFrom: 'from-purple-500/5', gradientTo: 'to-transparent' },
  VENTAS: { border: 'border-emerald-400/30', bg: 'bg-emerald-500/5', badge: 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20', text: 'text-emerald-300', accent: 'bg-emerald-400', glow: '', gradientFrom: 'from-emerald-500/5', gradientTo: 'to-transparent' },
  VENTAS_PLUS: { border: 'border-amber-400/50', bg: 'bg-amber-500/10', badge: 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-400/40 shadow-sm shadow-amber-500/10', text: 'text-amber-300', accent: 'bg-gradient-to-r from-amber-400 to-orange-400', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]', gradientFrom: 'from-amber-500/10', gradientTo: 'to-orange-500/5' },
  PREMIUM: { border: 'border-amber-400/30', bg: 'bg-amber-500/5', badge: 'bg-amber-500/10 text-amber-300 border border-amber-400/20', text: 'text-amber-300', accent: 'bg-amber-400', glow: '', gradientFrom: 'from-amber-500/5', gradientTo: 'to-transparent' },
  VOLUMEN: { border: 'border-blue-400/30', bg: 'bg-blue-500/5', badge: 'bg-blue-500/10 text-blue-300 border border-blue-400/20', text: 'text-blue-300', accent: 'bg-blue-400', glow: '', gradientFrom: 'from-blue-500/5', gradientTo: 'to-transparent' },
  ESPECIALIZADO: { border: 'border-emerald-400/30', bg: 'bg-emerald-500/5', badge: 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20', text: 'text-emerald-300', accent: 'bg-emerald-400', glow: '', gradientFrom: 'from-emerald-500/5', gradientTo: 'to-transparent' },
};

const TIPO_ICON: Record<TipoEstrategia, string> = {
  SEGUIDORES: '👥',
  RECONOCIMIENTO: '👑',
  VENTAS: '🎯',
  VENTAS_PLUS: '🔥',
  PREMIUM: '01',
  VOLUMEN: '02',
  ESPECIALIZADO: '03',
};

type SeccionMarketing = 'estrategia' | 'calendario' | 'inversion' | 'tendencias' | 'rendimiento' | 'todo';

const SECCIONES_TABS: { id: SeccionMarketing; label: string }[] = [
  { id: 'estrategia', label: 'Estrategia' },
  { id: 'calendario', label: 'Calendario y Contenido' },
  { id: 'inversion', label: 'Inversión y Horarios' },
  { id: 'tendencias', label: 'Tendencias' },
  { id: 'rendimiento', label: 'Rendimiento' },
  { id: 'todo', label: 'Vista Completa' },
];

const INVERSION_COLOR: Record<string, string> = {
  BAJO: 'text-emerald-400', MEDIO: 'text-amber-400', ALTO: 'text-rose-400',
};

const DIAS_CORTO: Record<DiaSemanaLabel, string> = {
  lunes: 'Lun', martes: 'Mar', miércoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sábado: 'Sáb', domingo: 'Dom',
};

const DIAS_NOMBRE: Record<DiaSemanaLabel, string> = {
  lunes: 'Lunes', martes: 'Martes', miércoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sábado: 'Sábado', domingo: 'Domingo',
};

const DIAS_ORDEN: DiaSemanaLabel[] = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const DEFAULT_ESTRATEGIA: EstrategiaMarketing = {
  tipo: 'VENTAS_PLUS',
  nombre: 'Estrategia Ventas + (Performance & Cierre de Alto Rendimiento)',
  tagline: 'Embudo de conversión quirúrgico, oferta irresistible y guiones de venta',
  descripcion: 'Estrategia integral orientada a maximizar el retorno de inversión publicitaria mediante un embudo directo de cualificación y guiones probados de cierre.',
  precio_sugerido: 12000,
  precio_rango: { min: 8000, max: 18000 },
  margen_rango: '50% – 65%',
  margen_estimado: 55,
  publico_objetivo: 'Prospectos con alta intención de compra y dolor consciente.',
  edad_rango: '25 – 50 años',
  canales_principales: ['WhatsApp', 'Instagram', 'TikTok', 'Google Ads'],
  ventaja_competitiva: 'Garantía audaz, cualificación inmediata y velocidad de respuesta por WhatsApp.',
  nivel_inversion: 'MEDIO',
  presupuesto_mensual_sugerido: 15000,
  tiempo_resultados: '15 – 30 días',
  riesgo: 'BAJO',
  puntaje_fit: 96,
  recomendada: true,
};

function normalizeEstrategias(raw: unknown, rawCopies?: unknown): EstrategiaMarketing[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item: any, idx: number) => {
      const rawTipo = (item?.tipo || '').toUpperCase();
      let tipo: TipoEstrategia = 'VENTAS_PLUS';
      if (['SEGUIDORES', 'RECONOCIMIENTO', 'VENTAS', 'VENTAS_PLUS', 'PREMIUM', 'VOLUMEN', 'ESPECIALIZADO'].includes(rawTipo)) {
        tipo = rawTipo as TipoEstrategia;
      } else if (rawTipo === 'NICHO') {
        tipo = 'ESPECIALIZADO';
      }
      const minP = typeof item?.precio_rango?.min === 'number' ? item.precio_rango.min : (typeof item?.precio_sugerido === 'number' ? Math.round(item.precio_sugerido * 0.8) : 8000);
      const maxP = typeof item?.precio_rango?.max === 'number' ? item.precio_rango.max : (typeof item?.precio_sugerido === 'number' ? Math.round(item.precio_sugerido * 1.2) : 18000);
      return {
        tipo,
        nombre: item?.nombre || `Estrategia ${tipo}`,
        tagline: item?.tagline || 'Posicionamiento y crecimiento estratégico',
        descripcion: item?.descripcion || 'Enfoque táctico para maximizar conversión y relevancia.',
        por_que: item?.por_que,
        precio_sugerido: typeof item?.precio_sugerido === 'number' ? item.precio_sugerido : Math.round((minP + maxP) / 2),
        precio_rango: { min: minP, max: maxP },
        margen_rango: item?.margen_rango || '40% – 55%',
        margen_estimado: typeof item?.margen_estimado === 'number' ? item.margen_estimado : 48,
        publico_objetivo: item?.publico_objetivo || 'Audiencia interesada en la categoría',
        edad_rango: item?.edad_rango || '25 – 50 años',
        canales_principales: Array.isArray(item?.canales_principales) && item.canales_principales.length > 0 ? item.canales_principales : ['Instagram', 'TikTok', 'WhatsApp'],
        ventaja_competitiva: item?.ventaja_competitiva || 'Diferenciación y experiencia de marca',
        nivel_inversion: item?.nivel_inversion === 'BAJO' || item?.nivel_inversion === 'ALTO' ? item.nivel_inversion : 'MEDIO',
        presupuesto_mensual_sugerido: typeof item?.presupuesto_mensual_sugerido === 'number' ? item.presupuesto_mensual_sugerido : 10000,
        tiempo_resultados: item?.tiempo_resultados || '30 – 60 días',
        riesgo: item?.riesgo === 'ALTO' || item?.riesgo === 'MEDIO' ? item.riesgo : 'BAJO',
        puntaje_fit: typeof item?.puntaje_fit === 'number' ? item.puntaje_fit : 88,
        roi: item?.roi,
        recomendada: item?.recomendada ?? (idx === 0),
        unit_economics: item?.unit_economics,
        script_cierre: item?.script_cierre,
        secuencia_seguimiento: item?.secuencia_seguimiento,
        garantia_irresistible: item?.garantia_irresistible,
        order_bump_sugerido: item?.order_bump_sugerido,
        kpis_reales: item?.kpis_reales,
        plan_accion_paso_a_paso: item?.plan_accion_paso_a_paso,
      };
    });
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, any>;
    const estPrinc = obj.estrategia_principal || 'Posicionamiento Estratégico';
    const bps = Array.isArray(obj.buyer_personas) ? obj.buyer_personas : [];
    const canales = Array.isArray(obj.canales_recomendados)
      ? obj.canales_recomendados.map((c: any) => c.canal).filter(Boolean)
      : Array.isArray(obj.canales) ? obj.canales : ['Instagram', 'TikTok', 'LinkedIn', 'WhatsApp'];
    const pres = obj.presupuesto_sugerido?.mensual || (obj.presupuesto_desglose ? Object.values(obj.presupuesto_desglose as Record<string, number>).reduce((a, b) => a + b, 0) : 15000);
    const bp1 = bps[0];
    const bp2 = bps[1] || bps[0];

    const premium: EstrategiaMarketing = {
      tipo: 'PREMIUM',
      nombre: estPrinc,
      tagline: (rawCopies as any)?.tagline_principal || 'Autoridad y percepción de alto valor',
      descripcion: 'Enfoque de alto valor centrado en reputación, experiencia superior y conversión calificada.',
      precio_sugerido: Math.round(pres * 0.8) || 12000,
      precio_rango: { min: Math.round(pres * 0.6) || 8000, max: Math.round(pres * 1.2) || 18000 },
      margen_rango: '48% – 62%',
      margen_estimado: 55,
      publico_objetivo: bp1 ? `${bp1.nombre} (${bp1.puesto || bp1.edad}): ${bp1.dolor_principal || bp1.motivacion || 'Busca profesionalismo'}` : 'Clientes que priorizan calidad y confianza garantizada',
      edad_rango: bp1?.edad || '28 – 50 años',
      canales_principales: canales.length > 0 ? canales.slice(0, 4) : ['Instagram', 'LinkedIn', 'WhatsApp'],
      ventaja_competitiva: bp1?.motivacion ? `${bp1.motivacion} con respaldo y narrativa de confianza` : 'Propuesta de valor clara, identidad impecable y servicio consultivo',
      nivel_inversion: 'MEDIO',
      presupuesto_mensual_sugerido: pres,
      tiempo_resultados: '30 – 45 días',
      riesgo: 'BAJO',
      puntaje_fit: 95,
      recomendada: true,
    };

    const volumen: EstrategiaMarketing = {
      tipo: 'VOLUMEN',
      nombre: 'Captación y Difusión Dinámica',
      tagline: 'Escala acelerada de audiencia y alcance',
      descripcion: 'Campañas ágiles orientadas a generar awareness masivo y captar prospectos en canales dinámicos.',
      precio_sugerido: Math.round(pres * 0.45) || 7500,
      precio_rango: { min: Math.round(pres * 0.35) || 5000, max: Math.round(pres * 0.65) || 10000 },
      margen_rango: '30% – 42%',
      margen_estimado: 36,
      publico_objetivo: bp2 ? `${bp2.nombre}: ${bp2.dolor_principal || 'Búsqueda de alternativas prácticas'}` : 'Compradores activos en redes sociales en busca de soluciones rápidas',
      edad_rango: bp2?.edad || '20 – 40 años',
      canales_principales: ['TikTok', 'Instagram', 'Google Ads'],
      ventaja_competitiva: 'Velocidad de respuesta, proceso de compra sin fricción y oferta atractiva',
      nivel_inversion: 'BAJO',
      presupuesto_mensual_sugerido: Math.round(pres * 0.6) || 8000,
      tiempo_resultados: '15 – 30 días',
      riesgo: 'MEDIO',
      puntaje_fit: 82,
      recomendada: false,
    };

    const especializ: EstrategiaMarketing = {
      tipo: 'ESPECIALIZADO',
      nombre: 'Especialización y Alto Ticket',
      tagline: 'Fidelización profunda en segmento exclusivo',
      descripcion: 'Posicionamiento selectivo para clientes corporativos o proyectos que demandan máxima personalización.',
      precio_sugerido: Math.round(pres * 1.3) || 20000,
      precio_rango: { min: Math.round(pres * 0.9) || 14000, max: Math.round(pres * 1.8) || 28000 },
      margen_rango: '55% – 70%',
      margen_estimado: 64,
      publico_objetivo: bp2 ? `${bp2.nombre} (${bp2.puesto || 'Directivo'}): ${bp2.motivacion || 'Solución a medida'}` : 'Empresas y directivos que requieren un servicio a medida',
      edad_rango: '32 – 60 años',
      canales_principales: ['LinkedIn', 'Email Marketing', 'WhatsApp'],
      ventaja_competitiva: 'Atención personalizada, confidencialidad y ejecución experta',
      nivel_inversion: 'ALTO',
      presupuesto_mensual_sugerido: Math.round(pres * 1.4) || 22000,
      tiempo_resultados: '45 – 75 días',
      riesgo: 'BAJO',
      puntaje_fit: 90,
      recomendada: false,
    };

    return [premium, volumen, especializ];
  }

  return [DEFAULT_ESTRATEGIA];
}

function normalizeCopies(raw: unknown, rawEstrategias?: EstrategiaMarketing[]): CopyEstrategia[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item: any, idx: number) => {
      const rawTipo = (item?.tipo || '').toUpperCase();
      let tipo: TipoEstrategia = 'VENTAS_PLUS';
      if (['SEGUIDORES', 'RECONOCIMIENTO', 'VENTAS', 'VENTAS_PLUS', 'PREMIUM', 'VOLUMEN', 'ESPECIALIZADO'].includes(rawTipo)) {
        tipo = rawTipo as TipoEstrategia;
      } else if (rawTipo === 'NICHO') {
        tipo = 'ESPECIALIZADO';
      }
      return {
        tipo,
        headline: item?.headline || 'Propuesta de Valor Principal',
        subtitulo: item?.subtitulo || 'Detalle estratégico para tu audiencia',
        propuesta_valor: item?.propuesta_valor || 'Diferenciación, calidad y resultados garantizados.',
        cta: item?.cta || 'Conoce más y agenda tu sesión',
        copy_facebook: item?.copy_facebook || '',
        copy_instagram: item?.copy_instagram || '',
        copy_whatsapp: item?.copy_whatsapp || '',
        hashtags: Array.isArray(item?.hashtags) ? item.hashtags : ['#Marketing', '#Negocios', '#Estrategia'],
        es_mock: Boolean(item?.es_mock),
      };
    });
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, any>;
    const cr = obj.copy_redes || {};
    const tagline = obj.tagline_principal || obj.ad1 || 'Tu marca merece verse y comunicarse como se siente.';
    const sub = obj.taglines_alternativos?.[0] || obj.ad2 || 'De la idea a la consolidación profesional de tu negocio.';
    const ig = cr.instagram || cr.facebook || '';
    const fb = cr.linkedin || cr.facebook || '';
    const wa = cr.tiktok || cr.whatsapp || '';

    const tipos: TipoEstrategia[] = ['PREMIUM', 'VOLUMEN', 'ESPECIALIZADO'];
    return tipos.map((tipo, idx) => ({
      tipo,
      headline: idx === 0 ? tagline : (obj.taglines_alternativos?.[idx - 1] || `${tagline} (${tipo})`),
      subtitulo: sub,
      propuesta_valor: 'Identidad, mensajes clave y narrativa calibrada para convertir.',
      cta: 'Solicita más información y agenda hoy',
      copy_facebook: fb || 'Construye autoridad y credibilidad en cada publicación.',
      copy_instagram: ig || 'Haz que tu propuesta destaque visualmente y conecte de inmediato.',
      copy_whatsapp: wa || 'Hola, me interesa conocer más sobre las opciones y empezar.',
      hashtags: ['#Branding', '#Marketing', '#Negocios', '#PyMEs', '#Estrategia'],
      es_mock: false,
    }));
  }

  return [
    {
      tipo: 'PREMIUM',
      headline: 'Tu marca merece el mejor posicionamiento',
      subtitulo: 'Diferenciación y valor garantizado',
      propuesta_valor: 'Estrategia y contenidos adaptados a tu público ideal.',
      cta: 'Contáctanos hoy',
      copy_facebook: '',
      copy_instagram: '',
      copy_whatsapp: '',
      hashtags: ['#Marketing', '#Estrategia'],
      es_mock: false,
    },
  ];
}

function normalizeCalendario(raw: unknown): CalendarioSemanalMarketing {
  const base: CalendarioSemanalMarketing = {
    estrategia_tipo: 'PREMIUM',
    semanas: [],
    tendencias: [
      { plataforma: 'Instagram', tendencia: 'Reels educativos breves con hook en primeros 3s', score: 92, hashtags: ['#Tips', '#Negocio', '#Reels'], justificacion: 'Gran alcance orgánico para formatos de valor directo.' },
      { plataforma: 'TikTok', tendencia: 'Detrás de escena / proceso paso a paso', score: 88, hashtags: ['#BehindTheScenes', '#Emprendimiento'], justificacion: 'Humaniza la marca y crea confianza rápida.' },
      { plataforma: 'LinkedIn', tendencia: 'Reflexiones y aprendizajes de la industria', score: 84, hashtags: ['#Liderazgo', '#B2B'], justificacion: 'Posicionamiento de autoridad ante directivos y decisores.' },
    ],
    sugerencia_visual_campana: 'Composición sobria, fondos oscuros contrastados con acentos de color de marca y tipografías limpias y legibles.',
    recomendacion_plataforma: [
      { plataforma: 'Instagram', motivo: 'Canal prioritario para vitrina visual y conversión de audiencia interesada.' },
      { plataforma: 'TikTok', motivo: 'Excelente motor de descubrimiento para nuevos clientes mediante video corto.' },
      { plataforma: 'LinkedIn', motivo: 'Canal de autoridad institucional para generar alianzas y captar clientes B2B.' },
    ],
  };

  if (!raw || typeof raw !== 'object') {
    base.semanas = [1, 2].map((num) => ({
      numero: num as 1 | 2,
      dias: DIAS_ORDEN.map((dia, idx) => ({
        dia,
        publicaciones: idx < 5 ? [{
          hora: idx % 2 === 0 ? '10:00' : '17:00',
          plataforma: idx % 3 === 0 ? 'Instagram' : idx % 3 === 1 ? 'TikTok' : 'LinkedIn',
          tipo_contenido: idx % 2 === 0 ? 'Reel / Video' : 'Carrusel educativo',
          idea: `Publicación ${dia}: contenido de valor y diferenciación`,
          copy: 'Aprende cómo optimizar tus resultados y fortalecer tu posicionamiento de marca.',
          hashtags: ['#Marketing', '#Negocios'],
        }] : [],
        sugerencia_engagement: 'Responder comentarios en los primeros 45 minutos tras publicar.',
      })),
    }));
    return base;
  }

  const obj = raw as Record<string, any>;
  base.estrategia_tipo = ((obj.estrategia_tipo || '').toUpperCase() as TipoEstrategia) || 'PREMIUM';
  if (obj.sugerencia_visual_campana) base.sugerencia_visual_campana = obj.sugerencia_visual_campana;
  if (Array.isArray(obj.tendencias) && obj.tendencias.length > 0) base.tendencias = obj.tendencias;
  if (Array.isArray(obj.recomendacion_plataforma) && obj.recomendacion_plataforma.length > 0) base.recomendacion_plataforma = obj.recomendacion_plataforma;
  if (Array.isArray(obj.secciones_bloqueadas)) base.secciones_bloqueadas = obj.secciones_bloqueadas;

  if (Array.isArray(obj.semanas) && obj.semanas.length > 0) {
    base.semanas = obj.semanas.map((s: any) => ({
      numero: (s.numero === 2 ? 2 : 1) as 1 | 2,
      dias: Array.isArray(s.dias)
        ? s.dias.map((d: any) => ({
            dia: ((d.dia || 'lunes').toLowerCase().trim()) as DiaSemanaLabel,
            evento_estacional: d.evento_estacional,
            sugerencia_engagement: d.sugerencia_engagement,
            publicaciones: Array.isArray(d.publicaciones) ? d.publicaciones : [],
          }))
        : [],
    }));
    return base;
  }

  const sem1 = Array.isArray(obj.semana_1) ? obj.semana_1 : Array.isArray(obj.semana1) ? obj.semana1 : null;
  const sem2 = Array.isArray(obj.semana_2) ? obj.semana_2 : Array.isArray(obj.semana2) ? obj.semana2 : null;

  const mapListaADias = (lista: any[] | null): DiaCalendario[] => {
    const mapa = new Map<string, PublicacionDiaria[]>();
    (lista || []).forEach((item: any) => {
      const dKey = (item.dia || 'lunes').toLowerCase().trim();
      const pub: PublicacionDiaria = {
        hora: item.hora || '10:30',
        plataforma: item.plataforma || 'Instagram',
        tipo_contenido: item.tipo || item.tipo_contenido || 'Post',
        idea: item.tema || item.idea || 'Contenido estratégico',
        copy: item.copy || '',
        hashtags: Array.isArray(item.hashtags) ? item.hashtags : ['#Estrategia', '#Negocios'],
      };
      if (!mapa.has(dKey)) mapa.set(dKey, []);
      mapa.get(dKey)!.push(pub);
    });

    return DIAS_ORDEN.map((dia) => ({
      dia,
      publicaciones: mapa.get(dia) || [],
      sugerencia_engagement: mapa.has(dia) ? 'Interactuar con la comunidad y responder mensajes directos.' : undefined,
    }));
  };

  base.semanas = [
    { numero: 1, dias: mapListaADias(sem1) },
    { numero: 2, dias: mapListaADias(sem2) },
  ];

  return base;
}

const PLATFORM_ICON: Record<string, string> = {
  Instagram: 'IG', TikTok: 'TT', Facebook: 'FB', YouTube: 'YT',
  LinkedIn: 'LI', Twitter: 'TW', WhatsApp: 'WA', Pinterest: 'PT',
  Threads: 'TH', Telegram: 'TG', Snapchat: 'SC', Reddit: 'RD',
};

const PLATFORM_BADGE: Record<string, string> = {
  Instagram: 'IG', TikTok: 'TT', Facebook: 'FB', YouTube: 'YT',
  LinkedIn: 'LI', Twitter: 'TW', WhatsApp: 'WA', Pinterest: 'PT',
  Threads: 'TH', Telegram: 'TG', Snapchat: 'SC', Reddit: 'RD',
};

const CONTENT_TYPE_BADGE: Record<string, string> = {
  Reel: 'bg-purple-600/15 text-purple-300 border border-purple-500/20',
  Carrusel: 'bg-blue-600/15 text-blue-300 border border-blue-500/20',
  Imagen: 'bg-green-600/15 text-green-300 border border-green-500/20',
  Historia: 'bg-orange-500/15 text-orange-300 border border-orange-500/20',
  Video: 'bg-red-600/15 text-red-300 border border-red-500/20',
  Live: 'bg-rose-600/15 text-rose-300 border border-rose-500/20',
  Texto: 'bg-zinc-600/15 text-zinc-300 border border-zinc-500/20',
};

const CONTENT_TYPE_EMOJI: Record<string, string> = {
  Reel: '',
  Carrusel: '',
  Imagen: '',
  Historia: '',
  Video: '',
  Live: '',
  Texto: '',
};

/**
 * Explica el formato de cada publicación para que el concepto no sea una sola
 * frase suelta. Es texto editorial fijo, no sale del análisis: describe cómo se
 * comporta el formato en cualquier producto, así que no hay nada que generar ni
 * que recortar por plan.
 */
const FORMATO_EXPLICACION: Record<string, string> = {
  Reel: 'Video vertical de 15 a 30 segundos. Es el formato con más alcance orgánico porque el algoritmo lo reparte fuera de tus seguidores: sirve para que te descubran. El gancho tiene que estar en los primeros 3 segundos o se pierde la retención.',
  Video: 'Video vertical corto. Prioriza retención sobre producción: mejor un plano bien iluminado con un mensaje claro que una edición compleja sin gancho inicial.',
  Carrusel: 'Varias láminas deslizables. Cada swipe suma tiempo de permanencia y es el formato que más se guarda, así que funciona para explicar, comparar o enseñar un paso a paso.',
  Imagen: 'Una sola imagen con copy. Es lo más rápido de producir y lo que mejor comunica un mensaje único: precio, oferta o propuesta de valor sin distracciones.',
  Historia: 'Contenido efímero de 24 horas. Llega a quien ya te sigue y construye cercanía y prueba social: encuestas, cajas de preguntas y detrás de cámaras.',
  Live: 'Transmisión en vivo. Notifica a tus seguidores y genera confianza por interacción directa: resuelve dudas y cierra ventas en tiempo real.',
  Texto: 'Publicación de solo texto. Funciona cuando el mensaje es una idea, una opinión o una historia breve: se lee completo y provoca comentarios.',
};

const SCORE_COLOR = (score: number) =>
  score >= 80 ? 'text-green-600 bg-green-500/10' :
    score >= 60 ? 'text-yellow-600 bg-yellow-500/10' :
      'text-red-500 bg-red-500/10';

const TIPO_LEFT_BORDER: Record<TipoEstrategia, string> = {
  SEGUIDORES: 'border-l-sky-400',
  RECONOCIMIENTO: 'border-l-purple-400',
  VENTAS: 'border-l-emerald-400',
  VENTAS_PLUS: 'border-l-amber-400',
  PREMIUM: 'border-l-yellow-400',
  VOLUMEN: 'border-l-blue-400',
  ESPECIALIZADO: 'border-l-green-400',
};

const SKELETON_STEPS = [
  { icon: <IconObjetivo className="w-7 h-7" />, label: 'Analizando posicionamiento de marca...' },
  { icon: <IconRedaccion className="w-7 h-7" />, label: 'Redactando copies con tu voz de marca...' },
  { icon: <IconCalendario className="w-7 h-7" />, label: 'Construyendo calendario de 14 días...' },
  { icon: <IconVideo className="w-7 h-7" />, label: 'Definiendo el concepto y el formato de cada día...' },
  { icon: <IconMetricas className="w-7 h-7" />, label: 'Calculando ROI y métricas estimadas...' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPostCopy(pub: PublicacionDiaria): string {
  if (pub.copy) return pub.copy;
  if (pub.copy_facebook) return pub.copy_facebook;
  return '';
}

function buildWeekText(dias: DiaCalendario[]): string {
  return dias.flatMap((dia) =>
    dia.publicaciones.map((pub) =>
      `${dia.dia.toUpperCase()} ${pub.hora}${pub.plataforma ? ` — ${pub.plataforma}` : ''}\n${pub.idea}\n\n${getPostCopy(pub)}${pub.hashtags?.length ? '\n' + pub.hashtags.join(' ') : ''}`
    )
  ).join('\n\n---\n\n');
}

// Pasos en el formato de AnalysisLoader (SKELETON_STEPS se mantiene por
// compatibilidad con el resto del archivo).
const MARKETING_LOADER_STEPS = SKELETON_STEPS.map((s) => ({ label: s.label, icon: s.icon }));

// ─── DayCard ──────────────────────────────────────────────────────────────────

// ─── Preview social del día ───────────────────────────────────────────────────

type DayPlatformKind = 'feed' | 'instagram' | 'chat' | 'video';

interface DayPlatformMeta {
  label: string;
  color: string;
  bg: string;
  headerBg: string;
  username: string;
  handle: string;
  logo: React.ReactNode;
  avatar: React.ReactNode;
  kind: DayPlatformKind;
}

/**
 * Cada plataforma se pinta con su propio chrome. `kind` decide la anatomía del
 * mockup: feed (imagen + reacciones), instagram (imagen + acciones + likes),
 * chat (burbuja saliente) o video (frame vertical).
 */
const DAY_PLATFORM_META: Record<string, DayPlatformMeta> = {
  Facebook: { label: 'Facebook', color: '#1877F2', bg: '#18191A', headerBg: '#242526', username: 'Tu Página', handle: 'Anuncio patrocinado', logo: <IconFacebook className="w-3.5 h-3.5 text-white" />, avatar: <IconFacebook className="w-5 h-5 text-white" />, kind: 'feed' },
  Instagram: { label: 'Instagram', color: '#E1306C', bg: '#000000', headerBg: '#121212', username: 'tuperfil', handle: 'Publicidad', logo: <IconInstagram className="w-3.5 h-3.5 text-white" />, avatar: <IconInstagram className="w-5 h-5 text-white" />, kind: 'instagram' },
  WhatsApp: { label: 'WhatsApp', color: '#25D366', bg: '#0B141A', headerBg: '#1F2C34', username: 'Tu Negocio', handle: 'Business · En línea', logo: <IconWhatsApp className="w-3.5 h-3.5 text-white" />, avatar: <IconWhatsApp className="w-5 h-5 text-white" />, kind: 'chat' },
  TikTok: { label: 'TikTok', color: '#00F2FE', bg: '#010101', headerBg: '#121212', username: '@tunegocio', handle: 'Para ti · Publicidad', logo: <IconTikTok className="w-3.5 h-3.5 text-white" />, avatar: <IconTikTok className="w-5 h-5 text-white" />, kind: 'video' },
  YouTube: { label: 'YouTube', color: '#FF0000', bg: '#0F0F0F', headerBg: '#212121', username: 'Tu Canal', handle: 'Shorts · Publicidad', logo: <IconYouTube className="w-3.5 h-3.5 text-white" />, avatar: <IconYouTube className="w-5 h-5 text-white" />, kind: 'video' },
  LinkedIn: { label: 'LinkedIn', color: '#0A66C2', bg: '#1B1F23', headerBg: '#283339', username: 'Tu Empresa', handle: 'Promocionado', logo: <IconLinkedIn className="w-3.5 h-3.5 text-white" />, avatar: <IconLinkedIn className="w-5 h-5 text-white" />, kind: 'feed' },
  Twitter: { label: 'X (Twitter)', color: '#E7E9EA', bg: '#000000', headerBg: '#16181C', username: '@tunegocio', handle: 'Promocionado', logo: <IconTwitterX className="w-3.5 h-3.5 text-white" />, avatar: <IconTwitterX className="w-5 h-5 text-white" />, kind: 'feed' },
};

const DAY_PLATFORM_FALLBACK: DayPlatformMeta = {
  label: 'Redes', color: '#8B5CF6', bg: '#0b1421', headerBg: '#141c2b',
  username: 'Tu Negocio', handle: 'Publicación', logo: <span className="text-xs">📢</span>, avatar: <span className="text-sm">📢</span>, kind: 'feed',
};

/** Campo del copy global que le corresponde a cada plataforma del calendario. */
const DAY_COPY_FIELD: Record<string, 'copy_facebook' | 'copy_instagram' | 'copy_whatsapp'> = {
  Facebook: 'copy_facebook', Instagram: 'copy_instagram', WhatsApp: 'copy_whatsapp',
  TikTok: 'copy_instagram', YouTube: 'copy_facebook', LinkedIn: 'copy_facebook', Twitter: 'copy_facebook',
};

/**
 * Copy del preview: primero el que la IA escribió para esa publicación concreta,
 * luego el legacy por plataforma del propio post y por último el copy global de
 * la estrategia (payloads antiguos que no traen `copy` por día).
 */
function getPlatformCopy(pub: PublicacionDiaria | undefined, copyGlobal?: CopyEstrategia): string {
  if (!pub) return '';
  if (pub.copy) return pub.copy;
  const field = pub.plataforma ? DAY_COPY_FIELD[pub.plataforma] : undefined;
  if (field && pub[field]) return pub[field] as string;
  if (field && copyGlobal?.[field]) return copyGlobal[field];
  return '';
}

function DayPostMockup({ platform, copy, hashtags, copied, onCopy }: {
  platform: string;
  copy: string;
  hashtags: string[];
  copied: boolean;
  onCopy: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pm = DAY_PLATFORM_META[platform] ?? DAY_PLATFORM_FALLBACK;
  const needsExpand = copy.length > 220;
  const visibleCopy = needsExpand && !expanded ? copy.slice(0, 220) : copy;
  const tags = hashtags.slice(0, 5);
  const extraTags = Math.max(hashtags.length - tags.length, 0);
  const isChat = pm.kind === 'chat';

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pm.color }} />
        <p className="text-[11px] font-black text-white/60 uppercase tracking-widest flex items-center gap-1.5">
          <span>📱</span>
          <span>Preview en {pm.label}</span>
        </p>
      </div>

      <div className="mx-auto max-w-[380px]" style={{ filter: `drop-shadow(0 14px 34px ${pm.color}25)` }}>
        <div className="rounded-[26px] overflow-hidden border border-white/10" style={{ backgroundColor: pm.bg }}>

          {/* Barra de la app */}
          <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: pm.headerBg }}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-black text-white flex-shrink-0" style={{ backgroundColor: pm.color }} aria-hidden="true">
                {pm.logo}
              </div>
              <span className="text-[11px] font-bold text-white/70 truncate">{pm.label}</span>
            </div>
            <div className="flex gap-1" aria-hidden="true">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
            </div>
          </div>

          {/* Cabecera del post */}
          <div className="px-4 pt-3 pb-2 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-xl overflow-hidden shadow-inner"
              style={{ background: `linear-gradient(135deg, ${pm.color}80, ${pm.color}30)`, border: `2px solid ${pm.color}60` }}
              aria-hidden="true"
            >
              {pm.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-white truncate flex items-center gap-1">
                <span>{pm.username}</span>
                <span className="text-[10px] text-blue-400 select-none">✓</span>
              </p>
              <p className="text-[11px] text-white/40 truncate">{pm.handle}</p>
            </div>
            {!isChat && (
              <span className="text-[11px] font-bold px-3 py-1 rounded-lg border text-white/60 border-white/20 hover:border-white/40 flex-shrink-0 cursor-pointer transition-colors">
                Seguir
              </span>
            )}
          </div>

          {/* Media */}
          {(pm.kind === 'feed' || pm.kind === 'instagram') && (
            <div
              className="mx-3 mb-3 rounded-xl overflow-hidden flex items-center justify-center flex-col gap-2 relative group"
              style={{ height: '160px', background: `linear-gradient(135deg, ${pm.color}25, #0d0d1a 50%, ${pm.color}15)` }}
            >
              <span className="text-3xl select-none">🖼️</span>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Imagen de Campaña</p>
            </div>
          )}

          {pm.kind === 'video' && (
            <div
              className="mx-3 mb-3 rounded-xl overflow-hidden relative flex items-center justify-center flex-col gap-2"
              style={{ height: '220px', background: `linear-gradient(160deg, ${pm.color}30, #0b0b14 55%, ${pm.color}15)` }}
            >
              <div className="w-12 h-12 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-xl shadow-lg cursor-pointer">
                ▶️
              </div>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                {platform === 'YouTube' ? 'YouTube Shorts' : 'Video Vertical'}
              </p>

              {/* Action buttons lateral */}
              <div className="absolute right-3 bottom-3 flex flex-col gap-2.5 text-white/80 text-[10px] font-bold text-center" aria-hidden="true">
                {platform === 'YouTube' ? (
                  <>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm">👍</span>
                      <span className="text-[9px]">3.4k</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm">👎</span>
                      <span className="text-[9px]">No</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm">💬</span>
                      <span className="text-[9px]">182</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm">↗️</span>
                      <span className="text-[9px]">Share</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm">❤️</span>
                      <span className="text-[9px]">12.8k</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm">💬</span>
                      <span className="text-[9px]">342</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm">🔖</span>
                      <span className="text-[9px]">Guardar</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm">↗️</span>
                      <span className="text-[9px]">Share</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {pm.kind === 'instagram' && (
            <div className="flex items-center gap-3 px-4 mb-2 text-white/90 text-sm select-none" aria-hidden="true">
              <span className="cursor-pointer hover:scale-110 transition-transform">❤️</span>
              <span className="cursor-pointer hover:scale-110 transition-transform">💬</span>
              <span className="cursor-pointer hover:scale-110 transition-transform">✈️</span>
              <span className="ml-auto cursor-pointer hover:scale-110 transition-transform">🔖</span>
            </div>
          )}

          {isChat ? (
            <div className="px-3 pb-4 pt-1 space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-tr-sm px-4 py-3 shadow-md" style={{ backgroundColor: '#005C4B' }}>
                  <p className="text-[13.5px] text-white leading-relaxed whitespace-pre-wrap break-words">
                    {visibleCopy}{needsExpand && !expanded && '…'}
                  </p>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tags.map((h) => <span key={h} className="text-[11px] font-semibold" style={{ color: '#53bdeb' }}>{h.startsWith('#') ? h : `#${h}`}</span>)}
                    </div>
                  )}
                  <div className="flex justify-end items-center gap-1.5 mt-1.5 select-none">
                    <span className="text-[10px] text-white/40">12:30 p.m.</span>
                    <span className="text-[11px] text-cyan-300 font-bold" title="Entregado y leído">✓✓</span>
                  </div>
                </div>
              </div>
              {needsExpand && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-[11px] font-bold px-3 py-1 rounded-lg hover:bg-white/5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    style={{ color: pm.color }}
                  >
                    {expanded ? 'Ver menos' : 'Ver más'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 pb-4">
              <p className="text-[13.5px] text-white leading-relaxed whitespace-pre-wrap break-words">
                <span className="font-bold">{pm.username} </span>
                {visibleCopy}
                {needsExpand && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="font-bold ml-0.5 focus:outline-none focus-visible:underline"
                    style={{ color: pm.color }}
                  >
                    {expanded ? ' menos' : '… más'}
                  </button>
                )}
              </p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((h) => <span key={h} className="text-[12px] font-semibold" style={{ color: pm.color }}>{h.startsWith('#') ? h : `#${h}`}</span>)}
                  {extraTags > 0 && <span className="text-[12px] text-white/30">+{extraTags}</span>}
                </div>
              )}
              {pm.kind === 'instagram' && (
                <p className="text-[12px] font-bold text-white mt-2 flex items-center gap-1.5 select-none">
                  <span>❤️</span>
                  <span>247 Me gusta</span>
                </p>
              )}
              {pm.kind === 'feed' && (
                <>
                  <div className="flex items-center justify-between py-2 mt-3 border-t border-white/8">
                    <div className="flex items-center gap-1.5 text-xs text-white/60 select-none">
                      <span>👍 ❤️ 😮</span>
                      <span className="text-[11px] text-white/50 ml-1">247</span>
                    </div>
                    <span className="text-[11px] text-white/30">18 comentarios · 4 compartidos</span>
                  </div>
                  <div className="flex items-center justify-around pt-2 border-t border-white/5 text-xs select-none" aria-hidden="true">
                    {['👍 Me gusta', '💬 Comentar', '↗️ Compartir'].map((a) => (
                      <span key={a} className="font-semibold text-white/50 hover:text-white px-2 py-1.5 flex-1 text-center cursor-pointer transition-colors">{a}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onCopy}
        className="mt-3 w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={copied
          ? { backgroundColor: pm.color + '25', borderColor: pm.color + '60', color: '#fff' }
          : { backgroundColor: 'transparent', borderColor: pm.color + '40', color: pm.color }}
      >
        <span>{copied ? '✅' : '📋'}</span>
        <span>{copied ? '¡Copiado al portapapeles!' : `Copiar copy de ${pm.label}`}</span>
      </button>
    </div>
  );
}

function DayCard({ dia, diaIndex, semanaIndex, isPublished, onTogglePublished, bloqueaContenido = false, copyGlobal }: DayCardProps & { copyGlobal?: CopyEstrategia }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const [activePub, setActivePub] = useState(0);

  const isRestDay = dia.publicaciones.length === 0;
  // Un día puede traer varias publicaciones (una por plataforma). El índice se
  // acota para no quedar fuera de rango si el calendario cambia de tamaño.
  const pubs = (dia.publicaciones ?? []) as PublicacionDiaria[];
  const activeIndex = pubs.length > 0 ? Math.min(activePub, pubs.length - 1) : 0;
  const pub = pubs[activeIndex] as PublicacionDiaria | undefined;
  // `bloqueaContenido` viene del plan (global). El stub del backend es por
  // semana, así que se combinan: con solo la semana 2 bloqueada, la semana 1
  // debe seguir siendo expandible.
  const sinContenido = bloqueaContenido || diaSinContenido(dia);

  const platformMeta = pub?.plataforma ? getPlatformMeta(pub.plataforma) : null;
  const contentBadgeClass = pub?.tipo_contenido ? (CONTENT_TYPE_BADGE[pub.tipo_contenido] ?? 'bg-white/10 text-white font-medium') : null;
  const contentEmoji = pub?.tipo_contenido ? (CONTENT_TYPE_EMOJI[pub.tipo_contenido] ?? '📌') : null;
  const formatoExplicacion = pub?.tipo_contenido ? (FORMATO_EXPLICACION[pub.tipo_contenido] ?? null) : null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  if (isRestDay) {
    return (
      <div id={`daycard-${semanaIndex}-${diaIndex}`} className="bg-white/[0.02] rounded-xl border border-dashed border-white/[0.08] mb-2.5 p-4 transition-all hover:border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-white/40 font-mono select-none">
            —
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-white">{DIAS_NOMBRE[dia.dia]}</span>
              {dia.evento_estacional && (
                <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 border border-amber-400/20 px-2 py-0.5 rounded">
                  {dia.evento_estacional}
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">Día de descanso · Sin publicaciones programadas</p>
          </div>
          <span className="ml-auto text-[11px] font-mono text-white/40 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full">
            Descanso
          </span>
        </div>
        {dia.sugerencia_engagement && (
          <div className="flex items-start gap-2.5 mt-3 bg-white/[0.02] rounded-lg p-3 border border-white/[0.05]">
            <p className="text-xs text-white/60 leading-relaxed">{dia.sugerencia_engagement}</p>
          </div>
        )}
      </div>
    );
  }

  if (sinContenido) {
    return (
      <div
        id={`daycard-${semanaIndex}-${diaIndex}`}
        className="bg-[#0A0F17] rounded-xl border border-white/[0.07] mb-2.5 p-4 flex items-center gap-4 flex-wrap"
      >
        {pub?.plataforma && (
          <PlatformBadge plataforma={pub.plataforma} size="sm" />
        )}
        <div className="flex-1 min-w-[8rem]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold uppercase tracking-wider text-xs text-white">{DIAS_NOMBRE[dia.dia]}</span>
            {dia.evento_estacional && (
              <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 border border-amber-400/20 px-2 py-0.5 rounded uppercase tracking-wider">
                {dia.evento_estacional}
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-0.5">
            Publicación programada — contenido completo disponible en Plan Pro
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-400/20 text-amber-300 uppercase tracking-widest">
            Plan Pro
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`daycard-${semanaIndex}-${diaIndex}`}
      data-state={isOpen ? 'open' : 'closed'}
      className={`bg-[#0A0F17] rounded-xl border mb-2.5 overflow-hidden transition-all duration-200 ${isOpen ? 'border-white/30 bg-[#0D131F]' : 'border-white/[0.07] hover:border-white/20'}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={`daycard-body-${semanaIndex}-${diaIndex}`}
        className="w-full text-left p-4 sm:p-4.5 flex items-center gap-3.5 flex-wrap relative z-10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        onClick={() => setIsOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((v) => !v);
          }
        }}
      >
        {platformMeta ? (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all border ${isOpen ? `${platformMeta.bgClass} ${platformMeta.borderClass} ${platformMeta.textClass}` : 'bg-white/5 border-white/10 text-white/60'}`}>
            <platformMeta.icon className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-xs bg-white/5 border border-white/10 text-white/50">
            P
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold uppercase tracking-wider text-xs transition-colors ${isOpen ? 'text-white' : 'text-white/90'}`}>{DIAS_NOMBRE[dia.dia]}</span>
            {pub?.hora && (
              <span className="text-[10px] bg-black/40 text-white/60 font-medium px-2 py-0.5 rounded font-mono border border-white/5">
                {pub.hora}
              </span>
            )}
            {dia.evento_estacional && (
              <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 border border-amber-400/20 px-2 py-0.5 rounded uppercase tracking-wider">
                {dia.evento_estacional}
              </span>
            )}
          </div>
          {!isOpen && pub?.idea && (
            <p className="text-xs text-white/60 mt-0.5 line-clamp-1 font-normal">
              {pub.idea}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {pub?.pilar && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${
              pub.pilar === 'SEGUIDORES' ? 'bg-sky-500/15 text-sky-300 border-sky-500/25' :
              pub.pilar === 'RECONOCIMIENTO' ? 'bg-purple-500/15 text-purple-300 border-purple-500/25' :
              pub.pilar === 'VENTAS' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' :
              'bg-amber-500/20 text-amber-300 border-amber-400/30 font-semibold'
            }`}>
              {pub.pilar === 'VENTAS_PLUS' ? 'Ventas +' : pub.pilar}
            </span>
          )}
          {pub?.plataforma && (
            <PlatformBadge plataforma={pub.plataforma} size="xs" />
          )}
          {pubs.length > 1 && (
            <span className="text-[10px] font-mono bg-white/5 border border-white/10 text-white/60 px-2 py-0.5 rounded uppercase">
              +{pubs.length - 1}
            </span>
          )}
          {pub?.tipo_contenido && contentBadgeClass && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${contentBadgeClass}`}>
              {pub.tipo_contenido}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePublished(); }}
            className={`text-[10px] font-mono px-2.5 py-1 rounded-lg transition-all uppercase tracking-wider ${isPublished ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' : 'bg-white/[0.04] border border-white/10 text-white/60 hover:text-white hover:border-white/20'}`}
          >
            {isPublished ? '✓ Publicado' : 'Marcar'}
          </button>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : 'text-white/30'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      <div id={`daycard-body-${semanaIndex}-${diaIndex}`} className={`overflow-hidden transition-all duration-300 ease-in-out relative z-10 ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">

          {pubs.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={`Plataformas del ${DIAS_NOMBRE[dia.dia]}`}>
              {pubs.map((p, i) => {
                const meta = getPlatformMeta(p.plataforma);
                const active = i === activeIndex;
                const IconComp = meta.icon;
                return (
                  <button
                    key={`${p.plataforma ?? 'post'}-${i}`}
                    type="button"
                    onClick={() => setActivePub(i)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${active ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                    <span>{meta.name}</span>
                    {p.hora && <span className="font-mono text-[10px] text-white/50 bg-black/30 px-1.5 py-0.5 rounded">{p.hora}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {pub && (pub.idea || pub.tipo_contenido || pub.plataforma || pub.hora) && (
            <div className="bg-black/20 rounded-xl p-4 sm:p-5 border border-white/[0.06] space-y-3.5">
              <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                Concepto y Enfoque del Contenido
              </p>

              {pub.idea && (
                <p className="text-xs sm:text-sm text-white/90 leading-relaxed break-words font-normal">{pub.idea}</p>
              )}

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {pub.tipo_contenido && (
                  <div className="min-w-0 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 flex items-center gap-2.5">
                    <div className="min-w-0">
                      <dt className="text-[9px] font-mono text-white/40 uppercase tracking-wider">Formato</dt>
                      <dd className="text-xs font-medium text-white break-words">{pub.tipo_contenido}</dd>
                    </div>
                  </div>
                )}
                {pub.plataforma && (
                  <div className="min-w-0 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 flex items-center gap-2.5">
                    <PlatformBadge plataforma={pub.plataforma} size="xs" showName={false} />
                    <div className="min-w-0">
                      <dt className="text-[9px] font-mono text-white/40 uppercase tracking-wider">Plataforma</dt>
                      <dd className="text-xs font-medium text-white break-words">{pub.plataforma}</dd>
                    </div>
                  </div>
                )}
                {pub.hora && (
                  <div className="min-w-0 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 flex items-center gap-2.5">
                    <div className="min-w-0">
                      <dt className="text-[9px] font-mono text-white/40 uppercase tracking-wider">Horario sugerido</dt>
                      <dd className="text-xs font-medium text-white font-mono">{pub.hora}</dd>
                    </div>
                  </div>
                )}
              </dl>

              {formatoExplicacion && (
                <div className="text-xs text-white/60 leading-relaxed border-t border-white/5 pt-2.5">
                  <p>
                    <span className="text-white/80 font-medium">Criterio editorial: </span>
                    {formatoExplicacion}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Guión Técnico de Producción (Agencia Growth) ── */}
          {pub && (pub.hook_3_segundos || (pub.desarrollo_escenas && pub.desarrollo_escenas.length > 0) || pub.cta_cierre) && (
            <div className="rounded-xl border border-amber-400/25 bg-gradient-to-b from-amber-500/5 to-transparent p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎬</span>
                  <span className="text-xs font-semibold text-amber-300 tracking-tight">
                    Guión Técnico de Grabación / Producción
                  </span>
                  {pub.pilar && (
                    <span className="text-[10px] font-mono text-white/60 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                      Pilar: {pub.pilar === 'VENTAS_PLUS' ? 'Ventas +' : pub.pilar}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-amber-400/80 uppercase tracking-wider font-semibold">
                  Estructura 0-30 Segundos
                </span>
              </div>

              {/* Gancho Inicial 0-3s */}
              {pub.hook_3_segundos && (
                <div className="bg-black/40 rounded-xl p-3.5 border border-white/[0.08] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                      <span>⚡</span> Gancho de Retención (Primeros 3s)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`[Visual]: ${pub.hook_3_segundos?.visual}\n[Locución]: "${pub.hook_3_segundos?.verbal}"`, `hook-${semanaIndex}-${diaIndex}-${activeIndex}`)}
                      className="text-[10px] font-mono text-amber-300 hover:text-amber-200 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-400/20 transition-colors"
                    >
                      {copied === `hook-${semanaIndex}-${diaIndex}-${activeIndex}` ? '✓ Copiado' : 'Copiar Gancho'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04]">
                      <span className="text-[9px] font-mono text-white/40 uppercase block mb-1">👁️ Acción Visual</span>
                      <p className="text-xs text-white/80 leading-relaxed font-normal">{pub.hook_3_segundos.visual}</p>
                    </div>
                    <div className="bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04]">
                      <span className="text-[9px] font-mono text-white/40 uppercase block mb-1">🗣️ Locución / Texto en Pantalla</span>
                      <p className="text-xs text-amber-200/90 leading-relaxed font-medium">"{pub.hook_3_segundos.verbal}"</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Desarrollo de escenas */}
              {pub.desarrollo_escenas && pub.desarrollo_escenas.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block">
                    Secuencia Escena por Escena (Storyboard)
                  </span>
                  <div className="space-y-2">
                    {pub.desarrollo_escenas.map((esc, escIdx) => (
                      <div key={escIdx} className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.06] flex flex-col sm:flex-row gap-3">
                        <div className="sm:w-24 flex-shrink-0 flex sm:flex-col items-center sm:items-start justify-between sm:justify-center gap-1 border-b sm:border-b-0 sm:border-r border-white/5 pb-2 sm:pb-0 sm:pr-3">
                          <span className="text-[10px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded">
                            Escena {escIdx + 1}
                          </span>
                          <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                            {esc.segundo_inicio}s - {esc.segundo_fin}s
                          </span>
                        </div>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                          <div>
                            <span className="text-[9px] font-mono text-white/40 uppercase block mb-0.5">Visual</span>
                            <p className="text-xs text-white/80 leading-relaxed font-normal">{esc.guion_visual}</p>
                          </div>
                          <div>
                            <span className="text-[9px] font-mono text-white/40 uppercase block mb-0.5">Locución</span>
                            <p className="text-xs text-white/95 leading-relaxed font-medium">"{esc.guion_verbal}"</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA Exacto */}
              {pub.cta_cierre && (
                <div className="bg-black/30 rounded-xl p-3 border border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider block mb-0.5">
                      Llamado a la Acción Exacto (CTA)
                    </span>
                    <p className="text-xs font-semibold text-emerald-400">"{pub.cta_cierre}"</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(pub.cta_cierre || '', `cta-${semanaIndex}-${diaIndex}-${activeIndex}`)}
                    className="text-[10px] font-mono text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 transition-colors whitespace-nowrap"
                  >
                    {copied === `cta-${semanaIndex}-${diaIndex}-${activeIndex}` ? '✓ Copiado' : 'Copiar CTA'}
                  </button>
                </div>
              )}

              {/* Prompt Visual */}
              {pub.prompt_visual && (
                <div className="bg-white/[0.01] rounded-lg p-2.5 border border-white/[0.04]">
                  <span className="text-[9px] font-mono text-white/30 uppercase block mb-0.5">
                    Dirección de Arte / Prompt Visual
                  </span>
                  <p className="text-[11px] text-white/60 font-mono italic">{pub.prompt_visual}</p>
                </div>
              )}
            </div>
          )}

          {(() => {
            const platformCopy = getPlatformCopy(pub, copyGlobal);
            if (!pub?.plataforma || !platformCopy) return null;
            const copyKeyId = `copy-${semanaIndex}-${diaIndex}-${activeIndex}`;
            return (
              <DayPostMockup
                key={`${pub.plataforma}-${activeIndex}`}
                platform={pub.plataforma}
                copy={platformCopy}
                hashtags={(pub.hashtags?.length ? pub.hashtags : copyGlobal?.hashtags) ?? []}
                copied={copied === copyKeyId}
                onCopy={() => handleCopy(platformCopy, copyKeyId)}
              />
            );
          })()}

          {pub?.hashtags && pub.hashtags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Hashtags:</span>
              {(pub.hashtags || []).map((h) => (
                <span key={h} className="text-xs font-mono text-white/80 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                  {h.startsWith('#') ? h : `#${h}`}
                </span>
              ))}
            </div>
          )}

          {dia.sugerencia_engagement && (
            <div className="bg-white/[0.02] rounded-xl p-3.5 border border-white/[0.06]">
              <p className="text-xs text-white/70 leading-relaxed">
                <span className="text-white font-medium">Recomendación de interacción: </span>
                {dia.sugerencia_engagement}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PLATFORM_COLOR: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  Instagram: { border: 'border-pink-500/40', bg: 'bg-pink-500/8', text: 'text-pink-400', glow: 'shadow-[inset_0_0_12px_rgba(236,72,153,0.08)]' },
  TikTok:    { border: 'border-cyan-400/40',  bg: 'bg-cyan-400/8',  text: 'text-cyan-400',  glow: 'shadow-[inset_0_0_12px_rgba(34,211,238,0.08)]' },
  Facebook:  { border: 'border-blue-500/40', bg: 'bg-blue-500/8', text: 'text-blue-400', glow: 'shadow-[inset_0_0_12px_rgba(59,130,246,0.08)]' },
  YouTube:   { border: 'border-red-500/40',  bg: 'bg-red-500/8',  text: 'text-red-400',  glow: 'shadow-[inset_0_0_12px_rgba(239,68,68,0.08)]' },
  LinkedIn:  { border: 'border-sky-500/40',  bg: 'bg-sky-500/8',  text: 'text-sky-400',  glow: 'shadow-[inset_0_0_12px_rgba(14,165,233,0.08)]' },
  WhatsApp:  { border: 'border-green-500/40', bg: 'bg-green-500/8', text: 'text-green-400', glow: 'shadow-[inset_0_0_12px_rgba(34,197,94,0.08)]' },
  Twitter:   { border: 'border-slate-400/40', bg: 'bg-slate-400/8', text: 'text-slate-300', glow: '' },
};

function WeekMap({ dias, publishedDays, semanaIndex }: {
  dias: DiaCalendario[];
  publishedDays: Set<string>;
  semanaIndex: number;
}) {
  const withContent = dias.filter((d) => d.publicaciones.length > 0 && !diaSinContenido(d)).length;
  const publishedCount = dias.filter((_, i) => publishedDays.has(`${semanaIndex}-${i}`)).length;
  const pct = withContent > 0 ? Math.round((publishedCount / withContent) * 100) : 0;

  return (
    <div className="mb-4 w-full">
      <div className="grid grid-cols-7 gap-2 mb-2">
        {dias.map((d) => (
          <div key={d.dia + '-h'} className="text-center">
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">{DIAS_CORTO[d.dia]}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dias.map((d, i) => {
          const pub = d.publicaciones[0] as PublicacionDiaria | undefined;
          const isPublished = publishedDays.has(`${semanaIndex}-${i}`);
          const isEmpty = d.publicaciones.length === 0;
          const isLocked = diaSinContenido(d);
          const platform = pub?.plataforma ?? '';
          const badge = isLocked ? null : (pub?.tipo_contenido || null);
          const pMeta = getPlatformMeta(platform);
          const Icon = pMeta.icon;

          return (
            <button 
              key={d.dia}
              title={isLocked ? 'Publicación programada (Plan Pro)' : undefined}
              onClick={() => {
                const el = document.getElementById(`daycard-${semanaIndex}-${i}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  if (el.getAttribute('data-state') === 'closed') {
                    const btn = el.querySelector('button');
                    if (btn) btn.click();
                  }
                  el.classList.add('ring-1', 'ring-white/40');
                  setTimeout(() => {
                    el.classList.remove('ring-1', 'ring-white/40');
                  }, 1200);
                }
              }}
              className={`text-left relative rounded-xl border transition-all duration-200 flex flex-col overflow-hidden min-h-[110px] cursor-pointer outline-none focus:ring-1 focus:ring-white/40 ${
              isPublished
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : isEmpty
                ? 'bg-white/[0.01] border-dashed border-white/[0.06] opacity-40 hover:opacity-70'
                : isLocked
                ? 'bg-white/[0.02] border-white/[0.06] opacity-70 hover:opacity-100 hover:border-white/20'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-white/25 hover:bg-white/[0.04]'
            }`}>
              {/* Day number strip */}
              <div className={`flex items-center justify-between px-2.5 pt-2 pb-1.5 border-b ${
                isPublished ? 'border-emerald-500/20' : 'border-white/[0.05]'
              }`}>
                <span className={`text-[11px] font-mono font-medium ${
                  isPublished ? 'text-emerald-400' : isEmpty ? 'text-white/20' : 'text-white/70'
                }`}>
                  {i + 1 + semanaIndex * 7}
                </span>
                {isPublished && (
                  <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <svg className="w-2 h-2 text-black font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                )}
                {d.evento_estacional && !isPublished && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={d.evento_estacional} />
                )}
              </div>

              {/* Cell body */}
              <div className="flex-1 flex flex-col items-center justify-center px-1.5 py-2 gap-1.5">
                {isEmpty ? (
                  <div className="text-center">
                    <span className="text-[10px] font-mono text-white/25 uppercase tracking-wider">Descanso</span>
                  </div>
                ) : (
                  <>
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${pMeta.bgClass} ${pMeta.borderClass} ${pMeta.textClass} border`}>
                      <Icon className="w-3 h-3" />
                    </div>
                    {badge && (
                      <span className={`text-[8px] font-mono px-1 py-0.2 rounded uppercase tracking-wider border truncate max-w-[55px] ${
                        CONTENT_TYPE_BADGE[badge] ?? 'bg-white/10 text-white/50 border-white/10'
                      }`}>
                        {badge}
                      </span>
                    )}
                    {pub?.hora && (
                      <span className="text-[9px] font-mono text-white/40 tabular-nums">{pub.hora}</span>
                    )}
                  </>
                )}
              </div>

              {/* Platform name label */}
              {!isEmpty && !isPublished && (
                <div className="px-1.5 pb-1 text-center truncate">
                  <span className="text-[8px] font-mono text-white/40 uppercase tracking-wider truncate">
                    {pMeta.name}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 bg-white/5 rounded-full h-1 overflow-hidden border border-white/[0.06]">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-white/40 tabular-nums whitespace-nowrap">
          {publishedCount}/{withContent} publicados ({pct}%)
        </span>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MarketingResultadoPage() {
  const { productoId, analisisId } = useParams<{ productoId: string; analisisId: string }>();
  const router = useRouter();

  const [analisis, setAnalisis] = useState<AnalisisMarketing | null>(null);
  const [producto, setProducto] = useState<{ pais?: string; categoria?: string; nombre?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skeletonStep, setSkeletonStep] = useState(0);
  const [estrategiaActiva, setEstrategiaActiva] = useState<TipoEstrategia>('VENTAS_PLUS');
  const [semanaActiva, setSemanaActiva] = useState<1 | 2>(1);
  const [seccionActiva, setSeccionActiva] = useState<SeccionMarketing>('estrategia');
  const [userPlan] = useState<string>(() => { try { const u = localStorage.getItem('usuario'); return u ? JSON.parse(u).plan || 'freemium' : 'freemium'; } catch { return 'freemium'; } });
  // Gate de secciones bloqueadas: copies, tendencias, métricas y semana 2
  // (ver lib/plans.ts y services/billing/gatingAnalisis.ts).
  const isPro = esPlanDePago(userPlan);
  const [copied, setCopied] = useState('');
  const [printMode, setPrintMode] = useState(false);
  const [publishedDays, setPublishedDays] = useState<Set<string>>(new Set());
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const isPreloaded = useRef(false);

  // Carga del producto para contextualizar país y giro/categoría
  useEffect(() => {
    if (!productoId) return;
    let activo = true;
    api.get(`/productos/${productoId}`)
      .then(({ data }) => {
        if (activo && data) setProducto(data);
      })
      .catch(() => {});
    return () => { activo = false; };
  }, [productoId]);

  // Carga inmediata de análisis existente al montar (evita la espera del polling/SSE si ya terminó)
  useEffect(() => {
    let activo = true;
    api.get(`/marketing/${analisisId}`)
      .then(({ data }) => {
        if (!activo) return;
        if (data?.estado_analisis === 'completado') {
          isPreloaded.current = true;
          setAnalisis(data);
          if (stepTimerRef.current) clearInterval(stepTimerRef.current);
        } else if (data?.estado_analisis === 'error') {
          setErrorMessage(data?.error_mensaje || 'Error en el análisis');
          if (stepTimerRef.current) clearInterval(stepTimerRef.current);
        }
      })
      .catch((err) => {
        if (!activo) return;
        const status = err?.response?.status;
        if (status === 404) {
          setErrorMessage('El análisis solicitado no existe o fue eliminado.');
        }
      });
    return () => { activo = false; };
  }, [analisisId]);

  // Animación del skeleton
  useEffect(() => {
    stepTimerRef.current = setInterval(() => {
      setSkeletonStep((prev) => (prev + 1) % 5);
    }, 4000);
    return () => { clearInterval(stepTimerRef.current!); };
  }, []);

  // SSE + polling hasta que el análisis esté listo
  useAnalysisEvents(analisisId, `/marketing/${analisisId}/status`, (event) => {
    if (event.estado === 'completado') {
      clearInterval(stepTimerRef.current!);
      api.get(`/marketing/${analisisId}`)
        .then(({ data: full }) => setAnalisis(full))
        .catch(() => setErrorMessage('No se pudo cargar el análisis. Recarga la página para intentarlo de nuevo.'));
    } else if (event.estado === 'error') {
      clearInterval(stepTimerRef.current!);
      setErrorMessage(event.errorMessage ?? 'Error en el análisis');
    }
  });

  const handlePrint = () => {
    setPrintMode(true);
    setTimeout(() => {
      window.print();
      window.addEventListener('afterprint', () => setPrintMode(false), { once: true });
    }, 150);
  };

  const togglePublished = (semanaIndex: number, diaIndex: number) => {
    const key = `${semanaIndex}-${diaIndex}`;
    setPublishedDays((prev) => {
      if (prev.has(key)) {
        return new Set(Array.from(prev).filter((k) => k !== key));
      }
      return new Set(prev).add(key);
    });
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  // Loader: para análisis ya completados en BD abre en ~1 s; para ejecuciones nuevas espera el ciclo completo
  const minMs = isPreloaded.current ? 700 : 4500;
  const handoffMs = isPreloaded.current ? 250 : 900;
  const { showLoader, loaderDone } = useAnalysisLoaderGate(
    !!analisis && analisis.estado_analisis !== 'procesando',
    minMs,
    handoffMs,
  );

  // Memoized normalizers: llamados incondicionalmente antes de cualquier early return (Rules of Hooks)
  const estrategias = useMemo(
    () => normalizeEstrategias(analisis?.estrategias_data, analisis?.copies_data),
    [analisis?.estrategias_data, analisis?.copies_data]
  );
  const calendario = useMemo(
    () => normalizeCalendario(analisis?.calendario_data),
    [analisis?.calendario_data]
  );
  const copies = useMemo(
    () => normalizeCopies(analisis?.copies_data, estrategias),
    [analisis?.copies_data, estrategias]
  );

  useEffect(() => {
    if (estrategias.length > 0) {
      const currentValid = estrategias.find((e) => e.tipo === estrategiaActiva && !esEstrategiaBloqueada(e));
      if (!currentValid) {
        const recommended = estrategias.find((e) => e.recomendada && !esEstrategiaBloqueada(e));
        const firstAllowed = estrategias.find((e) => !esEstrategiaBloqueada(e));
        if (recommended) setEstrategiaActiva(recommended.tipo);
        else if (firstAllowed) setEstrategiaActiva(firstAllowed.tipo);
        else if (estrategias[0]) setEstrategiaActiva(estrategias[0].tipo);
      }
    }
  }, [estrategias, estrategiaActiva]);

  // GSAP corre únicamente cuando el loader ya cedió el paso y mainRef está en el DOM
  useGSAP(() => {
    if (showLoader || !analisis || analisis.estado_analisis !== 'completado') return;

    const tl = gsap.timeline();
    tl.fromTo(
      '.reveal',
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, stagger: 0.08, ease: 'power2.out' }
    );
  }, { scope: mainRef, dependencies: [showLoader, analisis?.estado_analisis, semanaActiva, estrategiaActiva, seccionActiva] });

  // ─── Error ──────────────────────────────────────────────────────────────────
  // Va antes del loader: en fallo `analisis` puede seguir null y el loader lo
  // habría capturado, dejando la pantalla cargando indefinidamente.
  if (errorMessage || analisis?.estado_analisis === 'error') {
    return (
      <AnalysisError
        modulo="marketing"
        title="Fallo en la estrategia de marketing"
        message={errorMessage ?? analisis?.error_mensaje}
        retryHref={`/dashboard/marketing/${productoId}`}
      />
    );
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  // `|| !analisis` mantiene el estrechamiento de tipos para el resto del render.
  if (showLoader || !analisis) {
    return (
      <AnalysisLoader
        modulo="marketing"
        steps={MARKETING_LOADER_STEPS}
        currentStep={skeletonStep % MARKETING_LOADER_STEPS.length}
        title="Agente de Estrategia"
        subtitle="Generando tácticas, copies y calendario de contenido"
        done={loaderDone}
      />
    );
  }

  const calSemanas = Array.isArray(calendario?.semanas) ? calendario.semanas : [];
  const calTendencias = Array.isArray(calendario?.tendencias) ? calendario.tendencias : [];
  const calRecomendaciones = Array.isArray(calendario?.recomendacion_plataforma)
    ? calendario.recomendacion_plataforma
    : [];
  const isLegacy = calSemanas.length === 0 && !!calendario?.fases;

  // ── Gate de plan ──────────────────────────────────────────────────────────
  // El recorte ocurre en el orquestador (backend/src/services/billing/
  // gatingAnalisis.ts): lo que el plan no incluye NO se genera, así que gatear
  // por presencia del dato dejaba al plan gratuito sin candado y sin upsell.
  // `secciones_bloqueadas` llega en el top level de GET /marketing/:id; el
  // fallback cubre los análisis cuyo valor solo quedó dentro de calendario_data.
  const bloqueadasCalendario = calendario?.secciones_bloqueadas;
  const seccionesBloqueadas: string[] = Array.isArray(analisis.secciones_bloqueadas)
    ? analisis.secciones_bloqueadas
    : Array.isArray(bloqueadasCalendario)
      ? bloqueadasCalendario
      : [];
  // El plan manda sobre la lista persistida: un análisis recortado que se abre
  // desde una cuenta de pago no debe mostrar candados (basta re-ejecutarlo, y
  // en esos planes no consume cuota).
  const estaBloqueada = (seccion: string) => !isPro && seccionesBloqueadas.includes(seccion);
  const bloqueaSemana2 = estaBloqueada('marketing.calendario_semana_2');
  // El backend ya vacía calendario.tendencias (redactAnalisis.ts), pero la
  // sección 6 es contenido propio del front y hay que taparla aquí.
  const bloqueaTendencias = estaBloqueada('marketing.tendencias');

  // Las estrategias secundarias llegan BLANQUEADAS, no ausentes, así que la
  // vista se resuelve solo entre las visibles: `estrategiaActiva` arranca fijo
  // en 'PREMIUM' y esa puede ser justo una de las recortadas, en cuyo caso el
  // detalle mostraría el centinela como descripción y 0/100 y $0 como cifras.
  const estrategiasVisibles = estrategias.filter((e) => !esEstrategiaBloqueada(e));
  const candidatas = estrategiasVisibles.length > 0 ? estrategiasVisibles : estrategias;
  const candidato = candidatas.find((e) => e.tipo === estrategiaActiva) ?? candidatas[0];
  const estrategiaVista: EstrategiaMarketing = candidato ?? DEFAULT_ESTRATEGIA;
  // Solo queda true si el recorte no dejó NINGUNA estrategia visible.
  const vistaBloqueada = esEstrategiaBloqueada(estrategiaVista);
  // Copy de la estrategia activa. Lo consumen las DayCard del calendario vía getPlatformCopy.
  const copyVista = copies.find((c) => c.tipo === estrategiaVista.tipo) ?? copies[0];
  const semanaVista = calSemanas.find((s) => s.numero === semanaActiva) ?? calSemanas[0];
  const semanaIndex = semanaVista ? semanaVista.numero - 1 : 0;

  const diasOrdenados = semanaVista
    ? DIAS_ORDEN.map((d) => (semanaVista.dias || []).find((dia) => dia.dia === d) ?? { dia: d, publicaciones: [], sugerencia_engagement: '' })
    : [];

  const totalPublicaciones = diasOrdenados.reduce((acc, d) => acc + d.publicaciones.length, 0);

  // Extraer buyer personas si vienen en el payload
  const rawObj = (analisis.estrategias_data && typeof analisis.estrategias_data === 'object' && !Array.isArray(analisis.estrategias_data))
    ? (analisis.estrategias_data as Record<string, any>)
    : null;
  const buyerPersonas: any[] = Array.isArray(rawObj?.buyer_personas) ? rawObj.buyer_personas : [];

  return (
    <div ref={mainRef} className={`px-4 sm:px-6 py-10 max-w-6xl mx-auto pb-24 relative ${printMode ? 'print-mode' : ''}`}>

      {/* ── Breadcrumb ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6" data-print="hide">
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <Link href={`/dashboard/marketing/${productoId}`} className="hover:text-white transition-colors">Marketing</Link>
          <span>/</span>
          <span className="text-white/80 font-medium">Resultados</span>
        </div>
        <div className="flex items-center gap-3">
          {analisis.voz_marca && (
            <span className="text-[11px] font-mono text-white/50 bg-white/[0.03] border border-white/[0.08] px-3 py-1 rounded-full">
              Voz: {analisis.voz_marca}
            </span>
          )}
          <button
            onClick={handlePrint}
            className="text-xs font-medium border border-white/10 text-white/70 px-3.5 py-1.5 rounded-xl hover:border-white/25 hover:text-white transition-all flex items-center gap-2 bg-white/[0.02]"
          >
            <svg className="w-3.5 h-3.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Descargar PDF</span>
          </button>
        </div>
      </div>

      {/* ── Executive Header Card (Lujo Silencioso) ── */}
      <div className="reveal mb-6 rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-6 sm:p-7 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] font-mono tracking-wider text-white/50 uppercase">
                Plan Estratégico de Marketing
              </span>
              <span className="text-white/20">·</span>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                Completado
              </span>
              {estrategias.find(e => e.recomendada) && (
                <span className="text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-400/20 px-2 py-0.5 rounded-md">
                  Recomendada: {estrategias.find(e => e.recomendada)?.nombre}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Estrategia y Plan de Contenidos
            </h1>
            <p className="text-sm text-white/50 mt-1 max-w-2xl leading-relaxed">
              Tácticas de posicionamiento calibradas con IA, calendario de distribución multicanal y plan de inversión para tu negocio.
            </p>
          </div>
        </div>
      </div>

      {/* ── Segmented Navigation Tabs (Lujo Silencioso y Seccionado) ── */}
      <div className="sticky top-4 z-30 mb-8 p-1.5 rounded-2xl bg-[#0A0F17]/90 backdrop-blur-md border border-white/[0.08] flex items-center gap-1.5 overflow-x-auto shadow-lg" data-print="hide">
        {SECCIONES_TABS.map((tab) => {
          const active = seccionActiva === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSeccionActiva(tab.id);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                active
                  ? 'bg-white/[0.1] text-white border border-white/[0.15] shadow-sm'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span>{tab.label}</span>
              {tab.id === 'estrategia' && estrategias.length > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40'}`}>
                  {estrategias.length}
                </span>
              )}
              {tab.id === 'calendario' && calSemanas.length > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40'}`}>
                  {totalPublicaciones}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-8">

        {/* ── 1. Estrategias & 2. Detalle ───────────────────────────────────── */}
        {(seccionActiva === 'estrategia' || seccionActiva === 'todo') && (
          <>
            <section className="reveal">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-white tracking-tight">
                  Estrategias de Posicionamiento
                </h2>
                <p className="text-xs text-white/40 mt-0.5">Selecciona el enfoque táctico prioritario. El calendario y presupuesto se alinean a la opción seleccionada.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {estrategias.map((e) => {
                  const tipoKey = (e.tipo?.toUpperCase() as TipoEstrategia) || 'VENTAS_PLUS';
                  const c = TIPO_COLOR[tipoKey] ?? TIPO_COLOR.VENTAS_PLUS;
                  const icon = TIPO_ICON[tipoKey] ?? '🎯';
                  const invKey = (e.nivel_inversion?.toUpperCase() as keyof typeof INVERSION_COLOR) || 'MEDIO';
                  const invColor = INVERSION_COLOR[invKey] ?? 'text-white';
                  const active = e.tipo === estrategiaVista?.tipo;
                  const isVentasPlus = tipoKey === 'VENTAS_PLUS';

                  if (esEstrategiaBloqueada(e)) {
                    return (
                      <Link
                        key={e.tipo}
                        href="/dashboard/billing"
                        aria-label={`Estrategia ${tipoKey} disponible en Plan Pro. Mejorar plan`}
                        className="text-left rounded-2xl border border-dashed border-amber-400/20 bg-[#0A0F17] p-5 sm:p-6 flex flex-col relative overflow-hidden transition-all duration-200 hover:border-amber-400/40 hover:bg-[#0C121D]"
                      >
                        <div className="flex items-start justify-between mb-4 w-full">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-xs border border-white/10 bg-white/5 text-white/40" aria-hidden="true">
                            {icon}
                          </div>
                          <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 border border-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full font-mono uppercase tracking-widest whitespace-nowrap">
                            Plan Pro
                          </span>
                        </div>

                        <p className="font-semibold text-base tracking-tight leading-snug text-white/70">
                          Estrategia {tipoKey}
                        </p>
                        <p className="text-xs text-white/40 font-normal mt-1 mb-5 flex-1 leading-relaxed">
                          Idoneidad, precio sugerido y presupuesto de esta táctica disponibles en Plan Pro.
                        </p>

                        <div className="space-y-2.5 bg-black/30 p-3.5 rounded-xl border border-white/[0.06] w-full">
                          <div aria-hidden="true" className="h-2 rounded-full bg-white/[.06] w-[75%]" />
                          <div aria-hidden="true" className="h-2 rounded-full bg-white/[.04] w-[50%]" />
                          <span className="block pt-1 text-[11px] font-mono text-amber-300 uppercase tracking-wider">
                            Mejorar plan →
                          </span>
                        </div>
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={e.tipo}
                      onClick={() => setEstrategiaActiva(e.tipo)}
                      className={`text-left rounded-2xl border transition-all duration-200 p-5 sm:p-6 flex flex-col relative overflow-hidden ${
                        active
                          ? isVentasPlus
                            ? 'border-amber-400/60 bg-[#0F1726] shadow-[0_0_24px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/30'
                            : 'border-white/30 bg-[#0D131F] shadow-sm'
                          : isVentasPlus
                            ? 'border-amber-500/25 bg-[#0A0F17] hover:border-amber-400/40 hover:bg-[#0C121D]'
                            : 'border-white/[0.07] bg-[#0A0F17] hover:border-white/20 hover:bg-[#0C121D]'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4 relative z-10 w-full">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-xs border transition-all ${
                          isVentasPlus
                            ? active ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-black shadow-md shadow-amber-500/20' : 'bg-amber-500/10 border-amber-400/30 text-amber-300'
                            : active ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/50'
                        }`}>
                          {icon}
                        </div>
                        {isVentasPlus ? (
                          <span className="text-[10px] bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/30 text-amber-300 px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wide">
                            {e.recomendada ? 'Flagship ★' : 'Ventas +'}
                          </span>
                        ) : e.recomendada ? (
                          <span className="text-[10px] bg-amber-500/10 border border-amber-400/25 text-amber-300 px-2.5 py-0.5 rounded-full font-mono font-medium tracking-wide">
                            Recomendada
                          </span>
                        ) : null}
                      </div>

                      <p className={`font-semibold text-base tracking-tight leading-snug relative z-10 ${active ? 'text-white' : 'text-white/90'}`}>{e.nombre}</p>
                      <p className="text-xs text-white/45 font-normal mt-1 mb-5 flex-1 leading-relaxed relative z-10">{e.tagline}</p>

                      <div className="space-y-3 bg-black/30 p-3.5 rounded-xl border border-white/[0.06] w-full relative z-10">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Idoneidad</span>
                          <span className="text-xs font-semibold font-mono text-white">{e.puntaje_fit ?? 0}<span className="text-white/30 text-[10px]">/100</span></span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${isVentasPlus ? 'bg-amber-400' : active ? 'bg-white/80' : 'bg-white/20'}`} style={{ width: `${e.puntaje_fit ?? 0}%` }} />
                        </div>
                        <div className="pt-2 flex justify-between items-center border-t border-white/5">
                          <div>
                            <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Precio sugerido</p>
                            <p className="font-semibold font-mono text-xs text-white mt-0.5">${(e.precio_sugerido ?? 0).toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Presupuesto/mes</p>
                            <p className={`font-semibold font-mono text-xs mt-0.5 ${invColor}`}>${(e.presupuesto_mensual_sugerido ?? 0).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── 2. Detalle de estrategia ──────────────────────────────────── */}
            {estrategiaVista && (() => {
              if (vistaBloqueada) {
                return (
                  <LockedSection
                    plan={userPlan}
                    titulo="Detalle de la estrategia disponible en Plan Pro"
                    detalle="Descripción, público objetivo, canales principales, ROI estimado y ventaja competitiva de cada táctica."
                    minHeight={340}
                  >
                    <div className="rounded-2xl border border-white/10 bg-[#0A0F17] p-2">
                      <SkeletonBloque filas={6} />
                    </div>
                  </LockedSection>
                );
              }

              const vistaTipoKey = (estrategiaVista.tipo?.toUpperCase() as TipoEstrategia) || 'PREMIUM';
              const vistaIcon = TIPO_ICON[vistaTipoKey] ?? '01';
              const minP = estrategiaVista.precio_rango?.min ?? 0;
              const maxP = estrategiaVista.precio_rango?.max ?? 0;

              return (
                <section className="reveal rounded-2xl p-6 sm:p-7 border border-white/[0.08] bg-[#0A0F17]">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-mono font-bold text-sm text-white/80">
                      {vistaIcon}
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-0.5">
                        Estrategia seleccionada
                      </p>
                      <h3 className="text-xl font-semibold text-white tracking-tight">{estrategiaVista.nombre}</h3>
                      <p className="text-xs text-white/50 font-normal mt-0.5">{estrategiaVista.tagline}</p>
                    </div>
                  </div>

                  <div className="mb-6 bg-white/[0.02] border border-white/[0.06] p-4 sm:p-5 rounded-xl">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
                      Fundamento Estratégico
                    </p>
                    <p className="text-sm text-white/80 leading-relaxed font-normal">{estrategiaVista.descripcion}</p>
                  </div>

                  {/* KPIs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {[
                      { label: 'Margen Estimado', value: estrategiaVista.margen_rango ?? `${estrategiaVista.margen_estimado ?? '—'}%`, isMono: true, text: 'text-emerald-400' },
                      { label: 'Rango de Precio', value: `$${minP.toLocaleString()} – $${maxP.toLocaleString()}`, isMono: true, text: 'text-white' },
                      { label: 'Nivel de Riesgo', value: estrategiaVista.riesgo ?? '—', isMono: false, text: estrategiaVista.riesgo === 'ALTO' ? 'text-rose-400' : estrategiaVista.riesgo === 'MEDIO' ? 'text-amber-300' : 'text-emerald-400' },
                      { label: 'Inversión Sugerida', value: estrategiaVista.nivel_inversion ?? '—', isMono: false, text: 'text-white' },
                    ].map((item) => (
                      <div key={item.label} className="bg-white/[0.02] rounded-xl p-3.5 border border-white/[0.06] flex flex-col gap-1">
                        <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider">
                          {item.label}
                        </p>
                        <p className={`text-sm font-semibold ${item.text} ${item.isMono ? 'font-mono' : ''} leading-tight`}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Público + Ventaja */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 pb-6 border-b border-white/[0.06]">
                    <div className="bg-white/[0.02] rounded-xl p-4 sm:p-5 border border-white/[0.06]">
                      <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-2">
                        Público Objetivo
                      </p>
                      <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-normal">{estrategiaVista.publico_objetivo}</p>
                    </div>
                    <div className="bg-white/[0.02] rounded-xl p-4 sm:p-5 border border-white/[0.06]">
                      <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-2">
                        Ventaja Competitiva
                      </p>
                      <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-normal">{estrategiaVista.ventaja_competitiva}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-3">
                      Canales Principales de Distribución
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(estrategiaVista.canales_principales || []).map((canal) => (
                        <PlatformBadge key={canal} plataforma={canal} size="sm" />
                      ))}
                    </div>
                  </div>

                  {buyerPersonas.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-white/[0.06]">
                      <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-3">
                        Perfiles de Cliente Ideal (Buyer Personas)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {buyerPersonas.map((bp: any, i: number) => (
                          <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-white">{bp.nombre}</span>
                                {bp.edad && (
                                  <span className="text-[10px] font-mono text-white/40 px-2 py-0.5 rounded bg-white/5 border border-white/[0.06]">
                                    {bp.edad} años
                                  </span>
                                )}
                              </div>
                              {bp.puesto && (
                                <p className="text-[11px] font-mono text-white/40 mb-2">{bp.puesto}</p>
                              )}
                              {bp.dolor_principal && (
                                <p className="text-xs text-rose-300/80 mb-2 leading-relaxed">
                                  <span className="text-white/30 font-mono text-[10px] uppercase mr-1.5 block">Dolor principal:</span>
                                  {bp.dolor_principal}
                                </p>
                              )}
                              {bp.motivacion && (
                                <p className="text-xs text-emerald-300/80 leading-relaxed">
                                  <span className="text-white/30 font-mono text-[10px] uppercase mr-1.5 block">Motivación:</span>
                                  {bp.motivacion}
                                </p>
                              )}
                            </div>
                            {Array.isArray(bp.canales_preferidos) && bp.canales_preferidos.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-mono text-white/30 uppercase mr-1">Canales:</span>
                                {bp.canales_preferidos.map((canal: string) => (
                                  <PlatformBadge key={canal} plataforma={canal} size="xs" />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Componentes especializados Ventas + (Unit Economics, WhatsApp Scripts, Oferta Grand Slam) ── */}
                  <VentasPlusEstrategiaView
                    unit_economics={estrategiaVista.unit_economics}
                    script_cierre={estrategiaVista.script_cierre}
                    secuencia_seguimiento={estrategiaVista.secuencia_seguimiento}
                    garantia_irresistible={estrategiaVista.garantia_irresistible}
                    order_bump_sugerido={estrategiaVista.order_bump_sugerido}
                    kpis_reales={estrategiaVista.kpis_reales}
                    plan_accion_paso_a_paso={estrategiaVista.plan_accion_paso_a_paso}
                  />
                </section>
              );
            })()}

            {seccionActiva === 'estrategia' && (
              <div className="flex justify-end pt-2" data-print="hide">
                <button
                  onClick={() => {
                    setSeccionActiva('calendario');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs font-medium text-white/70 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.02] px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                >
                  <span>Continuar a Calendario y Contenido</span>
                  <span>→</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 5. Calendario de Publicaciones ───────────────────────────────── */}
        {(seccionActiva === 'calendario' || seccionActiva === 'todo') && estrategiaVista && calSemanas.length > 0 && (
          <>
            <section className="reveal rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-6 sm:p-7">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-white tracking-tight">
                    Calendario de Publicaciones
                  </h2>
                  <p className="text-xs text-white/40 mt-0.5">
                    Plan de 2 semanas · Alineado a la estrategia {calendario.estrategia_tipo}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap" data-print="hide">
                  {/* Week tabs */}
                  <div className="flex gap-1 bg-black/30 p-1 rounded-xl border border-white/[0.08]">
                    {calSemanas.map((s) => {
                      const semanaBloqueada = bloqueaSemana2 && s.numero === 2;
                      return (
                        <button key={s.numero}
                          type="button"
                          aria-pressed={semanaActiva === s.numero}
                          aria-disabled={semanaBloqueada}
                          title={semanaBloqueada ? 'La semana 2 se genera en Plan Pro' : undefined}
                          onClick={() => { if (semanaBloqueada) return; setSemanaActiva(s.numero as 1 | 2); }}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                            semanaActiva === s.numero
                              ? 'bg-white/10 text-white border border-white/15'
                              : 'text-white/40 hover:text-white'
                          } ${semanaBloqueada ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {semanaBloqueada ? 'Semana 2 (Pro)' : `Semana ${s.numero}`}
                        </button>
                      );
                    })}
                  </div>
                  {/* Copy actions */}
                  <button
                    onClick={() => { const sem = calSemanas[0]; if (sem) handleCopy(buildWeekText(DIAS_ORDEN.map((d) => (sem.dias || []).find((dia) => dia.dia === d) ?? { dia: d, publicaciones: [], sugerencia_engagement: '' })), 'copy-week-0'); }}
                    className="text-xs font-medium border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:border-white/25 hover:text-white transition flex items-center gap-1.5 bg-white/[0.02]"
                  >
                    <span>{copied === 'copy-week-0' ? '✓ Copiado' : 'Copiar Semana'}</span>
                  </button>
                </div>
              </div>

              {/* Tendencias breves en cabecera */}
              {calTendencias.length > 0 && (
                <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {calTendencias.slice(0, 3).map((t, i) => (
                    <div key={`${t.plataforma}-${i}`} className="rounded-xl border border-white/[0.06] p-3 bg-white/[0.02] flex items-center gap-3">
                      <PlatformBadge plataforma={t.plataforma} size="xs" showName={false} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-white truncate">{t.plataforma}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${SCORE_COLOR(t.score)}`}>
                            {t.score}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/40 truncate mt-0.5">{t.tendencia}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats bar */}
              <div className="flex items-center gap-4 mb-4 flex-wrap text-xs text-white/40">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white/70" />
                  <span>Con contenido</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Publicado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white/20" />
                  <span>Descanso</span>
                </div>
                <div className="ml-auto">
                  <span className="text-[11px] font-mono text-white/60 bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 rounded-lg">
                    {totalPublicaciones} publicaciones en esta semana
                  </span>
                </div>
              </div>

              {/* WeekMap grid */}
              <WeekMap dias={diasOrdenados} publishedDays={publishedDays} semanaIndex={semanaIndex} />

              {/* Day accordion cards */}
              <div className="space-y-2 mt-4">
                {diasOrdenados.map((diaData, diaIndex) => (
                  <DayCard
                    key={diaData.dia}
                    dia={diaData}
                    diaIndex={diaIndex}
                    semanaIndex={semanaIndex}
                    isPublished={publishedDays.has(`${semanaIndex}-${diaIndex}`)}
                    onTogglePublished={() => togglePublished(semanaIndex, diaIndex)}
                    copyGlobal={copyVista}
                  />
                ))}
              </div>

              {/* Visual campaign hint */}
              {calendario.sugerencia_visual_campana && (
                <div className="mt-5 rounded-xl bg-white/[0.02] border border-white/[0.07] p-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1.5">
                    Identidad Visual de Campaña
                  </p>
                  <p className="text-xs text-white/70 leading-relaxed font-normal">{calendario.sugerencia_visual_campana}</p>
                </div>
              )}
            </section>

            {seccionActiva === 'calendario' && (
              <div className="flex justify-end pt-2" data-print="hide">
                <button
                  onClick={() => {
                    setSeccionActiva('inversion');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs font-medium text-white/70 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.02] px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                >
                  <span>Continuar a Inversión y Horarios</span>
                  <span>→</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 5b. Inversión y Horarios ──────────────────────────────────────── */}
        {(seccionActiva === 'inversion' || seccionActiva === 'todo') && estrategiaVista && (
          <>
            {vistaBloqueada ? (
              <LockedSection
                plan={userPlan}
                titulo="Plan de inversión y horarios disponible en Plan Pro"
                detalle="Reparto del presupuesto por plataforma y franja horaria, mapa de calor de publicación y simulación de margen con descuento."
                minHeight={340}
              >
                <div className="rounded-2xl border border-white/10 bg-[#0A0F17] p-2">
                  <SkeletonBloque filas={6} />
                </div>
              </LockedSection>
            ) : (
              <PlanInversionSection semanas={calSemanas} estrategia={estrategiaVista} />
            )}

            {seccionActiva === 'inversion' && (
              <div className="flex justify-end pt-2" data-print="hide">
                <button
                  onClick={() => {
                    setSeccionActiva('tendencias');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs font-medium text-white/70 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.02] px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                >
                  <span>Continuar a Tendencias Virales</span>
                  <span>→</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 6. Tendencias Virales ─────────────────────────────────────────── */}
        {(seccionActiva === 'tendencias' || seccionActiva === 'todo') && (
          <>
            {bloqueaTendencias ? (
              <LockedSection
                plan={userPlan}
                titulo="Inteligencia de tendencias virales disponible en Plan Pro"
                detalle="Tendencias nacionales e internacionales con índice de viralidad, gancho publicitario y formato sugerido por plataforma."
                minHeight={360}
              >
                <div className="rounded-2xl border border-white/10 bg-[#0A0F17] p-2">
                  <SkeletonBloque filas={6} />
                </div>
              </LockedSection>
            ) : (
              <>
                <TendenciasSection
                  tendencias={calTendencias}
                  pais={producto?.pais}
                  giro={producto?.categoria}
                />
                <RecomendacionPlataformaSection recomendaciones={calRecomendaciones} />
              </>
            )}

            {seccionActiva === 'tendencias' && (
              <div className="flex justify-end pt-2" data-print="hide">
                <button
                  onClick={() => {
                    setSeccionActiva('rendimiento');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs font-medium text-white/70 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.02] px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                >
                  <span>Continuar a Rendimiento</span>
                  <span>→</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 7. Rendimiento pasado & Acciones finales ─────────────────────── */}
        {(seccionActiva === 'rendimiento' || seccionActiva === 'todo') && (
          <>
            <RendimientoPasadoSection
              reporte={analisis?.reporte_ads_data ?? null}
              productoId={productoId}
            />

            {/* Acciones finales */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#0A0F17] p-6 sm:p-7 flex flex-col sm:flex-row items-center justify-between gap-4" data-print="hide">
              <div>
                <p className="text-sm font-semibold text-white">
                  Próximos Pasos
                </p>
                <p className="text-xs text-white/40 mt-0.5">Genera una nueva iteración o revisa los demás módulos de tu producto.</p>
              </div>
              <div className="flex gap-2.5 flex-wrap">
                <Link
                  href={`/dashboard/marketing/${productoId}`}
                  className="text-xs font-medium border border-white/10 text-white/70 px-4 py-2 rounded-xl hover:border-white/20 hover:text-white transition-all bg-white/[0.02]"
                >
                  + Nuevo análisis
                </Link>
                <Link
                  href="/dashboard"
                  className="text-xs font-medium border border-white/10 text-white/70 px-4 py-2 rounded-xl hover:border-white/20 hover:text-white transition-all bg-white/[0.02]"
                >
                  Dashboard
                </Link>
                <Link
                  href={`/dashboard/producto/${productoId}`}
                  className="text-xs font-medium bg-white text-black px-4 py-2 rounded-xl hover:bg-white/90 transition-all"
                >
                  Ver todos los módulos →
                </Link>
              </div>
            </div>

            {/* Red de Expertos */}
            <ExpertosRecomendados categoria="marketing" />
          </>
        )}

      </div>
    </div>
  );
}
