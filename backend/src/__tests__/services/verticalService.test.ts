import {
  esVerticalValido,
  puedeElegirVertical,
  VERTICALES_VALIDOS,
} from '../../services/vertical/verticalService';

describe('verticalService', () => {
  describe('esVerticalValido', () => {
    it('acepta todas las keys del catálogo', () => {
      for (const key of VERTICALES_VALIDOS) {
        expect(esVerticalValido(key)).toBe(true);
      }
    });

    it('rechaza una key desconocida', () => {
      expect(esVerticalValido('astronauta')).toBe(false);
      expect(esVerticalValido('')).toBe(false);
    });
  });

  describe('puedeElegirVertical', () => {
    it('permite elegir cuando aún no hay vertical (primera vez)', () => {
      expect(puedeElegirVertical(null, 'oftalmologo')).toEqual({ ok: true });
    });

    it('rechaza con "ya_elegido" si el usuario ya tiene uno', () => {
      expect(puedeElegirVertical('abogado', 'oftalmologo')).toEqual({
        ok: false,
        motivo: 'ya_elegido',
      });
    });

    it('rechaza con "invalido" si la key no existe en el catálogo', () => {
      expect(puedeElegirVertical(null, 'astronauta')).toEqual({
        ok: false,
        motivo: 'invalido',
      });
    });

    it('la validez de key NO se comprueba si ya eligió (gana ya_elegido)', () => {
      expect(puedeElegirVertical('oftalmologo', 'astronauta')).toEqual({
        ok: false,
        motivo: 'ya_elegido',
      });
    });
  });
});