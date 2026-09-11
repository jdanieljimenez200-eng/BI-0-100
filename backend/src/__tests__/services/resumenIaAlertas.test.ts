import {
  claveCache,
  construirResumenLocal,
  severidadDominante,
  variacionIngresos,
} from '../../services/alertas/resumenIaService';
import type { AlertasOperativas } from '../../services/alertas/agregadorOperativo';
import type { Alerta } from '../../services/alertas/types';

/**
 * Solo se prueban las partes puras: severidad, variación, huella de caché y el
 * resumen local determinista (que es también el fallback cuando el LLM falla).
 * Nada de Redis, DB ni red.
 */

function datosBase(overrides: Partial<AlertasOperativas> = {}): AlertasOperativas {
  return {
    alertas: [],
    resumen: { rojo: 0, amarillo: 0, verde: 0, total: 0 },
    periodo: {
      dias: 30,
      actual: { desde: '2026-07-30', hasta: '2026-08-28' },
      anterior: { desde: '2026-06-30', hasta: '2026-07-29' },
      ingreso_actual: 0,
      ingreso_anterior: 0,
      ventas_actual: 0,
      ventas_anterior: 0,
    },
    metas_evaluadas: 0,
    articulos_evaluados: 0,
    ...overrides,
  };
}

describe('severidadDominante', () => {
  it('prioriza rojo sobre amarillo', () => {
    expect(severidadDominante({ rojo: 1, amarillo: 5 })).toBe('rojo');
  });

  it('devuelve amarillo cuando no hay rojos', () => {
    expect(severidadDominante({ rojo: 0, amarillo: 2 })).toBe('amarillo');
  });

  it('devuelve verde sin rojos ni amarillos', () => {
    expect(severidadDominante({ rojo: 0, amarillo: 0 })).toBe('verde');
  });
});

describe('variacionIngresos', () => {
  it('devuelve null si el periodo anterior fue cero', () => {
    expect(variacionIngresos(1000, 0)).toBeNull();
  });

  it('calcula la caída en porcentaje entero', () => {
    expect(variacionIngresos(800, 1000)).toBe(-20);
  });

  it('calcula el crecimiento en porcentaje entero', () => {
    expect(variacionIngresos(1500, 1000)).toBe(50);
  });
});

describe('claveCache', () => {
  const alertas: Alerta[] = [{ nivel: 'rojo', tipo: 'stock', mensaje: 'Café está agotado (0 kg).' }];

  it('es estable para la misma entrada', () => {
    expect(claveCache('u1', null, 30, alertas, 100, 200)).toBe(
      claveCache('u1', null, 30, alertas, 100, 200),
    );
  });

  it('cambia si cambian las alertas', () => {
    const otras: Alerta[] = [{ nivel: 'amarillo', tipo: 'stock', mensaje: 'Café bajo mínimo.' }];
    expect(claveCache('u1', null, 30, alertas, 100, 200)).not.toBe(
      claveCache('u1', null, 30, otras, 100, 200),
    );
  });

  it('aísla por usuario y por negocio', () => {
    expect(claveCache('u1', null, 30, alertas, 100, 200)).not.toBe(
      claveCache('u2', null, 30, alertas, 100, 200),
    );
    expect(claveCache('u1', null, 30, alertas, 100, 200)).not.toBe(
      claveCache('u1', 'neg-1', 30, alertas, 100, 200),
    );
  });

  it('incluye el usuario en la clave para evitar fugas entre cuentas', () => {
    expect(claveCache('u1', null, 30, alertas, 100, 200)).toContain('u1');
  });
});

describe('construirResumenLocal', () => {
  it('sin alertas sugiere configurar stock y metas cuando no hay nada que vigilar', () => {
    const r = construirResumenLocal(datosBase());
    expect(r.es_mock).toBe(true);
    expect(r.prioridades).toHaveLength(0);
    expect(r.siguiente_paso).toContain('stock mínimo');
  });

  it('sin alertas pero con datos vigilados no pide configuración', () => {
    const r = construirResumenLocal(datosBase({ articulos_evaluados: 12, metas_evaluadas: 2 }));
    expect(r.titular).toContain('Sin señales de riesgo');
    expect(r.siguiente_paso).not.toContain('stock mínimo');
  });

  it('ordena las prioridades por severidad y omite las verdes', () => {
    const r = construirResumenLocal(
      datosBase({
        alertas: [
          { nivel: 'verde', tipo: 'meta', mensaje: 'Meta "Ventas" cumplida: 10 de 10.' },
          { nivel: 'amarillo', tipo: 'stock', mensaje: 'Leche bajo mínimo: 2 L (mínimo 5 L).' },
          { nivel: 'rojo', tipo: 'stock', mensaje: 'Café está agotado (0 kg).' },
        ],
        resumen: { rojo: 1, amarillo: 1, verde: 1, total: 3 },
        articulos_evaluados: 20,
        metas_evaluadas: 1,
      }),
    );

    expect(r.prioridades.map((p) => p.nivel)).toEqual(['rojo', 'amarillo']);
    expect(r.siguiente_paso).toContain('Café');
    expect(r.titular).toContain('crítica');
  });

  it('reporta la caída de ingresos en el diagnóstico', () => {
    const r = construirResumenLocal(
      datosBase({
        alertas: [
          { nivel: 'rojo', tipo: 'ingresos', mensaje: 'Los ingresos cayeron 40% respecto al periodo anterior.' },
        ],
        resumen: { rojo: 1, amarillo: 0, verde: 0, total: 1 },
        periodo: { ...datosBase().periodo, ingreso_actual: 600, ingreso_anterior: 1000 },
      }),
    );

    expect(r.diagnostico).toContain('abajo 40%');
  });

  it('no afirma variación cuando no hay periodo anterior comparable', () => {
    const r = construirResumenLocal(
      datosBase({
        alertas: [{ nivel: 'amarillo', tipo: 'meta', mensaje: 'Meta "Q3" al 50%: 5 de 10.' }],
        resumen: { rojo: 0, amarillo: 1, verde: 0, total: 1 },
        periodo: { ...datosBase().periodo, ingreso_actual: 500, ingreso_anterior: 0 },
      }),
    );

    expect(r.diagnostico).toContain('sin periodo anterior comparable');
  });

  it('tolera decimales que llegan como string desde TypeORM', () => {
    const r = construirResumenLocal(
      datosBase({
        alertas: [{ nivel: 'rojo', tipo: 'ingresos', mensaje: 'Caída fuerte.' }],
        resumen: { rojo: 1, amarillo: 0, verde: 0, total: 1 },
        periodo: {
          ...datosBase().periodo,
          ingreso_actual: '750.50' as unknown as number,
          ingreso_anterior: '1500.00' as unknown as number,
        },
      }),
    );

    expect(r.diagnostico).toContain('abajo 50%');
  });
});