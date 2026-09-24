'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useTema, type UIConfig } from '@/components/ThemeProvider';

// ─── Catálogo de opciones (espejo de los valores válidos de sanitizeUIConfig) ──

const RADIO_OPCIONES: { id: UIConfig['radio_botones']; label: string; hint: string }[] = [
  { id: 'cuadrado', label: 'Cuadrado', hint: 'Esquinas rectas' },
  { id: 'redondeado', label: 'Redondeado', hint: 'Esquinas suaves' },
  { id: 'pill', label: 'Pill', hint: 'Totalmente redondo' },
];

const DENSIDAD_OPCIONES: { id: UIConfig['densidad']; label: string; hint: string }[] = [
  { id: 'compacta', label: 'Compacta', hint: 'Más contenido' },
  { id: 'normal', label: 'Normal', hint: 'Equilibrada' },
  { id: 'espaciosa', label: 'Espaciosa', hint: 'Más aire' },
];

const FUENTE_OPCIONES: { id: UIConfig['fuente']; label: string; hint: string }[] = [
  { id: 'inter', label: 'Inter', hint: 'Sans moderna' },
  { id: 'mono', label: 'Mono', hint: 'Monoespaciada' },
  { id: 'rounded', label: 'Rounded', hint: 'Sans redondeada' },
];

// Claves canónicas de los widgets del dashboard (deben coincidir EXACTAMENTE con
// DASHBOARD_WIDGETS en dashboard/page.tsx). Lista vacía = mostrar todos.
const WIDGETS: { id: string; label: string; hint: string }[] = [
  { id: 'stat_proyectos', label: 'Proyectos', hint: 'Total de proyectos activos' },
  { id: 'stat_analisis', label: 'Análisis', hint: 'Análisis completados' },
  { id: 'stat_en_proceso', label: 'En proceso', hint: 'Análisis ejecutándose' },
  { id: 'stat_completos', label: 'Completos', hint: 'Proyectos con 5/5 módulos' },
];

