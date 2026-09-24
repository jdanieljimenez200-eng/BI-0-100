// Tipos compartidos por la Fila de hoy y el panel de Lugares.
// Espejo de backend/src/models/{TurnoEspera,LugarAtencion}.ts.

export type EstadoTurno = 'esperando' | 'llamado' | 'atendido' | 'liberado' | 'no_llego';

export interface OcupacionLugar {
  turno_id: string;
  cliente_nombre: string;
  personas: number;
  /** ISO de cuándo se sentó. */
  desde: string | null;
}

export interface Lugar {
  id: string;
  nombre: string;
  capacidad: number | null;
  orden: number;
  activo: boolean;
  negocio_id: string | null;
  producto_id: string | null;
  /** null = libre. Lo calcula el backend a partir de los turnos «atendido». */
  ocupado_por: OcupacionLugar | null;
}

export interface Turno {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  personas: number;
  notas: string | null;
  lugar_id: string | null;
  estado: EstadoTurno;
  fecha: string;
  producto_id: string | null;
  hora_llegada: string;
  hora_llamado: string | null;
  hora_atendido: string | null;
  hora_liberado: string | null;
}

/** «hace 12 min» / «hace 1 h 05» a partir de un ISO. */
export function desdeHace(iso: string | null): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** Hora local corta (09:45) de un ISO. */
export function horaCorta(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
