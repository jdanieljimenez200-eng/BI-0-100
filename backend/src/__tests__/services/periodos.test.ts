import {
  rangosPeriodo,
  resumirNivelesAlertas,
  resumirYFiltrar,
  toISODate,
} from '../../services/alertas/periodos';
import { Alerta } from '../../services/alertas/types';

describe('toISODate', () => {
  it('formatea en UTC sin desfase de zona', () => {
    expect(toISODate(new Date(Date.UTC(2026, 7, 28, 23, 59, 59)))).toBe('2026-08-28');
    expect(toISODate(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))).toBe('2026-01-01');
  });
});

describe('rangosPeriodo', () => {
  const hoy = new Date(Date.UTC(2026, 7, 28));

  it('genera dos ventanas contiguas del mismo tamaño', () => {
    const rangos = rangosPeriodo(30, hoy);
    expect(rangos.dias).toBe(30);
    expect(rangos.actual).toEqual({ desde: '2026-07-30', hasta: '2026-08-28' });
    expect(rangos.anterior).toEqual({ desde: '2026-06-30', hasta: '2026-07-29' });
  });

  it('la ventana anterior termina justo un día antes de la actual', () => {
    const rangos = rangosPeriodo(7, hoy);
    expect(rangos.actual.desde).toBe('2026-08-22');
    expect(rangos.anterior.hasta).toBe('2026-08-21');
    expect(rangos.anterior.desde).toBe('2026-08-15');
  });

  it('cae a 30 días con valores no válidos', () => {
    expect(rangosPeriodo(0, hoy).dias).toBe(30);
    expect(rangosPeriodo(-5, hoy).dias).toBe(30);
    expect(rangosPeriodo(Number.NaN, hoy).dias).toBe(30);
  });

  it('topa la ventana en 365 días', () => {
    expect(rangosPeriodo(5000, hoy).dias).toBe(365);
  });

  it('cruza el inicio de año correctamente', () => {
    const rangos = rangosPeriodo(30, new Date(Date.UTC(2026, 0, 15)));
    expect(rangos.actual).toEqual({ desde: '2025-12-17', hasta: '2026-01-15' });
    expect(rangos.anterior).toEqual({ desde: '2025-11-17', hasta: '2025-12-16' });
  });
});

describe('resumirNivelesAlertas', () => {
  it('cuenta por severidad', () => {
    const alertas: Alerta[] = [
      { nivel: 'rojo', tipo: 'stock', mensaje: 'a' },
      { nivel: 'rojo', tipo: 'ingresos', mensaje: 'b' },
      { nivel: 'amarillo', tipo: 'meta', mensaje: 'c' },
      { nivel: 'verde', tipo: 'meta', mensaje: 'd' },
    ];
    expect(resumirNivelesAlertas(alertas)).toEqual({ rojo: 2, amarillo: 1, verde: 1, total: 4 });
  });

  it('devuelve ceros con lista vacía', () => {
    expect(resumirNivelesAlertas([])).toEqual({ rojo: 0, amarillo: 0, verde: 0, total: 0 });
  });
});

describe('resumirYFiltrar', () => {
  const alertas: Alerta[] = [
    { nivel: 'rojo', tipo: 'stock', mensaje: 'Harina agotada' },
    { nivel: 'amarillo', tipo: 'meta', mensaje: 'Meta al 62%' },
    { nivel: 'verde', tipo: 'ingresos', mensaje: 'Ingresos estables' },
    { nivel: 'verde', tipo: 'meta', mensaje: 'Meta cumplida' },
  ];

  it('sin filtro devuelve todo y el resumen coincide con la lista', () => {
    const { alertas: salida, resumen } = resumirYFiltrar(alertas);
    expect(salida).toHaveLength(4);
    expect(resumen).toEqual({ rojo: 1, amarillo: 1, verde: 2, total: 4 });
    expect(resumen.total).toBe(salida.length);
  });

  it('con soloAccionables oculta las verdes pero NO altera el resumen', () => {
    const { alertas: salida, resumen } = resumirYFiltrar(alertas, true);
    expect(salida.map((a) => a.nivel)).toEqual(['rojo', 'amarillo']);
    // Este es el bug corregido: antes verde caía a 0 y total a 2.
    expect(resumen).toEqual({ rojo: 1, amarillo: 1, verde: 2, total: 4 });
  });

  it('no muta la lista recibida', () => {
    const original: Alerta[] = [...alertas];
    resumirYFiltrar(alertas, true);
    expect(alertas).toEqual(original);
  });

  it('soporta lista vacía con y sin filtro', () => {
    expect(resumirYFiltrar([])).toEqual({
      alertas: [],
      resumen: { rojo: 0, amarillo: 0, verde: 0, total: 0 },
    });
    expect(resumirYFiltrar([], true).alertas).toEqual([]);
  });
});