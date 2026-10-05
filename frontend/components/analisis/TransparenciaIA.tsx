import { useId } from 'react';
import Link from 'next/link';

/**
 * Lo que un consultor serio dice además de la respuesta: cuánta confianza
 * tiene, qué supuso y qué dato le faltó. Espejo del contrato común del backend
 * (`services/ia/contratoComun.ts`); los análisis antiguos no lo traen y no se
 * muestra nada.
 */

export type NivelConfianza = 'alto' | 'medio' | 'bajo';

export interface Transparencia {
  supuestos: string[];
  informacion_faltante: { dato: string; por_que_importa: string }[];
  nivel_confianza: NivelConfianza;
  motivo_confianza: string;
}

const CONFIANZA: Record<NivelConfianza, { etiqueta: string; clase: string }> = {
  alto: { etiqueta: 'Confianza alta', clase: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' },
  medio: { etiqueta: 'Confianza media', clase: 'bg-amber-500/10 border-amber-500/25 text-amber-300' },
  bajo: { etiqueta: 'Confianza baja', clase: 'bg-rose-500/10 border-rose-500/25 text-rose-300' },
};

export function BadgeConfianza({ nivel }: { nivel?: NivelConfianza }) {
  const c = CONFIANZA[nivel ?? 'medio'] ?? CONFIANZA.medio;
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.clase}`}>
      {c.etiqueta}
    </span>
  );
}

export default function TransparenciaIA({
  transparencia,
  hrefCompletar,
}: {
  transparencia?: Transparencia | null;
  /** Dónde completar los datos que faltan (el formulario del módulo). */
  hrefCompletar?: string;
}) {
  // Puede haber dos en la misma página (el brief y el logo): id único por instancia.
  const idTitulo = useId();
  if (!transparencia) return null;
  const supuestos = transparencia.supuestos ?? [];
  const faltante = transparencia.informacion_faltante ?? [];

  return (
    <section
      aria-labelledby={idTitulo}
      className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={idTitulo} className="text-sm font-bold text-white">
          Qué tan confiable es este análisis
        </h2>
        <BadgeConfianza nivel={transparencia.nivel_confianza} />
      </div>
      {transparencia.motivo_confianza && (
        <p className="text-xs text-white/55 leading-relaxed">{transparencia.motivo_confianza}</p>
      )}

      {(supuestos.length > 0 || faltante.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {supuestos.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/40 mb-2">Lo que asumimos</h3>
              <ul className="space-y-1.5">
                {supuestos.map((s, i) => (
                  <li key={i} className="text-xs text-white/65 leading-relaxed flex gap-2">
                    <span aria-hidden="true" className="text-white/25">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {faltante.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/40 mb-2">
                Datos que mejorarían el resultado
              </h3>
              <ul className="space-y-2">
                {faltante.map((f, i) => (
                  <li key={i} className="text-xs leading-relaxed">
                    <span className="text-white/80 font-medium">{f.dato}</span>
                    {f.por_que_importa && <span className="block text-white/45">{f.por_que_importa}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {faltante.length > 0 && hrefCompletar && (
        <Link
          href={hrefCompletar}
          className="no-print inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/5 transition-colors"
        >
          Completar datos y repetir el análisis →
        </Link>
      )}
    </section>
  );
}
