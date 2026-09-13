/**
 * Aviso de que parte del análisis salió de una plantilla porque la IA no
 * respondió a tiempo. El backend lo marca en `resultado_estimado` y, por eso
 * mismo, ese análisis no descuenta de la cuota del plan gratuito.
 */
export default function AvisoEstimacion({ visible, className = '' }: { visible?: boolean | null; className?: string }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className={`rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-100/85 ${className}`}
    >
      <strong className="font-semibold text-amber-200">Parte de este resultado es una estimación.</strong> La IA no respondió a
      tiempo y algunas secciones se completaron con una plantilla general. Puedes volver a lanzar el análisis: este no se
      descontó de tu plan.
    </div>
  );
}
