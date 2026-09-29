'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowLeft, Plus } from 'lucide-react';
import { useHaySesion } from '@/lib/useSesion';

export default function Net0Navbar() {
  const pathname = usePathname();
  const haySesion = useHaySesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Tras iniciar sesión se vuelve a la página donde estaba (una ficha, el directorio…).
  const hrefLogin = `/auth/login?next=${encodeURIComponent(pathname || '/net0')}`;

  // Cerrar menú móvil al navegar (se ajusta durante el render, sin efecto:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [rutaDelMenu, setRutaDelMenu] = useState(pathname);
  if (rutaDelMenu !== pathname) {
    setRutaDelMenu(pathname);
    setMenuAbierto(false);
  }

  const esActivo = (ruta: string) => {
    if (ruta === '/net0') return pathname === '/net0';
    return pathname.startsWith(ruta);
  };

  const linkClass = (ruta: string) =>
    `text-xs sm:text-sm font-medium transition-colors ${
      esActivo(ruta)
        ? 'text-white font-semibold'
        : 'text-zinc-400 hover:text-zinc-200'
    }`;

  return (
    <header className="sticky top-0 z-50 w-full bg-[#141416] border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand Net0 */}
        <div className="flex items-center gap-6">
          <Link href="/net0" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-xs transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
              <span className="font-mono text-xs font-black text-[#0A0A0C]">N0</span>
            </div>
            <span className="font-sans font-bold text-base tracking-tight text-white group-hover:text-zinc-200 transition-colors">
              Net0
            </span>
          </Link>

          {/* Enlaces principales escritorio */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/net0" className={linkClass('/net0')}>
              Explorar
            </Link>
            <Link href="/net0/mis-fichas" className={linkClass('/net0/mis-fichas')}>
              Mis perfiles
            </Link>
            <Link href="/net0/registro" className={linkClass('/net0/registro')}>
              Publicar perfil
            </Link>
          </nav>
        </div>

        {/* Zona derecha escritorio */}
        <div className="hidden md:flex items-center gap-3">
          {haySesion ? (
            <>
              <Link
                href="/net0/registro"
                className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#0A0A0C] text-xs font-semibold hover:bg-zinc-100 hover:shadow-[0_0_15px_rgba(255,255,255,0.25)] active:scale-95 transition-all duration-200"
              >
                <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
                <span>Publicar perfil</span>
              </Link>
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#1C1C1E] text-zinc-300 hover:text-white text-xs font-medium hover:bg-white/[0.06] hover:border-white/20 active:scale-95 transition-all duration-200"
              >
                <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-1" />
                <span>Volver a BI 0 A 100</span>
              </Link>
            </>
          ) : (
            <>
              <Link
                href={hrefLogin}
                className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/auth/signup?tipo=experto"
                className="px-3.5 py-1.5 rounded-lg bg-white text-[#0A0A0C] text-xs font-semibold hover:bg-zinc-100 hover:shadow-[0_0_15px_rgba(255,255,255,0.25)] active:scale-95 transition-all duration-200"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </div>

        {/* Botón menú móvil */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuAbierto(!menuAbierto)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-90 transition-all cursor-pointer"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
          >
            {menuAbierto ? <X className="w-5 h-5 transition-transform duration-200 rotate-90" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Menú desplegable móvil */}
      {menuAbierto && (
        <div className="md:hidden border-t border-white/[0.08] bg-[#141416] px-4 py-4 space-y-3">
          <nav className="flex flex-col space-y-2">
            <Link href="/net0" className={`py-1.5 ${linkClass('/net0')}`}>
              Explorar directorio
            </Link>
            <Link href="/net0/mis-fichas" className={`py-1.5 ${linkClass('/net0/mis-fichas')}`}>
              Mis perfiles
            </Link>
            <Link href="/net0/registro" className={`py-1.5 ${linkClass('/net0/registro')}`}>
              Publicar perfil
            </Link>
          </nav>

          <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2">
            {haySesion ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/[0.08] bg-[#1C1C1E] text-white text-xs font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a BI 0 A 100</span>
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href={hrefLogin}
                  className="w-full text-center px-3.5 py-2 rounded-lg border border-white/[0.08] text-xs font-medium text-white"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/auth/signup?tipo=experto"
                  className="w-full text-center px-3.5 py-2 rounded-lg bg-white text-[#0A0A0C] text-xs font-semibold"
                >
                  Crear cuenta
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
