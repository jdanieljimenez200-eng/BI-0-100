import { calcularSuperficie, MODELOS_ESPACIO } from '../../services/zona/superficieService';

describe('superficieService.calcularSuperficie', () => {
  it('sin local físico no dimensiona superficie', () => {
    const r = calcularSuperficie({ tipo_local: 'sin_local', unidades_mes: 5000, personal: 3 });
    expect(r.m2_totales).toBeNull();
    expect(r.m2_operativos).toBeNull();
    expect(r.m2_circulacion).toBeNull();
    expect(r.fuente).toBe('no_aplica');
    expect(r.nivel_confianza).toBe('alta');
  });

  it('respeta los m² declarados y desglosa su circulación', () => {
    const r = calcularSuperficie({ tipo_local: 'retail', m2_declarados: 60, unidades_mes: 9000 });
    expect(r.m2_totales).toBe(60);
    expect(r.fuente).toBe('declarada');
    expect(r.nivel_confianza).toBe('alta');
    // retail: 35% de circulación → operativos = 60 / 1.35
    expect(r.m2_operativos).toBe(44.44);
    expect(r.m2_circulacion).toBe(15.56);
  });

  it('los m² declarados ignoran por completo el modelo operativo', () => {
    const conVolumen = calcularSuperficie({ tipo_local: 'almacen', m2_declarados: 40, unidades_mes: 50_000 });
    const sinVolumen = calcularSuperficie({ tipo_local: 'almacen', m2_declarados: 40, unidades_mes: 0 });
    expect(conVolumen.m2_totales).toBe(sinVolumen.m2_totales);
  });

  it('estima por base + personal + volumen y añade circulación', () => {
    // produccion_alimentos: 18 base + 3 personas × 3 + 2000/1000 × 2.5 = 32
    // circulación 30% → 9.6 redondeado al alza a 10 → 42 totales
    const r = calcularSuperficie({ tipo_local: 'produccion_alimentos', personal: 3, unidades_mes: 2000 });
    expect(r.m2_operativos).toBe(32);
    expect(r.m2_circulacion).toBe(10);
    expect(r.m2_totales).toBe(42);
    expect(r.fuente).toBe('modelo_operativo');
    expect(r.nivel_confianza).toBe('media');
  });

  it('la oficina no escala con el volumen de unidades', () => {
    const pocas = calcularSuperficie({ tipo_local: 'oficina', personal: 2, unidades_mes: 100 });
    const muchas = calcularSuperficie({ tipo_local: 'oficina', personal: 2, unidades_mes: 900_000 });
    expect(pocas.m2_totales).toBe(muchas.m2_totales);
    expect(MODELOS_ESPACIO.oficina.m2_por_1000_unidades_mes).toBe(0);
  });

  it('asume una persona cuando no se declara personal', () => {
    const r = calcularSuperficie({ tipo_local: 'oficina' });
    // 8 base + 1 × 6 = 14 operativos, +25% = 3.5 → 17.5
    expect(r.m2_operativos).toBe(14);
    expect(r.m2_totales).toBe(17.5);
  });

  it('aplica el mínimo operable y lo declara en los supuestos', () => {
    const r = calcularSuperficie({ tipo_local: 'oficina', personal: 0, unidades_mes: 0 });
    expect(r.m2_operativos).toBe(MODELOS_ESPACIO.oficina.m2_minimo);
    expect(r.supuestos.some((s) => s.includes('mínimo operable'))).toBe(true);
  });

  it('la superficie es monótona creciente respecto al volumen', () => {
    let anterior = -Infinity;
    for (const unidades of [0, 500, 1000, 5000, 20_000, 100_000]) {
      const total = calcularSuperficie({ tipo_local: 'ecommerce_bodega', personal: 2, unidades_mes: unidades }).m2_totales;
      expect(total).not.toBeNull();
      expect(total as number).toBeGreaterThanOrEqual(anterior);
      anterior = total as number;
    }
  });

  it('sanea entradas basura sin romper el cálculo', () => {
    const r = calcularSuperficie({
      tipo_local: 'taller',
      personal: -5,
      unidades_mes: Number.NaN,
      m2_declarados: -20,
    });
    expect(r.fuente).toBe('modelo_operativo');
    // 20 base + 1 persona × 5 = 25 operativos, +25% = 6.5 → 31.5
    expect(r.m2_operativos).toBe(25);
    expect(r.m2_totales).toBe(31.5);
  });

  it('siempre explica de dónde salen los m² estimados', () => {
    const r = calcularSuperficie({ tipo_local: 'servicio_atencion', personal: 4, unidades_mes: 1500 });
    expect(r.supuestos.length).toBeGreaterThanOrEqual(3);
    expect(r.nota).toContain('m²');
  });
});