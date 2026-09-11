'use client';

import CustomSelect from '../../../../components/ui/CustomSelect';

// ─── Types ────────────────────────────────────────────────────────────────────
// Espejo de backend/src/services/vertical/camposExpediente.ts

export type TipoCampo = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'tel' | 'email';

export interface CampoExpediente {
  key: string;
  label: string;
  tipo: TipoCampo;
  opciones?: string[];
  ayuda?: string;
  requerido?: boolean;
}

type Valor = string;

const INPUT_CLASS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50';

// ─── Componente ─────────────────────────────────────────────────────────────────

export default function CamposExpediente({
  vertical,
  campos,
  valores,
  onChange,
}: {
  /** Vertical activo del usuario; null si no hay ninguno configurado. */
  vertical: string | null;
  campos: CampoExpediente[];
  /** atributos_extra actual (solo strings; los no-string se muestran vacíos). */
  valores: Record<string, unknown>;
  /** Notifica un cambio de una key concreta hacia el estado del modal. */
  onChange: (key: string, value: Valor) => void;
}) {
  if (!campos.length) return null;

  const valorDe = (key: string): Valor => {
    const v = valores[key];
    return v == null ? '' : String(v);
  };

  return (
    <div className="space-y-4 pt-4 mt-1 border-t border-white/8">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">
          Ficha de expediente
        </span>
        {vertical && (
          <span className="text-[10px] text-violet-300/70 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5">
            {vertical}
          </span>
        )}
      </div>

      {campos.map(campo => (
        <div key={campo.key}>
          <label className="text-xs text-white/40 mb-1 block">
            {campo.label}
            {campo.requerido && <span className="text-violet-400/70"> *</span>}
          </label>

          {campo.tipo === 'select' ? (
            <CustomSelect
              value={valorDe(campo.key)}
              onChange={val => onChange(campo.key, val)}
              options={[
                { value: '', label: '— Seleccionar —' },
                ...(campo.opciones ?? []).map(o => ({ value: o, label: o })),
              ]}
            />
          ) : campo.tipo === 'textarea' ? (
            <textarea
              value={valorDe(campo.key)}
              onChange={e => onChange(campo.key, e.target.value)}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 resize-none"
            />
          ) : campo.tipo === 'date' ? (
            <input
              type="date"
              value={valorDe(campo.key)}
              onChange={e => onChange(campo.key, e.target.value)}
              className={INPUT_CLASS + ' text-white/70'}
              style={{ colorScheme: 'dark' }}
            />
          ) : (
            <input
              type={
                campo.tipo === 'number'
                  ? 'number'
                  : campo.tipo === 'tel'
                  ? 'tel'
                  : campo.tipo === 'email'
                  ? 'email'
                  : 'text'
              }
              value={valorDe(campo.key)}
              onChange={e => onChange(campo.key, e.target.value)}
              className={INPUT_CLASS}
            />
          )}

          {campo.ayuda && <p className="text-[11px] text-white/35 mt-1">{campo.ayuda}</p>}
        </div>
      ))}
    </div>
  );
}