'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getImageUrl } from '@/lib/utils';
import { interpretarErrorApi } from '@/lib/apiError';
import AvisoErrorApi from '@/components/ui/AvisoErrorApi';
import { PAISES_LATAM, REGIONES_POR_PAIS, getPaisInfo } from '@/lib/latam';
import { BackButton } from '@/components/ui';

/** Espejo de backend/src/services/mercado/traccionReal.ts. */
interface TraccionReal {
  clientes_mes: number;
  ticket_promedio: number;
  tasa_repeticion: number | null;
  meses_analizados: number;
  desde: string;
  hasta: string;
  confianza: 'alta' | 'media' | 'baja';
}

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  tipo: 'producto' | 'servicio';
  precio: number | null;
  imagen_url: string | null;
  estatus_proyecto: string | null;
  puv: string | null;
  inversion_inicial: number | null;
  costos_fijos: number | null;
  clientes_mes: number | null;
  tasa_repeticion: number | null;
  canal_adquisicion: string | null;
  cliente_ideal: string | null;
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-white/5 border border-white/10 text-white placeholder-white/25 rounded-xl ' +
  'px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ' +
  'focus:border-brand-primary/40 transition';

// Para <select>: appearance-none quita la flecha nativa del SO
const selectCls = inputCls + ' appearance-none cursor-pointer';

const inputErrCls = 'border-brand-accent/60 focus:ring-brand-accent/30 focus:border-brand-accent/60';

// Parsea cliente_ideal: puede venir como string legacy o como objeto JSON
// serializado (ver productos.ts). Lo aplanamos a texto legible para la tarjeta SSOT
// y devolvemos null si no hay contenido aprovechable.
function formatClienteIdeal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const txt = raw.trim();
  if (!txt) return null;
  if (txt.startsWith('{')) {
    try {
      const obj = JSON.parse(txt) as Record<string, unknown>;
      const partes = Object.values(obj)
        .filter((v): v is string | number =>
          (typeof v === 'string' && v.trim() !== '') || typeof v === 'number')
        .map(v => String(v).trim());
      if (partes.length > 0) return partes.join(' · ');
    } catch {
      // No era JSON válido — lo tratamos como texto plano.
    }
  }
  return txt;
}

// ─── Local / zona ─────────────────────────────────────────────────────────────

// Espejo de TIPOS_LOCAL en backend/src/services/zona/types.ts (el schema Zod
// rechaza cualquier valor fuera de esa lista). Si allí se añade un tipo, hay
// que añadirlo aquí también.
const TIPOS_LOCAL_OPTIONS = [
  { v: 'sin_local',            label: 'Sin local (100% online / a domicilio)' },
  { v: 'produccion_alimentos', label: 'Producción de alimentos (cocina / obrador)' },
  { v: 'retail',               label: 'Retail / tienda con piso de venta' },
  { v: 'servicio_atencion',    label: 'Servicio con atención al cliente (salón, consultorio)' },
  { v: 'oficina',              label: 'Oficina' },
  { v: 'taller',               label: 'Taller' },
  { v: 'almacen',              label: 'Almacén / bodega' },
  { v: 'ecommerce_bodega',     label: 'E-commerce con bodega' },
  { v: 'otro',                 label: 'Otro' },
] as const;

type TipoLocal = (typeof TIPOS_LOCAL_OPTIONS)[number]['v'];

