'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Briefcase,
  Compass,
  TrendingUp,
  Layers,
  Users,
  CheckCircle2,
} from 'lucide-react';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';
import InputField from '@/components/auth/InputField';
import PasswordStrength from '@/components/auth/PasswordStrength';
import AuthBackground from '@/components/auth/AuthBackground';
import BotonGoogle, { ERRORES_GOOGLE } from '@/components/auth/BotonGoogle';
import { validateEmail, getPasswordStrength, getEmailError, getPasswordError } from '@/components/auth/AuthValidation';
import { destinoSeguro } from '@/lib/rutaSegura';
import { ENTRADA_SEGURA, MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motion/tokens';

const PROGRAM_AREAS = [
  {
    id: 'viabilidad',
    tab: '01. Viabilidad',
    title: 'Auditoría de Mercado 360°',
    badge: 'Validación Previa',
    desc: 'Audita competencia en Google Maps, densidad territorial y demanda real antes de arriesgar capital.',
    detail: 'Algoritmo predictivo de saturación territorial',
    metric: 'Score 0-100',
    icon: Compass,
    color: 'text-cyan-400',
    border: 'border-cyan-400/30',
    bg: 'bg-cyan-500/10',
    tag: 'Pre-Lanzamiento',
  },
  {
    id: 'finanzas',
    tab: '02. Finanzas',
    title: 'Simulador Financiero & Costos',
    badge: 'Rentabilidad',
    desc: 'Calcula con precisión matemática tu punto de equilibrio, estructura de costos y flujo a 12 meses.',
    detail: 'Punto de equilibrio y margen neto por producto',
    metric: 'Mes a Mes',
    icon: TrendingUp,
    color: 'text-emerald-400',
    border: 'border-emerald-400/30',
    bg: 'bg-emerald-500/10',
    tag: 'Unit Economics',
  },
  {
    id: 'operaciones',
    tab: '03. Operación',
    title: 'Suite Operativa (POS & Stock)',
    badge: 'Día a Día',
    desc: 'Punto de venta táctil, control de inventario en vivo, cotizador multimoneda y CRM de clientes.',
    detail: 'Herramientas operativas listas para despachar',
    metric: 'POS + Stock',
    icon: Layers,
    color: 'text-amber-400',
    border: 'border-amber-400/30',
    bg: 'bg-amber-500/10',
    tag: 'Sistema Diario',
  },
  {
    id: 'expertos',
    tab: '04. Expertos',
    title: 'Red de Asesores & Consultoría',
    badge: 'Acompañamiento',
    desc: 'Conexión directa 1-a-1 con consultores certificados en finanzas, marketing y marco legal-fiscal.',
    detail: 'Especialistas listos para auditar y potenciar tu idea',
    metric: '1-a-1 Directo',
    icon: Users,
    color: 'text-rose-400',
    border: 'border-rose-400/30',
    bg: 'bg-rose-500/10',
    tag: 'Red Certificada',
  },
];

const STATS = [
  { value: '4 en 1', label: 'Validación + Finanzas + POS + Expertos' },
  { value: '0 a 100', label: 'De la idea a la operación rentable' },
  { value: '$0 MXN', label: 'Comienza gratis sin tarjeta' },
];

export default function SignupPage() {
  const router = useRouter();
  const shouldReduce = useReducedMotion();

  const [form, setForm] = useState({ name: '', email: '', password: '', codigo_invitacion: '' });
  const [tipoCuenta, setTipoCuenta] = useState<'negocio' | 'experto'>('negocio');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ name: false, email: false, password: false });
  const [activeArea, setActiveArea] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const passwordStrength = getPasswordStrength(form.password);
  const emailError = getEmailError(form.email, touched.email);
  const passwordError = getPasswordError(form.password, touched.password);
  const isFormValid = Boolean(
    form.name &&
    form.email &&
    validateEmail(form.email) &&
    form.password &&
    !getPasswordError(form.password, true) &&
    !loading
  );

  // Ciclo automático suave de las áreas del programa
  useEffect(() => {
    if (shouldReduce || isPaused) return;
    const interval = setInterval(() => {
      setActiveArea((prev) => (prev + 1) % PROGRAM_AREAS.length);
    }, 4200);
    return () => clearInterval(interval);
  }, [shouldReduce, isPaused]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('tipo') === 'experto') setTipoCuenta('experto');
    const param = query.get('error');
    if (param) {
      const KNOWN_ERRORS: Record<string, string> = {
        google_failed: 'No pudimos completar el registro con Google.',
        oauth_denied: 'Autorización cancelada.',
        session_expired: 'La sesión expiró. Por favor regístrate de nuevo.',
      };
      setError(KNOWN_ERRORS[param] || ERRORES_GOOGLE[param] || 'Ocurrió un problema durante el registro. Intenta de nuevo.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.name || !form.email || !validateEmail(form.email) || !form.password || getPasswordError(form.password, true)) {
      setTouched({ name: true, email: true, password: true });
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        tipo_cuenta: tipoCuenta,
        ...(form.codigo_invitacion ? { codigo_invitacion: form.codigo_invitacion } : {}),
      });

      if (data.user) {
        localStorage.setItem(
          'usuario',
          JSON.stringify({
            ...data.user,
            nombre: data.user.name ?? data.user.nombre ?? '',
            name: data.user.name ?? data.user.nombre ?? '',
          })
        );
      }
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }
      localStorage.removeItem('refreshToken');

      const next = new URLSearchParams(window.location.search).get('next');
      const porDefecto =
        data.user?.tipo_cuenta === 'experto' ? '/net0/registro?bienvenida=1' : '/dashboard';
      const destino = destinoSeguro(next, porDefecto);
      router.push(destino);
    } catch (err: unknown) {
      const errorInfo = interpretarErrorApi(err, 'Error al crear la cuenta.');
      setError(errorInfo.mensaje);
    } finally {
      setLoading(false);
    }
  };

  const currentArea = PROGRAM_AREAS[activeArea];
  const CurrentIcon = currentArea.icon;

  return (
    <main className="min-h-screen flex bg-[#0A0A0C] text-white selection:bg-red-500/30 selection:text-white font-sans antialiased overflow-x-hidden relative">
      {/* ── PANEL IZQUIERDO: Propuesta Editorial, Ficha de Ecosistema y Fondo Cinemático ── */}
      <div
        className="hidden lg:flex lg:w-[48%] xl:w-[50%] relative bg-[#05070C] border-r border-white/[0.08] overflow-hidden flex-col justify-between p-10 xl:p-14"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Fondo cinemático exclusivo del lado izquierdo */}
        <AuthBackground />

        {/* Gradiente viñeta para integrar texto con el espacio */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070C]/80 via-transparent to-[#05070C]/85 pointer-events-none z-1" />

        {/* Marca / Logo Superior */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-[0_4px_20px_rgba(255,255,255,0.15)] group-hover:scale-105 transition-transform duration-200">
              <span className="text-sm text-[#0A0A0C] font-sans font-black leading-none tracking-tight">BI</span>
            </div>
            <div className="flex flex-col">
              <span className="font-sans font-extrabold text-xl tracking-tight text-white leading-none">BI 0 A 100</span>
              <span className="text-[10px] font-sans font-semibold tracking-wider text-slate-400 uppercase mt-1">Plataforma Empresarial</span>
            </div>
          </Link>
        </div>

        {/* Contenido Editorial Central con Gancho Maestro y Módulos del Programa */}
        <div className="relative z-10 max-w-lg my-auto py-6 space-y-6">
          <motion.div
            {...ENTRADA_SEGURA}
            initial={shouldReduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION_DURATIONS.deliberate, ease: MOTION_EASINGS.easeOutQuart }}
          >
            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-sans font-extrabold text-white mb-3 tracking-[-0.035em] leading-[1.08] drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
              El sistema definitivo para llevar tu negocio de 0 a 100.
            </h1>
            <p className="text-slate-300/90 text-sm sm:text-base font-sans font-normal leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              No arriesgues tu capital a ciegas. Unificamos la auditoría algorítmica de mercado, simulación financiera, herramientas de venta diaria y consultoría experta en una sola plataforma.
            </p>
          </motion.div>

          {/* Tarjeta Interactiva del Ecosistema de Módulos */}
          <motion.div
            {...ENTRADA_SEGURA}
            initial={shouldReduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION_DURATIONS.deliberate, delay: 0.1, ease: MOTION_EASINGS.easeOutQuart }}
            className="rounded-2xl border border-white/[0.09] bg-[#141416]/90 backdrop-blur-md p-5 shadow-2xl space-y-4"
          >
            {/* Header de la Ficha con Barra de Cobertura */}
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                </span>
                <span className="text-[11px] font-sans font-semibold tracking-wider text-slate-300 uppercase">
                  Explorador de Áreas del Programa
                </span>
              </div>
              <span className="text-[11px] font-sans font-bold text-slate-300 tabular-nums">
                Cobertura Integral End-to-End
              </span>
            </div>

            {/* Píldoras de Navegación de Áreas */}
            <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              {PROGRAM_AREAS.map((area, idx) => {
                const isActive = activeArea === idx;
                return (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => setActiveArea(idx)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-sans font-semibold transition-all duration-200 text-center cursor-pointer truncate ${
                      isActive
                        ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/15'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    {area.tab}
                  </button>
                );
              })}
            </div>

            {/* Ficha Dinámica del Área Activa */}
            <div className="min-h-[148px] flex flex-col justify-between">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentArea.id}
                  {...ENTRADA_SEGURA}
                  initial={shouldReduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl ${currentArea.bg} border ${currentArea.border} flex items-center justify-center flex-shrink-0`}>
                        <CurrentIcon className={`w-4 h-4 ${currentArea.color}`} />
                      </div>
                      <div>
                        <div className="text-sm font-sans font-bold text-white leading-tight">
                          {currentArea.title}
                        </div>
                        <div className="text-[11px] font-sans text-slate-400">
                          {currentArea.tag}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-sans font-bold ${currentArea.bg} ${currentArea.color} border ${currentArea.border}`}>
                      {currentArea.metric}
                    </span>
                  </div>

                  <p className="text-xs font-sans text-slate-300 leading-relaxed">
                    {currentArea.desc}
                  </p>

                  <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04] text-[11px] text-slate-400 font-sans">
                    <CheckCircle2 className={`w-3.5 h-3.5 ${currentArea.color} flex-shrink-0`} />
                    <span className="truncate">{currentArea.detail}</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Métricas Inferiores */}
        <div className="relative z-10 grid grid-cols-3 gap-4 pt-6 border-t border-white/[0.08]">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-xl xl:text-2xl font-sans font-bold tracking-tight text-white tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                {s.value}
              </div>
              <div className="text-[11px] text-slate-400 font-sans font-medium mt-0.5 leading-snug">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PANEL DERECHO: Formulario de Registro Solid Studio ── */}
      <div className="flex-1 flex relative items-center justify-center p-6 sm:p-10 lg:p-12 overflow-y-auto bg-[#0A0A0C]">
        {/* Fondo sutil con desvanecido ambiental */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Resplandor superior cálido difuminado */}
          <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[650px] h-[500px] bg-gradient-to-b from-red-500/[0.08] via-emerald-500/[0.03] to-transparent rounded-full blur-[130px]" />

          {/* Resplandor inferior de contrapunto */}
          <div className="absolute -bottom-[20%] right-[10%] w-[500px] h-[450px] bg-gradient-to-t from-cyan-500/[0.04] to-transparent rounded-full blur-[140px]" />

          {/* Trama sutil con desvanecido radial concéntrico */}
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage: "radial-gradient(ellipse at 50% 50%, black 25%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse at 50% 50%, black 25%, transparent 75%)",
            }}
          />

          {/* Viñetas superior e inferior con desvanecido gradual */}
          <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#0A0A0C] via-[#0A0A0C]/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/80 to-transparent" />
        </div>

        <motion.div
          {...ENTRADA_SEGURA}
          initial={shouldReduce ? false : { opacity: 0, y: 22, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: MOTION_DURATIONS.deliberate, ease: MOTION_EASINGS.easeOutQuart }}
          className="relative z-10 w-full max-w-[440px] rounded-[28px] border border-white/[0.08] bg-[#1C1C1E] shadow-[0_24px_64px_rgba(0,0,0,0.7)] p-7 sm:p-9 overflow-hidden my-auto"
        >
          {/* Logo móvil */}
          <Link href="/" className="lg:hidden flex items-center gap-2.5 mb-7">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-md">
              <span className="text-xs text-[#0A0A0C] font-sans font-black leading-none">BI</span>
            </div>
            <span className="font-sans font-extrabold text-lg tracking-tight text-white">BI 0 A 100</span>
          </Link>

          {/* Encabezado */}
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-sans font-extrabold text-white tracking-[-0.03em] mb-1.5">
              Crea tu cuenta gratis
            </h2>
            <p className="text-sm text-slate-400 font-sans font-normal leading-relaxed">
              Comienza a estructurar y validar tu negocio hoy.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Selector de Rol Intuitivo y Limpio */}
            <div>
              <label className="block text-xs font-sans font-semibold text-slate-300 mb-2">
                Tipo de cuenta
              </label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {[
                  {
                    valor: 'negocio',
                    titulo: 'Emprendedor',
                    detalle: 'Validar y operar negocio',
                    icon: Compass,
                  },
                  {
                    valor: 'experto',
                    titulo: 'Especialista',
                    detalle: 'Ofrecer consultoría',
                    icon: Briefcase,
                  },
                ].map((op) => {
                  const activo = tipoCuenta === op.valor;
                  const Icon = op.icon;
                  return (
                    <button
                      key={op.valor}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => setTipoCuenta(op.valor as 'negocio' | 'experto')}
                      disabled={loading}
                      className={`text-left rounded-xl p-3 border transition-all duration-150 cursor-pointer ${
                        activo
                          ? 'border-white/25 bg-[#252528] text-white shadow-sm ring-1 ring-white/10'
                          : 'border-white/[0.07] bg-[#141416] text-slate-400 hover:border-white/15 hover:bg-[#18181A]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${activo ? 'text-white' : 'text-slate-400'}`} />
                        <span className={`text-xs font-sans font-semibold ${activo ? 'text-white' : 'text-slate-300'}`}>
                          {op.titulo}
                        </span>
                      </div>
                      <span className="block text-[11px] font-sans text-slate-400 leading-tight">
                        {op.detalle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Google usa el tipo de cuenta elegido arriba y el código de invitación, si lo hay. */}
            <BotonGoogle
              modo="registro"
              tipoCuenta={tipoCuenta}
              codigoInvitacion={form.codigo_invitacion || undefined}
              forma="pastilla"
              deshabilitado={loading}
            />

            <InputField
              id="signup-name"
              label="Nombre completo"
              name="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              touched={touched.name}
              disabled={loading}
              placeholder="Ej. Sofía Morales"
              autoComplete="name"
            />

            <InputField
              id="signup-email"
              label="Correo electrónico"
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              error={emailError}
              success={Boolean(form.email && validateEmail(form.email) && touched.email)}
              touched={touched.email}
              disabled={loading}
              placeholder="nombre@empresa.com"
              autoComplete="email"
            />

            <div>
              <InputField
                id="signup-password"
                label="Contraseña"
                name="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                error={passwordError}
                success={Boolean(form.password && !getPasswordError(form.password, true) && touched.password)}
                touched={touched.password}
                disabled={loading}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword((v) => !v)}
              />
              <PasswordStrength strength={passwordStrength} visible={form.password.length > 0} />
            </div>

            {/* Código de Invitación Sutil */}
            <div>
              <label
                htmlFor="signup-codigo"
                className="flex items-center justify-between text-xs font-sans font-semibold text-slate-300 mb-2"
              >
                <span>Código de invitación</span>
                <span className="text-slate-400 font-normal font-sans">(opcional)</span>
              </label>
              <input
                id="signup-codigo"
                name="invitation-code"
                type="text"
                value={form.codigo_invitacion}
                onChange={(e) => setForm({ ...form, codigo_invitacion: e.target.value.trim().toUpperCase() })}
                className="w-full bg-[#161618] border border-white/[0.09] hover:border-white/20 focus:border-white/30 focus:bg-[#1A1A1D] focus:ring-2 focus:ring-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-150 tracking-[0.14em] font-mono uppercase"
                placeholder="CÓDIGO DE EQUIPO"
                maxLength={16}
                autoCapitalize="characters"
                spellCheck={false}
                disabled={loading}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-sans font-medium animate-in fade-in duration-200"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={!isFormValid}
                className="w-full relative inline-flex items-center justify-center gap-2 h-12 rounded-full text-sm font-sans font-semibold text-white bg-gradient-to-b from-[#EF4444] via-[#DC2626] to-[#B91C1C] border border-white/20 shadow-[0_4px_24px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Creando expediente de cuenta...</span>
                  </>
                ) : (
                  <>
                    <span>Crear cuenta gratis</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Enlace de Pie */}
          <div className="mt-6 pt-5 border-t border-white/[0.08] text-center space-y-2.5">
            <p className="text-xs font-sans text-slate-400">
              ¿Ya tienes una cuenta?{' '}
              <Link
                href="/auth/login"
                className="text-white hover:text-slate-200 font-sans font-semibold underline-offset-4 hover:underline transition-colors"
              >
                Iniciar sesión
              </Link>
            </p>

            <p className="text-[11px] font-sans text-slate-400 leading-relaxed">
              Al registrarte aceptas nuestros{' '}
              <Link href="/terminos" className="text-slate-400 hover:text-slate-300 underline underline-offset-2">
                Términos
              </Link>{' '}
              y nuestra{' '}
              <Link href="/privacidad" className="text-slate-400 hover:text-slate-300 underline underline-offset-2">
                Política de privacidad
              </Link>
              .
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}