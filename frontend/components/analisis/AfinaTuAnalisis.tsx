'use client';

import { useId, useState } from 'react';
import {
  OPCIONES,
  SECTORES_REGULADOS,
  monedaDePais,
  type PerfilNegocio,
  type SectorRegulado,
} from '@/lib/perfilNegocio';
import { getTaxConfig } from '@/lib/taxConfig';

/**
 * «Afina tu análisis»: preguntas opcionales sobre el negocio que cambian el
 * resultado de la IA. Plegado por defecto para no alargar el formulario; lo
 * contestado se guarda en el producto y lo reutilizan los demás módulos.
 *
 * Cada módulo elige qué preguntas muestra (`campos`) y puede explicar con sus
 * palabras por qué le importan (`porque`): Legal pregunta las 8 generales, Mercado solo
 * las que mueven su análisis.
 */

type Campo = keyof PerfilNegocio;

// El perfil general (las 8 de Legal). Las de cobro y pago las pide Finanzas.
const GENERALES: Campo[] = [
  'situacion_fiscal',
  'regimen_actual',
  'ingresos_anuales',
  'local_fisico',
  'sectores_regulados',
  'datos_sensibles',
  'tipo_clientes',
  'marca',
];

/** Por qué importa cada pregunta, si el módulo no lo dice con sus palabras. */
const PORQUE_DEFECTO: Record<Campo, string> = {
  situacion_fiscal: 'Si falta el alta, regularizarla va antes que cualquier otro trámite.',
  regimen_actual: 'Define qué declaraciones y comprobantes te tocan.',
  ingresos_anuales: 'Los regímenes simplificados tienen topes; pasarlos cambia tus obligaciones.',
  local_fisico: 'Un local suele exigir licencia de funcionamiento, uso de suelo y revisión de seguridad; un puesto en la calle, permiso de la autoridad local para usar el espacio.',
  sectores_regulados: 'Los sectores regulados necesitan permisos adicionales (sanitarios, licencias especiales).',
  datos_sensibles: 'Salud, datos biométricos o financieros tienen reglas de protección más estrictas.',
  tipo_clientes: 'Vender a empresas o a gobierno exige comprobantes fiscales y, a veces, registro como proveedor.',
  marca: 'Sin registro podrías tener que cambiar de nombre si otra empresa ya lo tiene.',
  precio_incluye_impuesto: 'Si lo incluye, una parte de cada venta es del fisco y tu margen real es menor.',
  comision_venta_pct: 'Pasarelas, marketplaces y apps de reparto se quedan una parte de cada venta.',
  dias_cobro: 'Vender a crédito necesita caja extra aunque el negocio sea rentable.',
  dias_pago: 'Pagar a tus proveedores después de cobrar libera caja.',
  pago_deuda_mensual: 'La cuota sale de la caja cada mes, aunque no sea un gasto.',
};

function Numero({
  valor,
  onChange,
  unidad,
  max,
  entero,
  placeholder,
  etiqueta,
}: {
  valor?: number | null;
  onChange: (v: number | null) => void;
  unidad?: string;
  max: number;
  entero?: boolean;
  placeholder: string;
  etiqueta: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={max}
        step={entero ? 1 : 'any'}
        inputMode={entero ? 'numeric' : 'decimal'}
        aria-label={etiqueta}
        value={valor ?? ''}
        onChange={(e) => {
          const n = e.target.value === '' ? null : Number(e.target.value);
          const valido = n !== null && Number.isFinite(n) && n >= 0 && n <= max;
          onChange(valido ? (entero ? Math.round(n) : n) : null);
        }}
        placeholder={placeholder}
        className={`${inputCls} ${unidad ? 'pr-16' : ''}`}
      />
      {unidad && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none select-none">
          {unidad}
        </span>
      )}
    </div>
  );
}

