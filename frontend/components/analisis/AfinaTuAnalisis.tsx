'use client';

import { useId, useState } from 'react';
import {
  OPCIONES,
  SECTORES_REGULADOS,
  monedaDePais,
  preguntasRespondidas,
  type PerfilNegocio,
  type SectorRegulado,
} from '@/lib/perfilNegocio';

/**
 * «Afina tu análisis»: preguntas opcionales sobre el negocio que cambian el
 * resultado de la IA. Plegado por defecto para no alargar el formulario; lo
 * contestado se guarda en el producto y lo reutilizan los demás módulos.
 */

const inputCls =
  'w-full bg-white/5 border border-white/10 text-white placeholder-white/25 rounded-xl px-3.5 py-2.5 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/25 transition';

function Opciones<T extends string>({
  nombre,
  opciones,
  valor,
  onChange,
}: {
  nombre: string;
  opciones: readonly { value: T; label: string }[];
  valor?: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={nombre} className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const activo = valor === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={activo}
            // Volver a pulsar la opción elegida la deja sin responder.
            onClick={() => onChange(activo ? null : o.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              activo
                ? 'bg-white/10 border-white/30 text-white'
                : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Pregunta({ titulo, porque, children }: { titulo: string; porque: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-white/75">{titulo}</p>
      <p className="text-[11px] text-white/35 mt-0.5 mb-2 leading-snug">{porque}</p>
      {children}
    </div>
  );
}

export default function AfinaTuAnalisis({
  perfil,
  onChange,
  pais,
}: {
  perfil: PerfilNegocio;
  onChange: (perfil: PerfilNegocio) => void;
  pais?: string | null;
}) {
  const respondidas = preguntasRespondidas(perfil);
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const moneda = monedaDePais(pais);
  const set = <K extends keyof PerfilNegocio>(campo: K, valor: PerfilNegocio[K]) => onChange({ ...perfil, [campo]: valor });

  const alternarSector = (s: SectorRegulado) => {
    const actuales = perfil.sectores_regulados ?? [];
    if (s === 'ninguno') return set('sectores_regulados', actuales.includes('ninguno') ? null : ['ninguno']);
    const sinNinguno = actuales.filter((x) => x !== 'ninguno');
    const nuevos = sinNinguno.includes(s) ? sinNinguno.filter((x) => x !== s) : [...sinNinguno, s];
    set('sectores_regulados', nuevos.length ? nuevos : null);
  };

  return (
    <div className="bg-[#1C1C1E] rounded-2xl border border-white/[0.08] overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={idPanel}
        className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div>
          <h2 className="text-sm font-bold text-white">Afina tu análisis</h2>
          <p className="text-[11px] text-white/40 mt-0.5">
            Opcional · 8 preguntas que cambian el resultado. Si no las respondes, el análisis lo dice y trabaja con supuestos.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] tabular-nums text-white/40">{respondidas}/8</span>
          <svg
            className={`w-4 h-4 text-white/40 transition-transform ${abierto ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {abierto && (
        <div id={idPanel} className="px-6 pb-6 pt-2 space-y-5 border-t border-white/[0.06]">
          <Pregunta
            titulo="¿Ya estás dado de alta ante la autoridad fiscal?"
            porque="Si falta el alta, regularizarla va antes que cualquier otro trámite."
          >
            <Opciones
              nombre="Situación fiscal"
              opciones={OPCIONES.situacion_fiscal}
              valor={perfil.situacion_fiscal}
              onChange={(v) => set('situacion_fiscal', v)}
            />
          </Pregunta>

          <Pregunta titulo="¿En qué régimen fiscal estás?" porque="Define qué declaraciones y comprobantes te tocan.">
            <input
              type="text"
              value={perfil.regimen_actual ?? ''}
              maxLength={120}
              onChange={(e) => set('regimen_actual', e.target.value || null)}
              placeholder="Ej.: RESICO, Régimen simple, Monotributo… o «no lo sé»"
              className={inputCls}
            />
          </Pregunta>

          <Pregunta
            titulo={`Ingresos anuales aproximados${moneda ? ` (${moneda})` : ''}`}
            porque="Los regímenes simplificados tienen topes; pasarlos cambia tus obligaciones."
          >
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={perfil.ingresos_anuales ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                set('ingresos_anuales', n !== null && Number.isFinite(n) && n >= 0 ? n : null);
              }}
              placeholder="Una estimación basta"
              className={inputCls}
            />
          </Pregunta>

          <Pregunta
            titulo="¿Dónde operas?"
            porque="Un local suele exigir licencia de funcionamiento, uso de suelo y revisión de seguridad."
          >
            <Opciones
              nombre="Local físico"
              opciones={OPCIONES.local_fisico}
              valor={perfil.local_fisico}
              onChange={(v) => set('local_fisico', v)}
            />
          </Pregunta>

          <Pregunta
            titulo="¿Tu giro pertenece a alguno de estos sectores?"
            porque="Los sectores regulados necesitan permisos adicionales (sanitarios, licencias especiales)."
          >
            <div className="flex flex-wrap gap-2">
              {SECTORES_REGULADOS.map((s) => {
                const activo = perfil.sectores_regulados?.includes(s.value) ?? false;
                return (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => alternarSector(s.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activo
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </Pregunta>

          <Pregunta
            titulo="¿Manejas datos sensibles de tus clientes?"
            porque="Salud, datos biométricos o financieros tienen reglas de protección más estrictas."
          >
            <Opciones
              nombre="Datos sensibles"
              opciones={[
                { value: 'si', label: 'Sí' },
                { value: 'no', label: 'No' },
              ]}
              valor={perfil.datos_sensibles == null ? null : perfil.datos_sensibles ? 'si' : 'no'}
              onChange={(v) => set('datos_sensibles', v === null ? null : v === 'si')}
            />
          </Pregunta>

          <Pregunta
            titulo="¿A quién le vendes?"
            porque="Vender a empresas o a gobierno exige comprobantes fiscales y, a veces, registro como proveedor."
          >
            <Opciones
              nombre="Tipo de clientes"
              opciones={OPCIONES.tipo_clientes}
              valor={perfil.tipo_clientes}
              onChange={(v) => set('tipo_clientes', v)}
            />
          </Pregunta>

          <Pregunta
            titulo="¿Tu marca está registrada?"
            porque="Sin registro podrías tener que cambiar de nombre si otra empresa ya lo tiene."
          >
            <Opciones nombre="Marca" opciones={OPCIONES.marca} valor={perfil.marca} onChange={(v) => set('marca', v)} />
          </Pregunta>
        </div>
      )}
    </div>
  );
}
