import { cifrasSinRespaldo, extraerCifras, numerosDe, supuestoCifras } from '../../services/ia/verificadorCifras';

/**
 * El verificador marca los números que la IA escribió sin que salgan de los
 * datos del usuario ni del cálculo. No juzga si son falsos: evita que se lean
 * con la misma autoridad que un dato.
 */
describe('extraerCifras', () => {
  it('entiende miles, decimales y porcentajes en los formatos de LATAM', () => {
    const valores = extraerCifras('Vende 2,600 al mes a 45.5 MXN, 12.500 COP, 1.250,50 ARS, margen 62,2 % y 18%').map((c) => [c.valor, c.porcentaje]);
    expect(valores).toEqual([
      [2600, false],
      [45.5, false],
      [12500, false],
      [1250.5, false],
      [62.2, true],
      [18, true],
    ]);
  });

  it('no toma números pegados a siglas ni a palabras', () => {
    expect(extraerCifras('Cumple la NOM-251 y emite CFDI4 en 2026').map((c) => c.valor)).toEqual([2026]);
  });
});

describe('cifrasSinRespaldo', () => {
  const conocidas = numerosDe({ precio: 45, costo: 17, ventas: 2600, equilibrio: 929, margen_pct: 62.22, utilidad: 55366 });

  it('deja pasar lo que sale de los datos o del cálculo (con redondeo) y lo trivial', () => {
    const textos = ['Con 929 ventas al mes cubres costos; tu margen de 62 % y una utilidad de 55,400 en 3 meses de 2026.'];
    expect(cifrasSinRespaldo(textos, conocidas)).toEqual([]);
  });

  it('marca cifras propias de la IA, sin repetirlas', () => {
    const textos = [
      'El 70 % de los puestos cierra el primer año.',
      'Necesitas 36 clientes por mañana.',
      'Otra vez: el 70 % de los puestos.',
    ];
    expect(cifrasSinRespaldo(textos, conocidas).map((c) => c.texto)).toEqual(['70 %', '36']);
  });

  it('el supuesto las lista y dice que son aproximación', () => {
    const nota = supuestoCifras(cifrasSinRespaldo(['El 70 % cierra; necesitas 36 al día.'], conocidas));
    expect(nota).toMatch(/^Cifras que la IA calculó o estimó por su cuenta/);
    expect(nota).toContain('70 %, 36');
    expect(supuestoCifras([])).toBeNull();
  });
});
