'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';
import AvisoErrorApi from '@/components/ui/AvisoErrorApi';
import { motion, AnimatePresence } from 'framer-motion';
import { BackButton } from '@/components/ui';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  tipo: 'producto' | 'servicio';
  pais: string;
  imagen_url: string | null;
  descripcion: string | null;
}

// ─── Shared CSS ────────────────────────────────────────────────────────────────
const inputCls =
  'w-full bg-white/5 border border-white/10 text-white placeholder-white/25 rounded-xl ' +
  'px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/40 ' +
  'focus:border-[#7C3AED]/40 transition';

const selectCls = inputCls + ' appearance-none cursor-pointer';

function IconBalanza({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h18" />
    </svg>
  );
}

function IconEscudoCheck({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconAviso({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ─── Card de paso del formulario ──────────────────────────────────────────────
function Block({ n, title, subtitle, children }: {
  n: number; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0F1C2A] rounded-2xl border border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-[#7C3AED]/20 text-[#A78BFA] text-xs font-bold flex items-center justify-center flex-shrink-0">
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

function Field({ label, required, optional, hint, error, children }: {
  label: string; required?: boolean; optional?: boolean;
  hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/75 mb-1.5">
        {label}
        {required && <span className="text-[#F87171] ml-0.5">*</span>}
        {optional && <span className="text-white/30 font-normal ml-1">(opcional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-white/30 mt-1 leading-snug">{hint}</p>}
      {error && <p className="text-xs text-[#F87171] mt-1">{error}</p>}
    </div>
  );
}

// ─── Switch booleano ──────────────────────────────────────────────────────────
function SwitchField({ label, sublabel, value, onChange, id }: {
  label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void; id: string;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all duration-200 ${
        value
          ? 'bg-[#7C3AED]/10 border-[#7C3AED]/30 text-[#A78BFA]'
          : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
      }`}
    >
      <div className="text-left">
        <div className="text-sm font-medium text-white">{label}</div>
        {sublabel && <div className="text-[11px] text-white/35 mt-0.5">{sublabel}</div>}
      </div>
      <div className={`w-11 h-6 rounded-full relative transition-all duration-300 flex-shrink-0 ${
        value ? 'bg-[#7C3AED]' : 'bg-white/10'
      }`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
          value ? 'left-[22px]' : 'left-0.5'
        }`} />
      </div>
    </button>
  );
}

// ─── Nombres de países ─────────────────────────────────────────────────────────
const NOMBRE_PAIS: Record<string, string> = {
  MX: 'México', CO: 'Colombia', AR: 'Argentina', PE: 'Perú', CL: 'Chile',
  EC: 'Ecuador', UY: 'Uruguay', PY: 'Paraguay', BO: 'Bolivia', VE: 'Venezuela',
  GT: 'Guatemala', HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua',
  CR: 'Costa Rica', PA: 'Panamá', CU: 'Cuba', DO: 'República Dominicana', ES: 'España',
};

// ─── Formas jurídicas por país ─────────────────────────────────────────────────
const FORMAS_JURIDICAS: Record<string, { value: string; label: string }[]> = {
  MX: [
    { value: 'Persona Física', label: 'Persona Física (con actividad empresarial)' },
    { value: 'PFAE', label: 'PFAE — Persona Física con Actividad Empresarial' },
    { value: 'S.A. de C.V.', label: 'S.A. de C.V. — Sociedad Anónima de Capital Variable' },
    { value: 'S. de R.L. de C.V.', label: 'S. de R.L. de C.V.' },
    { value: 'SAPI de C.V.', label: 'SAPI de C.V. (para inversionistas)' },
    { value: 'Persona Moral (otro)', label: 'Persona Moral (otro tipo)' },
  ],
  CO: [
    { value: 'Persona Natural', label: 'Persona Natural' },
    { value: 'SAS', label: 'SAS — Sociedad por Acciones Simplificada' },
    { value: 'Ltda', label: 'Sociedad de Responsabilidad Limitada (Ltda)' },
    { value: 'S.A.', label: 'Sociedad Anónima (S.A.)' },
  ],
  AR: [
    { value: 'Monotributo', label: 'Monotributo / Autónomo' },
    { value: 'SRL', label: 'SRL — Sociedad de Responsabilidad Limitada' },
    { value: 'SA', label: 'SA — Sociedad Anónima' },
    { value: 'SAS', label: 'SAS — Sociedad por Acciones Simplificada' },
  ],
  PE: [
    { value: 'Persona Natural', label: 'Persona Natural con Negocio' },
    { value: 'EIRL', label: 'EIRL — Empresa Individual de Responsabilidad Limitada' },
    { value: 'SRL', label: 'SRL — Sociedad de Responsabilidad Limitada' },
    { value: 'SA', label: 'SA — Sociedad Anónima' },
  ],
  CL: [
    { value: 'Persona Natural', label: 'Persona Natural / Empresario Individual' },
    { value: 'SpA', label: 'SpA — Sociedad por Acciones' },
    { value: 'Ltda', label: 'Sociedad de Responsabilidad Limitada (Ltda)' },
    { value: 'SA', label: 'Sociedad Anónima (SA)' },
  ],
  ES: [
    { value: 'Autónomo', label: 'Autónomo / Empresario Individual' },
    { value: 'SL', label: 'SL — Sociedad Limitada' },
    { value: 'SA', label: 'SA — Sociedad Anónima' },
    { value: 'SLU', label: 'SLU — Sociedad Limitada Unipersonal' },
  ],
};

function getFormasJuridicas(pais: string) {
  return FORMAS_JURIDICAS[pais] ?? [
    { value: 'Persona Natural', label: 'Persona Natural / Autónomo' },
    { value: 'Sociedad', label: 'Sociedad / Empresa' },
    { value: 'Persona Jurídica', label: 'Persona Jurídica (otro tipo)' },
  ];
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function LegalFormPage() {
  const router = useRouter();
  const params = useParams();
  const productoId = params?.productoId as string;

  const [producto, setProducto] = useState<Producto | null>(null);
  const [loadingProducto, setLoadingProducto] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true → el error es el gate de plan del módulo (403 + upgrade_required)
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  // ─── Paso actual del wizard ──────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ─── Form state ─────────────────────────────────────────────────────────────
  const [formaJuridica, setFormaJuridica] = useState('');
  const [tieneEmpleados, setTieneEmpleados] = useState(false);
  const [numEmpleados, setNumEmpleados] = useState('');
  const [aniosOperando, setAniosOperando] = useState('0');
  const [estadoConstitucion, setEstadoConstitucion] = useState('');
  const [vendeEnLinea, setVendeEnLinea] = useState(false);
  const [exportaImporta, setExportaImporta] = useState(false);
  const [giroEspecifico, setGiroEspecifico] = useState('');

  // ─── Errores de validación ───────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Navegar de un producto a otro reutiliza este componente y relanza el
    // efecto: sin este flag, la respuesta del producto anterior puede llegar
    // después y pintarse bajo el producto nuevo.
    let vigente = true;
    if (!productoId) return;
    api.get(`/productos/${productoId}`)
      .then(({ data }) => {
        if (!vigente) return;
        setProducto(data);
        // El alta ya preguntó el tamaño del equipo: aquí se propone en vez de
        // volver a preguntarlo. El usuario lo corrige si no cuadra.
        const personas = Number(data?.tamano_equipo);
        if (Number.isFinite(personas) && personas > 0) {
          setTieneEmpleados(personas > 1);
          // El fundador no cuenta como empleado contratado.
          if (personas > 1) setNumEmpleados(String(personas - 1));
        }
      })
      .catch(() => { if (vigente) setError('No se pudo cargar el producto.'); })
      .finally(() => { if (vigente) setLoadingProducto(false); });
    return () => { vigente = false; };
  }, [productoId]);

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!formaJuridica) e.formaJuridica = 'Selecciona la forma jurídica';
    if (tieneEmpleados && numEmpleados && (Number.isNaN(Number(numEmpleados)) || Number(numEmpleados) < 0)) {
      e.numEmpleados = 'Ingresa un número válido de empleados';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (validateStep1()) setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoId) return;

    setSubmitting(true);
    setError(null);
    setUpgradeRequired(false);

    try {
      const { data } = await api.post('/legal/analizar', {
        producto_id: productoId,
        forma_juridica: formaJuridica,
        tiene_empleados: tieneEmpleados,
        numero_empleados: tieneEmpleados && numEmpleados ? Number(numEmpleados) : undefined,
        vende_en_linea: vendeEnLinea,
        exporta_importa: exportaImporta,
        giro_especifico: giroEspecifico || undefined,
        estado_constitucion: estadoConstitucion || undefined,
        anios_operando: aniosOperando,
      });
      router.push(`/dashboard/legal/${productoId}/resultado/${data.analisis_id}`);
    } catch (err: unknown) {
      // Antes se adivinaba el gate de plan con `msg.includes('Pro') || status === 403`.
      // Ahora se usa la bandera real del backend (`upgrade_required`), así que un 403
      // que NO sea de plan (p. ej. producto de otra cuenta) se muestra tal cual.
      const interpretado = interpretarErrorApi(err, 'Error al iniciar el análisis legal.');
      setError(interpretado.mensaje);
      setUpgradeRequired(interpretado.upgradeRequired);
      setSubmitting(false);
    }
  };

  if (loadingProducto) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#7C3AED]/30 border-t-[#7C3AED] rounded-full animate-spin" />
      </div>
    );
  }

  if (!producto) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <p className="text-white/50">Producto no encontrado.</p>
        <Link href="/dashboard" className="text-[#A78BFA] text-sm mt-2 block hover:underline">← Volver al dashboard</Link>
      </div>
    );
  }

  const formasJuridicas = getFormasJuridicas(producto.pais);
  const paisNombre = NOMBRE_PAIS[producto.pais] ?? producto.pais;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <BackButton
          href={`/dashboard/producto/${productoId}`}
          label="Ficha del producto"
          className="mb-4"
        />

        {/* Módulo badge */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 flex items-center justify-center border border-[#7C3AED]/30 text-[#A78BFA]">
            <IconBalanza className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">Diagnóstico de Cumplimiento Legal</h1>
            <p className="text-xs text-white/40">{producto.nombre} · {paisNombre}</p>
          </div>
        </div>

        <p className="text-sm text-white/50 leading-relaxed">
          El sistema compila y evalúa los requerimientos normativos, permisos de operación y obligaciones fiscales vigentes aplicables al giro específico de tu negocio en <strong className="text-white/70">{paisNombre}</strong>.
        </p>

        {/* Disclaimer */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 flex gap-3 mt-4">
          <IconAviso className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/60 leading-relaxed">
            <strong className="text-amber-200/80">Aviso Institucional:</strong> Este diagnóstico es informativo y de carácter preventivo. 
            No sustituye el asesoramiento específico de un abogado, notario público o contador colegiado.
          </p>
        </div>

      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              step === s
                ? 'bg-[#7C3AED] text-white shadow-[0_0_12px_rgba(124,58,237,0.5)]'
                : step > s
                  ? 'bg-[#7C3AED]/30 text-[#A78BFA]'
                  : 'bg-white/5 text-white/20'
            }`}>
              {step > s ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : s}
            </div>
            <span className={`text-xs transition-colors ${step === s ? 'text-white/70' : 'text-white/25'}`}>
              {s === 1 ? 'Estructura legal' : 'Operaciones'}
            </span>
            {s < 2 && <span className="text-white/15 mx-1">→</span>}
          </div>
        ))}
      </div>

      {/* Multi-step Container with slide-over motion transition */}
      <div className="relative overflow-hidden min-h-[450px]">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.form
              key="step1"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              onSubmit={(e) => { e.preventDefault(); handleNext(); }}
              className="space-y-5"
            >
              <Block n={1} title="Estructura jurídica" subtitle="Define la forma legal bajo la que opera tu negocio">
                <Field label="Forma jurídica" required error={errors.formaJuridica}>
                  <select
                    id="forma-juridica"
                    value={formaJuridica}
                    onChange={(e) => setFormaJuridica(e.target.value)}
                    className={`${selectCls} ${errors.formaJuridica ? 'border-[#F87171]/60' : ''}`}
                  >
                    <option value="">Seleccionar forma jurídica…</option>
                    {formasJuridicas.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                    <option value="Aún no constituida">Aún no la he constituido / No lo sé</option>
                  </select>
                </Field>

                <Field label="¿Cuánto tiempo lleva operando el negocio?" required>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { v: '0', label: 'Nuevo', sub: '0-6 meses' },
                      { v: '1-2', label: '1-2 años', sub: '' },
                      { v: '3-5', label: '3-5 años', sub: '' },
                      { v: '+5', label: '+5 años', sub: '' },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setAniosOperando(o.v)}
                        className={`rounded-xl border p-3 text-center text-xs font-semibold transition-all duration-200 ${
                          aniosOperando === o.v
                            ? 'bg-[#7C3AED]/15 border-[#7C3AED]/50 text-[#A78BFA] shadow-[0_0_12px_rgba(124,58,237,0.2)]'
                            : 'bg-white/[0.03] border-white/10 text-white/40 hover:border-white/25 hover:text-white/70'
                        }`}
                      >
                        <div className="font-bold">{o.label}</div>
                        {o.sub && <div className="text-[10px] opacity-60 mt-0.5">{o.sub}</div>}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Estado / Región donde opera" optional
                  hint={`Por ejemplo: ${producto.pais === 'MX' ? 'CDMX, Jalisco, Nuevo León…' : producto.pais === 'CO' ? 'Bogotá, Antioquia, Valle…' : 'Ciudad principal o región'}`}>
                  <input
                    id="estado-constitucion"
                    type="text"
                    value={estadoConstitucion}
                    onChange={(e) => setEstadoConstitucion(e.target.value)}
                    placeholder={`Escribe el estado, departamento o región…`}
                    className={inputCls}
                  />
                </Field>
              </Block>

              <Block n={2} title="Equipo" subtitle="El número de empleados define tus obligaciones laborales">
                <SwitchField
                  id="tiene-empleados"
                  label="¿Tienes o planeas tener empleados?"
                  sublabel="Incluye cualquier trabajador contratado formalmente"
                  value={tieneEmpleados}
                  onChange={setTieneEmpleados}
                />

                {tieneEmpleados && (
                  <Field label="¿Cuántos empleados tienes actualmente?" optional error={errors.numEmpleados}>
                    <input
                      id="num-empleados"
                      type="number"
                      min="0"
                      max="9999"
                      value={numEmpleados}
                      onChange={(e) => setNumEmpleados(e.target.value)}
                      placeholder="Ej: 3"
                      className={inputCls}
                    />
                  </Field>
                )}
              </Block>

              <button
                type="submit"
                id="btn-siguiente-paso1"
                className="w-full py-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-sm transition-all duration-200 shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] active:scale-[0.99]"
              >
                Continuar →
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="step2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <Block n={3} title="Canales y operaciones" subtitle="Determina las regulaciones adicionales que aplican">
                <SwitchField
                  id="vende-en-linea"
                  label="¿Vendes en línea / por internet?"
                  sublabel="Tienda online, marketplace, redes sociales con cobro digital"
                  value={vendeEnLinea}
                  onChange={setVendeEnLinea}
                />

                <SwitchField
                  id="exporta-importa"
                  label="¿Importas o exportas productos?"
                  sublabel="Cualquier operación de comercio exterior o internacional"
                  value={exportaImporta}
                  onChange={setExportaImporta}
                />
              </Block>

              <Block n={4} title="Aclaración del giro" subtitle="Opcional pero mejora significativamente el análisis">
                <Field
                  label="Describe con más detalle tu giro o actividad específica"
                  optional
                  hint="Ej: 'Vendo autos usados importados de EUA con financiamiento' · 'Restaurante de comida tailandesa con delivery' · 'App de créditos para empleados'"
                >
                  <textarea
                    id="giro-especifico"
                    value={giroEspecifico}
                    onChange={(e) => setGiroEspecifico(e.target.value.slice(0, 200))}
                    placeholder="Cualquier detalle relevante sobre tu giro específico que no esté claro en la categoría del producto…"
                    rows={3}
                    className={inputCls + ' resize-none leading-relaxed'}
                  />
                  <p className="text-[10px] text-white/20 text-right mt-1">{giroEspecifico.length}/200</p>
                </Field>
              </Block>

              <AvisoErrorApi
                mensaje={error}
                upgradeRequired={upgradeRequired}
                titulo="El módulo Legal requiere plan Negocio"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  id="btn-atras"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-bold text-sm transition-all duration-200"
                >
                  ← Atrás
                </button>
                <button
                  type="submit"
                  id="btn-generar-analisis-legal"
                  disabled={submitting}
                  className="flex-[2] py-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all duration-200 shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando diagnóstico…
                    </>
                  ) : (
                    <>
                      <IconEscudoCheck className="w-4 h-4" />
                      Generar Dictamen Legal
                    </>
                  )}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
