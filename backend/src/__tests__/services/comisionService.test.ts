import { calcularComisionPlataforma, getComisionPct } from '../../services/billing/planService';

describe('calcularComisionPlataforma', () => {
  describe('planes sin comisión (comision_pct = 0)', () => {
    it('freemium devuelve 0 aunque el monto sea alto', () => {
      expect(calcularComisionPlataforma(100000, 'freemium')).toBe(0);
    });
  });

  describe('planes con comisión', () => {
    it('pro aplica 1.5% sobre el total en centavos', () => {
      // 50000 centavos ($500) * 1.5% = 750 centavos
      expect(calcularComisionPlataforma(50000, 'pro')).toBe(750);
    });

    it('business aplica 0.9%', () => {
      // 50000 * 0.9% = 450
      expect(calcularComisionPlataforma(50000, 'business')).toBe(450);
    });

    it('enterprise aplica 0.9%', () => {
      expect(calcularComisionPlataforma(50000, 'enterprise')).toBe(450);
    });
  });

  describe('redondeo (Stripe exige enteros en la unidad mínima)', () => {
    it('redondea al entero más cercano hacia arriba', () => {
      // 3333 * 1.5% = 49.995 → 50
      expect(calcularComisionPlataforma(3333, 'pro')).toBe(50);
    });

    it('redondea al entero más cercano hacia abajo', () => {
      // 1000 * 0.9% = 9.0 → 9 ; 1010 * 0.9% = 9.09 → 9
      expect(calcularComisionPlataforma(1010, 'business')).toBe(9);
    });

    it('siempre devuelve un entero', () => {
      const fee = calcularComisionPlataforma(12345, 'pro');
      expect(Number.isInteger(fee)).toBe(true);
    });
  });

  describe('montos inválidos → 0 (defensa)', () => {
    it('monto 0', () => {
      expect(calcularComisionPlataforma(0, 'pro')).toBe(0);
    });

    it('monto negativo', () => {
      expect(calcularComisionPlataforma(-500, 'pro')).toBe(0);
    });

    it('NaN', () => {
      expect(calcularComisionPlataforma(NaN, 'pro')).toBe(0);
    });

    it('Infinity', () => {
      expect(calcularComisionPlataforma(Infinity, 'pro')).toBe(0);
    });
  });

  describe('getComisionPct', () => {
    it('devuelve el pct configurado por plan', () => {
      expect(getComisionPct('freemium')).toBe(0);
      expect(getComisionPct('pro')).toBe(1.5);
      expect(getComisionPct('business')).toBe(0.9);
      expect(getComisionPct('enterprise')).toBe(0.9);
    });
  });
});