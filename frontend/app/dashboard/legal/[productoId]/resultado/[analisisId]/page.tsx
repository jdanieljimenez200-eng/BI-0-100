'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { AnalysisLoader } from '@/components/ui/AnalysisLoader';
import { AnalysisError } from '@/components/ui/AnalysisError';
import { useAnalysisLoaderGate } from '@/app/hooks/useAnalysisLoaderGate';
import ExpertosRecomendados from '@/components/network/ExpertosRecomendados';
import LockedSection, { SkeletonBloque, SkeletonTarjetas } from '@/components/ui/LockedSection';
import { estaBloqueada } from '@/lib/gating';

// ─── Types (espejo del backend) ────────────────────────────────────────────────

interface PermisoCumplimiento {
  nombre: string;
  autoridad: string;
  descripcion: string;
  obligatorio: boolean;
  nivel_riesgo: 'bajo' | 'medio' | 'alto';
  plazo_tramite: string;
  costo_estimado: string;
  url_tramite: string;
}

interface ObligacionFiscal {
  nombre: string;
  regimen_fiscal: string;
  periodicidad: string;
  descripcion: string;
  nivel_riesgo: 'bajo' | 'medio' | 'alto';
  aplica_si: string;
}

interface AlertaLegal {
  nivel: 'verde' | 'amarillo' | 'rojo';
  titulo: string;
  descripcion: string;
  accion_recomendada: string;
}

interface ChecklistItem {
  categoria: 'permiso' | 'fiscal' | 'laboral' | 'otro';
  texto: string;
  prioridad: 'alta' | 'media' | 'baja';
}

interface LegalResultado {
  giro_detectado: string;
  pais_analizado: string;
  entidad_fiscal: string;
  fecha_generacion: string;
  cumplimiento_global: 'verde' | 'amarillo' | 'rojo';
  puntaje_cumplimiento: number;
  resumen_ejecutivo: string;
  permisos_licencias: PermisoCumplimiento[];
  obligaciones_fiscales: ObligacionFiscal[];
  obligaciones_laborales: ObligacionFiscal[];
  regulacion_digital: ObligacionFiscal[];
  regulacion_comercio_exterior: ObligacionFiscal[];
  alertas: AlertaLegal[];
  checklist: ChecklistItem[];
  disclaimer: string;
  fuentes_recomendadas: { nombre: string; url: string }[];
}

interface AnalisisLegal {
  id: string;
  estado_analisis: 'procesando' | 'completado' | 'error';
  giro_detectado?: string;
  cumplimiento_global?: string;
  puntaje_cumplimiento?: number;
  resultado_data: LegalResultado | null;
  /** Claves recortadas por plan que declara el backend (gatingAnalisis). */
  secciones_bloqueadas?: string[] | null;
  error_mensaje?: string;
}

