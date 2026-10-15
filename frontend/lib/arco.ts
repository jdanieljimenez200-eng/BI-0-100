/**
 * Derechos ARCO: qué se puede pedir y en qué estado va una solicitud. Lo usan el
 * formulario público (`/arco`) y la bandeja del superadmin. Los valores son los
 * de `backend/src/services/cumplimiento/arco.ts`.
 */
import type { EstadoArco, TipoArco } from '@/lib/admin';

export const TIPOS_ARCO: { valor: TipoArco; titulo: string; detalle: string }[] = [
  { valor: 'acceso', titulo: 'Acceso', detalle: 'Saber qué datos tuyos tenemos y para qué los usamos.' },
  { valor: 'rectificacion', titulo: 'Rectificación', detalle: 'Corregir datos inexactos o incompletos.' },
  { valor: 'cancelacion', titulo: 'Cancelación', detalle: 'Que borremos tus datos (y tu cuenta, si la tienes).' },
  { valor: 'oposicion', titulo: 'Oposición', detalle: 'Que dejemos de usar tus datos para un fin concreto.' },
  { valor: 'revocacion', titulo: 'Revocar consentimiento', detalle: 'Retirar el permiso que nos diste.' },
  { valor: 'limitacion', titulo: 'Limitar el uso', detalle: 'Dejar de recibir comunicaciones que no son necesarias.' },
];

export const NOMBRE_TIPO_ARCO = Object.fromEntries(TIPOS_ARCO.map((t) => [t.valor, t.titulo])) as Record<TipoArco, string>;

export const NOMBRE_ESTADO_ARCO: Record<EstadoArco, string> = {
  recibida: 'Recibida',
  requiere_info: 'Requiere información',
  en_revision: 'En revisión',
  respondida: 'Respondida',
  ejecutada: 'Ejecutada',
  improcedente: 'Improcedente',
  remitida: 'Remitida al negocio',
};

export const ESTADOS_ABIERTOS: EstadoArco[] = ['recibida', 'requiere_info', 'en_revision'];
