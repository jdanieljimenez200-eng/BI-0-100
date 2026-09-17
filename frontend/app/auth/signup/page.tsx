'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import InputField from '@/components/auth/InputField';
import PasswordStrength from '@/components/auth/PasswordStrength';
import { validateEmail, getPasswordStrength, getEmailError, getPasswordError } from '@/components/auth/AuthValidation';

gsap.registerPlugin(useGSAP);

const features = [
  { color: '#3B82F6', title: 'Análisis de mercado', desc: 'Competencia y viabilidad con score 0-100.' },
  { color: '#8B5CF6', title: 'Plan de Marketing', desc: 'Posicionamiento y copy listos para usar.' },
  { color: '#06B6D4', title: 'Estrategia de Ventas', desc: 'Canales de distribución y oportunidades de crecimiento.' },
  { color: '#10B981', title: 'Simulador financiero', desc: 'Proyección a 12 meses automática.' },
];

const stats = [
  { value: '2-3 min', label: 'por validación' },
  { value: '4', label: 'motores de IA' },
  { value: '0', label: 'tarjeta requerida' },
];

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', codigo_invitacion: '' });
  // «Tengo un negocio» o «Ofrezco servicios»: decide a dónde se entra al terminar.
  const [tipoCuenta, setTipoCuenta] = useState<'negocio' | 'experto'>('negocio');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ name: false, email: false, password: false });

  const containerRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const passwordStrength = getPasswordStrength(form.password);
  const emailError = getEmailError(form.email, touched.email);
  const passwordError = getPasswordError(form.password, touched.password);
  const isFormValid = form.name && form.email && validateEmail(form.email) && form.password && !getPasswordError(form.password, true) && !loading;

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
      setError(KNOWN_ERRORS[param] || 'Ocurrió un problema durante el registro. Intenta de nuevo.');
    }
  }, []);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

    tl.fromTo('.lp-anim', { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, stagger: 0.08 }, 0.1);

    tl.fromTo(formRef.current, { y: 24, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 1.1, ease: 'power4.out' }, 0.3).fromTo('.form-element', { y: 16, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.07, duration: 0.8 }, 0.5);

    gsap.to('.core-glow', { scale: 1.12, opacity: 0.5, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }, { scope: containerRef });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
        localStorage.setItem('usuario', JSON.stringify({
          ...data.user,
          nombre: data.user.name ?? data.user.nombre ?? '',
          name: data.user.name ?? data.user.nombre ?? '',
        }));
      }
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }
      // El refresh token llega en una cookie HttpOnly; se limpia el de sesiones antiguas.
      localStorage.removeItem('refreshToken');

      if (formRef.current) gsap.to(formRef.current, { scale: 1.05, opacity: 0, filter: 'blur(10px)', duration: 0.8, ease: 'expo.in' });
      gsap.to('.lp-anim', { x: -50, opacity: 0, duration: 0.6, stagger: 0.05, ease: 'expo.in' });
      // Un colaborador invitado entra al negocio que lo invitó, elija lo que elija.
      const destino =
        data.user?.tipo_cuenta === 'experto' ? '/network/registro?bienvenida=1' : '/dashboard';
      gsap.delayedCall(0.6, () => router.push(destino));
    } catch (err: unknown) {
      const errorInfo = interpretarErrorApi(err, 'Error al crear la cuenta.');
      setError(errorInfo.mensaje);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isFormValid || !submitButtonRef.current) return;

    const rect = submitButtonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ripple = document.createElement('div');
    ripple.style.position = 'absolute';
    ripple.style.width = '20px';
    ripple.style.height = '20px';
    ripple.style.borderRadius = '50%';
    ripple.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.pointerEvents = 'none';

    submitButtonRef.current.appendChild(ripple);

    gsap.to(ripple, {
      width: 300,
      height: 300,
      opacity: 0,
      left: x - 150,
      top: y - 150,
      duration: 0.7,
      ease: 'power2.out',
      onComplete: () => ripple.remove(),
    });
  };

  return (
    <main ref={containerRef} className="min-h-screen flex bg-[#070E17] text-white overflow-hidden font-sans">
      {/* ── LEFT PANEL (Social proof & value) ── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-14 xl:p-16 bg-[#03070C] border-r border-white/[0.04] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`, backgroundSize: '64px 64px' }} />
        <div className="absolute bottom-[-15%] left-[-10%] w-[560px] h-[560px] bg-[#E74C3C]/10 rounded-full blur-[200px] pointer-events-none" />

        <div className="lp-anim relative z-10">
          <Link href="/" className="group inline-flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)] group-hover:scale-105 transition-transform">
              <span className="text-sm text-[#070E17] font-black leading-none">BI</span>
            </div>
            <span className="font-extrabold text-xl tracking-tighter">0 A 100</span>
          </Link>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center my-10">
          <h1 className="lp-anim text-4xl xl:text-5xl font-black tracking-tighter leading-[1.08] mb-5">
            Valida tu idea de negocio
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E74C3C] to-red-400">en minutos, no semanas.</span>
          </h1>
          <p className="lp-anim text-white/50 text-lg font-light leading-relaxed max-w-md mb-10">
            Sube tu producto y obtén cinco análisis independientes —mercado, marketing, finanzas, legal y ventas— listos para decidir.
          </p>

          <div className="lp-anim grid grid-cols-2 gap-x-6 gap-y-5 max-w-lg">
            {features.map((feat) => (
              <div key={feat.title} className="flex gap-3 items-start group">
                <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0 shadow-[0_0_10px]" style={{ backgroundColor: feat.color, boxShadow: `0 0 10px ${feat.color}` }} />
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight leading-tight">{feat.title}</h3>
                  <p className="text-xs text-white/40 font-light mt-0.5 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-anim relative z-10 flex items-center gap-8 pt-8 border-t border-white/[0.06]">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-black tracking-tight text-white">{s.value}</div>
              <div className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL (Form) ── */}
      <div className="flex-1 bg-[#070E17] flex relative items-center justify-center p-6 sm:p-10 lg:p-12 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="core-glow absolute w-[40vw] h-[40vw] bg-[#E74C3C]/5 rounded-full blur-[150px]" />
        </div>

        <div ref={formRef} className="relative z-10 w-full max-w-[420px] rounded-3xl border border-white/10 bg-[#0A121D]/60 backdrop-blur-3xl shadow-[0_40px_100px_rgba(0,0,0,0.8),inset_0_0_40px_rgba(255,255,255,0.03)] p-7 sm:p-9 md:p-10 overflow-hidden" style={{ backgroundImage: 'linear-gradient(45deg, transparent 0%, rgba(255,255,255,0.02) 50%, transparent 100%)', backgroundSize: '200% 200%', backgroundPosition: '0% center' }}>
          <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-bl from-white/[0.04] to-transparent pointer-events-none transform -rotate-12" />

          <Link href="/" className="lg:hidden flex items-center gap-3 mb-8 form-element">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              <span className="text-[11px] text-[#070E17] font-black leading-none">BI</span>
            </div>
            <span className="font-extrabold text-xl tracking-tighter text-white">0 A 100</span>
          </Link>

          <div className="form-element mb-7">
            <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight mb-2">Comienza gratis</h2>
            <p className="text-sm font-light text-white/50 tracking-wide">Crea tu cuenta y valida tu primera idea en 2-3 minutos.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 relative z-20" noValidate>
            <fieldset className="form-element">
              <legend className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">¿Qué te trae?</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {([
                  { valor: 'negocio', titulo: 'Tengo un negocio', detalle: 'Validar y hacer crecer mi idea' },
                  { valor: 'experto', titulo: 'Ofrezco servicios', detalle: 'Aparecer en la red de expertos' },
                ] as const).map((op) => {
                  const activo = tipoCuenta === op.valor;
                  return (
                    <button
                      key={op.valor}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => setTipoCuenta(op.valor)}
                      disabled={loading}
                      className={`text-left rounded-xl border px-3.5 py-3 transition-all duration-200 ${
                        activo
                          ? 'border-[#E74C3C]/60 bg-[#E74C3C]/10 shadow-[0_0_24px_rgba(231,76,60,0.15)]'
                          : 'border-white/10 bg-[#03070C]/40 hover:border-white/25'
                      }`}
                    >
                      <span className={`block text-sm font-bold ${activo ? 'text-white' : 'text-white/70'}`}>{op.titulo}</span>
                      <span className="block text-[11px] text-white/40 mt-0.5 leading-snug">{op.detalle}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

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
              placeholder="Ej. Juan Pérez"
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
              success={form.email && validateEmail(form.email) && touched.email ? true : undefined}
              touched={touched.email}
              disabled={loading}
              placeholder="nombre@empresa.com"
              autoComplete="email"
              icon="email"
            />

            <InputField
              id="signup-password"
              label="Contraseña"
              name="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              onBlur={() => setTouched((p) => ({ ...p, password: true }))}
              error={passwordError}
              success={form.password && !getPasswordError(form.password, true) && touched.password ? true : undefined}
              touched={touched.password}
              disabled={loading}
              placeholder="Mínimo 8 caracteres, mayúscula, número y símbolo"
              autoComplete="new-password"
              icon="password"
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword((v) => !v)}
            />

            <PasswordStrength strength={passwordStrength} visible={form.password.length > 0 && !passwordError} />

            <div className="form-element group">
              <label htmlFor="signup-codigo" className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2 transition-colors group-focus-within:text-white">
                Código de invitación <span className="text-white/30 normal-case font-light tracking-normal">(opcional)</span>
              </label>
              <input
                id="signup-codigo"
                name="invitation-code"
                type="text"
                value={form.codigo_invitacion}
                onChange={(e) => setForm({ ...form, codigo_invitacion: e.target.value.trim().toUpperCase() })}
                className="w-full bg-[#03070C]/50 border border-white/10 rounded-xl px-5 py-3.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#E74C3C]/60 focus:bg-[#0A121D]/80 focus:shadow-[0_0_30px_rgba(231,76,60,0.15)] transition-all duration-300 tracking-[0.2em] font-mono uppercase"
                placeholder="Si te invitó tu equipo"
                maxLength={16}
                autoCapitalize="characters"
                spellCheck={false}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="form-element flex items-start gap-3 bg-[#E74C3C]/10 border border-[#E74C3C]/20 text-[#E74C3C] text-sm rounded-xl p-4" role="alert">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="form-element pt-2">
              <button
                ref={submitButtonRef}
                type="submit"
                disabled={!isFormValid}
                onClick={handleSubmitClick}
                className="w-full relative group overflow-hidden text-white font-bold rounded-xl px-6 py-4 text-base tracking-tight transition-all duration-300 will-change-transform"
                style={{
                  background: isFormValid ? 'linear-gradient(135deg, #E74C3C 0%, #C0392B 100%)' : 'linear-gradient(135deg, rgba(231, 76, 60, 0.5) 0%, rgba(192, 57, 43, 0.5) 100%)',
                  boxShadow: isFormValid ? '0 0 30px rgba(231, 76, 60, 0.35), 0 10px 30px rgba(231, 76, 60, 0.2)' : '0 0 0px rgba(0, 0, 0, 0)',
                  cursor: isFormValid ? 'pointer' : 'not-allowed',
                  opacity: isFormValid ? 1 : 0.6,
                }}
              >
                <div className="absolute inset-0 w-full h-full bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creando cuenta...
                    </>
                  ) : (
                    <>Crear cuenta gratis</>
                  )}
                </span>
              </button>
            </div>
          </form>

          <p className="form-element text-center text-sm text-white/60 mt-7 font-light hover:text-white/80 transition-colors duration-300">
            ¿Ya tienes cuenta?{' '}
            <Link href="/auth/login" className="text-[#E74C3C] hover:text-[#EC9872] font-semibold transition-colors duration-200 hover:underline">
              Inicia sesión
            </Link>
          </p>

          <p className="form-element text-center text-[11px] text-white/35 mt-6 font-light leading-relaxed">
            Al crear tu cuenta aceptas nuestros{' '}
            <Link href="/terminos" className="text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors duration-200">
              Términos de servicio
            </Link>{' '}
            y nuestra{' '}
            <Link href="/privacidad" className="text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors duration-200">
              Política de privacidad
            </Link>
            .
          </p>
        </div>
      </div>

    </main>
  );
}