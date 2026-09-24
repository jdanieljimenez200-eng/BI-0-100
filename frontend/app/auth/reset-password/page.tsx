'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, KeyRound, Eye, EyeOff, Lock } from 'lucide-react';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';
import { getPasswordError, getPasswordStrength } from '@/components/auth/AuthValidation';
import PasswordStrength from '@/components/auth/PasswordStrength';
import { MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motion/tokens';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const shouldReduce = useReducedMotion();

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const passwordStrength = getPasswordStrength(form.password);

  useEffect(() => {
    if (!token) setError('Enlace inválido o expirado. Por favor solicita uno nuevo.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errorPassword = getPasswordError(form.password, true);
    if (errorPassword) {
      setError(errorPassword);
      return;
    }
    if (form.password !== form.confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'Error al restablecer contraseña.');
      setError(info.mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex bg-[#070E17] text-white overflow-hidden font-sans">
      {/* ── PANEL IZQUIERDO: Contexto Editorial ── */}
      <div className="hidden lg:flex lg:w-[48%] relative bg-[#050A12] border-r border-white/[0.08] overflow-hidden flex-col justify-between p-12 xl:p-16">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />

        <div className="absolute top-1/3 left-1/3 w-[450px] h-[450px] bg-cyan-500/8 rounded-full blur-[160px] pointer-events-none" />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-[0_0_24px_rgba(255,255,255,0.2)] group-hover:scale-105 transition-transform duration-200">
              <span className="text-sm text-[#070E17] font-mono font-black leading-none">BI</span>
            </div>
            <span className="font-extrabold text-xl tracking-tight text-white">0 A 100</span>
          </Link>
        </div>

        <div className="relative z-10 max-w-md my-auto py-8">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center mb-6 text-white">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 tracking-[-0.03em] leading-tight">
            Establece tu nueva contraseña segura.
          </h1>
          <p className="text-slate-300/90 text-sm sm:text-base font-normal leading-relaxed">
            Tu nueva credencial debe contener un mínimo de 8 caracteres, incluyendo mayúsculas, números y símbolos.
          </p>
        </div>

        <div className="relative z-10 text-xs text-slate-500 font-mono">
          © {new Date().getFullYear()} BI 0 A 100. Todos los derechos reservados.
        </div>
      </div>

      {/* ── PANEL DERECHO: Formulario ── */}
      <div className="flex-1 flex relative items-center justify-center p-6 sm:p-10 lg:p-12 overflow-y-auto">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-500/5 via-emerald-500/5 to-transparent blur-[140px] pointer-events-none -z-10" />

        <motion.div
          initial={shouldReduce ? false : { opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: MOTION_DURATIONS.deliberate, ease: MOTION_EASINGS.easeOutQuart }}
          className="relative z-10 w-full max-w-[420px] rounded-3xl border border-white/[0.1] bg-[#090E17]/85 backdrop-blur-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] border-t-white/20 p-7 sm:p-9 overflow-hidden my-auto"
        >
          <Link href="/" className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-md">
              <span className="text-xs text-[#070E17] font-mono font-black leading-none">BI</span>
            </div>
            <span className="font-extrabold text-lg tracking-tight text-white">0 A 100</span>
          </Link>

          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Contraseña actualizada</h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Tus credenciales han sido renovadas con éxito. Redirigiendo al inicio de sesión...
              </p>
              <div className="pt-2">
                <Link
                  href="/auth/login"
                  className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-white bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Ir al login ahora</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-extrabold text-white tracking-tight mb-1.5">
                  Nueva contraseña
                </h2>
                <p className="text-sm text-slate-400 font-normal leading-relaxed">
                  Ingresa y confirma tu nueva clave de acceso.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="reset-password"
                    className="block text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider mb-2"
                  >
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="reset-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full bg-[#0A121D]/90 border border-white/[0.08] hover:border-white/20 focus:border-cyan-400/50 focus:bg-[#0C1623] focus:ring-2 focus:ring-cyan-500/15 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-150 pr-20"
                      placeholder="Mínimo 8 caracteres"
                      disabled={loading || !token}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg text-slate-400 hover:text-white transition-colors text-xs font-mono"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPassword ? 'Ocultar' : 'Ver'}</span>
                    </button>
                  </div>
                  <PasswordStrength strength={passwordStrength} visible={form.password.length > 0} />
                </div>

                <div>
                  <label
                    htmlFor="reset-confirm"
                    className="block text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider mb-2"
                  >
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="reset-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      required
                      value={form.confirm}
                      onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                      className="w-full bg-[#0A121D]/90 border border-white/[0.08] hover:border-white/20 focus:border-cyan-400/50 focus:bg-[#0C1623] focus:ring-2 focus:ring-cyan-500/15 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-150 pr-20"
                      placeholder="Repite la contraseña"
                      disabled={loading || !token}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg text-slate-400 hover:text-white transition-colors text-xs font-mono"
                    >
                      {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showConfirm ? 'Ocultar' : 'Ver'}</span>
                    </button>
                  </div>
                </div>

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
                    disabled={loading || !token || !form.password || !form.confirm}
                    className="w-full relative inline-flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-bold text-white bg-gradient-to-b from-[#E74C3C] to-[#C0392B] hover:brightness-110 active:scale-[0.98] transition-all duration-150 shadow-[0_4px_20px_rgba(231,76,60,0.35)] border border-white/15 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Guardando credencial...</span>
                      </>
                    ) : (
                      <span>Guardar nueva contraseña</span>
                    )}
                  </button>
                </div>

                <div className="pt-4 text-center">
                  <Link
                    href="/auth/forgot-password"
                    className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Solicitar otro enlace</span>
                  </Link>
                </div>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070E17]" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
