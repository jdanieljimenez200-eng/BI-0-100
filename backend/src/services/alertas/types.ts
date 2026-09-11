// Estructura de alerta canónica del proyecto (misma forma que mercado/types.ts:
// { nivel, tipo, mensaje }). Se replica aquí para que el módulo de alertas
// automáticas sea autocontenido y no dependa de un módulo de análisis.

export type NivelAlerta = 'verde' | 'amarillo' | 'rojo';

export interface Alerta {
  nivel: NivelAlerta;
  tipo: string;
  mensaje: string;
}

// ─── Entradas (datos ya resueltos por el orchestrator, sin acoplar a TypeORM) ──

export interface ItemStock {
  nombre: string;
  stock_actual: number | string; // TypeORM decimal → puede llegar como string
  stock_minimo: number | string;
  unidad?: string;
}

export interface SerieIngresos {
  // Ingresos del periodo en curso vs. el periodo anterior comparable, en la
  // misma unidad monetaria (centavos o pesos — el servicio no asume unidad).
  ingreso_actual: number | string;
  ingreso_anterior: number | string;
}

export interface MetaNegocio {
  nombre: string;
  objetivo: number | string; // meta a alcanzar en el periodo
  actual: number | string;   // avance real acumulado
}

export interface EntradaAlertas {
  stock?: ItemStock[];
  ingresos?: SerieIngresos | null;
  metas?: MetaNegocio[];
  // Umbral de caída de ingresos que dispara alerta roja (fracción, ej. 0.2 = 20%).
  umbralCaidaIngresos?: number;
}