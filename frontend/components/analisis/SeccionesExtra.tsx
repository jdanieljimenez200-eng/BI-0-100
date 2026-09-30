import { BadgeConfianza, type NivelConfianza } from './TransparenciaIA';

/**
 * Secciones que el equipo añade a un módulo desde el panel de prompts, sin
 * deploy. Todas comparten esta tarjeta genérica: título, resumen y puntos.
 */

export interface SeccionExtra {
  slug: string;
  titulo: string;
  resumen: string;
  puntos: string[];
  nivel_confianza?: NivelConfianza;
}

export default function SeccionesExtra({ secciones }: { secciones?: SeccionExtra[] | null }) {
  if (!secciones?.length) return null;
  return (
    <div className="space-y-3">
      {secciones.map((s) => (
        <section
          key={s.slug}
          aria-labelledby={`seccion-extra-${s.slug}`}
          className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`seccion-extra-${s.slug}`} className="text-sm font-bold text-white">
              {s.titulo}
            </h2>
            {s.nivel_confianza && <BadgeConfianza nivel={s.nivel_confianza} />}
          </div>
          <p className="text-xs text-white/60 leading-relaxed">{s.resumen}</p>
          {s.puntos?.length > 0 && (
            <ul className="space-y-1.5">
              {s.puntos.map((p, i) => (
                <li key={i} className="text-xs text-white/70 leading-relaxed flex gap-2">
                  <span aria-hidden="true" className="text-white/25">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