const respondido = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

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
  campos = GENERALES,
  porque,
}: {
  perfil: PerfilNegocio;
  onChange: (perfil: PerfilNegocio) => void;
  pais?: string | null;
  /** Preguntas a mostrar, en este orden. Por defecto, las 8. */
  campos?: Campo[];
  /** Por qué le importa cada pregunta a este módulo (si no, el texto de Legal). */
  porque?: Partial<Record<Campo, string>>;
}) {
  const respondidas = campos.filter((c) => respondido(perfil[c])).length;
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const moneda = monedaDePais(pais);
  const set = <K extends Campo>(campo: K, valor: PerfilNegocio[K]) => onChange({ ...perfil, [campo]: valor });
  const explicar = (c: Campo) => porque?.[c] ?? PORQUE_DEFECTO[c];
  const impuesto = getTaxConfig((pais ?? 'MX').toUpperCase()).consumo.nombre;

  const alternarSector = (s: SectorRegulado) => {
    const actuales = perfil.sectores_regulados ?? [];
    if (s === 'ninguno') return set('sectores_regulados', actuales.includes('ninguno') ? null : ['ninguno']);
    const sinNinguno = actuales.filter((x) => x !== 'ninguno');
    const nuevos = sinNinguno.includes(s) ? sinNinguno.filter((x) => x !== s) : [...sinNinguno, s];
    set('sectores_regulados', nuevos.length ? nuevos : null);
  };

  const preguntas: Record<Campo, () => React.ReactNode> = {
    situacion_fiscal: () => (
      <Pregunta titulo="¿Ya estás dado de alta ante la autoridad fiscal?" porque={explicar('situacion_fiscal')}>
        <Opciones
          nombre="Situación fiscal"
          opciones={OPCIONES.situacion_fiscal}
          valor={perfil.situacion_fiscal}
          onChange={(v) => set('situacion_fiscal', v)}
        />
      </Pregunta>
    ),
    regimen_actual: () => (
      <Pregunta titulo="¿En qué régimen fiscal estás?" porque={explicar('regimen_actual')}>
        <input
          type="text"
          value={perfil.regimen_actual ?? ''}
          maxLength={120}
          onChange={(e) => set('regimen_actual', e.target.value || null)}
          placeholder="Ej.: RESICO, Régimen simple, Monotributo… o «no lo sé»"
          className={inputCls}
        />
      </Pregunta>
    ),
    ingresos_anuales: () => (
      <Pregunta titulo={`Ingresos anuales aproximados${moneda ? ` (${moneda})` : ''}`} porque={explicar('ingresos_anuales')}>
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
    ),
    local_fisico: () => (
      <Pregunta titulo="¿Dónde operas?" porque={explicar('local_fisico')}>
        <Opciones
          nombre="Local físico"
          opciones={OPCIONES.local_fisico}
          valor={perfil.local_fisico}
          onChange={(v) => set('local_fisico', v)}
        />
      </Pregunta>
    ),
    sectores_regulados: () => (
      <Pregunta titulo="¿Tu giro pertenece a alguno de estos sectores?" porque={explicar('sectores_regulados')}>
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
    ),
    datos_sensibles: () => (
      <Pregunta titulo="¿Manejas datos sensibles de tus clientes?" porque={explicar('datos_sensibles')}>
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
    ),
    tipo_clientes: () => (
      <Pregunta titulo="¿A quién le vendes?" porque={explicar('tipo_clientes')}>
        <Opciones
          nombre="Tipo de clientes"
          opciones={OPCIONES.tipo_clientes}
          valor={perfil.tipo_clientes}
          onChange={(v) => set('tipo_clientes', v)}
        />
      </Pregunta>
    ),
    marca: () => (
      <Pregunta titulo="¿Tu marca está registrada?" porque={explicar('marca')}>
        <Opciones nombre="Marca" opciones={OPCIONES.marca} valor={perfil.marca} onChange={(v) => set('marca', v)} />
      </Pregunta>
    ),
    precio_incluye_impuesto: () => (
      <Pregunta titulo={`¿Tu precio de venta ya incluye el ${impuesto}?`} porque={explicar('precio_incluye_impuesto')}>
        <Opciones
          nombre={`Precio con ${impuesto}`}
          opciones={[
            { value: 'si', label: `Sí, ya trae el ${impuesto}` },
            { value: 'no', label: `No, el ${impuesto} se suma aparte` },
          ]}
          valor={perfil.precio_incluye_impuesto == null ? null : perfil.precio_incluye_impuesto ? 'si' : 'no'}
          onChange={(v) => set('precio_incluye_impuesto', v === null ? null : v === 'si')}
        />
      </Pregunta>
    ),
    comision_venta_pct: () => (
      <Pregunta titulo="¿Qué porcentaje de cada venta se quedan las plataformas o pasarelas?" porque={explicar('comision_venta_pct')}>
        <Numero
          etiqueta="Comisión por venta"
          valor={perfil.comision_venta_pct}
          onChange={(v) => set('comision_venta_pct', v)}
          unidad="%"
          max={90}
          placeholder="0 si no usas ninguna"
        />
      </Pregunta>
    ),
    dias_cobro: () => (
      <Pregunta titulo="¿En cuántos días te pagan tus clientes?" porque={explicar('dias_cobro')}>
        <Numero
          etiqueta="Días de cobro"
          valor={perfil.dias_cobro}
          onChange={(v) => set('dias_cobro', v)}
          unidad="días"
          max={365}
          entero
          placeholder="0 si cobras al momento"
        />
      </Pregunta>
    ),
    dias_pago: () => (
      <Pregunta titulo="¿En cuántos días pagas a tus proveedores?" porque={explicar('dias_pago')}>
        <Numero
          etiqueta="Días de pago a proveedores"
          valor={perfil.dias_pago}
          onChange={(v) => set('dias_pago', v)}
          unidad="días"
          max={365}
          entero
          placeholder="0 si pagas de contado"
        />
      </Pregunta>
    ),
    pago_deuda_mensual: () => (
      <Pregunta titulo={`¿Cuánto pagas al mes de préstamos o créditos del negocio?${moneda ? ` (${moneda})` : ''}`} porque={explicar('pago_deuda_mensual')}>
        <Numero
          etiqueta="Cuota mensual de deudas"
          valor={perfil.pago_deuda_mensual}
          onChange={(v) => set('pago_deuda_mensual', v)}
          unidad={moneda || undefined}
          max={999_999_999_999}
          placeholder="0 si no tienes deudas"
        />
      </Pregunta>
    ),
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
            Opcional · {campos.length} {campos.length === 1 ? 'pregunta que cambia' : 'preguntas que cambian'} el resultado. Si no las
            respondes, el análisis lo dice y trabaja con supuestos.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] tabular-nums text-white/40">
            {respondidas}/{campos.length}
          </span>
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
          {campos.map((c) => (
            <div key={c}>{preguntas[c]()}</div>
          ))}
        </div>
      )}
    </div>
  );
}
