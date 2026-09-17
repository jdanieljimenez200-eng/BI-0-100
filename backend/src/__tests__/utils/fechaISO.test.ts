import { z } from 'zod';
import { fechaISO } from '../../middleware/validate';

const schema = z.object({ fecha: fechaISO('fecha inválida (YYYY-MM-DD)').optional() });

/**
 * Con solo el regex `\d{4}-\d{2}-\d{2}`, fechas que no existen pasaban la
 * validación y llegaban a una columna `date` de Postgres: 500 en vez de 400.
 */
describe('fechaISO', () => {
  it('acepta fechas reales, incluido el 29 de febrero bisiesto', () => {
    for (const fecha of ['2026-09-15', '2024-02-29', '2026-12-31', '2026-01-01']) {
      expect(schema.parse({ fecha }).fecha).toBe(fecha);
    }
  });

  it('rechaza fechas con forma correcta que no existen', () => {
    for (const fecha of ['2026-13-45', '2026-02-30', '2026-00-10', '2025-02-29', '2026-04-31']) {
      expect(schema.safeParse({ fecha }).success).toBe(false);
    }
  });

  it('rechaza otros formatos y texto arbitrario', () => {
    for (const fecha of ['15/09/2026', 'ayer', '2026-9-5', '2026-09-15T10:00:00Z', "2026-09-15'; DROP TABLE x; --"]) {
      expect(schema.safeParse({ fecha }).success).toBe(false);
    }
  });

  it('no depende de la zona horaria del servidor', () => {
    const tzOriginal = process.env.TZ;
    try {
      // Con una zona al oeste, construir la fecha en local desplazaría el día.
      process.env.TZ = 'America/Mexico_City';
      expect(schema.parse({ fecha: '2026-01-01' }).fecha).toBe('2026-01-01');
      process.env.TZ = 'Asia/Tokyo';
      expect(schema.parse({ fecha: '2026-12-31' }).fecha).toBe('2026-12-31');
    } finally {
      process.env.TZ = tzOriginal;
    }
  });

  it('es opcional cuando el schema lo declara así', () => {
    expect(schema.parse({}).fecha).toBeUndefined();
  });
});