// ─── Normalización universal de datos legales ──────────────────────────────────
function normalizeLegalResultado(analisis: AnalisisLegal): LegalResultado {
  const raw = (analisis.resultado_data as any) ?? {};

  const cumplimiento_global = (analisis.cumplimiento_global || raw.cumplimiento_global || 'amarillo').toLowerCase() as 'verde' | 'amarillo' | 'rojo';
  const puntaje_cumplimiento = analisis.puntaje_cumplimiento ?? raw.puntaje_cumplimiento ?? 70;
  const giro_detectado = analisis.giro_detectado || raw.giro_detectado || 'Servicios y Comercio';
  const pais_analizado = (analisis as any).pais || raw.pais_analizado || 'México';
  const entidad_fiscal = (analisis as any).forma_juridica || raw.entidad_fiscal || 'Persona Física / Moral';
  const fecha_generacion = (analisis as any).fecha_creacion || raw.fecha_generacion || new Date().toISOString();
  const resumen_ejecutivo = raw.resumen_ejecutivo || raw.diagnostico || 'Evaluación normativa completada para tu giro comercial.';

  const obligacionesAreas = Array.isArray(raw.obligaciones) ? raw.obligaciones : [];

  // Permisos y Licencias
  let permisos_licencias: PermisoCumplimiento[] = Array.isArray(raw.permisos_licencias) ? raw.permisos_licencias : [];
  if (permisos_licencias.length === 0) {
    const piArea = obligacionesAreas.find((o: any) => o.area === 'Propiedad Intelectual' || o.area === 'Permisos');
    if (piArea?.items) {
      permisos_licencias = piArea.items.map((it: any) => ({
        nombre: it.nombre,
        autoridad: it.nombre.includes('IMPI') ? 'Instituto Mexicano de la Propiedad Industrial (IMPI)' : 'Autoridad Reguladora Local',
        descripcion: it.nota || 'Trámite mandatorio de regularización y protección operativa.',
        obligatorio: true,
        nivel_riesgo: it.cumple ? 'bajo' : 'alto',
        plazo_tramite: '30 a 90 días hábiles',
        costo_estimado: it.nota?.includes('$') ? (it.nota.match(/\$[0-9,]+(\s*MXN)?/)?.[0] || '$2,800 MXN') : '$2,800 MXN',
        url_tramite: it.nombre.includes('IMPI') ? 'https://www.gob.mx/impi' : 'https://www.gob.mx',
      }));
    }
    if (permisos_licencias.length === 0) {
      permisos_licencias = [
        {
          nombre: 'Registro de Marca y Signos Distintivos',
          autoridad: 'IMPI (Instituto Mexicano de la Propiedad Industrial)',
          descripcion: 'Protege tu nombre comercial, logotipo y activos de marca frente a imitadores.',
          obligatorio: true,
          nivel_riesgo: 'medio',
          plazo_tramite: '4 a 6 meses',
          costo_estimado: '$3,126 MXN',
          url_tramite: 'https://www.gob.mx/impi',
        },
      ];
    }
  }

  // Obligaciones Fiscales
  let obligaciones_fiscales: ObligacionFiscal[] = Array.isArray(raw.obligaciones_fiscales) ? raw.obligaciones_fiscales : [];
  if (obligaciones_fiscales.length === 0) {
    const fiscalArea = obligacionesAreas.find((o: any) => o.area === 'Fiscal');
    if (fiscalArea?.items) {
      obligaciones_fiscales = fiscalArea.items.map((it: any) => ({
        nombre: it.nombre,
        regimen_fiscal: entidad_fiscal,
        periodicidad: it.nombre.toLowerCase().includes('mensual') ? 'Mensual' : (it.nombre.toLowerCase().includes('anual') ? 'Anual' : 'Permanente'),
        descripcion: it.nota || 'Cumplimiento tributario ante el Servicio de Administración Tributaria (SAT).',
        nivel_riesgo: it.cumple ? 'bajo' : 'alto',
        aplica_si: `Régimen fiscal activo ${entidad_fiscal}`,
      }));
    }
  }

  // Obligaciones Laborales
  let obligaciones_laborales: ObligacionFiscal[] = Array.isArray(raw.obligaciones_laborales) ? raw.obligaciones_laborales : [];
  if (obligaciones_laborales.length === 0) {
    const laboralArea = obligacionesAreas.find((o: any) => o.area === 'Laboral' || o.area === 'Contratos');
    if (laboralArea?.items) {
      obligaciones_laborales = laboralArea.items.map((it: any) => ({
        nombre: it.nombre,
        regimen_fiscal: 'Marco Laboral y Contractual',
        periodicidad: 'Por Contrato / Evento',
        descripcion: it.nota || 'Estandarización de contratos de prestación de servicios y cesión de derechos.',
        nivel_riesgo: it.cumple ? 'bajo' : 'medio',
        aplica_si: 'Contratación de clientes, colaboradores o aliados',
      }));
    }
  }

  // Regulación Digital
  const regulacion_digital: ObligacionFiscal[] = Array.isArray(raw.regulacion_digital) ? raw.regulacion_digital : [
    {
      nombre: 'Aviso de Privacidad Integral (LFPDPPP)',
      regimen_fiscal: 'INAI / Protección de Datos',
      periodicidad: 'Vigente en plataforma',
      descripcion: 'Obligatorio para todo negocio que recabe datos personales, teléfonos o correos de clientes.',
      nivel_riesgo: 'medio',
      aplica_si: 'Captura de leads, formularios web o transacciones en línea',
    },
    {
      nombre: 'Términos y Condiciones Comerciales',
      regimen_fiscal: 'PROFECO / Comercio Electrónico',
      periodicidad: 'Permanente',
      descripcion: 'Estipulación de alcances de servicio, políticas de entrega, garantías y cancelaciones.',
      nivel_riesgo: 'medio',
      aplica_si: 'Prestación de servicios digitales y cobros comerciales',
    },
  ];

  // Checklist
  const checklist: ChecklistItem[] = Array.isArray(raw.checklist) ? raw.checklist : [];
  if (checklist.length === 0) {
    if (Array.isArray(raw.recomendaciones_prioritarias)) {
      raw.recomendaciones_prioritarias.forEach((rec: string, i: number) => {
        checklist.push({
          categoria: i === 0 ? 'permiso' : (i === 1 ? 'laboral' : 'fiscal'),
          texto: rec,
          prioridad: i === 0 ? 'alta' : 'media',
        });
      });
    }
    obligacionesAreas.forEach((area: any) => {
      if (Array.isArray(area.items)) {
        area.items.filter((it: any) => !it.cumple).forEach((it: any) => {
          checklist.push({
            categoria: area.area === 'Fiscal' ? 'fiscal' : (area.area === 'Propiedad Intelectual' ? 'permiso' : 'laboral'),
            texto: `${it.nombre}: ${it.nota}`,
            prioridad: 'alta',
          });
        });
      }
    });
  }

  // Alertas
  const alertas: AlertaLegal[] = Array.isArray(raw.alertas) ? raw.alertas : [];
  if (alertas.length === 0) {
    obligacionesAreas.forEach((area: any) => {
      if (Array.isArray(area.items)) {
        area.items.filter((it: any) => !it.cumple).forEach((it: any) => {
          alertas.push({
            nivel: 'amarillo',
            titulo: `Atención en ${area.area}: ${it.nombre}`,
            descripcion: it.nota,
            accion_recomendada: `Regularizar ${it.nombre} para evitar multas o contingencias legales.`,
          });
        });
      }
    });
  }

  return {
    giro_detectado,
    pais_analizado,
    entidad_fiscal,
    fecha_generacion,
    cumplimiento_global,
    puntaje_cumplimiento,
    resumen_ejecutivo,
    permisos_licencias,
    obligaciones_fiscales,
    obligaciones_laborales,
    regulacion_digital,
    regulacion_comercio_exterior: Array.isArray(raw.regulacion_comercio_exterior) ? raw.regulacion_comercio_exterior : [],
    alertas,
    checklist,
    disclaimer: raw.disclaimer || 'Este dictamen es una auditoría orientativa automatizada y no sustituye la asesoría jurídica formal.',
    fuentes_recomendadas: Array.isArray(raw.fuentes_recomendadas) && raw.fuentes_recomendadas.length > 0 ? raw.fuentes_recomendadas : [
      { nombre: 'Portal SAT México', url: 'https://www.sat.gob.mx' },
      { nombre: 'IMPI - Marca en Línea', url: 'https://www.gob.mx/impi' },
      { nombre: 'INAI - Protección de Datos', url: 'https://home.inai.org.mx' },
    ],
  };
}

