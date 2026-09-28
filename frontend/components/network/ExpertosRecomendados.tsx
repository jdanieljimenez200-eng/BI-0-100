'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ExpertoCard, { ACENTO } from '@/components/network/ExpertoCard';
import { listarExpertos, type CategoriaExperto, type ExpertoPublico } from '@/lib/network';

export type { CategoriaExperto };

const CONFIG: Record<CategoriaExperto, { titulo: string; subtitulo: string }> = {
  legal: {
    titulo: 'Expertos legales para tu negocio',
    subtitulo:
      'Abogados y despachos que trabajan los puntos que salieron en tu análisis. Los contactas y acuerdas directamente con ellos.',
  },
  marketing: {
    titulo: 'Agencias y consultores de marketing',
    subtitulo:
      'Especialistas en ejecutar estrategias como las de tu análisis. Los contactas y acuerdas directamente con ellos.',
  },
  ventas: {
    titulo: 'Canales de venta para tu industria',
    subtitulo:
      'Distribuidores y fabricantes de tu rubro. Los contactas y acuerdas directamente con ellos.',
  },
  contabilidad: {
    titulo: 'Contadores y asesores fiscales',
    subtitulo:
      'Para aterrizar los números de tu análisis: régimen, facturación y obligaciones. Los contactas directamente.',
  },
  diseno: {
    titulo: 'Diseñadores y estudios de marca',
    subtitulo: 'Logotipo, empaque e identidad visual para tu producto. Los contactas directamente.',
  },
  proveedores: {
    titulo: 'Proveedores y fabricantes',
    subtitulo: 'Materia prima, maquila y empaque para producir lo que validaste. Los contactas directamente.',
  },
  tecnologia: {
    titulo: 'Desarrollo y tecnología',
    subtitulo: 'Tienda en línea, sistemas y automatización para operar tu negocio. Los contactas directamente.',
  },
};

/**
 * Expertos de la red, dentro del resultado de un análisis.
 *
 * Muestra únicamente expertos **reales y aprobados**, en el orden que manda el
 * backend: los patrocinados primero, siempre etiquetados como tales.
 *
 * Si no hay ninguno aprobado en esa categoría, la sección no se pinta. Un
 * apartado de "expertos recomendados" vacío promete algo que no existe, y es
 * exactamente el hueco que antes se rellenaba con despachos inventados.
 */
export default function ExpertosRecomendados({
  categoria,
  ciudad,
}: {
  categoria: CategoriaExperto;
  /** Ciudad del negocio analizado: activa los impulsos de esa ciudad. */
  ciudad?: string | null;
}) {
  const [expertos, setExpertos] = useState<ExpertoPublico[] | null>(null);
  const cfg = CONFIG[categoria];
  const acento = ACENTO[categoria];

  useEffect(() => {
    let vigente = true;
    // Sin filtrar por ciudad los orgánicos: en una ciudad pequeña dejaría la
    // sección vacía. La ciudad solo decide qué impulsos entran.
    listarExpertos({ categoria, limite: 6, ...(ciudad ? { ciudad } : {}) })
      .then(async (d) => {
        let organicos = d.expertos;
        if (ciudad) organicos = (await listarExpertos({ categoria, limite: 6 })).expertos;
        const promo = d.promocionados ?? [];
        const ids = new Set(promo.map((e) => e.id));
        if (vigente) setExpertos([...promo, ...organicos.filter((e) => !ids.has(e.id))].slice(0, 6));
      })
      .catch(() => {
        // Si la red no responde, la sección simplemente no aparece. No hay nada
        // útil que decirle aquí a alguien que vino a leer su análisis.
        if (vigente) setExpertos([]);
      });
    return () => {
      vigente = false;
    };
  }, [categoria, ciudad]);

  // `null` = todavía cargando. No se reserva hueco ni se pinta un esqueleto:
  // hasta saber si hay expertos, no se anuncia una sección que puede no existir.
  if (expertos === null || expertos.length === 0) return null;

  return (
    <section className="mt-10 no-print">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${acento.bg} border ${acento.borde}`}>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${acento.texto}`}>
            0 a 100 Network
          </span>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="mb-5">
        <h3 className="text-white font-extrabold text-xl leading-tight mb-1">{cfg.titulo}</h3>
        <p className="text-white/40 text-sm max-w-xl">{cfg.subtitulo}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {expertos.map((experto) => (
          <ExpertoCard key={experto.id} experto={experto} />
        ))}
      </div>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link
          href={`/dashboard/net0?categoria=${categoria}`}
          className="text-white/50 hover:text-white text-xs font-semibold transition-colors"
        >
          Ver el directorio Net0 completo →
        </Link>
        <Link
          href="/dashboard/net0/registro"
          className="text-white/30 hover:text-white/60 text-xs transition-colors"
        >
          ¿Eres experto en este rubro? Preséntate en Net0
        </Link>
      </div>
    </section>
  );
}
