'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: unknown) {
      const info = interpretarErrorApi(err, 'Error inesperado. Intenta de nuevo.');
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white leading-tight">
            Recupera el acceso<br />a tu cuenta
          </h1>
          <p className="text-white/60">
            Te enviaremos un enlace seguro a tu correo para que puedas establecer una nueva contraseña.
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

          {sent ? (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-brand-green/10 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Revisa tu correo</h2>
              <p className="text-white/50 text-sm">
                Si <strong className="text-white/70">{email}</strong> está registrado, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
              </p>
              <Link href="/auth/login" className="btn-outline inline-flex mt-2">
                Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white">¿Olvidaste tu contraseña?</h2>
                <p className="text-white/50 text-sm mt-1">Ingresa tu email y te enviamos un enlace</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Email de tu cuenta</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="tu@email.com"
                  />
                </div>

                {error && (
                  <p className="text-brand-accent text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>

                <p className="text-center text-sm text-white/50">
                  <Link href="/auth/login" className="text-brand-primary font-semibold hover:underline">
                    ← Volver a iniciar sesión
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
