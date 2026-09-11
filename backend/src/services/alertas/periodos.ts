import { Alerta, NivelAlerta } from './types';

/**
 * Helpers puros de periodo y resumen usados por el agregador operativo.
 * Sin dependencias de TypeORM ni de red: testeables en aislamiento.
 */

export interface RangoFechas {
  desde: string; // YYYY-MM-DD inclusive
  hasta: string; // YYYY-MM-DD inclusive
}

export interface RangosPeriodo {
  dias: number;
  actual: RangoFechas;
  anterior: RangoFechas;
}

export interface ResumenNiveles {
  rojo: number;
  amarillo: number;
  verde: number;
  total: number;
}

const DIAS_POR_DEFECTO = 30;

/** Fecha en formato YYYY-MM-DD usando el calendario UTC. */
export function toISODate(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Copia la fecha a medianoche UTC y le suma (o resta) días. */
function sumarDias(base: Date, dias: number): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/**
 * Ventana actual (que termina hoy) y la ventana anterior contigua del mismo
 * tamaño, para comparar ingresos periodo contra periodo.
 * Valores no válidos de `dias` caen a 30.
 */
export function rangosPeriodo(dias: number, hoy: Date = new Date()): RangosPeriodo {
  const ventana =
    Number.isFinite(dias) && dias > 0 ? Math.min(Math.floor(dias), 365) : DIAS_POR_DEFECTO;

  const fin = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const inicio = sumarDias(fin, -(ventana - 1));
  const finAnterior = sumarDias(inicio, -1);
  const inicioAnterior = sumarDias(finAnterior, -(ventana - 1));

  return {
    dias: ventana,
    actual: { desde: toISODate(inicio), hasta: toISODate(fin) },
    anterior: { desde: toISODate(inicioAnterior), hasta: toISODate(finAnterior) },
  };
}

/** Conteo por severidad, mismo contrato de resumen que usa /dashboard/alertas. */
export function resumirNivelesAlertas(alertas: Alerta[]): ResumenNiveles {
  const resumen: ResumenNiveles = { rojo: 0, amarillo: 0, verde: 0, total: 0 };
  for (const alerta of alertas) {
    const nivel: NivelAlerta = alerta.nivel;
    if (nivel === 'rojo' || nivel === 'amarillo' || nivel === 'verde') {
      resumen[nivel] += 1;
      resumen.total += 1;
    }
  }
  return resumen;
}

export interface AlertasResumidas {
  /** Lista ya recortada según `soloAccionables`. */
  alertas: Alerta[];
  /** Conteos de TODO lo evaluado, independientes del recorte. */
  resumen: ResumenNiveles;
}

/**
 * Resume primero y filtra después.
 *
 * El orden importa: si se filtran las verdes antes de contar, `resumen.verde`
 * queda siempre en 0 y `resumen.total` se encoge, de modo que el badge de la UI
 * (que lee `resumen`) contradice lo que el panel evaluó de verdad. El recorte es
 * una decisión de presentación y no debe alterar el diagnóstico.
 */
export function resumirYFiltrar(alertas: Alerta[], soloAccionables = false): AlertasResumidas {
  const resumen = resumirNivelesAlertas(alertas);
  return {
    alertas: soloAccionables ? alertas.filter((a) => a.nivel !== 'verde') : alertas,
    resumen,
  };
}