const UI_CONFIG_DEFAULT: UIConfig = {
  radio_botones: 'redondeado',
  densidad: 'normal',
  fuente: 'inter',
  animaciones: true,
  sidebar_collapsed: false,
  widgets_activos: [],
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

type Estado = 'idle' | 'guardando' | 'ok' | 'error';

export default function TemaPage() {
  const router = useRouter();
  const { tema, loading, refetch } = useTema();

  // Estado editable local, sembrado desde el tema cargado.
  const [ui, setUi] = useState<UIConfig>(UI_CONFIG_DEFAULT);
  const [acento, setAcento] = useState<string | null>(null);
  const [fondo, setFondo] = useState<string | null>(null);
  const [nombreSistema, setNombreSistema] = useState('');

  const [estado, setEstado] = useState<Estado>('idle');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [sembrado, setSembrado] = useState(false);

  // Guard de sesión. Los tokens viven en cookies httpOnly (no son legibles desde
  // JS), así que el marcador de sesión en el cliente es `usuario` — el mismo que
  // escriben login/signup y que limpia el interceptor 401 de `lib/api.ts`.
  useEffect(() => {
    if (!localStorage.getItem('usuario')) router.push('/auth/login');
  }, [router]);

  // Siembra los controles una sola vez, cuando llega el tema.
  useEffect(() => {
    if (loading || sembrado) return;
    if (tema) {
      setUi({ ...UI_CONFIG_DEFAULT, ...tema.ui_config });
      setAcento(tema.color_acento);
      setFondo(tema.color_fondo);
      setNombreSistema(tema.nombre_sistema ?? '');
    }
    setSembrado(true);
  }, [tema, loading, sembrado]);

  const dirty = useMemo(() => {
    if (!tema) return true;
    return (
      JSON.stringify({ ...UI_CONFIG_DEFAULT, ...tema.ui_config }) !== JSON.stringify(ui) ||
      (tema.color_acento ?? null) !== acento ||
      (tema.color_fondo ?? null) !== fondo ||
      (tema.nombre_sistema ?? '') !== nombreSistema
    );
  }, [tema, ui, acento, fondo, nombreSistema]);

  const setCampo = <K extends keyof UIConfig>(key: K, value: UIConfig[K]) =>
    setUi((prev) => ({ ...prev, [key]: value }));

  const toggleWidget = (id: string) =>
    setUi((prev) => {
      const activos = prev.widgets_activos.includes(id)
        ? prev.widgets_activos.filter((w) => w !== id)
        : [...prev.widgets_activos, id];
      return { ...prev, widgets_activos: activos };
    });

  const handleGuardar = async () => {
    // Validación de color en cliente (el backend rechaza HEX inválidos con 400).
    if (acento && !HEX_RE.test(acento)) {
      setEstado('error');
      setMensaje('El color de acento no es un HEX válido.');
      return;
    }
    if (fondo && !HEX_RE.test(fondo)) {
      setEstado('error');
      setMensaje('El color de fondo no es un HEX válido.');
      return;
    }

    setEstado('guardando');
    setMensaje(null);
    try {
      // IMPORTANTE: ui_config se reemplaza ENTERO en el backend (no hace merge),
      // así que se envía completo. Los colores vacíos van como null (un '' fallaría
      // la validación HEX del servidor).
      await api.put('/config/tema', {
        color_acento: acento || null,
        color_fondo: fondo || null,
        nombre_sistema: nombreSistema.trim() || null,
        ui_config: ui,
      });
      await refetch();
      setEstado('ok');
      setMensaje('Cambios guardados.');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const apiMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setEstado('error');
      if (status === 403) {
        setMensaje('Solo el dueño de una cuenta con plan Negocio o superior puede cambiar el tema del sistema.');
      } else {
        setMensaje(apiMsg ?? 'No se pudo guardar. Inténtalo de nuevo.');
      }
    }
  };

  const handleReset = () => {
    if (tema) {
      setUi({ ...UI_CONFIG_DEFAULT, ...tema.ui_config });
      setAcento(tema.color_acento);
      setFondo(tema.color_fondo);
      setNombreSistema(tema.nombre_sistema ?? '');
    } else {
      setUi(UI_CONFIG_DEFAULT);
      setAcento(null);
      setFondo(null);
      setNombreSistema('');
    }
    setEstado('idle');
    setMensaje(null);
  };

  if (loading || !sembrado) {
    return (
      <div className="max-w-3xl mx-auto px-4 pb-20 space-y-6">
        <div className="h-8 w-52 bg-white/[.04] rounded-xl animate-pulse" />
        <div className="h-3 w-80 bg-white/[.025] rounded-lg animate-pulse" />
        <div className="h-40 bg-white/[.025] rounded-2xl animate-pulse" />
        <div className="h-40 bg-white/[.025] rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Tema del sistema</h1>
        <p className="text-white/40 text-sm mt-1.5">
          Personaliza la apariencia de la terminal. Los cambios se aplican a toda la cuenta.
        </p>
      </div>

      <div className="space-y-6">
        {/* Identidad */}
        <Section title="Identidad" hint="Nombre visible del sistema y colores de marca.">
          <label className="block">
            <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Nombre del sistema</span>
            <input
              type="text"
              value={nombreSistema}
              maxLength={60}
              onChange={(e) => setNombreSistema(e.target.value)}
              placeholder="BI 0 A 100"
              className="mt-2 w-full bg-white/[.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-brand-accent/50 focus:bg-white/[.05] transition-colors"
            />
            <span className="text-white/25 text-[11px] mt-1 block">{nombreSistema.length}/60</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <ColorField label="Color de acento" value={acento} onChange={setAcento} />
            <ColorField label="Color de fondo" value={fondo} onChange={setFondo} />
          </div>
        </Section>

        {/* Interfaz */}
        <Section title="Interfaz" hint="Forma, densidad y tipografía de los controles.">
          <OptionRow label="Bordes de botones">
            {RADIO_OPCIONES.map((o) => (
              <Chip key={o.id} active={ui.radio_botones === o.id} onClick={() => setCampo('radio_botones', o.id)} label={o.label} hint={o.hint} />
            ))}
          </OptionRow>
          <OptionRow label="Densidad">
            {DENSIDAD_OPCIONES.map((o) => (
              <Chip key={o.id} active={ui.densidad === o.id} onClick={() => setCampo('densidad', o.id)} label={o.label} hint={o.hint} />
            ))}
          </OptionRow>
          <OptionRow label="Tipografía">
            {FUENTE_OPCIONES.map((o) => (
              <Chip key={o.id} active={ui.fuente === o.id} onClick={() => setCampo('fuente', o.id)} label={o.label} hint={o.hint} />
            ))}
          </OptionRow>
        </Section>

        {/* Comportamiento */}
        <Section title="Comportamiento" hint="Preferencias de navegación y movimiento.">
          <Toggle
            label="Animaciones"
            hint="Transiciones y efectos de movimiento en la interfaz."
            checked={ui.animaciones}
            onChange={(v) => setCampo('animaciones', v)}
          />
          <Toggle
            label="Menú lateral colapsado"
            hint="Inicia el rail lateral en modo icono en escritorio."
            checked={ui.sidebar_collapsed}
            onChange={(v) => setCampo('sidebar_collapsed', v)}
          />
        </Section>

        {/* Widgets */}
        <Section title="Widgets del dashboard" hint="Elige qué tarjetas de estadísticas se muestran. Si no seleccionas ninguna, se muestran todas.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {WIDGETS.map((w) => {
              const seleccionado = ui.widgets_activos.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleWidget(w.id)}
                  className={`flex items-start gap-3 text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                    seleccionado
                      ? 'bg-brand-accent/10 border-brand-accent/30 text-white'
                      : 'bg-white/[.02] border-white/10 text-white/60 hover:border-white/20 hover:bg-white/[.04]'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors ${
                      seleccionado ? 'bg-brand-accent border-brand-accent' : 'border-white/25'
                    }`}
                  >
                    {seleccionado && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{w.label}</span>
                    <span className="block text-[11px] text-white/40 mt-0.5">{w.hint}</span>
                    {!seleccionado && ui.widgets_activos.length === 0 && (
                      <span className="block text-[10px] text-white/30 mt-1 italic">Visible (mostrando todos)</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {ui.widgets_activos.length > 0 && (
            <button
              type="button"
              onClick={() => setCampo('widgets_activos', [])}
              className="mt-3 text-xs text-white/40 hover:text-white/80 transition-colors underline underline-offset-2"
            >
              Restablecer a «mostrar todos»
            </button>
          )}
        </Section>

        {/* Mensaje de estado */}
        {mensaje && (
          <div
            role="status"
            className={`text-sm px-4 py-3 rounded-xl border ${
              estado === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {mensaje}
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty || estado === 'guardando'}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={!dirty || estado === 'guardando'}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-accent text-white shadow-[0_0_18px_rgba(231,76,60,0.35)] hover:brightness-110 transition-all disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none"
          >
            {estado === 'guardando' ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponentes de presentación ─────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#0F1C2A]/60 border border-white/5 rounded-2xl p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-white font-bold text-base">{title}</h2>
        <p className="text-white/40 text-xs mt-1">{hint}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">{label}</span>
      <div className="flex flex-wrap gap-2 mt-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`px-3.5 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
        active
          ? 'bg-brand-accent/10 border-brand-accent/30 text-white shadow-[inset_0_0_12px_rgba(231,76,60,0.08)]'
          : 'bg-white/[.02] border-white/10 text-white/55 hover:text-white hover:border-white/20 hover:bg-white/[.04]'
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-[11px] text-white/40 mt-0.5">{hint}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-300 ${
          checked ? 'bg-brand-accent' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div>
      <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">{label}</span>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          value={value ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-10 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer p-0.5 flex-shrink-0"
        />
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="#RRGGBB"
          className="flex-1 min-w-0 bg-white/[.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-brand-accent/50 transition-colors font-mono"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Quitar color"
            className="text-white/30 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}