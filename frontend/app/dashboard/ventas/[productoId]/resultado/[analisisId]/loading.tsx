'use client';

/**
 * Skeleton instantáneo mientras el segmento de resultado se hidrata.
 * La carga real del análisis usa <CargaAnalisisVentas /> dentro de la página.
 */

export default function LoadingVentasResultado() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070B12]">
      <div className="pointer-events-none absolute -top-48 -left-48 h-[480px] w-[480px] rounded-full bg-emerald-500/10 blur-[160px]" />
      <div className="pointer-events-none absolute -right-48 top-1/3 h-[420px] w-[420px] rounded-full bg-cyan-500/10 blur-[150px]" />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6">
        <svg viewBox="0 0 400 140" className="h-28 w-full max-w-md opacity-70" fill="none">
          <path
            d="M0,120 C50,118 70,100 110,98 C150,96 170,80 210,72 C250,64 280,44 330,30 L400,14"
            stroke="url(#g)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="8 10"
          />
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
        </svg>
        <p className="text-sm font-medium tracking-wide text-white/50">Abriendo tu análisis de ventas…</p>
        <div className="h-1 w-48 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
        </div>
      </div>
    </div>
  );
}
