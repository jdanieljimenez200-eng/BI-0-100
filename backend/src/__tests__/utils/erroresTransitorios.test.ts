import { QueryFailedError } from 'typeorm';
import { esErrorTransitorio, esErrorDeBaseTransitorio } from '../../utils/erroresTransitorios';

const conCodigo = (code: string) => Object.assign(new Error('x'), { code });
const errorPg = (code: string) => Object.assign(new QueryFailedError('SELECT 1', [], new Error('pg')), { code });

describe('erroresTransitorios', () => {
  it('reintenta caídas de base, red y proveedores saturados', () => {
    expect(esErrorTransitorio(errorPg('57P01'))).toBe(true);
    expect(esErrorTransitorio(conCodigo('ECONNRESET'))).toBe(true);
    expect(esErrorTransitorio(new Error('connection terminated unexpectedly'))).toBe(true);
    expect(esErrorTransitorio(Object.assign(new Error('Overloaded'), { status: 529 }))).toBe(true);
    expect(esErrorTransitorio(Object.assign(new Error('rate'), { status: 429 }))).toBe(true);
    expect(esErrorTransitorio(Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' }))).toBe(true);
    expect(esErrorTransitorio(new Error('envuelto', { cause: conCodigo('ETIMEDOUT') }))).toBe(true);
  });

  it('no reintenta errores de datos ni de código', () => {
    expect(esErrorTransitorio(errorPg('23505'))).toBe(false); // unique_violation
    expect(esErrorTransitorio(errorPg('22P02'))).toBe(false); // uuid inválido
    expect(esErrorTransitorio(new TypeError("Cannot read properties of undefined (reading 'nombre')"))).toBe(false);
    expect(esErrorTransitorio(Object.assign(new Error('bad request'), { status: 400 }))).toBe(false);
    expect(esErrorTransitorio(null)).toBe(false);
  });

  it('para el webhook de Stripe solo cuenta la base', () => {
    expect(esErrorDeBaseTransitorio(errorPg('08006'))).toBe(true);
    expect(esErrorDeBaseTransitorio(errorPg('23505'))).toBe(false);
    expect(esErrorDeBaseTransitorio(new Error('timeout'))).toBe(false);
  });
});
