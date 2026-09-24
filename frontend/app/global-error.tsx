'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="bg-[#0b1421] text-white flex min-h-screen flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Algo salió mal</h2>
          <p className="text-white/60 mb-6 text-sm">
            Ocurrió un error inesperado al cargar la aplicación.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
