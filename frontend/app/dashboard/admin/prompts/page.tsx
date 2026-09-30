'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { listarPrompts, type ClavePrompt } from '@/lib/admin';

/**
 * Prompts de IA: qué versión usa cada módulo y cada ficha de país.
 *
 * Cada análisis ancla la versión con la que empezó, así que publicar aquí no
 * afecta a nadie que esté a mitad de un análisis. El formato de salida y las
 * reglas de seguridad no se editan: viven en el código.
 */

const EN_USO: Record<ClavePrompt['en_uso'], { texto: string; clase: string }> = {
  publicada: { texto: 'Publicada', clase: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  repositorio: { texto: 'Texto del código', clase: 'text-white/60 bg-white/5 border-white/10' },
  sin_texto: { texto: 'Sin ficha', clase: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
};

function Estado({ c }: { c: ClavePrompt }) {
  const e = EN_USO[c.en_uso];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${e.clase}`}>
      {e.texto}
      {c.publicada ? ` · v${c.publicada.version}` : ''}
    </span>
  );
}

function Fila({ c }: { c: ClavePrompt }) {
  return (
    <Link
      href={`/dashboard/admin/prompts/${encodeURIComponent(c.clave)}`}
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white/85">{c.titulo}</p>
        <p className="text-[11px] text-white/35 font-mono">{c.clave}</p>
      </div>
      <div className="flex items-center gap-2">
        {c.borrador && (
          <span className="inline-flex items-center rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
            Borrador v{c.borrador.version}
          </span>
        )}
        <Estado c={c} />
        <span aria-hidden="true" className="text-white/30">→</span>
      </div>
    </Link>
  );
}

export default function PromptsIAPage() {
  const router = useRouter();
  const [claves, setClaves] = useState<ClavePrompt[] | null>(null);
  const [hayClaveIA, setHayClaveIA] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await listarPrompts();
      setClaves(data.claves);
      setHayClaveIA(data.hay_clave_anthropic);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        router.push('/dashboard/admin');
        return;
      }
      setError('No se pudieron cargar los prompts.');
    }
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const modos = (claves ?? []).filter((c) => c.tipo === 'modo');
  const fichas = (claves ?? []).filter((c) => c.tipo === 'ficha_pais');

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <Link href="/dashboard/admin" className="text-white/40 hover:text-white text-xs font-semibold">
        ← Centro de Control
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight mb-1">Prompts de IA</h1>
        <p className="text-white/45 text-sm max-w-3xl leading-relaxed">
          El criterio experto de cada módulo y las fichas de país. Crea un borrador, pruébalo con un caso, publícalo y,
          si algo sale mal, restaura la versión anterior. Un análisis en curso termina con la versión con la que empezó.
          El formato de los resultados y las reglas de seguridad están en el código y no se editan aquí.
        </p>
      </div>

      {!hayClaveIA && (
        <p className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/80">
          Este servidor no tiene clave de IA: «Probar» devuelve el resultado de plantilla y no usa el prompt.
        </p>
      )}
      {error && <p className="text-rose-300 text-sm mb-4">{error}</p>}
      {!claves && !error && <p className="text-white/40 text-sm">Cargando…</p>}

      {claves && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] overflow-hidden">
            <h2 className="px-4 pt-4 pb-2 text-sm font-bold">Modos de comportamiento</h2>
            <div className="divide-y divide-white/[0.05]">
              {modos.map((c) => (
                <Fila key={c.clave} c={c} />
              ))}
            </div>
            <p className="px-4 py-3 text-[11px] text-white/35 border-t border-white/[0.05]">
              Por ahora solo Legal usa prompts versionados. Los demás módulos se migran uno por uno.
            </p>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] overflow-hidden">
            <h2 className="px-4 pt-4 pb-1 text-sm font-bold">Fichas de país · Legal</h2>
            <p className="px-4 pb-2 text-[11px] text-white/40">
              Un país «Sin ficha» se analiza con reglas de prudencia y confianza baja. Escribir su ficha lo corrige sin deploy.
            </p>
            <div className="divide-y divide-white/[0.05]">
              {fichas.map((c) => (
                <Fila key={c.clave} c={c} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
