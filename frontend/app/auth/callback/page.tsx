"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

// El backend ya dejó las cookies HttpOnly tras el OAuth de Google. Aquí solo
// hidratamos `usuario` en localStorage (como hace login/signup) y entramos.
export default function GoogleCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/auth/me", { withCredentials: true });
        if (cancelled) return;
          const nombre = data.name ?? data.nombre ?? "";
          localStorage.setItem(
            "usuario",
            JSON.stringify({ id: data.id, email: data.email, nombre, name: nombre, plan: data.plan })
          );
        router.replace("/dashboard");
      } catch {
        if (cancelled) return;
        router.replace(
          "/auth/login?error=" + encodeURIComponent("No pudimos completar el inicio con Google")
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#070E17] text-white">
      <div className="flex flex-col items-center gap-5">
        <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-[#E74C3C] animate-spin" />
        <p className="text-sm text-white/50 font-light tracking-wide">Completando tu inicio de sesión…</p>
      </div>
    </main>
  );
}