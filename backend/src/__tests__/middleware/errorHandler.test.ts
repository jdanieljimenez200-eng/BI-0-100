import type { Request, Response, NextFunction } from 'express';

jest.mock('../../config/sentry', () => ({ reportarError: jest.fn() }));

import { errorHandler } from '../../middleware/errorHandler';
import { reportarError } from '../../config/sentry';

function llamar(err: unknown) {
  const res = {
    headersSent: false,
    statusCode: 0,
    cuerpo: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.cuerpo = b; return this; },
  };
  const req = { path: '/api/pos/catalogo', method: 'POST' } as Request;
  errorHandler(err, req, res as unknown as Response, jest.fn() as unknown as NextFunction);
  return res as { statusCode: number; cuerpo: { error: string; statusCode: number } };
}

/** Lo que lanza TypeORM: QueryFailedError copia el `code` del driver. */
const dePostgres = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('errorHandler — errores de Postgres causados por el dato', () => {
  beforeEach(() => (reportarError as jest.Mock).mockClear());

  it.each([
    ['22001', 400, 'value too long for type character varying(200)'],
    ['22003', 400, 'numeric field overflow'],
    ['22P02', 400, 'invalid input syntax for type integer: "8000.5"'],
    ['23514', 400, 'new row for relation "resenas_experto" violates check constraint'],
    ['23505', 409, 'duplicate key value violates unique constraint "IDX_usuarios_email"'],
  ])('%s responde %i, no 500, y no alerta a Sentry', (code, status, mensajePg) => {
    const res = llamar(dePostgres(code, mensajePg));

    expect(res.statusCode).toBe(status);
    expect(reportarError).not.toHaveBeenCalled();
    // El mensaje de Postgres lleva nombres de columnas y valores: no sale.
    expect(res.cuerpo.error).not.toContain(mensajePg);
  });

  it('un error de Postgres que no es del dato sigue siendo 500 y se reporta', () => {
    const res = llamar(dePostgres('57014', 'canceling statement due to statement timeout'));

    expect(res.statusCode).toBe(500);
    expect(res.cuerpo.error).toBe('Internal Server Error');
    expect(reportarError).toHaveBeenCalledTimes(1);
  });

  it('un status explícito manda sobre el código de Postgres', () => {
    const res = llamar(Object.assign(dePostgres('23505', 'duplicado'), { statusCode: 422 }));

    expect(res.statusCode).toBe(422);
  });
});
