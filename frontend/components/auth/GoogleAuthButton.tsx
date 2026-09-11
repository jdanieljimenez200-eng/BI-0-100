'use client';

/**
 * OAuth de Google pendiente en el backend (no existe GET /api/auth/google).
 * Se renderiza deshabilitado para no enviar al usuario a un 404.
 */
export function GoogleAuthButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      disabled
      title="Disponible próximamente"
      className={`w-full flex items-center justify-center gap-3 bg-white/[0.04] border border-white/15 rounded-xl px-6 py-4 text-sm font-semibold text-white/40 cursor-not-allowed opacity-60 ${className}`}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
        <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.43 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.18 9.14 4.75 12 4.75z" />
      </svg>
      <span>Continuar con Google</span>
    </button>
  );
}