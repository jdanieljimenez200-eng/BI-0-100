import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/[0.1] bg-[#070E17]/96 backdrop-blur-2xl pt-20 pb-12 px-4 sm:px-6">
      {/* Entrada suave que cubre progresivamente los puntos del skyline */}
      <div className="absolute -top-28 inset-x-0 h-28 bg-gradient-to-b from-transparent via-[#070E17]/60 to-[#070E17]/96 pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="max-w-[1240px] mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-16">
          {/* Brand Col */}
          <div className="md:col-span-5 flex flex-col items-start gap-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 group focus:outline-none"
              aria-label="BI 0 A 100 Inicio"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-b from-white to-slate-200 flex items-center justify-center shadow-[0_2px_12px_rgba(255,255,255,0.25)]">
                <span className="text-xs text-[#070E17] font-black leading-none tracking-tight font-sans">
                  BI
                </span>
              </div>
              <span className="text-white font-bold text-lg tracking-tight font-sans">
                0 A 100
              </span>
            </Link>

            <p className="text-slate-300 max-w-sm text-sm font-normal leading-relaxed font-sans">
              Auditoría y validación comercial de modelos de negocio con datos de demanda territorial en tiempo real, plataformas globales y normatividad vigente.
            </p>
          </div>

          {/* Nav Col 1 */}
          <div className="md:col-span-3 flex flex-col gap-3">
            <span className="text-xs font-sans font-bold uppercase tracking-wider text-white/90 mb-1">
              Plataforma
            </span>
            <Link href="#modulos" className="text-sm text-slate-300 hover:text-white transition-colors font-sans py-0.5">
              Módulos de Validación
            </Link>
            <Link href="#herramientas" className="text-sm text-slate-300 hover:text-white transition-colors font-sans py-0.5">
              Herramientas Operativas
            </Link>
            <Link href="/pricing" className="text-sm text-slate-300 hover:text-white transition-colors font-sans py-0.5">
              Planes y Suscripciones
            </Link>
            <Link href="/auth/login" className="text-sm text-slate-300 hover:text-white transition-colors font-sans py-0.5">
              Acceso a Panel
            </Link>
          </div>

          {/* Nav Col 2 */}
          <div className="md:col-span-4 flex flex-col gap-3">
            <span className="text-xs font-sans font-bold uppercase tracking-wider text-white/90 mb-1">
              Legal y Cumplimiento
            </span>
            <Link href="/terminos" className="text-sm text-slate-300 hover:text-white transition-colors font-sans py-0.5">
              Términos de Servicio
            </Link>
            <Link href="/privacidad" className="text-sm text-slate-300 hover:text-white transition-colors font-sans py-0.5">
              Aviso de Privacidad y Datos
            </Link>
            <Link href="/network" className="text-sm text-slate-300 hover:text-white transition-colors font-sans py-0.5">
              Red de Profesiones y Oficios
            </Link>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-white/[0.08] gap-4">
          <span className="text-xs font-sans text-slate-400">
            © {new Date().getFullYear()} BI 0 A 100. Todos los derechos reservados.
          </span>
        </div>

      </div>
    </footer>
  );
}
