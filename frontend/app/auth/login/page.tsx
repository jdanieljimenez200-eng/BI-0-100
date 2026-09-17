'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import InputField from '@/components/auth/InputField';
import PasswordStrength from '@/components/auth/PasswordStrength';
import AuthChart from '@/components/auth/AuthChart';
import { validateEmail, getPasswordStrength, getEmailError, getPasswordError } from '@/components/auth/AuthValidation';

gsap.registerPlugin(useGSAP);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);

  const containerRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  const passwordStrength = getPasswordStrength(password);
  const emailError = getEmailError(email, touched.email);
  const passwordError = getPasswordError(password, touched.password);
  const isEmailValid = email && validateEmail(email);
  const isPasswordValid = password && password.length >= 6;
  const isFormValid = isEmailValid && isPasswordValid && !loading;

  // Parallax optimizado con rAF (sin re-renders de React) y condicionado a mouse
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) return;

    let rafId: number | null = null;
    const handleMouseMove = (e: MouseEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!leftPanelRef.current) return;
        const xPercent = (e.clientX / window.innerWidth - 0.5) * 5;
        const yPercent = (e.clientY / window.innerHeight - 0.5) * 3;
        gsap.to(leftPanelRef.current, {
          x: xPercent,
          y: yPercent,
          duration: 0.6,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Main animations
  useGSAP(() => {
    if (!chartContainerRef.current || !formRef.current) return;

    const tl = gsap.timeline({ defaults: { ease: 'cubic.inOut' } });

    tl.fromTo(chartContainerRef.current, { opacity: 0 }, { opacity: 1, duration: 1.2 }, 0);

    tl.fromTo('.lp-anim', { y: 40, opacity: 0, rotateX: -15 }, { y: 0, opacity: 1, rotateX: 0, duration: 1.2, stagger: 0.12, ease: 'power4.out' }, 0.2);

    tl.fromTo('.feature-item', { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power3.out' }, 0.6);

    tl.fromTo(formRef.current, { y: 50, opacity: 0, scale: 0.85, filter: 'blur(10px)' }, { y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1.1, ease: 'power4.out' }, 0.3);

    tl.fromTo('.form-element', { y: 20, opacity: 0, x: 10 }, { y: 0, opacity: 1, x: 0, stagger: 0.1, duration: 0.8, ease: 'power3.out' }, 0.9);

    gsap.to('.form-shine', { backgroundPosition: '200% center', duration: 4, repeat: -1, ease: 'sine.inOut' });

    gsap.to('.float-shape', { y: 25, duration: 5, yoyo: true, repeat: -1, ease: 'sine.inOut', stagger: 0.3 });

    gsap.to('.core-glow', { scale: 1.2, opacity: 0.7, duration: 8, yoyo: true, repeat: -1, ease: 'sine.inOut' });

    gsap.to('.status-pulse', { scale: 1.3, opacity: 0.3, duration: 1.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }, { scope: containerRef });

  const handleSubmitClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
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
  }, [isFormValid]);

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
      // El refresh token llega en una cookie HttpOnly: nunca pasa por JavaScript.
      const { accessToken, user } = response.data;

      if (!accessToken || !user) {
        throw new Error('Respuesta de login incompleta');
      }

      localStorage.setItem('accessToken', accessToken);
      localStorage.removeItem('refreshToken');
      localStorage.setItem('usuario', JSON.stringify({
        ...user,
        nombre: user.name ?? user.nombre ?? '',
        name: user.name ?? user.nombre ?? '',
      }));

      const successTl = gsap.timeline();

      successTl.to(submitButtonRef.current, { scale: 1.05, duration: 0.3, ease: 'back.out' });
      successTl.to(submitButtonRef.current, { scale: 1, duration: 0.2 });

      if (formRef.current) {
        successTl.to(formRef.current, { scale: 1.08, opacity: 0, filter: 'blur(10px)', duration: 0.8, ease: 'power3.in' }, 0.2);
      }

      if (leftPanelRef.current) {
        successTl.to(leftPanelRef.current, { opacity: 0, x: -100, duration: 0.8, ease: 'power3.in' }, 0.2);
      }

      // Quien se registró para ofrecer servicios entra a su perfil de experto.
      const destino = user.tipo_cuenta === 'experto' ? '/network/mis-fichas' : '/dashboard';
      successTl.call(() => router.push(destino), [], 0.8);
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Credenciales inválidas. Intenta nuevamente.';
      setError(errorMsg);

      if (formRef.current) {
        gsap.to(formRef.current, { x: 10, duration: 0.1, yoyo: true, repeat: 5, ease: 'power2.inOut' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main ref={containerRef} className="min-h-screen flex bg-gradient-to-br from-[#0A0E1A] via-[#070E17] to-[#050A12] text-white overflow-hidden font-sans perspective">
      {/* ── LEFT PANEL (Chart Background) ── */}
      <div ref={leftPanelRef} className="hidden lg:flex lg:w-[52%] relative bg-[#03070C] border-r border-white/[0.04] overflow-hidden will-change-transform">
        <div ref={chartContainerRef} className="absolute inset-0 w-full h-full">
          <AuthChart />
        </div>

        <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />

        <div className="absolute bottom-[-15%] left-[-10%] float-shape w-[560px] h-[560px] bg-[#10B981]/10 rounded-full blur-[200px] pointer-events-none" />
        <div className="absolute top-[-20%] right-[-5%] float-shape w-[400px] h-[400px] bg-[#10B981]/8 rounded-full blur-[180px] pointer-events-none" />

        <div className="absolute inset-0 bg-gradient-to-b from-[#03070C]/90 via-[#03070C]/50 to-[#03070C]/90 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full pt-4 xl:pt-6 px-12 xl:px-16 pb-10 justify-start">
          <div className="lp-anim mb-8">
            <Link href="/" className="group inline-flex items-center gap-3 hover:scale-110 transition-transform duration-300">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E74C3C] to-[#C0392B] flex items-center justify-center shadow-[0_0_20px_rgba(231,76,60,0.3)] group-hover:shadow-[0_0_40px_rgba(231,76,60,0.6)] group-hover:scale-110 transition-all duration-300">
                <span className="text-sm text-white font-black leading-none">BI</span>
              </div>
              <span className="font-extrabold text-xl tracking-tighter">0 A 100</span>
            </Link>
          </div>

          <div className="lp-anim space-y-6">
            <div>
              <h2 className="text-4xl xl:text-5xl font-black text-white mb-3 leading-tight">Valida tu negocio</h2>
              <p className="text-white/70 text-base font-light max-w-md">Acceso a análisis profesionales en 2-3 minutos. Datos reales, decisiones inteligentes.</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10">
              {['5 módulos de análisis independientes', 'Mejoras identificadas en 2-3 días', 'Mercado, Marketing, Ventas, Finanzas y Legal', 'Datos precisos basados en inteligencia artificial'].map((feature, idx) => (
                <div key={idx} className="feature-item flex items-start gap-3 hover:translate-x-2 transition-transform duration-300 cursor-pointer group">
                  <div className="w-5 h-5 rounded-full bg-[#10B981]/30 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#10B981]/50 transition-all duration-300">
                    <div className="w-2 h-2 rounded-full bg-[#10B981] group-hover:scale-150 transition-transform duration-300" />
                  </div>
                  <span className="text-sm text-white/80 font-medium group-hover:text-white/100 transition-colors duration-300">{feature}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <div className="status-pulse w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs text-green-400 font-semibold">Sistema en línea</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (Form) ── */}
      <div className="flex-1 bg-[#070E17] flex relative items-center justify-center p-6 sm:p-10 lg:p-12 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="core-glow absolute w-[40vw] h-[40vw] bg-[#E74C3C]/8 rounded-full blur-[180px]" />
        </div>

        <div ref={formRef} className="form-shine relative z-10 w-full max-w-[420px] rounded-3xl border border-white/10 bg-[#0A121D]/70 backdrop-blur-3xl shadow-[0_40px_100px_rgba(0,0,0,0.8),inset_0_0_40px_rgba(255,255,255,0.03)] p-7 sm:p-9 md:p-10 overflow-hidden" style={{ backgroundImage: 'linear-gradient(45deg, transparent 0%, rgba(255,255,255,0.02) 50%, transparent 100%)', backgroundSize: '200% 200%', backgroundPosition: '0% center' }}>
          <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-bl from-white/[0.04] to-transparent pointer-events-none transform -rotate-12" />

          <Link href="/" className="lg:hidden flex items-center justify-center gap-2 mb-6 form-element hover:scale-110 transition-transform duration-300">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#E74C3C] to-[#C0392B] flex items-center justify-center shadow-[0_0_20px_rgba(231,76,60,0.3)]">
              <span className="text-[10px] text-white font-black leading-none">BI</span>
            </div>
            <span className="font-extrabold text-lg tracking-tighter text-white">0 A 100</span>
          </Link>

          <div className="form-element mb-8 pb-6 border-b border-white/10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1.5 h-9 bg-gradient-to-b from-[#E74C3C] via-[#E8725D] to-[#C0392B] rounded-full animate-pulse" />
              <h2 className="text-3xl xl:text-4xl font-black text-white tracking-tighter">Acceso a tu cuenta</h2>
            </div>
            <p className="text-xs font-semibold text-[#E74C3C] uppercase tracking-widest mb-2">Inicia rápido y seguro</p>
            <p className="text-sm font-light text-white/50">Tu información está protegida con encriptación de nivel empresarial.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 relative z-20" noValidate>
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
              icon="email"
            />

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
              icon="password"
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword((v) => !v)}
            />

            <PasswordStrength strength={passwordStrength} visible={password.length > 0 && !passwordError} />

            {error && (
              <div className="form-element flex items-start gap-3 bg-[#E74C3C]/10 border border-[#E74C3C]/20 text-[#E74C3C] text-sm rounded-xl p-4 animate-in shake" role="alert">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="form-element pt-2">
              <button ref={submitButtonRef} type="submit" disabled={!isFormValid} onClick={handleSubmitClick} className="w-full relative group overflow-hidden text-white font-bold rounded-xl px-6 py-4 text-base tracking-tight transition-all duration-300 will-change-transform" style={{ background: isFormValid ? 'linear-gradient(135deg, #E74C3C 0%, #C0392B 100%)' : 'linear-gradient(135deg, rgba(231, 76, 60, 0.5) 0%, rgba(192, 57, 43, 0.5) 100%)', boxShadow: isFormValid ? '0 0 30px rgba(231, 76, 60, 0.35), 0 10px 30px rgba(231, 76, 60, 0.2)' : '0 0 0px rgba(0, 0, 0, 0)', cursor: isFormValid ? 'pointer' : 'not-allowed', opacity: isFormValid ? 1 : 0.6 }}>
                <div className="absolute inset-0 w-full h-full bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Verificando acceso...
                    </>
                  ) : (
                    <>Ingresar a tu cuenta</>
                  )}
                </span>
              </button>
            </div>
          </form>

          <p className="form-element text-center text-sm text-white/60 mt-7 font-light hover:text-white/80 transition-colors duration-300">
            ¿Sin cuenta aún?{' '}
            <Link href="/auth/signup" className="text-[#E74C3C] hover:text-[#EC9872] font-semibold transition-colors duration-200 hover:underline">
              Crear una gratis
            </Link>
          </p>

          <p className="form-element text-center text-[12px] text-white/40 mt-4 hover:text-white/60 transition-colors duration-300">
            <Link href="/auth/forgot-password" className="text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors duration-200">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>

          <p className="form-element text-center text-[11px] text-white/35 mt-6 font-light leading-relaxed">
            Al acceder aceptas nuestros{' '}
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