'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import InputField from '@/components/auth/InputField';
import PasswordStrength from '@/components/auth/PasswordStrength';
import AuthMountain from '@/components/auth/AuthMountain';
import { validateEmail, getPasswordStrength, getEmailError } from '@/components/auth/AuthValidation';
import { MOTION_DURATIONS, MOTION_EASINGS, MOTION_SPRINGS } from '@/lib/motion/tokens';

const VALUE_PROPOSITIONS = [
  'Cruce en tiempo real con Google Maps y competidores',
  'Simulador de costos y punto de equilibrio financiero',
  'Verificación normativa y fiscal de tu territorio',
  'Expediente ejecutivo listo en menos de 3 minutos',
];

export default function LoginPage() {
  const router = useRouter();
  const shouldReduce = useReducedMotion();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);

  const passwordStrength = getPasswordStrength(password);
  const emailError = getEmailError(email, touched.email);
  const passwordError = touched.password && !password ? 'La contraseña es requerida' : '';
  const isEmailValid = Boolean(email && validateEmail(email));
  const isPasswordValid = Boolean(password && password.length > 0);
  const isFormValid = isEmailValid && isPasswordValid && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !validateEmail(email) || !password || password.length < 6) {
      setTouched({ email: true, password: true });
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { accessToken, user } = response.data;

      if (!accessToken || !user) {
        throw new Error('Respuesta de login incompleta');
      }

      localStorage.setItem('accessToken', accessToken);
      localStorage.removeItem('refreshToken');
      localStorage.setItem(
        'usuario',
        JSON.stringify({
          ...user,
          nombre: user.name ?? user.nombre ?? '',
          name: user.name ?? user.nombre ?? '',
        })
      );

      const destino = user.tipo_cuenta === 'experto' ? '/network/mis-fichas' : '/dashboard';
      router.push(destino);
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Credenciales inválidas. Por favor verifica tus datos e intenta nuevamente.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex bg-[#070E17] text-white overflow-hidden font-sans">
      {/* ── PANEL IZQUIERDO: Propuesta Editorial y Paisaje Montañoso ── */}
      <div className="hidden lg:flex lg:w-[50%] xl:w-[52%] relative bg-[#050A12] border-r border-white/[0.08] overflow-hidden flex-col justify-between p-12 xl:p-16">
        {/* Fondo montañoso Everest */}
        <div className="absolute inset-0 w-full h-full">
          <AuthMountain />
        </div>

        {/* Gradiente viñeta para integrar contenido con la montaña */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050A12]/70 via-transparent to-[#050A12]/85 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050A12]/60 via-transparent to-transparent pointer-events-none" />

        {/* Marca / Logo Superior */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-[0_0_24px_rgba(255,255,255,0.2)] group-hover:scale-105 transition-transform duration-200">
              <span className="text-sm text-[#070E17] font-mono font-black leading-none">BI</span>
            </div>
            <span className="font-extrabold text-xl tracking-tight text-white">0 A 100</span>
          </Link>
        </div>

        {/* Contenido Editorial Central */}
        <div className="relative z-10 max-w-lg my-auto py-8">
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION_DURATIONS.deliberate, ease: MOTION_EASINGS.easeOutQuart }}
          >
            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold text-white mb-4 tracking-[-0.03em] leading-[1.08] drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
              Alcanza la cima de tus decisiones comerciales.
            </h1>
            <p className="text-slate-300/90 text-base font-normal leading-relaxed mb-8 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
              Audita cualquier modelo de negocio con datos territoriales en tiempo real. Tu siguiente cumbre empresarial comienza aquí.
            </p>
          </motion.div>

          {/* Lista de Valor Auténtica */}
          <div className="space-y-3.5 pt-6 border-t border-white/[0.08]">
            {VALUE_PROPOSITIONS.map((prop, idx) => (
              <motion.div
                key={idx}
                initial={shouldReduce ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: MOTION_DURATIONS.base,
                  ease: MOTION_EASINGS.easeOutQuart,
                  delay: 0.1 + idx * 0.06,
                }}
                className="flex items-center gap-3"
              >
                <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                </div>
                <span className="text-xs sm:text-sm text-slate-300 font-normal">{prop}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer Editorial del Panel */}
        <div className="relative z-10 flex items-center gap-3 text-xs text-slate-400 font-mono drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span>Infraestructura de datos encriptada TLS 1.3</span>
        </div>
      </div>

      {/* ── PANEL DERECHO: Tarjeta de Acceso ── */}
      <div className="flex-1 flex relative items-center justify-center p-6 sm:p-10 lg:p-12 overflow-y-auto">
        {/* Resplandor ambiental de fondo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-500/5 via-emerald-500/5 to-transparent blur-[140px] pointer-events-none -z-10" />

        <motion.div
          initial={shouldReduce ? false : { opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: MOTION_DURATIONS.deliberate, ease: MOTION_EASINGS.easeOutQuart }}
          className="relative z-10 w-full max-w-[420px] rounded-3xl border border-white/[0.1] bg-[#090E17]/85 backdrop-blur-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] border-t-white/20 p-7 sm:p-9 overflow-hidden"
        >
          {/* Logo móvil */}
          <Link href="/" className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-md">
              <span className="text-xs text-[#070E17] font-mono font-black leading-none">BI</span>
            </div>
            <span className="font-extrabold text-lg tracking-tight text-white">0 A 100</span>
          </Link>

          {/* Encabezado del Formulario */}
          <div className="mb-7">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-[-0.025em] mb-1.5">
              Accede a tu cuenta
            </h2>
            <p className="text-sm text-slate-400 font-normal leading-relaxed">
              Ingresa tus credenciales para continuar a tu panel.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <InputField
              id="login-email"
              label="Correo electrónico"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              error={emailError}
              success={isEmailValid && touched.email ? true : undefined}
              touched={touched.email}
              disabled={loading}
              placeholder="nombre@empresa.com"
              autoComplete="email"
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <span />
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-mono text-slate-400 hover:text-white transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <InputField
                id="login-password"
                label="Contraseña"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                error={passwordError}
                success={isPasswordValid && touched.password ? true : undefined}
                touched={touched.password}
                disabled={loading}
                placeholder="••••••••"
                autoComplete="current-password"
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword((v) => !v)}
              />
            </div>

            <PasswordStrength strength={passwordStrength} visible={false} />

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-red-400 text-xs font-medium animate-in fade-in duration-200"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={!isFormValid}
                className="w-full relative inline-flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-bold text-white bg-gradient-to-b from-[#E74C3C] to-[#C0392B] hover:brightness-110 active:scale-[0.98] transition-all duration-150 shadow-[0_4px_20px_rgba(231,76,60,0.35)] border border-white/15 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Verificando credenciales...</span>
                  </>
                ) : (
                  <>
                    <span>Iniciar sesión</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Enlaces de Pie */}
          <div className="mt-7 pt-5 border-t border-white/[0.06] text-center space-y-3">
            <p className="text-xs text-slate-400">
              ¿Aún no tienes cuenta?{' '}
              <Link
                href="/auth/signup"
                className="text-white hover:text-cyan-300 font-semibold transition-colors underline-offset-4 hover:underline"
              >
                Crear una gratis
              </Link>
            </p>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Al continuar aceptas nuestros{' '}
              <Link href="/terminos" className="hover:text-slate-400 underline underline-offset-2">
                Términos
              </Link>{' '}
              y nuestra{' '}
              <Link href="/privacidad" className="hover:text-slate-400 underline underline-offset-2">
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