// Los <input type="number"> devuelven string. Vacío o inválido → `undefined`
// para que el campo viaje AUSENTE en el JSON: para el backend ausente ≠ 0.
function toNumPos(raw: string): number | undefined {
  const txt = raw.trim();
  if (txt === '') return undefined;
  const n = Number(txt);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toNumNonNeg(raw: string): number | undefined {
  const txt = raw.trim();
  if (txt === '') return undefined;
  const n = Number(txt);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function toIntNonNeg(raw: string): number | undefined {
  const n = toNumNonNeg(raw);
  return n === undefined ? undefined : Math.round(n);
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Block({
  n, title, subtitle, children,
}: {
  n: number; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0F1C2A] rounded-2xl border border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-brand-primary/20 text-brand-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {subtitle && <p className="text-[11px] text-white/35 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

import { HelpTip } from '@/components/ui/HelpTip';

function Field({
  label, required, optional, hint, help, error, children,
}: {
  label: string; required?: boolean; optional?: boolean;
  hint?: string; help?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/75 mb-1.5">
        {label}
        {required && <span className="text-brand-accent ml-0.5">*</span>}
        {optional && <span className="text-white/30 font-normal ml-1">(opcional)</span>}
        {help && <HelpTip text={help} label={label} />}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-white/30 mt-1 leading-snug">{hint}</p>}
      {error && <p className="text-xs text-brand-accent mt-1">{error}</p>}
    </div>
  );
}

function Toggle({
  options, value, onChange,
}: {
  options: { v: string; label: string; icon?: React.ReactNode; sub?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={`grid gap-2 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-xl border p-3.5 text-left transition-all duration-200 ${
            value === o.v
              ? 'border-brand-primary bg-brand-primary/10'
              : 'border-white/10 hover:border-white/20'
          }`}
        >
          {o.icon && <div className="mb-2 text-white/70">{o.icon}</div>}
          <p className={`text-xs font-bold leading-tight ${value === o.v ? 'text-white' : 'text-white/60'}`}>
            {o.label}
          </p>
          {o.sub && <p className="text-[10px] text-white/30 mt-0.5">{o.sub}</p>}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MercadoFormPage() {
  const router = useRouter();
  const { productoId } = useParams<{ productoId: string }>();

  const [producto, setProducto] = useState<Producto | null>(null);
  const [productoError, setProductoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // El 403 por límite de plan (upgrade_required) no es un error de datos: se
  // pinta como aviso con enlace a planes, no como el error rojo de validación.
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  // Errores por campo (M2) — independientes del `error` global de servidor
  const [fieldErrors, setFieldErrors] = useState<{ scope?: string; estado?: string }>({});

  const clearFieldError = (field: 'scope' | 'estado') =>
    setFieldErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));

  // Campos propios de este formulario (NO redundantes)
  const [formaCobro, setFormaCobro] = useState('Pago Único');
  const [recurrenciaMeses, setRecurrenciaMeses] = useState('1');
  
  // Tracción (solo si Negocio en Marcha — pre-llenado desde Producto)
  const [clientesMes, setClientesMes] = useState('');
  // Tracción sacada de las ventas del POS (null = el producto aún no vende ahí).
  const [traccion, setTraccion] = useState<TraccionReal | null>(null);
  const [tasaRepeticion, setTasaRepeticion] = useState('');
  const [canalAdquisicion, setCanalAdquisicion] = useState('');

  // Alcance
  const [pais, setPais] = useState('MX');
  const [scope, setScope] = useState<'local' | 'nacional' | ''>('');
  const [estado, setEstado] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [nseTarget, setNseTarget] = useState('C / C- (Medio)');
  const [competidoresConocidos, setCompetidoresConocidos] = useState('');

  // Local y zona (todo opcional). Con `tipoLocal` vacío no se envía nada de
  // este bloque y el backend no calcula renta.
  const [tipoLocal, setTipoLocal] = useState<TipoLocal | ''>('');
  const [zona, setZona] = useState('');
  const [m2Declarados, setM2Declarados] = useState('');
  const [precioM2Mes, setPrecioM2Mes] = useState('');
  const [precioVentaM2, setPrecioVentaM2] = useState('');
  const [personal, setPersonal] = useState('');
  const [rentaDeclarada, setRentaDeclarada] = useState('');

  const paisInfo = getPaisInfo(pais);
  const regiones = REGIONES_POR_PAIS[pais] ?? [];
  const handlePaisChange = (newPais: string) => { setPais(newPais); setEstado(''); };

  useEffect(() => {
    // Navegar de un producto a otro reutiliza este componente y relanza el
    // efecto: sin este flag, la respuesta del producto anterior puede llegar
    // después y pintarse bajo el producto nuevo.
    let vigente = true;
    api.get(`/productos/${productoId}`)
      .then(({ data }) => {
        if (!vigente) return;
        setProducto(data);
        // Pre-llenar tracción desde Producto si existe
        if (data.clientes_mes) setClientesMes(String(data.clientes_mes));
        if (data.tasa_repeticion) setTasaRepeticion(String(data.tasa_repeticion));
        if (data.canal_adquisicion) setCanalAdquisicion(data.canal_adquisicion);
      })
      .catch(() => { if (vigente) setProductoError('No se pudo cargar el producto.'); });

    // Si el producto ya se vende con el POS, sus ventas describen la tracción
    // mejor que un número recordado. Manda sobre lo declarado en el producto.
    api.get(`/mercado/traccion/${productoId}`)
      .then(({ data }) => {
        if (!vigente || !data?.traccion) return;
        const t = data.traccion as TraccionReal;
        setTraccion(t);
        setClientesMes(String(t.clientes_mes));
        if (t.tasa_repeticion !== null) setTasaRepeticion(String(t.tasa_repeticion));
      })
      .catch(() => { /* sin POS no hay nada que precargar */ });

    return () => { vigente = false; };
  }, [productoId]);

  const handleAnalizar = async (ev: React.FormEvent) => {
    ev.preventDefault();

    const errs: { scope?: string; estado?: string } = {};
    if (!scope) errs.scope = 'Selecciona un alcance (Local/Nacional)';
    if (scope === 'local' && !estado) errs.estado = 'Selecciona tu región/estado para el alcance local';
    if (errs.scope || errs.estado) { setFieldErrors(errs); return; }

    setFieldErrors({});
    setError('');
    setUpgradeRequired(false);
    setLoading(true);

    try {
      const esNegocio = producto?.estatus_proyecto === 'Negocio en Marcha';
      const { data } = await api.post('/mercado/analizar', {
        producto_id: productoId,
        pais,
        scope,
        estado: scope === 'local' ? estado : undefined,
        ciudad: scope === 'local' ? ciudad : undefined,
        forma_cobro: formaCobro,
        recurrencia_meses: formaCobro === 'Suscripción' ? (Number(recurrenciaMeses) || 1) : undefined,
        clientes_mes: esNegocio ? (Number(clientesMes) || 0) : undefined,
        tasa_repeticion: esNegocio ? (Number(tasaRepeticion) || 0) : undefined,
        canal_adquisicion: esNegocio ? canalAdquisicion : undefined,
        nse_target: nseTarget,
        competidores_conocidos: competidoresConocidos.trim() || undefined,
        // Zona / local: `tipo_local` es el interruptor del cálculo de renta.
        // Los sub-campos solo se envían si hay local real (evita mandar
        // valores tecleados y luego ocultados al elegir "sin local").
        ...(tipoLocal ? { tipo_local: tipoLocal } : {}),
        ...(tipoLocal && tipoLocal !== 'sin_local'
          ? {
              zona: zona.trim().length >= 2 ? zona.trim() : undefined,
              m2_declarados: toNumPos(m2Declarados),
              precio_m2_mes_declarado: toNumPos(precioM2Mes),
              precio_venta_m2_declarado: toNumPos(precioVentaM2),
              personal: toIntNonNeg(personal),
              renta_declarada: toNumNonNeg(rentaDeclarada),
            }
          : {}),
      });
      router.push(`/dashboard/mercado/${productoId}/resultado/${data.analisis_id}`);
    } catch (err: unknown) {
      const interpretado = interpretarErrorApi(
        err,
        'Error al iniciar análisis de mercado. Revisa tus datos.',
      );
      setError(interpretado.mensaje);
      setUpgradeRequired(interpretado.upgradeRequired);
      setLoading(false);
    }
  };

  if (productoError) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <p className="text-white/50 text-sm">{productoError}</p>
        <Link href="/dashboard" className="text-sm mt-2 block hover:underline">← Volver al dashboard</Link>
      </div>
    );
  }

  if (!producto) {
    return <div className="flex items-center justify-center h-64 text-white/50 text-sm">Cargando...</div>;
  }

  const isServicio = producto.tipo === 'servicio';
  const esNegocioEnMarcha = producto.estatus_proyecto === 'Negocio en Marcha';
  const clienteIdealTxt = formatClienteIdeal(producto.cliente_ideal);

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <BackButton
          href={`/dashboard/producto/${productoId}`}
          label="Ficha del producto"
          className="mb-4"
        />
        <h1 className="text-2xl font-bold text-white mb-2">
          Inteligencia de Mercado
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Validaremos la viabilidad de tu negocio de forma certera y práctica usando Inteligencia Artificial.
        </p>

        {/* Producto Card */}
        <div className="bg-[#0F1C2A] rounded-2xl p-5 mt-6 flex items-center gap-4 border border-white/10">
          <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
            {getImageUrl(producto.imagen_url)
              ? <img src={getImageUrl(producto.imagen_url)!} alt={producto.nombre} className="w-full h-full object-cover" />
              : (
                <svg className="w-6 h-6 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m7.5 4.27 9 5.15"/>
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                  <path d="m3.3 7 8.7 5 8.7-5"/>
                  <path d="M12 22V12"/>
                </svg>
              )}
          </div>
          <div>
            <p className="font-bold text-white text-base">{producto.nombre}</p>
            <p className="text-xs text-white/50 mt-0.5">{producto.categoria}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleAnalizar} noValidate className="flex flex-col gap-4">

        {/* 1. Tarjeta SSOT — Datos del ADN (read-only) */}
        <Block n={1} title="ADN de tu Negocio" subtitle="Estos datos se leen de tu perfil de producto (edítalos ahí si cambian)">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Tipo', value: isServicio ? 'Servicio' : 'Producto' },
              { label: 'Estatus', value: esNegocioEnMarcha ? 'En Marcha' : 'Idea' },
              { label: 'Inversión Total', value: producto.inversion_inicial ? `$${Number(producto.inversion_inicial).toLocaleString('es-MX')}` : 'No registrada' },
              { label: 'Precio Venta', value: producto.precio ? `$${Number(producto.precio).toLocaleString('es-MX')}` : 'No registrado' },
            ].map(item => (
              <div key={item.label} className="bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">{item.label}</p>
                <p className="text-sm font-bold text-white mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
          {producto.puv && (
            <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 mt-4">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Propuesta Única de Valor (PUV)</p>
              <p className="text-sm text-white/80 leading-snug">{producto.puv}</p>
            </div>
          )}
          {clienteIdealTxt && (
            <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 mt-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Cliente Ideal</p>
              <p className="text-sm text-white/80 leading-snug">{clienteIdealTxt}</p>
            </div>
          )}
          {(!producto.inversion_inicial || !producto.puv || !clienteIdealTxt) && (
            <div className="bg-brand-accent/5 border border-brand-accent/10 rounded-xl px-4 py-3 mt-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-brand-accent shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-xs text-brand-accent/80">
                Faltan datos en tu perfil de producto. <Link href={`/dashboard/producto/${productoId}`} className="underline font-semibold">Edítalo aquí</Link> para que la IA produzca mejores resultados.
              </p>
            </div>
          )}
        </Block>

        {/* 2. Modelo de Ingresos (campo propio de este form) */}
        <Block n={2} title="Modelo de Ingresos" subtitle="Cómo cobras a tus clientes">
          <Field label="Forma de Cobro" required help="Pago Único = el cliente paga una vez por compra (ej. una venta de producto). Suscripción = paga de forma recurrente cada mes. Esto cambia cómo la IA calcula tu ingreso por cliente (LTV).">
            <Toggle
              value={formaCobro}
              onChange={(v) => setFormaCobro(v)}
              options={[
                { v: 'Pago Único', label: 'Pago Único', sub: 'Cobro por transacción' },
                { v: 'Suscripción', label: 'Suscripción', sub: 'Recurrencia mensual' },
              ]}
            />
          </Field>

          {formaCobro === 'Suscripción' && (
            <div className="animate-fade-in">
              <Field label="Recurrencia promedio (Meses)" required help="Cuántos meses, en promedio, un cliente sigue pagando antes de darse de baja. Si la mayoría se queda ~1 año, pon 12. Es clave para estimar el valor de vida del cliente.">
                <div className="relative">
                  <input
                    type="number" min="1" value={recurrenciaMeses} onChange={e => setRecurrenciaMeses(e.target.value)}
                    placeholder="1" className={`${inputCls} pr-16`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none select-none">meses</span>
                </div>
              </Field>
            </div>
          )}
        </Block>

        {/* 3. Tracción (Si Negocio en Marcha) */}
        {esNegocioEnMarcha && (
          <div className="animate-fade-in">
            <Block n={3} title="Tracción Actual" subtitle="Basado en tus métricas reales">
              {/* Tracción del POS: se precarga sola y el usuario puede
                  corregirla. Antes había que recordarla y teclearla. */}
              {traccion && (
                <div className="mb-4 rounded-xl border border-brand-primary/25 bg-brand-primary/8 px-4 py-3">
                  <p className="text-sm font-semibold text-white">Tomado de tus ventas</p>
                  <p className="text-[11px] text-white/55 leading-relaxed mt-0.5">
                    {traccion.clientes_mes} {isServicio ? 'citas' : 'ventas'} al mes de promedio y ticket de $
                    {traccion.ticket_promedio.toLocaleString('es-MX')}, con {traccion.meses_analizados}{' '}
                    {traccion.meses_analizados === 1 ? 'mes completo' : 'meses completos'} del punto de venta
                    {traccion.tasa_repeticion !== null ? ` · ${traccion.tasa_repeticion}% de clientes repiten` : ''}.
                    {traccion.confianza === 'baja' ? ' Con un solo mes, tómalo como referencia.' : ''}
                    {' '}Puedes cambiarlo si no representa tu mes típico.
                  </p>
                </div>
              )}
              <Field label={isServicio ? 'Citas/Sesiones al mes' : 'Ventas al mes'} optional help={isServicio ? 'Número promedio de citas o sesiones que atiendes en un mes típico. Sirve para dimensionar tu tracción real frente al tamaño del mercado.' : 'Número promedio de ventas que cierras en un mes típico. Sirve para dimensionar tu tracción real frente al tamaño del mercado.'}>
                <input type="number" min="0" value={clientesMes} onChange={e => setClientesMes(e.target.value)} placeholder="Ej: 100" className={inputCls} />
              </Field>

              <Field label="Tasa de Repetición (%)" optional hint="Porcentaje de clientes que vuelve a comprar">
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min={0} max={100}
                    value={tasaRepeticion || ''}
                    onChange={e => setTasaRepeticion(e.target.value)}
                    className={inputCls + ' font-mono tabular-nums'}
                    placeholder="Ej. 20"
                  />
                  <span className="text-sm text-white/50">%</span>
                </div>
                <div className="hidden">
                  <span className="text-[10px] text-white/25">0%</span>
                  <span className="text-[10px] text-white/25">100%</span>
                </div>
              </Field>

              <Field label="Canal Principal de Adquisición" optional help="Por dónde llegan la mayoría de tus clientes hoy. La IA lo usa para evaluar tu dependencia de un solo canal y sugerir oportunidades de diversificación.">
                <select value={canalAdquisicion} onChange={e => setCanalAdquisicion(e.target.value)} className={selectCls}>
                  <option value="" className="bg-[#0F1C2A]">Seleccionar canal...</option>
                  <option value="Redes sociales (orgánico)" className="bg-[#0F1C2A]">Redes sociales (orgánico)</option>
                  <option value="Publicidad pagada (Meta / Google)" className="bg-[#0F1C2A]">Publicidad pagada (Meta / Google)</option>
                  <option value="Referidos / boca a boca" className="bg-[#0F1C2A]">Referidos / boca a boca</option>
                  <option value="WhatsApp / comunidades" className="bg-[#0F1C2A]">WhatsApp / comunidades</option>
                  <option value="Otro" className="bg-[#0F1C2A]">Otro</option>
                </select>
              </Field>
            </Block>
          </div>
        )}

        {/* 4. Alcance */}
        <Block n={esNegocioEnMarcha ? 4 : 3} title="Alcance y Demografía" subtitle="Tu foco geográfico y mercado">
          <Field label="País" required>
            <select value={pais} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handlePaisChange(e.target.value)} className={selectCls}>
              {PAISES_LATAM.map(p => (
                <option key={p.code} value={p.code} className="bg-[#0F1C2A]">{p.nombre} ({p.code})</option>
              ))}
            </select>
          </Field>

          <Field label="Cobertura Geográfica" required error={fieldErrors.scope}>
            <Toggle
              value={scope}
              onChange={v => { setScope(v as 'local' | 'nacional'); clearFieldError('scope'); }}
              options={[
                {
                  v: 'local',
                  icon: (
                    <svg className="w-5 h-5 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  ),
                  label: 'Local',
                  sub: 'Mi región/ciudad',
                },
                {
                  v: 'nacional',
                  icon: (
                    <svg className="w-5 h-5 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                      <path d="M2 12h20" />
                    </svg>
                  ),
                  label: 'Nacional',
                  sub: `Todo ${paisInfo.nombre}`,
                },
              ]}
            />
          </Field>

          {scope === 'local' && (
            <div className="animate-fade-in grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <Field label="Estado / Región" required error={fieldErrors.estado}>
                {regiones.length > 0 ? (
                  <select value={estado} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setEstado(e.target.value); clearFieldError('estado'); }} className={`${selectCls} ${fieldErrors.estado ? inputErrCls : ''}`}>
                    <option value="" className="bg-[#0F1C2A]">Seleccionar región...</option>
                    {regiones.map(r => <option key={r} value={r} className="bg-[#0F1C2A]">{r}</option>)}
                  </select>
                ) : (
                  <input type="text" value={estado} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEstado(e.target.value); clearFieldError('estado'); }} placeholder="Ej: Región Capital" className={`${inputCls} ${fieldErrors.estado ? inputErrCls : ''}`} />
                )}
              </Field>
              <Field label="Ciudad" optional>
                <input type="text" value={ciudad} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCiudad(e.target.value)} placeholder="Ej: Ciudad capital" className={inputCls} />
              </Field>
            </div>
          )}

          <Field label="Nivel Socioeconómico (NSE) Target" required help="El segmento de poder adquisitivo de tu cliente ideal. Define el tamaño real del mercado que puede pagar tu precio y ajusta las estimaciones de demanda.">
            <select value={nseTarget} onChange={e => setNseTarget(e.target.value)} className={selectCls}>
              <option value="A/B (Alto)" className="bg-[#0F1C2A]">A/B (Clase Alta)</option>
              <option value="C+ (Medio Alto)" className="bg-[#0F1C2A]">C+ (Clase Media Alta)</option>
              <option value="C / C- (Medio)" className="bg-[#0F1C2A]">C / C- (Clase Media)</option>
              <option value="D+ / D (Bajo)" className="bg-[#0F1C2A]">D+ / D (Clase Baja)</option>
            </select>
          </Field>

          <Field
            label="Competidores que ya conoces"
            optional
            hint="La IA los mencionará por nombre en el DAFO. Ej: Natura, Herbalife, marca local XYZ"
            help="Marcas o negocios contra los que ya compites (grandes o del barrio). La IA los analiza por nombre en el DAFO para detectar tu hueco de oportunidad frente a ellos."
          >
            <textarea
              rows={2}
              value={competidoresConocidos}
              onChange={e => setCompetidoresConocidos(e.target.value)}
              maxLength={300}
              placeholder="Ej: Competidor A, Competidor B, tienda del barrio..."
              className={`${inputCls} resize-none`}
            />
          </Field>
        </Block>

        {/* 5. Local y Zona — alimenta la renta mensual estimada (m² × precio m²) */}
        <Block
          n={esNegocioEnMarcha ? 5 : 4}
          title="Local y Zona"
          subtitle="Opcional — con esto estimamos la renta mensual de tu local"
        >
          <Field
            label="Tipo de local"
            optional
            hint="Si lo dejas vacío no estimamos renta: preferimos no inventar un local que no declaraste."
            help="Define cuántos m² necesita tu operación: una cocina de producción no ocupa lo mismo que una oficina o una bodega."
          >
            <select
              value={tipoLocal}
              onChange={e => setTipoLocal(e.target.value as TipoLocal | '')}
              className={selectCls}
            >
              <option value="" className="bg-[#0F1C2A]">Aún no lo sé — no estimar renta</option>
              {TIPOS_LOCAL_OPTIONS.map(t => (
                <option key={t.v} value={t.v} className="bg-[#0F1C2A]">{t.label}</option>
              ))}
            </select>
          </Field>

          {tipoLocal !== '' && tipoLocal !== 'sin_local' && (
            <div className="animate-fade-in flex flex-col gap-5">
              <Field
                label="Zona / colonia"
                optional
                hint="Si la dejas vacía usamos la ciudad de tu alcance para estimar el precio por m²."
                help="La zona concreta cambia mucho el precio por m². Cuanto más específica, mejor la estimación de renta."
              >
                <input
                  type="text"
                  value={zona}
                  onChange={e => setZona(e.target.value)}
                  maxLength={120}
                  placeholder="Ej: Centro, zona industrial, av. principal..."
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="m² del local"
                  optional
                  hint="Si ya lo tienes o lo cotizaste, tus m² reales tienen prioridad sobre nuestro modelo."
                >
                  <div className="relative">
                    <input
                      type="number" min="1" max="100000" step="1"
                      value={m2Declarados}
                      onChange={e => setM2Declarados(e.target.value)}
                      placeholder="Ej: 80"
                      className={`${inputCls} pr-12 font-mono tabular-nums`}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none select-none">m²</span>
                  </div>
                </Field>

                <Field
                  label="Precio por m² al mes"
                  optional
                  hint="En la moneda de tu país. Déjalo vacío si no conoces el precio de la zona."
                >
                  <input
                    type="number" min="1" max="1000000" step="1"
                    value={precioM2Mes}
                    onChange={e => setPrecioM2Mes(e.target.value)}
                    placeholder="Ej: 350"
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </Field>

                <Field
                  label="Precio de venta por m²"
                  optional
                  hint="Lo que costaría COMPRAR el m² en tu zona. Con esto comparamos rentar vs comprar."
                  help="Tasación, anuncio o precio de cierre de un local parecido. Sin este dato no comparamos compra contra renta: no lo inventamos."
                >
                  <input
                    type="number" min="1" max="100000000" step="1"
                    value={precioVentaM2}
                    onChange={e => setPrecioVentaM2(e.target.value)}
                    placeholder="Ej: 30000"
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </Field>

                <Field
                  label="Personas en el local"
                  optional
                  hint="Trabajando al mismo tiempo. Si lo dejas vacío usamos el tamaño de equipo de tu producto."
                >
                  <input
                    type="number" min="0" max="1000" step="1"
                    value={personal}
                    onChange={e => setPersonal(e.target.value)}
                    placeholder="Ej: 3"
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </Field>

                <Field
                  label="Renta mensual real"
                  optional
                  hint="Si ya la pagas o tienes cotización, la usamos tal cual en vez de estimarla."
                >
                  <input
                    type="number" min="0" max="100000000" step="1"
                    value={rentaDeclarada}
                    onChange={e => setRentaDeclarada(e.target.value)}
                    placeholder="Ej: 28000"
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </Field>
              </div>
            </div>
          )}
        </Block>

        {/* Aviso de error: ámbar con salida a /dashboard/billing cuando el 403
            viene de un gate de plan, rojo de validación en cualquier otro caso.
            El componente ya devuelve null si `error` está vacío. */}
        <AvisoErrorApi mensaje={error} upgradeRequired={upgradeRequired} />

        <button
          type="submit"
          disabled={loading || !scope}
          className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(59,130,246,0.3)] mt-2"
        >
          {loading ? 'Procesando Inteligencia de Negocio...' : 'Lanzar Análisis de Mercado'}
        </button>

      </form>
    </div>
  );
}
