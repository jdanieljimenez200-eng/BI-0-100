import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-transparent pt-20 pb-12 px-4 sm:px-6 relative overflow-hidden border-t border-white/[0.06]">
      <div className="max-w-[1240px] mx-auto relative z-10">

        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-16">
          {/* Brand Col */}
          <div className="md:col-span-5 flex flex-col items-start gap-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 group focus:outline-none"
              aria-label="BI 0 A 100 Inicio"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-b from-white to-slate-200 flex items-center justify-center shadow-[0_2px_8px_rgba(255,255,255,0.2)]">
                <span className="text-xs text-[#070E17] font-black leading-none tracking-tight font-sans">
                  BI
                </span>
              </div>
              <span className="text-white font-bold text-lg tracking-tight font-sans">
                0 A 100
              </span>
            </Link>

            <p className="text-slate-400 max-w-sm text-xs sm:text-sm font-normal leading-relaxed font-sans">
              Auditoría y validación comercial de modelos de negocio con datos de demanda territorial en tiempo real, plataformas globales y normatividad vigente.
            </p>
          </div>

          {/* Nav Col 1 */}
          <div className="md:col-span-3 flex flex-col gap-3">
            <span className="text-xs font-sans font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Plataforma
            </span>
            <Link href="#modulos" className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors font-sans">
              Módulos de Validación
            </Link>
            <Link href="#herramientas" className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors font-sans">
              Herramientas Operativas
            </Link>
            <Link href="/pricing" className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors font-sans">
              Planes y Suscripciones
            </Link>
            <Link href="/auth/login" className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors font-sans">
              Acceso a Panel
            </Link>
          </div>

          {/* Nav Col 2 */}
          <div className="md:col-span-4 flex flex-col gap-3">
            <span className="text-xs font-sans font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Legal y Cumplimiento
            </span>
            <Link href="/terminos" className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors font-sans">
              Términos de Servicio
            </Link>
            <Link href="/privacidad" className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors font-sans">
              Aviso de Privacidad y Datos
            </Link>
            <Link href="/network" className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors font-sans">
              Directorio de Profesionales
            </Link>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-white/[0.06] gap-4">
          <span className="text-xs font-sans text-slate-400">
            © {new Date().getFullYear()} BI 0 A 100. Todos los derechos reservados.
          </span>

          <div className="flex items-center gap-2 text-xs font-sans font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            <span>Sistemas y APIs operacionales</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
