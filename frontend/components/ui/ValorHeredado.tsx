'use client';

interface Props {
  /** De dónde viene el dato. Por defecto, del alta del producto. */
  origen?: string;
  className?: string;
}

/**
 * Marca un campo que viene pre-llenado con algo que el usuario ya contestó.
 *
 * Existe para que el pre-llenado nunca sea silencioso: un valor heredado que el
 * usuario no ve puede arrastrar un dato viejo hasta un análisis nuevo sin que
 * nadie lo revise. Diciendo de dónde sale, el campo sigue siendo suyo y lo
 * puede corregir.
 */
export default function ValorHeredado({ origen = 'tu producto', className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40 ${className}`}
      title={`Este valor viene de ${origen}. Puedes cambiarlo.`}
    >
      de {origen}
    </span>
  );
}
