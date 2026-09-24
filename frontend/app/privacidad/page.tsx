'use client';

import Link from 'next/link';

export default function PrivacidadPage() {
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
          <span className="text-xs font-bold text-[#10B981] uppercase tracking-widest">Privacidad</span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">Aviso de Privacidad</h1>
          <p className="text-sm text-white/60 leading-relaxed">
            Tu privacidad y la seguridad de la información de tu negocio son nuestra máxima prioridad.
          </p>
        </div>

        <section className="space-y-6 text-sm text-white/70 leading-relaxed">
          <div>
            <h2 className="text-lg font-bold text-white mb-2">1. Recolección de Información</h2>
            <p>
              Recopilamos únicamente la información necesaria para el funcionamiento de tus análisis y la operación de tus herramientas comerciales.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-2">2. Seguridad</h2>
            <p>
              Toda la comunicación está protegida mediante encriptación SSL/TLS y las contraseñas se almacenan mediante algoritmos seguros.
            </p>
          </div>
        </section>

        <div className="pt-8 border-t border-white/10 flex justify-between items-center text-xs text-white/40">
          <span>BI 0 A 100 &copy; Todos los derechos reservados.</span>
          <Link href="/auth/login" className="text-[#10B981] hover:underline">
            Ir al Login →
          </Link>
        </div>
      </div>
    </main>
  );
}
