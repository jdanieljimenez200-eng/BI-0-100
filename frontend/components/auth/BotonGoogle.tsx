'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL } from '@/lib/config';

/**
 * «Continuar con Google» para login y registro.
 *
 * Solo aparece si el backend tiene Google configurado (`GET /auth/proveedores`):
 * un botón que lleva a un error no se muestra. El enlace va al backend, que hace
 * la ida y vuelta con Google y regresa a /auth/google con la sesión en la cookie.
 */

/** Mensajes de `?error=` al volver de Google a login o registro. */
export const ERRORES_GOOGLE: Record<string, string> = {
  google_failed: 'No pudimos completar el acceso con Google. Inténtalo de nuevo.',
  google_no_disponible: 'El acceso con Google no está disponible ahora. Usa tu correo y contraseña.',
  oauth_denied: 'Cancelaste el acceso con Google.',
  session_expired: 'El intento con Google caducó. Vuelve a intentarlo.',
  email_no_verificado: 'Tu cuenta de Google no tiene el correo verificado.',
  cuenta_desactivada: 'Esta cuenta está desactivada. Contacta a soporte.',
  google_otra_cuenta: 'Este correo ya está ligado a otra cuenta de Google.',
  invitacion_invalida: 'El código de invitación no es válido, ya se usó o es para otro correo.',
};

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="w-[18px] h-[18px] shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

interface Props {
  modo: 'login' | 'registro';
  /** Registro: el tipo de cuenta elegido en el formulario. */
  tipoCuenta?: 'negocio' | 'experto';
  /** Registro: código de invitación de un colaborador, si lo escribió. */
  codigoInvitacion?: string;
  /** Forma del botón para que case con el de enviar de cada pantalla. */
  forma?: 'pastilla' | 'redondeado';
  deshabilitado?: boolean;
}

export default function BotonGoogle({ modo, tipoCuenta, codigoInvitacion, forma = 'redondeado', deshabilitado = false }: Props) {
  const [disponible, setDisponible] = useState(false);
  const [yendo, setYendo] = useState(false);

  useEffect(() => {
    let vigente = true;
    axios
      .get(`${API_BASE_URL}/auth/proveedores`)
      .then(({ data }) => { if (vigente) setDisponible(data?.google === true); })
      .catch(() => undefined);
    // Al volver con «atrás» desde Google la página sale de la caché del
    // navegador con el spinner puesto: se quita.
    const alVolver = (e: PageTransitionEvent) => { if (e.persisted) setYendo(false); };
    window.addEventListener('pageshow', alVolver);
    return () => {
      vigente = false;
      window.removeEventListener('pageshow', alVolver);
    };
  }, []);

  if (!disponible) {
    // En producción un botón que no funciona no se muestra. En desarrollo sí, con
    // lo que falta: si no, parece que el botón no existe.
    if (process.env.NODE_ENV === 'production') return null;
    return (
      <div>
        <div
          aria-disabled="true"
          className={`w-full inline-flex items-center justify-center gap-3 h-12 ${forma === 'pastilla' ? 'rounded-full' : 'rounded-xl'} bg-[#131314] border border-[#8E918F]/50 text-[#E3E3E3]/50 text-sm font-medium cursor-not-allowed`}
        >
          <LogoGoogle />
          <span>Continuar con Google</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
          Solo en desarrollo: el backend no tiene Google configurado. Faltan GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET y GOOGLE_LOGIN_REDIRECT_URI (o el backend no se ha reiniciado).
        </p>
        <div className="flex items-center gap-3 my-5" aria-hidden="true">
          <span className="h-px flex-1 bg-white/[0.08]" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">o con tu correo</span>
          <span className="h-px flex-1 bg-white/[0.08]" />
        </div>
      </div>
    );
  }

  const params = new URLSearchParams({ modo });
  if (tipoCuenta) params.set('tipo', tipoCuenta);
  if (codigoInvitacion) params.set('codigo', codigoInvitacion);
  const inactivo = deshabilitado || yendo;

  return (
    <div>
      {/* Variante oscura oficial de Google (#131314 / borde #8E918F / texto #E3E3E3). */}
      <a
        href={`${API_BASE_URL}/auth/google?${params.toString()}`}
        onClick={(e) => { if (inactivo) { e.preventDefault(); return; } setYendo(true); }}
        aria-disabled={inactivo}
        className={`w-full inline-flex items-center justify-center gap-3 h-12 ${forma === 'pastilla' ? 'rounded-full' : 'rounded-xl'} bg-[#131314] border border-[#8E918F] text-[#E3E3E3] text-sm font-medium hover:bg-[#1C1C1E] hover:border-[#A5A8A6] active:scale-[0.98] transition-all duration-150 ${inactivo ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
      >
        {yendo ? <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" /> : <LogoGoogle />}
        <span>{yendo ? 'Conectando con Google…' : 'Continuar con Google'}</span>
      </a>

      <div className="flex items-center gap-3 my-5" aria-hidden="true">
        <span className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">o con tu correo</span>
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>
    </div>
  );
}
