import {
  calcularDesgloseComision,
  calcularPrecioObjetivo,
  PRESETS_CANALES_DEFAULT,
  PAISES_CON_PRESETS,
} from '../../services/contabilidad/comisionesService';

describe('comisionesService', () => {
  describe('calcularDesgloseComision', () => {
    it('calcula correctamente la comisión de Clip (3.6% + IVA)', () => {
      const clipPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Clip')!;
      expect(clipPreset).toBeDefined();

      const resultado = calcularDesgloseComision(1000, clipPreset, 0.16);

      // Bruto = 1000
      // Comision base = 1000 * 0.036 = 36.00
      // IVA comision = 36.00 * 0.16 = 5.76
      // Total deducciones = 41.76
      // Neto a banco = 958.24
      expect(resultado.montoBruto).toBe(1000);
      expect(resultado.comisionBase).toBe(36.00);
      expect(resultado.comisionIva).toBe(5.76);
      expect(resultado.retencionIsr).toBe(0);
      expect(resultado.retencionIva).toBe(0);
      expect(resultado.totalDeducciones).toBe(41.76);
      expect(resultado.montoNeto).toBe(958.24);
      expect(resultado.tasaEfectivaPorcentaje).toBe(4.18);
    });

    it('calcula correctamente Mercado Pago con tarifa fija ($4 MXN) + porcentaje (3.5%)', () => {
      const mpPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Mercado Pago')!;
      expect(mpPreset).toBeDefined();

      const resultado = calcularDesgloseComision(500, mpPreset, 0.16);

      // Comision base = (500 * 0.035) + 4 = 17.5 + 4 = 21.50
      // IVA comision = 21.50 * 0.16 = 3.44
      // Total deducciones = 24.94
      // Neto = 475.06
      expect(resultado.comisionBase).toBe(21.50);
      expect(resultado.comisionIva).toBe(3.44);
      expect(resultado.totalDeducciones).toBe(24.94);
      expect(resultado.montoNeto).toBe(475.06);
    });

    it('calcula Uber Eats: 30 % + IVA y las retenciones 2026 (ISR 2.5 %, IVA 8 %)', () => {
      const uberPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Uber Eats')!;
      expect(uberPreset).toBeDefined();

      const resultado = calcularDesgloseComision(1000, uberPreset, 0.16);

      // Sin impuesto dentro del bruto, las retenciones van sobre los 1000.
      // Comisión 300 + IVA 48 + ISR 25 + IVA retenido 80 = 453
      expect(resultado.comisionBase).toBe(300.00);
      expect(resultado.comisionIva).toBe(48.00);
      expect(resultado.retencionIsr).toBe(25.00);
      expect(resultado.retencionIva).toBe(80.00);
      expect(resultado.totalDeducciones).toBe(453.00);
      expect(resultado.montoNeto).toBe(547.00);
      expect(resultado.tasaEfectivaPorcentaje).toBe(45.3);
    });

    it('las retenciones van sobre la venta SIN el IVA que trae el precio', () => {
      const uberPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Uber Eats')!;
      // Pedido de $1,160 con IVA incluido (160): la base de las retenciones es 1000.
      const r = calcularDesgloseComision(1160, uberPreset, 0.16, 160);
      expect(r.comisionBase).toBe(348.00); // la comisión sí va sobre lo que pagó el cliente
      expect(r.comisionIva).toBe(55.68);
      expect(r.retencionIsr).toBe(25.00); // antes 1160 × 1 % = 11.60
      expect(r.retencionIva).toBe(80.00); // la mitad del IVA; antes 1160 × 8 % = 92.80
      expect(r.montoNeto).toBe(651.32);
    });

    it('el IVA de la comisión sigue la tasa del país', () => {
      const r = calcularDesgloseComision(1000, { institucion: 'Terminal CO', comision_porcentaje: 0.03, comision_fija: 0, aplica_iva_comision: true }, 0.19);
      expect(r.comisionBase).toBe(30);
      expect(r.comisionIva).toBe(5.7);
      expect(r.montoNeto).toBe(964.3);
    });

    it('las tarifas de referencia son solo de México y lo dicen', () => {
      expect(PAISES_CON_PRESETS).toEqual(['MX']);
      for (const preset of PRESETS_CANALES_DEFAULT) {
        expect(preset.notas).toMatch(/referencia/i);
      }
    });

    it('maneja valores 0 o negativos de forma segura', () => {
      const resultado = calcularDesgloseComision(0, {
        institucion: 'Test',
        comision_porcentaje: 0.05,
        comision_fija: 0,
        aplica_iva_comision: true,
      });

      expect(resultado.montoBruto).toBe(0);
      expect(resultado.montoNeto).toBe(0);
      expect(resultado.totalDeducciones).toBe(0);
    });
  });

  describe('calcularPrecioObjetivo (Simulador de Markup Inverso)', () => {
    it('calcula el precio que se debe cobrar para recibir exactamente $1,000 netos con Clip', () => {
      const clipPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Clip')!;
      const { precioSugerido, desglose } = calcularPrecioObjetivo(1000, clipPreset, 0.16);

      // Tasa total = 0.036 * 1.16 = 0.04176
      // Precio sugerido = 1000 / (1 - 0.04176) = 1000 / 0.95824 ≈ 1043.58
      expect(precioSugerido).toBeCloseTo(1043.58, 1);
      // Al cobrar precioSugerido, el neto resultante debe ser prácticamente $1,000
      expect(desglose.montoNeto).toBeCloseTo(1000, 0);
    });

    it('calcula el precio que se debe cobrar para recibir exactamente $500 netos en Uber Eats', () => {
      const uberPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Uber Eats')!;
      const { precioSugerido, desglose } = calcularPrecioObjetivo(500, uberPreset, 0.16);

      // Tasa total = 0.30 × 1.16 + 0.025 + 0.08 = 0.453 → 500 / 0.547 ≈ 914.08
      expect(precioSugerido).toBeCloseTo(914.08, 1);
      expect(desglose.montoNeto).toBeCloseTo(500, 0);
    });

    it('con el IVA dentro del precio, las retenciones se calculan sin él', () => {
      const uberPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Uber Eats')!;
      const { precioSugerido, desglose } = calcularPrecioObjetivo(500, uberPreset, 0.16, true);

      // Tasa total = 0.348 + 0.105 / 1.16 ≈ 0.43852 → 500 / 0.56148 ≈ 890.50
      expect(precioSugerido).toBeCloseTo(890.5, 1);
      expect(desglose.montoNeto).toBeCloseTo(500, 0);
    });
  });
});
