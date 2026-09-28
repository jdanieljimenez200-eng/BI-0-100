'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL } from '@/lib/config';

/**
 * Vuelta de Google. El backend ya dejó la sesión en la cookie HttpOnly del
 * refresh token; aquí se canjea por el access token (como en cualquier refresh)
 * y se guarda el usuario igual que tras un login con contraseña. Así ningún
 * token viaja en la URL.
 */
export default function VueltaDeGoogle() {
  const router = useRouter();
  // En desarrollo React monta dos veces: dos refresh con la misma cookie harían
  // que el segundo fallara (token ya rotado) y mandara al login con error.
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    const nuevo = new URLSearchParams(window.location.search).get('nuevo') === '1';

    (async () => {
      try {
        const { data: sesion } = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        const { data: user } = await axios.get(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${sesion.accessToken}` },
          withCredentials: true,
        });
        localStorage.setItem('accessToken', sesion.accessToken);
        localStorage.removeItem('refreshToken');
        localStorage.setItem(
          'usuario',
          JSON.stringify({ ...user, nombre: user.name ?? user.nombre ?? '', name: user.name ?? user.nombre ?? '' })
        );
        const destino =
          user.tipo_cuenta === 'experto' ? (nuevo ? '/dashboard/net0/registro?bienvenida=1' : '/dashboard/net0/mis-fichas') : '/dashboard';
        router.replace(destino);
      } catch {
        router.replace('/auth/login?error=google_failed');
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0A0A0C] text-white">
      <div className="flex items-center gap-3 text-sm text-slate-300" role="status">
        <Loader2 className="w-5 h-5 animate-spin text-white" aria-hidden="true" />
        <span>Entrando con tu cuenta de Google…</span>
      </div>
    </main>
  );
}
