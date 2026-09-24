'use client';

import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Shuffle, Target, AlertTriangle } from 'lucide-react';
import { PlatformBadge } from './MarketingSocialIcons';

// ─── Tipos mínimos ────────────────────────────────────────────────────────────
// Se declaran locales (y estructurales) porque page.tsx no exporta los suyos:
// cualquier objeto con estos campos encaja sin acoplar los dos archivos.

export interface PublicacionPlan {
  hora?: string;
  plataforma?: string;
}

export interface DiaPlan {
  dia: string;
  publicaciones: PublicacionPlan[];
}

export interface SemanaPlan {
  numero: number;
  dias: DiaPlan[];
}

export interface EstrategiaPlan {
  tipo: string;
  nombre: string;
  precio_sugerido: number;
  presupuesto_mensual_sugerido: number;
  margen_estimado?: number;
  margen_rango?: string;
  nivel_inversion?: string;
  canales_principales?: string[];
}

interface Props {
  semanas: SemanaPlan[];
  estrategia: EstrategiaPlan;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIAS: { key: string; corto: string; largo: string }[] = [
  { key: 'lunes', corto: 'Lun', largo: 'Lunes' },
  { key: 'martes', corto: 'Mar', largo: 'Martes' },
  { key: 'miércoles', corto: 'Mié', largo: 'Miércoles' },
  { key: 'jueves', corto: 'Jue', largo: 'Jueves' },
  { key: 'viernes', corto: 'Vie', largo: 'Viernes' },
  { key: 'sábado', corto: 'Sáb', largo: 'Sábado' },
  { key: 'domingo', corto: 'Dom', largo: 'Domingo' },
];

interface Banda {
  key: string;
  label: string;
  rango: string;
  desde: number;
  hasta: number;
}

const BANDAS: Banda[] = [
  { key: 'madrugada', label: 'Madrugada', rango: '00–06', desde: 0, hasta: 6 },
  { key: 'manana', label: 'Mañana', rango: '06–09', desde: 6, hasta: 9 },
  { key: 'media', label: 'Media mañana', rango: '09–12', desde: 9, hasta: 12 },
  { key: 'mediodia', label: 'Mediodía', rango: '12–15', desde: 12, hasta: 15 },
  { key: 'tarde', label: 'Tarde', rango: '15–18', desde: 15, hasta: 18 },
  { key: 'prime', label: 'Prime time', rango: '18–21', desde: 18, hasta: 21 },
  { key: 'noche', label: 'Noche', rango: '21–24', desde: 21, hasta: 24 },
];

const PLATAFORMA_COLOR: Record<string, string> = {
  Facebook: '#1877F2',
  Instagram: '#E1306C',
  WhatsApp: '#25D366',
  TikTok: '#69C9D0',
  YouTube: '#FF0000',
  LinkedIn: '#0A66C2',
  Twitter: '#1D9BF0',
  Pinterest: '#E60023',
  Threads: '#A1A1AA',
  Telegram: '#229ED9',
  Snapchat: '#FFFC00',
  Reddit: '#FF4500',
};

const PLATAFORMA_COLOR_FALLBACK = '#8B5CF6';

function metaDe(plataforma: string): { color: string } {
  return { color: PLATAFORMA_COLOR[plataforma] ?? PLATAFORMA_COLOR_FALLBACK };
}

type MezclaKey = 'digital' | 'equilibrado' | 'local';

interface Mezcla {
  key: MezclaKey;
  label: string;
  digital: number;
  fisica: number;
  produccion: number;
  cuando: string;
}

const MEZCLAS: Mezcla[] = [
  {
    key: 'digital',
    label: 'Solo digital',
    digital: 0.8,
    fisica: 0.05,
    produccion: 0.15,
    cuando: 'Vendes a distancia o tu cliente te encuentra buscando en internet. Casi todo el dinero va a pauta.',
  },
  {
    key: 'equilibrado',
    label: 'Equilibrado',
    digital: 0.6,
    fisica: 0.25,
    produccion: 0.15,
    cuando: 'Tienes local o zona de servicio definida y también vendes por redes. Es el punto de partida recomendado.',
  },
  {
    key: 'local',
    label: 'Local fuerte',
    digital: 0.4,
    fisica: 0.45,
    produccion: 0.15,
    cuando: 'Tu venta se cierra a pie de calle: colonia, mercado, plaza o paso vehicular alto.',
  },
];

interface MedioFisico {
  nombre: string;
  unidad: string;
  min: number;
  max: number;
  tip: string;
}

/**
 * Rangos de referencia en pesos mexicanos para medios fuera de línea. Es
 * contenido editorial fijo (no sale del análisis): sirve para dimensionar el
 * presupuesto, no como cotización. Siempre hay que pedir precio local.
 */
const MEDIOS_FISICOS: MedioFisico[] = [
  {
    nombre: 'Manta / lona 1×2 m', unidad: 'por pieza', min: 250, max: 600,
    tip: 'Se lee a 10 metros solo si tiene 7 palabras o menos. Un mensaje, un teléfono, nada más.',
  },
  {
    nombre: 'Lona 3×2 m instalada', unidad: 'por pieza', min: 700, max: 1800,
    tip: 'Cuesta más la instalación que la impresión. Negocia el permiso con el dueño de la pared por escrito.',
  },
  {
    nombre: 'Volantes media carta', unidad: 'el millar', min: 600, max: 1200,
    tip: 'Sin oferta ni fecha límite terminan en el piso. Ponles un código o cupón para saber cuántos regresaron.',
  },
  {
    nombre: 'Perifoneo', unidad: 'por hora', min: 300, max: 700,
    tip: 'Funciona en colonias y tianguis. Grabar el spot una vez y repetirlo sale más barato que pagar locutor en vivo.',
  },
  {
    nombre: 'Parabús / mupi', unidad: 'por mes', min: 4000, max: 12000,
    tip: 'Alta repetición sobre la misma gente. Solo vale si tu cliente pasa por ahí todos los días.',
  },
  {
    nombre: 'Espectacular en avenida', unidad: 'por mes', min: 8000, max: 35000,
    tip: 'Es marca, no venta directa. Con presupuesto chico casi siempre rinde más repartirlo en lonas y pauta.',
  },
  {
    nombre: 'Rotulación de vehículo', unidad: 'pago único', min: 2500, max: 9000,
    tip: 'El mejor costo por impresión del listado: se paga una vez y anuncia todos los días durante años.',
  },
  {
    nombre: 'Playeras / uniformes', unidad: 'por pieza', min: 120, max: 300,
    tip: 'Uniformar al equipo sube la percepción de precio y da prueba social gratis en cada servicio.',
  },
  {
    nombre: 'Tarjetas de presentación', unidad: 'el millar', min: 400, max: 900,
    tip: 'Ponles el QR de tu WhatsApp al reverso: convierte el papel en una conversación medible.',
  },
];

interface PromoIdea {
  nombre: string;
  /** Descuento efectivo sobre el precio unitario, en porcentaje. */
  descuento: number;
  /** Unidades que se entregan en la transacción. */
  unidades: number;
  mecanica: string;
  cuando: string;
}

const PROMOS: PromoIdea[] = [
  {
    nombre: '2x1', descuento: 50, unidades: 2,
    mecanica: 'Paga uno, lleva dos. El cliente recibe dos unidades al precio de una.',
    cuando: 'Solo si tu margen supera el 55% y quieres llenar horas muertas o estrenar plaza. Ponle fecha de caducidad.',
  },
  {
    nombre: '3x2', descuento: 33.3, unidades: 3,
    mecanica: 'Paga dos, lleva tres. Sube el ticket en lugar de partirlo a la mitad.',
    cuando: 'Alternativa sana al 2x1: casi el mismo gancho con la mitad del sacrificio de margen.',
  },
  {
    nombre: 'Paquete de 3 con 15% off', descuento: 15, unidades: 3,
    mecanica: 'Vendes tres servicios prepagados con descuento por volumen.',
    cuando: 'Cuando quieres cobrar hoy el trabajo de las próximas semanas. Es la promo que más ayuda al flujo de efectivo.',
  },
  {
    nombre: 'Primera vez -20%', descuento: 20, unidades: 1,
    mecanica: 'Descuento único de bienvenida, válido solo en la primera compra.',
    cuando: 'Para vencer la desconfianza inicial. Mide cuántos regresan a precio completo: si no vuelven, el descuento fue un gasto.',
  },
  {
    nombre: 'Trae un amigo -10% a los dos', descuento: 10, unidades: 1,
    mecanica: 'Quien refiere y quien llega reciben el mismo descuento.',
    cuando: 'La más barata de todas: el descuento sustituye al gasto en pauta y llega con recomendación incluida.',
  },
  {
    nombre: 'Plan mensual (4 al mes) -10%', descuento: 10, unidades: 4,
    mecanica: 'Suscripción con cobro recurrente y precio unitario menor.',
    cuando: 'Convierte compras sueltas en ingreso predecible. Es la palanca de valor de vida del cliente más fuerte.',
  },
  {
    nombre: 'Horario valle -25%', descuento: 25, unidades: 1,
    mecanica: 'Precio reducido solo en los días u horas de baja demanda.',
    cuando: 'Cuando tienes capacidad ociosa identificada. No canibaliza tus horas buenas porque está acotado por horario.',
  },
  {
    nombre: 'Tarjeta de sellos (10ª gratis)', descuento: 10, unidades: 10,
    mecanica: 'Nueve compras a precio normal y la décima sin costo.',
    cuando: 'Premia frecuencia sin bajar el precio de lista y el descuento solo se paga si el cliente ya te dejó nueve ventas.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMXN(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const limpio = hex.replace('#', '');
  const full = limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio;
  if (full.length !== 6 || !/^[0-9a-f]{6}$/i.test(full)) return `rgba(139, 92, 246, ${alpha})`;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Normaliza el día del calendario a las claves de DIAS (tolera falta de acentos). */
function normalizaDia(dia: string | undefined): string | null {
  if (!dia) return null;
  const base = dia.trim().toLowerCase();
  const equivalencias: Record<string, string> = {
    miercoles: 'miércoles',
    sabado: 'sábado',
  };
  const key = equivalencias[base] ?? base;
  return DIAS.some((d) => d.key === key) ? key : null;
}

/** Acepta "18:00", "6:00 PM", "18:30 hrs". Devuelve la hora en 0–23. */
function parseHora(hora: string | undefined): number | null {
  if (!hora) return null;
  const m = hora.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (!Number.isFinite(h)) return null;
  const sufijo = m[3] ? m[3].toLowerCase().replace(/\./g, '') : '';
  if (sufijo === 'pm' && h < 12) h += 12;
  if (sufijo === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23) return null;
  return h;
}

/** Margen base de la estrategia: número directo o promedio del rango textual. */
function margenBase(e: EstrategiaPlan): number | null {
  if (typeof e.margen_estimado === 'number' && e.margen_estimado > 0) return e.margen_estimado;
  if (e.margen_rango) {
    const nums = e.margen_rango.match(/\d+(?:[.,]\d+)?/g);
    if (nums && nums.length > 0) {
      const vals = nums
        .map((n) => parseFloat(n.replace(',', '.')))
        .filter((v) => Number.isFinite(v) && v > 0 && v <= 100);
      if (vals.length > 0) return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return null;
}

/**
 * Margen que queda tras aplicar un descuento. El costo es fijo, así que el
 * margen no baja los mismos puntos que el descuento: baja más.
 */
function margenTrasDescuento(margenPct: number | null, descuentoPct: number): number | null {
  if (margenPct === null || !Number.isFinite(margenPct) || margenPct <= 0) return null;
  const costo = 1 - margenPct / 100;
  const nuevoPrecio = 1 - descuentoPct / 100;
  if (nuevoPrecio <= 0) return null;
  return ((nuevoPrecio - costo) / nuevoPrecio) * 100;
}

interface Celda {
  total: number;
  plataformas: Record<string, number>;
  horas: string[];
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function PlanInversionSection({ semanas, estrategia }: Props) {
  const presupuestoBase = useMemo(() => {
    const b = Math.round(estrategia.presupuesto_mensual_sugerido ?? 0);
    return b > 0 ? b : 5000;
  }, [estrategia.presupuesto_mensual_sugerido]);

  const [presupuesto, setPresupuesto] = useState<number>(presupuestoBase);
  const [mezclaKey, setMezclaKey] = useState<MezclaKey>('equilibrado');
  const [copiado, setCopiado] = useState(false);

  // Al cambiar de estrategia cambia el presupuesto sugerido: se resincroniza.
  useEffect(() => {
    setPresupuesto(presupuestoBase);
  }, [presupuestoBase]);

  const heat = useMemo(() => {
    const mapa: Record<string, Record<string, Celda>> = {};
    DIAS.forEach((d) => {
      mapa[d.key] = {};
      BANDAS.forEach((b) => {
        mapa[d.key][b.key] = { total: 0, plataformas: {}, horas: [] };
      });
    });

    const pesos: Record<string, number> = {};
    const porBanda: Record<string, number> = {};
    const porDia: Record<string, number> = {};
    let total = 0;
    let omitidos = 0;

    (semanas || []).forEach((sem) => {
      (sem.dias || []).forEach((dia) => {
        const diaKey = normalizaDia(dia.dia);
        if (!diaKey) return;
        (dia.publicaciones || []).forEach((pub) => {
          const h = parseHora(pub.hora);
          if (h === null) {
            omitidos += 1;
            return;
          }
          const banda = BANDAS.find((b) => h >= b.desde && h < b.hasta);
          if (!banda) {
            omitidos += 1;
            return;
          }
          const plataforma = pub.plataforma && pub.plataforma.trim() ? pub.plataforma.trim() : 'Otras redes';
          const celda = mapa[diaKey][banda.key];
          celda.total += 1;
          celda.plataformas[plataforma] = (celda.plataformas[plataforma] ?? 0) + 1;
          if (pub.hora) celda.horas.push(pub.hora);
          pesos[plataforma] = (pesos[plataforma] ?? 0) + 1;
          porBanda[banda.key] = (porBanda[banda.key] ?? 0) + 1;
          porDia[diaKey] = (porDia[diaKey] ?? 0) + 1;
          total += 1;
        });
      });
    });

    let max = 0;
    DIAS.forEach((d) => BANDAS.forEach((b) => {
      if (mapa[d.key][b.key].total > max) max = mapa[d.key][b.key].total;
    }));

    const bandasVisibles = BANDAS.filter((b) => b.key !== 'madrugada' || (porBanda.madrugada ?? 0) > 0);

    const mejorBandaKey = Object.keys(porBanda).sort((a, b) => (porBanda[b] ?? 0) - (porBanda[a] ?? 0))[0];
    const mejorDiaKey = Object.keys(porDia).sort((a, b) => (porDia[b] ?? 0) - (porDia[a] ?? 0))[0];

    const plataformas = Object.keys(pesos).sort((a, b) => pesos[b] - pesos[a]);

    return {
      mapa,
      max,
      total,
      omitidos,
      bandasVisibles,
      plataformas,
      pesos,
      mejorBanda: BANDAS.find((b) => b.key === mejorBandaKey) ?? null,
      mejorBandaTotal: mejorBandaKey ? porBanda[mejorBandaKey] ?? 0 : 0,
      mejorDia: DIAS.find((d) => d.key === mejorDiaKey) ?? null,
      mejorDiaTotal: mejorDiaKey ? porDia[mejorDiaKey] ?? 0 : 0,
    };
  }, [semanas]);

  const mezcla = MEZCLAS.find((m) => m.key === mezclaKey) ?? MEZCLAS[1];
  const montoDigital = presupuesto * mezcla.digital;
  const montoFisica = presupuesto * mezcla.fisica;
  const montoProduccion = presupuesto * mezcla.produccion;

  /** Reparto de la pauta digital según cuánto peso tiene cada red en el calendario. */
  const repartoDigital = useMemo(() => {
    let base: { plataforma: string; peso: number }[] = heat.plataformas
      .filter((p) => p !== 'Otras redes')
      .map((p) => ({ plataforma: p, peso: heat.pesos[p] }));

    if (base.length === 0) {
      const canales = (estrategia.canales_principales || []).filter((c) => PLATAFORMA_COLOR[c]);
      base = canales.length > 0
        ? canales.map((c) => ({ plataforma: c, peso: 1 }))
        : [{ plataforma: 'Facebook', peso: 1 }, { plataforma: 'Instagram', peso: 1 }];
    }

    const suma = base.reduce((acc, b) => acc + b.peso, 0) || 1;
    return base.map((b) => {
      const fraccion = b.peso / suma;
      const monto = montoDigital * fraccion;
      return {
        plataforma: b.plataforma,
        fraccion,
        monto,
        diario: monto / 30,
      };
    });
  }, [heat.plataformas, heat.pesos, estrategia.canales_principales, montoDigital]);

  const margen = margenBase(estrategia);
  const precio = Number.isFinite(estrategia.precio_sugerido) ? estrategia.precio_sugerido : 0;

  const textoPlan = useMemo(() => {
    const lineas: string[] = [
      `PLAN DE INVERSIÓN — Estrategia ${estrategia.nombre}`,
      `Presupuesto mensual: ${formatMXN(presupuesto)} · Mezcla: ${mezcla.label}`,
      '',
      `Pauta en redes: ${formatMXN(montoDigital)}`,
      ...repartoDigital.map((r) => `  · ${r.plataforma}: ${formatMXN(r.monto)} (${formatMXN(r.diario)}/día)`),
      '',
      `Publicidad física: ${formatMXN(montoFisica)}`,
      `Producción de contenido: ${formatMXN(montoProduccion)}`,
    ];
    if (heat.mejorBanda && heat.mejorDia) {
      lineas.push('', `Mejor franja del calendario: ${heat.mejorBanda.label} (${heat.mejorBanda.rango} h)`, `Día con más carga: ${heat.mejorDia.largo}`);
    }
    return lineas.join('\n');
  }, [estrategia.nombre, presupuesto, mezcla.label, montoDigital, montoFisica, montoProduccion, repartoDigital, heat.mejorBanda, heat.mejorDia]);

  const copiarPlan = () => {
    navigator.clipboard.writeText(textoPlan).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      },
      () => setCopiado(false)
    );
  };

  const sliderMin = Math.max(500, Math.round((presupuestoBase * 0.3) / 500) * 500);
  const sliderMax = Math.max(sliderMin + 500, Math.round((presupuestoBase * 3) / 500) * 500);

  return (
    <section className="reveal relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0F17]">
      <div className="p-6 sm:p-8 space-y-10">

        {/* ── Encabezado ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="w-1 h-5 rounded-full bg-marketing block" />
              <h2 className="text-xl font-bold text-white tracking-tight">Inversión, Horarios y Promociones</h2>
            </div>
            <p className="text-[13px] text-white/45 ml-4">
              Distribución estratégica de presupuesto por canal, franjas horarias óptimas y descuentos recomendados.
            </p>
          </div>
          <button
            type="button"
            onClick={copiarPlan}
            data-print="hide"
            className="text-[11px] font-semibold uppercase tracking-wider border border-white/[0.08] bg-white/[0.03] text-white/60 px-3 py-1.5 rounded-lg hover:border-white/20 hover:text-white transition self-start sm:self-auto focus:outline-none"
          >
            {copiado ? 'Copiado' : 'Copiar plan'}
          </button>
        </div>

        {/* ── A. Heatmap de horarios ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-[15px] font-black text-white flex items-center gap-2">
              Mapa de calor de horarios
            </h3>
            <p className="text-[12px] text-white/40 mt-0.5">
              Las {heat.total} publicaciones del calendario, cruzadas por día y franja horaria. El color es la red que domina esa casilla.
            </p>
          </div>

          {heat.total === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
              <p className="text-[13px] text-white/50">
                Aún no hay publicaciones con horario para dibujar el mapa. Se llena en cuanto el calendario tenga horas asignadas.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-marketing/20 bg-marketing/5 p-4">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Mejor franja</p>
                  <p className="text-[15px] font-black text-marketing leading-tight">
                    {heat.mejorBanda ? `${heat.mejorBanda.label} · ${heat.mejorBanda.rango} h` : '—'}
                  </p>
                  <p className="text-[11px] text-white/40 mt-1">{heat.mejorBandaTotal} publicaciones concentradas ahí</p>
                </div>
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Día más cargado</p>
                  <p className="text-[15px] font-black text-cyan-400 leading-tight">{heat.mejorDia ? heat.mejorDia.largo : '—'}</p>
                  <p className="text-[11px] text-white/40 mt-1">{heat.mejorDiaTotal} publicaciones en el plan</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Cadencia</p>
                  <p className="text-[15px] font-black text-emerald-400 leading-tight font-mono">
                    {(heat.total / 14).toFixed(1)} / día
                  </p>
                  <p className="text-[11px] text-white/40 mt-1">Promedio sobre las 2 semanas</p>
                </div>
              </div>

              {/* Leyenda de plataformas */}
              <div className="flex flex-wrap items-center gap-2">
                {heat.plataformas.map((p) => (
                  <div key={p} className="flex items-center gap-1.5">
                    <PlatformBadge plataforma={p} size="sm" />
                    <span className="text-[11px] text-white/50 font-mono bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                      {heat.pesos[p]} {heat.pesos[p] === 1 ? 'post' : 'posts'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full min-w-[620px] border-separate border-spacing-1">
                  <caption className="sr-only">
                    Número de publicaciones por día de la semana y franja horaria
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="text-left text-[10px] font-black text-white/30 uppercase tracking-widest pb-1 pl-1 w-[130px]">
                        Franja
                      </th>
                      {DIAS.map((d) => (
                        <th key={d.key} scope="col" className="text-[10px] font-black text-white/40 uppercase tracking-widest pb-1">
                          <span aria-hidden="true">{d.corto}</span>
                          <span className="sr-only">{d.largo}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heat.bandasVisibles.map((b) => (
                      <tr key={b.key}>
                        <th scope="row" className="text-left align-middle pr-2">
                          <span className="block text-[12px] font-bold text-white/70 leading-tight">{b.label}</span>
                          <span className="block text-[10px] font-mono text-white/30">{b.rango} h</span>
                        </th>
                        {DIAS.map((d) => {
                          const celda = heat.mapa[d.key][b.key];
                          if (celda.total === 0) {
                            return (
                              <td key={d.key} className="p-0.5 align-middle">
                                <div className="h-11 rounded-lg border border-dashed border-white/8 bg-white/[0.015]" aria-hidden="true" />
                                <span className="sr-only">{d.largo}, {b.label}: sin publicaciones</span>
                              </td>
                            );
                          }
                          const ordenadas = Object.keys(celda.plataformas).sort(
                            (x, y) => celda.plataformas[y] - celda.plataformas[x]
                          );
                          const dominante = metaDe(ordenadas[0]);
                          const alpha = 0.14 + 0.5 * (heat.max > 0 ? celda.total / heat.max : 0);
                          return (
                            <td key={d.key} className="p-0.5 align-middle">
                              <div
                                className="h-11 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-transform hover:scale-[1.06]"
                                style={{
                                  backgroundColor: hexToRgba(dominante.color, alpha),
                                  borderColor: hexToRgba(dominante.color, 0.4),
                                  boxShadow: `0 0 14px ${hexToRgba(dominante.color, 0.18)}`,
                                }}
                                title={`${d.largo} ${b.rango} h — ${celda.horas.join(', ')} · ${ordenadas.join(', ')}`}
                              >
                                <div className="flex items-center justify-center gap-1" aria-hidden="true">
                                  {ordenadas.slice(0, 2).map((p) => (
                                    <span
                                      key={p}
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: metaDe(p).color }}
                                    />
                                  ))}
                                </div>
                                <span className="text-[9px] font-black text-white/80 leading-none font-mono">{celda.total}</span>
                              </div>
                              <span className="sr-only">
                                {d.largo}, {b.label}: {celda.total} publicaciones en {ordenadas.join(', ')}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {heat.omitidos > 0 && (
                <p className="text-[11px] text-amber-300/80 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2">
                  Aviso: {heat.omitidos} {heat.omitidos === 1 ? 'publicación no tiene horario' : 'publicaciones no tienen horario'} y quedan fuera del mapa (contenido no incluido en el plan actual).
                </p>
              )}
            </>
          )}

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              'Publica siempre entre 30 y 60 minutos antes del pico: el algoritmo necesita tiempo para repartir el alcance inicial.',
              'Concentra tus mejores piezas en las casillas más oscuras del mapa y usa las claras para contenido de mantenimiento.',
              'Después de dos semanas compara este mapa con tus estadísticas reales y mueve los horarios que no rindieron.',
              'Si solo puedes publicar una vez al día, hazlo en la franja marcada como mejor y deja el resto en descanso.',
            ].map((tip) => (
              <li key={tip} className="text-[12.5px] text-white/60 leading-relaxed bg-white/[0.02] border border-white/8 rounded-xl px-3 py-2.5 flex gap-2">
                <span className="text-marketing flex-shrink-0" aria-hidden="true">▸</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* ── B. Presupuesto ─────────────────────────────────────────────────── */}
        <div className="space-y-4 pt-8 border-t border-white/8">
          <div>
            <h3 className="text-[15px] font-black text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Cómo repartir el presupuesto</span>
            </h3>
            <p className="text-[12px] text-white/40 mt-0.5">
              Punto de partida: {formatMXN(presupuestoBase)} al mes, el presupuesto sugerido para la estrategia {estrategia.nombre}. Mueve el control para ver tu caso.
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/30 p-5 space-y-5" data-print="hide">
            <div>
              <div className="flex items-end justify-between gap-3 mb-2">
                <label htmlFor="presupuesto-marketing" className="text-[11px] font-black text-white/40 uppercase tracking-widest">
                  Presupuesto mensual
                </label>
                <output htmlFor="presupuesto-marketing" className="text-2xl font-black font-mono text-white leading-none">
                  {formatMXN(presupuesto)}
                  <span className="text-[11px] text-white/30 font-bold ml-1">MXN</span>
                </output>
              </div>
              <input
                id="presupuesto-marketing"
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={500}
                value={presupuesto}
                onChange={(e) => setPresupuesto(Number(e.target.value))}
                className="w-full accent-[#8B5CF6] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-white/25 mt-1">
                <span>{formatMXN(sliderMin)}</span>
                <span>{formatMXN(sliderMax)}</span>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Shuffle className="w-3.5 h-3.5 text-marketing" />
                <span>Mezcla de canales</span>
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Mezcla de canales">
                {MEZCLAS.map((m) => {
                  const activa = m.key === mezclaKey;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      aria-pressed={activa}
                      onClick={() => setMezclaKey(m.key)}
                      className={`text-[12px] font-bold px-4 py-2 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-marketing/60 ${
                        activa
                          ? 'bg-marketing/15 border-marketing/40 text-white shadow-[0_0_18px_rgba(139,92,246,0.25)]'
                          : 'bg-white/5 border-white/8 text-white/40 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] text-white/50 leading-relaxed mt-2.5">{mezcla.cuando}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: 'Pauta en redes',
                monto: montoDigital,
                pct: mezcla.digital,
                icon: (
                  <svg className="w-5 h-5 text-marketing" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                  </svg>
                ),
                border: 'border-marketing/25',
                bg: 'bg-marketing/8',
                text: 'text-marketing',
              },
              {
                label: 'Publicidad física',
                monto: montoFisica,
                pct: mezcla.fisica,
                icon: (
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                ),
                border: 'border-amber-500/25',
                bg: 'bg-amber-500/8',
                text: 'text-amber-400',
              },
              {
                label: 'Producción de contenido',
                monto: montoProduccion,
                pct: mezcla.produccion,
                icon: (
                  <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                ),
                border: 'border-cyan-500/25',
                bg: 'bg-cyan-500/8',
                text: 'text-cyan-400',
              },
            ].map((c) => (
              <div key={c.label} className={`rounded-2xl border p-5 ${c.border} ${c.bg}`}>
                <div className="flex items-center justify-between mb-2">
                  <span>{c.icon}</span>
                  <span className="text-[10px] font-black text-white/40 font-mono">{Math.round(c.pct * 100)}%</span>
                </div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">{c.label}</p>
                <p className={`text-xl font-black font-mono ${c.text} leading-none`}>{formatMXN(c.monto)}</p>
                <p className="text-[11px] text-white/35 mt-1.5 font-mono">{formatMXN(c.monto / 30)} al día</p>
              </div>
            ))}
          </div>

          {/* Reparto por red social */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 space-y-3">
            <p className="text-[11px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-marketing" />
              <span>Pauta por red · según el peso de cada una en tu calendario</span>
            </p>
            {repartoDigital.map((r) => {
              const meta = metaDe(r.plataforma);
              const bajo = r.diario < 60;
              return (
                <div key={r.plataforma} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <PlatformBadge plataforma={r.plataforma} size="sm" />
                    <span className="text-[13px] font-black font-mono" style={{ color: meta.color }}>
                      {formatMXN(r.monto)}
                      <span className="text-white/30 text-[11px] ml-1.5 font-normal">({formatMXN(r.diario)}/día)</span>
                    </span>
                  </div>
                  <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.round(r.fraccion * 100)}%`, backgroundColor: meta.color }}
                    />
                  </div>
                  {bajo && (
                    <p className="text-[11px] text-amber-300/80 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Menos de {formatMXN(60)} diarios rinden muy poco: concentra el gasto en una sola red hasta que puedas subirlo.</span>
                    </p>
                  )}
                </div>
              );
            })}
            <p className="text-[11px] text-white/35 leading-relaxed pt-1">
              Los porcentajes salen de cuántas publicaciones tiene cada red en tus 2 semanas, no de una regla fija: si cambias el calendario, cambia el reparto.
            </p>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              'No reparta la pauta en más de dos redes al arrancar: mejor dominar una que aparecer poco en cuatro.',
              'Deja el 20% de la pauta para lo que ya funcionó: cuando una publicación orgánica despega, promociónala.',
              'Fija un tope diario en el gestor de anuncios, no solo mensual: evita que un fin de semana se coma el mes.',
              'Mide costo por conversación o por venta, no por like. Si un lead te cuesta más que tu margen, apaga y ajusta.',
            ].map((tip) => (
              <li key={tip} className="text-[12.5px] text-white/60 leading-relaxed bg-white/[0.02] border border-white/8 rounded-xl px-3 py-2.5 flex gap-2">
                <span className="text-marketing flex-shrink-0" aria-hidden="true">▸</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* ── C. Publicidad física ───────────────────────────────────────────── */}
        <div className="space-y-4 pt-8 border-t border-white/8">
          <div>
            <h3 className="text-[15px] font-black text-white flex items-center gap-2">Publicidad fuera de internet</h3>
            <p className="text-[12px] text-white/40 mt-0.5">
              Con {formatMXN(montoFisica)} al mes en este bloque, esto es lo que alcanza. Los rangos son de referencia en México: pide siempre cotización local.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MEDIOS_FISICOS.map((m, idx) => {
              const piezas = m.min > 0 ? Math.floor(montoFisica / m.min) : 0;
              return (
                <div key={m.nombre} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 flex flex-col gap-2 hover:border-amber-500/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <span className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 text-xs font-bold font-mono">
                      {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </span>
                    {piezas >= 1 ? (
                      <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/12 border border-emerald-500/25 px-2 py-1 rounded-lg whitespace-nowrap">
                        alcanza para {piezas}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-white/35 bg-white/5 border border-white/10 px-2 py-1 rounded-lg whitespace-nowrap">
                        fuera de rango
                      </span>
                    )}
                  </div>
                  <p className="text-[13.5px] font-black text-white leading-tight">{m.nombre}</p>
                  <p className="text-[12px] font-mono font-bold text-amber-400">
                    {formatMXN(m.min)} – {formatMXN(m.max)}
                    <span className="text-white/30 font-sans font-normal ml-1.5">{m.unidad}</span>
                  </p>
                  <p className="text-[12px] text-white/50 leading-relaxed border-t border-white/5 pt-2 mt-auto">{m.tip}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
            <p className="text-[11px] font-black text-amber-300/80 uppercase tracking-widest mb-2">Antes de imprimir nada</p>
            <ul className="space-y-1.5">
              {[
                'Todo medio físico necesita una forma de medirse: un QR distinto por lona, un cupón por volante o un número de WhatsApp exclusivo.',
                'Pide permiso por escrito al dueño del muro o local y revisa el reglamento de anuncios de tu municipio: la multa suele costar más que la lona.',
                'Una lona bien puesta en la esquina correcta vence a un espectacular lejano. La ubicación pesa más que el tamaño.',
                'Manda a imprimir una sola pieza de prueba antes del tiraje completo: los errores de teléfono son la falla más común y la más cara.',
              ].map((t) => (
                <li key={t} className="text-[12.5px] text-white/65 leading-relaxed flex gap-2">
                  <span className="text-amber-400 flex-shrink-0" aria-hidden="true">▸</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── D. Promociones ─────────────────────────────────────────────────── */}
        <div className="space-y-4 pt-8 border-t border-white/8">
          <div>
            <h3 className="text-[15px] font-black text-white flex items-center gap-2">Ideas de promoción con su costo real</h3>
            <p className="text-[12px] text-white/40 mt-0.5">
              Calculado sobre tu precio sugerido de {formatMXN(precio)}
              {margen !== null ? ` y un margen de ${Math.round(margen)}%.` : '. Sin dato de margen no se puede validar si la oferta se sostiene.'}
            </p>
          </div>

          {margen === null && (
            <p className="text-[12px] text-amber-300/80 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2">
              Este análisis no trae margen estimado, así que abajo solo ves el precio resultante. Resta tu costo real por unidad antes de lanzar cualquier descuento.
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {PROMOS.map((p) => {
              const precioEfectivo = precio * (1 - p.descuento / 100);
              const ticket = precioEfectivo * p.unidades;
              const margenFinal = margenTrasDescuento(margen, p.descuento);
              const veredicto = margenFinal === null
                ? { label: 'Sin dato de margen', clase: 'text-white/40 bg-white/5 border-white/10' }
                : margenFinal < 0
                  ? { label: 'Pierdes dinero', clase: 'text-rose-300 bg-rose-500/12 border-rose-500/30' }
                  : margenFinal < 15
                    ? { label: 'Margen apretado', clase: 'text-amber-300 bg-amber-500/12 border-amber-500/30' }
                    : { label: 'Sostenible', clase: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30' };

              return (
                <div key={p.nombre} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 flex flex-col gap-3 hover:border-marketing/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-marketing/10 border border-marketing/20 text-marketing flex-shrink-0">
                        -{p.descuento}%
                      </span>
                      <p className="text-[14px] font-black text-white leading-tight">{p.nombre}</p>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border whitespace-nowrap ${veredicto.clase}`}>
                      {veredicto.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-black/30 border border-white/5 p-2.5">
                      <p className="text-[9px] font-black text-white/35 uppercase tracking-widest mb-0.5">Precio/unidad</p>
                      <p className="text-[13px] font-black font-mono text-white leading-none">{formatMXN(precioEfectivo)}</p>
                    </div>
                    <div className="rounded-xl bg-black/30 border border-white/5 p-2.5">
                      <p className="text-[9px] font-black text-white/35 uppercase tracking-widest mb-0.5">Ticket ({p.unidades}u)</p>
                      <p className="text-[13px] font-black font-mono text-cyan-400 leading-none">{formatMXN(ticket)}</p>
                    </div>
                    <div className="rounded-xl bg-black/30 border border-white/5 p-2.5">
                      <p className="text-[9px] font-black text-white/35 uppercase tracking-widest mb-0.5">Margen final</p>
                      <p className={`text-[13px] font-black font-mono leading-none ${
                        margenFinal === null ? 'text-white/30' : margenFinal < 0 ? 'text-rose-400' : margenFinal < 15 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {margenFinal === null ? '—' : `${Math.round(margenFinal)}%`}
                      </p>
                    </div>
                  </div>

                  <p className="text-[12.5px] text-white/60 leading-relaxed">{p.mecanica}</p>
                  <p className="text-[12px] text-white/45 leading-relaxed border-t border-white/5 pt-2.5 mt-auto">
                    <span className="font-bold text-white/60">Cuándo usarla: </span>{p.cuando}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-white/35 leading-relaxed">
            El margen final no baja los mismos puntos que el descuento: tu costo por unidad no se mueve, así que un 50% de descuento sobre un margen del 40% te deja vendiendo por debajo del costo. Toda promoción necesita fecha de inicio y de fin, o se convierte en tu precio nuevo.
          </p>
        </div>

      </div>
    </section>
  );
}