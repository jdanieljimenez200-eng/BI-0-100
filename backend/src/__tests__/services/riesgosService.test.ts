import { generarRiesgosMock, RiesgosContexto } from '../../services/finanzas/riesgosService';

const ctxBase: RiesgosContexto = {
  nombre_producto: 'Lámpara artesanal',
  categoria: 'decoración',
  pais: 'MX',
  precio_venta: 299,
  costo_variable_unitario: 120,
  costos_fijos_mensuales: 5000,
  margen_neto_promedio: 22,
  viabilidad: 'media',
  meses_para_recuperar_inversion: 8,
};

describe('riesgosService.generarRiesgosMock', () => {
  it('estructura completa con riesgos ordenados y señales', () => {
    const r = generarRiesgosMock(ctxBase);
    expect(r.patron_comun.length).toBeGreaterThan(20);
    expect(r.riesgos.length).toBeGreaterThanOrEqual(3);
    for (const riesgo of r.riesgos) {
      expect(riesgo.titulo).toBeTruthy();
      expect(riesgo.descripcion).toBeTruthy();
      expect(riesgo.senales_alerta.length).toBeGreaterThanOrEqual(2);
      expect(riesgo.como_evitarlo).toBeTruthy();
    }
  });

  it('personaliza el patrón con la categoría y el margen', () => {
    const r = generarRiesgosMock({ ...ctxBase, categoria: 'cafetería', margen_neto_promedio: 8 });
    expect(r.patron_comun).toContain('cafetería');
    expect(r.patron_comun).toContain('8%');
  });

  it('describe el riesgo de flujo de caja distinto cuando no hay recuperación en 12 meses', () => {
    const conPayback = generarRiesgosMock({ ...ctxBase, meses_para_recuperar_inversion: 6 });
    const sinPayback = generarRiesgosMock({ ...ctxBase, meses_para_recuperar_inversion: null });
    const riesgoFlujoCon = conPayback.riesgos.find((r) => r.titulo.includes('Flujo de caja'));
    const riesgoFlujoSin = sinPayback.riesgos.find((r) => r.titulo.includes('Flujo de caja'));
    expect(riesgoFlujoCon?.descripcion).toContain('6 meses');
    expect(riesgoFlujoSin?.descripcion).toContain('no recupera la inversión');
  });

  it('sin inversión declarada no habla de recuperarla', () => {
    const r = generarRiesgosMock({ ...ctxBase, meses_para_recuperar_inversion: null, payback_no_disponible: 'sin_inversion_declarada' });
    const flujo = r.riesgos.find((x) => x.titulo.includes('Flujo de caja'));
    expect(flujo?.descripcion).not.toMatch(/recupera/i);
  });

  it('un margen sano no se titula «insuficiente»', () => {
    const sano = generarRiesgosMock({ ...ctxBase, margen_neto_promedio: 27 });
    const flaco = generarRiesgosMock({ ...ctxBase, margen_neto_promedio: 8 });
    expect(sano.riesgos[0].titulo).not.toMatch(/insuficiente/i);
    expect(sano.riesgos[0].descripcion).toContain('27%');
    expect(flaco.riesgos[0].titulo).toMatch(/insuficiente/i);
  });
});
