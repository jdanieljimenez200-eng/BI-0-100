import { Alerta, EntradaAlertas, EquipoPendiente, ItemStock, MetaNegocio, SerieIngresos } from './types';

// ── Utilidad: coacciona decimales de TypeORM (string | number) a número finito ─
function num(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

// ── Alertas de stock ──────────────────────────────────────────────────────────
// Rojo: agotado (stock_actual <= 0). Amarillo: en o por debajo del mínimo.
// stock_minimo <= 0 se interpreta como "sin umbral configurado" → se ignora
// para el nivel amarillo (pero el agotado siempre se reporta).
function alertasStock(items: ItemStock[]): Alerta[] {
  const alertas: Alerta[] = [];
  for (const item of items) {
    const actual = num(item.stock_actual);
    const minimo = num(item.stock_minimo);
    const unidad = item.unidad ? ` ${item.unidad}` : '';

    if (actual <= 0) {
      alertas.push({
        nivel: 'rojo',
        tipo: 'stock',
        mensaje: `${item.nombre} está agotado (0${unidad}). Reabastece para no frenar ventas.`,
      });
    } else if (minimo > 0 && actual <= minimo) {
      alertas.push({
        nivel: 'amarillo',
        tipo: 'stock',
        mensaje: `${item.nombre} bajo mínimo: ${actual}${unidad} (mínimo ${minimo}${unidad}).`,
      });
    }
  }
  return alertas;
}

// ── Alerta de caída de ingresos ────────────────────────────────────────────────
// Compara periodo actual vs anterior. Solo aplica si el periodo anterior tuvo
// ingresos (> 0); si arrancó de cero no hay "caída" que medir.
function alertaIngresos(serie: SerieIngresos, umbral: number): Alerta | null {
  const actual = num(serie.ingreso_actual);
  const anterior = num(serie.ingreso_anterior);
  if (anterior <= 0) return null;

  const caida = (anterior - actual) / anterior; // fracción positiva = bajaron
  if (caida >= umbral) {
    const pct = Math.round(caida * 100);
    return {
      nivel: 'rojo',
      tipo: 'ingresos',
      mensaje: `Los ingresos cayeron ${pct}% respecto al periodo anterior. Revisa ventas y gastos.`,
    };
  }
  return null;
}

// ── Alertas de metas ────────────────────────────────────────────────────────────
// Amarillo cuando el avance queda por debajo del 100% al cerrar el periodo.
// objetivo <= 0 se ignora (meta no configurada).
function alertasMetas(metas: MetaNegocio[]): Alerta[] {
  const alertas: Alerta[] = [];
  for (const meta of metas) {
    const objetivo = num(meta.objetivo);
    const actual = num(meta.actual);
    if (objetivo <= 0) continue;

    if (actual >= objetivo) {
      alertas.push({
        nivel: 'verde',
        tipo: 'meta',
        mensaje: `Meta "${meta.nombre}" cumplida: ${actual} de ${objetivo}.`,
      });
    } else {
      const pct = Math.round((actual / objetivo) * 100);
      alertas.push({
        nivel: 'amarillo',
        tipo: 'meta',
        mensaje: `Meta "${meta.nombre}" al ${pct}%: ${actual} de ${objetivo}.`,
      });
    }
  }
  return alertas;
}

// ── Orquestador puro ────────────────────────────────────────────────────────────
// Evalúa todas las reglas y devuelve las alertas ordenadas por severidad
// (rojo → amarillo → verde). No toca DB ni envía nada: solo decide.
// ── Alertas de mantenimiento ─────────────────────────────────────────────────
// Rojo: la fecha ya pasó. Amarillo: entra en la ventana de aviso del equipo.
// Un equipo parado por falta de servicio cuesta más que el servicio.
function alertasMantenimiento(equipos: EquipoPendiente[]): Alerta[] {
  return equipos.map((equipo) => {
    const dias = Math.abs(equipo.dias_restantes);
    if (equipo.estado === 'vencido') {
      return {
        nivel: 'rojo' as const,
        tipo: 'mantenimiento',
        mensaje:
          dias === 0
            ? `${equipo.nombre}: el mantenimiento vence hoy.`
            : `${equipo.nombre}: mantenimiento vencido hace ${dias} ${dias === 1 ? 'día' : 'días'}.`,
      };
    }
    return {
      nivel: 'amarillo' as const,
      tipo: 'mantenimiento',
      mensaje:
        dias === 0
          ? `${equipo.nombre}: toca mantenimiento hoy.`
          : `${equipo.nombre}: toca mantenimiento en ${dias} ${dias === 1 ? 'día' : 'días'}.`,
    };
  });
}

export function evaluarAlertas(entrada: EntradaAlertas): Alerta[] {
  const umbral =
    typeof entrada.umbralCaidaIngresos === 'number' && entrada.umbralCaidaIngresos > 0
      ? entrada.umbralCaidaIngresos
      : 0.2; // 20% por defecto

  const alertas: Alerta[] = [];
  alertas.push(...alertasStock(entrada.stock ?? []));
  if (entrada.ingresos) {
    const a = alertaIngresos(entrada.ingresos, umbral);
    if (a) alertas.push(a);
  }
  alertas.push(...alertasMetas(entrada.metas ?? []));
  alertas.push(...alertasMantenimiento(entrada.mantenimientos ?? []));

  const peso: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2 };
  return alertas.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}