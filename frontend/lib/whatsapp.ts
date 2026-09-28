/**
 * Número para `wa.me`: solo dígitos y en formato internacional.
 *
 * En LATAM casi todos anotan el número nacional («33 1234 5678»), y
 * `wa.me/3312345678` no abre el chat de nadie: le falta la lada del país.
 *
 * Copia de `backend/src/utils/whatsapp.ts` (el backend arma los enlaces de
 * clientes, citas, fila, cotizaciones y tickets): mantener las dos alineadas.
 */

interface Marcacion {
  lada: string;
  digitos: number[];
  movil?: string;
}

const MARCACION: Record<string, Marcacion> = {
  MX: { lada: '52', digitos: [10] },
  BR: { lada: '55', digitos: [10, 11] },
  CO: { lada: '57', digitos: [10] },
  AR: { lada: '54', digitos: [10], movil: '9' },
  CL: { lada: '56', digitos: [9] },
  PE: { lada: '51', digitos: [9] },
  EC: { lada: '593', digitos: [9] },
  GT: { lada: '502', digitos: [8] },
  PA: { lada: '507', digitos: [8] },
  CR: { lada: '506', digitos: [8] },
  HN: { lada: '504', digitos: [8] },
  SV: { lada: '503', digitos: [8] },
  NI: { lada: '505', digitos: [8] },
  BZ: { lada: '501', digitos: [7] },
  VE: { lada: '58', digitos: [10] },
  BO: { lada: '591', digitos: [8] },
  UY: { lada: '598', digitos: [8] },
  PY: { lada: '595', digitos: [9] },
};

export function telefonoWhatsApp(telefono: string | null | undefined, pais?: string | null): string {
  const crudo = (telefono ?? '').trim();
  const d = crudo.replace(/\D/g, '');
  if (!d) return '';
  if (crudo.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);

  const m = MARCACION[(pais ?? '').toUpperCase()] ?? MARCACION.MX;
  const conLada = m.digitos.flatMap((n) => [m.lada.length + n, m.lada.length + (m.movil?.length ?? 0) + n]);
  if (d.startsWith(m.lada) && conLada.includes(d.length)) return d;

  const nacional = d.replace(/^0+/, '');
  if (m.digitos.includes(nacional.length)) return m.lada + (m.movil ?? '') + nacional;
  return d;
}

/** Enlace `wa.me`; sin teléfono abre WhatsApp para elegir el chat. */
export function enlaceWhatsApp(telefono: string | null | undefined, pais: string | null | undefined, mensaje?: string): string {
  const n = telefonoWhatsApp(telefono, pais);
  return mensaje ? `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}` : `https://wa.me/${n}`;
}
