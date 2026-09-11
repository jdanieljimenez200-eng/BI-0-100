import { periodoAnterior, variacion } from '../../services/reportes/reportesService';
import { timezoneDePais, timezoneSegura } from '../../utils/timezones';

describe('reportesService.periodoAnterior', () => {
  it('un rango de 7 días devuelve los 7 días inmediatamente anteriores', () => {
    expect(periodoAnterior('2026-03-08', '2026-03-14')).toEqual({
      desde: '2026-03-01',
      hasta: '2026-03-07',
    });
  });

  it('un solo día devuelve el día anterior', () => {
    expect(periodoAnterior('2026-03-10', '2026-03-10')).toEqual({
      desde: '2026-03-09',
      hasta: '2026-03-09',
    });
  });

  it('el periodo anterior nunca se solapa con el actual', () => {
    const { hasta } = periodoAnterior('2026-05-01', '2026-05-31');
    expect(hasta < '2026-05-01').toBe(true);
  });

  it('cruza el cambio de año sin desfase', () => {
    // Enero tiene 31 días, así que el periodo previo son los 31 de diciembre.
    expect(periodoAnterior('2026-01-01', '2026-01-31')).toEqual({
      desde: '2025-12-01',
      hasta: '2025-12-31',
    });
  });

  it('cubre exactamente el mismo número de días que el periodo actual', () => {
    const previo = periodoAnterior('2026-02-01', '2026-02-28'); // 28 días
    const dias =
      (new Date(`${previo.hasta}T00:00:00Z`).getTime() -
        new Date(`${previo.desde}T00:00:00Z`).getTime()) /
        86400000 +
      1;
    expect(dias).toBe(28);
  });

  it('maneja un año bisiesto en el periodo previo', () => {
    // 2024 fue bisiesto: el rango previo debe incluir el 29 de febrero.
    const previo = periodoAnterior('2024-03-01', '2024-03-05');
    expect(previo).toEqual({ desde: '2024-02-25', hasta: '2024-02-29' });
  });
});

describe('reportesService.variacion', () => {
  it('calcula el porcentaje de crecimiento', () => {
    expect(variacion(150, 100)).toBe(50);
  });

  it('calcula el porcentaje de caída', () => {
    expect(variacion(75, 100)).toBe(-25);
  });

  it('devuelve null cuando no hay base de comparación', () => {
    // Sin periodo previo no existe un "+100%": no hay contra qué comparar. El
    // front debe pintar "sin datos previos", no un porcentaje inventado.
    expect(variacion(500, 0)).toBeNull();
  });

  it('devuelve 0 cuando no hubo cambio', () => {
    expect(variacion(100, 100)).toBe(0);
  });

  it('redondea a dos decimales', () => {
    expect(variacion(1, 3)).toBe(-66.67);
  });
});

describe('timezones', () => {
  it('mapea los países principales a su zona IANA', () => {
    expect(timezoneDePais('MX')).toBe('America/Mexico_City');
    expect(timezoneDePais('CO')).toBe('America/Bogota');
    expect(timezoneDePais('AR')).toBe('America/Argentina/Buenos_Aires');
  });

  it('acepta el código en minúsculas', () => {
    expect(timezoneDePais('mx')).toBe('America/Mexico_City');
  });

  it('cae a la zona por defecto con país desconocido, null o vacío', () => {
    expect(timezoneDePais('ZZ')).toBe('America/Mexico_City');
    expect(timezoneDePais(null)).toBe('America/Mexico_City');
    expect(timezoneDePais('')).toBe('America/Mexico_City');
  });

  it('timezoneSegura rechaza cualquier valor fuera de la lista blanca', () => {
    // El valor se interpola en SQL: esta función es lo único que impide una
    // inyección por ahí.
    expect(timezoneSegura("America/Bogota'; DROP TABLE ventas; --")).toBe('America/Mexico_City');
    expect(timezoneSegura('Marte/Olympus')).toBe('America/Mexico_City');
  });

  it('timezoneSegura deja pasar las zonas válidas', () => {
    expect(timezoneSegura('America/Lima')).toBe('America/Lima');
    expect(timezoneSegura('UTC')).toBe('UTC');
  });
});
