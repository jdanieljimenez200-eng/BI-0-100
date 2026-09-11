import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#070E17] pt-32 pb-12 px-6 border-t border-white/[0.03] overflow-hidden relative">
      <div className="max-w-[1400px] mx-auto relative z-10">
        
        {/* Massive Logomark Background */}
        <div className="absolute top-0 right-0 pointer-events-none select-none opacity-[0.02]">
          <span className="text-[300px] font-black leading-none tracking-tighter">0-100</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-24">
          <div className="md:col-span-5 flex flex-col items-start gap-4">
            <Link href="/" className="text-white font-extrabold text-2xl tracking-tighter flex items-center gap-3">
               <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                 <span className="text-[11px] text-[#070E17] font-black leading-none">BI</span>
               </div>
               0 A 100
            </Link>
            <p className="text-white/40 max-w-sm font-light leading-relaxed mt-4">
              Arquitectura de validación comercial. Modelos financieros y analítica de mercado desplegados en minutos.
            </p>
          </div>
          
          <div className="md:col-span-3 flex flex-col gap-4">
             <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-white/30 mb-2">Plataforma</span>
             <Link href="/pricing" className="text-sm text-white/50 hover:text-white transition-colors">Suscripciones</Link>
             <Link href="/auth/login" className="text-sm text-white/50 hover:text-white transition-colors">Acceso a Panel</Link>
             <Link href="/auth/signup" className="text-sm text-white/50 hover:text-white transition-colors">Nuevo Análisis</Link>
          </div>

          <div className="md:col-span-4 flex flex-col gap-4">
             <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-white/30 mb-2">Legal</span>
             <Link href="/terminos" className="text-sm text-white/50 hover:text-white transition-colors">Términos de Servicio</Link>
             <Link href="/privacidad" className="text-sm text-white/50 hover:text-white transition-colors">Privacidad de Datos</Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/5">
          <span className="text-[10px] font-bold tracking-widest text-white/30 uppercase">
            © {new Date().getFullYear()} BI 0 A 100. Sistema Activo.
          </span>
          <span className="text-[10px] font-bold tracking-widest text-[#E74C3C] uppercase mt-4 md:mt-0 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#E74C3C] animate-pulse rounded-full" />
            Todos los servicios operacionales
          </span>
        </div>
      </div>
    </footer>
  );
}
