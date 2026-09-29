'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getImageUrl } from '@/lib/utils';
import { interpretarErrorApi } from '@/lib/apiError';
import AvisoErrorApi from '@/components/ui/AvisoErrorApi';
import { BackButton } from '@/components/ui';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number | null;
  imagen_url: string | null;
  costos_fijos: number | null;
  inversion_inicial: number | null;
}

interface FormData {
  precio_venta: string;
  costo_variable_unitario: string;
  costos_fijos_mensuales: string;
  unidades_mes_inicial: string;
  tasa_crecimiento_mensual: string;
  /** Opcional: sin ella no hay payback que calcular. */
  inversion_inicial: string;
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-white/5 border border-white/10 text-white placeholder-white/25 rounded-xl ' +
  'px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-finanzas/40 ' +
  'focus:border-finanzas/40 transition font-mono tabular-nums';

const inputErrCls = 'border-brand-accent/70 focus:ring-brand-accent/40 focus:border-brand-accent/40';

// ─── Micro-components ─────────────────────────────────────────────────────────

function Block({
  n, title, subtitle, children,
}: {
  n: number; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0F1C2A] rounded-2xl border border-white/10 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-finanzas/20 text-finanzas text-xs font-bold flex items-center justify-center flex-shrink-0">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {subtitle && <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

import ValorHeredado from '@/components/ui/ValorHeredado';
import { HelpTip } from '@/components/ui/HelpTip';

function Field({
  label, unit, hint, help, error, heredado, children,
}: {
  label: string; unit?: string; hint?: string; help?: string; error?: string;
  /** true = el valor se rellenó solo desde el alta del producto. */
  heredado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/80 mb-1.5">
        {label}
        {unit && <span className="text-white/35 font-normal ml-1">({unit})</span>}
        {help && <HelpTip text={help} label={label} />}
        {heredado && <ValorHeredado className="ml-2" />}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-white/30 mt-1.5 leading-snug">{hint}</p>}
      {error && <p className="text-xs text-brand-accent mt-1.5">{error}</p>}
    </div>
  );
}

/** Lo que devuelve GET /api/finanzas/calibracion/:productoId. */
interface Calibracion {
  ingreso_promedio_mensual: number;
  egreso_promedio_mensual: number;
  costos_fijos_sugeridos: number;
  tasa_crecimiento_mensual: number | null;
  meses_analizados: number;
  confianza: 'alta' | 'media' | 'baja';
  advertencias: string[];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinanzasScopePage() {
  const router = useRouter();
  const { productoId } = useParams<{ productoId: string }>();
  const [producto, setProducto] = useState<Producto | null>(null);
  // Campos que se rellenaron solos, para poder marcarlos en la UI.
  const [heredados, setHeredados] = useState<Set<string>>(new Set());
  const [productoError, setProductoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // true → el error es un gate de plan (403 + upgrade_required), no datos inválidos
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  // Errores por campo (M2) — independientes del `error` global de servidor
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [desglozarCostos, setDesglozarCostos] = useState(false);
  const [desglose, setDesglose] = useState({ renta: '', sueldos: '', publicidad: '', software: '', otros: '' });
  // Números reales del negocio (contabilidad + POS). La plataforma ya los tenía
  // y el formulario los pedía igual a mano.
  const [calibracion, setCalibracion] = useState<Calibracion | null>(null);
  const [calibracionAplicada, setCalibracionAplicada] = useState(false);
  const [form, setForm] = useState<FormData>({
    precio_venta: '',
    costo_variable_unitario: '',
    costos_fijos_mensuales: '',
    unidades_mes_inicial: '',
    tasa_crecimiento_mensual: '10',
    inversion_inicial: '',
  });

  useEffect(() => {
    // Navegar de un producto a otro reutiliza este componente y relanza el
    // efecto: sin este flag, la respuesta del producto anterior puede llegar
    // después y pintarse bajo el producto nuevo.
    let vigente = true;
    api.get(`/productos/${productoId}`)
      .then(({ data }) => {
        if (!vigente) return;
        setProducto(data);
        // Pre-llenado desde lo que el usuario ya contestó en el alta. Solo se
        // rellenan campos vacíos: si ya escribió algo, manda lo suyo.
        const heredados: Record<string, string> = {};
        const precio = Number(data?.precio);
        if (Number.isFinite(precio) && precio > 0) heredados.precio_venta = String(precio);
        const fijos = Number(data?.costos_fijos);
        if (Number.isFinite(fijos) && fijos > 0) heredados.costos_fijos_mensuales = String(fijos);
        const clientes = Number(data?.clientes_mes);
        if (Number.isFinite(clientes) && clientes > 0) heredados.unidades_mes_inicial = String(clientes);
        const inversion = Number(data?.inversion_inicial);
        if (Number.isFinite(inversion) && inversion > 0) heredados.inversion_inicial = String(inversion);

        if (Object.keys(heredados).length > 0) {
          setHeredados(new Set(Object.keys(heredados)));
          setForm((f) => {
            const next = { ...f };
            for (const [k, v] of Object.entries(heredados)) {
              if (!next[k as keyof typeof next]) (next as Record<string, string>)[k] = v;
            }
            return next;
          });
        }
      })
      .catch(() => { if (vigente) setProductoError('No se pudo cargar el producto.'); });

    // Si el negocio ya factura, sus propios números valen más que una
    // estimación tecleada. Se ofrecen, no se imponen.
    api.get(`/finanzas/calibracion/${productoId}`)
      .then(({ data }) => {
        if (vigente && data?.meses_analizados > 0) setCalibracion(data as Calibracion);
      })
      .catch(() => { /* sin contabilidad cargada no hay nada que ofrecer */ });

    return () => { vigente = false; };
  }, [productoId]);

  /** Vuelca la calibración en el formulario. */
  function usarNumerosReales() {
    if (!calibracion) return;
    setForm((f) => ({
      ...f,
      costos_fijos_mensuales: calibracion.costos_fijos_sugeridos > 0
        ? String(Math.round(calibracion.costos_fijos_sugeridos))
        : f.costos_fijos_mensuales,
      tasa_crecimiento_mensual: calibracion.tasa_crecimiento_mensual !== null
        ? String(Math.round(calibracion.tasa_crecimiento_mensual * 10) / 10)
        : f.tasa_crecimiento_mensual,
    }));
    setCalibracionAplicada(true);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setFieldErrors((prev) => (prev[name as keyof FormData] ? { ...prev, [name]: undefined } : prev));
  };

  const handleDesgloseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = { ...desglose, [e.target.name]: e.target.value };
    setDesglose(updated);
    const total = Object.values(updated).reduce((sum, v) => sum + (Number(v) || 0), 0);
    setForm((f) => ({ ...f, costos_fijos_mensuales: total > 0 ? String(total) : '' }));
  };

  const handleAnalizar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');

    const labels: Record<keyof FormData, string> = {
      precio_venta: 'El precio de venta',
      costo_variable_unitario: 'El costo variable unitario',
      costos_fijos_mensuales: 'Los costos fijos mensuales',
      unidades_mes_inicial: 'Las unidades del mes 1',
      tasa_crecimiento_mensual: 'La tasa de crecimiento',
      inversion_inicial: 'La inversión inicial',
    };
    const nums = ['precio_venta', 'costo_variable_unitario', 'costos_fijos_mensuales', 'unidades_mes_inicial', 'tasa_crecimiento_mensual'] as const;
    const errs: Partial<Record<keyof FormData, string>> = {};
    for (const k of nums) {
      if (!form[k] || isNaN(Number(form[k])) || Number(form[k]) < 0) {
        errs[k] = `${labels[k]} debe ser un número válido (≥ 0).`;
      }
    }
    if (!errs.precio_venta && !errs.costo_variable_unitario && Number(form.precio_venta) <= Number(form.costo_variable_unitario)) {
      errs.precio_venta = 'El precio de venta debe ser mayor al costo variable unitario.';
    }
    // La inversión es opcional, pero si se escribe tiene que ser un número.
    if (form.inversion_inicial && (isNaN(Number(form.inversion_inicial)) || Number(form.inversion_inicial) < 0)) {
      errs.inversion_inicial = 'La inversión inicial debe ser un número válido (≥ 0).';
    }
    // Por encima del 50 % mensual el backend rechaza: una proyección así no
    // describe ningún negocio (×86 en un año).
    if (!errs.tasa_crecimiento_mensual && Number(form.tasa_crecimiento_mensual) > 50) {
      errs.tasa_crecimiento_mensual = 'Un crecimiento mayor al 50% mensual no es proyectable: revisa el dato.';
    }
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setFieldErrors({});
    setError('');
    setUpgradeRequired(false);
    setLoading(true);
    try {
      const { data } = await api.post('/finanzas/analizar', {
        producto_id: productoId,
        precio_venta: Number(form.precio_venta),
        costo_variable_unitario: Number(form.costo_variable_unitario),
        costos_fijos_mensuales: Number(form.costos_fijos_mensuales),
        unidades_mes_inicial: Number(form.unidades_mes_inicial),
        tasa_crecimiento_mensual: Number(form.tasa_crecimiento_mensual),
        inversion_inicial: form.inversion_inicial ? Number(form.inversion_inicial) : null,
      });
      router.push(`/dashboard/finanzas/${productoId}/resultado/${data.analisis_id}`);
    } catch (err: unknown) {
      const interpretado = interpretarErrorApi(
        err,
        'Error al iniciar la proyección financiera. Revisa tus datos.',
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

  const imgUrl = getImageUrl(producto.imagen_url);
  const margen =
    form.precio_venta && form.costo_variable_unitario && Number(form.precio_venta) > 0
      ? Math.round(((Number(form.precio_venta) - Number(form.costo_variable_unitario)) / Number(form.precio_venta)) * 100)
      : null;

  const crecimientoLabel =
    Number(form.tasa_crecimiento_mensual) <= 5 ? 'Conservador' :
    Number(form.tasa_crecimiento_mensual) <= 15 ? 'Moderado' :
    Number(form.tasa_crecimiento_mensual) <= 30 ? 'Optimista' : 'Muy agresivo';

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <BackButton
          href={`/dashboard/producto/${productoId}`}
          label="Ficha del producto"
          className="mb-4"
        />
        <h1 className="text-2xl font-bold text-white mb-2">Proyección Financiera</h1>
        <p className="text-sm text-white/40 mt-1">
          Proyección a 12 meses, punto de equilibrio y análisis de sensibilidad en 3 escenarios.
        </p>

        {/* Producto Card */}
        <div className="bg-[#0F1C2A] rounded-2xl p-5 mt-6 flex items-center gap-4 border border-white/8 shadow-sm">
          <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
            {imgUrl
              ? <img src={imgUrl} alt={producto.nombre} className="w-full h-full object-cover" />
              : (
                <svg className="w-6 h-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
              )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white truncate">{producto.nombre}</p>
            <p className="text-sm text-white/50">{producto.categoria}</p>
          </div>
          {producto.inversion_inicial && (
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">Inversión registrada</p>
              <p className="text-sm font-bold text-finanzas font-mono">${Number(producto.inversion_inicial).toLocaleString('es-MX')}</p>
              <p className="text-[10px] text-white/30">usada para calcular payback</p>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleAnalizar} noValidate className="flex flex-col gap-4">

        {/* Números reales del negocio: la plataforma ya los tiene en
            contabilidad y el formulario los pedía igual a mano. */}
        {calibracion && (
          <div className="bg-finanzas/8 border border-finanzas/25 rounded-2xl px-4 py-3.5 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {calibracionAplicada ? 'Usando tus números reales' : 'Tenemos tus números reales'}
              </p>
              <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">
                {calibracion.meses_analizados} {calibracion.meses_analizados === 1 ? 'mes' : 'meses'} de tu contabilidad:
                {' '}costos fijos ≈ ${Math.round(calibracion.costos_fijos_sugeridos).toLocaleString('es-MX')}/mes
                {calibracion.tasa_crecimiento_mensual !== null
                  ? `, crecimiento real ${calibracion.tasa_crecimiento_mensual > 0 ? '+' : ''}${Math.round(calibracion.tasa_crecimiento_mensual * 10) / 10}% mensual`
                  : ''}
                {calibracion.confianza !== 'alta' ? ` · confianza ${calibracion.confianza} (pocos meses de historial)` : ''}
              </p>
            </div>
            {!calibracionAplicada && (
              <button
                type="button"
                onClick={usarNumerosReales}
                className="px-3 h-9 rounded-xl bg-finanzas/20 border border-finanzas/40 text-xs font-medium text-white hover:bg-finanzas/30 transition-colors"
              >
                Usar mis números
              </button>
            )}
          </div>
        )}

        {/* BLOQUE 1 - Estructura de Precios */}
        <Block n={1} title="Estructura de Precios y Costos" subtitle="La base del modelo financiero">

          <Field label="Precio de venta unitario" unit="MXN" heredado={heredados.has('precio_venta')} help="El precio final que paga tu cliente por una unidad, sin descuentos. Es la base de todo el modelo: ingreso, margen y punto de equilibrio." error={fieldErrors.precio_venta}>
            <input
              type="number" name="precio_venta"
              value={form.precio_venta} onChange={handleChange}
              placeholder="ej. 299" min="0"
              className={`${inputCls} ${fieldErrors.precio_venta ? inputErrCls : ''}`}
            />
          </Field>

          <Field
            label="Costo variable por unidad"
            unit="MXN"
            hint="Incluye: producción, empaque, envío, comisión de plataforma."
            help="Lo que te cuesta producir y entregar UNA unidad. Solo costos que suben si vendes más (materia prima, empaque, envío, comisiones). No incluyas renta ni sueldos fijos."
            error={fieldErrors.costo_variable_unitario}
          >
            <input
              type="number" name="costo_variable_unitario"
              value={form.costo_variable_unitario} onChange={handleChange}
              placeholder="ej. 120" min="0"
              className={`${inputCls} ${fieldErrors.costo_variable_unitario ? inputErrCls : ''}`}
            />
            {margen !== null && (
              <p className={`text-xs mt-1.5 font-semibold ${margen >= 40 ? 'text-green-400' : margen >= 25 ? 'text-yellow-400' : 'text-orange-400'}`}>
                Margen de contribución: {margen}%
                {margen < 25 ? ' — Revisa tu estructura de costos' : margen >= 40 ? ' — Margen saludable' : ''}
              </p>
            )}
          </Field>

          <Field label="Costos fijos mensuales" unit="MXN" heredado={heredados.has('costos_fijos_mensuales')} help="Gastos que pagas cada mes vendas o no: renta, sueldos, software, publicidad fija. Determinan cuántas unidades necesitas vender para no perder dinero." error={fieldErrors.costos_fijos_mensuales}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-white/40">Renta, sueldos, publicidad fija, suscripciones...</span>
              <button
                type="button"
                onClick={() => setDesglozarCostos((v) => !v)}
                className="text-[11px] text-finanzas/80 hover:text-finanzas font-semibold transition"
              >
                {desglozarCostos ? '− Colapsar desglose' : '+ Desglosar por categoría'}
              </button>
            </div>

            {desglozarCostos ? (
              <div className="space-y-2">
                {([
                  { name: 'renta',       label: 'Renta / local' },
                  { name: 'sueldos',     label: 'Sueldos y nómina' },
                  { name: 'publicidad',  label: 'Publicidad fija (Meta Ads, Google...)' },
                  { name: 'software',    label: 'Software y suscripciones' },
                  { name: 'otros',       label: 'Otros costos fijos' },
                ] as const).map((f) => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span className="text-xs text-white/40 w-44 flex-shrink-0">{f.label}</span>
                    <input
                      type="number" name={f.name} min="0"
                      value={desglose[f.name]}
                      onChange={handleDesgloseChange}
                      placeholder="0"
                      className={`${inputCls} flex-1`}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-white/10 pt-2 mt-1">
                  <span className="text-xs font-semibold text-white/60">Total costos fijos</span>
                  <span className="text-sm font-bold text-finanzas font-mono">
                    ${Number(form.costos_fijos_mensuales || 0).toLocaleString('es-MX')} MXN
                  </span>
                </div>
              </div>
            ) : (
              <input
                type="number" name="costos_fijos_mensuales"
                value={form.costos_fijos_mensuales} onChange={handleChange}
                placeholder="ej. 8000" min="0"
                className={`${inputCls} ${fieldErrors.costos_fijos_mensuales ? inputErrCls : ''}`}
              />
            )}
          </Field>

        </Block>

        {/* BLOQUE 2 - Proyección de Ventas */}
        <Block n={2} title="Proyección de Ventas" subtitle="Punto de partida y ritmo de crecimiento esperado">

          <Field
            label="Unidades que esperas vender el mes 1"
            heredado={heredados.has('unidades_mes_inicial')}
            hint="Sé conservador — es mejor superar que decepcionar."
            error={fieldErrors.unidades_mes_inicial}
          >
            <input
              type="number" name="unidades_mes_inicial"
              value={form.unidades_mes_inicial} onChange={handleChange}
              placeholder="ej. 30" min="1"
              className={`${inputCls} ${fieldErrors.unidades_mes_inicial ? inputErrCls : ''}`}
            />
          </Field>

          <Field label="Tasa de crecimiento mensual estimada" unit="%" help="Cuánto esperas que aumenten tus ventas cada mes respecto al anterior. 5% es conservador, 10–15% moderado, +30% muy agresivo. Mejor quedarte corto que inflarlo." error={fieldErrors.tasa_crecimiento_mensual}>
            <div className="flex items-center gap-2">
              <input
                type="number" name="tasa_crecimiento_mensual"
                value={form.tasa_crecimiento_mensual} onChange={handleChange}
                min="0" max="50"
                className={`${inputCls} ${fieldErrors.tasa_crecimiento_mensual ? inputErrCls : ''}`}
                placeholder="Ej. 10"
              />
              <span className="text-sm text-white/50">%</span>
            </div>
            <div className="flex items-center justify-between mt-2 px-0.5">
              <span className={`text-xs font-semibold ${
                Number(form.tasa_crecimiento_mensual) <= 5 ? 'text-blue-400' :
                Number(form.tasa_crecimiento_mensual) <= 15 ? 'text-green-400' :
                Number(form.tasa_crecimiento_mensual) <= 30 ? 'text-yellow-400' : 'text-orange-400'
              }`}>
                {crecimientoLabel}
              </span>
              <span className="text-[11px] text-white/25">
                {Number(form.tasa_crecimiento_mensual) > 0
                  ? `+${Number(form.tasa_crecimiento_mensual)}% cada mes`
                  : 'Sin crecimiento proyectado'}
              </span>
            </div>
          </Field>

          <Field
            label="Inversión inicial"
            unit="opcional"
            heredado={heredados.has('inversion_inicial')}
            help="Todo lo que costó arrancar: equipo, obra, inventario inicial, depósitos, permisos. Sin este dato no calculamos el payback — antes decíamos «recuperas tu inversión en 1 mes» sin saber cuánto habías invertido."
            error={fieldErrors.inversion_inicial}
          >
            <input
              type="number" name="inversion_inicial"
              value={form.inversion_inicial} onChange={handleChange}
              placeholder="ej. 150000" min="0"
              className={`${inputCls} ${fieldErrors.inversion_inicial ? inputErrCls : ''}`}
            />
          </Field>

          <div className="bg-finanzas/5 border border-finanzas/15 rounded-xl px-4 py-3">
            <p className="text-[11px] text-finanzas/70 leading-relaxed">
              Calcularemos 3 escenarios (pesimista, base, optimista) y el punto de equilibrio exacto. El payback solo aparece si declaras la inversión inicial.
            </p>
          </div>

        </Block>

        <AvisoErrorApi mensaje={error} upgradeRequired={upgradeRequired} />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-finanzas text-white py-4 rounded-xl font-bold hover:opacity-90 transition disabled:opacity-40 shadow-[0_0_20px_rgba(16,185,129,0.25)] mt-2 text-sm"
        >
          {loading ? 'Calculando proyección financiera...' : 'Generar Proyección a 12 Meses'}
        </button>
        <p className="text-center text-[11px] text-white/30">
          Proyección · Punto de equilibrio · Análisis de sensibilidad · Payback
        </p>

      </form>
    </div>
  );
}
