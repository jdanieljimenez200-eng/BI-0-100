'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';
import { getPasswordError } from '@/components/auth/AuthValidation';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError('Enlace inválido. Solicita uno nuevo.');
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
      setTimeout(() => router.push('/auth/login'), 3000);
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'Error al restablecer contraseña.');
      setError(info.mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-hero flex-col justify-between p-12">
        <Link href="/" className="text-white font-bold text-xl tracking-tight">
          BI 0 A 100
        </Link>
        <div className="space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white leading-tight">
            Establece una nueva<br />contraseña segura
          </h1>
          <p className="text-white/60">
            Elige una contraseña fuerte con al menos 8 caracteres, una mayúscula, un número y un símbolo.
          </p>
        </div>
        <p className="text-white/30 text-xs">© 2024 BI 0 A 100. Todos los derechos reservados.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 bg-[#070E17] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <Link href="/" className="lg:hidden block text-center text-brand-primary font-bold text-xl mb-8">
            BI 0 A 100
          </Link>

          {done ? (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-brand-green/10 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Contraseña actualizada</h2>
              <p className="text-white/50 text-sm">Redirigiendo al inicio de sesión en unos segundos...</p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white">Nueva contraseña</h2>
                <p className="text-white/50 text-sm mt-1">Ingresa y confirma tu nueva contraseña</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Nueva contraseña</label>
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input"
                    placeholder="Mínimo 8 caracteres, mayúscula, número y símbolo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Confirmar contraseña</label>
                  <input
                    type="password"
                    required
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                    className="input"
                    placeholder="Repite la contraseña"
                  />
                </div>

                {error && (
                  <p className="text-brand-accent text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading || !token} className="btn-primary w-full justify-center">
                  {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
                </button>

                <p className="text-center text-sm text-white/50">
                  <Link href="/auth/forgot-password" className="text-brand-primary font-semibold hover:underline">
                    Solicitar otro enlace
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