// ─── Helpers de color ──────────────────────────────────────────────────────────
const RIESGO_COLOR = {
  bajo: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  medio: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-400' },
  alto: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
};

/**
 * `resultado_data` viaja como jsonb: la interfaz de arriba es un espejo del
 * backend, no una garantía en runtime. El esquema zod de legalService valida la
 * salida del LLM, pero las filas insertadas con SQL directo (seeds, demos) no
 * pasan por él, así que `nivel_riesgo` puede llegar con otra caja ('Alto'), con
 * espacios o ausente. Indexar RIESGO_COLOR a pelo devolvía undefined y la
 * página moría al leer `.border`. Se normaliza la clave y se cae a 'medio'.
 */
function riesgoColor(nivel: string | null | undefined) {
  const key = String(nivel ?? '').trim().toLowerCase() as keyof typeof RIESGO_COLOR;
  return RIESGO_COLOR[key] ?? RIESGO_COLOR.medio;
}

/** Texto del badge, tolerante a un nivel vacío o fuera de contrato. */
function riesgoLabel(nivel: string | null | undefined) {
  const texto = String(nivel ?? '').trim();
  return texto ? texto.toUpperCase() : 'SIN DATO';
}

// ─── SVG Icons Profesionales (Sin Emojis) ────────────────────────────────────

