'use client';

import { useReducer, useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { PAISES_LATAM, getPaisInfo } from '@/lib/latam';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIAS = [
  'Ropa y Accesorios', 'Alimentos y Bebidas', 'Electrónicos',
  'Hogar y Decoración', 'Salud y Belleza', 'Deportes y Acondicionamiento Físico',
  'Juguetes y Juegos', 'Servicios Profesionales', 'Educación y Cursos',
  'Arte y Manualidades', 'Automotriz', 'Mascotas', 'Otro',
];

const CANALES_VENTA = [
  { value: 'online',    label: 'Tienda en línea' },
  { value: 'redes',     label: 'Redes sociales' },
  { value: 'fisico',    label: 'Local físico' },
  { value: 'domicilio', label: 'A domicilio' },
  { value: 'mixto',     label: 'Varios canales' },
];

const NSE_OPTIONS = [
  { value: 'A/B',   label: 'A/B',    desc: 'Alto · +$35k/mes' },
  { value: 'C+',    label: 'C+',     desc: 'Medio-alto' },
  { value: 'C',     label: 'C',      desc: 'Medio' },
  { value: 'D+',    label: 'D+',     desc: 'Medio-bajo' },
  { value: 'D',     label: 'D',      desc: 'Bajo' },
  { value: 'todos', label: 'Todos',  desc: 'Mercado masivo' },
];

const MODELOS_COBRO = [
  { value: 'unico',       label: 'Pago único',    desc: 'El cliente paga una vez' },
  { value: 'paquetes',    label: 'Paquetes',       desc: 'Combos o bundles' },
  { value: 'suscripcion', label: 'Suscripción',    desc: 'Cobro mensual fijo' },
  { value: 'mixto',       label: 'Combinado',      desc: 'Mezcla de modelos' },
];

const CANALES_ADQUISICION = [
  'Redes sociales (sin pagar)',
  'Publicidad pagada (Meta / Google)',
  'Recomendaciones / boca a boca',
  'WhatsApp / comunidades',
  'Mercado Libre / Amazon',
  'Búsquedas en Google (SEO)',
  'Otro',
];

const PUV_MAX  = 200;
const PUV_WARN = 175;

// iOS-style success green (used for completed steps + connectors)
const DONE_GREEN = '#30D158';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Negocio { id: string; nombre: string; emoji: string; }

type TipoActividad   = 'producto' | 'servicio';
type EstatusProyecto = 'nueva_idea' | 'negocio_en_marcha';
type CoberturaTipo   = 'local' | 'nacional';
type ModeloCobro     = 'unico' | 'paquetes' | 'suscripcion' | 'mixto';

interface FormState {
  nombre:    string;
  estatus:   EstatusProyecto | '';
  tipo:      TipoActividad;
  categoria: string;
  pais:        string;
  cobertura:   CoberturaTipo | '';
  radio_km:    number;
  canal_venta: string;
  direccion:   string;
  descripcion:   string;
  puv:           string;
  cliente_ideal: string;
  nse:           string;
  precio_esperado: string;
  modelo_cobro:       ModeloCobro | '';
  precio_suscripcion: string;
  ltv_meses:          string;
  clientes_mes:     string;
  tasa_repeticion:  string;
  canal_adquisicion: string;
  inversion_inicial: string;
  costos_fijos:      string;
  tamano_equipo:     string;
  negocio_id:        string;
}

type FormAction =
  | { type: 'SET'; field: keyof FormState; value: string | number }
  | { type: 'RESET' };

const INITIAL: FormState = {
  nombre: '', estatus: '', tipo: 'producto', categoria: '',
  pais: 'MX', cobertura: '', radio_km: 5, canal_venta: '',
  direccion: '',
  descripcion: '', puv: '', cliente_ideal: '', nse: '',
  precio_esperado: '',
  modelo_cobro: '', precio_suscripcion: '', ltv_meses: '',
  clientes_mes: '', tasa_repeticion: '', canal_adquisicion: '',
  inversion_inicial: '', costos_fijos: '', tamano_equipo: '',
  negocio_id: '',
};

function reducer(state: FormState, action: FormAction): FormState {
  if (action.type === 'SET') return { ...state, [action.field]: action.value };
  return INITIAL;
}

// Traduce los `path` de los issues Zod del backend a claves de FormState.
// routes/productos.ts usa nombres de columna (`estatus_proyecto`) mientras el
// formulario guarda `estatus`; sin este mapa el error nunca llega al input.
const API_FIELD_TO_FORM: Partial<Record<string, keyof FormState>> = {
  nombre:             'nombre',
  tipo:               'tipo',
  categoria:          'categoria',
  pais:               'pais',
  direccion:          'direccion',
  descripcion:        'descripcion',
  estatus_proyecto:   'estatus',
  cobertura:          'cobertura',
  radio_km:           'radio_km',
  canal_venta:        'canal_venta',
  precio_esperado:    'precio_esperado',
  puv:                'puv',
  cliente_ideal:      'cliente_ideal',
  nse:                'nse',
  modelo_cobro:       'modelo_cobro',
  precio_suscripcion: 'precio_suscripcion',
  ltv_meses:          'ltv_meses',
  clientes_mes:       'clientes_mes',
  tasa_repeticion:    'tasa_repeticion',
  canal_adquisicion:  'canal_adquisicion',
  inversion_inicial:  'inversion_inicial',
  costos_fijos:       'costos_fijos',
  tamano_equipo:      'tamano_equipo',
  negocio_id:         'negocio_id',
};

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[#15212f] border border-white/12 text-white placeholder-white/30 rounded-xl ' +
  'px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/45 ' +
  'focus:border-brand-primary/50 transition-all duration-200';

// Para <select>: appearance-none quita la flecha del SO; el CSS global inyecta la flecha SVG
const selectCls = inputCls + ' appearance-none cursor-pointer';

const inputErrCls = 'border-brand-accent/60 focus:ring-brand-accent/30 focus:border-brand-accent/60';

const optionCls = 'bg-[#15212f]';

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-white/12 text-white/45 text-[9px] font-black flex items-center justify-center hover:bg-brand-primary/25 hover:text-brand-primary transition focus:outline-none"
        aria-label="Más información"
      >?</button>
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-[#1b2a3d] border border-white/15 text-white/85 text-[11px] leading-snug rounded-xl px-3 py-2.5 shadow-2xl z-50 pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1b2a3d]" />
        </span>
      )}
    </span>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, required, optional, hint, error, tooltip, children,
}: {
  label: string; required?: boolean; optional?: boolean;
  hint?: string; error?: string; tooltip?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center flex-wrap gap-0.5 text-[11px] font-bold text-white/65 uppercase tracking-[0.1em]">
        {label}
        {required && <span className="text-brand-accent ml-0.5 normal-case tracking-normal">*</span>}
        {optional && <span className="text-white/35 font-normal normal-case tracking-normal ml-1">(opcional)</span>}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      {children}
      {hint  && !error && <p className="text-[11px] text-white/40 leading-snug">{hint}</p>}
      {error && (
        <p className="text-[11px] text-brand-accent flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// ─── Step Block ───────────────────────────────────────────────────────────────

function Step({
  n, title, subtitle, icon, last, done, children,
}: {
  n?: number; title: string; subtitle?: string; icon?: React.ReactNode;
  last?: boolean; done?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-5">
      {/* Left: circle + vertical line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 z-10 transition-all duration-500"
          style={{
            background: done
              ? `linear-gradient(135deg, ${DONE_GREEN}, #24a14b)`
              : 'linear-gradient(135deg,#1a2c42,#13202f)',
            border: done
              ? `1px solid rgba(48,209,88,0.55)`
              : '1px solid rgba(255,255,255,0.14)',
            color: done ? '#fff' : 'rgba(255,255,255,0.6)',
            boxShadow: done ? '0 0 22px rgba(48,209,88,0.35)' : 'none',
          }}
        >
          {done ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <span className="animate-fade-in flex items-center justify-center">{icon ?? n}</span>
          )}
        </div>
        {!last && (
          <div
            className="flex-1 w-[2px] mt-2 rounded-full transition-all duration-700"
            style={{
              background: done
                ? `linear-gradient(to bottom, ${DONE_GREEN}, rgba(48,209,88,0.18))`
                : 'linear-gradient(to bottom, rgba(255,255,255,0.12), transparent)',
              boxShadow: done ? '0 0 12px rgba(48,209,88,0.25)' : 'none',
            }}
          />
        )}
      </div>

      {/* Right: content */}
      <div className={`flex-1 min-w-0 ${last ? 'pb-0' : 'pb-8'}`}>
        <div className="flex items-center gap-2 mb-5 h-9">
          <div>
            <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
              {title}
              {done && (
                <span className="text-[10px] font-bold normal-case tracking-normal px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(48,209,88,0.14)', color: DONE_GREEN }}>
                  Listo
                </span>
              )}
            </h2>
            {subtitle && <p className="text-[11px] text-white/45 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Card Toggle ──────────────────────────────────────────────────────────────

function CardToggle({
  options, value, onChange, cols = 2,
}: {
  options: { v: string; label: string; icon?: React.ReactNode; sub?: string }[];
  value: string;
  onChange: (v: string) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {options.map((o) => {
        const active = value === o.v;
        return (
          <motion.button
            key={o.v}
            type="button"
            whileHover={{ scale: 1.015, y: -1 }}
            whileTap={{ scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
            onClick={() => onChange(o.v)}
            className="relative rounded-xl border p-3.5 text-left transition-colors duration-200 focus:outline-none"
            style={{
              background: active ? 'rgba(231,76,60,0.12)' : 'rgba(255,255,255,0.04)',
              borderColor: active ? 'rgba(231,76,60,0.45)' : 'rgba(255,255,255,0.1)',
              boxShadow: active ? '0 0 20px rgba(231,76,60,0.12)' : 'none',
            }}
          >
            {active && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-brand-accent flex items-center justify-center"
              >
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </motion.span>
            )}
            {o.icon && <div className="mb-2 text-white/70 flex items-center">{o.icon}</div>}
            <p className={`text-xs font-bold leading-tight ${active ? 'text-white' : 'text-white/65'}`}>{o.label}</p>
            {o.sub && <p className="text-[10px] text-white/40 mt-0.5">{o.sub}</p>}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Canal Icon Helper ────────────────────────────────────────────────────────

function CanalIcon({ value }: { value: string }) {
  switch (value) {
    case 'online':
      return (
        <svg className="w-4 h-4 text-white/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      );
    case 'redes':
      return (
        <svg className="w-4 h-4 text-white/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    case 'fisico':
      return (
        <svg className="w-4 h-4 text-white/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case 'domicilio':
      return (
        <svg className="w-4 h-4 text-white/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4 text-white/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
  }
}

// ─── Preview Sidebar ──────────────────────────────────────────────────────────

function PreviewSidebar({ s, isServicio }: { s: FormState; isServicio: boolean }) {
  const filledFields = [
    s.nombre, s.estatus, s.categoria, s.cobertura,
    s.puv, s.precio_esperado, s.modelo_cobro,
  ].filter(Boolean).length;
  const pct = Math.round((filledFields / 7) * 100);

  return (
    <div className="sticky top-6 space-y-4">
      {/* Progress card */}
      <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'linear-gradient(160deg,#152234,#101a28)' }}>
        <div className="px-5 pt-5 pb-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-3">Progreso del formulario</p>
          <div className="flex items-end justify-between mb-2">
            <span className="text-3xl font-black text-white tabular-nums">{pct}<span className="text-lg text-white/40">%</span></span>
            <span className="text-[10px] text-white/45">{filledFields} de 7 campos clave</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden bg-white/8">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: pct === 100 ? DONE_GREEN : 'linear-gradient(90deg,#E74C3C,#3B82F6)' }}
            />
          </div>
        </div>
        <div className="border-t border-white/8 px-5 py-4 space-y-2.5">
          {[
            { label: 'Nombre',    value: s.nombre || null },
            { label: 'Tipo',      value: isServicio ? 'Servicio' : 'Producto' },
            { label: 'Categoría', value: s.categoria || null },
            { label: 'País',      value: s.pais || null },
            { label: 'Cobertura', value: s.cobertura || null },
            { label: 'Precio',    value: s.precio_esperado ? `$${Number(s.precio_esperado).toLocaleString('es-MX')}` : null },
            { label: 'Modelo',    value: s.modelo_cobro || null },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-white/45">{label}</span>
              <span className={`text-[11px] font-semibold truncate max-w-[120px] ${value ? 'text-white/85' : 'text-white/25'}`}>
                {value ?? '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tips card */}
      <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/8 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-brand-primary/75 mb-3">Consejo</p>
        <p className="text-[12px] text-white/60 leading-relaxed">
          {!s.nombre
            ? 'Empieza con el nombre de tu producto o servicio. Sé específico — en vez de "Ropa", escribe "Playeras de algodón orgánico".'
            : !s.cobertura
            ? 'Define si vendes localmente (tu ciudad) o en todo el país. Esto afecta el tamaño de mercado calculado.'
            : !s.puv
            ? 'Tu propuesta de valor es lo que te hace diferente a la competencia. Una línea clara mejora mucho el análisis.'
            : 'Estás avanzando bien. Mientras más campos llenes, más preciso será el análisis de la IA.'}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NuevoProductoPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [s, dispatch] = useReducer(reducer, INITIAL);
  const set = useCallback((field: keyof FormState, value: string | number) => {
    dispatch({ type: 'SET', field, value });
  }, []);

  const [imagen,  setImagen]  = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors,  setErrors]  = useState<Partial<Record<keyof FormState | '_global', string>>>({});
  const [loading, setLoading] = useState(false);
  const [negocios,         setNegocios]         = useState<Negocio[]>([]);
  const [showNewNegocio,   setShowNewNegocio]   = useState(false);
  // El alta de carpeta fallaba en silencio: el botón parecía roto.
  const [errorNegocio,     setErrorNegocio]     = useState('');
  const [creandoNegocio,   setCreandoNegocio]   = useState(false);
  const [newNegocioNombre, setNewNegocioNombre] = useState('');

  useEffect(() => {
    api.get('/negocios').then(({ data }) => setNegocios(data as Negocio[])).catch(() => {});
  }, []);

  const isServicio = s.tipo === 'servicio';
  const term = {
    entity:     isServicio ? 'Servicio'     : 'Producto',
    priceLabel: isServicio ? 'Precio por sesión / hora' : 'Precio de venta unitario',
    clientsLbl: isServicio ? 'Clientes que atiendes por mes' : 'Unidades vendidas por mes',
    namePh:     isServicio ? 'Ej: Clases de Piano a Domicilio' : 'Ej: Camisetas de Algodón Orgánico',
    dirLabel:   isServicio
      ? (s.cobertura === 'local' ? 'Dirección de tu oficina o lugar de trabajo' : 'Ciudad donde trabajas')
      : (s.cobertura === 'local' ? 'Dirección de tu local o negocio' : 'Ciudad sede de tu operación'),
    dirPH: isServicio ? 'Ej: Col. Roma, Ciudad de México' : 'Ej: Av. Insurgentes 123, Col. Del Valle',
  };

  // ── Completion state per step (drives the green icons + illuminated lines) ──
  const stepDone = {
    carpeta:   !!s.negocio_id,
    identidad: !!(s.nombre.trim() && s.estatus && s.categoria),
    alcance:   !!s.cobertura,
    propuesta: !!(s.descripcion.trim() || s.puv.trim() || s.cliente_ideal.trim() || s.nse),
    precio:    !!(s.precio_esperado || s.modelo_cobro),
    traccion:  !!(s.clientes_mes || s.tasa_repeticion || s.canal_adquisicion),
    finanzas:  !!(s.inversion_inicial || s.costos_fijos || s.tamano_equipo),
  };

  const handleImagen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagen(file);
    setPreview(URL.createObjectURL(file));
  };

  const validate = useCallback(() => {
    const e: typeof errors = {};
    if (!s.nombre.trim())
      e.nombre = 'Escribe el nombre de tu producto o servicio';
    if (!s.estatus)
      e.estatus = 'Elige si es una idea nueva o ya tienes ventas';
    if (!s.categoria)
      e.categoria = 'Elige la categoría que mejor describe lo que vendes';
    if (!s.cobertura)
      e.cobertura = 'Elige si vendes solo en tu zona local o en todo el país';
    if (s.puv.length > PUV_MAX)
      e.puv = `Máximo ${PUV_MAX} caracteres`;
    if (s.precio_esperado && isNaN(Number(s.precio_esperado)))
      e.precio_esperado = 'Escribe solo el número, sin símbolos';
    else if (s.precio_esperado !== '' && Number(s.precio_esperado) <= 0)
      e.precio_esperado = 'El precio debe ser mayor a 0';
    if (s.modelo_cobro === 'suscripcion' && !s.precio_suscripcion)
      e.precio_suscripcion = 'Escribe el precio mensual de la suscripción';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [s]);

  const handleCreateNegocio = async () => {
    if (!newNegocioNombre.trim()) return;
    setCreandoNegocio(true);
    setErrorNegocio('');
    try {
      const { data } = await api.post('/negocios', { nombre: newNegocioNombre.trim() });
      setNegocios(prev => [...prev, data as Negocio]);
      set('negocio_id', (data as Negocio).id);
      setNewNegocioNombre('');
      setShowNewNegocio(false);
    } catch (err: unknown) {
      // Antes era `catch { /* silent */ }`: si el POST fallaba no pasaba
      // absolutamente nada en pantalla y el usuario no sabía si reintentar.
      const e = err as { response?: { data?: { error?: string } } };
      setErrorNegocio(e.response?.data?.error ?? 'No se pudo crear la carpeta. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setCreandoNegocio(false);
    }
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('nombre',    s.nombre.trim());
      fd.append('categoria', s.categoria);
      // Contrato backend: campo 'image' (multer .single('image')) y 'precio'.
      // Antes se enviaban como imagen/precio_esperado y se perdían silenciosamente.
      fd.append('pais',      s.pais || 'MX');
      if (s.descripcion)     fd.append('descripcion',    s.descripcion.trim());
      if (s.precio_esperado) fd.append('precio',         String(Number(s.precio_esperado)));
      if (imagen)            fd.append('image', imagen);
      if (s.negocio_id)      fd.append('negocio_id',     s.negocio_id);

      // Contexto de negocio: hasta ahora el wizard preguntaba todo esto y lo
      // tiraba aquí (había dos `if` vacíos). Solo se envía lo que tiene valor:
      // un '' llegaría al backend como string vacío y podría acabar en 0.
      const opcionales: Record<string, string> = {
        estatus_proyecto:  s.estatus,
        tipo:              s.tipo,
        cobertura:         s.cobertura,
        canal_venta:       s.canal_venta,
        direccion:         s.direccion.trim(),
        puv:               s.puv.trim(),
        cliente_ideal:     s.cliente_ideal.trim(),
        nse:               s.nse,
        modelo_cobro:      s.modelo_cobro,
        canal_adquisicion: s.canal_adquisicion,
      };
      for (const [k, v] of Object.entries(opcionales)) {
        if (v) fd.append(k, v);
      }

      // Numéricos: `radio_km` solo tiene sentido con cobertura local.
      const numericos: Record<string, string | number> = {
        ...(s.cobertura === 'local' ? { radio_km: s.radio_km } : {}),
        inversion_inicial: s.inversion_inicial,
        costos_fijos:      s.costos_fijos,
        tamano_equipo:     s.tamano_equipo,
      };
      // El precio de suscripción y el LTV solo aplican a ese modelo de cobro.
      if (s.modelo_cobro === 'suscripcion') {
        numericos.precio_suscripcion = s.precio_suscripcion;
        numericos.ltv_meses          = s.ltv_meses;
      }
      // Estos dos solo existen si ya hay ventas: en una idea nueva serían
      // inventados, y alimentan directamente el análisis de Mercado.
      if (s.estatus === 'negocio_en_marcha') {
        numericos.clientes_mes    = s.clientes_mes;
        numericos.tasa_repeticion = s.tasa_repeticion;
      }
      for (const [k, v] of Object.entries(numericos)) {
        const n = Number(v);
        if (String(v).trim() !== '' && Number.isFinite(n) && n >= 0) {
          fd.append(k, String(n));
        }
      }


      const { data } = await api.post('/productos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      router.push(`/dashboard/producto/${data.id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const e = err as { response?: { data?: { error?: string; issues?: { path: string; message: string }[] } } };
        const issues = e.response?.data?.issues;
        if (issues && issues.length > 0) {
          const mapped: typeof errors = {};
          let sinCampo = '';
          for (const issue of issues) {
            // Paths anidados ('cliente_ideal.edad_min') se atribuyen al campo raíz.
            const field = API_FIELD_TO_FORM[issue.path.split('.')[0]];
            if (field) mapped[field] = issue.message;
            else if (!sinCampo) sinCampo = issue.message;
          }
          mapped._global = Object.keys(mapped).length > 0
            ? 'Revisa los campos marcados en rojo'
            : sinCampo || 'Revisa los datos e intenta de nuevo.';
          setErrors(mapped);
        } else {
          setErrors({ _global: e.response?.data?.error ?? 'Ocurrió un error al guardar. Intenta de nuevo.' });
        }
      } else {
        setErrors({ _global: 'Error inesperado. Intenta de nuevo en un momento.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const ltvPreview =
    s.modelo_cobro === 'suscripcion' && s.precio_suscripcion && s.ltv_meses
      ? Number(s.precio_suscripcion) * Number(s.ltv_meses)
      : null;

  return (
    <div
      className="min-h-screen px-4 py-8 relative"
      style={{ background: 'linear-gradient(180deg,#101d2e 0%,#0c1726 55%,#0a1320 100%)' }}
    >
      {/* Ambient glows — slightly stronger for a lighter, more legible canvas */}
      <div className="fixed top-0 right-0 w-[55vh] h-[55vh] bg-brand-primary/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[45vh] h-[45vh] bg-brand-accent/8 rounded-full blur-[110px] pointer-events-none" />
      <div className="fixed top-1/3 left-1/4 w-[40vh] h-[40vh] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* ── Page header ── */}
      <div className="max-w-5xl mx-auto mb-8 relative">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-white/45 hover:text-white/80 text-xs mb-5 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Panel principal
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-accent/75 mb-1">Nuevo análisis</p>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Cuéntanos sobre tu {term.entity.toLowerCase()}
            </h1>
            <p className="text-sm text-white/45 mt-1">
              La IA convierte tus respuestas en un análisis completo de mercado, marketing, ventas y finanzas.
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="max-w-5xl mx-auto xl:grid xl:grid-cols-[1fr_280px] xl:gap-8 xl:items-start relative">

        {/* Left: form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-0">

          {/* ── STEP 0: Carpeta ── */}
          <Step
            n={undefined}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
            done={stepDone.carpeta}
            title="Carpeta"
            subtitle="Organiza este producto en un negocio (opcional)"
          >
            <div className="space-y-3">
              <label className="flex items-center flex-wrap gap-0.5 text-[11px] font-bold text-white/65 uppercase tracking-[0.1em]">
                Negocio
                <span className="text-white/35 font-normal normal-case tracking-normal ml-1">(opcional)</span>
                <Tooltip text="Una carpeta agrupa varios productos del mismo negocio para tenerlos ordenados y comparar sus análisis. Es solo organización: no cambia el resultado de la IA. Si este producto no pertenece a un negocio, déjalo sin asignar." />
              </label>
              <div className="flex flex-wrap gap-2">
                {negocios.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => set('negocio_id', s.negocio_id === n.id ? '' : n.id)}
                    className="px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all duration-200"
                    style={{
                      background: s.negocio_id === n.id ? 'rgba(231,76,60,0.12)' : 'rgba(255,255,255,0.04)',
                      borderColor: s.negocio_id === n.id ? 'rgba(231,76,60,0.45)' : 'rgba(255,255,255,0.1)',
                      color: s.negocio_id === n.id ? '#fff' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {n.emoji} {n.nombre}
                    {s.negocio_id === n.id && (
                      <svg className="w-3.5 h-3.5 ml-1.5 inline text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
                {!showNewNegocio && (
                  <button
                    type="button"
                    onClick={() => setShowNewNegocio(true)}
                    className="px-3.5 py-2 rounded-xl border border-dashed border-white/12 text-white/40 text-sm hover:border-white/25 hover:text-white/65 transition-all duration-200"
                  >
                    + Nueva carpeta
                  </button>
                )}
              </div>
              {showNewNegocio && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNegocioNombre}
                    onChange={e => setNewNegocioNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateNegocio(); } }}
                    placeholder="Nombre de la carpeta..."
                    className={`${inputCls} flex-1`}
                    autoFocus
                  />
                  <button type="button" onClick={handleCreateNegocio} disabled={creandoNegocio}
                    className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition flex-shrink-0 disabled:opacity-50">
                    {creandoNegocio ? 'Creando…' : 'Crear'}
                  </button>
                  <button type="button" onClick={() => { setShowNewNegocio(false); setNewNegocioNombre(''); setErrorNegocio(''); }}
                    className="px-3 py-2 border border-white/12 text-white/45 rounded-xl text-sm hover:border-white/25 transition flex-shrink-0 flex items-center justify-center"
                    aria-label="Cerrar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {showNewNegocio && errorNegocio && (
                <p className="mt-2 text-xs text-brand-accent">{errorNegocio}</p>
              )}
            </div>
          </Step>

          {/* ── STEP 1: Identidad ── */}
          <Step n={1} done={stepDone.identidad} title="Identidad y Estatus" subtitle="La base de tu idea">

            <Field label="Nombre" required error={errors.nombre}
              tooltip="El nombre que usa tu cliente para buscar o pedir lo que vendes.">
              <input type="text" value={s.nombre} onChange={e => set('nombre', e.target.value)}
                placeholder={term.namePh} className={`${inputCls} ${errors.nombre ? inputErrCls : ''}`} />
            </Field>

            <Field label="Estatus del proyecto" required error={errors.estatus}
              tooltip="La IA calibra el análisis según si ya tienes ventas reales o es una idea nueva.">
              <CardToggle
                value={s.estatus}
                onChange={v => set('estatus', v)}
                options={[
                  {
                    v: 'nueva_idea',
                    icon: (
                      <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    ),
                    label: 'Idea / Proyecto Nuevo',
                    sub: 'Aún no has vendido',
                  },
                  {
                    v: 'negocio_en_marcha',
                    icon: (
                      <svg className="w-5 h-5 text-brand-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    ),
                    label: 'Negocio en Marcha',
                    sub: 'Ya tienes clientes',
                  },
                ]}
              />
            </Field>

            <Field label="Tipo de actividad"
              tooltip="Producto: lo fabricas o revendes. Servicio: lo haces tú o tu equipo.">
              <CardToggle
                value={s.tipo}
                onChange={v => set('tipo', v)}
                options={[
                  {
                    v: 'producto',
                    icon: (
                      <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    ),
                    label: 'Producto',
                    sub: 'Artículo físico o digital',
                  },
                  {
                    v: 'servicio',
                    icon: (
                      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    ),
                    label: 'Servicio',
                    sub: 'Trabajo / consultoría',
                  },
                ]}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Categoría" required error={errors.categoria}
                tooltip="Agrupa tu producto con similares en el mercado. La IA la usa para encontrar competidores.">
                <select value={s.categoria} onChange={e => set('categoria', e.target.value)}
                  className={`${selectCls} ${errors.categoria ? inputErrCls : ''}`}>
                  <option value="" className={optionCls}>Seleccionar...</option>
                  {CATEGORIAS.map(c => <option key={c} value={c} className={optionCls}>{c}</option>)}
                </select>
              </Field>

              <Field label={`Imagen del ${term.entity}`} optional
                tooltip="Ayuda a identificar tu producto en el panel. No afecta el análisis.">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full border border-dashed border-white/12 rounded-xl h-[46px] flex items-center justify-center cursor-pointer hover:border-brand-primary/35 transition-all overflow-hidden group bg-[#15212f]">
                  {preview
                    ? <img src={preview} alt="Vista previa" className="h-full w-full object-cover" />
                    : <span className="text-xs text-white/35 group-hover:text-brand-primary/60 transition">+ Subir imagen</span>
                  }
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImagen} className="hidden" />
              </Field>
            </div>
          </Step>

          {/* ── STEP 2: Alcance ── */}
          <Step n={2} done={stepDone.alcance} title="Alcance y Canales" subtitle="¿Dónde y cómo vendes?">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="País" required
                tooltip="Afecta los datos económicos, moneda y competidores que usará la IA.">
                <select value={s.pais} onChange={e => set('pais', e.target.value)}
                  className={selectCls}>
                  {PAISES_LATAM.map(p => (
                    <option key={p.code} value={p.code} className={optionCls}>{p.flag} {p.nombre}</option>
                  ))}
                </select>
              </Field>

              <Field label="Cobertura geográfica" required error={errors.cobertura}
                tooltip="Local: tu ciudad. Nacional: todo el país por envíos o en línea.">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      v: 'local',
                      icon: (
                        <svg className="w-4 h-4 text-brand-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      ),
                      label: 'Local',
                      sub: 'Mi ciudad',
                    },
                    {
                      v: 'nacional',
                      icon: (
                        <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ),
                      label: 'Nacional',
                      sub: `Todo ${getPaisInfo(s.pais).nombre}`,
                    },
                  ].map(o => (
                    <button key={o.v} type="button" onClick={() => set('cobertura', o.v)}
                      className="rounded-xl border p-3 text-left transition-all duration-200"
                      style={{
                        background: s.cobertura === o.v ? 'rgba(231,76,60,0.1)' : 'rgba(255,255,255,0.04)',
                        borderColor: s.cobertura === o.v ? 'rgba(231,76,60,0.45)' : 'rgba(255,255,255,0.1)',
                      }}>
                      <div className="mb-2">{o.icon}</div>
                      <p className={`text-xs font-bold ${s.cobertura === o.v ? 'text-white' : 'text-white/60'}`}>{o.label}</p>
                      <p className="text-[10px] text-white/40">{o.sub}</p>
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {s.cobertura === 'local' && (
              <Field label="Radio de cobertura"
                tooltip="Distancia máxima a la que puedes atender clientes de forma rentable.">
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={200} value={s.radio_km}
                    onChange={e => set('radio_km', Number(e.target.value))}
                    className="flex-1 accent-brand-accent" />
                  <span className="text-sm font-mono font-bold text-white/75 w-16 text-right">{s.radio_km} km</span>
                </div>
              </Field>
            )}

            <Field label={term.dirLabel} optional
              tooltip="La dirección ayuda a la IA a identificar competidores cercanos y contexto geográfico.">
              <input type="text" value={s.direccion} onChange={e => set('direccion', e.target.value)}
                placeholder={term.dirPH} className={inputCls} />
            </Field>

            <Field label="Canal principal de venta" optional
              tooltip="¿Cómo llega tu producto al cliente? La IA ajusta el análisis según el canal.">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CANALES_VENTA.map(c => (
                  <motion.button
                    key={c.value}
                    type="button"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    onClick={() => set('canal_venta', s.canal_venta === c.value ? '' : c.value)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors duration-200"
                    style={{
                      background: s.canal_venta === c.value ? 'rgba(231,76,60,0.12)' : 'rgba(255,255,255,0.04)',
                      borderColor: s.canal_venta === c.value ? 'rgba(231,76,60,0.45)' : 'rgba(255,255,255,0.1)',
                    }}>
                    <CanalIcon value={c.value} />
                    <span className={`text-xs font-semibold leading-tight ${s.canal_venta === c.value ? 'text-white' : 'text-white/55'}`}>{c.label}</span>
                  </motion.button>
                ))}
              </div>
            </Field>
          </Step>

          {/* ── STEP 3: El Alma ── */}
          <Step n={3} done={stepDone.propuesta} title="Propuesta de Valor" subtitle="Lo que la IA usará para crear tu estrategia">

            <Field label="Descripción libre" optional
              tooltip="Cuéntale a la IA con tus propias palabras qué es tu negocio. Mientras más detalle, más personalizados los resultados.">
              <textarea rows={5} maxLength={600} value={s.descripcion} onChange={e => set('descripcion', e.target.value)}
placeholder={`Ej: "Vendo pasteles artesanales por encargo para oficinas de la colonia Roma. Uso ingredientes sin conservadores y entrego el mismo día. Mis clientes los compran para reuniones porque se ven elegantes y cuestan menos que una pastelería de centro." — ¿A quién ayudas? ¿Qué problema resuelve? ¿Qué hace diferente tu producto?`}
                className={`${inputCls} resize-none`} />
            </Field>

            <Field label="Propuesta única de valor" optional
              hint="En una oración: ¿qué te hace diferente a la competencia?"
              error={errors.puv}
              tooltip="La razón por la que un cliente te elegiría a ti y no a otro. Sin esto, la IA usa comparaciones genéricas.">
              <div className="relative">
                <textarea rows={2} maxLength={PUV_MAX} value={s.puv}
                  onChange={e => set('puv', e.target.value)}
                  placeholder='"Entregamos en 2 horas con garantía de satisfacción o devolvemos tu dinero"'
                  className={`${inputCls} resize-none pb-7 ${s.puv.length > PUV_WARN || errors.puv ? inputErrCls : ''}`} />
                <span className={`absolute bottom-2 right-3 text-[10px] tabular-nums select-none ${s.puv.length > PUV_WARN ? 'text-brand-accent' : 'text-white/30'}`}>
                  {s.puv.length}/{PUV_MAX}
                </span>
              </div>
            </Field>

            <Field label="Perfil del cliente ideal" optional
              hint="Ej: Mujeres de 25–40 años, mamás trabajadoras que buscan comida saludable rápida"
              tooltip="Describe a la persona más probable de comprar. La IA afina el análisis de mercado con esto.">
              <textarea rows={2} value={s.cliente_ideal} onChange={e => set('cliente_ideal', e.target.value)}
                placeholder="Describe a tu cliente ideal: edad, estilo de vida, necesidades..."
                className={`${inputCls} resize-none`} />
            </Field>

            <Field label="Nivel económico del cliente" optional
              tooltip="El nivel socioeconómico afecta el tamaño del mercado, la estrategia de precio y los canales de distribución.">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {NSE_OPTIONS.map(o => (
                  <motion.button
                    key={o.value}
                    type="button"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    onClick={() => set('nse', s.nse === o.value ? '' : o.value)}
                    className="rounded-xl border px-2 py-2.5 text-center transition-colors duration-200"
                    style={{
                      background: s.nse === o.value ? 'rgba(231,76,60,0.12)' : 'rgba(255,255,255,0.04)',
                      borderColor: s.nse === o.value ? 'rgba(231,76,60,0.45)' : 'rgba(255,255,255,0.1)',
                    }}>
                    <p className={`text-xs font-black ${s.nse === o.value ? 'text-white' : 'text-white/60'}`}>{o.label}</p>
                    <p className="text-[9px] text-white/40 mt-0.5 leading-tight">{o.desc}</p>
                  </motion.button>
                ))}
              </div>
            </Field>
          </Step>

          {/* ── STEP 4: Precio y Modelo ── */}
          <Step n={4} done={stepDone.precio} title="Precio y Modelo de Ingresos" subtitle="¿Cuánto vale lo que ofreces y cómo cobras?">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={term.priceLabel} optional error={errors.precio_esperado}
                hint="Precio aproximado. Puedes ajustarlo en el módulo de Finanzas."
                tooltip="La IA lo compara contra el precio promedio del mercado.">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-white/40 pointer-events-none">$</span>
                  <input type="number" min="0" step="0.01" value={s.precio_esperado}
                    onChange={e => set('precio_esperado', e.target.value)}
                    placeholder="350"
                    className={`${inputCls} pl-8 ${errors.precio_esperado ? inputErrCls : ''}`} />
                </div>
              </Field>

              <Field label="Forma de cobro" optional
                tooltip="Afecta cómo la IA calcula el flujo de dinero esperado.">
                <select value={s.modelo_cobro} onChange={e => set('modelo_cobro', e.target.value as ModeloCobro)}
                  className={selectCls}>
                  <option value="" className={optionCls}>Seleccionar...</option>
                  {MODELOS_COBRO.map(m => (
                    <option key={m.value} value={m.value} className={optionCls}>{m.label} — {m.desc}</option>
                  ))}
                </select>
              </Field>
            </div>

            {s.modelo_cobro === 'suscripcion' && (
              <div className="space-y-4 bg-brand-primary/8 border border-brand-primary/20 rounded-2xl p-5">
                <p className="text-[11px] font-bold text-brand-primary/75 uppercase tracking-widest">Detalles de suscripción</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Precio mensual" required error={errors.precio_suscripcion}
                    tooltip="El monto que cobras cada mes por cliente.">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-white/40 pointer-events-none">$</span>
                      <input type="number" min="0" value={s.precio_suscripcion}
                        onChange={e => set('precio_suscripcion', e.target.value)}
                        placeholder="299" className={`${inputCls} pl-8 ${errors.precio_suscripcion ? inputErrCls : ''}`} />
                    </div>
                  </Field>
                  <Field label="Meses promedio de retención" optional
                    tooltip="¿Cuántos meses se queda suscrito un cliente en promedio?">
                    <div className="relative">
                      <input type="number" min="1" max="120" value={s.ltv_meses}
                        onChange={e => set('ltv_meses', e.target.value)}
                        placeholder="6" className={`${inputCls} pr-16`} />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40 pointer-events-none">meses</span>
                    </div>
                  </Field>
                </div>
                {ltvPreview !== null && (
                  <div className="bg-brand-primary/12 border border-brand-primary/25 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-white/60">
                      Valor estimado por cliente:{' '}
                      <span className="text-white font-bold">${ltvPreview.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </Step>

          {/* ── STEP 5: Tracción (solo negocio en marcha) ── */}
          {s.estatus === 'negocio_en_marcha' && (
            <Step n={5} done={stepDone.traccion} title="Números Reales de tu Negocio" subtitle="Tus datos actuales hacen el análisis mucho más preciso">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={term.clientsLbl} optional
                  tooltip="Promedio de ventas o clientes al mes en los últimos 3 meses.">
                  <input type="number" min="0" value={s.clientes_mes}
                    onChange={e => set('clientes_mes', e.target.value)}
                    placeholder={isServicio ? 'Ej: 15' : 'Ej: 50'} className={inputCls} />
                </Field>

                <Field label="% de clientes que regresan" optional
                  tooltip="Clientes recurrentes son más baratos de retener que conseguir nuevos.">
                  <div className="relative">
                    <input type="number" min={0} max={100} value={s.tasa_repeticion || ''}
                      onChange={e => set('tasa_repeticion', e.target.value)}
                      placeholder="20" className={`${inputCls} pr-10`} />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-white/40 pointer-events-none">%</span>
                  </div>
                </Field>
              </div>

              <Field label="¿Cómo consigues la mayoría de tus clientes?" optional
                tooltip="El canal actual te dice qué tan escalable es tu negocio.">
                <select value={s.canal_adquisicion} onChange={e => set('canal_adquisicion', e.target.value)}
                  className={selectCls}>
                  <option value="" className={optionCls}>Seleccionar canal...</option>
                  {CANALES_ADQUISICION.map(c => <option key={c} value={c} className={optionCls}>{c}</option>)}
                </select>
              </Field>
            </Step>
          )}

          {/* ── STEP 6 (or 5 for ideas): Finanzas ── */}
          <Step n={s.estatus === 'negocio_en_marcha' ? 6 : 5} done={stepDone.finanzas} last title="Finanzas Base" subtitle="Para calcular cuándo recuperas lo invertido">

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Inversión inicial" optional
                tooltip="Todo lo que gastaste o planeas gastar para arrancar. La IA calcula en cuántos meses la recuperas.">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/40 pointer-events-none">$</span>
                  <input type="number" min="0" value={s.inversion_inicial}
                    onChange={e => set('inversion_inicial', e.target.value)}
                    placeholder="5,000" className={`${inputCls} pl-6`} />
                </div>
              </Field>

              <Field label="Gastos fijos al mes" optional
                tooltip="Costos que pagas sin importar cuánto vendas: renta, sueldos, servicios.">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/40 pointer-events-none">$</span>
                  <input type="number" min="0" value={s.costos_fijos}
                    onChange={e => set('costos_fijos', e.target.value)}
                    placeholder="2,000" className={`${inputCls} pl-6`} />
                </div>
              </Field>

              <Field label="Personas en el equipo" optional
                tooltip="Incluye socios, empleados o colaboradores pagados.">
                <div className="relative">
                  <input type="number" min="1" value={s.tamano_equipo}
                    onChange={e => set('tamano_equipo', e.target.value)}
                    placeholder="1" className={`${inputCls} pr-20`} />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40 pointer-events-none">personas</span>
                </div>
              </Field>
            </div>

            {/* Global error */}
            {errors._global && (
              <div className="bg-brand-accent/10 border border-brand-accent/25 rounded-xl px-4 py-3">
                <p className="text-brand-accent text-sm text-center">{errors._global}</p>
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <Link href="/dashboard"
                className="flex-1 text-center border border-white/12 text-white/50 py-3.5 rounded-xl text-sm font-bold hover:bg-white/6 hover:text-white/70 transition">
                Cancelar
              </Link>
              <button type="submit" disabled={loading}
                className="flex-[2] py-3.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: loading ? 'rgba(231,76,60,0.5)' : 'linear-gradient(135deg,#E74C3C,#C0392B)',
                  boxShadow: loading ? 'none' : '0 0 30px rgba(231,76,60,0.3)',
                }}>
                {loading ? '⏳ Guardando...' : `Guardar ${term.entity} →`}
              </button>
            </div>
          </Step>

        </form>

        {/* Right: sticky preview sidebar */}
        <div className="hidden xl:block">
          <PreviewSidebar s={s} isServicio={isServicio} />
        </div>

      </div>
    </div>
  );
}