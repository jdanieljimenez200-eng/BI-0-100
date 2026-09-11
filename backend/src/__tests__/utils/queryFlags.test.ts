import { parseFlagQuery } from '../../utils/queryFlags';

describe('parseFlagQuery', () => {
  it('acepta las formas verdaderas habituales sin distinguir mayúsculas', () => {
    for (const valor of ['1', 'true', 'TRUE', 'True', 'yes', 'Y', 'on', 'ON', 'si', 'sí', 'SÍ']) {
      expect(parseFlagQuery(valor)).toBe(true);
    }
  });

  it('acepta las formas falsas explícitas', () => {
    for (const valor of ['0', 'false', 'FALSE', 'no', 'N', 'off', 'OFF']) {
      expect(parseFlagQuery(valor)).toBe(false);
    }
  });

  it('trata el parámetro presente sin valor como activado', () => {
    // Express entrega '' para `?solo_accionables`
    expect(parseFlagQuery('')).toBe(true);
    expect(parseFlagQuery('   ')).toBe(true);
  });

  it('ignora espacios alrededor del valor', () => {
    expect(parseFlagQuery(' true ')).toBe(true);
    expect(parseFlagQuery('\tno\n')).toBe(false);
  });

  it('cae al valor por defecto cuando el parámetro no viene', () => {
    expect(parseFlagQuery(undefined)).toBe(false);
    expect(parseFlagQuery(null)).toBe(false);
    expect(parseFlagQuery(undefined, true)).toBe(true);
    expect(parseFlagQuery(null, true)).toBe(true);
  });

  it('cae al valor por defecto con valores no reconocidos', () => {
    expect(parseFlagQuery('quizás')).toBe(false);
    expect(parseFlagQuery('2')).toBe(false);
    expect(parseFlagQuery('quizás', true)).toBe(true);
  });

  it('no se rompe con tipos que qs puede producir', () => {
    expect(parseFlagQuery({ a: '1' })).toBe(false);
    expect(parseFlagQuery({ a: '1' }, true)).toBe(true);
    expect(parseFlagQuery([])).toBe(false);
    expect(parseFlagQuery([], true)).toBe(true);
  });

  it('con valores repetidos manda el último', () => {
    expect(parseFlagQuery(['0', 'true'])).toBe(true);
    expect(parseFlagQuery(['true', '0'])).toBe(false);
    expect(parseFlagQuery(['1'])).toBe(true);
  });

  it('acepta booleanos y números ya parseados', () => {
    expect(parseFlagQuery(true)).toBe(true);
    expect(parseFlagQuery(false)).toBe(false);
    expect(parseFlagQuery(1)).toBe(true);
    expect(parseFlagQuery(0)).toBe(false);
    expect(parseFlagQuery(Number.NaN, true)).toBe(true);
  });
});