function IconEscudoCheck({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconEscudoAlerta({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconAlertaOctagon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconAlertaTriangulo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconCheckCirculo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconLicencia({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconFiscalDoc({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="15" x2="6.01" y2="15" />
      <line x1="10" y1="15" x2="14" y2="15" />
    </svg>
  );
}

function IconEmpleados({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconComercioDigital({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconComercioExterior({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function IconChecklist({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconPortalOficial({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconDescargarDoc({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

const SEMAFORO_CONFIG = {
  verde: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    glow: 'shadow-[0_0_40px_rgba(52,211,153,0.2)]',
    ring: 'ring-emerald-400/30',
    label: 'Cumplimiento Óptimo',
    sublabel: 'Riesgo Normativo Bajo',
    Icon: IconEscudoCheck,
  },
  amarillo: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    glow: 'shadow-[0_0_40px_rgba(251,191,36,0.2)]',
    ring: 'ring-amber-400/30',
    label: 'Cumplimiento Moderado',
    sublabel: 'Atención Regulatoria Requerida',
    Icon: IconEscudoAlerta,
  },
  rojo: {
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    glow: 'shadow-[0_0_40px_rgba(248,113,113,0.2)]',
    ring: 'ring-red-400/30',
    label: 'Riesgo Crítico Detectado',
    sublabel: 'Acción Inmediata Requerida',
    Icon: IconAlertaOctagon,
  },
};

const NIVEL_ALERTA = {
  verde: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-300', Icon: IconCheckCirculo, dot: 'bg-emerald-400' },
  amarillo: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-300', Icon: IconAlertaTriangulo, dot: 'bg-amber-400' },
  rojo: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-300', Icon: IconAlertaOctagon, dot: 'bg-red-400' },
};

const CAT_LABEL: Record<string, string> = {
  permiso: 'Licencia / Permiso',
  fiscal: 'Obligación Fiscal',
  laboral: 'Marco Laboral',
  otro: 'Regulación General',
};
const CAT_COLOR: Record<string, string> = {
  permiso: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  fiscal: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  laboral: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  otro: 'bg-white/5 text-white/40 border-white/10',
};

const PRIORIDAD_ORDER = { alta: 0, media: 1, baja: 2 };

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function Section({ title, icon, children, count }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; count?: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center flex-shrink-0">
          {icon}
        </span>
        <h2 className="text-base font-bold text-white tracking-tight">{title}</h2>
        {count !== undefined && (
          <span className="text-xs font-semibold text-slate-400 bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PermisoCard({ item }: { item: PermisoCumplimiento }) {
  const clr = riesgoColor(item.nivel_riesgo);
  return (
    <div className={`rounded-xl border ${clr.border} bg-[#0F1C2A] p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white">{item.nombre}</h3>
            {item.obligatorio && (
              <span className="text-[10px] font-bold text-white/50 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                OBLIGATORIO
              </span>
            )}
          </div>
          <p className="text-xs text-white/40 mt-0.5">{item.autoridad}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${clr.bg} ${clr.border} ${clr.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${clr.dot}`} />
          {riesgoLabel(item.nivel_riesgo)}
        </span>
      </div>
      <p className="text-xs text-white/55 leading-relaxed">{item.descripcion}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
          <p className="text-[10px] text-white/30 font-medium uppercase tracking-wider mb-1">Plazo</p>
          <p className="text-xs text-white/70 font-semibold">{item.plazo_tramite}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
          <p className="text-[10px] text-white/30 font-medium uppercase tracking-wider mb-1">Costo estimado</p>
          <p className="text-xs text-white/70 font-semibold">{item.costo_estimado}</p>
        </div>
      </div>
      {item.url_tramite && item.url_tramite !== '#no-aplica' && (
        <a
          href={item.url_tramite}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-[#A78BFA] hover:text-[#C4B5FD] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Ir al trámite oficial →
        </a>
      )}
    </div>
  );
}

function ObligacionCard({ item }: { item: ObligacionFiscal }) {
  const clr = riesgoColor(item.nivel_riesgo);
  return (
    <div className={`rounded-xl border ${clr.border} bg-[#0F1C2A] p-4 space-y-2`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">{item.nombre}</h3>
          <p className="text-[11px] text-white/40 mt-0.5">{item.regimen_fiscal} · {item.periodicidad}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${clr.bg} ${clr.border} ${clr.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${clr.dot}`} />
          {riesgoLabel(item.nivel_riesgo)}
        </span>
      </div>
      <p className="text-xs text-white/55 leading-relaxed">{item.descripcion}</p>
      <p className="text-[11px] text-white/30 italic">Aplica si: {item.aplica_si}</p>
    </div>
  );
}

// ─── Loader ────────────────────────────────────────────────────────────────────

const LEGAL_LOADER_STEPS = [
  { label: 'Identificando giro y categoría' },
  { label: 'Revisando marco regulatorio' },
  { label: 'Evaluando obligaciones fiscales' },
  { label: 'Generando checklist de cumplimiento' },
];

/** Milisegundos entre avances simulados de paso mientras el análisis corre. */
const LEGAL_STEP_INTERVAL_MS = 7000;

// ─── Tipos de Pestaña ────────────────────────────────────────────────────────
type LegalTab = 'dictamen' | 'permisos' | 'obligaciones' | 'checklist' | 'completo';

// ─── Main Result Page ──────────────────────────────────────────────────────────

export default function LegalResultadoPage() {
  const params = useParams();
  const router = useRouter();
  const productoId = params?.productoId as string;
  const analisisId = params?.analisisId as string;

  const [analisis, setAnalisis] = useState<AnalisisLegal | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [legalStep, setLegalStep] = useState(0);
  const [activeTab, setActiveTab] = useState<LegalTab>('dictamen');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPreloaded = useRef(false);

  // Plan leído una sola vez del storage, igual que en finanzas/mercado. Se usa
  // solo para decidir el gate visual; el recorte real lo hace el backend.
  const [userPlan] = useState<string>(() => {
    try {
      const u = localStorage.getItem('usuario');
      return u ? JSON.parse(u).plan || 'freemium' : 'freemium';
    } catch {
      return 'freemium';
    }
  });

  const fetchAnalisis = async () => {
    try {
      const { data } = await api.get(`/legal/${analisisId}`);
      if (data && data.estado_analisis === 'completado') {
        isPreloaded.current = true;
      }
      setAnalisis(data);
      if (data.estado_analisis !== 'procesando') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setLoading(false);
      }
    } catch {
      setLoading(false);
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
  };

  useEffect(() => {
    fetchAnalisis();
    pollingRef.current = setInterval(fetchAnalisis, 3000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analisisId]);

  // Avance visual de los pasos del loader mientras el análisis está en curso.
  const procesando = !analisis || analisis.estado_analisis === 'procesando';

  // Loader: 700 ms si ya estaba precargado, 4500 ms si está en generación activa
  const { showLoader, loaderDone } = useAnalysisLoaderGate(
    !procesando,
    isPreloaded.current ? 700 : 4500
  );
  useEffect(() => {
    if (!procesando) return;
    const id = setInterval(() => {
      setLegalStep((prev) => Math.min(prev + 1, LEGAL_LOADER_STEPS.length - 1));
    }, LEGAL_STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [procesando]);

  const toggleChecked = (idx: number) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handlePrint = () => window.print();

  // ─── Estado: error ───────────────────────────────────────────────────────────
  if (analisis?.estado_analisis === 'error') {
    return (
      <AnalysisError
        modulo="legal"
        title="Fallo en el análisis legal"
        message={analisis.error_mensaje}
        onRetry={() => router.push(`/dashboard/legal/${productoId}`)}
      />
    );
  }

  // ─── Estado: procesando ──────────────────────────────────────────────────────
  // `|| !analisis` mantiene el estrechamiento de tipos para el resto del render.
  if (showLoader || !analisis) {
    return (
      <AnalysisLoader
        modulo="legal"
        steps={LEGAL_LOADER_STEPS}
        currentStep={legalStep}
        title="Analizando tu marco legal"
        subtitle="Revisando permisos, licencias y obligaciones fiscales de tu giro"
        done={loaderDone}
      />
    );
  }

  // ─── Estado: completado ──────────────────────────────────────────────────────
  const r = normalizeLegalResultado(analisis);

  // En plan gratuito redactAnalisis.redactLegal pone resultado_data = null y solo
  // sobreviven los 3 escalares del semáforo en el top level de la fila. Sin este
  // corte la página pintaba el informe con un objeto vacío: cero datos, cero
  // candado y cero upsell. Se mira la clave del servidor, no el plan a pelo.
  const legalBloqueado = estaBloqueada(userPlan, 'legal.completo', analisis.secciones_bloqueadas);

  if (legalBloqueado) {
    // `cumplimiento_global` es varchar libre en la tabla: los seeds y las filas
    // insertadas con SQL directo no pasan por el zod de legalService, así que
    // puede llegar con otra caja, con espacios o como un valor no-string. Un
    // `?.toLowerCase()` a pelo revienta con "is not a function" en ese caso.
    const previewKey = String(analisis.cumplimiento_global ?? '').trim().toLowerCase() as keyof typeof SEMAFORO_CONFIG;
    const semPreview = SEMAFORO_CONFIG[previewKey] ?? SEMAFORO_CONFIG.amarillo;
    const puntajePreview = analisis.puntaje_cumplimiento ?? r.puntaje_cumplimiento;

    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 sm:space-y-8">
        {/* Sin botón de PDF: no hay informe que exportar en este plan. */}
        <div className="flex items-center gap-2 text-sm text-white/30 flex-wrap">
          <Link href="/dashboard" className="hover:text-white/70 transition">Dashboard</Link>
          <span>/</span>
          <Link href={`/dashboard/legal/${productoId}`} className="hover:text-white/70 transition">Legal</Link>
          <span>/</span>
          <span className="text-white/60">Resultado</span>
        </div>

        {/* Gancho visible: el semáforo sí es dato real del análisis. */}
        <div className={`rounded-2xl border ${semPreview.border} ${semPreview.bg} ${semPreview.glow} p-5 sm:p-6`}>
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className={`relative w-20 h-20 rounded-2xl ${semPreview.bg} border-2 ${semPreview.border} flex flex-col items-center justify-center flex-shrink-0 ring-4 ${semPreview.ring}`}>
              <semPreview.Icon className={`w-8 h-8 ${semPreview.color}`} />
              <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-[#060C14] border border-white/10 rounded-full px-2 py-0.5 whitespace-nowrap">
                <span className={`text-[11px] font-black ${semPreview.color}`}>
                  {typeof puntajePreview === 'number' ? `${puntajePreview}/100` : '—'}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className={`text-xl font-extrabold ${semPreview.color}`}>{semPreview.label}</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 font-medium">
                  {semPreview.sublabel}
                </span>
              </div>
              {analisis.giro_detectado && (
                <p className="text-sm text-white/50 break-words">{analisis.giro_detectado}</p>
              )}
              <p className="text-xs text-white/35 mt-2 leading-relaxed max-w-[52ch]">
                Tu semáforo de cumplimiento ya está calculado. El desarrollo del
                informe legal forma parte de los planes de pago.
              </p>
            </div>
          </div>
        </div>

        <LockedSection
          plan={userPlan}
          titulo="Informe legal completo con Premium"
          detalle="Permisos y licencias con autoridad, plazo y costo; obligaciones fiscales, laborales y de comercio digital; alertas de cumplimiento y portales oficiales de trámite."
          cta="Ver planes"
          minHeight={280}
        >
          <SkeletonTarjetas cantidad={6} />
        </LockedSection>

        <LockedSection
          plan={userPlan}
          titulo="Checklist de cumplimiento"
          detalle="Trámites priorizados por categoría, con seguimiento de avance y exportación a PDF."
          cta="Ver planes"
          minHeight={220}
        >
          <SkeletonBloque filas={6} />
        </LockedSection>

        <ExpertosRecomendados categoria="legal" />

        <Link
          href={`/dashboard/legal/${productoId}`}
          className="block w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-sm font-bold text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          Volver a Legal
        </Link>
      </div>
    );
  }

  // Mismo motivo que en el preview freemium: el valor viene del jsonb y no está
  // garantizado en runtime. Se normaliza a string antes de bajar la caja.
  const estadoKey = String(r.cumplimiento_global ?? '').trim().toLowerCase() as keyof typeof SEMAFORO_CONFIG;
  const sem = SEMAFORO_CONFIG[estadoKey] ?? SEMAFORO_CONFIG.amarillo;

  const checklistOrdenado = [...(r.checklist || [])].sort(
    (a, b) => (PRIORIDAD_ORDER[a.prioridad] ?? 2) - (PRIORIDAD_ORDER[b.prioridad] ?? 2)
  );
  const completados = checklistOrdenado.filter((_, i) => checkedItems.has(i)).length;
  const pctChecklist = checklistOrdenado.length > 0 ? Math.round((completados / checklistOrdenado.length) * 100) : 0;

  return (
    <>
      {/* ── CSS print media ───────────────────────────────────────────────── */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          aside, nav, header { display: none !important; }
          .print-area { padding: 0 !important; max-width: 100% !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8 print-area" id="legal-report">

        {/* ── Breadcrumb + acciones ─────────────────────────────────────── */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-2 text-sm text-white/30">
            <Link href="/dashboard" className="hover:text-white/70 transition">Dashboard</Link>
            <span>/</span>
            <Link href={`/dashboard/legal/${productoId}`} className="hover:text-white/70 transition">Legal</Link>
            <span>/</span>
            <span className="text-white/60">Resultado</span>
          </div>
          <button
            onClick={handlePrint}
            id="btn-descargar-pdf"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-semibold transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descargar PDF
          </button>
        </div>

        {/* ── Tabs Quiet Luxury Navigation ── */}
        <div className="sticky top-4 z-30 mb-6 no-print">
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#08101a]/85 border border-white/10 backdrop-blur-xl shadow-2xl overflow-x-auto scrollbar-none">
            {[
              { id: 'dictamen' as const, label: 'Dictamen & Semáforo', icon: <IconEscudoCheck className="w-4 h-4" /> },
              { id: 'permisos' as const, label: 'Permisos & Licencias', icon: <IconLicencia className="w-4 h-4" />, count: (r.permisos_licencias || []).length },
              { id: 'obligaciones' as const, label: 'Obligaciones Normativas', icon: <IconFiscalDoc className="w-4 h-4" /> },
              { id: 'checklist' as const, label: 'Checklist de Acción', icon: <IconChecklist className="w-4 h-4" />, count: `${completados}/${checklistOrdenado.length}` },
              { id: 'completo' as const, label: 'Vista Completa', icon: <IconPortalOficial className="w-4 h-4" /> },
            ].map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'text-white bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.08)] border border-white/15'
                      : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <span className={isActive ? 'text-violet-400' : 'text-white/40'}>{t.icon}</span>
                  <span>{t.label}</span>
                  {t.count !== undefined && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold leading-none ${
                      isActive ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 text-white/40 border border-white/8'
                    }`}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ══ TAB 1: DICTAMEN & SEMÁFORO ══ */}
        {(activeTab === 'dictamen' || activeTab === 'completo') && (
          <div className="space-y-6">
            {/* Header: Semáforo global */}
            <div className={`rounded-2xl border ${sem.border} ${sem.bg} ${sem.glow} p-6 space-y-4`}>
              <div className="flex items-start gap-5">
                {/* Círculo del semáforo */}
                <div className={`relative w-20 h-20 rounded-2xl ${sem.bg} border-2 ${sem.border} flex flex-col items-center justify-center flex-shrink-0 ring-4 ${sem.ring}`}>
                  <sem.Icon className={`w-8 h-8 ${sem.color}`} />
                  {/* Puntaje */}
                  <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-[#060C14] border border-white/10 rounded-full px-2 py-0.5 whitespace-nowrap">
                    <span className={`text-[11px] font-black ${sem.color}`}>{r.puntaje_cumplimiento}/100</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className={`text-xl font-extrabold ${sem.color}`}>{sem.label}</h1>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 font-medium">
                      {sem.sublabel}
                    </span>
                  </div>
                  <p className="text-sm text-white/60 mb-2">{r.giro_detectado} · {r.pais_analizado}</p>
                  <p className="text-xs text-white/40">Entidad fiscal: <span className="text-white/70">{r.entidad_fiscal}</span></p>
                  <p className="text-[10px] text-white/30 mt-1">
                    Dictamen generado: {new Date(r.fecha_generacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Resumen ejecutivo */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-sm text-white/70 leading-relaxed">{r.resumen_ejecutivo}</p>
              </div>
            </div>

            {/* Alertas */}
            {(r.alertas || []).length > 0 && (
              <Section title="Alertas de Cumplimiento Normativo" icon={<IconEscudoAlerta className="w-4 h-4" />} count={(r.alertas || []).length}>
                <div className="space-y-3">
                  {[...(r.alertas || [])].sort((a, b) => {
                    const order = { rojo: 0, amarillo: 1, verde: 2 };
                    const keyA = (a.nivel?.toLowerCase() as keyof typeof order) || 'amarillo';
                    const keyB = (b.nivel?.toLowerCase() as keyof typeof order) || 'amarillo';
                    return (order[keyA] ?? 1) - (order[keyB] ?? 1);
                  }).map((alerta, i) => {
                    const keyA = (alerta.nivel?.toLowerCase() as keyof typeof NIVEL_ALERTA) || 'amarillo';
                    const a = NIVEL_ALERTA[keyA] ?? NIVEL_ALERTA.amarillo;
                    return (
                      <div key={i} className={`rounded-xl border ${a.border} ${a.bg} p-4 space-y-2`}>
                        <div className="flex items-start gap-2.5">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${a.text}`}>
                            <a.Icon className="w-4 h-4" />
                          </span>
                          <div>
                            <h3 className={`text-sm font-bold ${a.text}`}>{alerta.titulo}</h3>
                            <p className="text-xs text-white/60 mt-1 leading-relaxed">{alerta.descripcion}</p>
                          </div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2 ml-7">
                          <p className="text-[11px] text-white/40 font-medium mb-0.5">Acción recomendada:</p>
                          <p className="text-xs text-white/70">{alerta.accion_recomendada}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Fuentes recomendadas */}
            {(r.fuentes_recomendadas || []).length > 0 && (
              <Section title="Fuentes y Portales Oficiales" icon={<IconPortalOficial className="w-4 h-4" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(r.fuentes_recomendadas || []).map((f, i) => (
                    <a
                      key={i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0F1C2A] border border-white/10 hover:border-[#7C3AED]/30 hover:bg-[#7C3AED]/5 transition-all duration-200 group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-[#7C3AED]/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-[#A78BFA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                      <span className="text-sm text-white/60 group-hover:text-white/90 transition-colors">{f.nombre}</span>
                    </a>
                  ))}
                </div>
              </Section>
            )}

            {/* Disclaimer */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl px-5 py-4">
              <p className="text-[11px] text-white/30 leading-relaxed">{r.disclaimer}</p>
            </div>

            {/* Red de Expertos */}
            <ExpertosRecomendados categoria="legal" />
          </div>
        )}

        {/* ══ TAB 2: PERMISOS & LICENCIAS ══ */}
        {(activeTab === 'permisos' || activeTab === 'completo') && (
          <div className="space-y-6">
            <Section title="Permisos y Licencias de Operación" icon={<IconLicencia className="w-4 h-4" />} count={(r.permisos_licencias || []).length}>
              <div className="space-y-3">
                {(r.permisos_licencias || []).map((p, i) => <PermisoCard key={i} item={p} />)}
              </div>
            </Section>
          </div>
        )}

        {/* ══ TAB 3: OBLIGACIONES NORMATIVAS ══ */}
        {(activeTab === 'obligaciones' || activeTab === 'completo') && (
          <div className="space-y-6">
            {/* Obligaciones Fiscales */}
            <Section title="Obligaciones Fiscales & Tributarias" icon={<IconFiscalDoc className="w-4 h-4" />} count={(r.obligaciones_fiscales || []).length}>
              <div className="space-y-3">
                {(r.obligaciones_fiscales || []).map((o, i) => <ObligacionCard key={i} item={o} />)}
              </div>
            </Section>

            {/* Obligaciones Laborales */}
            {(r.obligaciones_laborales || []).length > 0 && (
              <Section title="Marco Laboral y Seguridad Social" icon={<IconEmpleados className="w-4 h-4" />} count={(r.obligaciones_laborales || []).length}>
                <div className="space-y-3">
                  {(r.obligaciones_laborales || []).map((o, i) => <ObligacionCard key={i} item={o} />)}
                </div>
              </Section>
            )}

            {/* Regulación Digital */}
            {(r.regulacion_digital || []).length > 0 && (
              <Section title="Regulación de Comercio Digital" icon={<IconComercioDigital className="w-4 h-4" />} count={(r.regulacion_digital || []).length}>
                <div className="space-y-3">
                  {(r.regulacion_digital || []).map((o, i) => <ObligacionCard key={i} item={o} />)}
                </div>
              </Section>
            )}

            {/* Comercio Exterior */}
            {(r.regulacion_comercio_exterior || []).length > 0 && (
              <Section title="Comercio Exterior y Aduanas" icon={<IconComercioExterior className="w-4 h-4" />} count={(r.regulacion_comercio_exterior || []).length}>
                <div className="space-y-3">
                  {(r.regulacion_comercio_exterior || []).map((o, i) => <ObligacionCard key={i} item={o} />)}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ══ TAB 4: CHECKLIST DE ACCIÓN ══ */}
        {(activeTab === 'checklist' || activeTab === 'completo') && (
          <div className="space-y-6">
            <Section title="Checklist de Cumplimiento Institucional" icon={<IconChecklist className="w-4 h-4" />}>
              <div className="bg-[#0F1C2A] rounded-2xl border border-white/10 overflow-hidden">
                {/* Progress header */}
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white/60">{completados} de {checklistOrdenado.length} completados</p>
                    <div className="w-48 h-1.5 bg-white/5 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-[#7C3AED] rounded-full transition-all duration-500"
                        style={{ width: `${pctChecklist}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-2xl font-black ${pctChecklist === 100 ? 'text-emerald-400' : 'text-[#A78BFA]'}`}>
                    {pctChecklist}%
                  </span>
                </div>

                {/* Items */}
                <div className="divide-y divide-white/5">
                  {checklistOrdenado.map((item, i) => {
                    const done = checkedItems.has(i);
                    const prioClr = { alta: 'text-red-400', media: 'text-amber-400', baja: 'text-white/40' }[item.prioridad];
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleChecked(i)}
                        className={`w-full flex items-start gap-4 px-5 py-4 text-left transition-all duration-200 hover:bg-white/[0.02] no-print ${done ? 'opacity-50' : ''}`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200 ${
                          done ? 'bg-[#7C3AED] border-[#7C3AED]' : 'border-white/20 hover:border-[#7C3AED]/50'
                        }`}>
                          {done && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm text-white/80 leading-snug ${done ? 'line-through text-white/30' : ''}`}>
                            {item.texto}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${CAT_COLOR[item.categoria]}`}>
                              {CAT_LABEL[item.categoria]}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${prioClr}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                item.prioridad === 'alta' ? 'bg-red-400' : item.prioridad === 'media' ? 'bg-amber-400' : 'bg-emerald-400'
                              }`} />
                              {item.prioridad === 'alta' ? 'Prioridad Alta' : item.prioridad === 'media' ? 'Prioridad Media' : 'Prioridad Baja'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* ── Botones finales ───────────────────────────────────────────── */}
        <div className="flex gap-3 no-print">
          <Link
            href={`/dashboard/legal/${productoId}`}
            className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-sm font-bold text-center transition-all duration-200"
          >
            Nuevo análisis
          </Link>
          <button
            onClick={handlePrint}
            className="flex-1 py-3 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-all duration-200 shadow-[0_0_20px_rgba(124,58,237,0.3)] flex items-center justify-center gap-2"
          >
            <IconDescargarDoc className="w-4 h-4" />
            Exportar Dictamen en PDF
          </button>
        </div>
      </div>
    </>
  );
}
