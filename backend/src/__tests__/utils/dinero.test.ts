import { r2, r3, r4 } from '../../utils/dinero';

describe('Redondeo de dinero', () => {
  it('redondea hacia arriba los medios céntimos que la coma flotante perdía', () => {
    // `Math.round(1.005 * 100) / 100` da 1.00: 1.005 * 100 = 100.49999999999999.
    expect(r2(1.005)).toBe(1.01);
    expect(r2(2.675)).toBe(2.68);
    expect(r2(8.615)).toBe(8.62);
    expect(r2(1.0049)).toBe(1); // por debajo del medio céntimo, hacia abajo
  });

  it('deja intactos los importes que ya tienen dos decimales', () => {
    for (const v of [0, 0.1, 12.34, 348, 999999.99, -45.67]) {
      expect(r2(v)).toBe(v);
    }
  });

  it('no arrastra el error en una suma de comisiones', () => {
    // 3.6 % de 348 + su IVA: el cálculo real del POS.
    const comision = r2(348 * 0.036);
    const iva = r2(comision * 0.16);
    expect(comision).toBe(12.53);
    expect(iva).toBe(2);
    expect(r2(348 - comision - iva)).toBe(333.47);
  });

  it('r3 para cantidades y r4 para costos unitarios', () => {
    expect(r3(0.1255)).toBe(0.126);
    expect(r3(1 / 3)).toBe(0.333);
    expect(r4(0.00005)).toBe(0.0001);
    expect(r4(2 / 3)).toBe(0.6667);
  });

  it('un valor imposible se propaga en vez de convertirse en 0', () => {
    // Un 0 silencioso escondería el error justo donde importa: en el dinero.
    expect(Number.isNaN(r2(NaN))).toBe(true);
    expect(r2(Infinity)).toBe(Infinity);
  });
});
