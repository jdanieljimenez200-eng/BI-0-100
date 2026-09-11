import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  plan?: string;
  account_role?: string;
}

export const useAuth = () => {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) {
      setLoading(false);
      router.push('/auth/login');
      return;
    }

    // Hidratar desde localStorage (escrito en login/signup)…
    try {
      const saved = localStorage.getItem('usuario');
      if (saved) setUser(JSON.parse(saved));
    } catch {
      localStorage.removeItem('usuario');
    }

    const controller = new AbortController();

    // …y refrescar contra el backend por si cambió.
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.id) {
          const nombre = data.name ?? data.nombre ?? '';
          const hydrated: AuthUser = {
            id: data.id,
            email: data.email,
            name: nombre,
            plan: data.plan,
            account_role: data.account_role,
          };
          setUser(hydrated);
          localStorage.setItem('usuario', JSON.stringify({
            ...hydrated,
            nombre,
          }));
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          // Error no provocado por desmontaje
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [router]);

  return { user, loading };
};
