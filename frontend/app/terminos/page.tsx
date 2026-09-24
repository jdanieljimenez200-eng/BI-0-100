'use client';

import Link from 'next/link';

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-[#03070C] text-white px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <Link href="/" className="text-sm font-bold text-white/50 hover:text-white transition-colors">
            ← Volver al inicio
          </Link>
          <span className="text-xs text-white/30 uppercase tracking-widest font-mono">Septiembre 2026</span>
        </div>

        <div className="space-y-3">
          <span className="text-xs font-bold text-[#3B82F6] uppercase tracking-widest">Legal</span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">Términos de Servicio</h1>
          <p className="text-sm text-white/60 leading-relaxed">
            Al acceder o utilizar la plataforma BI 0 A 100, aceptas cumplir con los presentes Términos de Servicio.
          </p>
        </div>

        <section className="space-y-6 text-sm text-white/70 leading-relaxed">
          <div>
            <h2 className="text-lg font-bold text-white mb-2">1. Objeto del Servicio</h2>
            <p>
              BI 0 A 100 provee herramientas de gestión empresarial, finanzas, inventario, ventas y diagnóstico de negocios asistidos por inteligencia artificial.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-2">2. Propiedad de Datos</h2>
            <p>
              Todos los datos ingresados en el espacio de trabajo pertenecen exclusivamente a ti y a tu negocio.
            </p>
          </div>
        </section>

        <div className="pt-8 border-t border-white/10 flex justify-between items-center text-xs text-white/40">
          <span>BI 0 A 100 &copy; Todos los derechos reservados.</span>
          <Link href="/auth/login" className="text-[#3B82F6] hover:underline">
            Ir al Login →
          </Link>
        </div>
      </div>
    </main>
  );
}
